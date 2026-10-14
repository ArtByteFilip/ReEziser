import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  // Software WebGL is slow; several browsers at once time out.
  workers: 1,
  use: {
    baseURL: 'http://localhost:5173',
    viewport: { width: 1400, height: 860 },
    screenshot: 'only-on-failure',
    // Software WebGL so the test also runs on machines without a GPU.
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
  },
});
