import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { useVideoRangeWarmup } from "./useVideoRangeWarmup";

type Phase = "idle" | "loading" | "ready" | "waiting" | "slow" | "blocked" | "error";

/** Warm nearby headers, but reserve full buffering for the requested player. */
export function useDetailVideoLoading(
  videoRef: RefObject<HTMLVideoElement | null>,
  autoPlay: boolean,
  warmupSource?: string,
) {
  useVideoRangeWarmup(videoRef, warmupSource);
  const [sourceReady, setSourceReady] = useState(autoPlay);
  const [nearViewport, setNearViewport] = useState(autoPlay);
  const [playbackRequested, setPlaybackRequested] = useState(autoPlay);
  const playbackIntent = useRef(autoPlay);
  const [phase, setPhase] = useState<Phase>(autoPlay ? "loading" : "idle");

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const observer = new IntersectionObserver(([entry]) => {
      setNearViewport(entry.isIntersecting);
      if (entry.isIntersecting) setSourceReady(true);
    }, {
      root: video.closest<HTMLElement>(".detail-page-transition-backdrop"),
      rootMargin: "600px 0px",
    });
    observer.observe(video);
    return () => observer.disconnect();
  }, [videoRef]);

  useEffect(() => {
    if (!playbackRequested || (phase !== "loading" && phase !== "waiting")) return;
    const timer = window.setTimeout(() => setPhase("slow"), 15_000);
    return () => window.clearTimeout(timer);
  }, [phase, playbackRequested]);

  const reportPlayError = useCallback((error: unknown) => {
    // Closing a detail page or handing playback to another video cancels play().
    if (error instanceof DOMException && error.name === "AbortError") return;
    setPlaybackRequested(false);
    if (error instanceof DOMException && error.name === "NotAllowedError") {
      playbackIntent.current = false;
    }
    setPhase(error instanceof DOMException && error.name === "NotAllowedError"
      ? "blocked"
      : "error");
  }, []);

  const markPlay = useCallback(() => {
    playbackIntent.current = true;
    setPlaybackRequested(true);
    setPhase(videoRef.current && videoRef.current.readyState >= 3 ? "ready" : "waiting");
  }, [videoRef]);

  const markPause = useCallback(() => {
    if (!videoRef.current?.error) playbackIntent.current = false;
    setPlaybackRequested(false);
    setPhase(previous => previous === "error" || previous === "blocked" ? previous : "ready");
  }, [videoRef]);

  const markMetadata = useCallback(() => {
    if (!playbackIntent.current) setPhase("ready");
  }, []);

  const markReady = useCallback(() => {
    setPhase(previous => previous === "blocked" || previous === "error" ? previous : "ready");
  }, []);
  const markWaiting = useCallback(() => {
    if (playbackIntent.current && (videoRef.current?.readyState ?? 0) < 3) {
      setPhase(previous => ["slow", "blocked", "error"].includes(previous) ? previous : "waiting");
    }
  }, [videoRef]);
  const markError = useCallback(() => {
    setPlaybackRequested(false);
    setPhase("error");
  }, []);

  const retry = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const resume = playbackIntent.current;
    setPhase("loading");
    setSourceReady(true);
    // Reload the same full-quality URL; no cache-busting URLs or alternate files.
    video.load();
    if (resume) {
      setPlaybackRequested(true);
      void video.play().catch(reportPlayError);
    }
  }, [reportPlayError, videoRef]);

  const feedback = phase === "error" ? "Video couldn’t load."
    : phase === "slow" ? "Video is taking longer to load."
    : phase === "blocked" ? "Use the video’s Play control to start."
    : phase === "waiting" ? "Buffering video…"
    : phase === "loading" && playbackRequested ? "Loading video…"
    : "";

  return {
    sourceReady,
    feedback,
    canRetry: phase === "error" || phase === "slow",
    // A fullscreen player can leave the scroll root without losing its buffer.
    preload: sourceReady && (nearViewport || playbackRequested)
      ? playbackRequested ? "auto" as const : "metadata" as const
      : "none" as const,
    reportPlayError,
    markPlay,
    markPause,
    markMetadata,
    markReady,
    markWaiting,
    markError,
    retry,
  };
}
