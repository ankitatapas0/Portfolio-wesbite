type FullscreenVideo = HTMLVideoElement & { webkitDisplayingFullscreen?: boolean };
type FullscreenDocument = Document & { webkitFullscreenElement?: Element | null };

export function isVideoFullscreen(video: HTMLVideoElement): boolean {
  const document = video.ownerDocument as FullscreenDocument;
  const element = document.fullscreenElement ?? document.webkitFullscreenElement;
  return Boolean(
    (video as FullscreenVideo).webkitDisplayingFullscreen
    || element === video
    || element?.contains(video),
  );
}

// iPhone Safari's native video fullscreen doesn't use document.fullscreenElement.
export function observeVideoFullscreen(
  video: HTMLVideoElement,
  onChange: (fullscreen: boolean) => void,
): () => void {
  const document = video.ownerDocument;
  let nativeFullscreen = false;
  const update = () => onChange(nativeFullscreen || isVideoFullscreen(video));
  const beginNativeFullscreen = () => {
    nativeFullscreen = true;
    update();
  };
  const endNativeFullscreen = () => {
    nativeFullscreen = false;
    onChange(false);
  };
  document.addEventListener("fullscreenchange", update);
  document.addEventListener("webkitfullscreenchange", update);
  video.addEventListener("webkitbeginfullscreen", beginNativeFullscreen);
  video.addEventListener("webkitendfullscreen", endNativeFullscreen);
  update();
  return () => {
    document.removeEventListener("fullscreenchange", update);
    document.removeEventListener("webkitfullscreenchange", update);
    video.removeEventListener("webkitbeginfullscreen", beginNativeFullscreen);
    video.removeEventListener("webkitendfullscreen", endNativeFullscreen);
  };
}
