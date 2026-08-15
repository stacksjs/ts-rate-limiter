import type { MemoryStorageOptions, StorageProvider } from '../types'
import { config } from '../config'

/**
 * In-memory storage implementation with optimized performance
 */
export class MemoryStorage implements StorageProvider {
  private records: Map<string, { count: number, resetTime: number }>
  private timestamps: Map<string, number[]>
  private cleanupTimer: NodeJS.Timeout | null
  private enableAutoCleanup: boolean
  private cleanupIntervalMs: number
  // Only track per-request timestamps once the sliding-window count has been
  // requested. For fixed-window / token-bucket the timestamps array is never
  // read, so recording one entry per request is pure unbounded memory growth
  // (a DoS vector for a busy key). We lazily enable it on first sliding-window
  // use so existing callers keep working.
  private trackTimestamps: boolean

  constructor(options?: MemoryStorageOptions) {
    this.records = new Map()
    this.timestamps = new Map()
    this.trackTimestamps = false

    // Use config defaults if options not provided
    const defaultConfig = config.memoryStorage || {}

    this.enableAutoCleanup = options?.enableAutoCleanup ?? defaultConfig.enableAutoCleanup ?? false
    this.cleanupIntervalMs = options?.cleanupIntervalMs ?? defaultConfig.cleanupIntervalMs ?? 60 * 1000
    this.cleanupTimer = null

    if (this.enableAutoCleanup) {
      this.startCleanupTimer()
    }
  }

  async increment(key: string, windowMs: number): Promise<{ count: number, resetTime: number }> {
    const now = Date.now()
    const record = this.records.get(key)

    // If no record exists or window expired, create new record
    if (!record || now > record.resetTime) {
      const newRecord = {
        count: 1,
        resetTime: now + windowMs,
      }
      this.records.set(key, newRecord)
      if (this.trackTimestamps)
        this.timestamps.set(key, [now])
      return newRecord
    }

    // Update existing record
    record.count += 1

    // Store request timestamp for sliding window, trimming entries that have
    // already fallen out of the window so the array stays bounded to the
    // window size instead of growing for the lifetime of the key.
    if (this.trackTimestamps) {
      const windowStart = now - windowMs
      const existing = this.timestamps.get(key)
      const timestamps = existing ? existing.filter(time => time > windowStart) : []
      timestamps.push(now)
      this.timestamps.set(key, timestamps)
    }

    return record
  }

  async reset(key: string): Promise<void> {
    this.records.delete(key)
    this.timestamps.delete(key)
  }

  async getCount(key: string): Promise<number> {
    const record = this.records.get(key)
    return record?.count || 0
  }

  async getSlidingWindowCount(key: string, windowMs: number): Promise<number> {
    // Enabling timestamp tracking on first sliding-window use means the common
    // fixed-window / token-bucket paths never pay the unbounded-memory cost.
    if (!this.trackTimestamps) {
      this.trackTimestamps = true
      // Seed from the current record so requests that were incremented before
      // tracking was enabled are still counted in this window. The record's
      // count reflects requests within the (not-yet-expired) window, so we
      // approximate their timestamps as "now" — they are all in-window.
      const record = this.records.get(key)
      if (record && !this.timestamps.has(key)) {
        const now = Date.now()
        this.timestamps.set(key, Array.from({ length: record.count }, () => now))
      }
    }

    const timestamps = this.timestamps.get(key) || []
    const now = Date.now()
    const windowStart = now - windowMs

    // Filter timestamps within the sliding window
    return timestamps.filter(time => time > windowStart).length
  }

  /**
   * Record a request and return its own position in the window.
   *
   * Atomic by construction: nothing is awaited between reading the window and
   * writing this request into it, so a burst of concurrent callers is handed
   * 1, 2, 3 … in turn. Doing the same work as two awaited calls hands every one
   * of them the post-burst total instead, and a limiter of 120 then refuses all
   * 180 simultaneous requests rather than the 60 over its ceiling.
   */
  async consumeSlidingWindow(key: string, windowMs: number): Promise<{ count: number, resetTime: number }> {
    // Same lazy enable as getSlidingWindowCount: the fixed-window and
    // token-bucket paths never pay for timestamp tracking they do not use.
    if (!this.trackTimestamps) {
      this.trackTimestamps = true
      const record = this.records.get(key)
      if (record && !this.timestamps.has(key)) {
        const seededAt = Date.now()
        this.timestamps.set(key, Array.from({ length: record.count }, () => seededAt))
      }
    }

    const now = Date.now()
    const windowStart = now - windowMs
    const existing = this.timestamps.get(key)
    const timestamps = existing ? existing.filter(time => time > windowStart) : []

    timestamps.push(now)
    this.timestamps.set(key, timestamps)

    // The record is kept in step so `getCount`, cleanup and the fixed-window
    // path still see this request.
    const record = this.records.get(key)
    if (!record || now > record.resetTime)
      this.records.set(key, { count: 1, resetTime: now + windowMs })
    else
      record.count += 1

    return { count: timestamps.length, resetTime: now + windowMs }
  }

  async batchIncrement(keys: string[], windowMs: number): Promise<Map<string, { count: number, resetTime: number }>> {
    const results = new Map<string, { count: number, resetTime: number }>()

    for (const key of keys) {
      const result = await this.increment(key, windowMs)
      results.set(key, result)
    }

    return results
  }

  /**
   * Clean expired records (useful for long-running applications)
   */
  cleanExpired(): void {
    const now = Date.now()

    // Clean records
    for (const [key, record] of this.records.entries()) {
      if (now > record.resetTime) {
        this.records.delete(key)
      }
    }

    // Clean timestamps older than one hour (configurable if needed)
    const maxAge = now - 3600000
    for (const [key, timestamps] of this.timestamps.entries()) {
      const filtered = timestamps.filter(time => time > maxAge)
      if (filtered.length === 0) {
        this.timestamps.delete(key)
      }
      else if (filtered.length !== timestamps.length) {
        this.timestamps.set(key, filtered)
      }
    }
  }

  /**
   * Dispose any resources used by this storage provider
   */
  dispose(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
      this.cleanupTimer = null
    }
  }

  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => this.cleanExpired(), this.cleanupIntervalMs)

    // An interval keeps the event loop alive on its own, so a limiter created
    // anywhere in a script or a test run stops that process from ever exiting -
    // no output, no error, just a hang, and nothing pointing at a rate limiter
    // as the cause. Unref'd, the sweep still runs for as long as there is other
    // work and stops mattering the moment there is not.
    //
    // Guarded because `unref` is a Node and Bun timer method: in a browser or a
    // worker, setInterval returns a number and there is no event loop to hold
    // open in the first place.
    const timer = this.cleanupTimer as unknown as { unref?: () => void }
    if (typeof timer?.unref === 'function')
      timer.unref()
  }
}
