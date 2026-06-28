import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/web',
  fullyParallel: false, // 串行：mock 状态共享
  workers: 1,
  reporter: 'list',
  outputDir: 'tests/web/test-results',
  use: {
    baseURL: 'http://localhost:1422',
    headless: true,
    viewport: { width: 1024, height: 768 },
    // 给每个测试充足时间
    actionTimeout: 5000,
    navigationTimeout: 10000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // 假设用户已经手动起了 vite preview（port 1422）
  // 否则启 webServer 自动起
  webServer: {
    command: 'npm run vite:preview',
    url: 'http://localhost:1422',
    reuseExistingServer: true,
    timeout: 30000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
