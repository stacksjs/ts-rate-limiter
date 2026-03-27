# Middleware & Integration

This guide covers integrating ts-rate-limiter with various frameworks and common patterns.

## Built-in Middleware

### Using the Middleware

```typescript
import { RateLimiter } from 'ts-rate-limiter'

const limiter = new RateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 100
})

// Get middleware function
const middleware = limiter.middleware()

// Use in request handling
Bun.serve({
  async fetch(req) {
    const response = await middleware(req)
    if (response) {
      return response // Rate limited
    }

    // Continue with request handling
    return handleRequest(req)
  }
})
```

### Middleware Behavior

The middleware function:
- Returns `null` if request is allowed
- Returns `Response` (429) if rate limited
- Adds rate limit headers to the response

## Bun Server Integration

### Basic Integration

```typescript
import { RateLimiter } from 'ts-rate-limiter'

const limiter = new RateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 100
})

Bun.serve({
  port: 3000,
  async fetch(req) {
    // Check rate limit
    const result = await limiter.check(req)

    if (!result.allowed) {
      return new Response('Too Many Requests', {
        status: 429,
        headers: {
          'Retry-After': Math.ceil(result.remaining / 1000).toString(),
          'RateLimit-Limit': result.limit.toString(),
          'RateLimit-Remaining': Math.max(0, result.limit - result.current).toString(),
          'RateLimit-Reset': Math.ceil(result.resetTime / 1000).toString()
        }
      })
    }

    // Handle request
    return new Response('Hello World')
  }
})
```

### With Route Handling

```typescript
import { RateLimiter } from 'ts-rate-limiter'

// Different limiters for different routes
const limiters = {
  auth: new RateLimiter({ windowMs: 60000, maxRequests: 5 }),
  api: new RateLimiter({ windowMs: 60000, maxRequests: 100 }),
  public: new RateLimiter({ windowMs: 60000, maxRequests: 1000 })
}

Bun.serve({
  async fetch(req) {
    const url = new URL(req.url)

    // Select limiter based on route
    let limiter = limiters.public
    if (url.pathname.startsWith('/auth')) {
      limiter = limiters.auth
    } else if (url.pathname.startsWith('/api')) {
      limiter = limiters.api
    }

    // Apply rate limiting
    const response = await limiter.middleware()(req)
    if (response) return response

    // Route handling
    if (url.pathname.startsWith('/auth')) {
      return handleAuth(req)
    } else if (url.pathname.startsWith('/api')) {
      return handleApi(req)
    }

    return new Response('Not Found', { status: 404 })
  }
})
```

## Express-like Integration

### Creating Express Middleware

```typescript
import { RateLimiter } from 'ts-rate-limiter'

const limiter = new RateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 100
})

// Express-style middleware
function rateLimitMiddleware(req: Request, res: Response, next: Function) {
  limiter.check(req).then(result => {
    // Add headers
    res.setHeader('RateLimit-Limit', result.limit.toString())
    res.setHeader('RateLimit-Remaining', Math.max(0, result.limit - result.current).toString())
    res.setHeader('RateLimit-Reset', Math.ceil(result.resetTime / 1000).toString())

    if (!result.allowed) {
      res.status(429).json({
        error: 'Too many requests',
        retryAfter: Math.ceil(result.remaining / 1000)
      })
      return
    }

    next()
  })
}

// Usage with Express
app.use('/api', rateLimitMiddleware)
```

## Hono Integration

```typescript
import { Hono } from 'hono'
import { RateLimiter } from 'ts-rate-limiter'

const app = new Hono()

const limiter = new RateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 100
})

// Hono middleware
app.use('*', async (c, next) => {
  const result = await limiter.check(c.req.raw)

  c.header('RateLimit-Limit', result.limit.toString())
  c.header('RateLimit-Remaining', Math.max(0, result.limit - result.current).toString())
  c.header('RateLimit-Reset', Math.ceil(result.resetTime / 1000).toString())

  if (!result.allowed) {
    c.header('Retry-After', Math.ceil(result.remaining / 1000).toString())
    return c.json({
      error: 'Too many requests',
      retryAfter: Math.ceil(result.remaining / 1000)
    }, 429)
  }

  await next()
})

app.get('/', (c) => c.text('Hello World'))

export default app
```

## Elysia Integration

```typescript
import { Elysia } from 'elysia'
import { RateLimiter } from 'ts-rate-limiter'

const limiter = new RateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 100
})

const app = new Elysia()
  .derive(async ({ request }) => {
    const result = await limiter.check(request)
    return { rateLimit: result }
  })
  .onBeforeHandle(({ rateLimit, set }) => {
    set.headers['RateLimit-Limit'] = rateLimit.limit.toString()
    set.headers['RateLimit-Remaining'] = Math.max(0, rateLimit.limit - rateLimit.current).toString()

    if (!rateLimit.allowed) {
      set.status = 429
      return {
        error: 'Too many requests',
        retryAfter: Math.ceil(rateLimit.remaining / 1000)
      }
    }
  })
  .get('/', () => 'Hello World')
  .listen(3000)
```

## Common Patterns

### Rate Limit by User

```typescript
const userLimiter = new RateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 100,
  keyGenerator: async (request) => {
    // Extract user from JWT
    const token = request.headers.get('Authorization')?.split(' ')[1]
    if (token) {
      const payload = await verifyJWT(token)
      return `user:${payload.sub}`
    }
    // Fall back to IP for unauthenticated requests
    return getIP(request)
  }
})
```

### Tiered Rate Limits

```typescript
// Different limits based on subscription tier
const tierLimits = {
  free: 100,
  pro: 1000,
  enterprise: 10000
}

const limiter = new RateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 100, // Default for unknown users
  keyGenerator: async (request) => {
    const user = await getUser(request)
    return user ? `user:${user.id}` : getIP(request)
  },
  skip: async (request) => {
    const user = await getUser(request)
    if (!user) return false

    // Custom rate checking based on tier
    const key = `user:${user.id}`
    const count = await getRequestCount(key)
    const limit = tierLimits[user.tier] || tierLimits.free

    return count < limit
  }
})
```

### Rate Limit by API Key

```typescript
const apiKeyLimiter = new RateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 100,
  keyGenerator: (request) => {
    const apiKey = request.headers.get('X-API-Key')
    if (apiKey) {
      return `api:${apiKey}`
    }
    // Stricter limit for requests without API key
    return `nokey:${getIP(request)}`
  }
})
```

### Sliding Window for Sensitive Endpoints

```typescript
// Sensitive endpoints get stricter, more accurate limiting
const sensitiveEndpoints = ['/api/auth', '/api/payments', '/api/admin']

const standardLimiter = new RateLimiter({
  algorithm: 'fixed-window',
  windowMs: 60 * 1000,
  maxRequests: 100
})

const sensitiveLimiter = new RateLimiter({
  algorithm: 'sliding-window',
  windowMs: 60 * 1000,
  maxRequests: 10
})

async function rateLimitMiddleware(request: Request) {
  const path = new URL(request.url).pathname
  const limiter = sensitiveEndpoints.some(e => path.startsWith(e))
    ? sensitiveLimiter
    : standardLimiter

  return limiter.middleware()(request)
}
```

### Distributed Rate Limiting with Redis

```typescript
import { RateLimiter, RedisStorage } from 'ts-rate-limiter'
import { createClient } from 'redis'

// Create Redis connection
const redis = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
})
await redis.connect()

// Handle connection errors
redis.on('error', (err) => {
  console.error('Redis error:', err)
})

// Create storage with sliding window support
const storage = new RedisStorage({
  client: redis,
  keyPrefix: 'ratelimit:',
  enableSlidingWindow: true
})

// Create distributed rate limiter
const limiter = new RateLimiter({
  storage,
  algorithm: 'sliding-window',
  windowMs: 60 * 1000,
  maxRequests: 100
})

// Graceful shutdown
process.on('SIGTERM', async () => {
  limiter.dispose()
  await redis.quit()
  process.exit(0)
})
```

### Fail-Open Pattern

```typescript
const limiter = new RateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 100,
  skipFailedRequests: true // Allow if rate limiting fails
})

// Or handle manually
async function safeRateLimit(request: Request) {
  try {
    const result = await limiter.check(request)
    return result
  } catch (error) {
    console.error('Rate limit check failed:', error)
    // Fail open - allow the request
    return {
      allowed: true,
      current: 0,
      limit: 100,
      remaining: 60000,
      resetTime: Date.now() + 60000
    }
  }
}
```

### Circuit Breaker Pattern

```typescript
class CircuitBreaker {
  private failures = 0
  private lastFailure: number | null = null
  private isOpen = false

  constructor(
    private threshold: number = 5,
    private resetTimeMs: number = 30000
  ) {}

  async execute<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
    // Check if circuit should be reset
    if (this.isOpen && this.lastFailure) {
      if (Date.now() - this.lastFailure > this.resetTimeMs) {
        this.isOpen = false
        this.failures = 0
      }
    }

    // Circuit is open - use fallback
    if (this.isOpen) {
      return fallback
    }

    try {
      const result = await fn()
      this.failures = 0
      return result
    } catch (error) {
      this.failures++
      this.lastFailure = Date.now()

      if (this.failures >= this.threshold) {
        this.isOpen = true
      }

      return fallback
    }
  }
}

const breaker = new CircuitBreaker(5, 30000)

async function rateLimitWithBreaker(request: Request) {
  return breaker.execute(
    () => limiter.check(request),
    { allowed: true, current: 0, limit: 100, remaining: 60000, resetTime: Date.now() + 60000 }
  )
}
```

### Webhook Rate Limiting

```typescript
// Rate limit incoming webhooks by source
const webhookLimiter = new RateLimiter({
  algorithm: 'token-bucket', // Allow bursts
  windowMs: 60 * 1000,
  maxRequests: 1000,
  keyGenerator: (request) => {
    // Key by webhook source
    const source = request.headers.get('X-Webhook-Source')
    return source ? `webhook:${source}` : `webhook:unknown`
  }
})

// Additional per-event-type limiting
const eventLimiter = new RateLimiter({
  algorithm: 'fixed-window',
  windowMs: 60 * 1000,
  maxRequests: 100,
  keyGenerator: (request) => {
    const source = request.headers.get('X-Webhook-Source') || 'unknown'
    const event = request.headers.get('X-Webhook-Event') || 'unknown'
    return `webhook:${source}:${event}`
  }
})

async function handleWebhook(request: Request) {
  // Check global rate limit
  const globalResult = await webhookLimiter.check(request)
  if (!globalResult.allowed) {
    return new Response('Rate limited', { status: 429 })
  }

  // Check per-event rate limit
  const eventResult = await eventLimiter.check(request)
  if (!eventResult.allowed) {
    return new Response('Too many events of this type', { status: 429 })
  }

  // Process webhook
  return processWebhook(request)
}
```

## Testing Rate Limits

### Unit Testing

```typescript
import { RateLimiter, MemoryStorage } from 'ts-rate-limiter'

describe('Rate Limiter', () => {
  let limiter: RateLimiter

  beforeEach(() => {
    limiter = new RateLimiter({
      storage: new MemoryStorage(),
      windowMs: 1000,
      maxRequests: 5
    })
  })

  afterEach(() => {
    limiter.dispose()
  })

  test('allows requests under limit', async () => {
    const request = new Request('http://localhost/')

    for (let i = 0; i < 5; i++) {
      const result = await limiter.check(request)
      expect(result.allowed).toBe(true)
    }
  })

  test('blocks requests over limit', async () => {
    const request = new Request('http://localhost/')

    // Use up the limit
    for (let i = 0; i < 5; i++) {
      await limiter.check(request)
    }

    // This should be blocked
    const result = await limiter.check(request)
    expect(result.allowed).toBe(false)
  })

  test('resets after window', async () => {
    const request = new Request('http://localhost/')

    // Use up the limit
    for (let i = 0; i < 5; i++) {
      await limiter.check(request)
    }

    // Wait for window to expire
    await new Promise(resolve => setTimeout(resolve, 1100))

    // Should be allowed again
    const result = await limiter.check(request)
    expect(result.allowed).toBe(true)
  })
})
```

### Load Testing

```typescript
import { RateLimiter } from 'ts-rate-limiter'

async function loadTest() {
  const limiter = new RateLimiter({
    windowMs: 60 * 1000,
    maxRequests: 1000
  })

  const request = new Request('http://localhost/')
  const iterations = 10000
  const start = performance.now()

  let allowed = 0
  let blocked = 0

  for (let i = 0; i < iterations; i++) {
    const result = await limiter.check(request)
    if (result.allowed) allowed++
    else blocked++
  }

  const duration = performance.now() - start

  console.log(`Total: ${iterations} requests in ${duration.toFixed(2)}ms`)
  console.log(`Rate: ${(iterations / duration * 1000).toFixed(0)} req/s`)
  console.log(`Allowed: ${allowed}, Blocked: ${blocked}`)

  limiter.dispose()
}
```

## Best Practices

1. **Choose the right algorithm** - Use fixed window for simplicity, sliding window for accuracy, token bucket for burst tolerance

2. **Use Redis for distributed systems** - Memory storage doesn't work across multiple instances

3. **Set appropriate limits** - Too strict frustrates users, too lenient doesn't protect

4. **Provide helpful error responses** - Include Retry-After and explain the limit

5. **Monitor rate limiting** - Track hit rates and adjust limits based on data

6. **Handle failures gracefully** - Use skipFailedRequests or circuit breakers

7. **Test thoroughly** - Verify behavior at and around limits
