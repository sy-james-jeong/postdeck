import { defineConfig } from 'vitest/config'
export default defineConfig({
  // esbuild.jsx 'automatic' lets .tsx tests use JSX without a React import; it only
  // affects files that contain JSX, so the existing .ts tests are unaffected.
  esbuild: { jsx: 'automatic' },
  test: { include: ['packages/**/*.test.ts', 'apps/**/*.test.{ts,tsx}', '*.test.ts'] },
})
