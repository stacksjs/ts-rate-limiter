# Testing Rate-Limited Applications

Testing rate-limited applications is critical to ensure they behave correctly under various conditions. TypeScript Rate Limiter provides several features to facilitate testing and ensure your application's rate limiting works as expected.

## Test-Friendly Configuration

When testing, you often want to:

1. Use lower rate limits to trigger limiting faster
2. Reset limits between tests
3. Mock storage to avoid external dependencies
4. Test different scenarios without waiting for actual time windows

## Unit Testing

### Testing Express Middleware

```ts
import express from 'express'
import request from 'supertest'
import { MemoryStorage, RateLimiter } from 'ts-rate-limiter'

describe('Express Rate Limiting', () => {
  let app: express.Express
  let storage: MemoryStorage
  let limiter: RateLimiter

  beforeEach(() => {
    // Create a fresh app and storage for each test
    app = express()
    storage = new MemoryStorage()

    // Create a rate limiter with test-friendly limits
    limiter = new RateLimiter({
      windowMs: 1000, // 1 second window
      maxRequests: 2, // Only 2 requests allowed
      storage,
    })

    // Add middleware
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

    app.get('/test', (req, res) => {
      res.send('OK')
    })
  })

  afterEach(async () => {
    // Reset limits after each test
    await storage.reset()
  })

  test('should allow requests within rate limit', async () => {
    // First request
    const res1 = await request(app).get('/test')
    expect(res1.status).toBe(200)
    expect(res1.headers['ratelimit-remaining']).toBe('1')

    // Second request
    const res2 = await request(app).get('/test')
    expect(res2.status).toBe(200)
    expect(res2.headers['ratelimit-remaining']).toBe('0')
  })

  test('should block requests exceeding rate limit', async () => {
    // Use up the limit
    await request(app).get('/test')
    await request(app).get('/test')

    // Should be limited now
    const res = await request(app).get('/test')
    expect(res.status).toBe(429)
    expect(res.text).toContain('Too Many Requests')
  })

  test('should reset after the window expires', async () => {
    // Use up the limit
    await request(app).get('/test')
    await request(app).get('/test')

    // Wait for window to expire
    await new Promise(resolve => setTimeout(resolve, 1100))

    // Should be allowed again
    const res = await request(app).get('/test')
    expect(res.status).toBe(200)
  })
})
```

### Testing with Manual Key Management

You can directly manipulate the rate limiter for more granular testing:

```ts
import { MemoryStorage, RateLimiter } from 'ts-rate-limiter'

describe('Rate Limiter Direct Usage', () => {
  let storage: MemoryStorage
  let limiter: RateLimiter

  beforeEach(() => {
    storage = new MemoryStorage()
    limiter = new RateLimiter({
      windowMs: 1000,
      maxRequests: 5,
      storage,
    })
  })

  afterEach(async () => {
    await storage.reset()
  })

  test('should track remaining requests correctly', async () => {
    const key = 'test-user'

    // Check initial state
    let result = await limiter.check(key)
    expect(result.limited).toBe(false)
    expect(result.remaining).toBe(5)

    // Consume some requests
    for (let i = 0; i < 3; i++) {
      result = await limiter.check(key)
    }

    // Should have 2 remaining
    result = await limiter.check(key)
    expect(result.limited).toBe(false)
    expect(result.remaining).toBe(2)
  })

  test('should allow resetting individual keys', async () => {
    const key = 'test-user'

    // Use up some of the limit
    for (let i = 0; i < 3; i++) {
      await limiter.check(key)
    }

    // Reset this key
    await storage.resetKey(key)

    // Should be back to full limit
    const result = await limiter.check(key)
    expect(result.remaining).toBe(5)
  })
})
```

## Mocking Rate Limiter for Integration Tests

### In-Memory Mock for Redis Storage

```ts
import { RateLimitInfo, Storage } from 'ts-rate-limiter'

// Mock Redis storage with in-memory implementation
class MockRedisStorage implements Storage {
  private store: Map<string, number> = new Map()
  private resetTimes: Map<string, number> = new Map()

  async increment(key: string, windowMs: number): Promise<RateLimitInfo> {
    // Get current count or initialize
    const current = this.store.get(key) || 0
    const newCount = current + 1
    this.store.set(key, newCount)

    // Calculate reset time if not already set
    if (!this.resetTimes.has(key)) {
      const resetTime = Date.now() + windowMs
      this.resetTimes.set(key, resetTime)
    }

    const limited = false // You can implement your limiting logic
    const resetTime = this.resetTimes.get(key) || 0
    const remaining = 100 - newCount // Example remaining count

    return { limited, resetTime, remaining }
  }

  async decrement(key: string): Promise<void> {
    const current = this.store.get(key) || 0
    if (current > 0) {
      this.store.set(key, current - 1)
    }
  }

  async resetKey(key: string): Promise<void> {
    this.store.delete(key)
    this.resetTimes.delete(key)
  }

  async reset(): Promise<void> {
    this.store.clear()
    this.resetTimes.clear()
  }
}
```

### Testing Time-Based Scenarios with Jest

```ts
import { MemoryStorage, RateLimiter } from 'ts-rate-limiter'

// Mock Date.now globally for time-based tests
const realDateNow = Date.now.bind(globalThis.Date)

describe('Time-based Rate Limiting', () => {
  let storage: MemoryStorage
  let limiter: RateLimiter
  let now: number

  beforeEach(() => {
    // Start at a fixed timestamp
    now = 1609459200000 // 2021-01-01T00:00:00Z

    // Mock Date.now
    globalThis.Date.now = jest.fn(() => now)

    storage = new MemoryStorage()
    limiter = new RateLimiter({
      windowMs: 60 * 1000, // 1 minute
      maxRequests: 5,
      storage,
    })
  })

  afterEach(() => {
    // Restore the real Date.now
    globalThis.Date.now = realDateNow
  })

  test('should reset after window expires', async () => {
    const key = 'test-user'

    // Use up the limit
    for (let i = 0; i < 5; i++) {
      await limiter.check(key)
    }

    // Should be limited now
    let result = await limiter.check(key)
    expect(result.limited).toBe(true)

    // Advance time by 61 seconds
    now += 61 * 1000

    // Should be allowed again
    result = await limiter.check(key)
    expect(result.limited).toBe(false)
    expect(result.remaining).toBe(5)
  })
})
```

## End-to-End Testing

For end-to-end tests where you want to test actual rate limiting behavior:

```ts
import { chromium } from 'playwright'

describe('Rate Limiting E2E', () => {
  let browser
  let page

  beforeAll(async () => {
    browser = await chromium.launch()
  })

  afterAll(async () => {
    await browser.close()
  })

  beforeEach(async () => {
    page = await browser.newPage()
  })

  afterEach(async () => {
    await page.close()
  })

  test('should show rate limit error after too many login attempts', async () => {
    // Attempt login multiple times
    for (let i = 0; i < 5; i++) {
      await page.goto('http://localhost:3000/login')
      await page.fill('#username', 'testuser')
      await page.fill('#password', 'wrongpassword')
      await page.click('button[type="submit"]')
    }

    // Check if rate limit message appears
    const rateLimitMessage = await page.locator('.rate-limit-error').textContent()
    expect(rateLimitMessage).toContain('Too many login attempts')
  })
})
```

## Load Testing with k6

To test rate limiting under load:

```javascript
import { check, sleep } from 'k6'
// rate-limit-test.js
import http from 'k6/http'

export const options = {
  vus: 10, // 10 virtual users
  duration: '30s',
}

export default function () {
  // Each virtual user makes a request
  const res = http.get('http://localhost:3000/api/data')

  // Check status codes
  check(res, {
    'success or rate limited': r =>
      r.status === 200 || r.status === 429,
  })

  // Log rate limit headers
  if (res.status === 429) {
    console.log(
      `Rate limited: Retry after ${res.headers['Retry-After']} seconds`
    )
  }
  else {
    console.log(
      `Success: ${res.headers['RateLimit-Remaining']} requests remaining`
    )
  }

  // Add random delay between requests
  sleep(Math.random() * 0.5)
}
```

Run with:

```bash
k6 run rate-limit-test.js
```

## Best Practices for Testing Rate Limiting

1. **Isolate Tests**: Use a fresh storage instance for each test
2. **Lower Limits for Testing**: Use smaller `windowMs` and `maxRequests` values
3. **Mock Time**: Control time progression to avoid waiting for actual windows
4. **Test Different Keys**: Verify that rate limiting correctly differentiates users
5. **Check Headers**: Verify that correct headers are included in responses
6. **Test Edge Cases**:
   - Hitting exact limit
   - Requests after limit expires
   - Concurrent requests at the limit boundary
7. **Test Custom Handlers**: Verify custom error responses
8. **Document Test Patterns**: Create reusable test fixtures for rate limiting scenarios
