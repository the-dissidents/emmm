import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true, // w/ declaration file (.d.ts)
  sourcemap: true,
  clean: true
})
