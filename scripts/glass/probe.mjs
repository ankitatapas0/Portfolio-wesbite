// Test-page instrumentation only. No application or media substitutions.
export function installGlassProbe({ fallback = false } = {}) {
  const tracked = () => new Error().stack?.includes("/src/components/glassRenderer.ts");
  const isBand = (gl) => gl.canvas.classList.contains("detail-page-glass-band");
  const counts = { draws: 0, allocations: 0, uploads: 0, bounds: 0, styles: 0, discoveries: 0, callbacks: 0, timersScheduled: 0 };
  const live = { raf: new Set(), video: new Set(), timers: new Set(), observers: new Set(), listeners: [], gpu: new Set() };
  window.glassTest = {
    counts, live, pixels: null, sampling: true,
    reset: () => Object.keys(counts).forEach((key) => { counts[key] = 0; }),
    resources: () => Object.fromEntries(Object.entries(live).map(([key, value]) => [key, value.size ?? value.length])),
  };
  const raf = window.requestAnimationFrame, cancelRaf = window.cancelAnimationFrame;
  window.requestAnimationFrame = function(callback) {
    if (!tracked()) return raf.call(this, callback);
    const id = raf.call(this, (time) => { live.raf.delete(id); callback(time); });
    live.raf.add(id);
    return id;
  };
  window.cancelAnimationFrame = function(id) { live.raf.delete(id); cancelRaf.call(this, id); };
  const timeout = window.setTimeout, cancelTimeout = window.clearTimeout;
  window.setTimeout = function(callback, delay, ...args) {
    if (!tracked()) return timeout.call(this, callback, delay, ...args);
    counts.timersScheduled++;
    const id = timeout.call(this, () => { live.timers.delete(id); callback(...args); }, delay);
    live.timers.add(id);
    return id;
  };
  window.clearTimeout = function(id) { live.timers.delete(id); cancelTimeout.call(this, id); };
  const videoProto = HTMLVideoElement.prototype;
  const rvfc = videoProto.requestVideoFrameCallback, cancelRvfc = videoProto.cancelVideoFrameCallback;
  if (fallback) {
    Object.defineProperty(videoProto, "requestVideoFrameCallback", { configurable: true, value: undefined });
  } else if (rvfc) {
    videoProto.requestVideoFrameCallback = function(callback) {
      const record = { video: this };
      const owned = tracked();
      record.id = rvfc.call(this, (...args) => {
        live.video.delete(record);
        if (owned) counts.callbacks++;
        callback(...args);
      });
      if (owned) live.video.add(record);
      return record.id;
    };
    videoProto.cancelVideoFrameCallback = function(id) {
      for (const record of live.video) if (record.video === this && record.id === id) live.video.delete(record);
      cancelRvfc.call(this, id);
    };
  }
  for (const kind of ["MutationObserver", "ResizeObserver"]) {
    const Original = window[kind];
    window[kind] = class extends Original {
      constructor(callback) { super(callback); this.owned = tracked(); }
      observe(...args) { if (this.owned) live.observers.add(this); return super.observe(...args); }
      disconnect() { live.observers.delete(this); super.disconnect(); }
    };
  }
  const add = EventTarget.prototype.addEventListener, remove = EventTarget.prototype.removeEventListener;
  EventTarget.prototype.addEventListener = function(type, listener, options) {
    if (tracked()) live.listeners.push({ target: this, type, listener });
    return add.call(this, type, listener, options);
  };
  EventTarget.prototype.removeEventListener = function(type, listener, options) {
    live.listeners = live.listeners.filter((r) => r.target !== this || r.type !== type || r.listener !== listener);
    return remove.call(this, type, listener, options);
  };
  for (const kind of ["Texture", "Buffer", "Program", "Shader"]) {
    const create = WebGLRenderingContext.prototype[`create${kind}`];
    const destroy = WebGLRenderingContext.prototype[`delete${kind}`];
    WebGLRenderingContext.prototype[`create${kind}`] = function(...args) {
      const resource = create.apply(this, args);
      if (resource && isBand(this)) live.gpu.add(resource);
      return resource;
    };
    WebGLRenderingContext.prototype[`delete${kind}`] = function(resource) {
      live.gpu.delete(resource);
      return destroy.call(this, resource);
    };
  }
  for (const [method, key] of [["drawArrays", "draws"], ["texImage2D", "allocations"], ["texSubImage2D", "uploads"]]) {
    const original = WebGLRenderingContext.prototype[method];
    WebGLRenderingContext.prototype[method] = function(...args) {
      if (isBand(this)) counts[key]++;
      const result = original.apply(this, args);
      if (method === "drawArrays" && isBand(this) && window.glassTest.sampling) {
        const pixels = new Uint8Array(this.canvas.width * this.canvas.height * 4);
        this.readPixels(0, 0, this.canvas.width, this.canvas.height, this.RGBA, this.UNSIGNED_BYTE, pixels);
        let hash = 0, colorful = 0;
        for (let i = 0; i < pixels.length; i += 4) {
          hash = (Math.imul(hash, 31) + pixels[i] + pixels[i + 1] * 3 + pixels[i + 2] * 7) | 0;
          if (pixels[i + 3] > 200 && Math.max(...pixels.subarray(i, i + 3)) - Math.min(...pixels.subarray(i, i + 3)) > 15) colorful++;
        }
        const center = Math.floor(this.canvas.width / 2) * 4;
        window.glassTest.pixels = {
          hash, colorful, glError: this.getError(),
          lowerAlpha: pixels[center + 3],
          upperAlpha: pixels[(this.canvas.height - 1) * this.canvas.width * 4 + center + 3],
        };
      }
      return result;
    };
  }
  const bounds = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function(...args) {
    if (this.matches('video[data-detail-page-content], .expanded-media-image-frame[data-detail-page-content]')) counts.bounds++;
    return bounds.apply(this, args);
  };
  const styles = window.getComputedStyle;
  window.getComputedStyle = function(element, ...args) {
    if (element.matches('video[data-detail-page-content], .expanded-media-image-frame img')) counts.styles++;
    return styles.call(this, element, ...args);
  };
  for (const proto of [Element.prototype, Document.prototype]) {
    const query = proto.querySelectorAll;
    proto.querySelectorAll = function(selector) {
      if (selector.includes("video[data-detail-page-content]")) counts.discoveries++;
      return query.call(this, selector);
    };
  }
}
