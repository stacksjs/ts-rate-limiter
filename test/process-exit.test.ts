/**
 * A rate limiter must not keep the process alive.
 *
 * `MemoryStorage` with auto-cleanup starts a `setInterval`, and an interval
 * holds the event loop open on its own. Any script or test run that constructs
 * one therefore never exits: no output, no error, no stack, just a hang with
 * nothing pointing at a rate limiter as the cause. It is the kind of bug that
 * gets blamed on whatever was being debugged at the time.
 *
 * Unref'd, the sweep still runs for as long as there is other work and stops
 * mattering the moment there is not.
 */

import { describe, expect, test } from 'bun:test'
import { MemoryStorage } from '../src/drivers/memory'

describe('the cleanup timer does not hold the process open', () => {
  test('a storage with auto-cleanup unrefs its interval', () => {
    const storage = new MemoryStorage({ enableAutoCleanup: true, cleanupIntervalMs: 60_000 })

    const timer = (storage as unknown as { cleanupTimer: { unref?: () => void } | null }).cleanupTimer
    expect(timer).not.toBeNull()

    // `hasRef` is how a Node/Bun timer reports it. Where it is unavailable the
    // assertion above is all this runtime can offer.
    const reffable = timer as unknown as { hasRef?: () => boolean }
    if (typeof reffable.hasRef === 'function')
      expect(reffable.hasRef()).toBeFalse()

    storage.dispose()
  })

  test('dispose clears the timer and can be called twice', () => {
    const storage = new MemoryStorage({ enableAutoCleanup: true })

    storage.dispose()
    expect((storage as unknown as { cleanupTimer: unknown }).cleanupTimer).toBeNull()

    // Disposing an already-disposed storage is a normal thing for teardown code
    // to do and must not throw.
    expect(() => storage.dispose()).not.toThrow()
  })

  test('a process that only creates a limiter exits on its own', async () => {
    // The real assertion: run it in a subprocess and require that it finishes.
    // Everything above checks the mechanism; this checks the behaviour that
    // actually matters, and it is what fails if a second un-unref'd timer is
    // added somewhere else later.
    const script = `
      import { MemoryStorage, RateLimiter } from '${new URL('../src/index.ts', import.meta.url).pathname}'
      const limiter = new RateLimiter({
        windowMs: 1000,
        maxRequests: 2,
        algorithm: 'sliding-window',
        storage: new MemoryStorage({ enableAutoCleanup: true, trackTimestamps: true }),
      })
      const first = await limiter.consume('k')
      const second = await limiter.consume('k')
      const third = await limiter.consume('k')
      console.log(JSON.stringify([first.allowed, second.allowed, third.allowed]))
    `

    const proc = Bun.spawn(['bun', '-e', script], { stdout: 'pipe', stderr: 'pipe' })

    const exited = await Promise.race([
      proc.exited,
      new Promise<'timeout'>(resolve => setTimeout(() => resolve('timeout'), 10_000)),
    ])

    if (exited === 'timeout') {
      proc.kill()
      throw new Error('a process that only created a rate limiter did not exit within 10s')
    }

    const output = await new Response(proc.stdout).text()
    expect(JSON.parse(output.trim())).toEqual([true, true, false])
  }, 20_000)
})
