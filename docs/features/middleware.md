# Middleware Usage

`ts-rate-limiter` provides middleware integrations with popular Node.js web frameworks and platforms. This simplifies implementation and ensures consistent rate limiting behavior across different frameworks.

## Bun Server Middleware

### Basic Integration

```ts
import { Bun } from 'bun'
import { RateLimiter } from 'ts-rate-limiter'

const limiter = new RateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 100,
})

Bun.serve({
  port: 3000,
  async fetch(req) {
    // Apply rate limiting
    const rateLimitResult = await limiter.middleware(req)

    // Check if rate limit was exceeded
    if (rateLimitResult.limited) {
      return new Response('Too Many Requests', {
        status: 429,
        headers: rateLimitResult.headers,
      })
    }

    // Continue with your route logic
    return new Response('Hello World', {
      headers: rateLimitResult.headers,
    })
  },
})

console.log('Server running at http://localhost:3000')
```

### Custom Route Integration

```ts
import { Bun } from 'bun'
import { RateLimiter } from 'ts-rate-limiter'

// Create different rate limiters for different routes
const apiLimiter = new RateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 100,
})

const loginLimiter = new RateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 5, // 5 login attempts
})

Bun.serve({
  port: 3000,
  async fetch(req) {
    const url = new URL(req.url)

    // Apply different rate limiters based on path
    if (url.pathname.startsWith('/api/')) {
      const result = await apiLimiter.middleware(req)
      if (result.limited) {
        return new Response('API rate limit exceeded', {
          status: 429,
          headers: result.headers,
        })
      }
    }

    if (url.pathname === '/login') {
      const result = await loginLimiter.middleware(req)
      if (result.limited) {
        return new Response('Too many login attempts, please try again later', {
          status: 429,
          headers: result.headers,
        })
      }
    }

    // Process regular request
    return new Response('Hello World')
  },
})
```

## Express Middleware

### Basic Integration

```ts
import express from 'express'
import { RateLimiter } from 'ts-rate-limiter'

const app = express()
const port = 3000

const limiter = new RateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 100,
})

// Apply the rate limiter to all requests
app.use(async (req, res, next) => {
  const result = await limiter.middleware(req)

  // Add the headers to the response
  Object.entries(result.headers).forEach(([key, value]) => {
    res.setHeader(key, value)
  })

  if (result.limited) {
    return res.status(429).send('Too Many Requests')
  }

  next()
})

app.get('/', (req, res) => {
  res.send('Hello World!')
})

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`)
})
```

### Route-Specific Middleware

```ts
import express from 'express'
import { RateLimiter } from 'ts-rate-limiter'

const app = express()
const port = 3000

// Create different rate limiters
const apiLimiter = new RateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 100,
})

const loginLimiter = new RateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 5, // 5 login attempts
})

// Middleware factory function
function createRateLimiterMiddleware(limiter) {
  return async (req, res, next) => {
    const result = await limiter.middleware(req)

    // Add headers to response
    Object.entries(result.headers).forEach(([key, value]) => {
      res.setHeader(key, value)
    })

    if (result.limited) {
      return res.status(429).send('Too Many Requests')
    }

    next()
  }
}

// Apply limiters to specific routes
app.use('/api', createRateLimiterMiddleware(apiLimiter))
app.use('/login', createRateLimiterMiddleware(loginLimiter))

app.get('/', (req, res) => {
  res.send('Hello World!')
})

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`)
})
```

## Fastify Plugin

```ts
import fastify from 'fastify'
import { RateLimiter } from 'ts-rate-limiter'

const app = fastify()
const limiter = new RateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 100,
})

// Register a global hook for rate limiting
app.addHook('onRequest', async (request, reply) => {
  const result = await limiter.middleware(request.raw)

  // Add the headers to the response
  Object.entries(result.headers).forEach(([key, value]) => {
    reply.header(key, value)
  })

  if (result.limited) {
    reply.code(429).send('Too Many Requests')
    return reply
  }
})

app.get('/', async () => {
  return { hello: 'world' }
})

async function start() {
  try {
    await app.listen({ port: 3000 })
    console.log('Server running at http://localhost:3000')
  }
  catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

start()
```

## Koa Middleware

```ts
import Koa from 'koa'
import { RateLimiter } from 'ts-rate-limiter'

const app = new Koa()
const limiter = new RateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 100,
})

// Apply rate limiting middleware
app.use(async (ctx, next) => {
  const result = await limiter.middleware(ctx.req)

  // Add headers to response
  Object.entries(result.headers).forEach(([key, value]) => {
    ctx.set(key, value)
  })

  if (result.limited) {
    ctx.status = 429
    ctx.body = 'Too Many Requests'
    return
  }

  await next()
})

app.use(async (ctx) => {
  ctx.body = 'Hello World'
})

app.listen(3000, () => {
  console.log('Server running at http://localhost:3000')
})
```

## Custom Framework Integration

You can integrate the rate limiter with any framework by:

1. Creating the rate limiter instance
2. Extract the client identifier from the request
3. Check if the client has exceeded limits
4. Apply the appropriate headers
5. Return a 429 status if limited

```ts
import { RateLimiter } from 'ts-rate-limiter'
import { YourCustomFramework } from 'your-framework'

const limiter = new RateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 100,
})

function createMiddleware() {
  return async (request, response) => {
    // Extract IP address or custom key
    const key = request.ip || 'default'

    // Check rate limit
    const result = await limiter.check(key)

    // Apply headers
    Object.entries(result.headers).forEach(([key, value]) => {
      response.setHeader(key, value)
    })

    // Handle rate limit exceeded
    if (result.limited) {
      response.status = 429
      response.body = 'Too Many Requests'
      return response
    }

    // Continue processing
    return null
  }
}

// Register with your framework
YourCustomFramework.use(createMiddleware())
```

## Serverless Integration

For serverless environments like AWS Lambda or Vercel Functions, you'll need to use a distributed storage option like Redis.

```ts
import { createClient } from 'redis'
import { RateLimiter, RedisStorage } from 'ts-rate-limiter'

// Create a Redis client
const redisClient = createClient({
  url: process.env.REDIS_URL,
})

// Connect to Redis
await redisClient.connect()

// Create rate limiter with Redis storage
const limiter = new RateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 100,
  storage: new RedisStorage(redisClient),
})

// Lambda handler
export async function handler(event, context) {
  // Check rate limit
  const result = await limiter.middleware(event)

  // If limited, return 429 response
  if (result.limited) {
    return {
      statusCode: 429,
      headers: result.headers,
      body: JSON.stringify({ message: 'Too Many Requests' }),
    }
  }

  // Process request normally
  return {
    statusCode: 200,
    headers: result.headers,
    body: JSON.stringify({ message: 'Hello World' }),
  }
}
```

## Best Practices

1. **Apply Early**: Place rate limiting middleware as early as possible in the request pipeline
2. **Route-Specific Limits**: Use different limiters for different routes based on sensitivity
3. **Distributed Storage**: Use Redis storage for multi-instance deployments
4. **Informative Responses**: Provide clear feedback when users hit rate limits
5. **Graceful Degradation**: Consider implementing fallback behaviors when rate limits are reached
