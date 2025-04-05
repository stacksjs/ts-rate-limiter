# Best Practices

This page provides recommended best practices for implementing rate limiting in your applications using TypeScript Rate Limiter.

## General Guidelines

### 1. Choose the Right Algorithm

Select a rate limiting algorithm that matches your requirements:

- **Fixed Window**: Simple and efficient; best for most APIs
- **Sliding Window**: More accurate limiting, but higher computational cost
- **Token Bucket**: Best for APIs that need to allow bursts while maintaining average rate

```typescript
// Fixed Window - Good default choice
const limiter = new RateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 100,
})

// Sliding Window - Better accuracy
const slidingLimiter = new RateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 100,
  algorithm: 'sliding',
})

// Token Bucket - Allow bursts
const tokenLimiter = new RateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 100,
  algorithm: 'token',
  tokensPerSecond: 2,
  bucketSize: 20,
})
```

### 2. Apply Rate Limiting Early

Place rate limiting middleware as early as possible in your request pipeline, ideally before any heavy processing:

```typescript
import express from 'express'
import { RateLimiter } from 'ts-rate-limiter'

const app = express()

// Apply rate limiting before other middleware
app.use(rateLimitingMiddleware)

// Other middleware comes after
app.use(bodyParser.json())
app.use(authentication)
app.use(logging)

// Route handlers
app.get('/api/data', dataHandler)
```

### 3. Use Distributed Storage for Multi-Instance Applications

When running multiple instances of your application, use Redis or another distributed storage option:

```typescript
import { createClient } from 'redis'
import { RateLimiter, RedisStorage } from 'ts-rate-limiter'

// Initialize Redis client
const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379',
})

await redisClient.connect()

// Create rate limiter with Redis storage
const limiter = new RateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 100,
  storage: new RedisStorage(redisClient),
})
```

### 4. Implement Graceful Degradation

Don't crash your application if the rate limiter's storage service (like Redis) is unavailable:

```typescript
import { MemoryStorage, RateLimiter, RedisStorage } from 'ts-rate-limiter'

// Create storage providers
const redisStorage = new RedisStorage(redisClient)
const fallbackStorage = new MemoryStorage()

let storage = redisStorage

// Detect Redis connection issues
redisClient.on('error', (err) => {
  console.error('Redis error, falling back to memory storage:', err)
  storage = fallbackStorage
})

// Check for Redis reconnect
redisClient.on('connect', () => {
  console.log('Redis reconnected, switching back to Redis storage')
  storage = redisStorage
})

// Create rate limiter with dynamic storage
function getRateLimiter() {
  return new RateLimiter({
    windowMs: 60 * 1000,
    maxRequests: 100,
    storage,
  })
}

// In your middleware
app.use(async (req, res, next) => {
  try {
    const limiter = getRateLimiter()
    const result = await limiter.middleware(req)

    // Add headers and check limits
    // ...
  }
  catch (error) {
    // Log error but don't block the request on rate limiter failure
    console.error('Rate limiting failed:', error)
    next()
  }
})
```

## Performance Optimization

### 1. Cache Key Generation

Cache complex key generation logic to reduce overhead:

```typescript
import LRU from 'lru-cache'
import { RateLimiter } from 'ts-rate-limiter'

// Cache for user identifiers
const userIdCache = new LRU({ max: 10000, maxAge: 60 * 60 * 1000 }) // 1 hour cache

const limiter = new RateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 100,
  keyGenerator: (req) => {
    // Use the request auth token as the cache key
    const token = req.headers.authorization

    if (!token)
      return req.ip

    // Check if we already have the user ID for this token
    let userId = userIdCache.get(token)

    if (!userId) {
      // Expensive operation to extract user ID from token
      userId = extractUserIdFromToken(token)
      userIdCache.set(token, userId)
    }

    return userId
  },
})
```

### 2. Skip Unnecessary Rate Limiting

Use the `skip` option to bypass rate limiting for certain requests:

```typescript
import { RateLimiter } from 'ts-rate-limiter'

const limiter = new RateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 100,
  skip: (req) => {
    // Skip rate limiting for health checks
    if (req.path === '/health' || req.path === '/readiness') {
      return true
    }

    // Skip for certain trusted IP addresses
    if (req.ip === '192.168.1.100') {
      return true
    }

    // Don't skip for everyone else
    return false
  },
})
```

### 3. Batch Storage Operations

When possible, batch storage operations to reduce overhead:

```typescript
// For a custom storage implementation
class BatchingStorage {
  private pendingIncrements = new Map<string, number>()
  private flushInterval: NodeJS.Timeout

  constructor(private backend: Storage, flushIntervalMs = 1000) {
    this.flushInterval = setInterval(() => this.flush(), flushIntervalMs)
  }

  async increment(key: string, windowMs: number): Promise<RateLimitInfo> {
    // Increment pending count
    const currentCount = this.pendingIncrements.get(key) || 0
    this.pendingIncrements.set(key, currentCount + 1)

    // Still need to get current state from backend
    return this.backend.increment(key, windowMs)
  }

  private async flush() {
    // Process all pending increments
    for (const [key, count] of this.pendingIncrements.entries()) {
      // Bulk update the backend storage
      await this.backend.bulkIncrement(key, count)
    }

    this.pendingIncrements.clear()
  }

  // Other required methods...
}
```

## Security Considerations

### 1. Avoid Rate Limiter Bypass

Ensure your key generation is robust against spoofing:

```typescript
import { RateLimiter } from 'ts-rate-limiter'

const limiter = new RateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 100,
  keyGenerator: (req) => {
    // Check for trusted proxy configuration
    const ip = req.headers['x-forwarded-for']
      ? req.headers['x-forwarded-for'].split(',')[0].trim()
      : (req.socket.remoteAddress || '0.0.0.0')

    // Combine with user agent to prevent single IP from creating multiple identities
    return `${ip}:${req.headers['user-agent'] || 'unknown'}`
  },
})
```

### 2. Use HMAC for API Keys

For API key authentication, use HMAC to generate unique signatures:

```typescript
import crypto from 'node:crypto'
import { RateLimiter } from 'ts-rate-limiter'

function generateHmacSignature(apiKey: string, timestamp: string, secret: string) {
  return crypto
    .createHmac('sha256', secret)
    .update(`${apiKey}:${timestamp}`)
    .digest('hex')
}

// Verify the request has a valid signature
app.use((req, res, next) => {
  const apiKey = req.headers['x-api-key'] as string
  const timestamp = req.headers['x-timestamp'] as string
  const signature = req.headers['x-signature'] as string

  if (!apiKey || !timestamp || !signature) {
    return res.status(401).json({ error: 'Missing authentication parameters' })
  }

  // Get the secret for this API key from your storage
  const secret = getApiKeySecret(apiKey)

  // Generate the expected signature
  const expectedSignature = generateHmacSignature(apiKey, timestamp, secret)

  // Verify signature
  if (signature !== expectedSignature) {
    return res.status(403).json({ error: 'Invalid signature' })
  }

  next()
})

// Now apply rate limiting based on the API key
const limiter = new RateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 100,
  keyGenerator: req => req.headers['x-api-key'] as string,
})
```

### 3. Rate Limit Authentication Endpoints

Apply stricter rate limits to authentication endpoints to prevent brute force attacks:

```typescript
import { MemoryStorage, RateLimiter } from 'ts-rate-limiter'

// Stricter rate limiter for login attempts
const loginLimiter = new RateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 5, // 5 attempts per 15 minutes
  storage: new MemoryStorage(),
  keyGenerator: (req) => {
    // Rate limit by both IP and username
    const username = req.body.username || 'anonymous'
    return `${req.ip}:${username.toLowerCase()}`
  },
})

// Login route with rate limiting
app.post('/login', async (req, res, next) => {
  const result = await loginLimiter.middleware(req)

  // Add rate limit headers
  Object.entries(result.headers).forEach(([key, value]) => {
    res.setHeader(key, value)
  })

  if (result.limited) {
    return res.status(429).json({
      error: 'Too many login attempts',
      message: 'Please try again later',
      retryAfter: Math.ceil((result.resetTime - Date.now()) / 1000)
    })
  }

  next()
}, handleLogin)
```

## User Experience

### 1. Set Clear Rate Limit Headers

Include descriptive rate limit headers to help clients understand limits:

```typescript
import { RateLimiter } from 'ts-rate-limiter'

const limiter = new RateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 100,
  standardHeaders: true, // Enable standard headers
})

// You can add custom middleware to enhance the headers
app.use(async (req, res, next) => {
  const result = await limiter.middleware(req)

  // Add standard headers
  Object.entries(result.headers).forEach(([key, value]) => {
    res.setHeader(key, value)
  })

  // Add custom descriptive headers
  res.setHeader('X-Rate-Limit-Description', '100 requests per minute')
  res.setHeader('X-Rate-Limit-Docs-URL', 'https://example.com/api-docs/rate-limits')

  if (result.limited) {
    return res.status(429).json({
      error: 'Rate limit exceeded',
      message: 'You have exceeded the rate limit of 100 requests per minute',
      retryAfter: Math.ceil((result.resetTime - Date.now()) / 1000),
      documentation: 'https://example.com/api-docs/rate-limits'
    })
  }

  next()
})
```

### 2. Provide Helpful Error Messages

Return informative error responses when rate limits are exceeded:

```typescript
import { RateLimiter } from 'ts-rate-limiter'

const limiter = new RateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 100,
  handler: (req, res, next, options) => {
    const retryAfter = Math.ceil((options.resetTime - Date.now()) / 1000)

    res.status(429).json({
      error: 'Too Many Requests',
      message: `You have exceeded the rate limit of ${options.maxRequests} requests per ${options.windowMs / 1000} seconds.`,
      retryAfter,
      retryAt: new Date(Date.now() + retryAfter * 1000).toISOString(),
      limit: options.maxRequests,
      windowMs: options.windowMs,
      currentUsage: options.maxRequests - options.remainingRequests,
      type: 'rate_limit_exceeded',
    })
  }
})
```

### 3. Implement Backoff Strategies

Advise clients on implementing exponential backoff:

```typescript
// Client-side implementation example (JavaScript)
async function fetchWithBackoff(url, maxRetries = 5) {
  let retries = 0
  const backoffTime = 1000 // Start with 1s backoff

  while (retries < maxRetries) {
    try {
      const response = await fetch(url)

      if (response.status !== 429) {
        return response
      }

      // Get retry-after header or default to exponential backoff
      const retryAfter = response.headers.get('Retry-After')

      // Use the header value or calculate exponential backoff
      const delay = retryAfter
        ? Number.parseInt(retryAfter) * 1000
        : Math.min(30000, backoffTime * 2 ** retries)

      console.log(`Rate limited. Retrying after ${delay}ms`)

      // Wait for the backoff period
      await new Promise(resolve => setTimeout(resolve, delay))

      // Increment retry counter
      retries++
    }
    catch (error) {
      console.error('Request failed:', error)
      retries++

      // Wait with exponential backoff before retrying
      const delay = Math.min(30000, backoffTime * 2 ** retries)
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }

  throw new Error('Maximum retries exceeded')
}
```

## Monitoring and Analytics

### 1. Log Rate Limit Events

Track rate limiting events to understand usage patterns:

```typescript
import { RateLimiter } from 'ts-rate-limiter'
import winston from 'winston'

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'rate-limits.log' })
  ]
})

const limiter = new RateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 100,
  handler: (req, res, next, options) => {
    // Log rate limit exceeded events
    logger.warn({
      type: 'rate_limit_exceeded',
      ip: req.ip,
      path: req.path,
      method: req.method,
      userAgent: req.headers['user-agent'],
      remaining: options.remainingRequests,
      limit: options.maxRequests,
      timestamp: new Date().toISOString()
    })

    // Send response to client
    res.status(429).send('Too Many Requests')
  },
  onLimitReached: (req, res, options) => {
    // This is called when a client first exceeds the rate limit
    logger.info({
      type: 'rate_limit_reached',
      ip: req.ip,
      path: req.path,
      method: req.method,
      userAgent: req.headers['user-agent'],
      timestamp: new Date().toISOString()
    })
  }
})
```

### 2. Track Rate Limit Metrics

Collect metrics to identify bottlenecks and adjust limits:

```typescript
import prometheus from 'prom-client'
import { RateLimiter } from 'ts-rate-limiter'

// Create metrics
const rateLimitCounter = new prometheus.Counter({
  name: 'rate_limit_exceeded_total',
  help: 'Total number of requests that exceeded rate limits',
  labelNames: ['path', 'method', 'status']
})

const remainingGauge = new prometheus.Gauge({
  name: 'rate_limit_remaining',
  help: 'Remaining requests before hitting rate limit',
  labelNames: ['path']
})

const limiter = new RateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 100,
  handler: (req, res, next, options) => {
    // Increment counter when rate limit exceeded
    rateLimitCounter.inc({
      path: req.path,
      method: req.method,
      status: 429
    })

    res.status(429).send('Too Many Requests')
  }
})

// Middleware to track remaining limit
app.use(async (req, res, next) => {
  const result = await limiter.middleware(req)

  // Update gauge with remaining requests
  remainingGauge.set({
    path: req.path
  }, result.remaining)

  // Add rate limit headers
  Object.entries(result.headers).forEach(([key, value]) => {
    res.setHeader(key, value)
  })

  if (result.limited) {
    return res.status(429).send('Too Many Requests')
  }

  next()
})

// Expose metrics endpoint
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', prometheus.register.contentType)
  res.end(await prometheus.register.metrics())
})
```

## Deployment Strategies

### 1. Start Conservative

Begin with more generous limits and tighten as needed:

```typescript
import { RateLimiter } from 'ts-rate-limiter'

// Read limits from environment variables with generous defaults
const limiter = new RateLimiter({
  windowMs: Number.parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000'),
  maxRequests: Number.parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '200'),
})

// Allow dynamically updating limits
function updateRateLimits(newWindow, newMax) {
  limiter.updateConfig({
    windowMs: newWindow,
    maxRequests: newMax
  })

  console.log(`Rate limits updated: ${newMax} requests per ${newWindow / 1000} seconds`)
}

// Expose endpoint for authorized admins to update limits
app.post('/admin/rate-limits', authenticate, authorize(['admin']), (req, res) => {
  const { windowMs, maxRequests } = req.body

  if (!windowMs || !maxRequests) {
    return res.status(400).json({ error: 'Missing required parameters' })
  }

  updateRateLimits(windowMs, maxRequests)

  res.json({ success: true, message: 'Rate limits updated' })
})
```

### 2. Use Different Environments for Testing

Configure different limits for development, staging, and production:

```typescript
import { RateLimiter } from 'ts-rate-limiter'

function getRateLimiterConfig() {
  switch (process.env.NODE_ENV) {
    case 'development':
      return {
        windowMs: 60 * 1000,
        maxRequests: 1000, // Very generous for local development
      }
    case 'staging':
      return {
        windowMs: 60 * 1000,
        maxRequests: 200, // More realistic for testing
      }
    case 'production':
      return {
        windowMs: 60 * 1000,
        maxRequests: 100, // Stricter for production
      }
    default:
      return {
        windowMs: 60 * 1000,
        maxRequests: 100, // Default to production settings
      }
  }
}

const limiter = new RateLimiter(getRateLimiterConfig())
```

### 3. Use Circuit Breakers with Rate Limiters

Combine rate limiting with circuit breakers for comprehensive protection:

```typescript
import { CircuitBreaker } from 'opossum'
import { RateLimiter } from 'ts-rate-limiter'

// Create rate limiter
const limiter = new RateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 100,
})

// Function to call external API
async function callExternalAPI(req) {
  // Implementation of API call
  return fetch('https://api.example.com/data')
}

// Create circuit breaker
const breaker = new CircuitBreaker(callExternalAPI, {
  timeout: 3000, // If our function takes longer than 3 seconds, trigger a failure
  resetTimeout: 30000, // After 30 seconds, try again
  errorThresholdPercentage: 50 // When 50% of requests fail, open the circuit
})

breaker.on('open', () => {
  console.log('Circuit breaker opened - external API appears to be down')
})

breaker.on('close', () => {
  console.log('Circuit breaker closed - external API is operational again')
})

// Express route that uses both rate limiting and circuit breaking
app.get('/api/external-data', async (req, res, next) => {
  // First apply rate limiting
  const rateLimitResult = await limiter.middleware(req)

  // Add rate limit headers
  Object.entries(rateLimitResult.headers).forEach(([key, value]) => {
    res.setHeader(key, value)
  })

  if (rateLimitResult.limited) {
    return res.status(429).send('Too Many Requests')
  }

  try {
    // Then use circuit breaker for the external call
    const result = await breaker.fire(req)
    res.json(result)
  }
  catch (error) {
    // Handle circuit breaker failure
    if (breaker.status === 'open') {
      res.status(503).json({ error: 'Service temporarily unavailable' })
    }
    else {
      res.status(500).json({ error: 'Internal Server Error' })
    }
  }
})
```

## Conclusion

Effective rate limiting requires a thoughtful approach to algorithm selection, key generation, and user experience. By following these best practices, you can implement fair and transparent rate limiting that protects your services while providing a good experience for legitimate users.
