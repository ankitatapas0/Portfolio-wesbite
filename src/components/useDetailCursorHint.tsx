import { useEffect, useLayoutEffect, useState, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useIsPresent, useMotionValue, useReducedMotion, useSpring, useTransform, type MotionValue } from "framer-motion";

// Allow a typical 24px native cursor plus at least 8px of clear space.
const cursorOffset = 32;
// Hidden by request. Keep all hint styling and motion available for restoration.
const detailCursorHintsEnabled = false;

type WordProps = {
  word: string;
  slower: boolean;
  x: MotionValue<number>;
  y: MotionValue<number>;
  reducedMotion: boolean | null;
};

function CursorLetter({ letter, progress, x, y, reducedMotion }: Omit<WordProps, "word" | "slower"> & {
  letter: string;
  progress: number;
}) {
  const spring = {
    stiffness: 900 - progress * 200,
    damping: 40 + progress * 2,
    mass: 0.35 + progress * 0.1,
  };
  const springX = useSpring(x, spring);
  const springY = useSpring(y, spring);
  const lagX = useTransform([springX, x], ([current, target]: number[]) => current - target);
  const lagY = useTransform([springY, y], ([current, target]: number[]) => Math.max(0, current - target));
  useLayoutEffect(() => {
    springX.jump(x.get());
    springY.jump(y.get());
  }, [x, y, springX, springY, reducedMotion]);
  return <motion.span className="detail-cursor-letter"
    style={{ x: reducedMotion ? 0 : lagX, y: reducedMotion ? 0 : lagY }}
  >{letter}</motion.span>;
}

function CursorWord({ word, slower, x, y, reducedMotion }: WordProps) {
  const spring = slower
    ? { stiffness: 350, damping: 34, mass: 0.8 }
    : { stiffness: 400, damping: 34, mass: 0.75 };
  const springX = useSpring(x, spring);
  const springY = useSpring(y, spring);
  const lagX = useTransform([springX, x], ([current, target]: number[]) => current - target);
  // Downward movement must never drag the words up into the cursor.
  const lagY = useTransform([springY, y], ([current, target]: number[]) => Math.max(0, current - target));

  useLayoutEffect(() => {
    springX.jump(x.get());
    springY.jump(y.get());
  }, [x, y, springX, springY, reducedMotion]);

  return <motion.span className="detail-cursor-word"
    style={{ x: reducedMotion ? 0 : lagX, y: reducedMotion ? 0 : lagY }}
  >{Array.from(word, (letter, index) => (
    <CursorLetter key={index} letter={letter} progress={index / Math.max(1, word.length - 1)}
      x={springX} y={springY} reducedMotion={reducedMotion} />
  ))}</motion.span>;
}

function CursorHint({ text, x, y, reducedMotion }: Omit<WordProps, "word" | "slower"> & { text: string }) {
  const present = useIsPresent();
  return <motion.div
    className="image-fullscreen-cursor"
    aria-hidden="true"
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0, transition: { duration: reducedMotion ? 0 : 0.12 } }}
    transition={{ duration: reducedMotion ? 0 : 0.2, ease: "easeOut" }}
    style={{ x, y }}
    data-visible={present}
    data-cursor-hint={text === "BACK" ? "back" : "image"}
  >
    <span className="image-fullscreen-cursor-label">
      {text.split(" ").map((word, index) =>
        <CursorWord key={word} word={index ? ` ${word}` : word} slower={index > 0}
          x={x} y={y} reducedMotion={reducedMotion} />)}
    </span>
  </motion.div>;
}

/** Mouse-only shared image/backdrop hints, with no per-frame React renders. */
export function useDetailCursorHint(
  requestedEnabled: boolean,
  text: "VIEW FULLSCREEN" | "BACK",
  acceptsTarget?: (target: EventTarget | null) => boolean,
) {
  const enabled = requestedEnabled && detailCursorHintsEnabled;
  const [visible, setVisible] = useState(false);
  const reducedMotion = useReducedMotion();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const hide = () => setVisible(false);

  useEffect(() => {
    if (!enabled) setVisible(false);
  }, [enabled]);

  useEffect(() => {
    if (!visible) return;
    const dismiss = () => setVisible(false);
    window.addEventListener("blur", dismiss);
    window.addEventListener("scroll", dismiss, true);
    window.addEventListener("keydown", dismiss);
    document.addEventListener("fullscreenchange", dismiss);
    document.addEventListener("webkitfullscreenchange", dismiss);
    return () => {
      window.removeEventListener("blur", dismiss);
      window.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("keydown", dismiss);
      document.removeEventListener("fullscreenchange", dismiss);
      document.removeEventListener("webkitfullscreenchange", dismiss);
    };
  }, [visible]);

  const follow = (event: PointerEvent<HTMLElement>) => {
    if (!enabled || event.pointerType !== "mouse"
      || !window.matchMedia("(any-hover: hover)").matches
      || (acceptsTarget && !acceptsTarget(event.target))) {
      hide();
      return;
    }
    x.set(event.clientX);
    y.set(event.clientY + cursorOffset);
    setVisible(true);
  };

  return {
    pointerEvents: {
      onPointerEnter: follow,
      onPointerMove: follow,
      onPointerLeave: hide,
      onPointerCancel: hide,
      onPointerDown: hide,
    },
    cursor: enabled ? createPortal(
      <AnimatePresence>
        {visible && <CursorHint text={text} x={x} y={y} reducedMotion={reducedMotion} />}
      </AnimatePresence>,
      document.body,
    ) : null,
  };
}
