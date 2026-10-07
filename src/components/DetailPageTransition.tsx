import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { DetailGlassBand } from "./DetailGlassBand";

type DetailPageTransitionProps = {
  children: ReactNode;
  disableExitMotion?: boolean;
  isOpen: boolean;
  label: string;
  onClose: () => void;
  className?: string;
  style?: CSSProperties;
};

export function DetailPageTransition({
  children,
  disableExitMotion = false,
  isOpen,
  label,
  onClose,
  className = "",
  style,
}: DetailPageTransitionProps) {
  const backdropRef = useRef<HTMLDivElement>(null);
  const scrollbarTrackRef = useRef<HTMLDivElement>(null);
  const scrollbarThumbRef = useRef<HTMLDivElement>(null);
  const scrollbarDragRef = useRef<{ pointerY: number; scrollTop: number } | null>(null);
  const [shouldRender, setShouldRender] = useState(isOpen);
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      setIsClosing(false);
      return;
    }
    if (!shouldRender) return;

    if (
      disableExitMotion
      || window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setShouldRender(false);
      return;
    }

    setIsClosing(true);
    const exitTimer = window.setTimeout(() => {
      setShouldRender(false);
      setIsClosing(false);
    }, 300);
    return () => window.clearTimeout(exitTimer);
  }, [disableExitMotion, isOpen, shouldRender]);

  useEffect(() => {
    if (!shouldRender) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isOpen) onClose();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.body.classList.add("has-detail-page-open");
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.classList.remove("has-detail-page-open");
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose, shouldRender]);

  useEffect(() => {
    if (!shouldRender) return;

    const backdrop = backdropRef.current;
    const track = scrollbarTrackRef.current;
    const thumb = scrollbarThumbRef.current;
    if (!backdrop || !track || !thumb) return;

    const updateScrollbar = () => {
      const scrollRange = backdrop.scrollHeight - backdrop.clientHeight;
      if (scrollRange <= 0) {
        track.hidden = true;
        return;
      }

      track.hidden = false;
      const trackHeight = track.clientHeight;
      const thumbHeight = Math.max(
        36,
        trackHeight * (backdrop.clientHeight / backdrop.scrollHeight),
      );
      const thumbTravel = trackHeight - thumbHeight;
      const thumbTop = thumbTravel * (backdrop.scrollTop / scrollRange);
      thumb.style.height = `${thumbHeight}px`;
      thumb.style.transform = `translateY(${thumbTop}px)`;
    };

    const resizeObserver = new ResizeObserver(updateScrollbar);
    resizeObserver.observe(backdrop);
    const content = backdrop.firstElementChild;
    if (content) resizeObserver.observe(content);

    backdrop.addEventListener("scroll", updateScrollbar, { passive: true });
    window.addEventListener("resize", updateScrollbar);
    window.visualViewport?.addEventListener("resize", updateScrollbar);
    updateScrollbar();

    return () => {
      backdrop.removeEventListener("scroll", updateScrollbar);
      window.removeEventListener("resize", updateScrollbar);
      window.visualViewport?.removeEventListener("resize", updateScrollbar);
      resizeObserver.disconnect();
    };
  }, [shouldRender]);

  const handleScrollbarPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const backdrop = backdropRef.current;
    const track = scrollbarTrackRef.current;
    const thumb = scrollbarThumbRef.current;
    if (!backdrop || !track || !thumb) return;

    if (event.target === thumb) {
      scrollbarDragRef.current = {
        pointerY: event.clientY,
        scrollTop: backdrop.scrollTop,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }

    const trackBounds = track.getBoundingClientRect();
    const thumbHeight = thumb.getBoundingClientRect().height;
    const scrollRange = backdrop.scrollHeight - backdrop.clientHeight;
    const thumbTravel = trackBounds.height - thumbHeight;
    const targetTop = Math.min(
      Math.max(event.clientY - trackBounds.top - thumbHeight / 2, 0),
      thumbTravel,
    );
    backdrop.scrollTop = thumbTravel > 0
      ? (targetTop / thumbTravel) * scrollRange
      : 0;
  };

  const handleScrollbarPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = scrollbarDragRef.current;
    const backdrop = backdropRef.current;
    const track = scrollbarTrackRef.current;
    const thumb = scrollbarThumbRef.current;
    if (!drag || !backdrop || !track || !thumb) return;

    const thumbTravel = track.clientHeight - thumb.getBoundingClientRect().height;
    const scrollRange = backdrop.scrollHeight - backdrop.clientHeight;
    backdrop.scrollTop = drag.scrollTop
      + ((event.clientY - drag.pointerY) / thumbTravel) * scrollRange;
  };

  if (!shouldRender) return null;

  return createPortal(
    <>
      <div
        ref={backdropRef}
        className={`detail-page-transition-backdrop${isClosing ? " is-closing" : ""}`}
        role="presentation"
        onMouseDown={(event) => {
          if (!isOpen) return;

          const target = event.target;
          if (target instanceof Element && target.closest("[data-detail-page-content]")) return;

          onClose();
        }}
      >
        <section
          className={`detail-page-transition-content${className ? ` ${className}` : ""}`}
          style={style}
          role="dialog"
          aria-modal="true"
          aria-label={label}
        >
          {children}
        </section>
      </div>
      <DetailGlassBand isClosing={isClosing} />
      <div
        ref={scrollbarTrackRef}
        className="detail-page-scrollbar"
        aria-hidden="true"
        onPointerDown={handleScrollbarPointerDown}
        onPointerMove={handleScrollbarPointerMove}
        onPointerUp={(event) => {
          scrollbarDragRef.current = null;
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
        }}
        onPointerCancel={() => {
          scrollbarDragRef.current = null;
        }}
      >
        <div ref={scrollbarThumbRef} className="detail-page-scrollbar-thumb" />
      </div>
    </>,
    document.body,
  );
}
