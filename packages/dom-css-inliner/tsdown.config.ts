import { defineConfig } from 'tsdown'

export default defineConfig([
  {
    entry: { index: './src/inliner.ts' },
    platform: 'neutral',
    dts: true
  }
])
