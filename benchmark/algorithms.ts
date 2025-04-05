import { MemoryStorage, RateLimiter } from '../src'

const REQUEST_COUNT = 100000
const WINDOW_MS = 60 * 1000
const MAX_REQUESTS = 1000000 // High limit to avoid hitting the threshold

/**
 * Run a benchmark for a rate limiter implementation
 */
async function runBenchmark(name: string, createLimiter: () => RateLimiter): Promise<void> {
  // eslint-disable-next-line no-console
  console.log(`\nRunning benchmark: ${name}`)

  const limiter = createLimiter()
  const key = '127.0.0.1' // Use the same key for all requests

  // Warmup
  for (let i = 0; i < 1000; i++) {
    await limiter.consume(key)
  }

  // Benchmark
  const start = performance.now()

  for (let i = 0; i < REQUEST_COUNT; i++) {
    await limiter.consume(key)
  }

  const end = performance.now()
  const duration = end - start
  const requestsPerSecond = Math.floor(REQUEST_COUNT / (duration / 1000))
  const latencyMs = duration / REQUEST_COUNT

  // eslint-disable-next-line no-console
  console.log(`Total time: ${duration.toFixed(2)}ms`)
  // eslint-disable-next-line no-console
  console.log(`Requests per second: ${requestsPerSecond.toLocaleString()}`)
  // eslint-disable-next-line no-console
  console.log(`Average latency: ${latencyMs.toFixed(6)}ms`)

  // Cleanup
  limiter.dispose()
}

/**
 * Run all algorithm benchmarks
 */
async function runAlgorithmBenchmarks(): Promise<void> {
  // eslint-disable-next-line no-console
  console.log('=== ts-rate-limiter Algorithm Benchmarks ===')

  // Fixed Window with Memory Storage
  await runBenchmark('Fixed Window / Memory Storage', () => {
    return new RateLimiter({
      windowMs: WINDOW_MS,
      maxRequests: MAX_REQUESTS,
      algorithm: 'fixed-window',
      storage: new MemoryStorage(),
    })
  })

  // Sliding Window with Memory Storage
  await runBenchmark('Sliding Window / Memory Storage', () => {
    return new RateLimiter({
      windowMs: WINDOW_MS,
      maxRequests: MAX_REQUESTS,
      algorithm: 'sliding-window',
      storage: new MemoryStorage(),
    })
  })

  // Token Bucket with Memory Storage
  await runBenchmark('Token Bucket / Memory Storage', () => {
    return new RateLimiter({
      windowMs: WINDOW_MS,
      maxRequests: MAX_REQUESTS,
      algorithm: 'token-bucket',
    })
  })

  // eslint-disable-next-line no-console
  console.log('\nAlgorithm benchmarks complete!')
}

// Run the benchmarks
runAlgorithmBenchmarks().catch((err) => {
  console.error('Benchmark error:', err)
})
