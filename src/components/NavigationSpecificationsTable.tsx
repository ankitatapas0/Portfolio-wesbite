import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

export type NavigationSpecification = {
  label: string;
  value: string;
};

export function NavigationSpecificationsTable({
  columns,
  label,
}: {
  columns: NavigationSpecification[];
  label: string;
}) {
  const viewportId = useId();
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ x: number; left: number } | null>(null);
  const [scroll, setScroll] = useState({
    overflow: false, before: false, after: false,
    left: 0, max: 0, thumbWidth: 0, thumbOffset: 0,
  });

  const updateScroll = () => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const max = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
    const left = Math.max(0, Math.min(viewport.scrollLeft, max));
    const trackWidth = trackRef.current?.clientWidth ?? Math.max(1, viewport.clientWidth - 16);
    const thumbWidth = Math.min(trackWidth, Math.max(32,
      trackWidth * viewport.clientWidth / Math.max(viewport.scrollWidth, 1)));
    const next = {
      overflow: max > 1, before: left > 1, after: left < max - 1,
      left, max, thumbWidth,
      thumbOffset: max > 0 ? left / max * (trackWidth - thumbWidth) : 0,
    };
    setScroll((previous) => Object.keys(next).every(
      (key) => previous[key as keyof typeof next] === next[key as keyof typeof next],
    ) ? previous : next);
  };

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const observer = new ResizeObserver(updateScroll);
    observer.observe(viewport);
    if (viewport.firstElementChild) observer.observe(viewport.firstElementChild);
    if (trackRef.current) observer.observe(trackRef.current);
    updateScroll();
    return () => observer.disconnect();
  }, [scroll.overflow, columns]);

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const viewport = viewportRef.current;
    const track = trackRef.current;
    if (!viewport || !track || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    track.setPointerCapture(event.pointerId);
    const travel = track.clientWidth - scroll.thumbWidth;
    if (!(event.target instanceof HTMLElement)
      || !event.target.classList.contains("navigation-specifications-scrollbar-thumb")) {
      const offset = event.clientX - track.getBoundingClientRect().left - scroll.thumbWidth / 2;
      viewport.scrollLeft = travel > 0 ? Math.max(0, Math.min(offset / travel, 1)) * scroll.max : 0;
    }
    dragRef.current = { x: event.clientX, left: viewport.scrollLeft };
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const viewport = viewportRef.current;
    const travel = (trackRef.current?.clientWidth ?? 0) - scroll.thumbWidth;
    if (!drag || !viewport || travel <= 0) return;
    viewport.scrollLeft = drag.left + (event.clientX - drag.x) / travel * scroll.max;
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const positions: Record<string, number> = {
      ArrowLeft: viewport.scrollLeft - 40,
      ArrowRight: viewport.scrollLeft + 40,
      PageUp: viewport.scrollLeft - viewport.clientWidth,
      PageDown: viewport.scrollLeft + viewport.clientWidth,
      Home: 0,
      End: scroll.max,
    };
    if (!(event.key in positions)) return;
    event.preventDefault();
    viewport.scrollLeft = positions[event.key];
  };

  return (
    <div className="navigation-specifications" data-detail-page-table data-detail-page-content>
      <div
        id={viewportId}
        ref={viewportRef}
        className={`navigation-specifications-scroll${scroll.overflow ? " has-horizontal-overflow" : ""}${scroll.before ? " has-more-left" : ""}${scroll.after ? " has-more-right" : ""}`}
        role="region"
        aria-label={`${label} specifications`}
        tabIndex={0}
        onScroll={updateScroll}
      >
        <table className="navigation-specifications-table" aria-label={`${label} specifications`}>
          <thead>
            <tr>
              {columns.map(({ label: heading }) => (
                <th scope="col" key={heading}>{heading}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              {columns.map(({ label: heading, value }) => (
                <td key={heading}>{value}</td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      {scroll.overflow && (
        <div
          ref={trackRef}
          className="navigation-specifications-scrollbar"
          role="scrollbar"
          aria-label={`Scroll ${label} table horizontally`}
          aria-orientation="horizontal"
          aria-controls={viewportId}
          aria-valuemin={0}
          aria-valuemax={Math.round(scroll.max)}
          aria-valuenow={Math.round(scroll.left)}
          tabIndex={0}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={(event) => {
            dragRef.current = null;
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              event.currentTarget.releasePointerCapture(event.pointerId);
            }
          }}
          onPointerCancel={() => { dragRef.current = null; }}
          onLostPointerCapture={() => { dragRef.current = null; }}
          onKeyDown={handleKeyDown}
        >
          <div
            className="navigation-specifications-scrollbar-thumb"
            style={{ width: scroll.thumbWidth, transform: `translateX(${scroll.thumbOffset}px)` }}
          />
        </div>
      )}
    </div>
  );
}
