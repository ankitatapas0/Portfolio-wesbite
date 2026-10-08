import { useCallback, useEffect, useRef, useState, type RefObject, type VideoHTMLAttributes } from "react";

// Preserve the browser's existing player design; only manage when it is revealed.
export function useVideoControlsVisibility(
  videoRef: RefObject<HTMLVideoElement | null>,
): VideoHTMLAttributes<HTMLVideoElement> {
  const [controls, setControls] = useState(false);
  const hovering = useRef(false);
  const touching = useRef(false);
  const keyboardFocused = useRef(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const clearTimer = useCallback(() => {
    if (hideTimer.current !== undefined) {
      clearTimeout(hideTimer.current);
      hideTimer.current = undefined;
    }
  }, []);

  useEffect(() => {
    const hoverQuery = window.matchMedia("(hover: hover) and (pointer: fine)");
    const reset = () => {
      clearTimer();
      hovering.current = false;
      touching.current = false;
      keyboardFocused.current = false;
      setControls(false);
    };
    const outside = (event: PointerEvent) => {
      const video = videoRef.current;
      if (event.target instanceof Node && video?.contains(event.target)) return;
      reset();
    };
    const finishTouch = () => {
      if (!touching.current) return;
      touching.current = false;
      clearTimer();
      if (!keyboardFocused.current) {
        hideTimer.current = setTimeout(() => {
          hideTimer.current = undefined;
          setControls(false);
        }, 3000);
      }
    };
    hoverQuery.addEventListener("change", reset);
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("pointerup", finishTouch, true);
    document.addEventListener("pointercancel", finishTouch, true);
    return () => {
      clearTimer();
      hoverQuery.removeEventListener("change", reset);
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("pointerup", finishTouch, true);
      document.removeEventListener("pointercancel", finishTouch, true);
    };
  }, [clearTimer, videoRef]);

  return {
    controls,
    onPointerEnter: (event) => {
      if (event.pointerType !== "mouse") return;
      hovering.current = true;
      clearTimer();
      setControls(true);
    },
    onPointerLeave: (event) => {
      if (event.pointerType !== "mouse") return;
      hovering.current = false;
      if (!keyboardFocused.current) setControls(false);
    },
    onPointerDown: (event) => {
      keyboardFocused.current = false;
      clearTimer();
      if (event.pointerType !== "mouse") touching.current = true;
      setControls(true);
    },
    onFocus: (event) => {
      if (touching.current || !event.currentTarget.matches(":focus-visible")) return;
      keyboardFocused.current = true;
      clearTimer();
      setControls(true);
    },
    onBlur: () => {
      keyboardFocused.current = false;
      if (!hovering.current && !touching.current) {
        clearTimer();
        setControls(false);
      }
    },
    onKeyDown: () => {
      keyboardFocused.current = true;
      clearTimer();
      setControls(true);
    },
  };
}
