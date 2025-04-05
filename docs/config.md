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
  verbose: true,
  storage: 'memory',
  algorithm: 'sliding-window',

  // Uncomment to use Redis as the default storage
  // storage: 'redis',

  // Use 'fixed-window', 'sliding-window', or 'token-bucket'
  // algorithm: 'token-bucket',
}

export default config
```

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
