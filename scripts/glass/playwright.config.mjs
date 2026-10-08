import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "glass.spec.mjs",
  outputDir: "../../test-results/glass",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { outputFolder: "../../test-results/glass-report", open: "never" }]],
  use: {
    baseURL: process.env.GLASS_BASE_URL || "http://localhost:80/",
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 2,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "webkit", use: { browserName: "webkit" } },
    { name: "firefox", use: { browserName: "firefox" } },
    // Optional local smoke run; not a substitute for the two required engines.
    ...(process.env.GLASS_CHROMIUM ? [{
      name: "chromium-smoke",
      use: {
        browserName: "chromium",
        launchOptions: {
          executablePath: process.env.GLASS_CHROMIUM,
          args: ["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
        },
      },
    }] : []),
  ],
});
