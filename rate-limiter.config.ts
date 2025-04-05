import type { RateLimiterConfig } from './src/types'

const config: RateLimiterConfig = {
  // Core Settings
  verbose: true,
  storage: 'memory',
  algorithm: 'sliding-window',

  // Default Limits
  windowMs: 60 * 1000, // 1 minute window
  maxRequests: 100, // 100 requests per window

  // Response Settings
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: true, // Return rate limit info in the `X-RateLimit-*` headers

  // Testing/Development
  draftMode: false, // Set to true to record but not block requests

  // Memory Storage Options
  memoryStorage: {
    enableAutoCleanup: true,
    cleanupIntervalMs: 60 * 1000, // 1 minute
  },

  // Redis Options (when storage is 'redis')
  redisKeyPrefix: 'ratelimit:',
  redis: {
    url: 'redis://localhost:6379',
    enableSlidingWindow: true,
  },
}

export default config
