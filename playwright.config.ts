import { defineConfig, devices } from '@playwright/test'

// Portas próprias do E2E: rodar os testes com `npm run dev:*` aberto não pode
// reaproveitar a API de desenvolvimento (e o banco dela) sem querer.
const API_PORT = 3100
const WEB_PORT = 5174

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      // Banco em memória: cada execução começa do zero e não deixa arquivo para trás.
      command: 'npx tsx src/server.ts',
      cwd: 'server',
      url: `http://localhost:${API_PORT}/docs`,
      env: { PORT: String(API_PORT), DB_PATH: ':memory:' },
      reuseExistingServer: false,
    },
    {
      command: `npx vite --port ${WEB_PORT} --strictPort`,
      cwd: 'web',
      url: `http://localhost:${WEB_PORT}`,
      env: { FINBOARD_API_URL: `http://localhost:${API_PORT}` },
      reuseExistingServer: false,
    },
  ],
})
