# Rate Limiting Algorithms

ts-rate-limiter supports three rate limiting algorithms, each with different characteristics. Choose based on your use case.

## Algorithm Comparison

| Algorithm | Accuracy | Performance | Memory | Best For |
|-----------|----------|-------------|--------|----------|
| Fixed Window | Moderate | Excellent | Low | Simple rate limiting |
| Sliding Window | High | Good | Higher | Accurate limiting |
| Token Bucket | High | Excellent | Low | Burst-tolerant APIs |

## Fixed Window

The simplest and fastest algorithm. Counts requests in fixed time windows.

### How It Works

```
Window 1: [00:00 - 01:00] Window 2: [01:00 - 02:00]
|---- 100 requests ----|  |---- 100 requests ----|
```

Requests are counted within fixed time intervals. When a new window starts, the counter resets.

### Configuration

```typescript
import { RateLimiter } from 'ts-rate-limiter'

const limiter = new RateLimiter({
  windowMs: 60 * 1000, // 1 minute windows
  maxRequests: 100,
  algorithm: 'fixed-window'
})
```

### Pros

- **Fast** - Simple counter increment
- **Low memory** - Just stores a count per key
- **Predictable** - Easy to understand

### Cons

- **Boundary problem** - 200 requests possible in 2 seconds at window boundary
- **Bursty** - Can allow bursts at window boundaries

### Boundary Problem Example

```
Time:     00:59                       01:01
Window 1: |------ 100 requests -------|
Window 2:                    |------ 100 requests -------|
          <---- 200 requests in 2 seconds ---->
```

A user could make 100 requests at 00:59 and another 100 at 01:01, exceeding the intended rate.

### When to Use

- Simple APIs without strict accuracy requirements
- High-throughput scenarios where performance matters
- Internal services with trusted clients

## Sliding Window

More accurate than fixed window. Considers request distribution within the window.

### How It Works

```
Current time: 01:30
Window spans: [00:30 - 01:30]
              |<---- 60 seconds ---->|

Weighted count = current_window_count * 0.5 + previous_window_count * 0.5
```

Combines counts from current and previous windows based on how much time has passed.

### Configuration

```typescript
import { RateLimiter } from 'ts-rate-limiter'

const limiter = new RateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 100,
  algorithm: 'sliding-window'
})
```

### How Counting Works

At 01:30 (30 seconds into the current window):

- Previous window (00:00-01:00): 60 requests
- Current window (01:00-02:00): 40 requests
- Position: 50% into current window

Weighted count:
```
count = 40 + (60 * 0.5) = 70 requests
```

### Pros

- **Accurate** - No boundary problem
- **Fair** - Smooth rate limiting
- **Standard** - Widely understood

### Cons

- **Slower** - More computation per request
- **More memory** - Stores two windows or timestamps
- **Slightly complex** - Harder to reason about

### When to Use

- Public APIs requiring accurate limiting
- Financial or security-sensitive endpoints
- APIs with strict rate limit requirements

## Token Bucket

Models rate limits as tokens that refill at a constant rate. Allows controlled bursts.

### How It Works

```
Bucket capacity: 100 tokens
Refill rate: 1.67 tokens/second (100 per minute)

Initial state:
[100 tokens] ████████████████████████████████████

After 5 requests:
[95 tokens]  ████████████████████████████████░░░░

After 10 seconds:
[111 tokens] (capped at 100) ████████████████████████████████████
```

- Each request consumes 1 token
- Tokens refill at a constant rate
- Bucket has maximum capacity

### Configuration

```typescript
import { RateLimiter } from 'ts-rate-limiter'

const limiter = new RateLimiter({
  windowMs: 60 * 1000, // Defines refill period
  maxRequests: 100,    // Bucket capacity
  algorithm: 'token-bucket'
})

// Refill rate = 100 tokens / 60 seconds = 1.67 tokens/second
```

### Token Bucket Properties

```typescript
interface TokenBucketOptions {
  capacity: number    // Maximum tokens (burst size)
  refillRate: number  // Tokens per millisecond
}

// Internally calculated:
// refillRate = maxRequests / windowMs
```

### Burst Behavior

```typescript
// Example: 100 requests/minute with token bucket

// At start (full bucket):
// - Can burst 100 requests instantly
// - Then rate-limited to ~1.67 req/sec

// After 30 seconds of no requests:
// - Bucket refills 50 tokens
// - Can burst 50 requests
```

### Pros

- **Burst-friendly** - Allows short bursts within capacity
- **Smooth** - Consistent refill rate
- **Fast** - Simple math operations
- **Low memory** - Just stores token count and timestamp

### Cons

- **Less predictable** - Burst behavior can be confusing
- **Capacity limits** - Can't exceed bucket size instantly

### When to Use

- APIs that need to tolerate bursts
- Mobile apps with batched requests
- Webhook endpoints
- APIs with variable traffic patterns

## Choosing an Algorithm

### Decision Guide

```
Need maximum performance?
└── Yes → Fixed Window
└── No → Continue

Need to allow bursts?
└── Yes → Token Bucket
└── No → Continue

Need accurate limiting?
└── Yes → Sliding Window
└── No → Fixed Window
```

### Use Case Examples

#### API Gateway

```typescript
// Use sliding window for accurate public API limiting
const limiter = new RateLimiter({
  algorithm: 'sliding-window',
  windowMs: 60 * 1000,
  maxRequests: 100
})
```

#### Login Endpoint

```typescript
// Use fixed window for simple brute-force protection
const authLimiter = new RateLimiter({
  algorithm: 'fixed-window',
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 5
})
```

#### Mobile API

```typescript
// Use token bucket to allow app launch bursts
const mobileLimiter = new RateLimiter({
  algorithm: 'token-bucket',
  windowMs: 60 * 1000,
  maxRequests: 100 // Burst capacity
})
```

#### Webhook Receiver

```typescript
// Use token bucket for variable incoming traffic
const webhookLimiter = new RateLimiter({
  algorithm: 'token-bucket',
  windowMs: 60 * 1000,
  maxRequests: 1000
})
```

## Algorithm Details

### Fixed Window Implementation

```typescript
async checkFixedWindow(key: string): Promise<RateLimitResult> {
  const { count, resetTime } = await storage.increment(key, windowMs)

  return {
    allowed: count <= maxRequests,
    current: count,
    limit: maxRequests,
    remaining: Math.max(0, resetTime - Date.now()),
    resetTime
  }
}
```

### Sliding Window Implementation

```typescript
async checkSlidingWindow(key: string): Promise<RateLimitResult> {
  // Increment current window
  await storage.increment(key, windowMs)

  // Get weighted count across windows
  const count = await storage.getSlidingWindowCount(key, windowMs)

  return {
    allowed: count <= maxRequests,
    current: count,
    limit: maxRequests,
    remaining: windowMs,
    resetTime: Date.now() + windowMs
  }
}
```

### Token Bucket Implementation

```typescript
async checkTokenBucket(key: string): Promise<RateLimitResult> {
  const now = Date.now()
  let bucket = buckets.get(key)

  if (!bucket) {
    bucket = { tokens: capacity, lastRefill: now }
    buckets.set(key, bucket)
  }

  // Refill tokens
  const elapsed = now - bucket.lastRefill
  bucket.tokens = Math.min(
    bucket.tokens + elapsed * refillRate,
    capacity
  )
  bucket.lastRefill = now

  // Check and consume
  const allowed = bucket.tokens >= 1
  if (allowed) bucket.tokens -= 1

  return {
    allowed,
    current: capacity - Math.floor(bucket.tokens),
    limit: capacity,
    remaining: /* time until next token */,
    resetTime: /* when bucket will be full */
  }
}
```

## Custom Algorithms

You can implement custom rate limiting by providing a custom storage provider:

```typescript
import { StorageProvider, RateLimiter } from 'ts-rate-limiter'

class LeakyBucketStorage implements StorageProvider {
  async increment(key: string, windowMs: number) {
    // Implement leaky bucket logic
    return { count: 1, resetTime: Date.now() + windowMs }
  }

  async reset(key: string) {
    // Reset implementation
  }
}

const limiter = new RateLimiter({
  storage: new LeakyBucketStorage(),
  windowMs: 60 * 1000,
  maxRequests: 100
})
```

## Performance Tips

### Fixed Window

```typescript
// Fastest option - use for high-throughput
const limiter = new RateLimiter({
  algorithm: 'fixed-window',
  // Memory storage is fastest
  storage: new MemoryStorage()
})
```

### Sliding Window

```typescript
// Enable Redis for distributed sliding window
const limiter = new RateLimiter({
  algorithm: 'sliding-window',
  storage: new RedisStorage({
    client: redis,
    enableSlidingWindow: true // Required
  })
})
```

### Token Bucket

```typescript
// Token bucket with memory is very fast
const limiter = new RateLimiter({
  algorithm: 'token-bucket'
  // Uses in-memory Map for bucket state
})
```

## Combining Algorithms

Apply multiple rate limits with different algorithms:

```typescript
// Strict per-minute limit
const minuteLimiter = new RateLimiter({
  algorithm: 'sliding-window',
  windowMs: 60 * 1000,
  maxRequests: 60
})

// Burst-friendly per-second limit
const secondLimiter = new RateLimiter({
  algorithm: 'token-bucket',
  windowMs: 1000,
  maxRequests: 10
})

async function checkRateLimits(request: Request) {
  const minuteResult = await minuteLimiter.check(request)
  if (!minuteResult.allowed) return minuteResult

  const secondResult = await secondLimiter.check(request)
  return secondResult
}
```
