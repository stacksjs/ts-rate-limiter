# Advanced Examples

This page showcases advanced usage patterns for TypeScript Rate Limiter to handle complex rate limiting scenarios.

## Dynamic Rate Limiting

Adjust rate limits based on user roles or subscription tiers:

```ts
import express from 'express'
import { MemoryStorage, RateLimiter } from 'ts-rate-limiter'

const app = express()

// Create different storage backends to separate limits by tier
const freeStorage = new MemoryStorage()
const proStorage = new MemoryStorage()
const enterpriseStorage = new MemoryStorage()

// Create rate limiters with different limits
const freeLimiter = new RateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 10, // Stricter limits for free tier
  storage: freeStorage,
})

const proLimiter = new RateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 100, // More generous for pro tier
  storage: proStorage,
})

const enterpriseLimiter = new RateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 1000, // Highest limit for enterprise
  storage: enterpriseStorage,
})

// Middleware to determine user tier and apply appropriate limiter
app.use(async (req, res, next) => {
  // Get user from auth token (implementation depends on your auth system)
  const user = await getUserFromToken(req.headers.authorization)

  // Choose appropriate limiter based on user tier
  let limiter
  switch (user?.tier) {
    case 'pro':
      limiter = proLimiter
      break
    case 'enterprise':
      limiter = enterpriseLimiter
      break
    default:
      limiter = freeLimiter
  }

  // Apply rate limiting
  const result = await limiter.middleware(req)

  // Add rate limit headers
  Object.entries(result.headers).forEach(([key, value]) => {
    res.setHeader(key, value)
  })

  if (result.limited) {
    return res.status(429).json({
      error: 'Rate limit exceeded',
      tier: user?.tier || 'free',
      upgrade: user?.tier !== 'enterprise' ? 'https://example.com/upgrade' : undefined,
    })
  }

  next()
})

app.listen(3000)
```

## Geographic Rate Limiting

Apply different limits based on user location:

```ts
import express from 'express'
import geoip from 'geoip-lite'
import { MemoryStorage, RateLimiter } from 'ts-rate-limiter'

const app = express()

// Rate limiters for different regions
const rateLimiters = {
  NA: new RateLimiter({ windowMs: 60 * 1000, maxRequests: 100 }),
  EU: new RateLimiter({ windowMs: 60 * 1000, maxRequests: 100 }),
  AP: new RateLimiter({ windowMs: 60 * 1000, maxRequests: 50 }),
  default: new RateLimiter({ windowMs: 60 * 1000, maxRequests: 30 }),
}

app.use(async (req, res, next) => {
  // Get client IP
  const ip = req.ip || req.socket.remoteAddress

  // Look up geographic region
  const geo = geoip.lookup(ip)
  let region = 'default'

  if (geo) {
    if (['US', 'CA', 'MX'].includes(geo.country)) {
      region = 'NA' // North America
    }
    else if (['GB', 'FR', 'DE', 'IT', 'ES'].includes(geo.country)) {
      region = 'EU' // Europe
    }
    else if (['JP', 'CN', 'IN', 'SG', 'AU'].includes(geo.country)) {
      region = 'AP' // Asia-Pacific
    }
  }

  // Get the appropriate limiter
  const limiter = rateLimiters[region] || rateLimiters.default

  // Apply rate limiting
  const result = await limiter.middleware(req)

  // Add headers
  Object.entries(result.headers).forEach(([key, value]) => {
    res.setHeader(key, value)
  })

  if (result.limited) {
    return res.status(429).send('Too Many Requests')
  }

  next()
})

app.listen(3000)
```

## CIDR-Based Rate Limiting

Limit requests based on IP ranges:

```ts
import { CidrChecker } from 'cidr-matcher'
import express from 'express'
import { MemoryStorage, RateLimiter } from 'ts-rate-limiter'

const app = express()

// Create trusted IP ranges
const trustedRanges = new CidrChecker(['10.0.0.0/8', '192.168.0.0/16'])
const officeCidr = new CidrChecker(['203.0.113.0/24']) // Example office IP range

// Create rate limiters with different limits
const defaultLimiter = new RateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 30,
})

const trustedLimiter = new RateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 300,
})

const officeLimiter = new RateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 1000,
})

// Middleware to apply appropriate limiter
app.use(async (req, res, next) => {
  const ip = req.ip || req.socket.remoteAddress

  // Choose appropriate limiter
  let limiter
  if (trustedRanges.contains(ip)) {
    limiter = trustedLimiter
  }
  else if (officeCidr.contains(ip)) {
    limiter = officeLimiter
  }
  else {
    limiter = defaultLimiter
  }

  // Apply rate limiting
  const result = await limiter.middleware(req)

  // Add headers
  Object.entries(result.headers).forEach(([key, value]) => {
    res.setHeader(key, value)
  })

  if (result.limited) {
    return res.status(429).send('Too Many Requests')
  }

  next()
})

app.listen(3000)
```

## Progressive Rate Limiting

Gradually reduce allowed requests as usage increases:

```ts
import express from 'express'
import { MemoryStorage, RateLimiter } from 'ts-rate-limiter'

const app = express()
const storage = new MemoryStorage()

// Track consecutive windows where limit was exceeded
const consecutiveExceeded = new Map<string, number>()

// Create main rate limiter
const baseLimiter = new RateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 100,
  storage,
})

// Apply progressive rate limiting
app.use(async (req, res, next) => {
  const ip = req.ip || req.socket.remoteAddress

  // Get current consecutive exceeded count
  const exceeded = consecutiveExceeded.get(ip) || 0

  // Calculate reduced limit based on consecutive exceeded windows
  let effectiveLimit = 100
  if (exceeded > 0) {
    // Exponential backoff: reduce limit by half for each consecutive exceeded window
    effectiveLimit = Math.max(5, Math.floor(100 / 2 ** exceeded))
  }

  // Override the maxRequests value
  const limiter = new RateLimiter({
    windowMs: 60 * 1000,
    maxRequests: effectiveLimit,
    storage,
  })

  // Apply rate limiting
  const result = await limiter.middleware(req)

  // Track consecutive exceeded windows
  if (result.limited) {
    consecutiveExceeded.set(ip, exceeded + 1)

    // Add custom header to show when normal service might resume
    const backoffTime = Math.min(60 * 2 ** exceeded, 3600) // Cap at 1 hour
    res.setHeader('X-RateLimit-Backoff', backoffTime.toString())

    return res.status(429).json({
      error: 'Too Many Requests',
      message: `You've exceeded the rate limit multiple times. Your limit has been temporarily reduced.`,
      normalServiceResumesIn: `${backoffTime} seconds`,
    })
  }
  else {
    // Reset consecutive exceeded count if they're not hitting the limit
    if (result.remaining > 0) {
      consecutiveExceeded.delete(ip)
    }
  }

  // Add headers
  Object.entries(result.headers).forEach(([key, value]) => {
    res.setHeader(key, value)
  })

  next()
})

app.listen(3000)
```

## Hybrid Algorithm: Token Bucket + Fixed Window

Implement a hybrid approach combining different algorithms:

```ts
import express from 'express'
import { RateLimitInfo, Storage } from 'ts-rate-limiter'

// Custom hybrid storage implementation
class HybridStorage implements Storage {
  private tokenBuckets = new Map<string, { tokens: number, lastRefill: number }>()
  private fixedWindows = new Map<string, { count: number, resetTime: number }>()
  private readonly tokensPerSecond: number
  private readonly bucketCapacity: number

  constructor(tokensPerSecond = 5, bucketCapacity = 20) {
    this.tokensPerSecond = tokensPerSecond
    this.bucketCapacity = bucketCapacity
  }

  async increment(key: string, windowMs: number): Promise<RateLimitInfo> {
    const now = Date.now()

    // Token bucket logic (for burst protection)
    let bucket = this.tokenBuckets.get(key)
    if (!bucket) {
      bucket = { tokens: this.bucketCapacity, lastRefill: now }
      this.tokenBuckets.set(key, bucket)
    }

    // Refill tokens based on time elapsed
    const timeSinceLastRefill = now - bucket.lastRefill
    const tokensToAdd = Math.floor(timeSinceLastRefill / 1000 * this.tokensPerSecond)

    if (tokensToAdd > 0) {
      bucket.tokens = Math.min(this.bucketCapacity, bucket.tokens + tokensToAdd)
      bucket.lastRefill = now
    }

    // Fixed window logic (for overall rate control)
    let window = this.fixedWindows.get(key)
    if (!window || window.resetTime <= now) {
      window = { count: 0, resetTime: now + windowMs }
      this.fixedWindows.set(key, window)
    }

    // Increment window count
    window.count++

    // Consume a token if available
    const tokenLimited = bucket.tokens <= 0
    if (!tokenLimited) {
      bucket.tokens--
    }

    // Check both limits
    const fixedWindowLimited = window.count > Math.floor(windowMs / 1000 * this.tokensPerSecond)
    const limited = tokenLimited || fixedWindowLimited

    // Calculate remaining capacity (use the more restrictive of the two)
    const tokenRemaining = Math.max(0, bucket.tokens)
    const windowRemaining = Math.max(0, Math.floor(windowMs / 1000 * this.tokensPerSecond) - window.count)
    const remaining = Math.min(tokenRemaining, windowRemaining)

    return {
      limited,
      remaining,
      resetTime: window.resetTime,
    }
  }

  async decrement(key: string): Promise<void> {
    const window = this.fixedWindows.get(key)
    if (window && window.count > 0) {
      window.count--
    }

    const bucket = this.tokenBuckets.get(key)
    if (bucket && bucket.tokens < this.bucketCapacity) {
      bucket.tokens++
    }
  }

  async resetKey(key: string): Promise<void> {
    this.tokenBuckets.delete(key)
    this.fixedWindows.delete(key)
  }

  async reset(): Promise<void> {
    this.tokenBuckets.clear()
    this.fixedWindows.clear()
  }
}

const app = express()

// Create a rate limiter with hybrid storage
const hybridStorage = new HybridStorage(10, 30) // 10 tokens per second, bucket capacity 30
const limiter = {
  async middleware(req) {
    const key = req.ip || req.socket.remoteAddress
    const result = await hybridStorage.increment(key, 60 * 1000)

    // Create headers
    const headers = {
      'RateLimit-Limit': `${60 * 10}`, // 60 seconds * 10 tokens per second
      'RateLimit-Remaining': `${result.remaining}`,
      'RateLimit-Reset': `${Math.floor(result.resetTime / 1000)}`,
    }

    if (result.limited) {
      headers['Retry-After'] = `${Math.ceil((result.resetTime - Date.now()) / 1000)}`
    }

    return {
      limited: result.limited,
      headers,
      remaining: result.remaining,
      resetTime: result.resetTime,
    }
  }
}

app.use(async (req, res, next) => {
  const result = await limiter.middleware(req)

  // Add headers
  Object.entries(result.headers).forEach(([key, value]) => {
    res.setHeader(key, value)
  })

  if (result.limited) {
    return res.status(429).send('Too Many Requests')
  }

  next()
})

app.listen(3000)
```

## Time-of-Day Rate Limiting

Apply different limits based on time of day:

```ts
import express from 'express'
import { MemoryStorage, RateLimiter } from 'ts-rate-limiter'

const app = express()

// Create different storage backends for different time periods
const peakHoursStorage = new MemoryStorage()
const offPeakHoursStorage = new MemoryStorage()

// Create rate limiters with different limits
const peakLimiter = new RateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 50, // Stricter limits during peak hours
  storage: peakHoursStorage,
})

const offPeakLimiter = new RateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 200, // More generous during off-peak hours
  storage: offPeakHoursStorage,
})

// Define peak hours (9 AM to 6 PM in your local timezone)
function isPeakHour() {
  const now = new Date()
  const hour = now.getHours()
  return hour >= 9 && hour < 18
}

// Middleware to apply appropriate limiter
app.use(async (req, res, next) => {
  // Choose appropriate limiter based on time of day
  const limiter = isPeakHour() ? peakLimiter : offPeakLimiter

  // Apply rate limiting
  const result = await limiter.middleware(req)

  // Add custom header to indicate peak/off-peak
  res.setHeader('X-Rate-Limit-Period', isPeakHour() ? 'peak' : 'off-peak')

  // Add regular rate limit headers
  Object.entries(result.headers).forEach(([key, value]) => {
    res.setHeader(key, value)
  })

  if (result.limited) {
    return res.status(429).send('Too Many Requests')
  }

  next()
})

app.listen(3000)
```

## API Key Rate Limiting

Apply different limits for different API keys:

```ts
import express from 'express'
import { MemoryStorage, RateLimiter } from 'ts-rate-limiter'

const app = express()

// In-memory store of API keys and their limits
// In production, this would come from a database
const apiKeyLimits = {
  api_key_12345: { requestsPerMinute: 100 },
  api_key_67890: { requestsPerMinute: 1000 },
  // Add more API keys as needed
}

// Create a Map to hold limiters for each API key
const apiKeyLimiters = new Map<string, RateLimiter>()

// Function to get or create a limiter for an API key
function getLimiterForApiKey(apiKey: string): RateLimiter {
  // Check if limiter exists
  if (apiKeyLimiters.has(apiKey)) {
    return apiKeyLimiters.get(apiKey)!
  }

  // Get limit for this API key or use a default
  const limit = apiKeyLimits[apiKey]?.requestsPerMinute || 10

  // Create a new limiter for this API key
  const limiter = new RateLimiter({
    windowMs: 60 * 1000,
    maxRequests: limit,
    storage: new MemoryStorage(),
  })

  // Store for future use
  apiKeyLimiters.set(apiKey, limiter)

  return limiter
}

// Middleware to validate API key and apply rate limiting
app.use(async (req, res, next) => {
  // Get API key from query parameter or header
  const apiKey = req.query.api_key as string || req.headers['x-api-key'] as string

  // If no API key provided, return error
  if (!apiKey) {
    return res.status(401).json({ error: 'API key required' })
  }

  // Check if API key exists in our system
  if (!apiKeyLimits[apiKey]) {
    return res.status(403).json({ error: 'Invalid API key' })
  }

  // Get the appropriate limiter for this API key
  const limiter = getLimiterForApiKey(apiKey)

  // Apply rate limiting using the API key as the identifier
  const result = await limiter.check(apiKey)

  // Add rate limit headers
  Object.entries(result.headers).forEach(([key, value]) => {
    res.setHeader(key, value)
  })

  if (result.limited) {
    return res.status(429).json({
      error: 'Rate limit exceeded',
      limit: apiKeyLimits[apiKey].requestsPerMinute,
      retryAfter: Math.ceil((result.resetTime - Date.now()) / 1000)
    })
  }

  next()
})

app.listen(3000)
```

## Cost-Based Rate Limiting

Assign different "costs" to different API endpoints:

```ts
import express from 'express'
import { MemoryStorage, RateLimiter } from 'ts-rate-limiter'

const app = express()

// Define costs for different endpoints
const endpointCosts = {
  '/api/simple-query': 1, // Simple query costs 1 token
  '/api/complex-query': 5, // Complex query costs 5 tokens
  '/api/batch-operation': 10, // Batch operation costs 10 tokens
  '/api/export': 25, // Export costs 25 tokens
}

// Create a rate limiter with a generous limit
const limiter = new RateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 100, // 100 "tokens" per minute
  storage: new MemoryStorage(),
})

// Middleware to apply cost-based rate limiting
app.use(async (req, res, next) => {
  const ip = req.ip || req.socket.remoteAddress

  // Determine the cost of this request
  let cost = 1 // Default cost

  for (const [path, pathCost] of Object.entries(endpointCosts)) {
    if (req.path.startsWith(path)) {
      cost = pathCost
      break
    }
  }

  // Add header to show request cost
  res.setHeader('X-Request-Cost', cost.toString())

  // For requests with cost > 1, check multiple times
  let limited = false
  let remaining = 0

  for (let i = 0; i < cost; i++) {
    const result = await limiter.check(ip)
    remaining = result.remaining

    if (result.limited) {
      limited = true
      break
    }
  }

  // Add rate limit headers
  res.setHeader('RateLimit-Limit', '100')
  res.setHeader('RateLimit-Remaining', remaining.toString())

  if (limited) {
    return res.status(429).json({
      error: 'Rate limit exceeded',
      message: `This request requires ${cost} tokens, but you don't have enough remaining.`,
    })
  }

  next()
})

// Add routes
app.get('/api/simple-query', (req, res) => {
  res.json({ data: 'Simple query result' })
})

app.get('/api/complex-query', (req, res) => {
  res.json({ data: 'Complex query result' })
})

app.post('/api/batch-operation', (req, res) => {
  res.json({ data: 'Batch operation completed' })
})

app.get('/api/export', (req, res) => {
  res.json({ data: 'Export completed' })
})

app.listen(3000)
```

## Event-Driven Rate Limiting Reset

Implement a rate limiter that resets based on external events:

```ts
import { EventEmitter } from 'node:events'
import express from 'express'
import { MemoryStorage, RateLimiter, Storage } from 'ts-rate-limiter'

// Create an event emitter
const eventBus = new EventEmitter()

// Create a custom storage that can be reset by events
class EventDrivenStorage implements Storage {
  private storage: MemoryStorage

  constructor(eventBus: EventEmitter, resetEvent: string) {
    this.storage = new MemoryStorage()

    // Listen for reset events
    eventBus.on(resetEvent, () => {
      console.log(`Received ${resetEvent} event, resetting rate limits`)
      this.reset()
    })
  }

  async increment(key: string, windowMs: number): Promise<any> {
    return this.storage.increment(key, windowMs)
  }

  async decrement(key: string): Promise<void> {
    return this.storage.decrement(key)
  }

  async resetKey(key: string): Promise<void> {
    return this.storage.resetKey(key)
  }

  async reset(): Promise<void> {
    return this.storage.reset()
  }
}

// Create app
const app = express()

// Create event-driven storage
const paymentStorage = new EventDrivenStorage(eventBus, 'payment_received')
const limiter = new RateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 10,
  storage: paymentStorage,
})

// Rate limiting middleware
app.use(async (req, res, next) => {
  const ip = req.ip || req.socket.remoteAddress

  const result = await limiter.middleware(req)

  // Add headers
  Object.entries(result.headers).forEach(([key, value]) => {
    res.setHeader(key, value)
  })

  if (result.limited) {
    return res.status(429).json({
      error: 'Rate limit exceeded',
      message: 'Upgrade your account or wait for your limit to reset',
      upgradeUrl: '/api/payments/upgrade'
    })
  }

  next()
})

// Route to simulate payment that resets rate limits
app.post('/api/payments/upgrade', (req, res) => {
  // Process payment logic would go here

  // Emit event to reset rate limits for this user
  eventBus.emit('payment_received')

  res.json({
    success: true,
    message: 'Payment received, your rate limits have been reset'
  })
})

app.get('/api/data', (req, res) => {
  res.json({ data: 'Here is your data' })
})

app.listen(3000)
```

## Multistage Rate Limiting

Apply multiple rate limiting stages with different time windows:

```ts
import express from 'express'
import { MemoryStorage, RateLimiter } from 'ts-rate-limiter'

const app = express()

// Create three limiters with different time windows
const secondLimiter = new RateLimiter({
  windowMs: 1 * 1000, // 1 second
  maxRequests: 5, // 5 requests per second
  standardHeaders: false, // Don't send headers from this limiter
})

const minuteLimiter = new RateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 100, // 100 requests per minute
  standardHeaders: false, // Don't send headers from this limiter
})

const hourLimiter = new RateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: 1000, // 1000 requests per hour
  standardHeaders: true, // Only send headers from this limiter
})

// Apply multi-stage rate limiting
app.use(async (req, res, next) => {
  const ip = req.ip || req.socket.remoteAddress

  // Check against all limiters
  const [secondResult, minuteResult, hourResult] = await Promise.all([
    secondLimiter.check(ip),
    minuteLimiter.check(ip),
    hourLimiter.check(ip)
  ])

  // Add custom headers to show limits at all stages
  res.setHeader('X-RateLimit-Second-Remaining', secondResult.remaining.toString())
  res.setHeader('X-RateLimit-Minute-Remaining', minuteResult.remaining.toString())

  // Add standard headers from the hourly limiter
  Object.entries(hourResult.headers).forEach(([key, value]) => {
    res.setHeader(key, value)
  })

  // Check if any limit was exceeded
  if (secondResult.limited) {
    return res.status(429).json({
      error: 'Rate limit exceeded',
      message: 'You are sending too many requests per second',
      limit: 'second',
      retryAfter: Math.ceil((secondResult.resetTime - Date.now()) / 1000)
    })
  }

  if (minuteResult.limited) {
    return res.status(429).json({
      error: 'Rate limit exceeded',
      message: 'You are sending too many requests per minute',
      limit: 'minute',
      retryAfter: Math.ceil((minuteResult.resetTime - Date.now()) / 1000)
    })
  }

  if (hourResult.limited) {
    return res.status(429).json({
      error: 'Rate limit exceeded',
      message: 'You have exceeded your hourly request quota',
      limit: 'hour',
      retryAfter: Math.ceil((hourResult.resetTime - Date.now()) / 1000)
    })
  }

  next()
})

app.get('/api/data', (req, res) => {
  res.json({ message: 'API data' })
})

app.listen(3000)
```
