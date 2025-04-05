import process from 'node:process'
import { createClient } from 'redis'
import { RateLimiter, RedisStorage } from '../src'

const REQUEST_COUNT = 10000
const WINDOW_MS = 60 * 1000
const MAX_REQUESTS = 1000000 // High limit to avoid hitting the threshold

/**
 * Run a benchmark for a rate limiter implementation with Redis
 */
async function runBenchmark(name: string, createLimiter: () => Promise<RateLimiter>): Promise<void> {
  // eslint-disable-next-line no-console
  console.log(`\nRunning benchmark: ${name}`)

  const limiter = await createLimiter()
  const key = '127.0.0.1' // Use the same key for all requests

  // Warmup
  for (let i = 0; i < 100; i++) {
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
 * Run Redis benchmarks
 */
async function runRedisBenchmarks(): Promise<void> {
  // eslint-disable-next-line no-console
  console.log('=== ts-rate-limiter Redis Benchmarks ===')
  // eslint-disable-next-line no-console
  console.log('Connecting to Redis...')

  // Create Redis client
  const redisClient = createClient({
    url: 'redis://localhost:6379',
  })

  redisClient.on('error', (err: Error) => {
    console.error('Redis client error:', err.message)
  })

  await redisClient.connect()
  // eslint-disable-next-line no-console
  console.log('Connected to Redis')

  try {
    // Fixed Window with Redis Storage
    await runBenchmark('Fixed Window / Redis Storage', async () => {
      const storage = new RedisStorage({
        client: redisClient,
        keyPrefix: 'benchmark:',
      })

      return new RateLimiter({
        windowMs: WINDOW_MS,
        maxRequests: MAX_REQUESTS,
        algorithm: 'fixed-window',
        storage,
      })
    })

    // Sliding Window with Redis Storage
    await runBenchmark('Sliding Window / Redis Storage', async () => {
      const storage = new RedisStorage({
        client: redisClient,
        keyPrefix: 'benchmark:',
        enableSlidingWindow: true,
      })

      return new RateLimiter({
        windowMs: WINDOW_MS,
        maxRequests: MAX_REQUESTS,
        algorithm: 'sliding-window',
        storage,
      })
    })

    // Token Bucket with Redis Storage
    await runBenchmark('Token Bucket / Redis Storage', async () => {
      const storage = new RedisStorage({
        client: redisClient,
        keyPrefix: 'benchmark:',
      })

      return new RateLimiter({
        windowMs: WINDOW_MS,
        maxRequests: MAX_REQUESTS,
        algorithm: 'token-bucket',
        storage,
      })
    })

    // Connection Pool Size Test is not applicable with current Redis client
    // eslint-disable-next-line no-console
    console.log('\nNote: Connection pool testing is skipped as the current Redis client does not support connection pooling in the same way.')
  }
  finally {
    // Clean up
    // eslint-disable-next-line no-console
    console.log('\nCleaning up Redis connections')
    await redisClient.disconnect()
  }

  // eslint-disable-next-line no-console
  console.log('\nRedis benchmarks complete!')
}

// Check if Redis is available and run the benchmarks
async function checkRedisAndRunBenchmarks(): Promise<void> {
  try {
    const client = createClient({
      url: 'redis://localhost:6379',
      socket: {
        connectTimeout: 1000,
        reconnectStrategy: false,
      },
    })

    client.on('error', (err: Error) => {
      console.error('Redis connection error:', err.message)

      console.error('Make sure Redis is running on localhost:6379')
      process.exit(1)
    })

    await client.connect()
    await client.ping()
    await client.disconnect()

    // Redis is available, run benchmarks
    await runRedisBenchmarks()
  }
  catch (error) {
    console.error('Redis benchmark error:', error)

    console.error('Make sure Redis is running on localhost:6379')
    process.exit(1)
  }
}

// Run the redis benchmarks
checkRedisAndRunBenchmarks().catch((err: Error) => {
  console.error('Redis benchmark script error:', err.message)
})
