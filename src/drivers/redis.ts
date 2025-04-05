import type { RedisStorageOptions, StorageProvider } from '../types'

/**
 * Redis storage implementation with optimized performance
 */
export class RedisStorage implements StorageProvider {
  private client: any // Redis client
  private keyPrefix: string
  private slidingWindowEnabled: boolean
  private luaScript: string

  constructor(options: RedisStorageOptions) {
    this.client = options.client
    this.keyPrefix = options.keyPrefix || 'brl:'
    this.slidingWindowEnabled = options.enableSlidingWindow || false

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
  }

  async increment(key: string, windowMs: number): Promise<{ count: number, resetTime: number }> {
    const fullKey = this.keyPrefix + key
    const now = Date.now()

    if (this.slidingWindowEnabled) {
      return this.incrementSlidingWindow(fullKey, windowMs, now)
    }

    // Use Redis LUA script for atomic operations
    try {
      // Try to use EVAL command directly
      const result = await this.client.eval(
        this.luaScript,
        {
          keys: [fullKey],
          arguments: [windowMs.toString(), now.toString()],
        },
      )

      // Check if result is array or single value
      const count = Array.isArray(result) ? Number(result[0]) : Number(result)
      const ttl = Array.isArray(result) ? Number(result[1]) : windowMs / 1000

      return {
        count,
        resetTime: now + (ttl * 1000),
      }
    }
    // eslint-disable-next-line unused-imports/no-unused-vars
    catch (error) {
      // Fallback to standard approach if LUA script fails
      return this.incrementStandard(fullKey, windowMs, now)
    }
  }

  private async incrementStandard(fullKey: string, windowMs: number, now: number): Promise<{ count: number, resetTime: number }> {
    // First increment the counter
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

    // Add current timestamp to sorted set
    await this.client.zAdd(windowKey, { score: windowScore, value: windowScore })

    // Remove timestamps outside the window
    await this.client.zRemRangeByScore(windowKey, '0', windowExpiry)

    // Count elements in the sorted set (current count in window)
    const count = await this.client.zCard(windowKey)

    // Set expiry on the sorted set
    await this.client.pExpire(windowKey, windowMs)

    return {
      count: Number(count),
      resetTime: now + windowMs,
    }
  }

  async reset(key: string): Promise<void> {
    const fullKey = this.keyPrefix + key

    if (this.slidingWindowEnabled) {
      await this.client.del([fullKey, `${fullKey}:window`])
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

    const windowKey = `${this.keyPrefix}${key}:window`
    const now = Date.now()
    const windowExpiry = (now - windowMs).toString()

    // Remove expired entries
    await this.client.zRemRangeByScore(windowKey, '0', windowExpiry)

    // Count remaining
    const count = await this.client.zCard(windowKey)

    return Number(count)
  }

  async batchIncrement(keys: string[], windowMs: number): Promise<Map<string, { count: number, resetTime: number }>> {
    const results = new Map<string, { count: number, resetTime: number }>()
    const now = Date.now()

    // Process each key sequentially since we don't have pipeline in this version
    for (const key of keys) {
      const fullKey = this.keyPrefix + key

      if (this.slidingWindowEnabled) {
        const windowKey = `${fullKey}:window`
        const windowScore = now.toString()
        const windowExpiry = (now - windowMs).toString()

        await this.client.zAdd(windowKey, { score: windowScore, value: windowScore })
        await this.client.zRemRangeByScore(windowKey, '0', windowExpiry)
        const count = await this.client.zCard(windowKey)
        await this.client.pExpire(windowKey, windowMs)

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

    return results
  }

  async dispose(): Promise<void> {
    // No need to do anything here, client is managed externally
  }
}
