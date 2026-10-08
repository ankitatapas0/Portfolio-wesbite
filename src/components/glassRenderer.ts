import { drawGlassMedia, type GlassMedia } from "./glassMedia";
import { captureGlassTable, type GlassTable } from "./glassTable";

const mediaSelector = "video[data-detail-page-content], .expanded-media-image-frame[data-detail-page-content]";
const mediaEvents = ["load", "loadedmetadata", "loadeddata", "resize", "play",
  "pause", "seeking", "seeked", "ended", "emptied", "error"] as const;
const motionEvents = ["animationstart", "animationend", "animationcancel",
  "transitionrun", "transitionend", "transitioncancel"] as const;

export function createGlassRenderer(
  canvas: HTMLCanvasElement,
  gl: WebGLRenderingContext,
  root: HTMLElement | null,
  bandHeight: number,
  captureHeight: number,
  initializeGpu: () => (() => void) | null,
): () => void {
  const source = document.createElement("canvas");
  const context = source.getContext("2d", { alpha: false });
  if (!root || !context) {
    console.error("Unable to initialize the detail glass capture surface.");
    return () => {};
  }
  const viewport = window.visualViewport;
  let disposed = false;
  let contextUnavailable = gl.isContextLost();
  let releaseGpu: (() => void) | null = null;
  let frame: number | null = null;
  let fallbackTimer: number | null = null;
  let entries: GlassMedia[] = [];
  let tables: GlassTable[] = [];
  let discoveryDirty = true;
  let layoutDirty = true;
  let fittingDirty = true;
  let sizeDirty = true;
  let motionDirty = true;
  let animations: Animation[] = [];
  let measuredScrollTop = 0;
  let ratio = 1;
  let width = 0;
  let textureAllocated = false;
  let background = "";
  let resolutionQuery: MediaQueryList | null = null;

  const schedule = () => {
    if (!disposed && !contextUnavailable && !document.hidden && frame === null) {
      frame = requestAnimationFrame(render);
    }
  };
  const invalidateLayout = () => {
    layoutDirty = true;
    fittingDirty = true;
    tables.forEach((table) => { table.dirty = true; });
    schedule();
  };
  const cancelVideoFrame = (entry: GlassMedia) => {
    if (entry.frameCallback !== null && entry.media instanceof HTMLVideoElement) {
      entry.media.cancelVideoFrameCallback(entry.frameCallback);
      entry.frameCallback = null;
    }
  };
  const suspend = () => {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    if (fallbackTimer !== null) clearTimeout(fallbackTimer);
    fallbackTimer = null;
    entries.forEach(cancelVideoFrame);
  };
  const resizeObserver = new ResizeObserver(() => {
    sizeDirty = true;
    invalidateLayout();
  });
  const discover = () => {
    const previous = new Map(entries.map((entry) => [entry.media, entry]));
    entries = [];
    root.querySelectorAll<HTMLElement>(mediaSelector).forEach((element) => {
      const media = element instanceof HTMLVideoElement ? element : element.querySelector("img");
      if (!media) return;
      let entry = previous.get(media);
      if (entry) {
        previous.delete(media);
      } else {
        const update = (event: Event) => {
          if (["load", "loadedmetadata", "resize", "emptied"].includes(event.type)) {
            invalidateLayout();
          } else {
            schedule();
          }
        };
        mediaEvents.forEach((event) => media.addEventListener(event, update));
        resizeObserver.observe(element);
        entry = {
          element, media, bounds: new DOMRect(), fit: "", frameCallback: null,
          fallbackTime: -1,
          dispose: () => {
            mediaEvents.forEach((event) => media.removeEventListener(event, update));
            resizeObserver.unobserve(element);
          },
        };
      }
      entries.push(entry);
    });
    previous.forEach((entry) => {
      cancelVideoFrame(entry);
      entry.dispose();
    });
    const previousTables = new Map(tables.map((table) => [table.element, table]));
    tables = Array.from(root.querySelectorAll<HTMLElement>("[data-detail-page-table]"), (element) => {
      const previous = previousTables.get(element);
      previousTables.delete(element);
      if (previous) return previous;
      resizeObserver.observe(element);
      return { element, bounds: new DOMRect(), snapshot: null, dirty: true };
    });
    previousTables.forEach((table) => {
      resizeObserver.unobserve(table.element);
      if (table.snapshot) table.snapshot.width = table.snapshot.height = 0;
    });
    discoveryDirty = false;
    layoutDirty = fittingDirty = true;
  };
  const resize = () => {
    // The band is a smooth distortion, not text: 1.5x retains detail while
    // reducing capture/upload/shading pixels by 44% versus the former 2x cap.
    ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    width = Math.max(root.clientWidth, 1);
    const pixelWidth = Math.round(width * ratio);
    const pixelHeight = Math.round(captureHeight * ratio);
    if (!textureAllocated || source.width !== pixelWidth || source.height !== pixelHeight) {
      canvas.style.width = `${width}px`;
      canvas.width = pixelWidth;
      canvas.height = Math.round(bandHeight * ratio);
      source.width = pixelWidth;
      source.height = pixelHeight;
      gl.viewport(0, 0, canvas.width, canvas.height);
      // Allocate only on a size change, then update the same storage.
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, pixelWidth, pixelHeight,
        0, gl.RGB, gl.UNSIGNED_BYTE, null);
      textureAllocated = true;
    }
    sizeDirty = false;
  };
  const syncVideoFrames = (visible: Set<GlassMedia>) => {
    // Replace fallback snapshots when scrolling changes which videos overlap.
    if (fallbackTimer !== null) {
      clearTimeout(fallbackTimer);
      fallbackTimer = null;
    }
    let needsFallback = false;
    entries.forEach((entry) => {
      const video = entry.media;
      if (!(video instanceof HTMLVideoElement)) return;
      if (!visible.has(entry) || video.paused || video.ended || document.hidden) {
        cancelVideoFrame(entry);
        return;
      }
      if (typeof video.requestVideoFrameCallback === "function") {
        if (entry.frameCallback === null) {
          entry.frameCallback = video.requestVideoFrameCallback(() => {
            entry.frameCallback = null;
            schedule();
          });
        }
      } else {
        needsFallback = true;
      }
    });
    if (needsFallback && fallbackTimer === null) {
      // Older browsers: poll only overlapping, playing videos, at most 30Hz.
      // A stalled video doesn't cause texture uploads or geometry reads.
      fallbackTimer = window.setTimeout(function poll() {
        fallbackTimer = null;
        if (disposed || contextUnavailable || document.hidden) return;
        let changed = false;
        let playing = false;
        visible.forEach((entry) => {
          const video = entry.media;
          if (!(video instanceof HTMLVideoElement) || video.paused || video.ended) return;
          playing = true;
          if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
            && entry.fallbackTime !== video.currentTime) {
            entry.fallbackTime = video.currentTime;
            changed = true;
          }
        });
        if (changed) schedule();
        else if (playing) fallbackTimer = window.setTimeout(poll, 1000 / 30);
      }, 1000 / 30);
    }
  };
  const render = () => {
    frame = null;
    if (disposed || contextUnavailable || document.hidden || gl.isContextLost()) return;
    if (!releaseGpu) {
      releaseGpu = initializeGpu();
      if (!releaseGpu) {
        // Initialization reports its failure; don't repeatedly retry every event.
        contextUnavailable = true;
        return;
      }
    }
    if (discoveryDirty) discover();
    // Also notice DPR changes on the next invalidation; some embedded browsers
    // don't deliver a resolution-query change event reliably.
    if (Math.min(window.devicePixelRatio || 1, 1.5) !== ratio) sizeDirty = true;
    if (sizeDirty) resize();
    if (motionDirty) {
      animations = root.getAnimations({ subtree: true });
      motionDirty = false;
    }
    const moving = animations.some((animation) =>
      animation.playState === "running" || animation.pending);
    if (moving) layoutDirty = true;
    if (layoutDirty) {
      entries.forEach((entry) => {
        entry.bounds = entry.element.getBoundingClientRect();
      });
      tables.forEach((table) => {
        table.bounds = table.element.getBoundingClientRect();
        table.dirty = true;
      });
      measuredScrollTop = root.scrollTop;
      layoutDirty = false;
    }
    if (fittingDirty) {
      entries.forEach((entry) => { entry.fit = getComputedStyle(entry.media).objectFit; });
      fittingDirty = false;
    }
    const height = viewport?.height ?? window.innerHeight;
    const captureTop = height - captureHeight;
    const scrollDelta = root.scrollTop - measuredScrollTop;
    const visible = new Set<GlassMedia>();
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.fillStyle = background;
    context.fillRect(0, 0, width, captureHeight);
    entries.forEach((entry) => {
      const top = entry.bounds.top - scrollDelta;
      if (top + entry.bounds.height <= captureTop || top >= height) return;
      visible.add(entry);
      drawGlassMedia(context, entry, top, captureTop);
    });
    tables.forEach((table) => {
      const top = table.bounds.top - scrollDelta;
      if (top + table.bounds.height <= captureTop || top >= height) return;
      if (table.dirty) {
        table.snapshot = captureGlassTable(table.element, ratio, table.snapshot);
        table.dirty = false;
      }
      if (table.snapshot) {
        context.drawImage(table.snapshot, table.bounds.left, top - captureTop,
          table.bounds.width, table.bounds.height);
      }
    });
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGB, gl.UNSIGNED_BYTE, source);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    syncVideoFrames(visible);
    if (moving) {
      // One final geometry sample is needed after the last animation frame.
      layoutDirty = true;
      schedule();
    }
  };

  const updateTheme = () => {
    background = getComputedStyle(document.documentElement).getPropertyValue("--color-main-1").trim();
    invalidateLayout();
  };
  const themeObserver = new MutationObserver(updateTheme);
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  const contentObserver = new MutationObserver((records) => {
    if (records.some((record) => record.type === "childList")) discoveryDirty = true;
    motionDirty = true;
    invalidateLayout();
  });
  contentObserver.observe(root, {
    subtree: true, childList: true, characterData: true, attributes: true,
    attributeFilter: ["src", "class", "style", "width", "height"],
  });
  const updateMotion = () => {
    motionDirty = true;
    layoutDirty = true;
    schedule();
  };
  const updateScroll = (event: Event) => {
    if (event.target === root) schedule();
    else if (event.target instanceof HTMLElement && event.target.closest("[data-detail-page-table]")) {
      invalidateLayout();
    }
  };
  const updateSize = () => {
    sizeDirty = true;
    invalidateLayout();
  };
  const watchResolution = () => {
    resolutionQuery?.removeEventListener("change", onResolutionChange);
    resolutionQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
    resolutionQuery.addEventListener("change", onResolutionChange);
  };
  function onResolutionChange() {
    watchResolution();
    updateSize();
  }
  const updateVisibility = () => {
    if (document.hidden) suspend();
    else {
      motionDirty = true;
      updateSize();
    }
  };
  const contextLost = (event: Event) => {
    // Stop all work rather than trying to use invalid GPU resources.
    event.preventDefault();
    contextUnavailable = true;
    suspend();
    releaseGpu?.();
    releaseGpu = null;
    textureAllocated = false;
  };
  const contextRestored = () => {
    if (disposed || gl.isContextLost()) return;
    contextUnavailable = false;
    // Context restoration resets every WebGL object and binding. Rebuild them
    // on the next visible frame and reallocate storage even at the same size.
    discoveryDirty = layoutDirty = fittingDirty = sizeDirty = motionDirty = true;
    updateTheme();
  };
  resizeObserver.observe(root);
  if (root.firstElementChild) resizeObserver.observe(root.firstElementChild);
  root.addEventListener("scroll", updateScroll, { passive: true, capture: true });
  motionEvents.forEach((event) => root.addEventListener(event, updateMotion));
  window.addEventListener("resize", updateSize);
  viewport?.addEventListener("resize", updateSize);
  document.addEventListener("visibilitychange", updateVisibility);
  document.addEventListener("fullscreenchange", invalidateLayout);
  document.fonts?.addEventListener("loadingdone", invalidateLayout);
  canvas.addEventListener("webglcontextlost", contextLost);
  canvas.addEventListener("webglcontextrestored", contextRestored);
  watchResolution();
  updateTheme();
  return () => {
    disposed = true;
    suspend();
    entries.forEach((entry) => entry.dispose());
    entries = [];
    tables.forEach((table) => {
      if (table.snapshot) table.snapshot.width = table.snapshot.height = 0;
    });
    tables = [];
    resizeObserver.disconnect();
    themeObserver.disconnect();
    contentObserver.disconnect();
    resolutionQuery?.removeEventListener("change", onResolutionChange);
    root.removeEventListener("scroll", updateScroll, true);
    motionEvents.forEach((event) => root.removeEventListener(event, updateMotion));
    window.removeEventListener("resize", updateSize);
    viewport?.removeEventListener("resize", updateSize);
    document.removeEventListener("visibilitychange", updateVisibility);
    document.removeEventListener("fullscreenchange", invalidateLayout);
    document.fonts?.removeEventListener("loadingdone", invalidateLayout);
    canvas.removeEventListener("webglcontextlost", contextLost);
    canvas.removeEventListener("webglcontextrestored", contextRestored);
    releaseGpu?.();
    releaseGpu = null;
    source.width = source.height = 0;
  };
}
