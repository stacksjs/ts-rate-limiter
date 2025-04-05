# Installation

`ts-rate-limiter` can be installed using your preferred package manager.

## Package Managers

Choose your package manager of choice:

::: code-group

```sh [npm]
npm install ts-rate-limiter
# or for development only
npm install --save-dev ts-rate-limiter
```

```sh [bun]
bun add ts-rate-limiter
# or for development only
bun add --dev ts-rate-limiter
```

```sh [pnpm]
pnpm add ts-rate-limiter
# or for development only
pnpm add --save-dev ts-rate-limiter
```

```sh [yarn]
yarn add ts-rate-limiter
# or for development only
yarn add --dev ts-rate-limiter
```

:::

## Requirements

- TypeScript 4.5+
- Bun 1.0+ (recommended)
- Node.js 16+ (if not using Bun)

## Redis Support

If you plan to use Redis as a storage provider, you'll need to install a Redis client:

::: code-group

```sh [npm]
npm install redis
```

```sh [bun]
bun add redis
```

```sh [pnpm]
pnpm add redis
```

```sh [yarn]
yarn add redis
```

:::

## Verifying Installation

You can verify the installation by creating a simple test file:

```ts
import { RateLimiter } from 'ts-rate-limiter'

// Create a rate limiter instance
const limiter = new RateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 100, // 100 requests per minute
})

console.log('Rate limiter installed successfully!')
```

## Next Steps

Now that you've installed TypeScript Rate Limiter, you can:

- [Learn how to use it](/usage)
- [Explore configuration options](/config)
- [Understand the different algorithms](/features/algorithms)
