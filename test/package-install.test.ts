import { expect, test } from 'bun:test'
import manifest from '../package.json'

test('consumer installation leaves Git hook setup to contributors', () => {
  const installPhases = ['preinstall', 'install', 'postinstall', 'prepare']
  const hookScripts = Object.entries(manifest.scripts).filter(([phase, command]) =>
    installPhases.includes(phase) && /\b(?:bun-)?git-hooks\b/.test(command),
  )
  expect(hookScripts).toEqual([])
})
