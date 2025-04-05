import type { StorageProvider } from '../types'

/**
 * Redis storage implementation with optimized performance
 */
export class RedisStorage implements StorageProvider {
  private client: any // Redis client
  private keyPrefix: string
  private slidingWindowEnabled: boolean
  private luaScript: string

  constructor(redisClient: any, options: { keyPrefix?: string, enableSlidingWindow?: boolean } = {}) {
    this.client = redisClient
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
      const result = await this.client.eval(
        this.luaScript,
        1,
        fullKey,
        windowMs,
        now,
      )

      const count = Number(result[0])
      const ttl = Number(result[1])

      return {
        count,
        resetTime: now + (ttl * 1000),
      }
    }
    catch (error) {
      // Fallback to standard approach if LUA script fails
      return this.incrementStandard(fullKey, windowMs, now)
    }
  }

  private async incrementStandard(fullKey: string, windowMs: number, now: number): Promise<{ count: number, resetTime: number }> {
    // Use Redis pipeline to perform multiple operations atomically
    const [countStr, ttlResult] = await this.client.pipeline()
      .incr(fullKey)
      .ttl(fullKey)
      .exec()

    const count = Number.parseInt(countStr, 10)
    const ttl = Number.parseInt(ttlResult, 10)

    // Set expiration if this is a new key or TTL is negative
    if (count === 1 || ttl < 0) {
      await this.client.expire(fullKey, Math.ceil(windowMs / 1000))
    }

    return {
      count,
      resetTime: now + (ttl > 0 ? ttl * 1000 : windowMs),
    }
  }

  private async incrementSlidingWindow(fullKey: string, windowMs: number, now: number): Promise<{ count: number, resetTime: number }> {
    const windowKey = `${fullKey}:window`
    const windowScore = now
    const windowExpiry = now - windowMs

    // Use Redis transaction for sliding window implementation
    const result = await this.client.multi()
      // Add current timestamp to sorted set
      .zadd(windowKey, windowScore, windowScore)
      // Remove timestamps outside the window
      .zremrangebyscore(windowKey, 0, windowExpiry)
      // Count elements in the sorted set (current count in window)
      .zcard(windowKey)
      // Set expiry on the sorted set
      .pexpire(windowKey, windowMs)
      .exec()

    const count = Number(result[2])

    return {
      count,
      resetTime: now + windowMs,
    }
  }

  async reset(key: string): Promise<void> {
    const fullKey = this.keyPrefix + key

    if (this.slidingWindowEnabled) {
      await this.client.del(fullKey, `${fullKey}:window`)
    }
    else {
      await this.client.del(fullKey)
    }
  }

  async getSlidingWindowCount(key: string, windowMs: number): Promise<number> {
    if (!this.slidingWindowEnabled) {
      throw new Error('Sliding window not enabled for this Redis storage instance')
    }

    const windowKey = `${this.keyPrefix}${key}:window`
    const now = Date.now()
    const windowExpiry = now - windowMs

    // Remove expired entries and count remaining
    const result = await this.client.multi()
      .zremrangebyscore(windowKey, 0, windowExpiry)
      .zcard(windowKey)
      .exec()

    return Number(result[1])
  }

  async batchIncrement(keys: string[], windowMs: number): Promise<Map<string, { count: number, resetTime: number }>> {
    const results = new Map<string, { count: number, resetTime: number }>()
    const now = Date.now()

    // Use pipeline for better performance with multiple keys
    const pipeline = this.client.pipeline()

    for (const key of keys) {
      const fullKey = this.keyPrefix + key

      if (this.slidingWindowEnabled) {
        const windowKey = `${fullKey}:window`
        pipeline.zadd(windowKey, now, now)
        pipeline.zremrangebyscore(windowKey, 0, now - windowMs)
        pipeline.zcard(windowKey)
        pipeline.pexpire(windowKey, windowMs)
      }
      else {
        pipeline.incr(fullKey)
        pipeline.ttl(fullKey)
      }
    }

    const responses = await pipeline.exec()

    // Process the responses
    let responseIndex = 0
    for (const key of keys) {
      if (this.slidingWindowEnabled) {
        const count = Number(responses[responseIndex + 2][1])
        results.set(key, {
          count,
          resetTime: now + windowMs,
        })
        responseIndex += 4
      }
      else {
        const count = Number(responses[responseIndex][1])
        const ttl = Number(responses[responseIndex + 1][1])

        // Set expiration if this is a new key or TTL is negative
        if (count === 1 || ttl < 0) {
          this.client.expire(this.keyPrefix + key, Math.ceil(windowMs / 1000))
        }

        results.set(key, {
          count,
          resetTime: now + (ttl > 0 ? ttl * 1000 : windowMs),
        })
        responseIndex += 2
      }
    }

    return results
  }
}
