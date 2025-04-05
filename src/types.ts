export interface RateLimiterConfig {
  /**
   * Enable verbose logging
   */
  verbose: boolean

  /**
   * Default storage provider to use
   */
  storage?: 'memory' | 'redis'

  /**
   * Default algorithm to use
   */
  algorithm?: 'fixed-window' | 'sliding-window' | 'token-bucket'

  /**
   * Default window size in milliseconds
   */
  windowMs?: number

  /**
   * Default max requests per window
   */
  maxRequests?: number

  /**
   * Default key prefix for Redis storage
   */
  redisKeyPrefix?: string

  /**
   * Default behavior for standard headers
   */
  standardHeaders?: boolean

  /**
   * Default behavior for legacy headers
   */
  legacyHeaders?: boolean

  /**
   * Default draft mode setting
   */
  draftMode?: boolean

  /**
   * Default memory storage options
   */
  memoryStorage?: {
    enableAutoCleanup?: boolean
    cleanupIntervalMs?: number
  }

  /**
   * Default Redis connection options (if using Redis)
   */
  redis?: {
    url?: string
    enableSlidingWindow?: boolean
  }
}

/**
 * Interface for storage providers
 */
export interface StorageProvider {
  /**
   * Increment the counter for a key and return updated count
   * @param key The identifier (usually IP address)
   * @param windowMs Time window in milliseconds
   * @returns Promise with current request count and reset time
   */
  increment: (key: string, windowMs: number) => Promise<{
    count: number
    resetTime: number
  }>

  /**
   * Reset the counter for a key
   * @param key The identifier to reset
   */
  reset: (key: string) => Promise<void>

  /**
   * Get current count for a key (optional)
   * @param key The identifier
   */
  getCount?: (key: string) => Promise<number>

  /**
   * Get count using sliding window algorithm (optional)
   * @param key The identifier
   * @param windowMs Time window in milliseconds
   */
  getSlidingWindowCount?: (key: string, windowMs: number) => Promise<number>

  /**
   * Increment multiple keys in a batch operation (optional)
   * @param keys The identifiers to increment
   * @param windowMs Time window in milliseconds
   */
  batchIncrement?: (keys: string[], windowMs: number) => Promise<Map<string, { count: number, resetTime: number }>>

  /**
   * Clean expired records (optional)
   */
  cleanExpired?: () => void

  /**
   * Dispose resources used by the storage provider (optional)
   */
  dispose?: () => void
}

/**
 * Algorithm types for rate limiting
 */
export type RateLimitAlgorithm = 'fixed-window' | 'sliding-window' | 'token-bucket'

/**
 * Rate limiter configuration options
 */
export interface RateLimiterOptions {
  /**
   * Time window in milliseconds
   */
  windowMs: number

  /**
   * Maximum number of requests allowed in the window
   */
  maxRequests: number

  /**
   * Storage provider (defaults to MemoryStorage)
   */
  storage?: StorageProvider

  /**
   * Function to extract identifier from request (defaults to IP address)
   */
  keyGenerator?: (request: Request) => string | Promise<string>

  /**
   * Whether to skip when identifier cannot be determined
   */
  skipFailedRequests?: boolean

  /**
   * Algorithm to use (defaults to fixed-window)
   */
  algorithm?: RateLimitAlgorithm

  /**
   * Headers to include in response
   */
  standardHeaders?: boolean

  /**
   * Legacy headers to include in response
   */
  legacyHeaders?: boolean

  /**
   * Skip rate limiting for certain requests
   */
  skip?: (request: Request) => boolean | Promise<boolean>

  /**
   * Custom handler for rate limited requests
   */
  handler?: (request: Request, result: RateLimitResult) => Response | Promise<Response>

  /**
   * Draft mode - records but doesn't block requests
   */
  draftMode?: boolean
}

/**
 * Result of a rate limit check
 */
export interface RateLimitResult {
  /**
   * Whether the request is allowed
   */
  allowed: boolean

  /**
   * Current request count
   */
  current: number

  /**
   * Maximum requests allowed
   */
  limit: number

  /**
   * Time in ms until the limit resets
   */
  remaining: number

  /**
   * Unix timestamp when the limit resets
   */
  resetTime: number
}

/**
 * Token bucket configuration
 */
export interface TokenBucketOptions {
  /**
   * Maximum tokens in the bucket
   */
  capacity: number

  /**
   * Tokens added per millisecond
   */
  refillRate: number
}

/**
 * Redis storage options
 */
export interface RedisStorageOptions {
  /**
   * Redis client
   */
  client: any

  /**
   * Key prefix for Redis storage
   */
  keyPrefix?: string

  /**
   * Enable sliding window algorithm
   */
  enableSlidingWindow?: boolean
}

/**
 * Memory storage options
 */
export interface MemoryStorageOptions {
  /**
   * Enable automatic cleanup of expired records
   */
  enableAutoCleanup?: boolean

  /**
   * Interval in milliseconds for cleanup
   */
  cleanupIntervalMs?: number
}
