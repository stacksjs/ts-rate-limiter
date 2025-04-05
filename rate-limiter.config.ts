import type { RateLimiterConfig } from './src/types'

const config: RateLimiterConfig = {
  verbose: true,
  defaultStorage: 'memory',
  defaultAlgorithm: 'sliding-window',
}

export default config
