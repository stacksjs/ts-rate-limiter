# API Reference

This page provides a comprehensive reference for the TypeScript Rate Limiter API.

## Core Classes

### RateLimiter

The main class for rate limiting functionality.

```ts
import { RateLimiter } from 'ts-rate-limiter'

const limiter = new RateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 100, // 100 requests per minute
})
```

#### Constructor

Creates a new rate limiter instance.

```ts
constructor(options: RateLimiterOptions)
```

**Parameters:**

- `options`: [RateLimiterOptions](#ratelimiteroptions) - Configuration options for the rate limiter

#### Methods

##### check

Checks if a request is allowed based on the configured rate limit.

```ts
async check(request: Request): Promise<RateLimitResult>
```

**Parameters:**

- `request`: `Request` - The request to check

**Returns:**

- `Promise<RateLimitResult>` - The result of the rate limit check

##### consume

Consumes a token for the given key directly (without a request object).

```ts
async consume(key: string): Promise<RateLimitResult>
```

**Parameters:**

- `key`: `string` - The identifier to check (e.g., IP address)

**Returns:**

- `Promise<RateLimitResult>` - The result of the rate limit check

##### reset

Resets the counter for a specific key.

```ts
async reset(key: string): Promise<void>
```

**Parameters:**

- `key`: `string` - The identifier to reset

##### resetAll

Resets all counters.

```ts
async resetAll(): Promise<void>
```

##### middleware

Creates a middleware function for use with HTTP server frameworks.

```ts
middleware(): (req: Request) => Promise<Response | null>
```

**Returns:**

- A middleware function that takes a `Request` and returns a `Promise<Response | null>`
- Returns `null` if the request is allowed
- Returns a `Response` with status 429 if the request is blocked

##### dispose

Releases resources used by the rate limiter.

```ts
dispose(): void
```

## Storage Providers

### MemoryStorage

In-memory storage for rate limiting.

```ts
import { MemoryStorage } from 'ts-rate-limiter'

const storage = new MemoryStorage({
  enableAutoCleanup: true,
  cleanupIntervalMs: 60000,
})
```

#### Constructor

Creates a new memory storage instance.

```ts
constructor(options?: MemoryStorageOptions)
```

**Parameters:**

- `options`: [MemoryStorageOptions](#memorystorageoptions) - Configuration options (optional)

#### Methods

##### increment

Increments the counter for a key.

```ts
async increment(key: string, windowMs: number): Promise<{ count: number, resetTime: number }>
```

**Parameters:**

- `key`: `string` - The identifier (usually IP address)
- `windowMs`: `number` - Time window in milliseconds

**Returns:**

- `Promise<{ count: number, resetTime: number }>` - The updated count and reset time

##### reset

Resets the counter for a key.

```ts
async reset(key: string): Promise<void>
```

**Parameters:**

- `key`: `string` - The identifier to reset

##### getCount

Gets the current count for a key.

```ts
async getCount(key: string): Promise<number>
```

**Parameters:**

- `key`: `string` - The identifier

**Returns:**

- `Promise<number>` - The current count

##### getSlidingWindowCount

Gets the count using sliding window algorithm.

```ts
async getSlidingWindowCount(key: string, windowMs: number): Promise<number>
```

**Parameters:**

- `key`: `string` - The identifier
- `windowMs`: `number` - Time window in milliseconds

**Returns:**

- `Promise<number>` - The current count using sliding window

##### batchIncrement

Increments multiple keys in a batch operation.

```ts
async batchIncrement(keys: string[], windowMs: number): Promise<Map<string, { count: number, resetTime: number }>>
```

**Parameters:**

- `keys`: `string[]` - The identifiers to increment
- `windowMs`: `number` - Time window in milliseconds

**Returns:**

- `Promise<Map<string, { count: number, resetTime: number }>>` - Map of keys to their counts and reset times

##### cleanExpired

Cleans expired records from memory.

```ts
cleanExpired(): void
```

##### dispose

Releases resources used by the storage provider.

```ts
dispose(): void
```

### RedisStorage

Redis-based storage for distributed rate limiting.

```ts
import { RedisStorage } from 'ts-rate-limiter'

const storage = new RedisStorage({
  client: redisClient,
  keyPrefix: 'ratelimit:',
  enableSlidingWindow: true,
})
```

#### Constructor

Creates a new Redis storage instance.

```ts
constructor(options: RedisStorageOptions)
```

**Parameters:**

- `options`: [RedisStorageOptions](#redisstorageoptions) - Configuration options

#### Methods

Similar to MemoryStorage, RedisStorage implements all methods of the [StorageProvider](#storageprovider) interface.

## Interfaces

### RateLimiterOptions

Options for configuring the RateLimiter.

```ts
interface RateLimiterOptions {
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
```

### RateLimitResult

Result of a rate limit check.

```ts
interface RateLimitResult {
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
```

### StorageProvider

Interface for storage providers.

```ts
interface StorageProvider {
  /**
   * Increment the counter for a key and return updated count
   */
  increment: (key: string, windowMs: number) => Promise<{
    count: number
    resetTime: number
  }>

  /**
   * Reset the counter for a key
   */
  reset: (key: string) => Promise<void>

  /**
   * Get current count for a key (optional)
   */
  getCount?: (key: string) => Promise<number>

  /**
   * Get count using sliding window algorithm (optional)
   */
  getSlidingWindowCount?: (key: string, windowMs: number) => Promise<number>

  /**
   * Increment multiple keys in a batch operation (optional)
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
```

### RedisStorageOptions

Options for configuring Redis storage.

```ts
interface RedisStorageOptions {
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
```

### MemoryStorageOptions

Options for configuring memory storage.

```ts
interface MemoryStorageOptions {
  /**
   * Enable automatic cleanup of expired records
   */
  enableAutoCleanup?: boolean

  /**
   * Interval in milliseconds for cleanup
   */
  cleanupIntervalMs?: number
}
```

### TokenBucketOptions

Configuration for the token bucket algorithm.

```ts
interface TokenBucketOptions {
  /**
   * Maximum tokens in the bucket
   */
  capacity: number

  /**
   * Tokens added per millisecond
   */
  refillRate: number
}
```

## Types

### RateLimitAlgorithm

Available algorithms for rate limiting.

```ts
type RateLimitAlgorithm = 'fixed-window' | 'sliding-window' | 'token-bucket'
```

## Advanced Usage Examples

### Custom Key Generation

```ts
const limiter = new RateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 100,
  keyGenerator: (request: Request) => {
    // Use API key from header for rate limiting
    const apiKey = request.headers.get('x-api-key')
    return apiKey || '127.0.0.1'
  },
})
```

### Custom Response Handler

```ts
const limiter = new RateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 100,
  handler: (request: Request, result: RateLimitResult) => {
    return new Response(
      JSON.stringify({
        error: 'Too many requests',
        retryAfter: Math.ceil(result.remaining / 1000),
      }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': String(Math.ceil(result.remaining / 1000)),
        },
      }
    )
  },
})
```

### Selective Rate Limiting

```ts
const limiter = new RateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 100,
  skip: (request: Request) => {
    // Skip rate limiting for internal requests
    return request.headers.get('x-internal') === 'true'
  },
})
```

### Distributed Rate Limiting with Redis

```ts
import { createClient } from 'redis'
import { RateLimiter, RedisStorage } from 'ts-rate-limiter'

const redisClient = createClient({
  url: 'redis://localhost:6379',
})

await redisClient.connect()

const storage = new RedisStorage({
  client: redisClient,
  keyPrefix: 'ratelimit:',
  enableSlidingWindow: true,
})

const limiter = new RateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 100,
  storage,
  algorithm: 'sliding-window',
})
```
