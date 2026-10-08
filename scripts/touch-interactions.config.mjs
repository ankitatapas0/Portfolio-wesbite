import { defineConfig } from "@playwright/test";

const chromiumPath = process.env.PORTFOLIO_CHROMIUM || "/repl/tools/bin/chromium";

export default defineConfig({
  testDir: ".",
  testMatch: "touch-interactions.spec.mjs",
  outputDir: "../test-results/touch-interactions",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  workers: 1,
  reporter: [["list"], ["html", { outputFolder: "../test-results/touch-interactions-report", open: "never" }]],
  use: {
    baseURL: process.env.PORTFOLIO_BASE_URL || "http://localhost:80/",
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
    reducedMotion: "reduce",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium-touch",
      use: {
        browserName: "chromium",
        launchOptions: {
          executablePath: chromiumPath,
          args: ["--no-sandbox"],
        },
      },
    },
  ],
});
