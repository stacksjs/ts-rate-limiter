import type {
  RateLimitAlgorithm,
  RateLimiterOptions,
  RateLimitResult,
  StorageProvider,
  TokenBucketOptions,
} from './types'
import { config } from './config'
import { MemoryStorage } from './drivers/memory'

/**
 * Rate limiter class with enhanced performance and features
 */
export class RateLimiter {
  private windowMs: number
  private maxRequests: number
  private storage: StorageProvider
  private keyGenerator: (request: Request) => string | Promise<string>
  private skipFailedRequests: boolean
  private algorithm: RateLimitAlgorithm
  private standardHeaders: boolean
  private legacyHeaders: boolean
  private skipFn?: (request: Request) => boolean | Promise<boolean>
  private handler?: (request: Request, result: RateLimitResult) => Response | Promise<Response>
  private draftMode: boolean
  private tokenBucketOptions?: TokenBucketOptions
  private tokenBuckets: Map<string, { tokens: number, lastRefill: number }>

  constructor(options: RateLimiterOptions) {
    // Use provided options or fallback to global config
    this.windowMs = options.windowMs || config.windowMs || 60 * 1000
    this.maxRequests = options.maxRequests || config.maxRequests || 100

    // Check for zero max requests - it should be treated as 0, not fallback to defaults
    if (options.maxRequests === 0) {
      this.maxRequests = 0
    }

    // Set up storage based on options or config
    if (options.storage) {
      this.storage = options.storage
    }
    else if (config.storage === 'redis' && config.redis) {
      // Try to create Redis storage from global config
      throw new Error('Redis client must be provided explicitly when using Redis storage')
    }
    else {
      // Create memory storage with config options
      this.storage = new MemoryStorage(config.memoryStorage)
    }

    this.skipFailedRequests = options.skipFailedRequests ?? false
    this.keyGenerator = options.keyGenerator || this.defaultKeyGenerator
    this.algorithm = options.algorithm || config.algorithm || 'fixed-window'
    this.standardHeaders = options.standardHeaders ?? config.standardHeaders ?? true
    this.legacyHeaders = options.legacyHeaders ?? config.legacyHeaders ?? true
    this.skipFn = options.skip
    this.handler = options.handler
    this.draftMode = options.draftMode ?? config.draftMode ?? false
    this.tokenBuckets = new Map()

    // Set up token bucket if using that algorithm
    if (this.algorithm === 'token-bucket') {
      this.tokenBucketOptions = {
        capacity: this.maxRequests,
        refillRate: this.maxRequests / (this.windowMs / 1000) / 1000, // tokens per ms
      }
    }

    // Verbose logging if enabled
    if (config.verbose) {
      const storageType = options.storage
        ? (options.storage instanceof MemoryStorage ? 'memory (custom)' : 'redis (custom)')
        : config.storage

      console.warn(`[ts-rate-limiter] Initialized with:
  - Algorithm: ${this.algorithm}
  - Window: ${this.windowMs}ms
  - Max Requests: ${this.maxRequests}
  - Storage: ${storageType}
  - Draft Mode: ${this.draftMode ? 'enabled' : 'disabled'}`)
    }
  }

  /**
   * Default key generator using IP address from request
   */
  private defaultKeyGenerator(request: Request): string {
    // Get IP from headers (common with proxies)
    const forwarded = request.headers.get('x-forwarded-for')
    if (forwarded) {
      return forwarded.split(',')[0].trim()
    }

    const clientIP = request.headers.get('x-client-ip')
    if (clientIP) {
      return clientIP
    }

    const realIP = request.headers.get('x-real-ip')
    if (realIP) {
      return realIP
    }

    // Fallback to direct connection info (Bun specific)
    const socket = (request as any).socket
    return socket?.remoteAddress || '127.0.0.1'
  }

  /**
   * Check if a request is allowed
   */
  async check(request: Request): Promise<RateLimitResult> {
    try {
      // Check if this request should be skipped
      if (this.skipFn && await this.skipFn(request)) {
        return this.createAllowedResult()
      }

      // If maxRequests is 0, always block
      if (this.maxRequests === 0) {
        return {
          allowed: false,
          current: 1,
          limit: 0,
          remaining: this.windowMs,
          resetTime: Date.now() + this.windowMs,
        }
      }

      const key = await this.keyGenerator(request)

      // Use appropriate algorithm
      if (this.algorithm === 'sliding-window' && this.storage.getSlidingWindowCount) {
        return this.checkSlidingWindow(key)
      }
      else if (this.algorithm === 'token-bucket') {
        return this.checkTokenBucket(key)
      }
      else {
        return this.checkFixedWindow(key)
      }
    }
    catch (error) {
      if (this.skipFailedRequests) {
        return this.createAllowedResult()
      }
      throw error
    }
  }

  /**
   * Check using fixed window algorithm
   */
  private async checkFixedWindow(key: string): Promise<RateLimitResult> {
    const { count, resetTime } = await this.storage.increment(key, this.windowMs)
    const remaining = Math.max(0, resetTime - Date.now())
    const allowed = this.draftMode ? true : count <= this.maxRequests

    return {
      allowed,
      current: count,
      limit: this.maxRequests,
      remaining,
      resetTime,
    }
  }

  /**
   * Check using sliding window algorithm
   */
  private async checkSlidingWindow(key: string): Promise<RateLimitResult> {
    if (!this.storage.getSlidingWindowCount) {
      // Fallback to fixed window if sliding window not supported
      return this.checkFixedWindow(key)
    }

    await this.storage.increment(key, this.windowMs)
    const count = await this.storage.getSlidingWindowCount(key, this.windowMs)
    const now = Date.now()
    const resetTime = now + this.windowMs
    const allowed = this.draftMode ? true : count <= this.maxRequests

    return {
      allowed,
      current: count,
      limit: this.maxRequests,
      remaining: this.windowMs,
      resetTime,
    }
  }

  /**
   * Check using token bucket algorithm
   */
  private async checkTokenBucket(key: string): Promise<RateLimitResult> {
    if (!this.tokenBucketOptions) {
      return this.checkFixedWindow(key)
    }

    const now = Date.now()
    let bucket = this.tokenBuckets.get(key)

    // Create new bucket if none exists
    if (!bucket) {
      bucket = {
        tokens: this.tokenBucketOptions.capacity,
        lastRefill: now,
      }
      this.tokenBuckets.set(key, bucket)
    }

    // Refill tokens based on time elapsed
    const timeElapsed = now - bucket.lastRefill
    const tokensToAdd = timeElapsed * this.tokenBucketOptions.refillRate

    if (tokensToAdd > 0) {
      bucket.tokens = Math.min(
        bucket.tokens + tokensToAdd,
        this.tokenBucketOptions.capacity,
      )
      bucket.lastRefill = now
    }

    // Check if we have enough tokens
    const allowed = this.draftMode ? true : bucket.tokens >= 1

    // Consume a token if allowed
    if (allowed && !this.draftMode) {
      bucket.tokens -= 1
    }

    // Calculate time until next token
    const msUntilNextToken = bucket.tokens >= this.tokenBucketOptions.capacity
      ? this.windowMs
      : Math.ceil(1 / this.tokenBucketOptions.refillRate)

    return {
      allowed,
      current: this.tokenBucketOptions.capacity - Math.floor(bucket.tokens),
      limit: this.tokenBucketOptions.capacity,
      remaining: msUntilNextToken,
      resetTime: now + msUntilNextToken,
    }
  }

  /**
   * Create a result for allowed requests (used when skipping)
   */
  private createAllowedResult(): RateLimitResult {
    return {
      allowed: true,
      current: 0,
      limit: this.maxRequests,
      remaining: this.windowMs,
      resetTime: Date.now() + this.windowMs,
    }
  }

  /**
   * Consume a token for the given key
   */
  async consume(key: string): Promise<RateLimitResult> {
    if (this.algorithm === 'sliding-window' && this.storage.getSlidingWindowCount) {
      return this.checkSlidingWindow(key)
    }
    else if (this.algorithm === 'token-bucket') {
      return this.checkTokenBucket(key)
    }
    else {
      return this.checkFixedWindow(key)
    }
  }

  /**
   * Reset the counter for a key
   */
  async reset(key: string): Promise<void> {
    await this.storage.reset(key)

    // Also reset token bucket if using that algorithm
    if (this.algorithm === 'token-bucket') {
      this.tokenBuckets.delete(key)
    }
  }

  /**
   * Reset all counters
   */
  async resetAll(): Promise<void> {
    // This depends on storage implementation, for token bucket we can clear our map
    if (this.algorithm === 'token-bucket') {
      this.tokenBuckets.clear()
    }

    // Other algorithms rely on storage implementation
    if (this.storage.cleanExpired) {
      this.storage.cleanExpired()
    }
  }

  /**
   * Generate standard rate limit headers
   */
  private getHeaders(result: RateLimitResult): Record<string, string> {
    const headers: Record<string, string> = {}

    if (this.standardHeaders) {
      headers['RateLimit-Limit'] = this.maxRequests.toString()
      headers['RateLimit-Remaining'] = Math.max(0, this.maxRequests - result.current).toString()
      headers['RateLimit-Reset'] = Math.ceil(result.resetTime / 1000).toString()
    }

    if (this.legacyHeaders) {
      headers['X-RateLimit-Limit'] = this.maxRequests.toString()
      headers['X-RateLimit-Remaining'] = Math.max(0, this.maxRequests - result.current).toString()
      headers['X-RateLimit-Reset'] = Math.ceil(result.resetTime / 1000).toString()

      if (!result.allowed) {
        headers['Retry-After'] = Math.ceil(result.remaining / 1000).toString()
      }
    }

    return headers
  }

  /**
   * Middleware for Bun HTTP server
   */
  middleware(): (req: Request) => Promise<Response | null> {
    return async (req: Request) => {
      const result = await this.check(req)

      if (!result.allowed) {
        // Use custom handler if provided
        if (this.handler) {
          return this.handler(req, result)
        }

        return new Response('Rate limit exceeded', {
          status: 429,
          headers: this.getHeaders(result),
        })
      }

      // Add headers to the original response using a Response hook
      // This approach requires server framework integration
      // Will be handled by the framework adapter

      // Continue to the next middleware/handler
      return null
    }
  }

  /**
   * Clean up resources used by the rate limiter
   */
  dispose(): void {
    if (this.storage.dispose) {
      this.storage.dispose()
    }

    this.tokenBuckets.clear()
  }
}
