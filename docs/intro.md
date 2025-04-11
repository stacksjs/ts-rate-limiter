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
| Fixed Window | Memory | 2,742,597 | 0.000365ms |
| Token Bucket | Memory | 5,079,977 | 0.000197ms |
| Token Bucket | Redis | 4,194,263 | 0.000238ms |

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

## Changelog

Please see our [releases](https://github.com/stacksjs/ts-rate-limiter/releases) page for more information on what has changed recently.

## Contributing

Please review the [Contributing Guide](https://github.com/stacksjs/contributing) for details.

## Stargazers

[![Stargazers](https://starchart.cc/stacksjs/ts-rate-limiter.svg?variant=adaptive)](https://starchart.cc/stacksjs/ts-rate-limiter)

## Stargazers

[![Stargazers](https://starchart.cc/stacksjs/qrx.svg?variant=adaptive)](https://starchart.cc/stacksjs/qrx)

## Community

For help, discussion about best practices, or any other conversation that would benefit from being searchable:

[Discussions on GitHub](https://github.com/stacksjs/stacks/discussions)

For casual chit-chat with others using this package:

[Join the Stacks Discord Server](https://discord.gg/stacksjs)

## Postcardware

Two things are true: Stacks OSS will always stay open-source, and we do love to receive postcards from wherever Stacks is used! 🌍 _We also publish them on our website. And thank you, Spatie_

Our address: Stacks.js, 12665 Village Ln #2306, Playa Vista, CA 90094

## Sponsors

We would like to extend our thanks to the following sponsors for funding Stacks development. If you are interested in becoming a sponsor, please reach out to us.

- [JetBrains](https://www.jetbrains.com/)
- [The Solana Foundation](https://solana.com/)

## Credits

- [Chris Breuer](https://github.com/chrisbbreuer)
- [All Contributors](https://github.com/stacksjs/qrx/graphs/contributors)

## License

The MIT License (MIT). Please see [LICENSE](https://github.com/stacksjs/ts-starter/tree/main/LICENSE.md) for more information.

Made with 💙

<!-- Badges -->

<!-- [codecov-src]: https://img.shields.io/codecov/c/gh/stacksjs/qrx/main?style=flat-square
[codecov-href]: https://codecov.io/gh/stacksjs/qrx -->
