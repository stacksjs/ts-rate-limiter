import type { RedisClient } from 'bun'
import type { RedisStorageOptions, StorageProvider } from '../types'
import { config } from '../config'

/**
 * Redis storage implementation with optimized performance
 */
export class RedisStorage implements StorageProvider {
  private client: RedisClient
  private keyPrefix: string
  private slidingWindowEnabled: boolean
  private luaScript: string
  private isExternalClient: boolean

  constructor(options: RedisStorageOptions) {
    // Store if the client was provided externally to know if we should close it on dispose
    this.isExternalClient = !!options.client

    if (!options.client) {
      throw new Error('[ts-rate-limiter] Redis client must be provided. Initialize it and pass it to RedisStorage.')
    }

    this.client = options.client

    // Use global config for defaults if not explicitly provided
    const redisConfig = config.redis || {}
    this.keyPrefix = options.keyPrefix ?? config.redisKeyPrefix ?? 'ratelimit:'
    this.slidingWindowEnabled = options.enableSlidingWindow ?? redisConfig.enableSlidingWindow ?? false

    // LUA script for atomic operations
    this.luaScript = `
      local key = KEYS[1]
      local window = tonumber(ARGV[1])
      local now = tonumber(ARGV[2])

      -- Increment counter
      local count = redis.call('INCR', key)

      -- Get TTL
      local ttl = redis.call('TTL', key)

      -- Set expiration if this is a new key or TTL is negative
      if count == 1 or ttl < 0 then
        redis.call('PEXPIRE', key, window)
        ttl = window / 1000
      end

      return {count, ttl}
    `

    // Verbose logging if enabled
    if (config.verbose) {
      console.warn(`[ts-rate-limiter] Redis storage initialized with:
  - Key Prefix: ${this.keyPrefix}
  - Sliding Window: ${this.slidingWindowEnabled ? 'enabled' : 'disabled'}`)
    }
  }

  async increment(key: string, windowMs: number): Promise<{ count: number, resetTime: number }> {
    const fullKey = this.keyPrefix + key
    const now = Date.now()

    if (this.slidingWindowEnabled) {
      return this.incrementSlidingWindow(fullKey, windowMs, now)
    }

    // Try to use Redis LUA script for atomic operations
    try {
      // Use send method which should work on both Bun and Node Redis clients
      const result = await this.client.send('EVAL', [
        this.luaScript,
        '1',
        fullKey,
        windowMs.toString(),
        now.toString(),
      ])

      // Check if result is array or single value
      const count = Array.isArray(result) ? Number(result[0]) : Number(result)
      const ttl = Array.isArray(result) ? Number(result[1]) : windowMs / 1000

      return {
        count,
        resetTime: now + (ttl * 1000),
      }
    }
    catch (error) {
      // Fallback to standard approach if LUA script fails
      if (config.verbose) {
        console.warn('[ts-rate-limiter] LUA script execution failed, using standard approach:', error)
      }
      return this.incrementStandard(fullKey, windowMs, now)
    }
  }

  private async incrementStandard(fullKey: string, windowMs: number, now: number): Promise<{ count: number, resetTime: number }> {
    // First increment the counter using Redis client
    const count = await this.client.incr(fullKey)

    // Then get the TTL
    let ttl = await this.client.ttl(fullKey)

    // Set expiration if this is a new key or TTL is negative
    if (count === 1 || ttl < 0) {
      await this.client.expire(fullKey, Math.ceil(windowMs / 1000))
      ttl = windowMs / 1000
    }

    return {
      count: Number(count),
      resetTime: now + (ttl > 0 ? ttl * 1000 : windowMs),
    }
  }

  private async incrementSlidingWindow(fullKey: string, windowMs: number, now: number): Promise<{ count: number, resetTime: number }> {
    const windowKey = `${fullKey}:window`
    const windowScore = now.toString()
    const windowExpiry = (now - windowMs).toString()

    try {
      // Add current timestamp to sorted set
      await this.client.send('ZADD', [windowKey, windowScore, windowScore])

      // Remove timestamps outside the window
      await this.client.send('ZREMRANGEBYSCORE', [windowKey, '0', windowExpiry])

      // Count elements in the sorted set (current count in window)
      const count = await this.client.send('ZCARD', [windowKey])

      // Set expiry on the sorted set
      await this.client.send('PEXPIRE', [windowKey, windowMs.toString()])

      return {
        count: Number(count),
        resetTime: now + windowMs,
      }
    }
    catch (error) {
      if (config.verbose) {
        console.warn('[ts-rate-limiter] Sliding window operation failed:', error)
      }

      // Fall back to standard approach
      return this.incrementStandard(fullKey, windowMs, now)
    }
  }

  async reset(key: string): Promise<void> {
    const fullKey = this.keyPrefix + key

    if (this.slidingWindowEnabled) {
      await this.client.send('DEL', [fullKey, `${fullKey}:window`])
    }
    else {
      await this.client.del(fullKey)
    }
  }

  async getCount(key: string): Promise<number> {
    const fullKey = this.keyPrefix + key
    const count = await this.client.get(fullKey)
    return count ? Number(count) : 0
  }

  async getSlidingWindowCount(key: string, windowMs: number): Promise<number> {
    if (!this.slidingWindowEnabled) {
      throw new Error('Sliding window not enabled for this Redis storage instance')
    }

    try {
      const windowKey = `${this.keyPrefix}${key}:window`
      const now = Date.now()
      const windowExpiry = (now - windowMs).toString()

      // Remove expired entries
      await this.client.send('ZREMRANGEBYSCORE', [windowKey, '0', windowExpiry])

      // Count remaining
      const count = await this.client.send('ZCARD', [windowKey])

      return Number(count)
    }
    catch (error) {
      if (config.verbose) {
        console.warn('[ts-rate-limiter] Sliding window count operation failed:', error)
      }
      return 0
    }
  }

  async batchIncrement(keys: string[], windowMs: number): Promise<Map<string, { count: number, resetTime: number }>> {
    const results = new Map<string, { count: number, resetTime: number }>()
    const now = Date.now()

    // Process each key sequentially
    for (const key of keys) {
      try {
        const fullKey = this.keyPrefix + key

        if (this.slidingWindowEnabled) {
          const windowKey = `${fullKey}:window`
          const windowScore = now.toString()
          const windowExpiry = (now - windowMs).toString()

          await this.client.send('ZADD', [windowKey, windowScore, windowScore])
          await this.client.send('ZREMRANGEBYSCORE', [windowKey, '0', windowExpiry])
          const count = await this.client.send('ZCARD', [windowKey])
          await this.client.send('PEXPIRE', [windowKey, windowMs.toString()])

          results.set(key, {
            count: Number(count),
            resetTime: now + windowMs,
          })
        }
        else {
          const count = await this.client.incr(fullKey)
          const ttl = await this.client.ttl(fullKey)

          // Set expiration if this is a new key or TTL is negative
          if (count === 1 || ttl < 0) {
            await this.client.expire(fullKey, Math.ceil(windowMs / 1000))
          }

          results.set(key, {
            count: Number(count),
            resetTime: now + (ttl > 0 ? ttl * 1000 : windowMs),
          })
        }
      }
      catch (error) {
        if (config.verbose) {
          console.warn(`[ts-rate-limiter] Batch increment failed for key ${key}:`, error)
        }

        // Set a default value for this key
        results.set(key, {
          count: 1,
          resetTime: now + windowMs,
        })
      }
    }

    return results
  }

  async dispose(): Promise<void> {
    // Only close the client if we created it internally
    if (!this.isExternalClient && this.client && typeof this.client.close === 'function') {
      this.client.close()
    }
  }
}
