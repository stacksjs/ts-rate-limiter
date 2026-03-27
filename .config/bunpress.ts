import type { BunpressConfig } from '@stacksjs/bunpress'

const config: BunpressConfig = {
  name: 'ts-rate-limiter',
  description: 'High-performance, flexible rate limiting for TypeScript and Bun',
  url: 'https://ts-rate-limiter.stacksjs.org',
  theme: 'docs',

  nav: [
    { text: 'Guide', link: '/guide/getting-started' },
    { text: 'Algorithms', link: '/guide/algorithms' },
    { text: 'GitHub', link: 'https://github.com/stacksjs/ts-rate-limiter' },
  ],

  sidebar: [
    {
      text: 'Introduction',
      items: [
        { text: 'Overview', link: '/' },
        { text: 'Getting Started', link: '/guide/getting-started' },
      ],
    },
    {
      text: 'Core Features',
      items: [
        { text: 'Algorithms', link: '/guide/algorithms' },
        { text: 'Middleware & Integration', link: '/guide/middleware' },
      ],
    },
    {
      text: 'Features',
      items: [
        { text: 'Token Bucket', link: '/features/token-bucket' },
        { text: 'Sliding Window', link: '/features/sliding-window' },
        { text: 'Redis Backend', link: '/features/redis' },
        { text: 'Rate Limit Headers', link: '/features/headers' },
      ],
    },
    {
      text: 'Advanced',
      items: [
        { text: 'Distributed Rate Limiting', link: '/advanced/distributed' },
        { text: 'Custom Identifiers', link: '/advanced/identifiers' },
        { text: 'Penalty Systems', link: '/advanced/penalties' },
        { text: 'Performance Tuning', link: '/advanced/performance' },
      ],
    },
  ],

  socialLinks: [
    { icon: 'github', link: 'https://github.com/stacksjs/ts-rate-limiter' },
  ],
}

export default config
