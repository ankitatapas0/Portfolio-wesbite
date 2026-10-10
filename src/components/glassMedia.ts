export type GlassMedia = {
  element: HTMLElement;
  media: HTMLImageElement | HTMLVideoElement;
  bounds: DOMRect;
  fit: string;
  poster?: HTMLImageElement;
  posterVisible?: boolean;
  frameCallback: number | null;
  fallbackTime: number;
  dispose: () => void;
};

// The CSS uses centered object positioning. Fitting styles are cached separately
// from geometry so scrolling and CSS transform animations don't read styles.
export function drawGlassMedia(
  context: CanvasRenderingContext2D,
  entry: GlassMedia,
  top: number,
  captureTop: number,
) {
  const { media, bounds, fit } = entry;
  // Idle metadata-only players display their poster, not a decoded frame.
  // Capture that same still instead of leaving a hole in the glass texture.
  const drawable = media instanceof HTMLVideoElement
    && (entry.posterVisible || media.readyState < HTMLMediaElement.HAVE_CURRENT_DATA)
    ? entry.poster : media;
  if (!drawable) return;
  const isImage = drawable instanceof HTMLImageElement;
  if (isImage ? !drawable.complete : drawable.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
  const sourceWidth = isImage ? drawable.naturalWidth : drawable.videoWidth;
  const sourceHeight = isImage ? drawable.naturalHeight : drawable.videoHeight;
  if (!sourceWidth || !sourceHeight || !bounds.width || !bounds.height) return;
  const destinationRatio = bounds.width / bounds.height;
  const sourceRatio = sourceWidth / sourceHeight;
  let destinationX = bounds.left;
  let destinationY = top - captureTop;
  let destinationWidth = bounds.width;
  let destinationHeight = bounds.height;
  if (fit === "cover") {
    if (sourceRatio > destinationRatio) {
      destinationWidth = bounds.height * sourceRatio;
      destinationX -= (destinationWidth - bounds.width) / 2;
    } else {
      destinationHeight = bounds.width / sourceRatio;
      destinationY -= (destinationHeight - bounds.height) / 2;
    }
  } else if (fit === "contain") {
    if (sourceRatio > destinationRatio) {
      destinationHeight = bounds.width / sourceRatio;
      destinationY += (bounds.height - destinationHeight) / 2;
    } else {
      destinationWidth = bounds.height * sourceRatio;
      destinationX += (bounds.width - destinationWidth) / 2;
    }
  }
  // srcset makes naturalWidth density-corrected, while source crop coordinates
  // refer to bitmap pixels. Let drawImage use the whole bitmap and crop only
  // the destination; otherwise responsive images sample the wrong region.
  context.save();
  context.beginPath();
  context.rect(bounds.left, top - captureTop, bounds.width, bounds.height);
  context.clip();
  context.drawImage(drawable, destinationX, destinationY, destinationWidth, destinationHeight);
  context.restore();
}
