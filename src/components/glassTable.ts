export type GlassTable = {
  element: HTMLElement;
  bounds: DOMRect;
  snapshot: HTMLCanvasElement | null;
  dirty: boolean;
};

// Rasterize only the small table viewport, not the full overflowed table or
// page. Cache it between layout, content, theme and horizontal-scroll changes.
export function captureGlassTable(element: HTMLElement, ratio: number, previous: HTMLCanvasElement | null) {
  const bounds = element.getBoundingClientRect();
  if (!bounds.width || !bounds.height) return null;
  const snapshot = previous ?? document.createElement("canvas");
  const width = Math.ceil(bounds.width * ratio);
  const height = Math.ceil(bounds.height * ratio);
  if (snapshot.width !== width || snapshot.height !== height) {
    snapshot.width = width;
    snapshot.height = height;
  }
  const context = snapshot.getContext("2d");
  if (!context) {
    console.error("Unable to capture the navigation table for the glass effect.");
    return null;
  }
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, bounds.width, bounds.height);
  const local = (node: Element) => {
    const rect = node.getBoundingClientRect();
    return { x: rect.left - bounds.left, y: rect.top - bounds.top, width: rect.width, height: rect.height };
  };
  const viewport = element.querySelector<HTMLElement>(".navigation-specifications-scroll");
  if (!viewport) return null;
  const box = local(viewport);
  const style = getComputedStyle(viewport);
  const scale = viewport.getBoundingClientRect().width / (viewport.offsetWidth || 1);
  context.save();
  context.beginPath();
  context.rect(box.x, box.y, box.width, box.height);
  context.clip();
  context.fillStyle = style.backgroundColor;
  context.fillRect(box.x, box.y, box.width, box.height);
  const border = parseFloat(style.borderTopWidth) * scale;
  if (border > 0) {
    context.strokeStyle = style.borderTopColor;
    context.lineWidth = border;
    context.strokeRect(box.x + border / 2, box.y + border / 2,
      box.width - border, box.height - border);
  }
  element.querySelectorAll("th, td").forEach((cell) => {
    const rect = local(cell);
    if (rect.x + rect.width < box.x || rect.x > box.x + box.width) return;
    const cellStyle = getComputedStyle(cell);
    const divider = parseFloat(cellStyle.borderRightWidth) * scale;
    if (divider > 0) {
      context.strokeStyle = cellStyle.borderRightColor;
      context.lineWidth = divider;
      context.beginPath();
      context.moveTo(rect.x + rect.width - divider / 2, rect.y);
      context.lineTo(rect.x + rect.width - divider / 2, rect.y + rect.height);
      context.stroke();
    }
    const fontSize = parseFloat(cellStyle.fontSize) * scale;
    context.font = `${cellStyle.fontStyle} ${cellStyle.fontWeight} ${fontSize}px ${cellStyle.fontFamily}`;
    context.fillStyle = cellStyle.color;
    context.textBaseline = "alphabetic";
    // Older canvas implementations ignore unsupported spacing properties.
    context.letterSpacing = `${(parseFloat(cellStyle.letterSpacing) || 0) * scale}px`;
    const ascent = context.measureText("Mg").fontBoundingBoxAscent ?? fontSize * 0.8;
    const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const text = node.textContent ?? "";
      let line = "";
      let x = 0;
      let y = 0;
      const flush = () => {
        if (line) context.fillText(line, x, y + ascent);
        line = "";
      };
      for (let index = 0; index < text.length; index += 1) {
        range.setStart(node, index);
        range.setEnd(node, index + 1);
        const glyph = range.getBoundingClientRect();
        if (!glyph.width || !glyph.height) continue;
        const top = glyph.top - bounds.top;
        if (line && Math.abs(top - y) > 0.5) flush();
        if (!line) { x = glyph.left - bounds.left; y = top; }
        line += cellStyle.textTransform === "uppercase" ? text[index].toUpperCase() : text[index];
      }
      flush();
    }
  });
  context.restore();
  const fadeLeft = viewport.classList.contains("has-more-left");
  const fadeRight = viewport.classList.contains("has-more-right");
  if (fadeLeft || fadeRight) {
    // Match the CSS alpha mask over the entire viewport, including its
    // background, dividers and text. This is not a colored overlay.
    const gradient = context.createLinearGradient(box.x, 0, box.x + box.width, 0);
    const fadeWidth = (parseFloat(style.getPropertyValue("--navigation-table-fade-width")) || 48) * scale;
    const edge = Math.min(fadeWidth / box.width, 0.5);
    gradient.addColorStop(0, fadeLeft ? "transparent" : "#000");
    gradient.addColorStop(edge, "#000");
    gradient.addColorStop(1 - edge, "#000");
    gradient.addColorStop(1, fadeRight ? "transparent" : "#000");
    // Apply the mask outside the viewport clip, over the whole bitmap.
    // A clipped composite can leave antialiased border pixels unmasked.
    context.save();
    context.globalCompositeOperation = "destination-in";
    context.fillStyle = gradient;
    context.fillRect(0, 0, snapshot.width / ratio, snapshot.height / ratio);
    context.restore();
  }
  const thumb = element.querySelector(".navigation-specifications-scrollbar-thumb");
  if (thumb) {
    const rect = local(thumb);
    const radius = rect.height / 2;
    context.fillStyle = getComputedStyle(thumb).backgroundColor;
    context.beginPath();
    context.moveTo(rect.x + radius, rect.y);
    context.arcTo(rect.x + rect.width, rect.y, rect.x + rect.width, rect.y + rect.height, radius);
    context.arcTo(rect.x + rect.width, rect.y + rect.height, rect.x, rect.y + rect.height, radius);
    context.arcTo(rect.x, rect.y + rect.height, rect.x, rect.y, radius);
    context.arcTo(rect.x, rect.y, rect.x + rect.width, rect.y, radius);
    context.fill();
  }
  return snapshot;
}
