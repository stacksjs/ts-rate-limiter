export interface RateLimiterConfig {
  /**
   * Enable verbose logging for debugging and monitoring rate limiter behavior.
   * When enabled, initialization details and important events will be logged.
   * @default false
   * @example
   * ```ts
   * verbose: true
   * ```
   */
  verbose: boolean

  /**
   * Default storage provider to use for rate limiting data.
   * 'memory' stores data in-process (suitable for single-instance deployments).
   * 'redis' stores data in Redis (suitable for distributed deployments).
   * @default 'memory'
   * @example
   * ```ts
   * storage: 'redis'
   * ```
   */
  storage?: 'memory' | 'redis'

  /**
   * Algorithm to use for rate limiting calculations.
   * - 'fixed-window': Simplest approach, resets counters at fixed intervals
   * - 'sliding-window': More precise, gradually expires old requests
   * - 'token-bucket': Smooths traffic by refilling tokens at a constant rate
   * @default 'fixed-window'
   * @example
   * ```ts
   * algorithm: 'sliding-window'
   * ```
   */
  algorithm?: 'fixed-window' | 'sliding-window' | 'token-bucket'

  /**
   * Default time window in milliseconds for rate limiting.
   * This defines the period over which requests are counted.
   * @default 60000 (1 minute)
   * @example
   * ```ts
   * // 5 minutes
   * windowMs: 5 * 60 * 1000
   *
   * // 1 hour
   * windowMs: 60 * 60 * 1000
   * ```
   */
  windowMs?: number

  /**
   * Maximum number of requests allowed within the time window.
   * Requests exceeding this limit will be rejected.
   * Setting to 0 will block all requests.
   * @default 100
   * @example
   * ```ts
   * maxRequests: 50
   * ```
   */
  maxRequests?: number

  /**
   * Prefix for Redis keys to prevent collisions with other applications.
   * Allows multiple rate limiters to share the same Redis instance.
   * @default 'rate-limit:'
   * @example
   * ```ts
   * redisKeyPrefix: 'my-app:rate-limit:'
   * ```
   */
  redisKeyPrefix?: string

  /**
   * Whether to include modern standard rate limit headers in responses.
   * Includes: RateLimit-Limit, RateLimit-Remaining, RateLimit-Reset
   * @default true
   * @example
   * ```ts
   * standardHeaders: false // Disable standard headers
   * ```
   */
  standardHeaders?: boolean

  /**
   * Whether to include legacy rate limit headers in responses.
   * Includes: X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset, Retry-After
   * @default true
   * @example
   * ```ts
   * legacyHeaders: false // Disable legacy headers
   * ```
   */
  legacyHeaders?: boolean

  /**
   * Enable draft mode to test rate limiting without actually blocking requests.
   * Useful for monitoring and testing before enforcing limits in production.
   * @default false
   * @example
   * ```ts
   * draftMode: true // Count but don't block requests
   * ```
   */
  draftMode?: boolean

  /**
   * Configuration options specific to memory storage.
   * @example
   * ```ts
   * memoryStorage: {
   *   enableAutoCleanup: true,
   *   cleanupIntervalMs: 30000
   * }
   * ```
   */
  memoryStorage?: {
    /**
     * Whether to automatically clean up expired records to prevent memory leaks.
     * Highly recommended for long-running applications.
     * @default true
     */
    enableAutoCleanup?: boolean

    /**
     * How often (in milliseconds) to run the cleanup process for expired records.
     * Lower values reduce memory usage but increase CPU usage.
     * @default 60000 (1 minute)
     */
    cleanupIntervalMs?: number
  }

  /**
   * Configuration options specific to Redis storage.
   * Only used when storage is set to 'redis'.
   * @example
   * ```ts
   * redis: {
   *   url: 'redis://localhost:6379',
   *   enableSlidingWindow: true
   * }
   * ```
   */
  redis?: {
    /**
     * Connection URL for Redis server.
     * Format: redis://user:password@host:port
     * @example 'redis://localhost:6379'
     */
    url?: string

    /**
     * Whether to enable the sliding window algorithm in Redis.
     * Requires additional Redis operations but provides more accurate rate limiting.
     * @default false
     */
    enableSlidingWindow?: boolean
  }
}

/**
 * Interface for storage providers that persist rate limit data.
 * Implement this interface to create custom storage backends.
 * @example
 * ```ts
 * class CustomStorage implements StorageProvider {
 *   async increment(key: string, windowMs: number) {
 *     // Implementation
 *     return { count: 1, resetTime: Date.now() + windowMs };
 *   }
 *
 *   async reset(key: string) {
 *     // Implementation
 *   }
 * }
 * ```
 */
export interface StorageProvider {
  /**
   * Increment the counter for a key and return updated count.
   * Called when a new request is received.
   *
   * @param key - The identifier (usually IP address or user ID)
   * @param windowMs - Time window in milliseconds
   * @returns Promise with current request count and reset time
   *
   * @example
   * ```ts
   * async increment(key: string, windowMs: number) {
   *   // Implementation
   *   return { count: 1, resetTime: Date.now() + windowMs };
   * }
   * ```
   */
  increment: (key: string, windowMs: number) => Promise<{
    count: number
    resetTime: number
  }>

  /**
   * Reset the counter for a key.
   * Used to clear rate limits for a specific client.
   *
   * @param key - The identifier to reset
   *
   * @example
   * ```ts
   * async reset(key: string) {
   *   // Clear the record for this key
   * }
   * ```
   */
  reset: (key: string) => Promise<void>

  /**
   * Get current count for a key without incrementing.
   * Optional method for checking limits without consuming them.
   *
   * @param key - The identifier
   * @optional
   *
   * @example
   * ```ts
   * async getCount(key: string) {
   *   // Return current count without incrementing
   *   return 5;
   * }
   * ```
   */
  getCount?: (key: string) => Promise<number>

  /**
   * Get count using sliding window algorithm.
   * Required for 'sliding-window' algorithm support.
   *
   * @param key - The identifier
   * @param windowMs - Time window in milliseconds
   * @optional Required for sliding-window algorithm
   *
   * @example
   * ```ts
   * async getSlidingWindowCount(key: string, windowMs: number) {
   *   // Calculate current count based on timestamps
   *   return 3;
   * }
   * ```
   */
  getSlidingWindowCount?: (key: string, windowMs: number) => Promise<number>

  /**
   * Increment multiple keys in a batch operation.
   * Optional optimization for handling multiple keys efficiently.
   *
   * @param keys - The identifiers to increment
   * @param windowMs - Time window in milliseconds
   * @optional Performance optimization
   *
   * @example
   * ```ts
   * async batchIncrement(keys: string[], windowMs: number) {
   *   const results = new Map();
   *   // Process all keys in one operation
   *   return results;
   * }
   * ```
   */
  batchIncrement?: (keys: string[], windowMs: number) => Promise<Map<string, { count: number, resetTime: number }>>

  /**
   * Clean expired records to prevent memory leaks.
   * Should be called periodically for memory-based storage.
   * @optional But recommended for memory-based storage
   *
   * @example
   * ```ts
   * cleanExpired() {
   *   // Remove records with expired timestamps
   * }
   * ```
   */
  cleanExpired?: () => void

  /**
   * Release resources used by the storage provider.
   * Called when the rate limiter is disposed.
   * @optional But recommended for clean shutdown
   *
   * @example
   * ```ts
   * dispose() {
   *   // Clear timers, close connections, etc.
   * }
   * ```
   */
  dispose?: () => void
}

/**
 * Supported algorithms for rate limiting calculations.
 * Each algorithm has different characteristics for accuracy and resource usage.
 * @example
 * ```ts
 * const algorithm: RateLimitAlgorithm = 'sliding-window';
 * ```
 */
export type RateLimitAlgorithm =
  /** Simple time-based bucketing with full reset at the end of each window */
  'fixed-window' |
  /** Tracks requests over a continuously moving time window for more accurate limiting */
  'sliding-window' |
  /** Models rate limits as tokens that refill at a constant rate, smoothing traffic */
  'token-bucket'

/**
 * Configuration options for creating a rate limiter instance.
 * These options control the behavior of the rate limiter.
 * @example
 * ```ts
 * const options: RateLimiterOptions = {
 *   windowMs: 60000,
 *   maxRequests: 100,
 *   algorithm: 'sliding-window',
 *   standardHeaders: true,
 *   legacyHeaders: false
 * };
 *
 * const rateLimiter = new RateLimiter(options);
 * ```
 */
export interface RateLimiterOptions {
  /**
   * Time window in milliseconds during which requests are counted.
   * @example
   * ```ts
   * // 1 minute
   * windowMs: 60 * 1000,
   *
   * // 1 hour
   * windowMs: 60 * 60 * 1000,
   * ```
   */
  windowMs: number

  /**
   * Maximum number of requests allowed within the time window.
   * Requests exceeding this limit will be rejected.
   * Setting to 0 will block all requests.
   * @example
   * ```ts
   * // Allow 100 requests per window
   * maxRequests: 100,
   *
   * // Block all requests
   * maxRequests: 0,
   * ```
   */
  maxRequests: number

  /**
   * Storage provider for persisting rate limit data.
   * @default MemoryStorage instance
   * @example
   * ```ts
   * // Use Redis storage
   * storage: new RedisStorage({ client: redisClient }),
   *
   * // Use custom storage
   * storage: new MyCustomStorage(),
   * ```
   */
  storage?: StorageProvider

  /**
   * Function to extract identifier from request.
   * Default: Client IP address from various headers or socket
   * Custom function can use any request property (path, auth, etc.)
   * @default IP address extractor
   * @example
   * ```ts
   * // Rate limit by IP
   * keyGenerator: (req) => req.headers.get('x-forwarded-for') || '127.0.0.1',
   *
   * // Rate limit by path
   * keyGenerator: (req) => new URL(req.url).pathname,
   *
   * // Rate limit by auth token
   * keyGenerator: (req) => req.headers.get('authorization') || 'anonymous',
   * ```
   */
  keyGenerator?: (request: Request) => string | Promise<string>

  /**
   * Whether to skip rate limiting when identifier cannot be determined.
   * true = allow requests when key generation fails
   * false = block requests when key generation fails
   * @default false
   * @example
   * ```ts
   * // Allow requests if key generation fails
   * skipFailedRequests: true,
   * ```
   */
  skipFailedRequests?: boolean

  /**
   * Algorithm to use for rate limiting calculations.
   * Each algorithm has different characteristics for accuracy vs performance.
   * @default 'fixed-window'
   * @example
   * ```ts
   * // More accurate limiting
   * algorithm: 'sliding-window',
   *
   * // Smooth token refill
   * algorithm: 'token-bucket',
   * ```
   */
  algorithm?: RateLimitAlgorithm

  /**
   * Whether to include standard rate limit headers in responses.
   * Adds: RateLimit-Limit, RateLimit-Remaining, RateLimit-Reset
   * @default true
   * @example
   * ```ts
   * // Disable standard headers
   * standardHeaders: false,
   * ```
   */
  standardHeaders?: boolean

  /**
   * Whether to include legacy rate limit headers in responses.
   * Adds: X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset, Retry-After
   * @default true
   * @example
   * ```ts
   * // Disable legacy headers
   * legacyHeaders: false,
   * ```
   */
  legacyHeaders?: boolean

  /**
   * Function to conditionally skip rate limiting for certain requests.
   * Return true to skip rate limiting for the request.
   * Useful for whitelisting specific paths, IPs, or authenticated users.
   * @example
   * ```ts
   * // Skip admin endpoints
   * skip: (req) => new URL(req.url).pathname.startsWith('/admin'),
   *
   * // Skip based on special header
   * skip: (req) => req.headers.get('x-skip-rate-limit') === 'true',
   * ```
   */
  skip?: (request: Request) => boolean | Promise<boolean>

  /**
   * Custom handler for rate limited requests.
   * Allows customizing the response when a request exceeds the limit.
   * Default: 429 Too Many Requests with appropriate headers
   * @example
   * ```ts
   * // Custom JSON response
   * handler: (req, result) => {
   *   return new Response(
   *     JSON.stringify({
   *       error: 'Too Many Requests',
   *       retryAfter: Math.ceil(result.remaining / 1000)
   *     }),
   *     {
   *       status: 429,
   *       headers: { 'Content-Type': 'application/json' }
   *     }
   *   );
   * },
   * ```
   */
  handler?: (request: Request, result: RateLimitResult) => Response | Promise<Response>

  /**
   * Enable draft mode to test rate limiting without actually blocking requests.
   * Counts are tracked normally but all requests are allowed.
   * Useful for monitoring and testing before enforcing limits.
   * @default false
   * @example
   * ```ts
   * // Enable draft mode in development
   * draftMode: process.env.NODE_ENV !== 'production',
   * ```
   */
  draftMode?: boolean
}

/**
 * Result of a rate limit check, containing limit status and metrics.
 * Used to determine if a request is allowed and to generate headers.
 * @example
 * ```ts
 * // Example result for an allowed request
 * {
 *   allowed: true,
 *   current: 43,
 *   limit: 100,
 *   remaining: 30000,  // 30 seconds until reset
 *   resetTime: 1623967458000
 * }
 *
 * // Example result for a blocked request
 * {
 *   allowed: false,
 *   current: 101,
 *   limit: 100,
 *   remaining: 15000,  // 15 seconds until reset
 *   resetTime: 1623967443000
 * }
 * ```
 */
export interface RateLimitResult {
  /**
   * Whether the request is allowed to proceed.
   * false if the request exceeds the rate limit.
   */
  allowed: boolean

  /**
   * Current request count for this client within the window.
   * Includes the current request being checked.
   */
  current: number

  /**
   * Maximum requests allowed within the window.
   * Configured by maxRequests option.
   */
  limit: number

  /**
   * Time in milliseconds until the limit resets.
   * Used for Retry-After header calculation.
   */
  remaining: number

  /**
   * Unix timestamp (in milliseconds) when the limit resets.
   * Used for RateLimit-Reset header calculation.
   */
  resetTime: number
}

/**
 * Configuration options for the token bucket algorithm.
 * Models rate limits as tokens that refill at a constant rate.
 * @example
 * ```ts
 * const tokenBucket: TokenBucketOptions = {
 *   capacity: 100,  // Bucket size
 *   refillRate: 0.5 // 0.5 tokens per ms = 30 tokens per second
 * };
 * ```
 */
export interface TokenBucketOptions {
  /**
   * Maximum tokens in the bucket (equivalent to burst capacity).
   * Determines how many requests can be made in quick succession.
   * @example
   * ```ts
   * // Allow bursts of up to 50 requests
   * capacity: 50
   * ```
   */
  capacity: number

  /**
   * Tokens added per millisecond to the bucket.
   * Determines the sustained request rate (tokens/second ÷ 1000).
   * @example
   * ```ts
   * // 1 token per second = 0.001 tokens per millisecond
   * refillRate: 0.001,
   *
   * // 10 tokens per second = 0.01 tokens per millisecond
   * refillRate: 0.01,
   * ```
   */
  refillRate: number
}

/**
 * Configuration options for Redis-based storage.
 * Used when creating a RedisStorage instance.
 * @example
 * ```ts
 * const redisOptions: RedisStorageOptions = {
 *   client: redisClient,
 *   keyPrefix: 'api:rate-limit:',
 *   enableSlidingWindow: true
 * };
 *
 * const storage = new RedisStorage(redisOptions);
 * ```
 */
export interface RedisStorageOptions {
  /**
   * Redis client instance.
   * Must be connected and ready to use.
   * @example
   * ```ts
   * // Using upstash/redis
   * client: new Redis({ url: process.env.REDIS_URL })
   * ```
   */
  client: any

  /**
   * Key prefix for Redis storage to prevent collisions.
   * Multiple rate limiters can share the same Redis instance.
   * @default 'rate-limit:'
   * @example
   * ```ts
   * // Prefix for user API limits
   * keyPrefix: 'user-api:rate-limit:'
   * ```
   */
  keyPrefix?: string

  /**
   * Enable sliding window algorithm support.
   * Requires additional Redis operations but provides more accurate rate limiting.
   * @default false
   * @example
   * ```ts
   * // Enable sliding window algorithm
   * enableSlidingWindow: true
   * ```
   */
  enableSlidingWindow?: boolean
}

/**
 * Configuration options for memory-based storage.
 * Used when creating a MemoryStorage instance.
 * @example
 * ```ts
 * const memOptions: MemoryStorageOptions = {
 *   enableAutoCleanup: true,
 *   cleanupIntervalMs: 30000 // 30 seconds
 * };
 *
 * const storage = new MemoryStorage(memOptions);
 * ```
 */
export interface MemoryStorageOptions {
  /**
   * Enable automatic cleanup of expired records to prevent memory leaks.
   * Highly recommended for long-running applications.
   * @default true
   * @example
   * ```ts
   * // Disable auto cleanup (not recommended for production)
   * enableAutoCleanup: false
   * ```
   */
  enableAutoCleanup?: boolean

  /**
   * Interval in milliseconds for cleanup of expired records.
   * Lower values reduce memory usage but increase CPU usage.
   * @default 60000 (1 minute)
   * @example
   * ```ts
   * // Clean up every 5 minutes
   * cleanupIntervalMs: 5 * 60 * 1000
   * ```
   */
  cleanupIntervalMs?: number
}
