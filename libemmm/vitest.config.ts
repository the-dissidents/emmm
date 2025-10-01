import { coverageConfigDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  esbuild: {
    legalComments: 'inline'
  },
  test: {
    environment: 'happy-dom',
    coverage: {
        provider: 'istanbul',
        exclude: [
            'src/debug.ts', 
            'src/temp.ts', 
            'src/typing-helper.ts', 
            ...coverageConfigDefaults.exclude
        ]
    }
  }
})