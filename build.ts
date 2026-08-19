import { dts } from 'bun-plugin-dtsx'

await Bun.build({
  minify: true,
  entrypoints: ['src/index.ts'],
  outdir: './dist',
  plugins: [dts()],
  target: 'bun',
})
