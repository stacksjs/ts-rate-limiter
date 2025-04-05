# Rate Limiting Algorithms

`ts-rate-limiter` supports three different algorithms, each with its own strengths and use cases.

## Fixed Window

The Fixed Window algorithm is the simplest approach for rate limiting. It counts requests in fixed time intervals.

### How it Works

1. Each time window is a fixed duration (e.g., 60 seconds)
2. Every request increments a counter for the current window
3. When a new window starts, the counter resets to zero
4. If the counter exceeds the limit, requests are rejected

### Example

```ts
import { RateLimiter } from 'ts-rate-limiter'

const limiter = new RateLimiter({
  windowMs: 60 * 1000, // 1 minute window
  maxRequests: 100, // 100 requests per window
  algorithm: 'fixed-window',
})
```

### Advantages

- **Simple to understand**: The concept is straightforward
- **Efficient**: Very low computational overhead
- **Memory efficient**: Only needs to store one counter per key

### Limitations

- **Boundary issues**: Can allow twice the rate limit at the boundary between windows
- **Not fair**: All users get reset at the same time, regardless of when they made their first request

## Sliding Window

The Sliding Window algorithm provides more accurate rate limiting by considering the distribution of requests within the time window.

### How it Works

1. Each request's timestamp is recorded
2. For each request, we count how many requests occurred in the past window (e.g., last 60 seconds)
3. If the count exceeds the limit, the request is rejected

### Example

```ts
import { RateLimiter } from 'ts-rate-limiter'

const limiter = new RateLimiter({
  windowMs: 60 * 1000, // 1 minute sliding window
  maxRequests: 100, // 100 requests per window
  algorithm: 'sliding-window',
})
```

### Advantages

- **More accurate**: Prevents traffic spikes at window boundaries
- **Fair**: Each user's limit is based on their own activity timeline
- **Smooth rate limiting**: Provides a more consistent request rate

### Limitations

- **Higher memory usage**: Needs to store timestamps for each request
- **More CPU intensive**: Requires filtering timestamps for each check
- **More complex**: Implementation is more involved

## Token Bucket

The Token Bucket algorithm models a bucket that continuously fills with tokens at a configured rate.

### How it Works

1. Each bucket has a maximum capacity (the burst size)
2. Tokens are added to the bucket at a constant rate
3. Each request consumes one token from the bucket
4. If there are no tokens available, the request is rejected
5. If the bucket is full, new tokens are discarded

### Example

```ts
import { RateLimiter } from 'ts-rate-limiter'

const limiter = new RateLimiter({
  windowMs: 60 * 1000, // Refill rate calculation (tokens per minute)
  maxRequests: 100, // Bucket capacity
  algorithm: 'token-bucket',
})
```

### Advantages

- **Allows bursts**: Can handle temporary traffic spikes
- **Constant rate**: Maintains average rate over time
- **Natural model**: Intuitive for API rate limiting

### Limitations

- **More state to track**: Needs to store token count and last refill time
- **Configuration complexity**: Need to balance capacity vs rate

## Choosing the Right Algorithm

| Algorithm | Best For | Avoid When |
|-----------|----------|------------|
| Fixed Window | Simple rate limits, performance critical scenarios | Traffic patterns are bursty |
| Sliding Window | Fair distribution, preventing boundary spikes | Memory or CPU is constrained |
| Token Bucket | APIs with occasional burst needs, user experience | Strict maximum concurrent requests required |

## Performance Considerations

The algorithm choice affects performance. In our benchmarks:

| Algorithm | Requests/sec (Memory) | Latency (avg) |
|-----------|-------------|--------------|
| Fixed Window | 2,742,597 | 0.000365ms |
| Sliding Window | 10,287 | 0.097203ms |
| Token Bucket | 5,079,977 | 0.000197ms |

Choose based on your specific requirements and performance needs.
