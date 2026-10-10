import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { chromium } from "@playwright/test";
import { preview } from "vite";

// Build first. Testing the development server cannot catch deduplicated URLs.
const root = fileURLToPath(new URL("../", import.meta.url));
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const expectedPoster = digest(readFileSync(path.join(root,
  "delivery-media/Desktop images/Navigation_intro.mp4.poster.webp")));
const firstFramePoster = digest(readFileSync(path.join(root,
  "delivery-media/Single videos/Navigation_intro.mp4.poster.webp")));
assert.notEqual(expectedPoster, firstFramePoster);

const server = await preview({
  root,
  configFile: path.join(root, "vite.config.ts"),
  base: "/",
  preview: { host: "127.0.0.1", port: 0, open: false },
});
let browser;
try {
  const { port } = server.httpServer.address();
  const baseURL = `http://127.0.0.1:${port}/`;
  browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ?? (existsSync("/repl/tools/bin/chromium") ? "/repl/tools/bin/chromium" : undefined),
    args: ["--no-sandbox"],
  });
  for (const mobile of [false, true]) {
    const page = await browser.newPage({
      viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 },
      isMobile: mobile,
      hasTouch: mobile,
      reducedMotion: "reduce",
    });
    await page.goto(`${baseURL}#/desktop`);
    const tile = page.locator(".slot-f");
    const image = tile.locator(".media-hover-rest");
    const video = tile.locator("video");
    await image.waitFor();
    await image.evaluate(image => image.decode());
    const source = await image.getAttribute("src");
    const response = await page.request.get(new URL(source, baseURL).href);
    assert.equal(response.status(), 200);
    assert.equal(digest(await response.body()), expectedPoster,
      "Compiled gallery must show its frame-10 poster, not the shared video's frame-1 poster");
    assert.equal(await image.evaluate(image => getComputedStyle(image).opacity), "1");
    assert.equal(await video.evaluate(video => video.paused), true);
    if (!mobile) {
      await tile.hover();
      await page.waitForFunction(() => {
        const video = document.querySelector(".slot-f video");
        return video && !video.paused && video.currentTime > 0.1;
      });
      await page.mouse.move(700, 30);
      await page.waitForFunction(() => {
        const tile = document.querySelector(".slot-f");
        return !tile.classList.contains("is-hovered")
          && tile.querySelector("video").paused
          && getComputedStyle(tile.querySelector(".media-hover-rest")).opacity === "1";
      });
      assert.equal(await image.getAttribute("src"), source);
    }
    console.log(`PASS: compiled ${mobile ? "phone" : "desktop"} uses exact frame-10 image at rest${mobile ? "" : " and after hover"}`);
    await page.close();
  }
} finally {
  await browser?.close();
  await new Promise(resolve => server.httpServer.close(resolve));
}
