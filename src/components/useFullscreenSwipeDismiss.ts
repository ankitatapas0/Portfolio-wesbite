import { useEffect, useRef, type HTMLAttributes, type RefObject } from "react";

// Use non-passive touch movement only for a downward dismissal gesture.
// Pinch zoom, horizontal gestures, and gestures starting on controls stay native.
export function useFullscreenSwipeDismiss(
  frameRef: RefObject<HTMLDivElement | null>,
  active: boolean,
  dismiss: () => void,
): Pick<HTMLAttributes<HTMLDivElement>, "onClickCapture"> {
  const dismissRef = useRef(dismiss);
  dismissRef.current = dismiss;
  const suppressClickUntil = useRef(0);

  useEffect(() => {
    const frame = frameRef.current;
    if (!active || !frame) return;
    let start: { id: number; x: number; y: number; time: number } | undefined;
    const reset = () => { start = undefined; };
    const begin = (event: TouchEvent) => {
      reset();
      if (event.touches.length !== 1 || (window.visualViewport?.scale ?? 1) > 1.05) return;
      if (event.target instanceof Element &&
        event.target.closest(".cvc, button, input, a, [role='slider']")) return;
      const touch = event.touches[0];
      start = { id: touch.identifier, x: touch.clientX, y: touch.clientY, time: performance.now() };
    };
    const move = (event: TouchEvent) => {
      if (event.touches.length !== 1) { reset(); return; }
      const touch = event.touches[0];
      if (!start || touch.identifier !== start.id) return;
      const dx = touch.clientX - start.x, dy = touch.clientY - start.y;
      if (dy > 3 && dy > Math.abs(dx) * 1.3 && event.cancelable) event.preventDefault();
    };
    const finish = (event: TouchEvent) => {
      const origin = start;
      reset();
      if (!origin || event.touches.length !== 0) return;
      const touch = Array.from(event.changedTouches).find(item => item.identifier === origin.id);
      if (!touch) return;
      const dx = touch.clientX - origin.x, dy = touch.clientY - origin.y;
      if (dy < 80 || dy < Math.abs(dx) * 1.3 || performance.now() - origin.time > 1200) return;
      if (event.cancelable) event.preventDefault();
      event.stopPropagation();
      // A compatibility click must not reopen the image or activate content
      // beneath the fullscreen viewer after it disappears.
      suppressClickUntil.current = performance.now() + 600;
      dismissRef.current();
    };
    frame.addEventListener("touchstart", begin, { passive: true });
    frame.addEventListener("touchmove", move, { passive: false });
    frame.addEventListener("touchend", finish);
    frame.addEventListener("touchcancel", reset);
    return () => {
      frame.removeEventListener("touchstart", begin);
      frame.removeEventListener("touchmove", move);
      frame.removeEventListener("touchend", finish);
      frame.removeEventListener("touchcancel", reset);
    };
  }, [active, frameRef]);

  return {
    onClickCapture: event => {
      if (performance.now() >= suppressClickUntil.current) return;
      event.preventDefault();
      event.stopPropagation();
    },
  };
}
