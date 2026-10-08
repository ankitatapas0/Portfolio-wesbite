import { test, expect } from "@playwright/test";
import { installGlassProbe } from "./probe.mjs";

const band = ".detail-page-glass-band";
const root = ".detail-page-transition-backdrop";
const videoSelector = "video[data-detail-page-content]";

async function attachJSON(info, name, data) {
  await info.attach(name, { body: JSON.stringify(data, null, 2), contentType: "application/json" });
}

async function capabilities(page, info) {
  const result = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl");
    const debug = gl?.getExtension("WEBGL_debug_renderer_info");
    return {
      userAgent: navigator.userAgent,
      webgl: !!gl,
      renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl?.getParameter(gl.RENDERER),
      h264: document.createElement("video").canPlayType('video/mp4; codecs="avc1.42E01E"'),
      rvfc: typeof HTMLVideoElement.prototype.requestVideoFrameCallback === "function",
      dpr: devicePixelRatio,
    };
  });
  await attachJSON(info, "capabilities", result);
  expect(result.webgl, "Use a WebGL-capable runner; missing glass is not a passing fallback").toBe(true);
  expect(result.h264, "Runner must decode shipped H.264; do not substitute delivery assets").not.toBe("");
  return result;
}

async function settle(page) {
  await expect.poll(() => page.evaluate(() => {
    const r = document.querySelector(".detail-page-transition-backdrop");
    return !!r && !r.getAnimations({ subtree: true }).some((a) => a.playState === "running" || a.pending);
  })).toBe(true);
  await page.waitForTimeout(500); // final renderer geometry sample / observer delivery
}

async function open(page, project) {
  await page.evaluate((name) => { location.hash = `#/desktop/${name}`; }, project);
  await expect(page.locator(band)).toBeVisible();
  await page.evaluate(() => document.querySelectorAll("video").forEach((v) => v.pause()));
  await settle(page);
}

async function sample(page, name, report, ms = 800, action) {
  await page.evaluate(() => { glassTest.sampling = false; glassTest.reset(); });
  if (action) await action();
  else await page.waitForTimeout(ms);
  report[name] = { sampleWindowMs: ms, ...await page.evaluate(() => ({ ...glassTest.counts })) };
  return report[name];
}

function noWork(counts) {
  for (const key of ["draws", "allocations", "uploads", "bounds", "styles", "discoveries", "callbacks", "timersScheduled"]) expect(counts[key], key).toBe(0);
}

async function resources(page) {
  return page.evaluate(() => glassTest.resources());
}

async function close(page, report, name) {
  await page.keyboard.press("Escape");
  await expect(page.locator(band)).toHaveCount(0);
  await page.waitForTimeout(500);
  noWork(await sample(page, name, report));
  expect(await resources(page)).toEqual({ raf: 0, video: 0, timers: 0, observers: 0, listeners: 0, gpu: 0 });
}

async function gettySnapshot(page, info, name) {
  // Align a *loaded image*, not a text block, across both the band and capture strip.
  await expect.poll(() => page.evaluate(() => [...document.querySelectorAll(".expanded-media-image-frame img")]
    .some((img) => img.complete && img.naturalWidth > 0))).toBe(true);
  await page.evaluate(() => {
    const image = [...document.querySelectorAll(".expanded-media-image-frame img")]
      .find((img) => img.complete && img.naturalWidth > 0);
    const r = document.querySelector(".detail-page-transition-backdrop");
    const frame = image.closest(".expanded-media-image-frame");
    r.scrollTop += frame.getBoundingClientRect().top - (innerHeight - 180);
    glassTest.sampling = true;
    window.dispatchEvent(new Event("resize"));
  });
  await settle(page);
  const geometry = await page.locator(band).evaluate((c) => ({
    cssHeight: c.getBoundingClientRect().height,
    cssWidth: c.getBoundingClientRect().width,
    width: c.width, height: c.height, dpr: devicePixelRatio,
  }));
  expect(geometry.cssHeight).toBe(70);
  expect(geometry.width).toBe(Math.round(geometry.cssWidth * Math.min(geometry.dpr, 1.5)));
  expect(geometry.height).toBe(Math.round(70 * Math.min(geometry.dpr, 1.5)));
  const pixels = await page.evaluate(() => glassTest.pixels);
  expect(pixels).not.toBeNull();
  expect(pixels.glError).toBe(0);
  expect(pixels.lowerAlpha).toBe(255);
  expect(pixels.upperAlpha).toBeLessThan(10);
  expect(pixels.colorful, "Getty color must reach the glass, not just an empty background").toBeGreaterThan(100);
  await attachJSON(info, `${name}-pixels`, { geometry, pixels });
  // Keep full composition and a tight 140px strip showing the undistorted imagery
  // immediately above the unchanged 70px band. No cross-engine pixel equality.
  await info.attach(`${name}-full`, { body: await page.screenshot(), contentType: "image/png" });
  const box = await page.locator(band).boundingBox();
  await info.attach(`${name}-strip`, {
    body: await page.screenshot({ clip: { x: box.x, y: box.y - 70, width: box.width, height: 140 } }),
    contentType: "image/png",
  });
  await page.evaluate(() => { glassTest.sampling = false; });
  return pixels;
}

test("Getty imagery, scrolling, DPR changes and repeated opening/closing", async ({ page }, info) => {
  await page.addInitScript(installGlassProbe);
  await page.goto("./#/desktop/getty-unshuttered");
  await capabilities(page, info);
  await open(page, "getty-unshuttered");
  const report = { kind: "rendering-work-counts", hardwareFPS: "not measured" };
  try {
    await gettySnapshot(page, info, "getty-desktop");
    noWork(await sample(page, "static", report));
    const scrolling = await sample(page, "scroll", report, 800, () => page.evaluate(() => new Promise((resolve) => {
      const r = document.querySelector(".detail-page-transition-backdrop");
      const initial = r.scrollTop, start = performance.now();
      function step(now) {
        r.scrollTop = initial + Math.sin((now - start) / 150) * 100;
        if (now - start < 800) requestAnimationFrame(step); else resolve();
      }
      requestAnimationFrame(step);
    })));
    expect(scrolling.draws).toBeGreaterThan(0);
    expect(scrolling.allocations).toBe(0);
    expect(scrolling.discoveries).toBe(0);
    await settle(page);
    // Portable simulation: Playwright cannot change DPR on an existing page in
    // WebKit/Firefox. Exercise the live resize/resolution invalidation explicitly.
    report.simulatedLiveDPR = [];
    for (const dpr of [1, 1.25, 2, 3]) {
      await page.evaluate((value) => {
        Object.defineProperty(window, "devicePixelRatio", { configurable: true, value });
        window.dispatchEvent(new Event("resize"));
      }, dpr);
      await expect.poll(() => page.locator(band).evaluate((c) => c.height)).toBe(Math.round(70 * Math.min(dpr, 1.5)));
      const size = await page.locator(band).evaluate((c) => ({ width: c.width, height: c.height, cssWidth: c.getBoundingClientRect().width }));
      expect(size.width).toBe(Math.round(size.cssWidth * Math.min(dpr, 1.5)));
      report.simulatedLiveDPR.push({ dpr, ...size });
    }
    await page.evaluate(() => { delete window.devicePixelRatio; window.dispatchEvent(new Event("resize")); });
    await close(page, report, "closed");
    for (let i = 0; i < 3; i++) {
      await open(page, "getty-unshuttered");
      expect((await resources(page)).observers, "Probe must actually track the renderer in this engine").toBeGreaterThan(0);
      await close(page, report, `repeated-close-${i}`);
    }
  } finally {
    await attachJSON(info, "rendering-work", report);
  }
});

for (const fallback of [false, true]) {
  test(`delivery video ${fallback ? "polling fallback" : "decoded-frame API"}, background/resume and cleanup`, async ({ page }, info) => {
    await page.addInitScript(installGlassProbe, { fallback });
    await page.goto("./#/desktop/opera-live-visuals");
    const caps = await capabilities(page, info);
    await open(page, "opera-live-visuals");
    const report = { kind: "rendering-work-counts", hardwareFPS: "not measured", mode: fallback || !caps.rvfc ? "polling" : "decoded-frame" };
    try {
      await expect.poll(() => page.locator(videoSelector).first().evaluate((v) => v.readyState)).toBeGreaterThanOrEqual(2);
      await page.locator(videoSelector).first().evaluate(async (v) => {
        document.querySelector(".detail-page-transition-backdrop").scrollTop = 50;
        v.muted = true;
        await v.play();
      });
      await page.waitForTimeout(400);
      const state = () => page.locator(videoSelector).first().evaluate((v) => ({
        time: v.currentTime, decodedFrames: v.getVideoPlaybackQuality?.().totalVideoFrames,
        paused: v.paused, readyState: v.readyState, source: v.currentSrc, error: v.error?.message,
      }));
      report.videoBefore = await state();
      const playing = await sample(page, "playing", report, 1200);
      report.videoAfter = await state();
      expect(report.videoAfter.time).toBeGreaterThan(report.videoBefore.time);
      expect(report.videoAfter.paused).toBe(false);
      expect(report.videoAfter.source).toMatch(/\.mp4(?:$|\?)/);
      if (report.videoAfter.decodedFrames !== undefined) expect(report.videoAfter.decodedFrames).toBeGreaterThan(report.videoBefore.decodedFrames);
      expect(playing.draws).toBeGreaterThan(0);
      expect(playing.uploads).toBe(playing.draws);
      expect(playing.allocations).toBe(0);
      expect(playing.bounds).toBe(0);
      expect(playing.discoveries).toBe(0);
      if (report.mode === "decoded-frame") expect(playing.callbacks).toBeGreaterThan(0);
      // A polling timer can have fired and handed off to RAF exactly at readout.
      // Count schedules across the sample instead of asserting one instant.
      else expect(playing.timersScheduled).toBeGreaterThan(0);

      // Synthetic visibility is deliberately labeled: headless page focus is not
      // OS backgrounding. This proves our handler cancels work and then resumes.
      await page.evaluate(() => {
        Object.defineProperty(document, "hidden", { configurable: true, value: true });
        document.dispatchEvent(new Event("visibilitychange"));
      });
      noWork(await sample(page, "simulated-hidden", report));
      report.hiddenResources = await resources(page);
      for (const key of ["raf", "video", "timers"]) expect(report.hiddenResources[key]).toBe(0);
      await page.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event("visibilitychange")); });
      await page.waitForTimeout(300);
      expect((await sample(page, "resumed", report)).draws).toBeGreaterThan(0);
      await page.locator(videoSelector).first().evaluate((v) => v.pause());
      await page.waitForTimeout(400);
      noWork(await sample(page, "paused", report));
      for (const key of ["raf", "video", "timers"]) expect((await resources(page))[key]).toBe(0);
      // Seeking a paused video must still refresh the visible pixels.
      await page.evaluate(() => { glassTest.sampling = true; window.dispatchEvent(new Event("resize")); });
      await page.waitForTimeout(200);
      const before = await page.evaluate(() => glassTest.pixels);
      await page.locator(videoSelector).first().evaluate((v) => new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("Delivery video seek timed out")), 10_000);
        v.addEventListener("seeked", () => { clearTimeout(timer); resolve(); }, { once: true });
        v.currentTime = 12;
      }));
      await expect.poll(() => page.evaluate(() => glassTest.pixels?.hash)).not.toBe(before.hash);
      expect(await page.evaluate(() => glassTest.pixels.glError)).toBe(0);
      await close(page, report, "closed");
    } finally {
      await attachJSON(info, "rendering-work", report);
    }
  });
}

// Genuine initial DPR values in separate contexts, in addition to live simulated
// DPR changes above. Mobile snapshots retain the full-width 70 CSS px band.
for (const dpr of [1, 1.25, 2, 3]) {
  test(`Getty native DPR ${dpr}`, async ({ browser, baseURL }, info) => {
    const context = await browser.newContext({
      viewport: dpr === 3 ? { width: 390, height: 844 } : { width: 1280, height: 900 },
      deviceScaleFactor: dpr,
    });
    try {
      await context.addInitScript(installGlassProbe);
      const page = await context.newPage();
      await page.goto(new URL("./#/desktop/getty-unshuttered", baseURL).href);
      await capabilities(page, info);
      expect(await page.evaluate(() => devicePixelRatio)).toBeCloseTo(dpr);
      await open(page, "getty-unshuttered");
      await gettySnapshot(page, info, `getty-dpr-${dpr}`);
    } finally {
      await context.close();
    }
  });
}
