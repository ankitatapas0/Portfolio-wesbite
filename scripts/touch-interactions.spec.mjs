import { test, expect } from "@playwright/test";

const viewports = [
  { name: "phone", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
];

const tile = '[aria-label="Open Xbox in 2030 detail page"]';
const detailTitle = '.expanded-media-copy[data-detail-slug="xbox-2030"] h2';
const instagramTile = ".media-slot.slot-j";

async function auditInput(page) {
  await page.addInitScript(() => {
    window.__portfolioInputAudit = [];
    document.addEventListener("pointerdown", (event) => {
      window.__portfolioInputAudit.push({
        kind: "pointerdown",
        pointerType: event.pointerType,
        trusted: event.isTrusted,
        target: event.target.closest?.(".media-slot")?.getAttribute("aria-label")
          || event.target.closest?.("button, a")?.getAttribute("aria-label")
          || event.target.closest?.("button, a")?.textContent?.trim()
          || "",
      });
    }, true);
    document.addEventListener("pointerover", (event) => {
      if (event.pointerType === "mouse") {
        window.__portfolioInputAudit.push({ kind: "mouse-over", trusted: event.isTrusted });
      }
    }, true);
    document.addEventListener("keydown", (event) => {
      window.__portfolioInputAudit.push({ kind: "keydown", key: event.key, trusted: event.isTrusted });
    }, true);
  });
}

async function assertTouchEmulation(page, viewport) {
  const input = await page.evaluate(() => ({
    width: window.innerWidth,
    touchPoints: navigator.maxTouchPoints,
    coarsePointer: matchMedia("(pointer: coarse)").matches,
    hover: matchMedia("(hover: hover)").matches,
  }));
  expect(input.width).toBe(viewport.width);
  expect(input.touchPoints).toBeGreaterThan(0);
  expect(input.coarsePointer).toBe(true);
  expect(input.hover).toBe(false);
}

async function tapAtStableHitPoint(page, locator) {
  await expect(locator).toBeVisible();

  // Reduced-motion mode freezes ambient drift and camera transforms. Find a
  // live, unobscured point after layout settles, then send a trusted touch tap.
  const point = await locator.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    const fractions = [0.5, 0.25, 0.75, 0.125, 0.875];
    const candidates = [];
    for (const yFraction of fractions) {
      for (const xFraction of fractions) {
        const x = bounds.left + bounds.width * xFraction;
        const y = bounds.top + bounds.height * yFraction;
        if (element.contains(document.elementFromPoint(x, y))) {
          const distance = Math.hypot(xFraction - 0.5, yFraction - 0.5);
          candidates.push({ x, y, distance });
        }
      }
    }
    candidates.sort((a, b) => a.distance - b.distance);
    return candidates[0] ? { x: candidates[0].x, y: candidates[0].y } : null;
  });
  expect(point, "The tile must have a real, unobscured touch hit target").not.toBeNull();
  await page.touchscreen.tap(point.x, point.y);

  const lastTouch = await page.evaluate(() => window.__portfolioInputAudit
    .filter((event) => event.kind === "pointerdown")
    .at(-1));
  expect(lastTouch).toMatchObject({ pointerType: "touch", trusted: true });
}

async function assertGalleryAtRest(page) {
  await expect(page.locator(".detail-page-transition-backdrop")).toHaveCount(0);
  await expect(page.locator(".media-slot.is-hovered")).toHaveCount(0);
  await expect(page.locator(".media-slot.is-hover-video-ready")).toHaveCount(0);
  await expect(page.locator(".project-tags")).toHaveCount(0);

  const videos = await page.locator(".media-slot video").evaluateAll((elements) =>
    elements.map((video) => ({ paused: video.paused, currentTime: video.currentTime })),
  );
  expect(videos.length).toBeGreaterThan(0);
  expect(videos.every((video) => video.paused && video.currentTime === 0)).toBe(true);

  await expect(page.locator(".slot-j .external-project-notice")).toHaveCSS("opacity", "0");
}

async function open2030FromTile(page) {
  await tapAtStableHitPoint(page, page.locator(tile));
  await expect.poll(() => page.evaluate(() => location.hash)).toBe("#/desktop/xbox-2030");
  await expect(page.locator(detailTitle)).toHaveText("Xbox in 2030");
  await expect(page.locator(".media-slot.is-hovered")).toHaveCount(0);
}

async function closeWithDesktopTab(page) {
  const desktopTab = page.locator('a[data-label="desktop"]');
  if (page.viewportSize().width < 720) {
    await tapAtStableHitPoint(page, page.getByRole("button", { name: "Open navigation menu" }));
    await expect(page.locator(".site-nav")).toHaveClass(/is-open/);
  }
  await tapAtStableHitPoint(page, desktopTab);
  await expect.poll(() => page.evaluate(() => location.hash)).toBe("#/desktop");
  await expect(page.locator(".detail-page-transition-backdrop")).toHaveCount(0);
}

for (const viewport of viewports) {
  test(`${viewport.name}: touch visits, browser back and navigation-tab close leave the gallery clear`, async ({ page, baseURL }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await auditInput(page);
    await page.goto(new URL("#/desktop", baseURL).href);
    await assertTouchEmulation(page, viewport);
    await expect(page.locator(".artboard")).toBeVisible();
    await assertGalleryAtRest(page);

    await open2030FromTile(page);
    await page.goBack();
    await expect.poll(() => page.evaluate(() => location.hash)).toBe("#/desktop");
    await assertGalleryAtRest(page);

    // Revisit the same animated tile, then close through the desktop navigation.
    await open2030FromTile(page);
    await closeWithDesktopTab(page);
    await assertGalleryAtRest(page);
  });

  test(`${viewport.name}: a direct detail link and reload return to a clean gallery`, async ({ page, baseURL }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await auditInput(page);
    await page.goto(new URL("#/desktop/xbox-2030", baseURL).href);
    await assertTouchEmulation(page, viewport);
    await expect(page.locator(detailTitle)).toHaveText("Xbox in 2030");
    await expect.poll(() => page.evaluate(() => location.hash)).toBe("#/desktop/xbox-2030");

    // A fresh document load must also initialize the detail route correctly.
    await page.reload();
    await expect(page.locator(detailTitle)).toHaveText("Xbox in 2030");
    await closeWithDesktopTab(page);
    await assertGalleryAtRest(page);
  });

  test(`${viewport.name}: the external Instagram card returns in its rest state`, async ({ page, baseURL }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await auditInput(page);
    await page.goto(new URL("#/desktop", baseURL).href);
    await assertTouchEmulation(page, viewport);
    await page.context().route("https://www.instagram.com/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "<!doctype html><title>Instagram test destination</title>",
      }),
    );

    const popupPromise = page.waitForEvent("popup");
    await tapAtStableHitPoint(page, page.locator(instagramTile));
    const popup = await popupPromise;
    await expect(popup).toHaveURL(/instagram\.com/);
    await expect(page.locator(".slot-j")).toHaveClass(/is-external-link-rest/);
    await assertGalleryAtRest(page);
    await popup.close();
    await assertGalleryAtRest(page);
  });
}

test("real mouse hover and keyboard focus still activate project tiles", async ({ browser, baseURL }) => {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    isMobile: false,
    hasTouch: false,
    reducedMotion: "reduce",
  });
  try {
    const page = await context.newPage();
    await auditInput(page);
    await page.goto(new URL("#/desktop", baseURL).href);
    await expect.poll(() => page.evaluate(() => matchMedia("(any-hover: hover)").matches)).toBe(true);

    const target = page.locator(tile);
    const bounds = await target.boundingBox();
    expect(bounds).not.toBeNull();
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    await expect(target).toHaveClass(/is-hovered/);
    await expect(page.locator(".project-tags")).toBeVisible();
    expect(await page.evaluate(() => window.__portfolioInputAudit
      .some((event) => event.kind === "mouse-over" && event.trusted))).toBe(true);

    await page.mouse.move(0, 0);
    await expect(target).not.toHaveClass(/is-hovered/);
    await expect(page.locator(".project-tags")).toHaveCount(0);

    let reachedTile = false;
    for (let index = 0; index < 30; index += 1) {
      await page.keyboard.press("Tab");
      if (await target.evaluate((element) => element === document.activeElement)) {
        reachedTile = true;
        break;
      }
    }
    expect(reachedTile, "Keyboard Tab must be able to reach the project tile").toBe(true);
    await expect(target).toHaveClass(/is-hovered/);
    await expect(page.locator(".project-tags")).toBeVisible();
    expect(await page.evaluate(() => window.__portfolioInputAudit
      .some((event) => event.kind === "keydown" && event.key === "Tab" && event.trusted))).toBe(true);

    await page.keyboard.press("Enter");
    await expect.poll(() => page.evaluate(() => location.hash)).toBe("#/desktop/xbox-2030");
    await expect(page.locator(".media-slot.is-hovered")).toHaveCount(0);
    await page.goBack();
    await expect.poll(() => page.evaluate(() => location.hash)).toBe("#/desktop");
    await assertGalleryAtRest(page);
  } finally {
    await context.close();
  }
});
