<p align="center"><img src=".github/art/cover.jpg" alt="Social Card of this repo"></p>

[![npm version][npm-version-src]][npm-version-href]
[![GitHub Actions][github-actions-src]][github-actions-href]
[![Commitizen friendly](https://img.shields.io/badge/commitizen-friendly-brightgreen.svg)](http://commitizen.github.io/cz-cli/)
<!-- [![npm downloads][npm-downloads-src]][npm-downloads-href] -->
<!-- [![Codecov][codecov-src]][codecov-href] -->

# ts-rate-limiter

A high-performance, flexible rate limiting library for TypeScript and Bun.

## Features

- **Multiple Rate Limiting Algorithms**:
  - Fixed Window
  - Sliding Window
  - Token Bucket

- **Storage Providers**:
  - In-memory storage (default)
  - Redis storage

- **Performance Optimizations**:
  - Batch operations
  - LUA scripting for Redis
  - Automatic cleanup of expired records

- **Flexible Configuration**:
  - Custom key generators
  - Skip and handler functions
  - Draft mode (record but don't block)
  - Standard and legacy headers

## Installation

```bash
bun add ts-rate-limiter
```

## Basic Usage

```ts
import { RateLimiter } from 'ts-rate-limiter'

// Create a rate limiter with 100 requests per minute
const limiter = new RateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 100 // limit each IP to 100 requests per windowMs
})

// In your Bun server
const server = Bun.serve({
  port: 3000,
  async fetch(req) {
    // Use as middleware
    const limiterResponse = await limiter.middleware()(req)
    if (limiterResponse) {
      return limiterResponse
    }

    // Continue with your normal request handling
    return new Response('Hello World')
  }
})
```

## Configuration Options

```ts
// Create a rate limiter with more options
const limiter = new RateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 100, // limit each IP to 100 requests per windowMs
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  algorithm: 'sliding-window', // 'fixed-window', 'sliding-window', or 'token-bucket'

  // Skip certain requests
  skip: (request) => {
    return request.url.includes('/api/health')
  },

  // Custom handler for rate-limited requests
  handler: (request, result) => {
    return new Response('Too many requests, please try again later.', {
      status: 429,
      headers: {
        'Retry-After': Math.ceil(result.remaining / 1000).toString()
      }
    })
  },

  // Custom key generator
  keyGenerator: (request) => {
    // Use user ID if available, otherwise fall back to IP
    const userId = getUserIdFromRequest(request)
    return userId || request.headers.get('x-forwarded-for') || '127.0.0.1'
  },

  // Draft mode - don't actually block requests, just track them
  draftMode: process.env.NODE_ENV !== 'production'
})
```

## Using Redis Storage

```ts
import { RateLimiter, RedisStorage } from 'ts-rate-limiter'

// Create Redis client
const redis = createRedisClient() // Use your Redis client library

// Create Redis storage
const storage = new RedisStorage({
  client: redis,
  keyPrefix: 'ratelimit:',
  enableSlidingWindow: true
})

// Create rate limiter with Redis storage
const limiter = new RateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 100,
  storage
})
```

## Distributed Rate Limiting

For applications running on multiple servers, use Redis storage to ensure consistent rate limiting:

```ts
import { createClient } from 'redis'
import { RateLimiter, RedisStorage } from 'ts-rate-limiter'

// Create and connect Redis client
const redisClient = createClient({
  url: 'redis://redis-server:6379'
})
await redisClient.connect()

// Create Redis storage with sliding window for more accuracy
const storage = new RedisStorage({
  client: redisClient,
  keyPrefix: 'app:ratelimit:',
  enableSlidingWindow: true
})

// Create rate limiter with Redis storage
const limiter = new RateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 100,
  storage,
  algorithm: 'sliding-window'
})

// Make sure to handle Redis errors
redisClient.on('error', (err) => {
  console.error('Redis error:', err)
  // You might want to fall back to memory storage in case of Redis failure
})
```

## Best Practices

### Choosing the Right Algorithm

- **Fixed Window**: Simplest approach, best for non-critical rate limiting with good performance
- **Sliding Window**: More accurate, prevents traffic spikes at window boundaries
- **Token Bucket**: Best for APIs that need to allow occasional bursts of traffic

### Performance Considerations

- Use memory storage for single-instance applications
- Use Redis storage for distributed applications
- Enable automatic cleanup for long-running applications:

  ```ts
  const memoryStorage = new MemoryStorage({
    enableAutoCleanup: true,
    cleanupIntervalMs: 60000 // cleanup every minute
  })
  ```

- Use batch operations for bulk processing:

  ```ts
  // Process multiple keys at once
  const results = await storage.batchIncrement(['key1', 'key2', 'key3'], windowMs)
  ```

### Rate Limiting by User or IP

By default, the rate limiter uses IP addresses. For user-based rate limiting:

```ts
const userRateLimiter = new RateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 100,
  keyGenerator: (request) => {
    // Extract user ID from auth token, session, etc.
    const userId = getUserIdFromRequest(request)
    if (!userId) {
      throw new Error('User not authenticated')
    }
    return `user:${userId}`
  },
  skipFailedRequests: true // Allow unauthenticated requests to bypass rate limiting
})
```

## Benchmarks

Performance comparison of different algorithms and storage providers:

| Algorithm | Storage | Requests/sec | Latency (avg) |
|-----------|---------|--------------|---------------|
| Fixed Window | Memory | 2,742,597 | 0.000365ms |
| Sliding Window | Memory | 10,287 | 0.097203ms |
| Token Bucket | Memory | 5,079,977 | 0.000197ms |
| Fixed Window | Redis | 10,495 | 0.095277ms |
| Sliding Window | Redis | 1,843 | 0.542406ms |
| Token Bucket | Redis | 4,194,263 | 0.000238ms |

*Benchmarked on Bun v1.2.9, MacBook Pro M3, 100,000 requests per test for Memory, 10,000 requests per test for Redis. All tests performed with Redis running locally.*

## Algorithms

### Fixed Window

The traditional rate limiting approach that counts requests in a fixed time window.

### Sliding Window

More accurate limiting by considering the distribution of requests within the window.

### Token Bucket

Offers a smoother rate limiting experience by focusing on request rates rather than fixed counts.

## Testing

```bash
bun test
```

## Changelog

Please see our [releases](https://github.com/stackjs/ts-rate-limiter/releases) page for more information on what has changed recently.

## Contributing

Please see [CONTRIBUTING](.github/CONTRIBUTING.md) for details.

## Community

For help, discussion about best practices, or any other conversation that would benefit from being searchable:

[Discussions on GitHub](https://github.com/stacksjs/ts-rate-limiter/discussions)

For casual chit-chat with others using this package:

[Join the Stacks Discord Server](https://discord.gg/stacksjs)

## Postcardware

"Software that is free, but hopes for a postcard." We love receiving postcards from around the world showing where Stacks is being used! We showcase them on our website too.

Our address: Stacks.js, 12665 Village Ln #2306, Playa Vista, CA 90094, United States 🌎

## Sponsors

We would like to extend our thanks to the following sponsors for funding Stacks development. If you are interested in becoming a sponsor, please reach out to us.

- [JetBrains](https://www.jetbrains.com/)
- [The Solana Foundation](https://solana.com/)

## License

The MIT License (MIT). Please see [LICENSE](LICENSE.md) for more information.

Made with 💙

<!-- Badges -->
[npm-version-src]: https://img.shields.io/npm/v/ts-rate-limiter?style=flat-square
[npm-version-href]: https://npmjs.com/package/ts-rate-limiter
[github-actions-src]: https://img.shields.io/github/actions/workflow/status/stacksjs/ts-rate-limiter/ci.yml?style=flat-square&branch=main
[github-actions-href]: https://github.com/stacksjs/ts-rate-limiter/actions?query=workflow%3Aci

<!-- [codecov-src]: https://img.shields.io/codecov/c/gh/stacksjs/ts-rate-limiter/main?style=flat-square
[codecov-href]: https://codecov.io/gh/stacksjs/ts-rate-limiter -->
