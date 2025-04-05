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

// eslint-disable-next-line antfu/no-top-level-await
export const config: RateLimiterConfig = await loadConfig({
  name: 'rate-limiter',
  defaultConfig,
})
