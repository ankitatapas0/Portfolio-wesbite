import { useId, useLayoutEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

const emptyLines: string[] = [];

type DetailDescriptionProps = {
  lines?: string[];
  alternateLines?: string[];
};

export function DetailDescription({
  lines = emptyLines,
  alternateLines = emptyLines,
}: DetailDescriptionProps) {
  const textId = useId();
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const paragraphs = [...lines, ...alternateLines];

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const content = contentRef.current;
    if (!viewport || !content) return;
    let disposed = false;
    const measure = () => {
      if (disposed) return;
      const style = getComputedStyle(viewport);
      const limit = Number(style.getPropertyValue("--description-line-limit"));
      const lineHeight = Number.parseFloat(style.lineHeight);
      // scrollHeight is unaffected by the details page's opening transform.
      setOverflows(content.scrollHeight > lineHeight * limit + 0.5);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    observer.observe(content);
    window.addEventListener("resize", measure);
    void document.fonts.ready.then(measure);
    return () => {
      disposed = true;
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [lines, alternateLines]);

  if (paragraphs.length === 0) return null;

  return (
    <div className={`detail-description${expanded ? " is-expanded" : ""}`}>
      <div
        className="detail-description-text body"
        id={textId}
        ref={viewportRef}
        data-testid="text-detail-description"
      >
        <div ref={contentRef}>
          {paragraphs.map((line, index) => (
            <p className="body" key={index}>{line.replace(/\.\s*$/, "")}</p>
          ))}
        </div>
      </div>
      {overflows && (
        <button
          type="button"
          className="detail-description-toggle"
          aria-expanded={expanded}
          aria-controls={textId}
          aria-label={expanded ? "Collapse description" : "Read more description"}
          data-testid="button-toggle-detail-description"
          onClick={() => setExpanded((value) => !value)}
        >
          <ChevronDown size={20} strokeWidth={1.5} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
