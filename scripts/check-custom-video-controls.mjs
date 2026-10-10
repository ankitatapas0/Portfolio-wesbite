import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { existsSync } from "node:fs";
import { chromium, firefox, expect } from "@playwright/test";
import { createServer } from "vite";

process.env.PORT ??= "4173";
process.env.BASE_PATH ??= "/";
const root = fileURLToPath(new URL("../", import.meta.url));
const server = await createServer({ root, configFile: path.join(root, "vite.config.ts"),
  base: "/", server: { host: "127.0.0.1", port: 0, strictPort: false } });
await server.listen();
let browser;
const browserName = process.env.PLAYER_BROWSER ?? "chromium";
const browserType = browserName === "firefox" ? firefox : chromium;
assert(["chromium", "firefox"].includes(browserName), `Unsupported browser: ${browserName}`);
try {
  browser = await browserType.launch(browserName === "chromium" ? {
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ?? (existsSync("/repl/tools/bin/chromium") ? "/repl/tools/bin/chromium" : undefined),
    args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"],
  } : {});
  const base = `http://127.0.0.1:${server.httpServer.address().port}`;
  for (const width of [390, 800, 1100, 1500]) {
    const touch = width === 390;
    const page = await browser.newPage({ viewport: { width, height: 900 }, hasTouch: touch, isMobile: touch });
    await page.goto(`${base}/#/desktop/apple-music-spatial-audio`);
    const frame = page.locator(".expanded-media-video-frame").first();
    const video = frame.locator("video");
    const controls = frame.locator(".cvc");
    const play = frame.getByTestId("button-video-play");
    const seek = frame.getByRole("slider", { name: /^Seek / });
    const h264Support = await video.evaluate(v => v.canPlayType('video/mp4; codecs="avc1.640028"'));
    assert.notEqual(h264Support, "", `${browserName} cannot decode the production H.264 MP4`);
    await expect.poll(() => video.evaluate(v => v.readyState >= 2 && !v.paused), { timeout: 30000 }).toBe(true);
    assert.equal(await video.evaluate(v => v.controls), false);
    await expect(controls).not.toHaveClass(/is-visible/);

    // Keyboard focus must reveal hidden custom controls for keyboard and
    // screen-reader users; play/pause labels track the actual playback state.
    await frame.scrollIntoViewIfNeeded();
    await video.focus();
    await page.keyboard.press("Tab");
    await expect(play).toBeFocused();
    await expect(controls).toHaveClass(/is-visible/);
    await expect(play).toHaveAccessibleName(/^Pause .+/);
    await play.press("Enter");
    await expect.poll(() => video.evaluate(v => v.paused)).toBe(true);
    await expect(play).toHaveAccessibleName(/^Play .+/);
    await play.press("Enter");
    await expect.poll(() => video.evaluate(v => !v.paused)).toBe(true);
    await page.locator(".detail-page-dialog").focus();
    await expect(controls).not.toHaveClass(/is-visible/);

    if (touch) await video.tap({ position: { x: 10, y: 10 } });
    else await frame.hover();
    await expect(controls).toHaveClass(/is-visible/);
    await expect.poll(() => video.evaluate(v => !v.paused)).toBe(true);
    const visuals = await play.evaluate(el => {
      const style = getComputedStyle(el, "::before"), box = el.getBoundingClientRect();
      return { background: style.backgroundColor, blur: style.backdropFilter, width: box.width, height: box.height };
    });
    assert.equal(visuals.background, "rgba(0, 0, 0, 0.4)");
    assert.equal(visuals.blur, "blur(24px)");
    assert(visuals.width >= 48 && visuals.width <= 73);
    assert(Math.abs(visuals.width - visuals.height) < 1);
    const timer = frame.getByTestId("text-video-time");
    await expect(timer).toHaveText(/^\d{2,}:\d{2} \/ \d{2,}:\d{2}$/);
    if (width < 720) await expect(timer).toBeHidden();
    else {
      await expect(timer).toBeVisible();
      const tagSize = await page.evaluate(() => {
        const tag = document.createElement("span");
        tag.className = "project-tag";
        document.body.append(tag);
        const size = getComputedStyle(tag).fontSize;
        tag.remove();
        return size;
      });
      await expect(timer).toHaveCSS("font-size", tagSize);
      const timerBox = await timer.boundingBox(), trackBox = await frame.locator(".cvc-seek-track").boundingBox();
      assert(Math.abs(trackBox.y - timerBox.y - timerBox.height - 4) < 0.1, "Timer-to-track spacing must be 4px");
    }
    await expect(timer).toHaveCSS("opacity", "0.7");
    await expect(seek).toHaveAccessibleName(/^Seek .+/);
    await expect(seek).toHaveAttribute("aria-valuetext", /^\d{2,}:\d{2}\.\d of \d{2,}:\d{2}\.\d$/);
    const bar = frame.locator(".cvc-bar");
    const barGeometry = await bar.evaluate(el => {
      const css = getComputedStyle(el);
      return {
        padding: [css.paddingTop, css.paddingRight, css.paddingBottom, css.paddingLeft],
        inset: [css.left, css.right, css.bottom],
        radius: css.borderTopLeftRadius,
      };
    });
    const expectedGeometry = width <= 479
      ? { padding: ["8px", "8px", "8px", "8px"], inset: ["4px", "4px", "4px"], radius: "8px" }
      : width <= 959
        ? { padding: ["10px", "10px", "10px", "10px"], inset: ["8px", "8px", "8px"], radius: "10px" }
        : width <= 1439
          ? { padding: ["12px", "12px", "12px", "12px"], inset: ["8px", "8px", "8px"], radius: "10px" }
          : { padding: ["12px", "12px", "12px", "12px"], inset: ["8px", "8px", "8px"], radius: "12px" };
    assert.deepEqual(barGeometry, expectedGeometry, `${width}px control-backplate geometry`);
    await expect(bar).toHaveCSS("row-gap", "4px");
    await expect(frame.locator(".cvc-seek-track")).toHaveCSS("height", "4px");
    const iconMargin = await frame.locator(".cvc-right").evaluate(el => parseFloat(getComputedStyle(el).marginTop));
    assert(Math.abs(iconMargin - (width < 720 ? 0 : width <= 959 ? 3 : 5.6)) < 0.1,
      "Volume/fullscreen row breakpoint spacing");
    await seek.focus();
    const beforeSeek = await seek.getAttribute("aria-valuetext");
    await seek.press("ArrowRight");
    await expect.poll(() => seek.getAttribute("aria-valuetext")).not.toBe(beforeSeek);
    await expect.poll(() => video.evaluate(v => v.currentTime)).toBeGreaterThan(0);
    const mute = frame.getByTestId("button-video-mute");
    const popup = frame.locator(".cvc-volume-popup");
    if (!touch) {
      await frame.locator(".cvc-volume-control").hover();
      await expect(popup).toBeVisible();
      await page.mouse.move(0, 0);
      await expect(popup).toBeHidden();
      await frame.hover({ position: { x: 10, y: 10 } });
    }
    let stableVolume = await video.evaluate(v => v.volume);
    let stableVolumeSamples = 0;
    await expect.poll(async () => {
      const currentVolume = await video.evaluate(v => v.volume);
      stableVolumeSamples = Math.abs(currentVolume - stableVolume) < 0.003 ? stableVolumeSamples + 1 : 0;
      stableVolume = currentVolume;
      return stableVolumeSamples;
    }, { timeout: 10000, intervals: [200] }).toBeGreaterThanOrEqual(3);
    const volumeBeforeMute = stableVolume;
    if (touch) await mute.tap();
    else await mute.click();
    await expect.poll(() => video.evaluate(v => v.muted)).toBe(true);
    await expect(mute).toHaveAccessibleName(/^Mute .+/);
    await expect(mute).toHaveAttribute("aria-pressed", "true");
    await expect(mute).toHaveAttribute("aria-expanded", "true");
    await expect(mute).toHaveAttribute("aria-controls", /.+/);
    await expect(popup).toBeVisible();
    await expect(popup).toHaveCSS("background-color", "rgba(0, 0, 0, 0.6)");
    await expect(popup).toHaveCSS("backdrop-filter", "blur(24px)");
    await expect.poll(async () => {
      const popupBox = await popup.boundingBox(), muteBox = await mute.boundingBox();
      return popupBox.height > popupBox.width && popupBox.y + popupBox.height <= muteBox.y + muteBox.height + 1;
    }).toBe(true);
    const slider = frame.locator(".cvc-volume-slider");
    const thumb = frame.locator(".cvc-volume-thumb");
    await expect(thumb).toHaveCSS("transition-property", "bottom");
    await expect(thumb).toHaveCSS("transition-duration", "0.2s");
    await expect(slider).toHaveCSS("--cvc-level", "0%");
    await page.evaluate(() => document.body.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true, cancelable: true, pointerType: "mouse",
    })));
    await expect(popup).toBeHidden();
    if (touch) {
      await frame.tap({ position: { x: 10, y: 10 } });
      await expect(controls).toHaveClass(/is-bar-visible/);
    } else {
      await frame.hover({ position: { x: 10, y: 10 } });
      await expect(controls).toHaveClass(/is-bar-visible/);
    }
    if (touch) await mute.tap();
    else await mute.click();
    await expect.poll(() => video.evaluate(v => v.muted)).toBe(false);
    await expect.poll(() => video.evaluate((v, expected) => Math.abs(v.volume - expected) < 0.01, volumeBeforeMute)).toBe(true);
    await expect(popup).toBeVisible();
    const restoredLevel = await slider.evaluate(el => Number.parseFloat(getComputedStyle(el).getPropertyValue("--cvc-level")));
    assert(Math.abs(restoredLevel - volumeBeforeMute * 100) < 0.1, "Unmute must smoothly restore the prior slider level");
    const volumeSlider = frame.getByRole("slider", { name: /^Volume for / });
    const volumeInput = frame.locator(".cvc-volume");
    const fullscreenButton = frame.getByTestId("button-video-fullscreen");
    await expect(mute).toHaveAttribute("aria-pressed", "false");
    await expect(volumeSlider).toHaveAttribute("aria-orientation", "vertical");
    await expect(volumeSlider).toHaveAttribute("aria-valuetext", /^\d+ percent$/);
    if (touch) await slider.tap({ position: { x: 12, y: 20 } });
    else await slider.click({ position: { x: 12, y: 20 } });
    await expect.poll(() => video.evaluate(v => v.volume)).toBeGreaterThan(0.5);
    await expect(frame.locator(".cvc-volume-slider")).toHaveCSS("outline-style", "none");
    await mute.focus();
    await mute.press("Enter");
    await expect(mute).toHaveAttribute("aria-pressed", "true");
    await mute.press("Enter");
    await expect(mute).toHaveAttribute("aria-pressed", "false");
    await page.keyboard.press("Tab");
    await expect(volumeSlider).toBeFocused();
    if (!touch) {
      await frame.hover({ position: { x: 10, y: 10 } });
      await expect(popup).toBeVisible();
      await expect(volumeSlider).toBeFocused();
    }
    await page.keyboard.press("Tab");
    await expect(fullscreenButton).toBeFocused();
    await expect(popup).toBeHidden();
    await expect(mute).toHaveAttribute("aria-expanded", "false");
    await expect(volumeInput).toHaveAttribute("tabindex", "-1");
    await expect.poll(() => popup.evaluate(el => el.inert)).toBe(true);
    await expect(frame.getByRole("slider", { name: /^Volume for / })).toHaveCount(0);
    await page.keyboard.press("Tab");
    await expect(volumeInput).not.toBeFocused();
    if (touch) await video.tap({ position: { x: 10, y: 10 } });
    else await frame.hover();
    await expect(controls).toHaveClass(/is-visible/);
    await play.click();
    await expect.poll(() => video.evaluate(v => v.paused)).toBe(true);
    await expect(controls).not.toHaveClass(/is-bar-visible/, { timeout: 500 });
    await expect.poll(() => bar.evaluate(el => getComputedStyle(el, "::before").opacity), { timeout: 700 }).toBe("0");
    await play.click();
    await expect.poll(() => video.evaluate(v => !v.paused)).toBe(true);
    if (!touch) {
      await frame.hover({ position: { x: 10, y: 10 } });
      await expect(controls).toHaveClass(/is-visible/);
    }
    await play.click();
    await expect.poll(() => video.evaluate(v => v.paused)).toBe(true);
    // Exiting fullscreen must not resume a visitor-paused video or remount it.
    await video.evaluate(v => { window.__playerTestVideo = v; });
    if (touch) await frame.evaluate(f => {
      f.requestFullscreen = undefined;
      f.webkitRequestFullscreen = undefined;
    });
    if (touch) await video.tap({ position: { x: 10, y: 10 } });
    else await video.click({ position: { x: 10, y: 10 } });
    await frame.getByTestId("button-video-fullscreen").click();
    await expect(frame.getByTestId("button-video-fullscreen")).toHaveAttribute("aria-label", "Exit fullscreen");
    const fullBox = await frame.boundingBox();
    assert(Math.abs(fullBox.width - width) < 2 && Math.abs(fullBox.height - 900) < 2);
    // Paused fullscreen controls must be reachable again after the idle fade,
    // including mouse movement over the letterboxed area.
    await expect(controls).not.toHaveClass(/is-visible/, { timeout: 4000 });
    if (touch) await frame.tap({ position: { x: 10, y: 10 } });
    else await page.mouse.move(10, 10);
    await expect(controls).toHaveClass(/is-bar-visible/);
    const fullscreenBarBox = await bar.boundingBox();
    assert(fullscreenBarBox.x >= 0 && fullscreenBarBox.y >= 0
      && fullscreenBarBox.x + fullscreenBarBox.width <= width
      && fullscreenBarBox.y + fullscreenBarBox.height <= 900,
    "Fullscreen controls must remain inside the viewport");
    const fullscreenExit = fullscreenButton;
    await expect.poll(() => fullscreenExit.evaluate(el => {
      const bounds = el.getBoundingClientRect();
      return el.contains(document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2));
    })).toBe(true);
    if (touch) await mute.tap();
    else await mute.click();
    await expect(popup).toBeVisible();
    if (touch) await slider.tap({ position: { x: 12, y: 70 } });
    else await slider.click({ position: { x: 12, y: 70 } });
    await expect.poll(() => video.evaluate(v => v.volume < 0.5 && !v.muted)).toBe(true);
    await expect(frame.locator(".cvc-volume-slider")).toHaveCSS("outline-style", "none");
    if (!touch) {
      await fullscreenExit.focus();
      await page.keyboard.press("Tab");
      await expect.poll(() => video.evaluate(v => document.activeElement === v)).toBe(true);
      await page.keyboard.press("Shift+Tab");
      await expect(fullscreenExit).toBeFocused();
    }
    await seek.focus();
    const fullscreenTime = await video.evaluate(v => v.currentTime);
    await seek.press("ArrowLeft");
    await expect.poll(() => video.evaluate(v => v.currentTime)).toBeLessThan(fullscreenTime);
    if (touch) await page.screenshot({ path: "/tmp/portfolio-fullscreen-controls.png" });
    await play.click();
    await expect.poll(() => video.evaluate(v => !v.paused)).toBe(true);
    await play.click();
    await expect.poll(() => video.evaluate(v => v.paused)).toBe(true);
    await expect(controls).not.toHaveClass(/is-bar-visible/, { timeout: 500 });
    if (touch) await frame.tap({ position: { x: 10, y: 10 } });
    else await page.mouse.move(10, 10);
    await expect(controls).toHaveClass(/is-bar-visible/);
    await fullscreenExit.focus();
    await page.keyboard.press("Enter");
    await expect(fullscreenExit).toHaveAttribute("aria-label", "Enter fullscreen");
    await expect.poll(() => video.evaluate(v => v === window.__playerTestVideo && v.paused)).toBe(true);
    await expect(page.locator(".expanded-media-stream")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator(".expanded-media-stream")).toBeVisible();
    await expect(page.locator(".detail-page-dialog")).toBeVisible();
    // Keyboard entry and exit must work in both native and CSS fullscreen.
    await fullscreenButton.focus();
    await page.keyboard.press("Enter");
    await expect(fullscreenButton).toHaveAttribute("aria-label", "Exit fullscreen");
    if (touch) await page.keyboard.press("Escape");
    else await page.keyboard.press("Enter");
    await expect(fullscreenButton).toHaveAttribute("aria-label", "Enter fullscreen");
    await page.keyboard.press("Escape");
    await expect(page.locator(".expanded-media-stream")).toBeVisible();
    await expect(page.locator(".detail-page-dialog")).toBeVisible();
    if (touch) {
      await video.tap({ position: { x: 10, y: 10 } });
      await expect(controls).toHaveClass(/is-visible/);
      await expect(controls).not.toHaveClass(/is-visible/, { timeout: 5000 });
    } else {
      await page.locator(".detail-page-dialog").focus();
      await page.mouse.move(0, 0);
      await expect(controls).not.toHaveClass(/is-visible/);
    }
    console.log(`PASS: ${browserName} ${width}px ${touch ? "touch + CSS fullscreen" : "mouse + native fullscreen"}: autoplay, controls, seek, mute, play/pause, stable fullscreen, Escape`);
    await page.close();
  }
  const phone = await browser.newPage({ viewport: { width: 320, height: 900 }, isMobile: true, hasTouch: true });
  await phone.goto(`${base}/#/desktop/beyonce-apple-music`);
  const frames = phone.locator(".expanded-media-video-frame");
  await expect(frames).toHaveCount(3);
  for (const frame of await frames.all()) {
    await frame.scrollIntoViewIfNeeded();
    const seek = frame.locator(".cvc-seek");
    const bounds = await seek.boundingBox();
    assert(bounds && bounds.width >= 24, "Seek rail must remain usable on a paired portrait player");
    const controls = frame.locator(".cvc");
    const video = frame.locator("video");
    const play = frame.getByTestId("button-video-play");
    if (!(await video.evaluate(v => v.paused))) {
      await video.tap({ position: { x: 10, y: 10 } });
      await play.tap();
      await expect.poll(() => video.evaluate(v => v.paused)).toBe(true);
    }
    await expect(controls).not.toHaveClass(/is-visible/);
    await expect(controls).toHaveClass(/has-rest-button/);
    await expect(controls).toHaveClass(/is-paused/);
    await expect.poll(() => play.evaluate(el => getComputedStyle(el, "::before").opacity)).toBe("1");
    await expect.poll(() => frame.locator(".cvc-bar").evaluate(el => getComputedStyle(el, "::before").opacity)).toBe("0");
    await video.tap({ position: { x: 10, y: 10 } });
    await expect(controls).toHaveClass(/is-visible/);
    await expect(controls).toHaveClass(/is-bar-visible/);
    await expect(controls).not.toHaveClass(/is-visible/, { timeout: 5000 });
    await play.tap();
    await expect.poll(() => video.evaluate(v => !v.paused), { timeout: 30000 }).toBe(true);
    await expect(controls).toHaveClass(/is-bar-visible/);
    await expect(frame.getByTestId("text-video-time")).toBeHidden();
    await expect(seek).toHaveAttribute("aria-valuetext", /^\d{2,}:\d{2}\.\d of \d{2,}:\d{2}\.\d$/);
    await expect(controls).not.toHaveClass(/is-visible/, { timeout: 1900 });
    await expect.poll(() => play.evaluate(el => getComputedStyle(el, "::before").opacity)).toBe("0");
    await video.tap({ position: { x: 10, y: 10 } });
    await expect(controls).toHaveClass(/is-visible/);
    await play.tap();
    await expect.poll(() => video.evaluate(v => v.paused)).toBe(true);
    await expect(controls).not.toHaveClass(/is-bar-visible/, { timeout: 500 });
    await expect(controls).toHaveClass(/is-paused/);
    await expect.poll(() => play.evaluate(el => getComputedStyle(el, "::before").opacity)).toBe("1");
    assert.equal(await controls.evaluate(el => getComputedStyle(el).opacity), "1", "The controls wrapper must not create an animated opacity backdrop root");
    await expect.poll(() => frame.locator(".cvc-bar").evaluate(el => getComputedStyle(el, "::before").backdropFilter)).toBe("blur(24px)");
  }
  console.log(`PASS: ${browserName} portrait and paired players fit at 320px`);
  await phone.close();
} finally {
  await browser?.close();
  await server.close();
}
