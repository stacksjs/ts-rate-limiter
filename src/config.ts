import type { RateLimiterConfig } from './types'
import { loadConfig } from 'bunfig'

export const defaultConfig: RateLimiterConfig = {
  verbose: true,
  storage: 'memory',
  algorithm: 'fixed-window',
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 100, // 100 requests per minute
  standardHeaders: true,
  legacyHeaders: true,
  draftMode: false,
  redisKeyPrefix: 'ratelimit:',
  memoryStorage: {
    enableAutoCleanup: true,
    cleanupIntervalMs: 60 * 1000, // Clean up every minute
  },
  redis: {
    url: 'redis://localhost:6379',
    enableSlidingWindow: false,
  },
}

// Lazy-loaded config to avoid top-level await (enables bun --compile)
let _config: RateLimiterConfig | null = null

export async function getConfig(): Promise<RateLimiterConfig> {
  if (!_config) {
    _config = await loadConfig({
  name: 'rate-limiter',
  defaultConfig,
})
  }
  return _config
}

// For backwards compatibility - synchronous access with default fallback
export const config: RateLimiterConfig = defaultConfig
