// Dependency-free CDP measurement. Run against a development server:
// node scripts/check-glass.mjs http://localhost:80 baseline
// Requires a Chromium instance listening on --remote-debugging-port=9222.
// Cross-engine capability-gated checks and Getty snapshots:
// pnpm --filter @workspace/portfolio check-glass:browsers
// See docs/glass-performance.md; neither runner measures real-device FPS.
import { writeFile } from "node:fs/promises";
import { installGlassFaultProbe, checkGlassFaults } from "./glass-fault-checks.mjs";

const [url = "http://localhost:80", label = "optimized"] = process.argv.slice(2);
const targets = await (await fetch("http://localhost:9222/json")).json();
const socket = new WebSocket(targets.find((target) => target.type === "page").webSocketDebuggerUrl);
await new Promise((resolve) => socket.addEventListener("open", resolve, { once: true }));
let nextId = 0;
const pending = new Map();
socket.addEventListener("message", ({ data }) => {
  const result = JSON.parse(data);
  if (!result.id) return;
  const request = pending.get(result.id);
  pending.delete(result.id);
  if (result.error) request.reject(new Error(result.error.message));
  else request.resolve(result.result);
});
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++nextId;
  pending.set(id, { resolve, reject });
  socket.send(JSON.stringify({ id, method, params }));
});
const evaluate = async (expression) => {
  const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
};
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
await send("Page.enable");
await send("Page.addScriptToEvaluateOnNewDocument", { source: `
  window.glassCounts = { draws: 0, allocations: 0, uploads: 0, bounds: 0, styles: 0, discoveries: 0 };
  window.glassProbe = false;
  window.glassPixels = null;
  window.glassLive = { raf: new Set(), video: new Set(), timers: new Set(), observers: new Set(), listeners: [], gpu: new Set() };
  const fromRenderer = () => new Error().stack.includes('/src/components/glassRenderer.ts');
  const raf = window.requestAnimationFrame, cancelRaf = window.cancelAnimationFrame;
  window.requestAnimationFrame = function(callback) {
    if (!fromRenderer()) return raf.call(this, callback);
    const id = raf.call(this, time => { glassLive.raf.delete(id); callback(time); });
    glassLive.raf.add(id); return id;
  };
  window.cancelAnimationFrame = function(id) { glassLive.raf.delete(id); cancelRaf.call(this, id); };
  const timeout = window.setTimeout, cancelTimeout = window.clearTimeout;
  window.setTimeout = function(callback, ms, ...args) {
    if (!fromRenderer()) return timeout.call(this, callback, ms, ...args);
    const id = timeout.call(this, () => { glassLive.timers.delete(id); callback(...args); }, ms);
    glassLive.timers.add(id); return id;
  };
  window.clearTimeout = function(id) { glassLive.timers.delete(id); cancelTimeout.call(this, id); };
  const rvfc = HTMLVideoElement.prototype.requestVideoFrameCallback;
  const cancelRvfc = HTMLVideoElement.prototype.cancelVideoFrameCallback;
  if (rvfc) {
    HTMLVideoElement.prototype.requestVideoFrameCallback = function(callback) {
      const tracked = fromRenderer();
      const record = { video: this };
      record.id = rvfc.call(this, (...args) => { glassLive.video.delete(record); callback(...args); });
      if (tracked) glassLive.video.add(record);
      return record.id;
    };
    HTMLVideoElement.prototype.cancelVideoFrameCallback = function(id) {
      for (const r of glassLive.video) if (r.video === this && r.id === id) glassLive.video.delete(r);
      cancelRvfc.call(this, id);
    };
  }
  for (const kind of ['MutationObserver', 'ResizeObserver']) {
    const Original = window[kind];
    window[kind] = class extends Original {
      constructor(callback) { super(callback); this.tracked = fromRenderer(); }
      observe(...args) { if (this.tracked) glassLive.observers.add(this); return super.observe(...args); }
      disconnect() { glassLive.observers.delete(this); super.disconnect(); }
    };
  }
  const add = EventTarget.prototype.addEventListener, remove = EventTarget.prototype.removeEventListener;
  EventTarget.prototype.addEventListener = function(type, listener, options) {
    if (fromRenderer()) glassLive.listeners.push({ target: this, type, listener });
    return add.call(this, type, listener, options);
  };
  EventTarget.prototype.removeEventListener = function(type, listener, options) {
    glassLive.listeners = glassLive.listeners.filter(r => r.target !== this || r.type !== type || r.listener !== listener);
    return remove.call(this, type, listener, options);
  };
  for (const kind of ['Texture', 'Buffer', 'Program', 'Shader']) {
    const create = WebGLRenderingContext.prototype['create' + kind];
    const destroy = WebGLRenderingContext.prototype['delete' + kind];
    WebGLRenderingContext.prototype['create' + kind] = function(...args) {
      const resource = create.apply(this, args);
      if (resource && this.canvas.classList.contains('detail-page-glass-band')) glassLive.gpu.add(resource);
      return resource;
    };
    WebGLRenderingContext.prototype['delete' + kind] = function(resource) {
      glassLive.gpu.delete(resource); return destroy.call(this, resource);
    };
  }
  for (const [method, key] of [['drawArrays','draws'], ['texImage2D','allocations'], ['texSubImage2D','uploads']]) {
    const original = WebGLRenderingContext.prototype[method];
    WebGLRenderingContext.prototype[method] = function(...args) {
      if (this.canvas.classList.contains('detail-page-glass-band')) window.glassCounts[key]++;
      const result = original.apply(this, args);
      if (method === 'drawArrays' && window.glassProbe && this.canvas.classList.contains('detail-page-glass-band')) {
        const pixels = new Uint8Array(this.canvas.width * this.canvas.height * 4);
        this.readPixels(0, 0, this.canvas.width, this.canvas.height, this.RGBA, this.UNSIGNED_BYTE, pixels);
        let hash = 0;
        for (let i = 0; i < pixels.length; i += 7) hash = (Math.imul(hash, 31) + pixels[i]) | 0;
        const center = Math.floor(this.canvas.width / 2) * 4;
        let premultipliedError = 0;
        for (let i = 0; i < pixels.length; i += 4) {
          premultipliedError = Math.max(premultipliedError,
            pixels[i] - pixels[i + 3], pixels[i + 1] - pixels[i + 3], pixels[i + 2] - pixels[i + 3]);
        }
        const fadeSamples = [0, 5, 15, 25, 30, 40, 69].map((cssY) => {
          const topRow = Math.min(this.canvas.height - 1, Math.floor(cssY * this.canvas.height / 70));
          const row = this.canvas.height - 1 - topRow;
          return {
            cssY: (topRow + 0.5) * 70 / this.canvas.height,
            alpha: pixels[row * this.canvas.width * 4 + center + 3],
          };
        });
        window.glassPixels = {
          hash, lowerAlpha: pixels[center + 3],
          upperAlpha: pixels[(this.canvas.height - 1) * this.canvas.width * 4 + center + 3],
          premultiplied: this.getContextAttributes().premultipliedAlpha,
          premultipliedError, fadeSamples,
          glError: this.getError()
        };
      }
      return result;
    };
  }
  const bounds = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function(...args) {
    if (this.matches('video[data-detail-page-content], .expanded-media-image-frame[data-detail-page-content]')) window.glassCounts.bounds++;
    return bounds.apply(this, args);
  };
  const styles = window.getComputedStyle;
  window.getComputedStyle = function(element, ...args) {
    if (element.matches('video[data-detail-page-content], .expanded-media-image-frame img')) window.glassCounts.styles++;
    return styles.call(this, element, ...args);
  };
  const query = Element.prototype.querySelectorAll;
  Element.prototype.querySelectorAll = function(selector) {
    if (selector.includes('video[data-detail-page-content]')) window.glassCounts.discoveries++;
    return query.call(this, selector);
  };
  const documentQuery = Document.prototype.querySelectorAll;
  Document.prototype.querySelectorAll = function(selector) {
    if (selector.includes('video[data-detail-page-content]')) window.glassCounts.discoveries++;
    return documentQuery.call(this, selector);
  };
` });
await send("Page.addScriptToEvaluateOnNewDocument", {
  source: `(${installGlassFaultProbe.toString()})()`,
});
await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 2, mobile: false });
await send("Page.navigate", { url: "about:blank" });
await wait(200);
await send("Page.navigate", { url: `${url}/#/desktop/getty-unshuttered` });
await wait(6000);
await evaluate(`document.querySelectorAll('video').forEach(v => v.pause())`);
await evaluate(`document.querySelector('.detail-page-transition-backdrop').scrollTop = 300`);
await wait(1500);
const results = {};
const measure = async (name, action) => {
  await evaluate(`Object.keys(glassCounts).forEach(k => glassCounts[k] = 0)`);
  await action();
  results[name] = await evaluate(`({...glassCounts})`);
};
await measure("static2s", () => wait(2000));
await measure("scroll2s", () => evaluate(`new Promise(resolve => {
  const root = document.querySelector('.detail-page-transition-backdrop');
  const start = performance.now();
  function step(now) {
    root.scrollTop = 300 + Math.sin((now - start) / 400) * 150;
    if (now - start < 2000) requestAnimationFrame(step); else resolve();
  }
  requestAnimationFrame(step);
})`));
await send("Page.navigate", { url: `${url}/#/desktop/opera-live-visuals` });
await wait(5000);
await evaluate(`(async () => {
  document.querySelectorAll('video').forEach(v => v.pause());
  const video = document.querySelector('video[data-detail-page-content]');
  video.muted = true;
  document.querySelector('.detail-page-transition-backdrop').scrollTop = 50;
  await video.play();
})()`);
await wait(1000);
await measure("decodedVideo2s", () => wait(2000));
results.video = await evaluate(`(() => {
  const v = document.querySelector('video[data-detail-page-content]');
  return { readyState: v.readyState, paused: v.paused, decodedFrames: v.getVideoPlaybackQuality().totalVideoFrames, bounds: v.getBoundingClientRect().toJSON(), h264: v.canPlayType('video/mp4; codecs="avc1.42E01E"') };
})()`);
await evaluate(`document.querySelectorAll('video').forEach(v => v.pause())`);
await wait(300);
await measure("paused2s", () => wait(2000));
const screenshot = await send("Page.captureScreenshot", { format: "png" });
await writeFile(`/tmp/glass-${label}.png`, Buffer.from(screenshot.data, "base64"));
const live = () => evaluate(`Object.fromEntries(Object.entries(glassLive).map(([k,v]) => [k, v.size ?? v.length]))`);
const contextEvent = async (restore = false) => {
  await evaluate(`new Promise((resolve, reject) => {
    ${restore ? "" : `
    window.glassContextCanvas = document.querySelector('.detail-page-glass-band');
    window.glassContextExtension = glassContextCanvas.getContext('webgl').getExtension('WEBGL_lose_context');
    `}
    const canvas = window.glassContextCanvas;
    const extension = window.glassContextExtension;
    if (!extension) return reject(new Error('WEBGL_lose_context is unavailable'));
    const type = '${restore ? "webglcontextrestored" : "webglcontextlost"}';
    const done = () => { clearTimeout(timer); resolve(); };
    const timer = setTimeout(() => {
      canvas.removeEventListener(type, done);
      reject(new Error(type + ' timed out'));
    }, 6000);
    canvas.addEventListener(type, done, { once: true });
    extension.${restore ? "restoreContext" : "loseContext"}();
  })`);
};
const assertSuspended = (state, name) => {
  if (state.raf || state.video || state.timers || state.gpu) {
    throw new Error(name + " retained scheduled work/GPU resources: " + JSON.stringify(state));
  }
};
const checkRestored = async (name, beforePixels) => {
  const state = await live();
  const counts = await evaluate(`({...glassCounts})`);
  const pixels = await evaluate(`({...glassPixels})`);
  results[name] = { state, counts, pixels };
  if (!counts.draws || counts.allocations !== 1 || !counts.discoveries || !counts.bounds
    || state.gpu !== 5 || pixels.glError || pixels.lowerAlpha !== 255 || pixels.upperAlpha >= 10
    || (beforePixels && pixels.hash !== beforePixels.hash)) {
    throw new Error("Context restoration regression: " + JSON.stringify(results[name]));
  }
};
results.pausedLive = await live();
await evaluate(`document.querySelector('video[data-detail-page-content]').play()`);
await wait(300);
results.playingLive = await live();
await evaluate(`(() => {
  Object.defineProperty(document, 'hidden', { configurable: true, value: true });
  document.dispatchEvent(new Event('visibilitychange'));
})()`);
await measure("hidden2s", () => wait(2000));
results.hiddenLive = await live();
await evaluate(`delete document.hidden; document.dispatchEvent(new Event('visibilitychange'))`);
await wait(300);
await evaluate(`document.querySelectorAll('video').forEach(v => v.pause())`);
await wait(100);
await evaluate(`(() => {
  window.savedRvfc = HTMLVideoElement.prototype.requestVideoFrameCallback;
  HTMLVideoElement.prototype.requestVideoFrameCallback = undefined;
  return document.querySelector('video[data-detail-page-content]').play();
})()`);
await wait(300);
await measure("fallbackVideo500ms", () => wait(500));
await evaluate(`document.querySelectorAll('video').forEach(v => v.pause())`);
await wait(100);
results.fallbackPausedLive = await live();
await evaluate(`HTMLVideoElement.prototype.requestVideoFrameCallback = window.savedRvfc`);
await evaluate(`window.glassProbe = true; window.dispatchEvent(new Event('resize'))`);
await wait(150);
results.beforeSeekPixels = await evaluate(`({...glassPixels})`);
await evaluate(`new Promise((resolve, reject) => {
  const v = document.querySelector('video[data-detail-page-content]');
  const timer = setTimeout(() => reject(new Error('seek timed out')), 6000);
  v.addEventListener('seeked', () => { clearTimeout(timer); resolve(); }, { once: true });
  v.currentTime = 12;
})`);
await wait(200);
results.afterSeekPixels = await evaluate(`({...glassPixels})`);
await evaluate(`document.querySelector('.theme-toggle').click()`);
await wait(300);
results.themedPixels = await evaluate(`({...glassPixels})`);
await evaluate(`document.querySelector('.theme-toggle').click(); window.glassProbe = false`);
await wait(300);
await evaluate(`window.glassProbe = true; window.dispatchEvent(new Event('resize'))`);
await wait(150);
const beforeLossPixels = await evaluate(`({...glassPixels})`);
await contextEvent();
await measure("lost500ms", async () => {
  // Invalidations during loss must not restart capture or video callbacks.
  await evaluate(`window.dispatchEvent(new Event('resize'));
    document.querySelector('.detail-page-transition-backdrop').dispatchEvent(new Event('scroll'));
    document.querySelector('video[data-detail-page-content]').dispatchEvent(new Event('play'))`);
  await wait(500);
});
results.lostLive = await live();
assertSuspended(results.lostLive, "Lost context");
await evaluate(`Object.keys(glassCounts).forEach(k => glassCounts[k] = 0)`);
await contextEvent(true);
await wait(300);
await checkRestored("restoredVisible", beforeLossPixels);
await measure("restoredIdle500ms", () => wait(500));

// Restoration while hidden must not allocate or render until visible again.
await contextEvent();
await evaluate(`Object.defineProperty(document, 'hidden', { configurable: true, value: true });
  document.dispatchEvent(new Event('visibilitychange'))`);
await evaluate(`Object.keys(glassCounts).forEach(k => glassCounts[k] = 0)`);
await contextEvent(true);
await wait(300);
results.restoredHidden = { state: await live(), counts: await evaluate(`({...glassCounts})`) };
assertSuspended(results.restoredHidden.state, "Hidden restored context");
await evaluate(`delete document.hidden; document.dispatchEvent(new Event('visibilitychange'))`);
await wait(300);
await checkRestored("restoredAfterVisibility", beforeLossPixels);

// Playing-media callbacks also resume after restoration, without reallocating
// texture storage for subsequent decoded frames.
await evaluate(`document.querySelector('video[data-detail-page-content]').play()`);
await wait(150);
await contextEvent();
assertSuspended(await live(), "Playing lost context");
await evaluate(`Object.keys(glassCounts).forEach(k => glassCounts[k] = 0)`);
await contextEvent(true);
await wait(300);
await checkRestored("restoredPlaying");
await measure("restoredVideo500ms", () => wait(500));
await evaluate(`document.querySelectorAll('video').forEach(v => v.pause()); window.glassProbe = false`);
await wait(100);
results.dpr = [];
for (const dpr of [1, 1.25, 2, 3]) {
  await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: dpr, mobile: false });
  // CDP changes DPR without dispatching the resize real screen/zoom changes emit.
  await evaluate(`window.dispatchEvent(new Event('resize'))`);
  await wait(250);
  results.dpr.push(await evaluate(`(() => {
    const c = document.querySelector('.detail-page-glass-band');
    return { dpr: devicePixelRatio, width: c.width, height: c.height, cssWidth: c.style.width };
  })()`));
}
await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
await wait(1000);
await measure("closed2s", () => wait(2000));
results.closedLive = await live();
for (let i = 0; i < 3; i++) {
  await evaluate(`location.hash = '#/desktop/getty-unshuttered'`);
  await wait(1000);
  await evaluate(`location.hash = '#/desktop/opera-live-visuals'`);
  await wait(1000);
  await contextEvent();
  assertSuspended(await live(), "Repeated lost context");
  if (i !== 1) {
    await evaluate(`Object.keys(glassCounts).forEach(k => glassCounts[k] = 0); window.glassProbe = true`);
    await contextEvent(true);
    await wait(300);
    await checkRestored("repeatedRestore" + i);
  }
  await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
  await wait(500);
  if (i === 1) {
    // A late restore event on a canvas unmounted during loss must do nothing.
    await evaluate(`Object.keys(glassCounts).forEach(k => glassCounts[k] = 0)`);
    await contextEvent(true);
    await wait(300);
    results.closedRestore = { state: await live(), counts: await evaluate(`({...glassCounts})`) };
  }
  const closed = await live();
  if (Object.values(closed).some(Boolean)) {
    throw new Error("Close after context loss/restoration leaked resources: " + JSON.stringify(closed));
  }
}
results.repeatedCloseLive = await live();
if (label !== "baseline") {
  await checkGlassFaults({ evaluate, wait, live, contextEvent, results });
}
await evaluate(`location.hash = '#/desktop/getty-unshuttered'`);
await wait(1200);
await evaluate(`window.glassProbe = true; document.querySelectorAll('video').forEach(v => v.pause());
  document.querySelector('.detail-page-transition-backdrop').scrollTop = 300`);
await wait(1000);
results.imagePixels = await evaluate(`({...glassPixels})`);
const imageScreenshot = await send("Page.captureScreenshot", { format: "png" });
await writeFile(`/tmp/glass-${label}-getty.png`, Buffer.from(imageScreenshot.data, "base64"));
await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 3, mobile: true });
await wait(400);
results.mobile = await evaluate(`(() => {
  const c = document.querySelector('.detail-page-glass-band');
  return { width: c.width, height: c.height, cssWidth: c.style.width, cssHeight: c.getBoundingClientRect().height, pixels: glassPixels };
})()`);
const mobileScreenshot = await send("Page.captureScreenshot", { format: "png" });
await writeFile(`/tmp/glass-${label}-mobile.png`, Buffer.from(mobileScreenshot.data, "base64"));
await evaluate(`window.glassProbe = false; document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
await wait(500);
if (label !== "baseline") {
  for (const [name, pixels] of [["desktop", results.imagePixels], ["phone", results.mobile.pixels]]) {
    if (!pixels.premultiplied || pixels.premultipliedError > 1
      || pixels.fadeSamples.some(({ cssY, alpha }) => {
        const t = Math.max(0, Math.min(cssY / 30, 1));
        return Math.abs(alpha - Math.round(255 * t * t * (3 - 2 * t))) > 2;
      })) {
      throw new Error(name + " 30px fade/transparent-color regression: " + JSON.stringify(pixels));
    }
  }
  if (results.lost500ms.draws || results.lost500ms.uploads || results.lost500ms.allocations
    || results.restoredIdle500ms.draws || results.restoredHidden.counts.draws
    || results.restoredHidden.counts.allocations || results.closedRestore.counts.draws
    || !results.restoredVideo500ms.draws || results.restoredVideo500ms.allocations) {
    throw new Error("Context recovery scheduling regression: " + JSON.stringify(results));
  }
  if (results.static2s.draws || results.paused2s.draws || results.hidden2s.draws || results.closed2s.draws) {
    throw new Error("Idle/hidden/closed redraw regression: " + JSON.stringify(results));
  }
  if (!results.decodedVideo2s.draws || results.video.paused || results.decodedVideo2s.allocations) {
    throw new Error("Video update/storage regression: " + JSON.stringify(results));
  }
  if (Object.values(results.repeatedCloseLive).some(Boolean)) {
    throw new Error("Renderer cleanup regression: " + JSON.stringify(results));
  }
  if (results.hiddenLive.raf || results.hiddenLive.video || results.hiddenLive.timers
    || !results.fallbackVideo500ms.draws || results.fallbackPausedLive.timers) {
    throw new Error("Visibility/fallback scheduling regression: " + JSON.stringify(results));
  }
  if (results.dpr.some(r => r.width !== Math.round(1280 * Math.min(r.dpr, 1.5))
    || r.height !== Math.round(70 * Math.min(r.dpr, 1.5)))) {
    throw new Error("DPR sizing regression: " + JSON.stringify(results.dpr));
  }
  if (results.beforeSeekPixels.hash === results.afterSeekPixels.hash
    || results.afterSeekPixels.hash === results.themedPixels.hash
    || results.imagePixels.glError || results.mobile.pixels.glError
    || results.imagePixels.lowerAlpha !== 255 || results.imagePixels.upperAlpha >= 10
    || results.mobile.width !== 585 || results.mobile.cssHeight !== 70) {
    throw new Error("Seek/theme/coverage/feathering regression: " + JSON.stringify(results));
  }
}
console.log(JSON.stringify(results, null, 2));
await writeFile(`/tmp/glass-${label}.json`, JSON.stringify(results, null, 2));
socket.close();
