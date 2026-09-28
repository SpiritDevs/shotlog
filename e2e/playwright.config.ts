import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";

const root = fileURLToPath(new URL("..", import.meta.url));

export default defineConfig({
  testDir: ".",
  testMatch: "**/*.spec.ts",
  // The local relay's settings, rate limiter, and inbox are shared by all tests.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  forbidOnly: !!process.env.CI,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: [
    ["list"],
    ["html", { open: "never" }],
    ["json", { outputFile: "test-results/results.json" }],
  ],
  use: {
    baseURL: "http://127.0.0.1:5299",
    viewport: { width: 1280, height: 900 },
    reducedMotion: "reduce",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
  webServer: [
    {
      command:
        "pnpm build && cd apps/playground && exec node --import tsx server.ts",
      cwd: root,
      env: {
        PLAYGROUND_PORT: "5299",
        PLAYGROUND_RATE_WINDOW_SECONDS: "315360000",
        SMTP_PORT: "2625",
        SHOTLOG_SCREENSHOT_MODE: "base64",
      },
      url: "http://127.0.0.1:5299/_settings",
      reuseExistingServer: false,
      gracefulShutdown: { signal: "SIGTERM", timeout: 5000 },
      timeout: 120_000,
    },
    {
      command:
        "pnpm --filter next-example build && cd apps/next-example && exec node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 5300",
      cwd: root,
      env: {
        SHOTLOG_DEMO: "1",
        NEXT_EXAMPLE_ORIGIN: "http://127.0.0.1:5300",
        NEXT_TELEMETRY_DISABLED: "1",
      },
      url: "http://127.0.0.1:5300/api/inbox",
      reuseExistingServer: false,
      gracefulShutdown: { signal: "SIGTERM", timeout: 5000 },
      timeout: 120_000,
    },
  ],
});
