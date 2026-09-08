import { describe, expect, it } from 'bun:test'
import { MemoryStorage, RateLimiter } from '../src'

describe('fixed window under concurrency', () => {
  it('returns each increment position even when callers resume together', async () => {
    const storage = new MemoryStorage({ enableAutoCleanup: false })
    const results = await Promise.all(Array.from({ length: 10 }, () => storage.increment('client', 60_000)))
    expect(results.map(result => result.count)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    expect(new Set(results.map(result => result.resetTime)).size).toBe(1)
    expect(await storage.getCount('client')).toBe(10)
  })

  it('keeps completed results stable and isolates caller mutations', async () => {
    const storage = new MemoryStorage({ enableAutoCleanup: false })
    const first = await storage.increment('client', 60_000)
    const second = await storage.increment('client', 60_000)
    expect(first.count).toBe(1)
    expect(second.count).toBe(2)
    const resetTime = second.resetTime
    first.count = -100
    second.resetTime = 0
    expect(await storage.increment('client', 60_000)).toEqual({ count: 3, resetTime })
    expect(await storage.getCount('client')).toBe(3)
  })

  it('admits exactly the quota from a simultaneous burst', async () => {
    const limiter = new RateLimiter({ maxRequests: 3, windowMs: 60_000, algorithm: 'fixed-window' })
    try {
      const results = await Promise.allSettled(Array.from({ length: 10 }, () => limiter.enforce('client')))
      expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(3)
      expect(results.filter(result => result.status === 'rejected')).toHaveLength(7)
      expect((await limiter.peek('client'))?.current).toBe(10)
    }
    finally {
      limiter.dispose()
    }
  })

  it('preserves positions across warm bursts, distinct keys and resets', async () => {
    const limiter = new RateLimiter({ maxRequests: 3, windowMs: 60_000, algorithm: 'fixed-window' })
    try {
      expect((await limiter.consume('client')).current).toBe(1)
      const results = await Promise.all(Array.from({ length: 4 }, () => limiter.consume('client')))
      expect(results.map(result => result.current)).toEqual([2, 3, 4, 5])
      expect(results.map(result => result.allowed)).toEqual([true, true, false, false])
      expect((await limiter.consume('other')).allowed).toBe(true)
      await limiter.reset('client')
      const reset = await limiter.consume('client')
      expect(reset.current).toBe(1)
      expect(reset.allowed).toBe(true)
    }
    finally {
      limiter.dispose()
    }
  })
})
