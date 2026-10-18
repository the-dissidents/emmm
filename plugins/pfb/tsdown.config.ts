import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: 'src/index.ts',
  outputOptions: {
    entryFileNames: 'pfb.js',
  },
  deps: {
    // alwaysBundle: ['xlsx'],
    neverBundle: ['@the_dissidents/emmui-plugin-sdk'],
  },
//   minify: true,
  format: 'iife'
});
