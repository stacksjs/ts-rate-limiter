/**
 * The sliding window, when requests arrive together.
 *
 * Every other test in this repo charges the limiter one awaited call at a
 * time. That is the one traffic shape a flood never has, and it hid a bug that
 * inverted the limiter's behaviour under load.
 *
 * `checkSlidingWindow` used to record a request through one awaited call and
 * read the window's count through a second. Between the two, every other
 * in-flight request got recorded as well - so each caller read the total AFTER
 * the whole burst had landed, and each concluded it was over the limit. A
 * limiter configured for 120 admitted none of 180 simultaneous requests.
 *
 * That is worse than the over-admitting bug people expect from a racy limiter.
 * A ceiling that lets a few extra through is a rounding error; one that refuses
 * everybody the moment traffic becomes concurrent is an outage, and it fires
 * precisely when a customer is busiest.
 */
import { describe, expect, it } from 'bun:test'
import { MemoryStorage, RateLimiter } from '../src'

function makeLimiter(maxRequests: number, windowMs = 10_000): RateLimiter {
  return new RateLimiter({
    windowMs,
    maxRequests,
    algorithm: 'sliding-window',
    storage: new MemoryStorage({ enableAutoCleanup: false }),
  })
}

describe('sliding window under concurrency', () => {
  it('admits up to the ceiling when the whole burst arrives at once', async () => {
    const limiter = makeLimiter(120)

    const results = await Promise.all(
      Array.from({ length: 180 }, () => limiter.consume('burst')),
    )
    const admitted = results.filter(result => result.allowed).length

    expect(admitted).toBe(120)
  })

  it('numbers concurrent callers in turn rather than giving them all the total', async () => {
    // The property underneath the assertion above. Each caller must come back
    // with its own position, so the counts across a burst are 1..n with no
    // duplicates - not n repeated n times.
    const limiter = makeLimiter(1000)

    const results = await Promise.all(
      Array.from({ length: 50 }, () => limiter.consume('positions')),
    )
    const counts = results.map(result => result.current).sort((a, b) => a - b)

    expect(counts).toEqual(Array.from({ length: 50 }, (_, index) => index + 1))
  })

  it('does not overshoot when a burst lands in several waves', async () => {
    const limiter = makeLimiter(100)

    for (let wave = 0; wave < 3; wave++)
      await Promise.all(Array.from({ length: 60 }, () => limiter.consume('waves')))

    // 180 requests against a ceiling of 100, so the last request is refused
    // whichever wave it arrived in.
    expect((await limiter.consume('waves')).allowed).toBe(false)
  })

  it('keeps a burst on one key away from another', async () => {
    const limiter = makeLimiter(50)

    await Promise.all(Array.from({ length: 200 }, () => limiter.consume('loud')))

    expect((await limiter.consume('loud')).allowed).toBe(false)
    expect((await limiter.consume('quiet')).allowed).toBe(true)
  })

  it('still admits a burst that fits inside the ceiling', async () => {
    // The regression that started this: traffic well under the limit being
    // refused merely for being parallel. A page load firing 40 events at once
    // against a limit of 120 must not see a single refusal.
    const limiter = makeLimiter(120)

    const results = await Promise.all(
      Array.from({ length: 40 }, () => limiter.consume('within')),
    )

    expect(results.every(result => result.allowed)).toBe(true)
  })
})

describe('a storage provider without the atomic method', () => {
  it('still works, on the sequential path', async () => {
    // `consumeSlidingWindow` is optional, so a provider written before it
    // existed has to keep working. It is the concurrent case that provider
    // cannot get right, which is why the interface documents the requirement.
    const legacy = new MemoryStorage({ enableAutoCleanup: false })
    Object.defineProperty(legacy, 'consumeSlidingWindow', { value: undefined })

    const limiter = new RateLimiter({
      windowMs: 10_000,
      maxRequests: 3,
      algorithm: 'sliding-window',
      storage: legacy,
    })

    expect((await limiter.consume('legacy')).allowed).toBe(true)
    expect((await limiter.consume('legacy')).allowed).toBe(true)
    expect((await limiter.consume('legacy')).allowed).toBe(true)
    expect((await limiter.consume('legacy')).allowed).toBe(false)
  })
})
