import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/browser',
  timeout: 60_000,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    channel: 'chrome',
    ...devices['Desktop Chrome'],
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ...process.env,
      PORT: '4173',
      APP_ENV: 'test',
      APP_ORIGIN: 'http://127.0.0.1:4173',
      ALLOWED_ORIGINS: 'http://127.0.0.1:4173,http://localhost:4173',
      DOMAIN_EXPANSION_TEST_AUTH: '1',
      TEST_AUTH_SECRET: 'test-secret',
      VITE_TEST_AUTH: '1',
      DATA_STORE: 'memory',
      FIREBASE_PROJECT_ID: 'demo-domain-expansion',
    },
  },
});
