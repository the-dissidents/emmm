import { defineConfig } from 'tsdown'

export default defineConfig([
  {
    entry: { index: './src/jsx-runtime.ts' },
    platform: 'neutral',
    dts: true
  }
])
