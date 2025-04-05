import type { RateLimiterOptions } from './types'
import { createClient } from 'redis'
import { config } from './config'
import { MemoryStorage } from './drivers/memory'
import { RedisStorage } from './drivers/redis'
import { RateLimiter } from './rate-limiter'

export * from './config'
export * from './drivers/memory'
export * from './drivers/redis'
export * from './rate-limiter'
export * from './types'

/**
 * Create a rate limiter from configuration
 *
 * @param options Optional rate limiter options that will override configuration defaults
 * @returns A configured RateLimiter instance
 */
export async function createRateLimiter(options: Partial<RateLimiterOptions> = {}): Promise<RateLimiter> {
  const finalOptions: RateLimiterOptions = {
    windowMs: options.windowMs ?? config.windowMs ?? 60 * 1000,
    maxRequests: options.maxRequests ?? config.maxRequests ?? 100,
    algorithm: options.algorithm ?? config.algorithm ?? 'fixed-window',
    standardHeaders: options.standardHeaders ?? config.standardHeaders ?? true,
    legacyHeaders: options.legacyHeaders ?? config.legacyHeaders ?? true,
    draftMode: options.draftMode ?? config.draftMode ?? false,
    keyGenerator: options.keyGenerator,
    skipFailedRequests: options.skipFailedRequests,
    skip: options.skip,
    handler: options.handler,
  }

  // If storage is explicitly provided, use it
  if (options.storage) {
    finalOptions.storage = options.storage
  }
  // Otherwise use configured storage
  else if (config.storage === 'redis' && config.redis) {
    try {
      // Create Redis client from config
      const redisClient = createClient({
        url: config.redis.url || 'redis://localhost:6379',
      })

      await redisClient.connect()

      finalOptions.storage = new RedisStorage({
        client: redisClient,
        keyPrefix: config.redisKeyPrefix,
        enableSlidingWindow: config.redis.enableSlidingWindow,
      })

      // Add event handler to warn on Redis errors
      redisClient.on('error', (err) => {
        console.error('[ts-rate-limiter] Redis error:', err.message)
      })
    }
    catch (error) {
      console.warn('[ts-rate-limiter] Failed to connect to Redis, falling back to memory storage:', error)
      finalOptions.storage = new MemoryStorage(config.memoryStorage)
    }
  }
  else {
    // Use memory storage
    finalOptions.storage = new MemoryStorage(config.memoryStorage)
  }

  return new RateLimiter(finalOptions)
}
