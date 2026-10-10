import { useCallback, useEffect, useRef, useState, type RefObject, type HTMLAttributes } from "react";
import { observeVideoFullscreen } from "./videoFullscreen";

// Preserve hover/touch/keyboard reveal rules for the shared custom player.
export function useVideoControlsVisibility(
  videoRef: RefObject<HTMLVideoElement | null>,
): HTMLAttributes<HTMLElement> & {
  controls: boolean;
  showToolbarWhilePaused: boolean;
  onPlaybackStarted: () => void;
  onPlaybackPaused: () => void;
} {
  const [controls, setControls] = useState(false);
  const [showToolbarWhilePaused, setShowToolbarWhilePaused] = useState(false);
  const hovering = useRef(false);
  const touching = useRef(false);
  const keyboardFocused = useRef(false);
  const revealOnlyClick = useRef(false);
  const fullscreenRef = useRef(false);
  const lastPointerType = useRef<string | undefined>(undefined);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const clearTimer = useCallback(() => {
    if (hideTimer.current !== undefined) {
      clearTimeout(hideTimer.current);
      hideTimer.current = undefined;
    }
  }, []);
  const setPausedToolbar = useCallback((value: boolean) => {
    setShowToolbarWhilePaused(value);
  }, []);
  const scheduleHide = useCallback((delay = 1500) => {
    clearTimer();
    hideTimer.current = setTimeout(() => {
      hideTimer.current = undefined;
      setPausedToolbar(keyboardFocused.current);
      setControls(keyboardFocused.current);
    }, delay);
  }, [clearTimer, setPausedToolbar]);

  useEffect(() => {
    const video = videoRef.current;
    const stopObservingFullscreen = video
      ? observeVideoFullscreen(video, (active) => {
          fullscreenRef.current = active;
          clearTimer();
          if (active) {
            setControls(true);
            setPausedToolbar(true);
            if (!keyboardFocused.current) scheduleHide();
          } else {
            setPausedToolbar(false);
            setControls(hovering.current || touching.current || keyboardFocused.current);
          }
        })
      : undefined;
    const hoverQuery = window.matchMedia("(hover: hover) and (pointer: fine)");
    const reset = () => {
      clearTimer();
      hovering.current = false;
      touching.current = false;
      keyboardFocused.current = false;
      setPausedToolbar(false);
      setControls(false);
    };
    const outside = (event: PointerEvent) => {
      const video = videoRef.current;
      if (event.target instanceof Node && video?.closest(".expanded-media-video-frame")?.contains(event.target)) return;
      reset();
    };
    const finishTouch = () => {
      if (!touching.current) return;
      touching.current = false;
      if (!keyboardFocused.current) scheduleHide();
    };
    hoverQuery.addEventListener("change", reset);
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("pointerup", finishTouch, true);
    document.addEventListener("pointercancel", finishTouch, true);
    return () => {
      stopObservingFullscreen?.();
      clearTimer();
      hoverQuery.removeEventListener("change", reset);
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("pointerup", finishTouch, true);
      document.removeEventListener("pointercancel", finishTouch, true);
    };
  }, [clearTimer, scheduleHide, setPausedToolbar, videoRef]);

  const onPlaybackStarted = useCallback(() => {
    clearTimer();
    setPausedToolbar(false);
    if (lastPointerType.current === "mouse" && !hovering.current && !keyboardFocused.current) {
      setControls(false);
      return;
    }
    setControls(true);
    if (!keyboardFocused.current && !touching.current) scheduleHide();
  }, [clearTimer, scheduleHide, setPausedToolbar]);

  const onPlaybackPaused = useCallback(() => {
    clearTimer();
    setPausedToolbar(false);
    setControls(false);
  }, [clearTimer, setPausedToolbar]);

  return {
    controls,
    showToolbarWhilePaused,
    onPlaybackStarted,
    onPlaybackPaused,
    onPointerEnter: (event) => {
      if (event.pointerType !== "mouse") return;
      lastPointerType.current = event.pointerType;
      hovering.current = true;
      if (fullscreenRef.current) setPausedToolbar(true);
      setControls(true);
      if (!keyboardFocused.current) scheduleHide();
    },
    onPointerLeave: (event) => {
      if (event.pointerType !== "mouse") return;
      hovering.current = false;
      if (videoRef.current && !videoRef.current.paused) {
        clearTimer();
        setPausedToolbar(false);
        setControls(false);
        return;
      }
      if (!keyboardFocused.current && hideTimer.current === undefined) {
        setPausedToolbar(false);
        setControls(false);
      }
    },
    onPointerMove: (event) => {
      if (event.pointerType !== "mouse") return;
      hovering.current = true;
      clearTimer();
      if (fullscreenRef.current) setPausedToolbar(true);
      setControls(true);
      if (!keyboardFocused.current) scheduleHide();
    },
    onPointerDown: (event) => {
      lastPointerType.current = event.pointerType;
      if (event.pointerType === "mouse") hovering.current = true;
      const targetIsControl = event.target instanceof Element &&
        Boolean(event.target.closest(".cvc button, .cvc input"));
      // A touch can reveal a button under the same finger before click fires.
      // The first touch only reveals controls; it must not pause/play by accident.
      revealOnlyClick.current = !targetIsControl && event.pointerType !== "mouse" && !controls;
      keyboardFocused.current = false;
      clearTimer();
      if (event.pointerType !== "mouse") touching.current = true;
      setControls(true);
      if (!(event.target instanceof Element && event.target.closest(".cvc-center"))) setPausedToolbar(true);
      if (event.pointerType === "mouse") scheduleHide();
    },
    onClickCapture: (event) => {
      if (!revealOnlyClick.current) return;
      revealOnlyClick.current = false;
      event.preventDefault();
      event.stopPropagation();
    },
    onFocus: (event) => {
      if (touching.current) return;
      if ((event.target as Element).matches(":focus-visible")) {
        keyboardFocused.current = true;
        clearTimer();
      }
      // Screen readers can move focus without triggering :focus-visible.
      // Reveal the whole toolbar whenever an interactive control receives focus.
      setPausedToolbar(true);
      setControls(true);
    },
    onBlur: (event) => {
      if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
      keyboardFocused.current = false;
      setPausedToolbar(false);
      if (!touching.current) {
        clearTimer();
        if (hovering.current) scheduleHide();
        else setControls(false);
      }
    },
    onKeyDown: (event) => {
      if (event.defaultPrevented) return;
      revealOnlyClick.current = false;
      keyboardFocused.current = true;
      clearTimer();
      setPausedToolbar(true);
      setControls(true);
    },
  };
}
