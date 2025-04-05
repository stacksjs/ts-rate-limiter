# Storage Providers

`ts-rate-limiter` supports different storage backends to persist rate limiting data. The choice of storage provider depends on your application's requirements and architecture.

## Available Storage Providers

### Memory Storage

The default storage provider is `MemoryStorage`, which stores all rate limiting data in the application's memory.

```ts
import { MemoryStorage, RateLimiter } from 'ts-rate-limiter'

const limiter = new RateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 100,
  storage: new MemoryStorage(),
})
```

#### Advantages

- **Simple**: No external dependencies
- **Fast**: In-memory operations are extremely quick
- **Zero configuration**: Works out of the box

#### Limitations

- **Not distributed**: Only works for a single instance
- **No persistence**: Data is lost on application restart
- **Memory bound**: Large numbers of keys can consume significant memory

### Redis Storage

For applications running on multiple servers or requiring persistence, `RedisStorage` is available to store rate limiting data in Redis.

```ts
import { createClient } from 'redis'
import { RateLimiter, RedisStorage } from 'ts-rate-limiter'

const redisClient = createClient({
  url: 'redis://localhost:6379',
})

await redisClient.connect()

const limiter = new RateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 100,
  storage: new RedisStorage(redisClient),
})
```

#### Advantages

- **Distributed**: Works across multiple application instances
- **Persistence**: Data can survive application restarts
- **Scalable**: Redis is designed to handle large amounts of data

#### Limitations

- **External dependency**: Requires a Redis server
- **Network latency**: Adds a small overhead for Redis communication
- **Configuration**: Requires additional setup

## Custom Storage Providers

You can create your own storage provider by implementing the `Storage` interface:

```ts
import { RateLimitInfo, Storage } from 'ts-rate-limiter'

class CustomStorage implements Storage {
  async increment(key: string, windowMs: number): Promise<RateLimitInfo> {
    // Implementation to increment the counter for the key
    // and return rate limit information
  }

  async decrement(key: string): Promise<void> {
    // Implementation to decrement the counter for the key
  }

  async resetKey(key: string): Promise<void> {
    // Implementation to reset a specific key
  }

  async reset(): Promise<void> {
    // Implementation to reset all keys
  }
}
```

This allows integration with any data store:

- SQL databases
- NoSQL databases
- Other caching systems
- Cloud-based key-value stores

## Storage Selection Guide

| Storage | Use Case |
|---------|----------|
| Memory | Single-instance applications, developer environments, testing |
| Redis | Multi-instance deployments, production environments, high-availability requirements |
| Custom | Specific database requirements, existing infrastructure integration |

## Performance Considerations

Storage choice significantly impacts rate limiter performance:

| Storage | Requests/sec | Latency (avg) |
|---------|-------------|--------------|
| Memory | ~3,000,000 | 0.0003ms |
| Redis | ~10,000 | 0.08ms |

## Implementing Distributed Rate Limiting

When using Redis for distributed applications:

1. **Consistent Redis Configuration**: Ensure all application instances connect to the same Redis server/cluster
2. **Key Naming Strategy**: Use consistent key generation across instances
3. **Redis Persistence**: Configure Redis with appropriate persistence settings
4. **Monitoring**: Set up Redis monitoring for performance and capacity planning

### Example: Connecting to Redis Cluster

```ts
import { createCluster } from 'redis'
import { RateLimiter, RedisStorage } from 'ts-rate-limiter'

const redisCluster = createCluster({
  rootNodes: [
    {
      url: 'redis://redis-node-1:6379',
    },
    {
      url: 'redis://redis-node-2:6379',
    },
    {
      url: 'redis://redis-node-3:6379',
    },
  ],
})

await redisCluster.connect()

const limiter = new RateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 100,
  storage: new RedisStorage(redisCluster),
})
```
