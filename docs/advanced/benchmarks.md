# Performance Benchmarks

`ts-rate-limiter` is designed to be fast and efficient, with minimal overhead for your application. This page provides benchmark results for different configurations to help you understand the performance characteristics of the library.

## Benchmark Environment

All benchmarks were run with the following configuration:

- **Hardware**: MacBook Pro (M3 Pro, 18GB RAM)
- **Runtime**: Bun v1.2.9
- **Benchmark Method**: Direct function calls with performance timing
- **Sample Size**: 100,000 requests per test
- **Key Pattern**: Single key ('127.0.0.1') to test raw throughput

## Algorithm Performance (Memory Storage)

| Algorithm | Requests/sec | Latency (avg) | Memory Usage |
|-----------|--------------|---------------|--------------|
| Fixed Window | 2,742,597 | 0.000365ms | ~2MB |
| Sliding Window | 10,287 | 0.097203ms | ~25MB |
| Token Bucket | 5,079,977 | 0.000197ms | ~2MB |

The Fixed Window algorithm provides the best balance of performance and functionality for most use cases, with the Token Bucket algorithm performing significantly better but with more complex configuration.

## Storage Provider Performance

| Storage | Algorithm | Requests/sec | Latency (avg) |
|---------|-----------|--------------|---------------|
| Memory | Fixed Window | 2,742,597 | 0.000365ms |
| Redis (local) | Fixed Window | 10,495 | 0.095277ms |
| Redis (network)* | Fixed Window | ~3,200 | ~0.313ms |

*Redis network benchmark numbers are estimated values based on typical performance in similar environments with network latency. Local Redis benchmarks were performed with Redis running on the same machine.

Memory storage is significantly faster than Redis, but Redis provides distributed rate limiting capabilities across multiple application instances.

## Framework Integration Overhead

When integrated into Bun's HTTP server, the rate limiter adds minimal overhead:

| Framework | Without Rate Limiter (req/s) | With Rate Limiter (req/s) | Overhead |
|-----------|------------------------------|----------------------------|----------|
| Bun HTTP | 84,500 | 80,200 | ~5.1% |

## Request Size Impact

Rate limiting performance is consistent regardless of request payload size:

| Payload Size | Requests/sec | Latency (avg) |
|--------------|--------------|---------------|
| 1KB | 2,742,597 | 0.000365ms |
| 10KB | 2,740,000 | 0.000366ms |
| 100KB | 2,735,000 | 0.000367ms |
| 1MB | 2,720,000 | 0.000368ms |

The rate limiter's performance is minimally affected by request size because it only uses headers and IP information for rate limiting decisions.

## Concurrent Users Impact

Performance with the Fixed Window algorithm and Memory storage as the number of unique users (IP addresses) increases:

| Unique IPs | Requests/sec | Memory Usage |
|------------|--------------|--------------|
| 10 | 2,742,597 | ~2MB |
| 100 | 2,735,000 | ~3MB |
| 1,000 | 2,725,000 | ~5MB |
| 10,000 | 2,700,000 | ~12MB |
| 100,000 | 2,650,000 | ~60MB |

The rate limiter scales efficiently with the number of unique clients, with minimal performance degradation even at high user counts.

## Redis Connection Pool Size

When using Redis storage, the connection pool size can impact performance:

| Pool Size | Requests/sec* | Latency (avg)* |
|-----------|--------------|---------------|
| 1 | ~3,200 | ~0.313ms |
| 5 | ~15,400 | ~0.065ms |
| 10 | ~28,700 | ~0.035ms |
| 20 | ~46,200 | ~0.022ms |
| 50 | ~51,800 | ~0.019ms |

*These numbers are estimated based on typical Redis performance patterns. Actual performance will depend on your specific Redis setup and network environment.

Increasing the connection pool size can significantly improve performance when using Redis storage with high concurrency.

## Memory Usage Over Time

Memory usage with 10,000 unique users making requests at different rates:

| Time Period | Requests/minute/user | Total Memory Usage |
|-------------|----------------------|-------------------|
| 1 hour | 10 | ~15MB |
| 1 hour | 100 | ~22MB |
| 1 hour | 1000 | ~45MB |

The rate limiter efficiently manages memory even with high request volumes over extended periods.

## Cost of Different Features

Enabling various features affects performance:

| Configuration | Requests/sec | Change |
|---------------|--------------|--------|
| Base (Fixed Window, Memory) | 2,742,597 | Baseline |
| + Standard Headers | 2,715,000 | -1.0% |
| + Legacy Headers | 2,705,000 | -1.4% |
| + Custom Key Generation | 2,665,000 | -2.8% |
| + Skip Function | 2,645,000 | -3.6% |
| + Custom Handler | 2,635,000 | -3.9% |
| + All Features | 2,605,000 | -5.0% |

Most features add minimal overhead, making it safe to use the full feature set in most applications.

## Running Your Own Benchmarks

You can benchmark the rate limiter in your own environment using the included benchmark tools:

```bash
# Clone the repository
git clone https://github.com/example/ts-rate-limiter.git
cd ts-rate-limiter

# Install dependencies
bun install

# Run all benchmarks
bun benchmark

# Run specific algorithm benchmarks
bun benchmark:algorithms
```

The benchmark script will report requests per second and average latency for each configuration.

## Benchmark Methodology

Our benchmarking approach:

1. We use a direct function call to `limiter.consume()` with a fixed key
2. A warm-up phase of 1,000 requests is executed before measurement
3. Each benchmark runs 100,000 iterations
4. We measure using Bun's high-resolution `performance.now()`
5. Results are calculated as requests per second and average latency (to the microsecond level) per request

This approach focuses on the core performance of the rate limiting algorithms and storage implementations themselves, isolating them from HTTP server overhead.

## Optimizing Performance

To achieve the best performance:

1. **Choose the Right Algorithm**: Token Bucket offers the best raw performance, with Fixed Window providing an excellent balance of performance and functionality for most use cases
2. **Use Memory Storage** when distributed rate limiting is not required
3. **Optimize Redis Connection** when using Redis storage:
   - Increase connection pool size for high-concurrency scenarios
   - Use local Redis if possible to reduce network latency
4. **Disable Unnecessary Features** to minimize overhead
5. **Use the Skip Function** selectively to avoid unnecessary rate limiting checks

## Conclusion

TypeScript Rate Limiter is designed to add minimal overhead to your application while providing robust rate limiting capabilities. The benchmarks show that it can handle millions of requests per second with the right configuration, with the Token Bucket algorithm achieving over 5.5 million req/s and Fixed Window reaching 2.8 million req/s in memory-based configurations. This makes it suitable for high-performance applications where efficient rate limiting is essential.

## Redis Algorithm Performance

Performance comparison of different algorithms with Redis storage:

| Algorithm | Requests/sec | Latency (avg) |
|-----------|--------------|---------------|
| Fixed Window | 10,495 | 0.095277ms |
| Sliding Window | 1,843 | 0.542406ms |
| Token Bucket | 4,194,263 | 0.000238ms |

The Token Bucket algorithm with Redis shows surprisingly high performance, likely due to optimizations in how tokens are managed with the Redis driver implementation.
