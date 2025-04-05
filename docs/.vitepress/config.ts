import type { HeadConfig } from 'vitepress'
// import { transformerTwoslash } from '@shikijs/vitepress-twoslash'
import { withPwa } from '@vite-pwa/vitepress'
import { defineConfig } from 'vitepress'

import viteConfig from './vite.config'

// https://vitepress.dev/reference/site-config

const analyticsHead: HeadConfig[] = [
  [
    'script',
    {
      'src': 'https://cdn.usefathom.com/script.js',
      'data-site': 'DCOEHMGA',
      'defer': '',
    },
  ],
]

const nav = [
  { text: 'News', link: 'https://stacksjs.org/news' },
  {
    text: 'Changelog',
    link: 'https://github.com/stacksjs/ts-rate-limiter/blob/main/CHANGELOG.md',
  },
  {
    text: 'Resources',
    items: [
      { text: 'Team', link: '/team' },
      { text: 'Sponsors', link: '/sponsors' },
      { text: 'Partners', link: '/partners' },
      { text: 'Postcardware', link: '/postcardware' },
      { text: 'License', link: '/license' },
      {
        items: [
          {
            text: 'Awesome Stacks',
            link: 'https://github.com/stacksjs/awesome-stacks',
          },
          {
            text: 'Contributing',
            link: 'https://github.com/stacksjs/stacks/blob/main/.github/CONTRIBUTING.md',
          },
        ],
      },
    ],
  },
]

const sidebar = [
  {
    text: 'Get Started',
    items: [
      { text: 'Introduction', link: '/intro' },
      { text: 'Installation', link: '/install' },
      { text: 'Usage', link: '/usage' },
      { text: 'Configuration', link: '/config' },
    ],
  },
  {
    text: 'Features',
    items: [
      { text: 'Algorithms', link: '/features/algorithms' },
      { text: 'Storage Providers', link: '/features/storage' },
      { text: 'Performance', link: '/features/performance' },
      { text: 'Customization', link: '/features/customization' },
      { text: 'Headers', link: '/features/headers' },
      { text: 'Distributed Rate Limiting', link: '/features/distributed' },
    ],
  },
  {
    text: 'Advanced',
    items: [
      { text: 'Best Practices', link: '/advanced/best-practices' },
      { text: 'Benchmarks', link: '/advanced/benchmarks' },
      { text: 'Examples', link: '/advanced/examples' },
    ],
  },
  { text: 'API Reference', link: '/api-reference' },
]

const description = 'A high-performance, flexible rate limiting library for TypeScript and Bun'
const title = 'ts-rate-limiter | High-performance rate limiting for TypeScript'

export default withPwa(
  defineConfig({
    lang: 'en-US',
    title: 'ts-rate-limiter',
    description,
    metaChunk: true,
    cleanUrls: true,
    lastUpdated: true,

    head: [
      ['link', { rel: 'icon', type: 'image/svg+xml', href: './images/logo-mini.svg' }],
      ['link', { rel: 'icon', type: 'image/png', href: './images/logo.png' }],
      ['meta', { name: 'theme-color', content: '#0A0ABC' }],
      ['meta', { name: 'title', content: title }],
      ['meta', { name: 'description', content: description }],
      ['meta', { name: 'author', content: 'Stacks.js, Inc.' }],
      ['meta', {
        name: 'tags',
        content: 'rate-limiter, rate-limit, typescript, bun, api, middleware, security',
      }],

      ['meta', { property: 'og:type', content: 'website' }],
      ['meta', { property: 'og:locale', content: 'en' }],
      ['meta', { property: 'og:title', content: title }],
      ['meta', { property: 'og:description', content: description }],

      ['meta', { property: 'og:site_name', content: 'ts-rate-limiter' }],
      ['meta', { property: 'og:image', content: './images/og-image.png' }],
      ['meta', { property: 'og:url', content: 'https://ts-rate-limiter.stacksjs.org/' }],
      ...analyticsHead,
    ],

    themeConfig: {
      search: {
        provider: 'local',
      },
      logo: {
        light: './images/logo-transparent.svg',
        dark: './images/logo-white-transparent.svg',
      },

      nav,
      sidebar,

      editLink: {
        pattern: 'https://github.com/stacksjs/ts-rate-limiter/edit/main/docs/docs/:path',
        text: 'Edit this page on GitHub',
      },

      footer: {
        message: 'Released under the MIT License.',
        copyright: 'Copyright © 2023-present Stacks.js, Inc.',
      },

      socialLinks: [
        { icon: 'twitter', link: 'https://twitter.com/stacksjs' },
        { icon: 'bluesky', link: 'https://bsky.app/profile/chrisbreuer.dev' },
        { icon: 'github', link: 'https://github.com/stacksjs/ts-rate-limiter' },
        { icon: 'discord', link: 'https://discord.gg/stacksjs' },
      ],
    },

    pwa: {
      manifest: {
        theme_color: '#0A0ABC',
      },
    },

    markdown: {
      theme: {
        light: 'github-light',
        dark: 'github-dark',
      },
    },

    vite: viteConfig,
  }),
)
