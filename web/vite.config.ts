import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // O E2E sobe uma API própria em outra porta, para não mexer no banco de desenvolvimento.
      '/api': process.env.FINBOARD_API_URL ?? 'http://localhost:3000',
    },
  },
  test: {
    environment: 'node',
    setupFiles: ['./src/test/setup.ts'],
  },
})
