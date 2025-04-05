# Get Started

There are two ways of using this reverse proxy: _as a library or as a CLI._

## Library

Given the npm package is installed:

```ts
import type { TlsConfig } from '@stacksjs/rpx'
import { startProxy } from '@stacksjs/rpx'

export interface CleanupConfig {
  hosts: boolean // clean up /etc/hosts, defaults to false
  certs: boolean // clean up certificates, defaults to false
}

export interface ReverseProxyConfig {
  from: string // domain to proxy from, defaults to localhost:3000
  to: string // domain to proxy to, defaults to stacks.localhost
  cleanUrls?: boolean // removes the .html extension from URLs, defaults to false
  https: boolean | TlsConfig // automatically uses https, defaults to true, also redirects http to https
  cleanup?: boolean | CleanupConfig // automatically cleans up /etc/hosts, defaults to false
  verbose: boolean // log verbose output, defaults to false
}

const config: ReverseProxyOptions = {
  from: 'localhost:3000',
  to: 'my-docs.localhost',
  cleanUrls: true,
  https: true,
  cleanup: false,
}

startProxy(config)
```

In case you are trying to start multiple proxies, you may use this configuration:

```ts
// reverse-proxy.config.{ts,js}
import type { ReverseProxyOptions } from '@stacksjs/rpx'
import os from 'node:os'
import path from 'node:path'

const config: ReverseProxyOptions = {
  https: { // https: true -> also works with sensible defaults
    caCertPath: path.join(os.homedir(), '.stacks', 'ssl', `stacks.localhost.ca.crt`),
    certPath: path.join(os.homedir(), '.stacks', 'ssl', `stacks.localhost.crt`),
    keyPath: path.join(os.homedir(), '.stacks', 'ssl', `stacks.localhost.crt.key`),
  },

  cleanup: {
    hosts: true,
    certs: false,
  },

  proxies: [
    {
      from: 'localhost:5173',
      to: 'my-app.localhost',
      cleanUrls: true,
    },
    {
      from: 'localhost:5174',
      to: 'my-api.local',
    },
  ],

  verbose: true,
}

export default config
```

## CLI

```bash
rpx --from localhost:3000 --to my-project.localhost
rpx --from localhost:8080 --to my-project.test --keyPath ./key.pem --certPath ./cert.pem
rpx --help
rpx --version
```

## Testing

```bash
bun test
```

# Usage

Learn how to use TypeScript Rate Limiter in your application.

## Basic Usage

The simplest way to use the rate limiter is with the default memory storage and fixed window algorithm:

```ts
import { RateLimiter } from 'ts-rate-limiter'

// Create a rate limiter with 100 requests per minute
const limiter = new RateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 100 // limit each IP to 100 requests per windowMs
})

// In your Bun server
const server = Bun.serve({
  port: 3000,
  async fetch(req) {
    // Use as middleware
    const limiterResponse = await limiter.middleware()(req)
    if (limiterResponse) {
      return limiterResponse // Returns 429 Too Many Requests if rate limit exceeded
    }

    // Continue with your normal request handling
    return new Response('Hello World')
  }
})
```

## Checking Rate Limits

You can manually check if a request is rate limited without immediately returning a response:

```ts
import { RateLimiter } from 'ts-rate-limiter'

const limiter = new RateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 100,
})

async function handleRequest(req: Request) {
  const result = await limiter.check(req)

  if (!result.allowed) {
    console.log(`Rate limit exceeded: ${result.current}/${result.limit}`)
    console.log(`Reset in ${Math.ceil(result.remaining / 1000)} seconds`)

    // Handle rate limiting in your own way
    return new Response('Too many requests', { status: 429 })
  }

  // Process the request normally
  return new Response('Request processed')
}
```

## Using Different Algorithms

You can choose between three different rate limiting algorithms:

```ts
// Fixed Window (default)
const fixedWindowLimiter = new RateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 100,
  algorithm: 'fixed-window',
})

// Sliding Window (more accurate)
const slidingWindowLimiter = new RateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 100,
  algorithm: 'sliding-window',
})

// Token Bucket (allows bursts)
const tokenBucketLimiter = new RateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 100,
  algorithm: 'token-bucket',
})
```

## Using Redis Storage

For distributed applications running on multiple servers, use Redis storage:

```ts
import { createClient } from 'redis'
import { RateLimiter, RedisStorage } from 'ts-rate-limiter'

// Create Redis client
const redisClient = createClient({
  url: 'redis://redis-server:6379'
})
await redisClient.connect()

// Create Redis storage
const storage = new RedisStorage({
  client: redisClient,
  keyPrefix: 'ratelimit:',
  enableSlidingWindow: true
})

// Create rate limiter with Redis storage
const limiter = new RateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 100,
  storage,
  algorithm: 'sliding-window'
})
```

## Custom Key Generation

You can customize how keys are generated, for example, to limit by user ID instead of IP:

```ts
const userLimiter = new RateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 50,
  keyGenerator: (req) => {
    const userId = getUserIdFromRequest(req)
    return userId || req.headers.get('x-forwarded-for') || '127.0.0.1'
  }
})
```

## Skipping Certain Requests

You can skip rate limiting for certain requests:

```ts
const limiter = new RateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 100,
  skip: (req) => {
    // Skip rate limiting for health checks and static assets
    const url = new URL(req.url)
    return url.pathname === '/health' || url.pathname.startsWith('/static/')
  }
})
```

## Custom Response Handling

You can customize the response when rate limiting is triggered:

```ts
const limiter = new RateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 100,
  handler: (req, result) => {
    return new Response(JSON.stringify({
      error: 'Too many requests',
      retryAfter: Math.ceil(result.remaining / 1000),
    }), {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': Math.ceil(result.remaining / 1000).toString(),
      }
    })
  }
})
```

## Draft Mode

During testing or development, you might want to monitor rate limiting without actually blocking requests:

```ts
const limiter = new RateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 100,
  draftMode: process.env.NODE_ENV !== 'production',
})
```

## Next Steps

- [Explore the configuration options](/config)
- [Learn about different algorithms](/features/algorithms)
- [See advanced examples](/advanced/examples)
