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
import { useDetailCursorHint } from "./useDetailCursorHint";

// Keep the BACK hint and background activation on exactly the same surface.
function isBackSurface(target: EventTarget | null) {
  return target instanceof Element && !target.closest(
    "[data-detail-page-content], button, a, input, select, textarea, [role='button'], [role='slider']",
  );
}

type DetailPageTransitionProps = {
  children: ReactNode;
  disableExitMotion?: boolean;
  isOpen: boolean;
  label: string;
  labelledBy?: string;
  onClose: () => void;
  restoreFocus: () => void;
  className?: string;
  style?: CSSProperties;
};

export function DetailPageTransition({
  children,
  disableExitMotion = false,
  isOpen,
  label,
  labelledBy,
  onClose,
  restoreFocus,
  className = "",
  style,
}: DetailPageTransitionProps) {
  const backdropRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const scrollbarTrackRef = useRef<HTMLDivElement>(null);
  const scrollbarThumbRef = useRef<HTMLDivElement>(null);
  const scrollbarDragRef = useRef<{ pointerY: number; scrollTop: number } | null>(null);
  const restoreFocusRef = useRef(restoreFocus);
  restoreFocusRef.current = restoreFocus;
  const [shouldRender, setShouldRender] = useState(isOpen);
  const [isClosing, setIsClosing] = useState(false);
  const backCursor = useDetailCursorHint(isOpen && shouldRender && !isClosing, "BACK", isBackSurface);

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

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.body.classList.add("has-detail-page-open");

    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.classList.remove("has-detail-page-open");
    };
  }, [shouldRender]);

  useEffect(() => {
    // The exiting dialog can remain mounted beside the next project. It must
    // release focus containment immediately, not when its exit animation ends.
    if (!shouldRender || !isOpen) return;
    const dialog = dialogRef.current;
    if (!dialog) return;

    const focusScope = () => {
      const fullscreenDocument = document as Document & { webkitFullscreenElement?: Element | null };
      const nativeFullscreen = fullscreenDocument.fullscreenElement ?? fullscreenDocument.webkitFullscreenElement;
      if (nativeFullscreen instanceof HTMLElement && dialog.contains(nativeFullscreen)) return nativeFullscreen;
      return document.querySelector<HTMLElement>(
        ".expanded-media-image-frame.is-css-fullscreen, .expanded-media-video-frame.is-css-fullscreen",
      ) ?? dialog;
    };
    const getFocusableElements = () => Array.from(
      focusScope().querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), video[controls], [contenteditable="true"], [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((element) => (
      !element.hidden
      && element.getAttribute("aria-hidden") !== "true"
      && !element.closest("[inert]")
      && element.getClientRects().length > 0
    ));

    dialog.focus({ preventScroll: true });

    const keepFocusInsideDialog = (event: FocusEvent) => {
      const scope = focusScope();
      if (event.target instanceof Node && !scope.contains(event.target)) {
        (getFocusableElements()[0] ?? dialog).focus({ preventScroll: true });
      }
    };

    const containTabNavigation = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || event.defaultPrevented) return;

      const focusableElements = getFocusableElements();
      const first = focusableElements[0];
      const last = focusableElements[focusableElements.length - 1];
      const activeElement = document.activeElement;
      const scope = focusScope();

      if (!first || !last) {
        event.preventDefault();
        dialog.focus({ preventScroll: true });
      } else if (
        event.shiftKey
        && (activeElement === first || activeElement === scope || !scope.contains(activeElement))
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey
        && (activeElement === last || !scope.contains(activeElement))
      ) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("focusin", keepFocusInsideDialog);
    document.addEventListener("keydown", containTabNavigation);

    return () => {
      document.removeEventListener("focusin", keepFocusInsideDialog);
      document.removeEventListener("keydown", containTabNavigation);

      restoreFocusRef.current();
    };
  }, [isOpen, shouldRender]);

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
    <div
      ref={dialogRef}
      className="detail-page-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
      aria-label={labelledBy ? undefined : label}
      tabIndex={-1}
    >
      <div
        ref={backdropRef}
        className={`detail-page-transition-backdrop${isClosing ? " is-closing" : ""}`}
        role="presentation"
        {...backCursor.pointerEvents}
        onMouseDown={(event) => {
          if (!isOpen || event.button !== 0 || !isBackSurface(event.target)) return;

          onClose();
        }}
      >
        <section
          className={`detail-page-transition-content${className ? ` ${className}` : ""}`}
          style={style}
        >
          {children}
        </section>
      </div>
      {backCursor.cursor}
      <DetailGlassBand isClosing={isClosing} backdropRef={backdropRef} />
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
    </div>,
    document.body,
  );
}
