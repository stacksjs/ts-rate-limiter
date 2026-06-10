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
    }
  }

  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => this.cleanExpired(), this.cleanupIntervalMs)
  }
}
