import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  base: '/ontario-g-test/',
  plugins: [react()],
  test: {
    environment: 'jsdom',
    environmentOptions: {
      jsdom: { url: 'http://localhost/ontario-g-test/' },
    },
    exclude: ['e2e/**', 'node_modules/**'],
    setupFiles: ['./src/test/setup.ts'],
  },
})
