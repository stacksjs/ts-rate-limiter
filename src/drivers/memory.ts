import type { StorageProvider } from '../types'

/**
 * In-memory storage implementation with optimized performance
 */
export class MemoryStorage implements StorageProvider {
  private records: Map<string, { count: number, resetTime: number }>
  private timestamps: Map<string, number[]>
  private cleanupInterval?: NodeJS.Timeout

  constructor(options: { enableAutoCleanup?: boolean, cleanupIntervalMs?: number } = {}) {
    this.records = new Map()
    this.timestamps = new Map()

    // Setup automatic cleanup if enabled
    if (options.enableAutoCleanup) {
      const interval = options.cleanupIntervalMs || 60000 // Default: clean every minute
      this.cleanupInterval = setInterval(() => this.cleanExpired(), interval)
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
      this.timestamps.set(key, [now])
      return newRecord
    }

    // Update existing record
    record.count += 1

    // Store request timestamp for sliding window if needed
    const timestamps = this.timestamps.get(key) || []
    timestamps.push(now)
    this.timestamps.set(key, timestamps)

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
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
    }
  }
}
