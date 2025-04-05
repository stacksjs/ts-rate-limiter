import type { RateLimiterConfig } from './types'
import { loadConfig } from 'bunfig'

export const defaultConfig: RateLimiterConfig = {
  verbose: true,
  storage: 'memory',
  algorithm: 'fixed-window',
}

// eslint-disable-next-line antfu/no-top-level-await
export const config: RateLimiterConfig = await loadConfig({
  name: 'rate-limiter',
  defaultConfig,
})
