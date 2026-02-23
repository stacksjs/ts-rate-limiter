import type { RateLimitResult } from '../src/types'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { MemoryStorage, RateLimiter } from '../src'

describe('ts-rate-limiter', () => {
  describe('MemoryStorage', () => {
    let storage: MemoryStorage

    beforeEach(() => {
      storage = new MemoryStorage()
    })

    afterEach(() => {
      if (storage.dispose) {
        storage.dispose()
      }
    })

    it('should increment counter', async () => {
      const key = 'test-key'
      const windowMs = 10000

      const result1 = await storage.increment(key, windowMs)
      expect(result1.count).toBe(1)
      expect(result1.resetTime).toBeGreaterThan(Date.now())

      const result2 = await storage.increment(key, windowMs)
      expect(result2.count).toBe(2)
    })

    it('should reset counter', async () => {
      const key = 'test-key'
      const windowMs = 10000

      await storage.increment(key, windowMs)
      await storage.reset(key)

      const result = await storage.increment(key, windowMs)
      expect(result.count).toBe(1)
    })

    it('should clean expired records', async () => {
      const key = 'test-key'
      const windowMs = 10 // Very short window

      await storage.increment(key, windowMs)

      // Wait for window to expire
      await new Promise(resolve => setTimeout(resolve, 20))

      storage.cleanExpired()

      const result = await storage.increment(key, windowMs)
      expect(result.count).toBe(1) // Counter should be reset
    })

    it('should get sliding window count', async () => {
      const key = 'test-key'
      const windowMs = 100

      await storage.increment(key, windowMs)
      await storage.increment(key, windowMs)

      const count = await storage.getSlidingWindowCount!(key, windowMs)
      expect(count).toBe(2)
    })

    it('should batch increment keys', async () => {
      const keys = ['key1', 'key2', 'key3']
      const windowMs = 10000

      const results = await storage.batchIncrement!(keys, windowMs)

      expect(results.size).toBe(3)
      expect(results.get('key1')?.count).toBe(1)
      expect(results.get('key2')?.count).toBe(1)
      expect(results.get('key3')?.count).toBe(1)
    })
  })

  describe('RateLimiter with Fixed Window Algorithm', () => {
    let rateLimiter: RateLimiter

    beforeEach(() => {
      rateLimiter = new RateLimiter({
        windowMs: 1000,
        maxRequests: 2,
        algorithm: 'fixed-window',
      })
    })

    afterEach(() => {
      rateLimiter.dispose()
    })

    it('should allow requests within limits', async () => {
      const mockRequest = new Request('https://example.com')

      const result1 = await rateLimiter.check(mockRequest)
      expect(result1.allowed).toBe(true)
      expect(result1.current).toBe(1)

      const result2 = await rateLimiter.check(mockRequest)
      expect(result2.allowed).toBe(true)
      expect(result2.current).toBe(2)
    })

    it('should block requests over limit', async () => {
      const mockRequest = new Request('https://example.com')

      await rateLimiter.check(mockRequest) // 1st request
      await rateLimiter.check(mockRequest) // 2nd request

      const result = await rateLimiter.check(mockRequest) // 3rd request
      expect(result.allowed).toBe(false)
      expect(result.current).toBe(3)
    })

    it('should reset counter', async () => {
      const mockRequest = new Request('https://example.com')
      const key = '127.0.0.1' // Default key from request

      await rateLimiter.check(mockRequest)
      await rateLimiter.reset(key)

      const result = await rateLimiter.check(mockRequest)
      expect(result.current).toBe(1)
    })

    it('should use custom key generator', async () => {
      const customKeyGenerator = (_req: Request): string => {
        return 'custom-key'
      }

      const customRateLimiter = new RateLimiter({
        windowMs: 1000,
        maxRequests: 2,
        keyGenerator: customKeyGenerator,
      })

      const mockRequest = new Request('https://example.com')
      await customRateLimiter.check(mockRequest)

      // Check that reset works with the custom key
      await customRateLimiter.reset('custom-key')
      const newResult = await customRateLimiter.check(mockRequest)

      expect(newResult.current).toBe(1)

      customRateLimiter.dispose()
    })

    it('should skip failed requests when enabled', async () => {
      const failingKeyGenerator = (): string => {
        throw new Error('Key generation failed')
      }

      const rateLimiterWithSkip = new RateLimiter({
        windowMs: 1000,
        maxRequests: 2,
        keyGenerator: failingKeyGenerator,
        skipFailedRequests: true,
      })

      const mockRequest = new Request('https://example.com')
      const result = await rateLimiterWithSkip.check(mockRequest)

      expect(result.allowed).toBe(true)

      rateLimiterWithSkip.dispose()
    })

    it('should not skip failed requests when disabled', async () => {
      const failingKeyGenerator = (): string => {
        throw new Error('Key generation failed')
      }

      const rateLimiterNoSkip = new RateLimiter({
        windowMs: 1000,
        maxRequests: 2,
        keyGenerator: failingKeyGenerator,
        skipFailedRequests: false,
      })

      const mockRequest = new Request('https://example.com')

      await expect(rateLimiterNoSkip.check(mockRequest)).rejects.toThrow('Key generation failed')

      rateLimiterNoSkip.dispose()
    })
  })

  describe('RateLimiter with Sliding Window Algorithm', () => {
    let rateLimiter: RateLimiter

    beforeEach(() => {
      rateLimiter = new RateLimiter({
        windowMs: 1000,
        maxRequests: 2,
        algorithm: 'sliding-window',
      })
    })

    afterEach(() => {
      rateLimiter.dispose()
    })

    it('should use sliding window counter', async () => {
      const mockRequest = new Request('https://example.com')

      await rateLimiter.check(mockRequest)
      await rateLimiter.check(mockRequest)

      const result = await rateLimiter.check(mockRequest)
      expect(result.allowed).toBe(false)
      expect(result.current).toBe(3)
    })

    it('should allow requests after window slides', async () => {
      // Using a very short window to test sliding behavior
      const shortWindowRateLimiter = new RateLimiter({
        windowMs: 50,
        maxRequests: 1,
        algorithm: 'sliding-window',
      })

      const mockRequest = new Request('https://example.com')

      // First request fills the limit
      await shortWindowRateLimiter.check(mockRequest)

      // Second request exceeds the limit
      let result = await shortWindowRateLimiter.check(mockRequest)
      expect(result.allowed).toBe(false)

      // Wait for the window to slide
      await new Promise(resolve => setTimeout(resolve, 60))

      // Should be allowed again
      result = await shortWindowRateLimiter.check(mockRequest)
      expect(result.allowed).toBe(true)

      shortWindowRateLimiter.dispose()
    })
  })

  describe('RateLimiter with Token Bucket Algorithm', () => {
    let rateLimiter: RateLimiter

    beforeEach(() => {
      rateLimiter = new RateLimiter({
        windowMs: 1000,
        maxRequests: 2,
        algorithm: 'token-bucket',
      })
    })

    afterEach(() => {
      rateLimiter.dispose()
    })

    it('should use token bucket algorithm', async () => {
      const mockRequest = new Request('https://example.com')

      // First two requests should be allowed
      let result = await rateLimiter.check(mockRequest)
      expect(result.allowed).toBe(true)

      result = await rateLimiter.check(mockRequest)
      expect(result.allowed).toBe(true)

      // Third request should be rejected
      result = await rateLimiter.check(mockRequest)
      expect(result.allowed).toBe(false)
    })

    it('should refill tokens over time', async () => {
      const mockRequest = new Request('https://example.com')

      // Consume all tokens
      await rateLimiter.check(mockRequest)
      await rateLimiter.check(mockRequest)

      // Wait for tokens to refill (at least 1)
      await new Promise(resolve => setTimeout(resolve, 600))

      // Should be allowed again
      const result = await rateLimiter.check(mockRequest)
      expect(result.allowed).toBe(true)
    })

    it('should reset token bucket', async () => {
      const mockRequest = new Request('https://example.com')
      const key = '127.0.0.1' // Default key from request

      // Consume all tokens
      await rateLimiter.check(mockRequest)
      await rateLimiter.check(mockRequest)

      // Reset bucket for this key
      await rateLimiter.reset(key)

      // Should be allowed again
      const result = await rateLimiter.check(mockRequest)
      expect(result.allowed).toBe(true)
    })
  })

  describe('RateLimiter Middleware', () => {
    let rateLimiter: RateLimiter

    beforeEach(() => {
      rateLimiter = new RateLimiter({
        windowMs: 1000,
        maxRequests: 2,
      })
    })

    afterEach(() => {
      rateLimiter.dispose()
    })

    it('should return null for allowed requests', async () => {
      const mockRequest = new Request('https://example.com')
      const middleware = rateLimiter.middleware()

      const result = await middleware(mockRequest)
      expect(result).toBeNull()
    })

    it('should return 429 response for blocked requests', async () => {
      const mockRequest = new Request('https://example.com')
      const middleware = rateLimiter.middleware()

      // Consume the limit
      await rateLimiter.check(mockRequest)
      await rateLimiter.check(mockRequest)

      // This should be blocked
      const response = await middleware(mockRequest)
      expect(response).not.toBeNull()
      expect(response?.status).toBe(429)
    })

    it('should include correct headers in 429 response', async () => {
      const mockRequest = new Request('https://example.com')
      const middleware = rateLimiter.middleware()

      // Consume the limit
      await rateLimiter.check(mockRequest)
      await rateLimiter.check(mockRequest)

      // This should be blocked
      const response = await middleware(mockRequest)

      expect(response?.headers.get('X-RateLimit-Limit')).toBe('2')
      expect(response?.headers.get('X-RateLimit-Remaining')).toBe('0')
      expect(response?.headers.get('X-RateLimit-Reset')).not.toBeNull()
      expect(response?.headers.get('Retry-After')).not.toBeNull()
    })

    it('should use custom handler when provided', async () => {
      const customHandler = (_req: Request, _result: RateLimitResult): Response => {
        return new Response('Custom rate limit message', { status: 400 })
      }

      const customRateLimiter = new RateLimiter({
        windowMs: 1000,
        maxRequests: 1,
        handler: customHandler,
      })

      const mockRequest = new Request('https://example.com')
      const middleware = customRateLimiter.middleware()

      // Consume the limit
      await customRateLimiter.check(mockRequest)

      // This should be blocked with custom response
      const response = await middleware(mockRequest)

      expect(response?.status).toBe(400)
      expect(await response?.text()).toBe('Custom rate limit message')

      customRateLimiter.dispose()
    })

    it('should skip rate limiting when skip function returns true', async () => {
      const skipFn = (req: Request): boolean => {
        return req.url.includes('skip-me')
      }

      const rateLimiterWithSkip = new RateLimiter({
        windowMs: 1000,
        maxRequests: 1,
        skip: skipFn,
      })

      const regularRequest = new Request('https://example.com')
      const skipRequest = new Request('https://example.com/skip-me')
      const middleware = rateLimiterWithSkip.middleware()

      // Consume the limit with regular request
      await rateLimiterWithSkip.check(regularRequest)

      // Regular request should be blocked
      let response = await middleware(regularRequest)
      expect(response?.status).toBe(429)

      // Skip request should be allowed despite limit
      response = await middleware(skipRequest)
      expect(response).toBeNull()

      rateLimiterWithSkip.dispose()
    })

    it('should allow all requests in draft mode', async () => {
      const draftRateLimiter = new RateLimiter({
        windowMs: 1000,
        maxRequests: 1,
        draftMode: true,
      })

      const mockRequest = new Request('https://example.com')
      const middleware = draftRateLimiter.middleware()

      // First request (within limit)
      let response = await middleware(mockRequest)
      expect(response).toBeNull()

      // Second request (beyond limit, but allowed due to draft mode)
      response = await middleware(mockRequest)
      expect(response).toBeNull()

      draftRateLimiter.dispose()
    })
  })

  describe('Edge Cases', () => {
    it('should handle large number of unique keys', async () => {
      const storage = new MemoryStorage()
      const windowMs = 10000
      const uniqueKeyCount = 1000

      // Create many unique keys
      for (let i = 0; i < uniqueKeyCount; i++) {
        await storage.increment(`key-${i}`, windowMs)
      }

      // Ensure we can still access all keys
      // Use deterministic, evenly-spaced indices to avoid duplicate keys
      // which would cause the count to exceed 2
      for (let i = 0; i < 10; i++) {
        const index = i * Math.floor(uniqueKeyCount / 10)
        const result = await storage.increment(`key-${index}`, windowMs)
        expect(result.count).toBe(2) // Should increment to 2 because we already added 1
      }

      storage.dispose()
    })

    it('should handle invalid inputs gracefully', async () => {
      const rateLimiter = new RateLimiter({
        windowMs: 1000,
        maxRequests: 10,
      })

      // Test with negative window size (should use default or minimum)
      const badRateLimiter = new RateLimiter({
        windowMs: -1000, // Invalid window
        maxRequests: 10,
      })

      const mockRequest = new Request('https://example.com')
      const result = await badRateLimiter.check(mockRequest)
      expect(result.allowed).toBe(true) // Should still work

      rateLimiter.dispose()
      badRateLimiter.dispose()
    })

    it('should handle zero max requests properly', async () => {
      const rateLimiter = new RateLimiter({
        windowMs: 1000,
        maxRequests: 0, // Effectively disable all requests
      })

      const mockRequest = new Request('https://example.com')
      const result = await rateLimiter.check(mockRequest)
      expect(result.allowed).toBe(false) // Should block all requests
      expect(result.limit).toBe(0)

      rateLimiter.dispose()
    })

    it('should release memory after dispose', async () => {
      const storage = new MemoryStorage()
      const windowMs = 10000

      // Add some data
      for (let i = 0; i < 100; i++) {
        await storage.increment(`key-${i}`, windowMs)
      }

      // Dispose
      storage.dispose()

      // After dispose, trying to use the storage should either fail or return empty results
      // This is implementation-specific, but we can check that some core methods don't work
      try {
        const result = await storage.increment('test-key', windowMs)
        // If it doesn't throw, we should get a new/reset counter
        expect(result.count).toBe(1)
      }
      catch (err) {
        // Or it might throw, which is also acceptable behavior after dispose
        expect(err).toBeTruthy()
      }
    })

    it('should handle concurrent requests properly', async () => {
      const rateLimiter = new RateLimiter({
        windowMs: 1000,
        maxRequests: 50,
      })

      const mockRequest = new Request('https://example.com')
      const concurrentCount = 25

      // Fire multiple concurrent requests
      const promises: Promise<boolean>[] = []
      for (let i = 0; i < concurrentCount; i++) {
        promises.push(rateLimiter.check(mockRequest).then(r => r.allowed))
      }

      const results = await Promise.all(promises)

      // All should be allowed (within limit)
      expect(results.every(r => r === true)).toBe(true)

      // Check final count
      const finalResult = await rateLimiter.check(mockRequest)
      expect(finalResult.current).toBe(concurrentCount + 1)

      rateLimiter.dispose()
    })

    it('should handle headers for close-to-limit cases', async () => {
      const rateLimiter = new RateLimiter({
        windowMs: 1000,
        maxRequests: 5,
      })

      const mockRequest = new Request('https://example.com')
      const middleware = rateLimiter.middleware()

      // Consume 4 of 5 allowed requests
      await rateLimiter.check(mockRequest)
      await rateLimiter.check(mockRequest)
      await rateLimiter.check(mockRequest)
      await rateLimiter.check(mockRequest)

      // This should still be allowed (5th request)
      const response = await middleware(mockRequest)
      expect(response).toBeNull()

      // Check the headers for the next request (6th)
      const sixthRequest = await rateLimiter.check(mockRequest)
      expect(sixthRequest.allowed).toBe(false)

      // Verify middleware adds proper headers
      const blockedResponse = await middleware(mockRequest)
      expect(blockedResponse?.status).toBe(429)
      expect(blockedResponse?.headers.get('X-RateLimit-Limit')).toBe('5')
      expect(blockedResponse?.headers.get('X-RateLimit-Remaining')).toBe('0')

      rateLimiter.dispose()
    })
  })

  describe('Algorithm Edge Cases', () => {
    it('should handle window transition in Fixed Window algorithm', async () => {
      const windowMs = 50 // Very short window
      const rateLimiter = new RateLimiter({
        windowMs,
        maxRequests: 2,
        algorithm: 'fixed-window',
      })

      const mockRequest = new Request('https://example.com')

      // Use up the limit
      await rateLimiter.check(mockRequest)
      await rateLimiter.check(mockRequest)

      let result = await rateLimiter.check(mockRequest)
      expect(result.allowed).toBe(false)

      // Wait for window to end
      await new Promise(resolve => setTimeout(resolve, windowMs + 10))

      // Should reset in new window
      result = await rateLimiter.check(mockRequest)
      expect(result.allowed).toBe(true)
      expect(result.current).toBe(1)

      rateLimiter.dispose()
    })

    it('should handle partial window overlap in Sliding Window algorithm', async () => {
      const windowMs = 100
      const rateLimiter = new RateLimiter({
        windowMs,
        maxRequests: 3,
        algorithm: 'sliding-window',
      })

      const mockRequest = new Request('https://example.com')

      // Use up 2 of 3 requests
      await rateLimiter.check(mockRequest)
      await rateLimiter.check(mockRequest)

      // Wait for partial window to pass (50% of window)
      await new Promise(resolve => setTimeout(resolve, windowMs / 2))

      // This should still be allowed (3rd request)
      let result = await rateLimiter.check(mockRequest)
      expect(result.allowed).toBe(true)

      // This should be rejected (4th request)
      result = await rateLimiter.check(mockRequest)
      expect(result.allowed).toBe(false)

      // Wait for more time to pass (another 50% of window)
      // Now the first request should be out of window
      await new Promise(resolve => setTimeout(resolve, windowMs / 2 + 5))

      // This should be allowed again
      result = await rateLimiter.check(mockRequest)
      expect(result.allowed).toBe(true)

      rateLimiter.dispose()
    })

    it('should handle token refill rates in Token Bucket algorithm', async () => {
      const windowMs = 100 // 100ms window = 10 tokens per second
      const rateLimiter = new RateLimiter({
        windowMs,
        maxRequests: 5, // bucket size of 5
        algorithm: 'token-bucket',
      })

      const mockRequest = new Request('https://example.com')

      // Use all 5 tokens
      for (let i = 0; i < 5; i++) {
        const result = await rateLimiter.check(mockRequest)
        expect(result.allowed).toBe(true)
      }

      // 6th request should be blocked
      let result = await rateLimiter.check(mockRequest)
      expect(result.allowed).toBe(false)

      // Wait for ~1 token to be refilled (windowMs / maxRequests)
      await new Promise(resolve => setTimeout(resolve, Math.ceil(windowMs / 5) + 5))

      // Now should have 1 token available
      result = await rateLimiter.check(mockRequest)
      expect(result.allowed).toBe(true)

      // Next request should be blocked again
      result = await rateLimiter.check(mockRequest)
      expect(result.allowed).toBe(false)

      rateLimiter.dispose()
    })
  })

  describe('Performance Edge Cases', () => {
    it('should handle high-frequency requests efficiently', async () => {
      const rateLimiter = new RateLimiter({
        windowMs: 1000,
        maxRequests: 1000,
        algorithm: 'fixed-window', // fastest algorithm
      })

      const mockRequest = new Request('https://example.com')
      const requestCount = 100

      const start = performance.now()

      for (let i = 0; i < requestCount; i++) {
        await rateLimiter.check(mockRequest)
      }

      const end = performance.now()
      const avgTimePerRequest = (end - start) / requestCount

      // Average time should be very low (typically < 1ms on most systems)
      expect(avgTimePerRequest).toBeLessThan(1)

      rateLimiter.dispose()
    })

    it('should handle different key patterns efficiently', async () => {
      const rateLimiter = new RateLimiter({
        windowMs: 1000,
        maxRequests: 50,
      })

      // Test with many unique keys
      const keyCount = 100
      const requestsPerKey = 3

      const start = performance.now()

      for (let i = 0; i < keyCount; i++) {
        const mockRequest = new Request(`https://example.com/user/${i}`)

        for (let j = 0; j < requestsPerKey; j++) {
          await rateLimiter.check(mockRequest)
        }
      }

      const end = performance.now()
      const totalRequests = keyCount * requestsPerKey
      const avgTimePerRequest = (end - start) / totalRequests

      // Average time should remain reasonable even with many keys
      expect(avgTimePerRequest).toBeLessThan(2)

      rateLimiter.dispose()
    })
  })

  describe('Security Edge Cases', () => {
    it('should handle spoofed IP addresses correctly', async () => {
      const rateLimiter = new RateLimiter({
        windowMs: 1000,
        maxRequests: 2,
        // Use x-forwarded-for header first, then real IP
        keyGenerator: (request) => {
          const forwardedFor = request.headers.get('x-forwarded-for')
          return forwardedFor?.split(',')[0].trim() || '127.0.0.1'
        },
      })

      // Request with spoofed x-forwarded-for
      const mockRequest1 = new Request('https://example.com', {
        headers: {
          'x-forwarded-for': '1.2.3.4, 5.6.7.8',
        },
      })

      // Request with different spoofed header but same origin IP
      const mockRequest2 = new Request('https://example.com', {
        headers: {
          'x-forwarded-for': '9.10.11.12, 5.6.7.8',
        },
      })

      // Use up limit for first spoofed IP
      await rateLimiter.check(mockRequest1)
      await rateLimiter.check(mockRequest1)
      let result = await rateLimiter.check(mockRequest1)
      expect(result.allowed).toBe(false) // Should be blocked

      // Different spoofed IP should be allowed (different key)
      result = await rateLimiter.check(mockRequest2)
      expect(result.allowed).toBe(true)

      rateLimiter.dispose()
    })

    it('should be resilient to very long keys', async () => {
      const rateLimiter = new RateLimiter({
        windowMs: 1000,
        maxRequests: 5,
        keyGenerator: () => 'a'.repeat(10000), // Very long key
      })

      const mockRequest = new Request('https://example.com')

      // Should still work with very long keys
      const result = await rateLimiter.check(mockRequest)
      expect(result.allowed).toBe(true)

      rateLimiter.dispose()
    })

    it('should handle unicode keys correctly', async () => {
      const rateLimiter = new RateLimiter({
        windowMs: 1000,
        maxRequests: 2,
        keyGenerator: () => '😊🔥🚀', // Unicode emoji key
      })

      const mockRequest = new Request('https://example.com')

      // First two requests should be allowed
      await rateLimiter.check(mockRequest)
      const result = await rateLimiter.check(mockRequest)
      expect(result.allowed).toBe(true)

      // Third request should be blocked
      const blockedResult = await rateLimiter.check(mockRequest)
      expect(blockedResult.allowed).toBe(false)

      rateLimiter.dispose()
    })

    it('should protect against header injection', async () => {
      const rateLimiter = new RateLimiter({
        windowMs: 1000,
        maxRequests: 1,
      })

      // Create request with key that looks like an HTTP header injection attempt
      const maliciousKey = 'X-Injected: malicious\nX-Custom-Header: bad'
      const mockRequest = new Request('https://example.com')

      const customLimiter = new RateLimiter({
        windowMs: 1000,
        maxRequests: 1,
        keyGenerator: () => maliciousKey,
      })

      // Use the middleware to generate a response
      await customLimiter.check(mockRequest) // First request allowed
      const result = await customLimiter.check(mockRequest) // Second request blocked
      expect(result.allowed).toBe(false)

      const middleware = customLimiter.middleware()
      const response = await middleware(mockRequest)

      // Response should be generated safely without allowing header injection
      expect(response?.status).toBe(429)

      // Headers should be properly sanitized
      expect(response?.headers.get('X-Injected')).toBeNull()
      expect(response?.headers.get('X-Custom-Header')).toBeNull()

      rateLimiter.dispose()
      customLimiter.dispose()
    })
  })
})
