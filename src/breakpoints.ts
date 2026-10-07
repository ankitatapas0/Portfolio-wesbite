export const viewportBreakpoints = {
  xs: { min: 320, max: 719.98 },
  s: { min: 720, max: 959.98 },
  m: { min: 960 },
  l: { min: 1440 },
} as const;

export const extraSmallViewportQuery = `(max-width: ${viewportBreakpoints.xs.max}px)`;
export const smallViewportQuery = `(min-width: ${viewportBreakpoints.s.min}px) and (max-width: ${viewportBreakpoints.s.max}px)`;
export const smallAndBelowViewportQuery = `(max-width: ${viewportBreakpoints.s.max}px)`;
