import { useEffect, type RefObject } from "react";

const warmupBytes = 2 * 1024 * 1024;

/** Seed the private HTTP cache without asking the decoder to preload a whole film. */
export function useVideoRangeWarmup(
  videoRef: RefObject<HTMLVideoElement | null>,
  source?: string,
) {
  useEffect(() => {
    const video = videoRef.current;
    const connection = (navigator as Navigator & {
      connection?: { saveData?: boolean };
    }).connection;
    if (!video || !source || connection?.saveData) return;
    if (new URL(source, location.href).origin !== location.origin) return;

    let nearby = false;
    let done = false;
    let disposed = false;
    let controller: AbortController | undefined;
    const cancel = () => controller?.abort();
    const warm = async () => {
      if (disposed || done || controller || !nearby || document.hidden || !video.paused) return;
      const request = new AbortController();
      controller = request;
      try {
        const response = await fetch(source, {
          headers: { Range: `bytes=0-${warmupBytes - 1}` },
          cache: "force-cache",
          credentials: "same-origin",
          signal: request.signal,
        });
        const range = response.headers.get("Content-Range")?.match(/^bytes 0-(\d+)\/(\d+)$/);
        // Some static hosts ignore Range. Never consume their full-film response.
        if (response.status !== 206 || !range || Number(range[1]) >= warmupBytes) {
          await response.body?.cancel();
        } else {
          // Fully consuming this bounded response lets the native player reuse
          // the original URL's cached bytes; no Blob URL or alternate encoding.
          await response.arrayBuffer();
        }
        done = true;
      } catch {
        // A speculative warmup failure must not put the actual player in error.
        if (!request.signal.aborted) done = true;
      } finally {
        if (controller === request) controller = undefined;
        if (request.signal.aborted) void warm();
      }
    };
    const onPlay = () => {
      done = true;
      cancel(); // Playback takes priority over an unfinished speculative request.
    };
    const onVisibilityChange = () => {
      if (document.hidden) cancel();
      else void warm();
    };
    const observer = new IntersectionObserver(([entry]) => {
      nearby = entry.isIntersecting;
      if (nearby) void warm();
      else cancel();
    }, {
      root: video.closest<HTMLElement>(".detail-page-transition-backdrop"),
      rootMargin: "1200px 0px",
    });
    observer.observe(video);
    video.addEventListener("play", onPlay);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      disposed = true;
      cancel();
      observer.disconnect();
      video.removeEventListener("play", onPlay);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [source, videoRef]);
}
