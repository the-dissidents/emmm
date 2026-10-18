import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: 'src/index.ts',
  outputOptions: {
    entryFileNames: 'get-ip.js',
  },
  deps: {
    neverBundle: ['@the_dissidents/emmui-plugin-sdk'],
  },
  minify: true,
  format: 'iife'
});
