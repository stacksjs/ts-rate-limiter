# Configuration

`ts-rate-limiter` can be configured using a variety of options to customize its behavior.

## Configuration Options

When creating a new `RateLimiter` instance, you can pass the following options:

```ts
import { RateLimiter } from 'ts-rate-limiter'

const limiter = new RateLimiter({
  // Required options
  windowMs: 15 * 60 * 1000, // Time window in milliseconds (15 minutes)
  maxRequests: 100, // Maximum number of requests allowed in the window

  // Optional features
  storage: new MemoryStorage(), // Storage provider (defaults to MemoryStorage)
  algorithm: 'sliding-window', // Algorithm to use ('fixed-window', 'sliding-window', 'token-bucket')
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers

  // Custom behavior
  keyGenerator: (req) => { // Function to extract identifier from request
    return req.headers.get('x-forwarded-for') || '127.0.0.1'
  },
  skip: (req) => { // Function to determine if rate limiting should be skipped
    return req.url.includes('/health')
  },
  handler: (req, result) => { // Custom handler for rate-limited requests
    return new Response('Too many requests', { status: 429 })
  },

  // Additional options
  skipFailedRequests: false, // Whether to skip failed requests
  draftMode: false, // Monitor but don't block requests
})
```

## Using a Configuration File

You can set up a standard configuration file using the built-in CLI tool:

```bash
# Generate a configuration file template
npx ts-rate-limiter
# or
bun ts-rate-limiter
```

This will create a `rate-limiter.config.ts` file in your project with the following content:

```ts
import type { RateLimiterConfig } from 'ts-rate-limiter'

const config: RateLimiterConfig = {
  // Core Settings
  verbose: true,
  storage: 'memory',
  algorithm: 'sliding-window',

  // Default Limits
  windowMs: 60 * 1000, // 1 minute window
  maxRequests: 100, // 100 requests per window

  // Response Settings
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: true, // Return rate limit info in the `X-RateLimit-*` headers

  // Testing/Development
  draftMode: false, // Set to true to record but not block requests

  // Memory Storage Options
  memoryStorage: {
    enableAutoCleanup: true,
    cleanupIntervalMs: 60 * 1000, // 1 minute
  },

  // Redis Options (when storage is 'redis')
  redisKeyPrefix: 'ratelimit:',
  redis: {
    url: 'redis://localhost:6379',
    enableSlidingWindow: true,
  },
}

export default config
```

## Using the Factory Function

For even easier configuration, you can use the factory function which will automatically use your configuration file:

```ts
import { createRateLimiter } from 'ts-rate-limiter'

// Create a rate limiter using configuration defaults
const limiter = await createRateLimiter()

// Or override specific options
const customLimiter = await createRateLimiter({
  maxRequests: 50, // Override just the max requests
  draftMode: true, // Enable draft mode for testing
})
```

The `createRateLimiter` function will:

1. Load your configuration file
2. Apply any overrides you specify
3. Automatically connect to Redis if configured
4. Fall back to memory storage if Redis connection fails
5. Return a fully configured RateLimiter instance

## Global Configuration Options

Here's the complete list of configuration options available in the `rate-limiter.config.ts` file:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `verbose` | boolean | `true` | Enable verbose logging |
| `storage` | 'memory' \| 'redis' | 'memory' | Default storage provider |
| `algorithm` | 'fixed-window' \| 'sliding-window' \| 'token-bucket' | 'fixed-window' | Default algorithm |
| `windowMs` | number | 60000 | Default window size in milliseconds |
| `maxRequests` | number | 100 | Default max requests per window |
| `standardHeaders` | boolean | true | Default behavior for standard headers |
| `legacyHeaders` | boolean | true | Default behavior for legacy headers |
| `draftMode` | boolean | false | Default draft mode setting |
| `redisKeyPrefix` | string | 'ratelimit:' | Default key prefix for Redis storage |
| `memoryStorage.enableAutoCleanup` | boolean | true | Enable automatic cleanup of expired records |
| `memoryStorage.cleanupIntervalMs` | number | 60000 | Interval for cleanup in milliseconds |
| `redis.url` | string | 'redis://localhost:6379' | Redis connection URL |
| `redis.enableSlidingWindow` | boolean | false | Enable sliding window with Redis |

## Storage Providers

### Memory Storage Options

```ts
import { MemoryStorage } from 'ts-rate-limiter'

const memoryStorage = new MemoryStorage({
  enableAutoCleanup: true, // Automatically clean up expired records
  cleanupIntervalMs: 60000, // Clean up every minute
})
```

### Redis Storage Options

```ts
import { createClient } from 'redis'
import { RedisStorage } from 'ts-rate-limiter'

const redisClient = createClient({
  url: 'redis://redis-server:6379'
})
await redisClient.connect()

const redisStorage = new RedisStorage({
  client: redisClient, // Redis client instance
  keyPrefix: 'ratelimit:', // Prefix for all keys stored in Redis
  enableSlidingWindow: true, // Use sliding window algorithm for more accuracy
})
```

## Response Headers

When `standardHeaders` is set to `true` (default), the following headers will be included in the response:

- `RateLimit-Limit`: The maximum number of requests allowed in the window
- `RateLimit-Remaining`: The number of requests remaining in the current window
- `RateLimit-Reset`: The time at which the current window resets, in Unix timestamp seconds

When `legacyHeaders` is set to `true` (default), the following headers will be included:

- `X-RateLimit-Limit`: The maximum number of requests allowed in the window
- `X-RateLimit-Remaining`: The number of requests remaining in the current window
- `X-RateLimit-Reset`: The time at which the current window resets, in Unix timestamp seconds
- `Retry-After`: The number of seconds to wait before retrying (only included when rate limited)

## Next Steps

- [Learn about different algorithms](/features/algorithms)
- [See advanced examples](/advanced/examples)
- [View benchmarks](/advanced/benchmarks)
