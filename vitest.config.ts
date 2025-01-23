import { coverageConfigDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
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