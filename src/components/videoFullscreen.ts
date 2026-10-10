type FullscreenVideo = HTMLVideoElement & { webkitDisplayingFullscreen?: boolean };
type FullscreenDocument = Document & { webkitFullscreenElement?: Element | null };
export const videoFullscreenChangeEvent = "portfolio-video-fullscreen-change";

export function isVideoFullscreen(video: HTMLVideoElement): boolean {
  const document = video.ownerDocument as FullscreenDocument;
  const element = document.fullscreenElement ?? document.webkitFullscreenElement;
  return Boolean(
    (video as FullscreenVideo).webkitDisplayingFullscreen
    || video.closest(".expanded-media-video-frame.is-css-fullscreen")
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
  let wasFullscreen = false;
  const update = () => {
    const fullscreen = nativeFullscreen || isVideoFullscreen(video);
    if (fullscreen && !wasFullscreen) {
      // Fullscreen entry may happen while this player is paused, so ownership
      // cannot depend only on the normal play event.
      document.querySelectorAll("video").forEach((other) => {
        if (other !== video && !other.paused) other.pause();
      });
    }
    wasFullscreen = fullscreen;
    onChange(fullscreen);
  };
  const beginNativeFullscreen = () => {
    nativeFullscreen = true;
    update();
  };
  const endNativeFullscreen = () => {
    nativeFullscreen = false;
    wasFullscreen = false;
    onChange(false);
  };
  document.addEventListener("fullscreenchange", update);
  document.addEventListener("webkitfullscreenchange", update);
  document.addEventListener(videoFullscreenChangeEvent, update);
  video.addEventListener("webkitbeginfullscreen", beginNativeFullscreen);
  video.addEventListener("webkitendfullscreen", endNativeFullscreen);
  update();
  return () => {
    document.removeEventListener("fullscreenchange", update);
    document.removeEventListener("webkitfullscreenchange", update);
    document.removeEventListener(videoFullscreenChangeEvent, update);
    video.removeEventListener("webkitbeginfullscreen", beginNativeFullscreen);
    video.removeEventListener("webkitendfullscreen", endNativeFullscreen);
  };
}
