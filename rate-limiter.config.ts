import type { RateLimiterConfig } from './src/types'

const config: RateLimiterConfig = {
  verbose: true,
  storage: 'memory',
  algorithm: 'sliding-window',
}

export default config
