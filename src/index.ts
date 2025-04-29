import type { RateLimiterOptions } from './types'
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
      // Create Redis client
      let redisClient

      // Check if we're running in Bun
      if (typeof globalThis.Bun !== 'undefined') {
        try {
          // Try to use Bun's built-in Redis client
          const { RedisClient } = await import('bun')
          redisClient = new RedisClient(config.redis.url || 'redis://localhost:6379')
          if (config.verbose) {
            console.warn('[ts-rate-limiter] Using Bun\'s native Redis client')
          }
        }
        catch (bunRedisError) {
          if (config.verbose) {
            console.warn('[ts-rate-limiter] Failed to use Bun\'s native Redis client:', bunRedisError)
          }
        }
      }

      // Fall back to standard Redis client if Bun's client isn't available
      if (!redisClient) {
        try {
          const { createClient } = await import('redis')
          redisClient = createClient({ url: config.redis.url || 'redis://localhost:6379' })
          if (config.verbose) {
            console.warn('[ts-rate-limiter] Using npm redis client')
          }
        }
        catch (redisImportError) {
          throw new Error(
            `[ts-rate-limiter] Failed to import redis client. If using Bun, make sure you're using v1.2.9+ or install the redis package: ${redisImportError}`,
          )
        }
      }

      // Connect to Redis
      if (typeof redisClient.connect === 'function') {
        await redisClient.connect()
      }

      finalOptions.storage = new RedisStorage({
        client: redisClient,
        keyPrefix: config.redisKeyPrefix,
        enableSlidingWindow: config.redis.enableSlidingWindow,
      })

      // Handle Redis client errors based on available APIs
      if ('onclose' in redisClient) {
        redisClient.onclose = (error: unknown) => {
          if (error) {
            console.error('[ts-rate-limiter] Redis connection closed with error:', error)
          }
        }
      }
      else if ('on' in redisClient && typeof redisClient.on === 'function') {
        redisClient.on('error', (err: Error) => {
          console.error('[ts-rate-limiter] Redis error:', err.message)
        })
      }
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
