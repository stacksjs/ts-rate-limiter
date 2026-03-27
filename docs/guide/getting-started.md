# Getting Started

ts-rate-limiter is a high-performance, flexible rate limiting library for TypeScript and Bun. It provides multiple algorithms, storage providers, and configuration options for protecting your APIs from abuse.

## Features

- **Multiple Algorithms** - Fixed window, sliding window, and token bucket
- **Storage Providers** - In-memory (default) and Redis
- **Performance Optimized** - Batch operations, automatic cleanup
- **Flexible Configuration** - Custom key generators, skip functions, handlers
- **Standard Headers** - RFC-compliant rate limit headers
- **Draft Mode** - Test rate limiting without blocking

## Installation

```bash
# Using bun
bun add ts-rate-limiter

# Using npm
npm install ts-rate-limiter

# Using pnpm
pnpm add ts-rate-limiter

# Using yarn
yarn add ts-rate-limiter
```

## Quick Start

### Basic Usage

```typescript
import { RateLimiter } from 'ts-rate-limiter'

// Create a rate limiter: 100 requests per minute
const limiter = new RateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 100
})

// Check if request is allowed
const result = await limiter.check(request)

if (result.allowed) {
  // Process the request
  handleRequest(request)
} else {
  // Rate limited
  return new Response('Too Many Requests', { status: 429 })
}
```

### With Bun Server

```typescript
import { RateLimiter } from 'ts-rate-limiter'

const limiter = new RateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 100
})

Bun.serve({
  port: 3000,
  async fetch(req) {
    // Use as middleware
    const limiterResponse = await limiter.middleware()(req)
    if (limiterResponse) {
      return limiterResponse
    }

    // Continue with normal request handling
    return new Response('Hello World')
  }
})
```

## Configuration Options

```typescript
const limiter = new RateLimiter({
  // Time window in milliseconds
  windowMs: 60 * 1000,

  // Maximum requests per window
  maxRequests: 100,

  // Rate limiting algorithm
  algorithm: 'fixed-window', // 'fixed-window' | 'sliding-window' | 'token-bucket'

  // Include standard headers (RateLimit-*)
  standardHeaders: true,

  // Include legacy headers (X-RateLimit-*)
  legacyHeaders: true,

  // Custom key generator (default: IP address)
  keyGenerator: (request) => {
    const userId = getUserFromRequest(request)
    return userId || getIPAddress(request)
  },

  // Skip rate limiting for certain requests
  skip: (request) => {
    return request.url.includes('/health')
  },

  // Custom handler for rate limited requests
  handler: (request, result) => {
    return new Response(JSON.stringify({
      error: 'Too many requests',
      retryAfter: Math.ceil(result.remaining / 1000)
    }), {
      status: 429,
      headers: { 'Content-Type': 'application/json' }
    })
  },

  // Allow requests even if rate limiting fails
  skipFailedRequests: false,

  // Track but don't block (useful for testing)
  draftMode: false
})
```

## Rate Limit Result

The `check()` method returns a result object:

```typescript
interface RateLimitResult {
  allowed: boolean     // Whether the request is allowed
  current: number      // Current request count in window
  limit: number        // Maximum requests allowed
  remaining: number    // Time until window resets (ms)
  resetTime: number    // Timestamp when window resets
}
```

```typescript
const result = await limiter.check(request)

if (result.allowed) {
  console.log(`Request allowed. ${result.limit - result.current} remaining.`)
} else {
  console.log(`Rate limited. Retry in ${Math.ceil(result.remaining / 1000)}s`)
}
```

## Response Headers

When rate limiting is applied, these headers are included:

### Standard Headers (RFC Draft)

```
RateLimit-Limit: 100
RateLimit-Remaining: 42
RateLimit-Reset: 1234567890
```

### Legacy Headers

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 42
X-RateLimit-Reset: 1234567890
Retry-After: 30
```

## Key Generation

By default, rate limiting is applied per IP address. Customize with `keyGenerator`:

```typescript
// By IP address (default)
const limiter = new RateLimiter({
  keyGenerator: (request) => {
    return request.headers.get('x-forwarded-for')
      || request.headers.get('x-real-ip')
      || '127.0.0.1'
  }
})

// By user ID
const limiter = new RateLimiter({
  keyGenerator: async (request) => {
    const user = await getUserFromToken(request)
    return user ? `user:${user.id}` : getIPAddress(request)
  }
})

// By API key
const limiter = new RateLimiter({
  keyGenerator: (request) => {
    const apiKey = request.headers.get('x-api-key')
    return apiKey ? `api:${apiKey}` : 'anonymous'
  }
})

// By endpoint
const limiter = new RateLimiter({
  keyGenerator: (request) => {
    const ip = getIPAddress(request)
    const path = new URL(request.url).pathname
    return `${ip}:${path}`
  }
})
```

## Skipping Requests

Bypass rate limiting for certain requests:

```typescript
const limiter = new RateLimiter({
  skip: async (request) => {
    // Skip health checks
    if (request.url.includes('/health')) {
      return true
    }

    // Skip authenticated admins
    const user = await getUser(request)
    if (user?.role === 'admin') {
      return true
    }

    // Skip internal IPs
    const ip = getIPAddress(request)
    if (ip.startsWith('10.') || ip.startsWith('192.168.')) {
      return true
    }

    return false
  }
})
```

## Custom Handlers

Customize the rate limit response:

```typescript
const limiter = new RateLimiter({
  handler: (request, result) => {
    return new Response(JSON.stringify({
      error: 'Rate limit exceeded',
      message: 'Too many requests, please try again later',
      retryAfter: Math.ceil(result.remaining / 1000),
      limit: result.limit,
      current: result.current
    }), {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': Math.ceil(result.remaining / 1000).toString()
      }
    })
  }
})
```

## Draft Mode

Test rate limiting without blocking requests:

```typescript
const limiter = new RateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 100,
  draftMode: process.env.NODE_ENV !== 'production'
})

// In draft mode:
// - Requests are counted
// - result.allowed is always true
// - Headers are still added
// - Useful for testing and monitoring
```

## Manual Operations

### Consume Tokens

```typescript
// Consume a token for a specific key
const result = await limiter.consume('user:123')
```

### Reset Counter

```typescript
// Reset counter for a specific key
await limiter.reset('user:123')

// Reset all counters
await limiter.resetAll()
```

### Cleanup

```typescript
// Dispose of the rate limiter
limiter.dispose()
```

## Multiple Rate Limiters

Apply different limits to different endpoints:

```typescript
// Strict limit for auth endpoints
const authLimiter = new RateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 5 // 5 attempts per minute
})

// Standard limit for API
const apiLimiter = new RateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 100
})

// Generous limit for static assets
const staticLimiter = new RateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 1000
})

Bun.serve({
  async fetch(req) {
    const path = new URL(req.url).pathname

    // Apply appropriate limiter
    let limiter = apiLimiter
    if (path.startsWith('/auth')) {
      limiter = authLimiter
    } else if (path.startsWith('/static')) {
      limiter = staticLimiter
    }

    const response = await limiter.middleware()(req)
    if (response) return response

    // Handle request
    return handleRequest(req)
  }
})
```

## Performance Considerations

### Memory Storage

Suitable for single-instance deployments:

```typescript
import { MemoryStorage } from 'ts-rate-limiter'

const storage = new MemoryStorage({
  enableAutoCleanup: true,
  cleanupIntervalMs: 60000 // 1 minute
})

const limiter = new RateLimiter({
  storage,
  windowMs: 60 * 1000,
  maxRequests: 100
})
```

### Redis Storage

Required for distributed deployments:

```typescript
import { RateLimiter, RedisStorage } from 'ts-rate-limiter'
import { createClient } from 'redis'

const redis = createClient({ url: 'redis://localhost:6379' })
await redis.connect()

const storage = new RedisStorage({
  client: redis,
  keyPrefix: 'ratelimit:',
  enableSlidingWindow: true
})

const limiter = new RateLimiter({
  storage,
  windowMs: 60 * 1000,
  maxRequests: 100,
  algorithm: 'sliding-window'
})
```

## Benchmarks

Performance comparison (local benchmarks):

| Algorithm | Storage | Requests/sec | Latency (avg) |
|-----------|---------|--------------|---------------|
| Fixed Window | Memory | 2,742,597 | 0.000365ms |
| Sliding Window | Memory | 10,287 | 0.097203ms |
| Token Bucket | Memory | 5,079,977 | 0.000197ms |
| Fixed Window | Redis | 10,495 | 0.095277ms |
| Sliding Window | Redis | 1,843 | 0.542406ms |

## Next Steps

- [Algorithms](/guide/algorithms) - Learn about different rate limiting algorithms
- [Middleware & Integration](/guide/middleware) - Framework integrations and patterns
