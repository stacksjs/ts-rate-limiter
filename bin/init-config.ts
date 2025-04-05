#!/usr/bin/env bun

import type { RateLimiterConfig } from '../src/types'
import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'

// Script to generate a configuration file
function generateConfig(): void {
  // eslint-disable-next-line no-console
  console.log('Generating rate-limiter.config.ts file...')

  const configPath = join(process.cwd(), 'rate-limiter.config.ts')

  // Check if file already exists
  if (existsSync(configPath)) {
    // eslint-disable-next-line no-console
    console.log(`File already exists at ${configPath}`)
    // eslint-disable-next-line no-console
    console.log('To overwrite, delete the file first and run this command again.')
    process.exit(1)
  }

  // Generate config file content
  const configContent = `import type { RateLimiterConfig } from 'ts-rate-limiter'

const config: RateLimiterConfig = {
  verbose: true,
  defaultStorage: 'memory',
  defaultAlgorithm: 'sliding-window',

  // Uncomment to use Redis as the default storage
  // defaultStorage: 'redis',

  // Use 'fixed-window', 'sliding-window', or 'token-bucket'
  // defaultAlgorithm: 'token-bucket',
}

export default config
`

  // Write the file
  writeFileSync(configPath, configContent, 'utf-8')

  // eslint-disable-next-line no-console
  console.log(`Configuration file created at: ${configPath}`)
  // eslint-disable-next-line no-console
  console.log('Now you can customize it to fit your application needs.')
}

// Run the script
generateConfig()
