<p align="center"><img src="https://github.com/stacksjs/ts-rate-limiter/blob/main/.github/art/cover.jpg?raw=true" alt="Social Card of this repo"></p>

# Introduction

`ts-rate-limiter` is a high-performance, flexible rate limiting library designed for TypeScript and Bun applications. It provides multiple rate limiting algorithms, storage providers, and customization options to help you control the rate of incoming requests to your API or application.

## What is Rate Limiting?

Rate limiting is a strategy used to control the amount of incoming and outgoing traffic to or from a network, API, or service. It's essential for:

- **Preventing abuse**: Protect your API from malicious users or bots
- **Managing resources**: Ensure fair usage of your system resources
- **Improving reliability**: Prevent overload during traffic spikes
- **Meeting SLAs**: Ensure consistent performance for all users

## Key Features

### Multiple Algorithms

Choose the algorithm that best fits your application needs:

- **Fixed Window**: Simple time-based counting in fixed intervals
- **Sliding Window**: More accurate rate limiting that prevents traffic spikes at window boundaries
- **Token Bucket**: Allows occasional bursts of traffic while maintaining average limits

### Storage Providers

Use the appropriate storage provider for your application architecture:

- **Memory Storage**: Ultra-fast for single-instance applications
- **Redis Storage**: Distributed rate limiting for multi-instance applications

### Performance Optimized

Benchmarked to handle millions of requests per second with minimal overhead:

| Algorithm | Storage | Requests/sec | Latency (avg) |
|-----------|---------|--------------|---------------|
| Fixed Window | Memory | 2,845,000 | 0.001ms |
| Token Bucket | Memory | 4,955,000 | 0.001ms |

### Flexible Configuration

Tailor rate limiting to your specific requirements:

- Custom key generation
- Request skipping logic
- Custom response handling
- Draft mode for testing
- Standardized headers

## When to Use TypeScript Rate Limiter

This library is ideal for:

- REST APIs that need to limit request rates
- GraphQL servers requiring query rate limiting
- Microservices that need to control internal traffic
- Web applications protecting authentication endpoints
- Any application where managing resource utilization is critical

## Next Steps

- [Installation](/install) - Get started with the library
- [Usage](/usage) - Learn basic usage patterns
- [Configuration](/config) - Explore configuration options
- [Algorithms](/features/algorithms) - Understand the different rate limiting algorithms
