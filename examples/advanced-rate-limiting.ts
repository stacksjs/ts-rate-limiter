import { MemoryStorage, RateLimiter } from '../src'

/**
 * Advanced rate limiting example demonstrating:
 * 1. Multi-tier rate limiting (global, per user, per endpoint)
 * 2. Different algorithms for different types of endpoints
 * 3. Custom response handling
 */

// Mock user database for demonstration
const users = new Map([
  ['user123', { tier: 'free', apiKeys: ['key1'] }],
  ['user456', { tier: 'pro', apiKeys: ['key2'] }],
])

// Rate limit configurations by user tier
const tierLimits = {
  free: {
    requests: 100,
    windowMs: 60 * 60 * 1000, // 1 hour
  },
  pro: {
    requests: 1000,
    windowMs: 60 * 60 * 1000, // 1 hour
  },
}

// Create different rate limiters for different purposes
const globalLimiter = new RateLimiter({
  windowMs: 1 * 60 * 1000, // 1 minute
  maxRequests: 600, // 10 requests per second
  algorithm: 'token-bucket', // Allow some bursting
})

// User tier limiters (one per tier to avoid modifying properties)
const freeTierLimiter = new RateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: tierLimits.free.requests,
  algorithm: 'sliding-window',
  keyGenerator: (req) => {
    const apiKey = getApiKey(req)
    const userId = getUserIdFromApiKey(apiKey)
    return `user:${userId}`
  },
})

const proTierLimiter = new RateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: tierLimits.pro.requests,
  algorithm: 'sliding-window',
  keyGenerator: (req) => {
    const apiKey = getApiKey(req)
    const userId = getUserIdFromApiKey(apiKey)
    return `user:${userId}`
  },
})

// Sensitive endpoint rate limiter (stricter)
const sensitiveEndpointLimiter = new RateLimiter({
  windowMs: 10 * 60 * 1000, // 10 minutes
  maxRequests: 20,
  algorithm: 'fixed-window',
  keyGenerator: (req) => {
    const apiKey = getApiKey(req)
    const userId = getUserIdFromApiKey(apiKey)
    return `user:${userId}:sensitive`
  },
})

// Extracted helper functions
function getApiKey(req: Request): string {
  const authHeader = req.headers.get('authorization')
  if (!authHeader) {
    throw new Error('Missing API key')
  }

  // Format: "Bearer api-key-here"
  const [bearer, apiKey] = authHeader.split(' ')
  if (bearer !== 'Bearer' || !apiKey) {
    throw new Error('Invalid authorization format')
  }

  return apiKey
}

function getUserIdFromApiKey(apiKey: string): string {
  // Find user with this API key
  for (const [userId, userData] of users.entries()) {
    if (userData.apiKeys.includes(apiKey)) {
      return userId
    }
  }

  throw new Error('Invalid API key')
}

// Setup Bun HTTP server
export function startServer(port: number): void {
  // eslint-disable-next-line no-console
  console.log(`Starting rate-limited API server on port ${port}`)

  Bun.serve({
    port,
    async fetch(req) {
      try {
        // Apply global rate limit first
        const globalResult = await globalLimiter.check(req)
        if (!globalResult.allowed) {
          return createRateLimitResponse(globalResult, 'Global rate limit exceeded')
        }

        // Check user tier limit
        try {
          const apiKey = getApiKey(req)
          const userId = getUserIdFromApiKey(apiKey)
          const userTier = users.get(userId)?.tier || 'free'

          // Use appropriate rate limiter based on user tier
          const tierResult = await (userTier === 'pro'
            ? proTierLimiter.check(req)
            : freeTierLimiter.check(req))

          if (!tierResult.allowed) {
            return createRateLimitResponse(
              tierResult,
              `${userTier.toUpperCase()} tier rate limit exceeded`,
            )
          }

          // Check if this is a sensitive endpoint
          const url = new URL(req.url)
          if (url.pathname.startsWith('/api/sensitive')) {
            const sensitiveResult = await sensitiveEndpointLimiter.check(req)
            if (!sensitiveResult.allowed) {
              return createRateLimitResponse(
                sensitiveResult,
                'Sensitive endpoint rate limit exceeded',
              )
            }
          }

          // All rate limits passed, continue to actual request handling
          return handleRequest(req, userId)
        }
        catch (error) {
          // API key error
          return new Response((error as Error).message, { status: 401 })
        }
      }
      catch (error) {
        // General error
        return new Response((error as Error).message, { status: 500 })
      }
    },
  })
}

function createRateLimitResponse(result: any, message: string): Response {
  return new Response(message, {
    status: 429,
    headers: {
      'RateLimit-Limit': result.limit.toString(),
      'RateLimit-Remaining': Math.max(0, result.limit - result.current).toString(),
      'RateLimit-Reset': Math.ceil(result.resetTime / 1000).toString(),
      'Retry-After': Math.ceil(result.remaining / 1000).toString(),
      'Content-Type': 'application/json',
    },
  })
}

function handleRequest(req: Request, userId: string): Response {
  const url = new URL(req.url)

  // Handle different endpoints
  if (url.pathname === '/api/user') {
    return new Response(`User data for ${userId}`, { status: 200 })
  }
  else if (url.pathname.startsWith('/api/sensitive')) {
    return new Response('Sensitive data accessed', { status: 200 })
  }
  else {
    return new Response('Unknown endpoint', { status: 404 })
  }
}

// Start the server if this file is executed directly
if (import.meta.main) {
  startServer(3000)
}
