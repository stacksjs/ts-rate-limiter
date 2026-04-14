---
# https://vitepress.dev/reference/default-theme-home-page
layout: home

hero:
  name: "ts-rate-limiter"
  text: "High-Performance Rate Limiting"
  tagline: "Flexible, scalable rate limiting for TypeScript applications."
  image: /images/logo-white.png
  actions:
    - theme: brand
      text: Get Started
      link: /intro
    - theme: alt
      text: View on GitHub
      link: https://github.com/stacksjs/ts-rate-limiter

features:
  - title: "Multiple Algorithms"
    icon: "🧮"
    details: "Fixed Window, Sliding Window, and Token Bucket algorithms for different rate limiting needs."
  - title: "Storage Providers"
    icon: "💾"
    details: "In-memory for single instances and Redis for distributed applications."
  - title: "Performance Optimized"
    icon: "⚡️"
    details: "Handles millions of requests per second with minimal latency."
  - title: "Customizable"
    icon: "🔧"
    details: "Customize key generation, response handling, and more to fit your application's needs."
---