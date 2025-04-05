# Rate Limiting Headers

TypeScript Rate Limiter provides standardized HTTP headers to communicate rate limit information to clients. These headers help clients understand their current rate limit status and adapt their request patterns accordingly.

## Standard Headers

When the `standardHeaders` option is enabled (default: `true`), the following headers are included in responses:

| Header | Description | Example |
|--------|-------------|---------|
| `RateLimit-Limit` | Maximum number of requests allowed in the current time window | `100` |
| `RateLimit-Remaining` | Number of requests remaining in the current time window | `97` |
| `RateLimit-Reset` | Time when the current rate limit window resets, in Unix time (seconds) | `1644139353` |

These headers follow the [IETF Draft Standard](https://datatracker.ietf.org/doc/html/draft-ietf-httpapi-ratelimit-headers) for HTTP rate limit headers.

## Legacy Headers

When the `legacyHeaders` option is enabled (default: `false`), the following headers are included:

| Header | Description | Example |
|--------|-------------|---------|
| `X-RateLimit-Limit` | Maximum number of requests allowed in the current time window | `100` |
| `X-RateLimit-Remaining` | Number of requests remaining in the current time window | `97` |
| `X-RateLimit-Reset` | Time when the current rate limit window resets, in Unix time (seconds) | `1644139353` |
| `Retry-After` | Seconds remaining until requests can be made again (only sent when rate limited) | `30` |

Legacy headers are provided for compatibility with older clients that may expect these format.

## Example Response Headers

When a request is within the rate limit:

```
HTTP/1.1 200 OK
Content-Type: application/json
RateLimit-Limit: 100
RateLimit-Remaining: 97
RateLimit-Reset: 1644139353
```

When a request exceeds the rate limit:

```
HTTP/1.1 429 Too Many Requests
Content-Type: application/json
RateLimit-Limit: 100
RateLimit-Remaining: 0
RateLimit-Reset: 1644139353
Retry-After: 30
```

## Configuration

You can configure which headers are included in responses:

```ts
import { RateLimiter } from 'ts-rate-limiter'

// Only standard headers (IETF draft)
const limiter = new RateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 100,
  standardHeaders: true,
  legacyHeaders: false, // default
})

// Only legacy headers
const legacyLimiter = new RateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 100,
  standardHeaders: false,
  legacyHeaders: true,
})

// Both standard and legacy headers
const fullLimiter = new RateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 100,
  standardHeaders: true,
  legacyHeaders: true,
})

// No headers (not recommended)
const noHeadersLimiter = new RateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 100,
  standardHeaders: false,
  legacyHeaders: false,
})
```

## Client Usage

Clients can use these headers to implement adaptive request patterns:

### JavaScript Example

```javascript
async function fetchWithRateLimit(url) {
  const response = await fetch(url)

  // Check remaining requests
  const remaining = response.headers.get('RateLimit-Remaining')
  const reset = response.headers.get('RateLimit-Reset')

  console.log(`Remaining requests: ${remaining}`)

  // If running low on requests, calculate delay for future requests
  if (Number.parseInt(remaining) < 10) {
    const resetTime = Number.parseInt(reset) * 1000 // Convert to milliseconds
    const currentTime = Date.now()
    const timeUntilReset = Math.max(0, resetTime - currentTime)
    const delayBetweenRequests = timeUntilReset / Number.parseInt(remaining)

    console.log(`Rate limit running low. Adding delay of ${delayBetweenRequests}ms between requests`)
    // Implement delay logic
  }

  return response
}
```

### Handling 429 Responses

```javascript
async function fetchWithRetry(url, maxRetries = 3) {
  let retries = 0

  while (retries < maxRetries) {
    try {
      const response = await fetch(url)

      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After')
        const delay = retryAfter ? Number.parseInt(retryAfter) * 1000 : 60000

        console.log(`Rate limit exceeded. Retrying after ${delay}ms`)
        await new Promise(resolve => setTimeout(resolve, delay))
        retries++
      }
      else {
        return response
      }
    }
    catch (error) {
      retries++
      if (retries >= maxRetries)
        throw error
    }
  }

  throw new Error('Max retries exceeded')
}
```

## Custom Headers

If you need to include additional rate limit information, you can use a custom handler:

```ts
import { RateLimiter } from 'ts-rate-limiter'

const limiter = new RateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 100,
  handler: (req, res, next, options) => {
    const { resetTime, remainingRequests, limit } = options.current

    // Add custom headers in addition to standard ones
    res.setHeader('X-RateLimit-Window-Ms', options.windowMs)
    res.setHeader('X-RateLimit-Requests-Made', limit - remainingRequests)

    // Standard 429 response
    res.status(429).send('Too Many Requests')
  }
})
```

## Best Practices

1. **Use Standard Headers**: Prefer the IETF draft standard headers for new implementations
2. **Include Reset Information**: Always include timing information so clients can adapt
3. **Descriptive Messages**: When returning 429 responses, include a clear message explaining the rate limit
4. **Document Headers**: Explicitly document the headers your API returns in your API documentation
5. **Consistent Units**: Ensure the units used in headers (seconds, milliseconds) are consistent and documented
