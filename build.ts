import { dts } from 'bun-plugin-dtsx'

await Bun.build({
  minify: true,
  entrypoints: ['src/index.ts'],
  outdir: './dist',
  plugins: [dts()],
  target: 'bun',
})

// The command the `bin` field points at. Nothing built it, so
// `dist/bin/init-config.js` has never existed and every install logged a
// failed bin link — the command was declared and unavailable.
await Bun.build({
  minify: true,
  entrypoints: ['bin/init-config.ts'],
  outdir: './dist/bin',
  target: 'bun',
})
