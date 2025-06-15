import { coverageConfigDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  esbuild: {
    legalComments: 'inline'
  },
  test: {
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