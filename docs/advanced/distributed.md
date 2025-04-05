# Distributed Rate Limiting

When your application scales to multiple instances, standard in-memory rate limiting is no longer effective because each instance maintains its own counters. TypeScript Rate Limiter provides robust support for distributed rate limiting to ensure consistent rate limiting across your entire application.

## Understanding the Challenge

In a distributed environment:

- Multiple application instances run simultaneously
- Each instance handles different requests
- Users may connect to different instances for each request
- In-memory rate limiting would treat the same user as different users across instances

## Solution: Shared Storage

TypeScript Rate Limiter solves this problem by using a shared storage backend (Redis) to maintain rate limiting data across all instances.

## Redis Storage Implementation

### Setting Up Redis Storage

```ts
import { createClient } from 'redis'
import { RateLimiter, RedisStorage } from 'ts-rate-limiter'

// Create a Redis client
const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379',
})

// Connect to Redis
await redisClient.connect()

// Create rate limiter with Redis storage
const limiter = new RateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 100,
  storage: new RedisStorage(redisClient),
})
```

### Redis Key Management

When using Redis storage, TypeScript Rate Limiter:

1. Creates keys with a common prefix (`ts-rate-limiter:`)
2. Includes the identifier (IP or custom key) in the key name
3. Sets appropriate TTL (Time To Live) values for automatic cleanup
4. Uses atomic Redis operations to ensure accuracy

### Key Structure

```
ts-rate-limiter:{algorithm}:{identifier}
```

For example:

```
ts-rate-limiter:fixed-window:127.0.0.1
ts-rate-limiter:sliding-window:user_123
ts-rate-limiter:token-bucket:api_key_456
```

## Deployment Architectures

### Basic Architecture

![Basic Redis Architecture](/images/basic-redis-arch.png)

In this setup:

- Multiple application instances connect to a single Redis server
- All rate limiting data is centralized
- Redis handles the synchronization

### High-Availability Architecture

![High Availability Redis Architecture](/images/ha-redis-arch.png)

For production environments:

- Redis cluster with multiple nodes
- Redis Sentinel for automatic failover
- Higher throughput and reliability

## Redis Cluster Configuration

```ts
import { createCluster } from 'redis'
import { RateLimiter, RedisStorage } from 'ts-rate-limiter'

const redisCluster = createCluster({
  rootNodes: [
    { url: 'redis://redis-node-1:6379' },
    { url: 'redis://redis-node-2:6379' },
    { url: 'redis://redis-node-3:6379' },
  ],
  defaults: {
    socket: {
      reconnectStrategy: retries => Math.min(retries * 50, 1000),
    },
  },
})

await redisCluster.connect()

const limiter = new RateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 100,
  storage: new RedisStorage(redisCluster),
})
```

## Redis Sentinel Configuration

```ts
import { createClient } from 'redis'
import { RateLimiter, RedisStorage } from 'ts-rate-limiter'

const redisClient = createClient({
  url: 'redis://my-main',
  socket: {
    reconnectStrategy: retries => Math.min(retries * 50, 1000),
  },
  sentinels: [
    { host: 'sentinel-1', port: 26379 },
    { host: 'sentinel-2', port: 26379 },
    { host: 'sentinel-3', port: 26379 },
  ],
  name: 'my-main',
})

await redisClient.connect()

const limiter = new RateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 100,
  storage: new RedisStorage(redisClient),
})
```

## Performance Considerations

When implementing distributed rate limiting:

1. **Redis Connection Pool**: Use connection pools to improve performance
2. **Redis Proximity**: Keep Redis instances close to your application servers
3. **Algorithm Choice**: Fixed Window is more efficient with Redis than Sliding Window
4. **Key Expiration**: Tune TTL settings based on your window sizes
5. **Monitoring**: Set up Redis monitoring to detect bottlenecks

### Connection Pool Example

```ts
import { createClient } from 'redis'
import { RateLimiter, RedisStorage } from 'ts-rate-limiter'

// Create a connection pool
const redisClients = Array.from({ length: 10 }).fill(0).map(() => {
  const client = createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  })
  client.connect()
  return client
})

// Create a simple round-robin client selector
let currentClientIndex = 0
function getNextClient() {
  const client = redisClients[currentClientIndex]
  currentClientIndex = (currentClientIndex + 1) % redisClients.length
  return client
}

// Create a custom Redis storage with connection pooling
class PooledRedisStorage extends RedisStorage {
  constructor() {
    super(getNextClient())
  }

  async getClient() {
    return getNextClient()
  }
}

const limiter = new RateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 100,
  storage: new PooledRedisStorage(),
})
```

## Handling Redis Failures

To ensure resilience when Redis is temporarily unavailable:

```ts
import { createClient } from 'redis'
import { MemoryStorage, RateLimiter, RedisStorage } from 'ts-rate-limiter'

// Create Redis client
const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379',
})

// Create storage providers
const redisStorage = new RedisStorage(redisClient)
const memoryStorage = new MemoryStorage()

// Create failover storage class
class FailoverStorage {
  private primaryStorage: RedisStorage
  private fallbackStorage: MemoryStorage
  private isPrimaryAvailable: boolean = false

  constructor(primary: RedisStorage, fallback: MemoryStorage) {
    this.primaryStorage = primary
    this.fallbackStorage = fallback

    // Connect to Redis and handle connection events
    this.primaryStorage.getClient().connect().then(() => {
      this.isPrimaryAvailable = true
    }).catch(console.error)

    this.primaryStorage.getClient().on('error', () => {
      this.isPrimaryAvailable = false
    })

    this.primaryStorage.getClient().on('connect', () => {
      this.isPrimaryAvailable = true
    })
  }

  // Implement Storage interface methods
  async increment(key: string, windowMs: number) {
    if (this.isPrimaryAvailable) {
      try {
        return await this.primaryStorage.increment(key, windowMs)
      }
      catch (error) {
        console.error('Redis error, falling back to memory storage:', error)
        return await this.fallbackStorage.increment(key, windowMs)
      }
    }
    return await this.fallbackStorage.increment(key, windowMs)
  }

  async decrement(key: string) {
    if (this.isPrimaryAvailable) {
      try {
        await this.primaryStorage.decrement(key)
      }
      catch (error) {
        await this.fallbackStorage.decrement(key)
      }
    }
    else {
      await this.fallbackStorage.decrement(key)
    }
  }

  async resetKey(key: string) {
    if (this.isPrimaryAvailable) {
      try {
        await this.primaryStorage.resetKey(key)
      }
      catch (error) {
        await this.fallbackStorage.resetKey(key)
      }
    }
    else {
      await this.fallbackStorage.resetKey(key)
    }
  }

  async reset() {
    if (this.isPrimaryAvailable) {
      try {
        await this.primaryStorage.reset()
      }
      catch (error) {
        await this.fallbackStorage.reset()
      }
    }
    else {
      await this.fallbackStorage.reset()
    }
  }
}

// Create rate limiter with failover storage
const limiter = new RateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 100,
  storage: new FailoverStorage(redisStorage, memoryStorage),
})
```

## Best Practices for Distributed Rate Limiting

1. **Consistent Configuration**: Ensure all instances use identical rate limiting configuration
2. **Key Generation**: Use a consistent key generation strategy across instances
3. **Graceful Degradation**: Implement fallback mechanisms for Redis failures
4. **Redis Monitoring**: Set up alerts for Redis performance and availability issues
5. **Rate Limit Headers**: Ensure all instances send consistent rate limit headers
6. **Connection Management**: Properly handle Redis connection lifecycle (connect, disconnect, errors)
7. **Load Testing**: Test your distributed rate limiting under high load with realistic traffic patterns

## Example: Complete Distributed Setup

```ts
import express from 'express'
import { createClient } from 'redis'
import { RateLimiter, RedisStorage } from 'ts-rate-limiter'

// Create a Redis client with error handling
const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379',
  socket: {
    reconnectStrategy: retries => Math.min(retries * 50, 1000),
  },
})

redisClient.on('error', (err) => {
  console.error('Redis connection error:', err)
})

// Connect to Redis
await redisClient.connect()
  .catch((error) => {
    console.error('Failed to connect to Redis:', error)
    process.exit(1)
  })

// Create rate limiter with Redis storage
const apiLimiter = new RateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 100,
  storage: new RedisStorage(redisClient),
  // Custom key generation based on authentication
  keyGenerator: (request) => {
    if (request.headers.authorization) {
      // Use token or API key for identification
      return request.headers.authorization
    }
    // Fall back to IP address
    return request.ip || request.socket.remoteAddress || 'unknown'
  },
})

const app = express()

// Apply rate limiting middleware
app.use('/api', async (req, res, next) => {
  try {
    const result = await apiLimiter.middleware(req)

    // Add rate limit headers
    Object.entries(result.headers).forEach(([key, value]) => {
      res.setHeader(key, value)
    })

    if (result.limited) {
      return res.status(429).json({
        error: 'Too Many Requests',
        retryAfter: result.retryAfter,
      })
    }

    next()
  }
  catch (error) {
    console.error('Rate limiting error:', error)
    // Always allow the request to proceed if rate limiting fails
    next()
  }
})

app.get('/api/data', (req, res) => {
  res.json({ message: 'API data' })
})

app.listen(3000, () => {
  console.log('Server running on port 3000')
})
```
