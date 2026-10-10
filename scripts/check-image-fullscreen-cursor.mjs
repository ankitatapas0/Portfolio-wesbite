import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";

const root = fileURLToPath(new URL("../", import.meta.url));
const hintsEnabled = /\bconst detailCursorHintsEnabled = true;/.test(
  readFileSync(path.join(root, "src/components/useDetailCursorHint.tsx"), "utf8"),
);
const server = await createServer({
  root, configFile: path.join(root, "vite.config.ts"),
  base: "/", server: { host: "127.0.0.1", port: 0, open: false },
});
await server.listen();
let browser;
try {
  browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ?? (existsSync("/repl/tools/bin/chromium") ? "/repl/tools/bin/chromium" : undefined),
    args: ["--no-sandbox"],
  });
  const base = `http://127.0.0.1:${server.httpServer.address().port}`;
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
  await page.goto(`${base}/#/desktop/xbox-app-redesign`);
  const favicon = page.locator("#portfolio-favicon");
  await expect(favicon).toHaveAttribute("href", /^data:image\/svg\+xml,/);
  const faviconFill = () => favicon.evaluate(el => {
    const svg = decodeURIComponent(el.getAttribute("href").split(",").slice(1).join(","));
    return new DOMParser().parseFromString(svg, "image/svg+xml").querySelector("path").getAttribute("fill");
  });
  assert.equal(await faviconFill(), "black");
  await page.locator(".theme-toggle").click();
  await expect.poll(faviconFill).toBe("white");
  await page.locator(".theme-toggle").click();
  await expect.poll(faviconFill).toBe("black");
  const image = page.locator(".expanded-media-image-frame img").first();
  await image.scrollIntoViewIfNeeded();
  await expect(page.locator("[data-cursor-hint=image][data-visible=true]")).toHaveCount(0);
  const box = await image.boundingBox();
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  if (!hintsEnabled) {
    await page.mouse.move(x, y);
    await expect(page.locator(".image-fullscreen-cursor")).toHaveCount(0);
    await page.mouse.move(20, 450);
    await expect(page.locator(".image-fullscreen-cursor")).toHaveCount(0);
    await image.click();
    await expect(page.locator(".expanded-media-image-frame:fullscreen")).toHaveCount(1);
    await expect(page.locator(".image-fullscreen-cursor")).toHaveCount(0);
    await page.locator(".expanded-image-fullscreen").click();
    await expect(page.locator(".expanded-media-image-frame:fullscreen")).toHaveCount(0);
    await expect(page.locator(".detail-page-dialog")).toBeVisible();
    await page.mouse.click(20, 450);
    await expect.poll(() => page.evaluate(() => location.hash)).toBe("#/desktop");
    console.log("PASS: both cursor hints hidden; image fullscreen and background return preserved");
  } else {
  await page.mouse.move(x, y);
  const cursor = page.locator("[data-cursor-hint=image][data-visible=true]");
  await expect(cursor).toHaveCount(1);
  await expect(cursor).toHaveText("VIEW FULLSCREEN");
  const typography = await cursor.locator(".image-fullscreen-cursor-label").evaluate(el => {
    const reference = document.createElement("span");
    reference.className = "project-tag";
    document.body.append(reference);
    const css = getComputedStyle(el), tag = getComputedStyle(reference);
    const matches = ["fontFamily", "fontSize", "lineHeight"]
      .every(key => css[key] === tag[key]);
    const contrast = css.color === "rgb(255, 255, 255)" && css.fontWeight === "700";
    const extraSpacing = Math.abs(parseFloat(css.letterSpacing) - parseFloat(css.fontSize) * 0.14) < 0.01;
    const shadow = css.textShadow.includes("rgba(0, 0, 0, 0.8)") && css.textShadow.includes("12px");
    reference.remove();
    return matches && contrast && extraSpacing && shadow;
  });
  assert(typography, "Cursor hint must use tag sizing, white bold text, wider tracking and an 80% black 12px shadow");
  await expect.poll(async () => (await cursor.boundingBox()).y).toBeGreaterThan(y + 31);
  const letters = cursor.locator(".detail-cursor-word");
  await expect(letters).toHaveCount(2);
  await expect(letters.first()).toHaveText("VIEW");
  await expect(letters.last()).toHaveText("FULLSCREEN");
  await expect(letters.first().locator(".detail-cursor-letter")).toHaveCount(4);
  await expect(letters.last().locator(".detail-cursor-letter")).toHaveCount(11);
  await page.mouse.move(x + 100, y);
  await expect.poll(() => letters.evaluateAll(elements => {
    const positions = elements.map(el => {
      const transform = getComputedStyle(el).transform;
      return new DOMMatrixReadOnly(transform === "none" ? undefined : transform).m41;
    });
    return positions[0] - positions.at(-1) > 1;
  }), { intervals: [16, 32, 48, 80] }).toBe(true);
  await page.mouse.move(x - 100, y);
  await expect.poll(() => letters.first().locator(".detail-cursor-letter").evaluateAll(elements => {
    const positions = elements.map(el => {
      const transform = getComputedStyle(el).transform;
      return new DOMMatrixReadOnly(transform === "none" ? undefined : transform).m41;
    });
    return positions.at(-1) - positions[0] > 0.1;
  }), { intervals: [16, 32, 48, 80] }).toBe(true);
  await expect.poll(() => letters.last().evaluate(el => {
    const transform = getComputedStyle(el).transform;
    return Math.abs(new DOMMatrixReadOnly(transform === "none" ? undefined : transform).m41);
  })).toBeLessThan(0.1);
  await page.mouse.move(x + 100, y + 80);
  await expect.poll(() => letters.evaluateAll(elements =>
    Math.min(...elements.map(el => el.getBoundingClientRect().top)))).toBeGreaterThan(y + 80 + 31);
  assert.equal(await cursor.evaluate(el => getComputedStyle(el).pointerEvents), "none");
  await page.screenshot({ path: "/tmp/portfolio-image-cursor.jpg" });
  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "inverted"));
  await expect(cursor.locator(".image-fullscreen-cursor-label")).toHaveCSS("color", "rgb(255, 255, 255)");
  await expect(cursor.locator(".image-fullscreen-cursor-label")).toHaveCSS("font-weight", "700");
  await page.evaluate(() => document.documentElement.removeAttribute("data-theme"));
  await image.dispatchEvent("pointermove", { pointerType: "touch", clientX: x, clientY: y });
  await expect(cursor).toHaveCount(0);
  await page.mouse.move(x + 90, y + 80);
  await expect(cursor).toHaveCount(1);
  await page.mouse.move(5, 5);
  await expect(cursor).toHaveCount(0);
  await expect(page.locator("[data-cursor-hint=image]")).toHaveCount(0, { timeout: 500 });
  await page.mouse.move(x, y);
  await expect(cursor).toHaveCount(1);
  await page.evaluate(() => window.dispatchEvent(new Event("scroll")));
  await expect(cursor).toHaveCount(0);
  await page.mouse.move(x + 10, y);
  await expect(cursor).toHaveCount(1);
  await image.click();
  await expect(page.locator(".expanded-media-image-frame:fullscreen")).toHaveCount(1);
  await expect(cursor).toHaveCount(0);
  await page.keyboard.press("Escape");
  // Headless Chromium does not route Escape through its native fullscreen UI.
  // Exit through the app's supplied button before checking background hit areas.
  await page.locator(".expanded-image-fullscreen").click();
  await expect(page.locator(".expanded-media-image-frame:fullscreen")).toHaveCount(0);
  await expect(page.locator(".detail-page-dialog")).toBeVisible();
  const back = page.locator("[data-cursor-hint=back][data-visible=true]");
  await page.mouse.move(20, 450);
  await expect(back).toHaveCount(1);
  await expect(back).toHaveText("BACK");
  await expect(back.locator(".detail-cursor-word")).toHaveCount(1);
  const assertBackStyle = () => back.locator(".image-fullscreen-cursor-label").evaluate(el => {
    const reference = document.createElement("span");
    reference.style.color = "var(--color-main-2)";
    document.body.append(reference);
    const matches = getComputedStyle(el).color === getComputedStyle(reference).color
      && getComputedStyle(el).textShadow === "none";
    reference.remove();
    return matches;
  });
  assert(await assertBackStyle(), "BACK must use Main Color 2 with no shadow");
  await page.locator(".theme-toggle").click();
  await page.mouse.move(20, 450);
  await expect(back).toHaveCount(1);
  assert(await assertBackStyle(), "BACK must follow the toggled theme without a shadow");
  await page.locator(".theme-toggle").click();
  await page.locator(".expanded-media-copy p").first().hover();
  await expect(back).toHaveCount(0);
  await page.locator(".expanded-media-copy h2").click();
  await expect(page.locator(".detail-page-dialog")).toBeVisible();
  const caption = page.locator(".expanded-media-image-caption").first();
  await caption.hover();
  await expect(back).toHaveCount(0);
  await caption.click();
  await expect(page.locator(".detail-page-dialog")).toBeVisible();
  await page.mouse.move(20, 450);
  await expect(back).toHaveCount(1);
  await page.mouse.click(20, 450);
  await expect.poll(() => page.evaluate(() => location.hash)).toBe("#/desktop");
  await expect(page.locator(".detail-page-dialog")).toHaveCount(0);
  await expect(back).toHaveCount(0);
  await page.goto(`${base}/#/desktop/xbox-navigation-system`);
  await page.locator(".navigation-specifications-table").first().hover();
  await expect(back).toHaveCount(0);
  await page.locator(".navigation-specifications-table").first().click();
  await expect(page.locator(".detail-page-dialog")).toBeVisible();
  await page.goto(`${base}/#/desktop/apple-music-spatial-audio`);
  await page.locator(".expanded-media-video-frame").first().hover();
  await expect(cursor).toHaveCount(0);
  await expect(back).toHaveCount(0);
  const play = page.getByTestId("button-video-play").first();
  await play.hover();
  await page.mouse.down();
  await expect.poll(() => play.evaluate(el =>
    new DOMMatrixReadOnly(getComputedStyle(el).transform).m11)).toBe(0.96);
  await page.mouse.up();
  await expect.poll(() => play.evaluate(el =>
    new DOMMatrixReadOnly(getComputedStyle(el).transform).m11)).toBe(1);
  await play.focus();
  await page.keyboard.down(" ");
  await expect.poll(() => play.evaluate(el =>
    new DOMMatrixReadOnly(getComputedStyle(el).transform).m11)).toBe(0.96);
  await page.keyboard.up(" ");
  await expect.poll(() => play.evaluate(el =>
    new DOMMatrixReadOnly(getComputedStyle(el).transform).m11)).toBe(1);
  console.log("PASS: image-only mouse hint, tag styling, weighted following, fade, scroll dismissal and fullscreen clicks");

  const touch = await browser.newPage({ viewport: { width: 390, height: 900 }, isMobile: true, hasTouch: true });
  await touch.goto(`${base}/#/desktop/xbox-app-redesign`);
  await touch.locator(".expanded-media-image-frame img").first().tap();
  await expect(touch.locator(".image-fullscreen-cursor[data-visible=true]")).toHaveCount(0);
  await touch.goto(`${base}/#/desktop/xbox-app-redesign`);
  await touch.locator(".detail-page-transition-backdrop").dispatchEvent("pointermove", {
    pointerType: "touch", clientX: 20, clientY: 450,
  });
  await expect(touch.locator(".image-fullscreen-cursor[data-visible=true]")).toHaveCount(0);
  console.log("PASS: no cursor hint on touch");
  await touch.goto(`${base}/#/desktop/apple-music-spatial-audio`);
  await touch.locator(".expanded-media-video-frame video").first().tap({ position: { x: 10, y: 10 } });
  const touchPlay = touch.getByTestId("button-video-play").first();
  const playBox = await touchPlay.boundingBox();
  const cdp = await touch.context().newCDPSession(touch);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{
    x: playBox.x + playBox.width / 2, y: playBox.y + playBox.height / 2, id: 1,
  }] });
  await expect.poll(() => touchPlay.evaluate(el =>
    new DOMMatrixReadOnly(getComputedStyle(el).transform).m11)).toBe(0.96);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect.poll(() => touchPlay.evaluate(el =>
    new DOMMatrixReadOnly(getComputedStyle(el).transform).m11)).toBe(1);
  await cdp.detach();
  console.log("PASS: play/pause press shrink and release on mouse, keyboard and touch");

  const reduced = await browser.newPage({ viewport: { width: 1100, height: 900 }, reducedMotion: "reduce" });
  await reduced.goto(`${base}/#/desktop/xbox-app-redesign`);
  const reducedImage = reduced.locator(".expanded-media-image-frame img").first();
  await reducedImage.hover();
  const reducedBox = await reducedImage.boundingBox();
  const targetX = reducedBox.x + reducedBox.width / 2 + 100;
  await reduced.mouse.move(targetX, reducedBox.y + reducedBox.height / 2);
  await expect.poll(() => reduced.locator("[data-cursor-hint=image][data-visible=true]").evaluate(el =>
    new DOMMatrixReadOnly(getComputedStyle(el).transform).m41)
    .then(actual => Math.abs(actual - targetX))).toBeLessThan(0.1);
  const reducedLag = await reduced.locator("[data-cursor-hint=image] .detail-cursor-word, [data-cursor-hint=image] .detail-cursor-letter").evaluateAll(elements =>
    elements.every(el => {
      const transform = getComputedStyle(el).transform;
      return new DOMMatrixReadOnly(transform === "none" ? undefined : transform).m41 === 0;
    }));
  assert(reducedLag, "Reduced motion must remove individual letter lag");
  console.log("PASS: reduced-motion preference removes trailing motion");
  console.log("PASS: word-level drag, BACK on blank space, background return, and content/table/caption exclusions");
  console.log("PASS: restored letter drag, theme-colored shadowless BACK, and black/white favicon switching");
  }
} finally {
  await browser?.close();
  await server.close();
}
