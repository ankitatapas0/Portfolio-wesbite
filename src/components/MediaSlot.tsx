import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal, flushSync } from "react-dom";
import { navigatePortfolio, portfolioRouteChangeEvent } from "../portfolioRouting";
import { extraSmallViewportQuery } from "../breakpoints";
import { DetailPageTransition } from "./DetailPageTransition";
import { CustomVideoControls } from "./CustomVideoControls";
import { useVideoControlsVisibility } from "./useVideoControlsVisibility";
import { useDetailVideoLoading } from "./useDetailVideoLoading";
import { isVideoFullscreen, observeVideoFullscreen, videoFullscreenChangeEvent } from "./videoFullscreen";
import { TagComponent } from "./tag_component";
import { imageMetadata, videoMetadata } from "../video-metadata.generated";
import { NavigationSpecificationsTable, type NavigationSpecification } from "./NavigationSpecificationsTable";
import { DetailDescription } from "./DetailDescription";
import imageExitIcon from "../assets/player-icons/fullscreen-exit.svg";
import { getVideoVolume, setVideoVolume } from "./videoVolume";
import { useFullscreenSwipeDismiss } from "./useFullscreenSwipeDismiss";
import { useDetailCursorHint } from "./useDetailCursorHint";

const mediaVolumeChangeEventKey = "portfolio-media-volume-change";
const audioFadeStartVolume = 0.01;

type MediaVolumePreferences = {
  volume: number;
  muted: boolean;
};

let sharedMediaVolumePreferences: MediaVolumePreferences = {
  volume: 0.5,
  muted: false,
};
let activeExpandedVideo: HTMLVideoElement | null = null;

function loadMediaVolumePreferences(): MediaVolumePreferences {
  return sharedMediaVolumePreferences;
}

function saveMediaVolumePreferences(preferences: MediaVolumePreferences) {
  sharedMediaVolumePreferences = preferences;
  window.dispatchEvent(new CustomEvent<MediaVolumePreferences>(
    mediaVolumeChangeEventKey,
    { detail: preferences },
  ));
}

export type MediaSlotData = {
  detailSlug?: string;
  externalHref?: string;
  externalMessage?: string;
  externalMessageFollowsTags?: boolean;
  externalLinkLabel?: string;
  id: string;
  ratio: "1:1" | "16:9" | "2:3";
  layer: 1 | 2 | 3;
  projectLabel: string;
  projectTags: string[];
  imageSrc?: string;
  hoverImageSrc?: string;
  hoverVideoSrc?: string;
  videoSrc?: string;
  expandedVideoSrc?: string;
  alternateExpandedVideoSrc?: string;
  thirdExpandedVideoSrc?: string;
  expandedImageSlides?: string[][];
  expandedImageBorder?: boolean;
  expandedMediaSlides?: ExpandedMediaSlide[];
  restLabel?: string;
  expandedLabel?: string;
  expandedTitle?: string;
  alternateExpandedTitle?: string;
  expandedSubtitleLines?: string[];
  alternateExpandedSubtitleLines?: string[];
  showExpandedCopyOnAllSlides?: boolean;
};

export type ExpandedMediaAsset = {
  /** Describes visible image content; omitted descriptions retain legacy labels. */
  alt?: string;
  bordered?: boolean;
  caption?: string;
  specifications?: NavigationSpecification[];
  initialTime?: number;
  playbackStartTime?: number;
  prefetchInitialRange?: boolean;
  source: string;
  type: "image" | "video";
};

export type ExpandedMediaSlide = ExpandedMediaAsset[] | {
  assets: ExpandedMediaAsset[];
  layout: "fountain-pair" | "spatial-pair" | "wide-image" | "matched-height-pair";
};

type MediaSlotProps = {
  closeDetailRequest: DetailCloseRequest;
  slot: MediaSlotData;
};

export type DetailCloseRequest = {
  disableExitMotion: boolean;
  id: number;
};

type ExpandedImageProps = {
  alt: string;
  bordered?: boolean;
  caption?: string;
  specifications?: NavigationSpecification[];
  grouped?: boolean;
  onError: () => void;
  onLoad: () => void;
  source: string;
  transitionClass?: string;
};

type ExpandedImageStyle = CSSProperties & {
  "--expanded-image-height"?: string;
  "--expanded-image-width"?: string;
};

function ExpandedImage({
  alt,
  bordered = false,
  caption,
  grouped = false,
  onError,
  onLoad,
  source,
  specifications,
  transitionClass = "",
}: ExpandedImageProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const fullscreenAnimationTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const wasFullscreenRef = useRef(false);
  const dimensions = imageMetadata[source];
  const [aspectRatio, setAspectRatio] = useState<number | null>(
    () => dimensions ? dimensions.width / dimensions.height : null,
  );
  const [isFullscreenEntering, setIsFullscreenEntering] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isCssFullscreen, setIsCssFullscreen] = useState(false);
  const [imageSizes, setImageSizes] = useState("100vw");

  useLayoutEffect(() => {
    if (!dimensions?.srcSet || !frameRef.current) return;
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.ceil(entry.contentRect.width);
      if (width > 0) setImageSizes(`${width}px`);
    });
    observer.observe(frameRef.current);
    return () => observer.disconnect();
  }, [dimensions?.srcSet, isCssFullscreen]);
  const style: ExpandedImageStyle | undefined = aspectRatio
    ? {
        aspectRatio,
        "--expanded-image-height": `${100 / aspectRatio}cqw`,
        "--expanded-image-width": `${aspectRatio * 100}cqh`,
      }
    : undefined;

  useEffect(() => {
    const updateFullscreenState = () => {
      const isCurrentImageFullscreen = document.fullscreenElement === frameRef.current
        || (document as Document & { webkitFullscreenElement?: Element | null })
          .webkitFullscreenElement === frameRef.current;
      setIsFullscreen(isCurrentImageFullscreen);

      if (fullscreenAnimationTimeoutRef.current !== undefined) {
        clearTimeout(fullscreenAnimationTimeoutRef.current);
      }
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        setIsFullscreenEntering(false);
      } else if (isCurrentImageFullscreen && !wasFullscreenRef.current) {
        setIsFullscreenEntering(true);
        fullscreenAnimationTimeoutRef.current = setTimeout(() => {
          setIsFullscreenEntering(false);
          fullscreenAnimationTimeoutRef.current = undefined;
        }, 400);
      } else if (!isCurrentImageFullscreen && wasFullscreenRef.current) {
        setIsFullscreenEntering(false);
        fullscreenAnimationTimeoutRef.current = undefined;
        requestAnimationFrame(() => imageRef.current?.focus({ preventScroll: true }));
      }
      wasFullscreenRef.current = isCurrentImageFullscreen;
    };

    document.addEventListener("fullscreenchange", updateFullscreenState);
    document.addEventListener("webkitfullscreenchange", updateFullscreenState);
    return () => {
      document.removeEventListener("fullscreenchange", updateFullscreenState);
      document.removeEventListener("webkitfullscreenchange", updateFullscreenState);
      if (fullscreenAnimationTimeoutRef.current !== undefined) {
        clearTimeout(fullscreenAnimationTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isCssFullscreen) return;
    frameRef.current?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Tab") {
        event.preventDefault();
        frameRef.current?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
        return;
      }
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setIsCssFullscreen(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      requestAnimationFrame(() => imageRef.current?.focus({ preventScroll: true }));
    };
  }, [isCssFullscreen]);

  const toggleFullscreenImage = async () => {
    const frame = frameRef.current;
    if (!frame) return;

    if (isCssFullscreen) {
      setIsCssFullscreen(false);
      return;
    }

    const fullscreenDocument = document as Document & {
      webkitExitFullscreen?: () => void | Promise<void>;
      webkitFullscreenElement?: Element | null;
    };
    const isNativeFullscreen = document.fullscreenElement === frame
      || fullscreenDocument.webkitFullscreenElement === frame;
    const exitFullscreen = document.exitFullscreen?.bind(document)
      ?? fullscreenDocument.webkitExitFullscreen?.bind(document);

    if (isNativeFullscreen && exitFullscreen) {
      try {
        await exitFullscreen();
      } catch (error) {
        console.error(`Unable to exit image fullscreen: ${source}`, error);
      }
      return;
    }

    const fullscreenFrame = frame as HTMLDivElement & {
      webkitRequestFullscreen?: () => void | Promise<void>;
    };
    const requestFullscreen = fullscreenFrame.requestFullscreen?.bind(frame)
      ?? fullscreenFrame.webkitRequestFullscreen?.bind(frame);
    if (!requestFullscreen || !exitFullscreen) {
      setIsCssFullscreen(true);
      return;
    }

    try {
      await requestFullscreen();
    } catch (error) {
      console.warn(`Native image fullscreen is unavailable; using viewport fullscreen: ${source}`, error);
      setIsCssFullscreen(true);
    }
  };

  const imageSwipe = useFullscreenSwipeDismiss(frameRef, isFullscreen || isCssFullscreen,
    () => { void toggleFullscreenImage(); });
  const imageCursor = useDetailCursorHint(!isFullscreen && !isCssFullscreen && !isFullscreenEntering, "VIEW FULLSCREEN");

  const imageFrame = (
    <div
      ref={frameRef}
      className={`expanded-media-image-frame${bordered ? " is-bordered" : ""}${grouped ? " is-grouped" : ""}${aspectRatio ? " is-ready" : ""}${isFullscreenEntering ? " is-fullscreen-entering" : ""}${isCssFullscreen ? " is-css-fullscreen" : ""}${transitionClass}`}
      data-detail-page-content
      style={style}
      role={isCssFullscreen ? "dialog" : undefined}
      aria-modal={isCssFullscreen ? true : undefined}
      aria-label={isCssFullscreen ? alt : undefined}
      {...imageSwipe}
      onClick={(event) => event.stopPropagation()}
    >
      <img
        ref={imageRef}
        {...imageCursor.pointerEvents}
        src={source}
        srcSet={dimensions?.srcSet}
        sizes={dimensions?.srcSet ? imageSizes : undefined}
        alt={alt}
        role={isFullscreen || isCssFullscreen ? undefined : "button"}
        tabIndex={isFullscreen || isCssFullscreen ? -1 : 0}
        aria-label={isFullscreen || isCssFullscreen ? undefined : `View ${alt} fullscreen`}
        onClick={() => {
          if (!isFullscreen && !isCssFullscreen) void toggleFullscreenImage();
        }}
        onKeyDown={(event) => {
          if ((event.key === "Enter" || event.key === " ") && !isFullscreen && !isCssFullscreen) {
            event.preventDefault();
            event.stopPropagation();
            void toggleFullscreenImage();
          }
        }}
        width={dimensions?.width}
        height={dimensions?.height}
        loading="lazy"
        decoding="async"
        onLoad={(event) => {
          const image = event.currentTarget;
          setAspectRatio(dimensions?.srcSet
            ? dimensions.width / dimensions.height
            : image.naturalWidth / image.naturalHeight);
          onLoad();
        }}
        onError={onError}
      />
      {imageCursor.cursor}
      {(isFullscreen || isCssFullscreen) && <button
        className="expanded-image-fullscreen"
        type="button"
        aria-label={`Exit fullscreen for ${alt}`}
        onClick={() => void toggleFullscreenImage()}
      >
        <span className="cvc-icon" aria-hidden="true"
          style={{ maskImage: `url("${imageExitIcon}")`, WebkitMaskImage: `url("${imageExitIcon}")` }} />
      </button>}
    </div>
  );

  const fullscreenFrame = isCssFullscreen
    ? createPortal(imageFrame, document.body)
    : imageFrame;

  return caption || specifications?.length ? (
    <div className="expanded-media-captioned-image">
      {caption && !specifications?.length && (
        <div className="expanded-media-image-caption nav-tabs-type-ramp" data-detail-page-content>{caption}</div>
      )}
      {specifications?.length ? (
        <NavigationSpecificationsTable columns={specifications} label={caption ?? alt} />
      ) : null}
      {fullscreenFrame}
    </div>
  ) : fullscreenFrame;
}

type ExpandedVideoProps = {
  autoPlay: boolean;
  bordered?: boolean;
  initialTime?: number;
  playbackStartTime?: number;
  prefetchInitialRange?: boolean;
  label: string;
  slotId: string;
  source: string;
};

function ExpandedVideo({
  autoPlay,
  bordered = false,
  initialTime = 0,
  playbackStartTime = 0,
  prefetchInitialRange = false,
  label,
  slotId,
  source,
}: ExpandedVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const dimensions = videoMetadata[source];
  const {
    controls: controlsVisible,
    showToolbarWhilePaused,
    onPlaybackStarted,
    onPlaybackPaused,
    ...frameVisibility
  } = useVideoControlsVisibility(videoRef);
  const frameRef = useRef<HTMLDivElement>(null);
  const [isCssFullscreen, setIsCssFullscreen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const loading = useDetailVideoLoading(videoRef, autoPlay,
    prefetchInitialRange && !autoPlay ? source : undefined);
  const { reportPlayError } = loading;
  const audioFadeFrameRef = useRef<number | undefined>(undefined);
  const initialAudioFadeAllowedRef = useRef(autoPlay);
  const hasUserAdjustedVolumeRef = useRef(false);
  const isApplyingSharedVolumeRef = useRef(false);
  const initializeVideo = useCallback((video: HTMLVideoElement | null) => {
    videoRef.current = video;
    if (!video) return;

    const preferences = loadMediaVolumePreferences();
    hasUserAdjustedVolumeRef.current = false;
    isApplyingSharedVolumeRef.current = true;
    setVideoVolume(video, autoPlay
      ? Math.min(audioFadeStartVolume, preferences.volume)
      : preferences.volume);
    video.muted = preferences.muted;
  }, [autoPlay]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const preferences = loadMediaVolumePreferences();
    isApplyingSharedVolumeRef.current = true;
    const fadeStartVolume = Math.min(audioFadeStartVolume, preferences.volume);
    setVideoVolume(video, autoPlay ? fadeStartVolume : preferences.volume);
    video.muted = preferences.muted;

    const stopAudioFade = () => {
      if (audioFadeFrameRef.current !== undefined) {
        cancelAnimationFrame(audioFadeFrameRef.current);
        audioFadeFrameRef.current = undefined;
      }
      isApplyingSharedVolumeRef.current = false;
    };

    const playInitialVideo = () => {
      video.play()
        .then(() => {
          initialAudioFadeAllowedRef.current = false;
          if (hasUserAdjustedVolumeRef.current) return;

          isApplyingSharedVolumeRef.current = true;
          const fadeStartedAt = performance.now();
          const fadeIn = (now: number) => {
            const fadeProgress = Math.min(Math.max((now - fadeStartedAt) / 3000, 0), 1);
            setVideoVolume(video, fadeStartVolume + (preferences.volume - fadeStartVolume) * fadeProgress);
            if (fadeProgress < 1) {
              audioFadeFrameRef.current = requestAnimationFrame(fadeIn);
            } else {
              audioFadeFrameRef.current = undefined;
              isApplyingSharedVolumeRef.current = false;
            }
          };
          audioFadeFrameRef.current = requestAnimationFrame(fadeIn);
        })
        .catch((error: unknown) => {
          reportPlayError(error);
          if (error instanceof DOMException && error.name === "AbortError") return;
          // If audible autoplay is blocked (or loading fails), a later manual
          // Play/Retry must not remain at the fade's near-silent starting volume.
          initialAudioFadeAllowedRef.current = false;
          if (!hasUserAdjustedVolumeRef.current) {
            isApplyingSharedVolumeRef.current = true;
            setVideoVolume(video, loadMediaVolumePreferences().volume);
            requestAnimationFrame(() => {
              isApplyingSharedVolumeRef.current = false;
            });
          }
        });
    };

    const applySharedVolume = (event: Event) => {
      const preferences = (event as CustomEvent<MediaVolumePreferences>).detail;
      stopAudioFade();
      isApplyingSharedVolumeRef.current = true;
      setVideoVolume(video, preferences.volume);
      video.muted = preferences.muted;
      requestAnimationFrame(() => {
        isApplyingSharedVolumeRef.current = false;
      });
    };

    const scrollRoot = video.closest<HTMLElement>(".detail-page-transition-backdrop");
    let visibleRatio: number | null = null;
    let fullscreenActive = isVideoFullscreen(video);
    const pauseIfMostlyOutsideViewport = (intersectionRatio: number) => {
      if (fullscreenActive || isVideoFullscreen(video)) return;
      if (intersectionRatio > 0.3 || video.paused) return;

      stopAudioFade();
      video.pause();
    };
    const observer = new IntersectionObserver(
      ([entry]) => {
        visibleRatio = entry.intersectionRatio;
        pauseIfMostlyOutsideViewport(visibleRatio);
      },
      { root: scrollRoot, threshold: [0, 0.3] },
    );
    const stopObservingFullscreen = observeVideoFullscreen(video, (fullscreen) => {
      fullscreenActive = fullscreen;
      // Fullscreen changes the coordinate space. Discard stale scroll-root
      // visibility and remeasure on exit instead of pausing a visible player.
      visibleRatio = null;
      observer.disconnect();
      observer.observe(video);
    });
    const handlePlay = () => {
      if (Array.from(document.querySelectorAll("video")).some(
        (other) => other !== video && isVideoFullscreen(other),
      )) {
        video.pause();
        return;
      }
      const previousVideo = activeExpandedVideo;
      activeExpandedVideo = video;
      if (previousVideo && previousVideo !== video) {
        previousVideo.pause();
      }

      if (visibleRatio !== null) {
        pauseIfMostlyOutsideViewport(visibleRatio);
      }
      // Keep the poster visible before Play; seek only when playback starts.
      // Resuming or seeking elsewhere must not reset the player's position.
      if (!video.paused && playbackStartTime > 0 && video.currentTime < 0.05) {
        video.currentTime = playbackStartTime;
      }
    };
    const handlePause = () => {
      stopAudioFade();
      if (activeExpandedVideo === video) {
        activeExpandedVideo = null;
      }
    };
    observer.observe(video);
    video.addEventListener("play", handlePlay);
    video.addEventListener("pause", handlePause);
    window.addEventListener(mediaVolumeChangeEventKey, applySharedVolume);
    if (autoPlay) {
      playInitialVideo();
    } else {
      requestAnimationFrame(() => {
        isApplyingSharedVolumeRef.current = false;
      });
    }

    return () => {
      stopObservingFullscreen();
      observer.disconnect();
      video.removeEventListener("play", handlePlay);
      video.removeEventListener("pause", handlePause);
      window.removeEventListener(mediaVolumeChangeEventKey, applySharedVolume);
      stopAudioFade();
      if (activeExpandedVideo === video) {
        activeExpandedVideo = null;
      }
      video.pause();
    };
  }, [autoPlay, slotId, source, playbackStartTime, reportPlayError]);

  const beginManualVolumeAdjustment = () => {
    hasUserAdjustedVolumeRef.current = true;
    if (audioFadeFrameRef.current !== undefined) {
      cancelAnimationFrame(audioFadeFrameRef.current);
      audioFadeFrameRef.current = undefined;
    }
    isApplyingSharedVolumeRef.current = false;
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    return observeVideoFullscreen(video, setIsFullscreen);
  }, []);

  useEffect(() => {
    // Notify the same playback/visibility observers used by native fullscreen.
    document.dispatchEvent(new Event(videoFullscreenChangeEvent));
    if (!isCssFullscreen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setIsCssFullscreen(false);
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [isCssFullscreen]);

  const toggleFullscreen = async () => {
    const frame = frameRef.current;
    const video = videoRef.current;
    if (!frame || !video) return;
    const doc = document as Document & { webkitExitFullscreen?: () => void; webkitFullscreenElement?: Element | null };
    if (isCssFullscreen) {
      setIsCssFullscreen(false);
      return;
    }
    if (doc.fullscreenElement || doc.webkitFullscreenElement) {
      try { await (document.exitFullscreen?.() ?? doc.webkitExitFullscreen?.()); } catch { /* ignore */ }
      return;
    }
    const f = frame as HTMLDivElement & { webkitRequestFullscreen?: () => void };
    const request = f.requestFullscreen?.bind(frame) ?? f.webkitRequestFullscreen?.bind(frame);
    try {
      if (!request) throw new Error("unsupported");
      await request();
    } catch {
      document.querySelectorAll("video").forEach((other) => { if (other !== video && !other.paused) other.pause(); });
      setIsCssFullscreen(true);
    }
  };

  const videoSwipe = useFullscreenSwipeDismiss(frameRef, isFullscreen || isCssFullscreen,
    () => { void toggleFullscreen(); });

  const videoFrame = (
    <div
      ref={frameRef}
      className={`expanded-media-video-frame${bordered ? " is-bordered" : ""}${isCssFullscreen ? " is-css-fullscreen" : ""}`}
      data-detail-page-content
      role={isCssFullscreen ? "dialog" : undefined}
      aria-modal={isCssFullscreen ? true : undefined}
      aria-label={isCssFullscreen ? label : undefined}
      {...frameVisibility}
      {...videoSwipe}
      onClick={(event) => { if (isCssFullscreen) event.stopPropagation(); }}
    >
      <video
        ref={initializeVideo}
        data-detail-page-content
        src={loading.sourceReady ? source : undefined}
        poster={dimensions?.restPosters?.[initialTime] ?? dimensions?.poster}
        width={dimensions?.width}
        height={dimensions?.height}
        style={dimensions ? { aspectRatio: `${dimensions.width} / ${dimensions.height}` } : undefined}
        loop
        playsInline
        disablePictureInPicture
        preload={loading.preload}
        tabIndex={0}
        aria-label={label}
        onLoadedMetadata={(event) => {
          const video = event.currentTarget;
          const preferences = loadMediaVolumePreferences();
          // The resting frame is a small poster, not a seek into the movie.
          // Playback now starts at zero without downloading six seconds first.
          loading.markMetadata();
          isApplyingSharedVolumeRef.current = true;
          setVideoVolume(video, initialAudioFadeAllowedRef.current && !hasUserAdjustedVolumeRef.current
            ? Math.min(audioFadeStartVolume, preferences.volume)
            : preferences.volume);
          video.muted = preferences.muted;
          if (!initialAudioFadeAllowedRef.current || hasUserAdjustedVolumeRef.current) {
            requestAnimationFrame(() => {
              isApplyingSharedVolumeRef.current = false;
            });
          }
        }}
        onPointerDownCapture={beginManualVolumeAdjustment}
        onKeyDownCapture={beginManualVolumeAdjustment}
        onKeyDown={(event) => {
          const video = event.currentTarget;
          if (event.key === " " || event.key.toLowerCase() === "k") {
            event.preventDefault();
            if (video.paused) void video.play().then(() => {
              if (videoRef.current === video && !video.paused) onPlaybackStarted();
            }).catch(reportPlayError);
            else {
              video.pause();
              onPlaybackPaused();
            }
          } else if ((event.key === "ArrowLeft" || event.key === "ArrowRight") && Number.isFinite(video.duration)) {
            event.preventDefault();
            video.currentTime = Math.max(0, Math.min(video.duration,
              video.currentTime + (event.key === "ArrowRight" ? 5 : -5)));
          }
        }}
        onPlay={loading.markPlay}
        onPause={loading.markPause}
        onCanPlay={loading.markReady}
        onPlaying={loading.markReady}
        onWaiting={loading.markWaiting}
        onStalled={loading.markWaiting}
        onError={() => {
          loading.markError();
          console.warn(`Unable to load expanded media in slot ${slotId}: ${source}`);
        }}
        onVolumeChange={(event) => {
          if (isApplyingSharedVolumeRef.current) return;
          saveMediaVolumePreferences({
            volume: getVideoVolume(event.currentTarget),
            muted: event.currentTarget.muted,
          });
        }}
      />
      <div className="expanded-video-feedback" role="status" aria-live="polite" aria-atomic="true">
        {loading.feedback && (
          <div className="expanded-video-feedback-message">
            <span>{loading.feedback}</span>
            {loading.canRetry && (
              <button type="button" aria-label={`Retry loading ${label}`} onClick={(event) => {
                event.stopPropagation();
                loading.retry();
              }}>Retry</button>
            )}
          </div>
        )}
      </div>
      <CustomVideoControls
        videoRef={videoRef}
        label={label}
        visible={controlsVisible}
        showCenterAtRest
        showToolbarWhilePaused={showToolbarWhilePaused}
        onPlaybackStarted={onPlaybackStarted}
        onPlaybackPaused={onPlaybackPaused}
        fullscreen={isFullscreen || isCssFullscreen}
        onToggleFullscreen={() => void toggleFullscreen()}
        onManualVolume={beginManualVolumeAdjustment}
        onPlayError={reportPlayError}
      />
    </div>
  );

  return videoFrame;
}

type ExpandedMediaGroup = {
  assets: ExpandedMediaAsset[];
  layout?: "fountain-pair" | "spatial-pair" | "wide-image" | "matched-height-pair";
  type: "group";
};

type ExpandedMediaItem = ExpandedMediaAsset | ExpandedMediaGroup;

function isExpandedMediaGroup(item: ExpandedMediaItem): item is ExpandedMediaGroup {
  return item.type === "group";
}

export function MediaSlot({ closeDetailRequest, slot }: MediaSlotProps) {
  const detailHash = slot.detailSlug ? `#/desktop/${slot.detailSlug}` : undefined;
  const tagDescriptionId = `project-tags-${slot.id}`;
  const articleRef = useRef<HTMLElement>(null);
  const detailOpenTriggerRef = useRef<HTMLElement | null>(null);
  const tagOverlayRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hoverIntentTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const externalHoverDismissedRef = useRef(false);
  const pointerFocusRef = useRef(false);
  const suppressNextFocusInteractionRef = useRef(false);
  const [isExpanded, setIsExpanded] = useState(
    () => Boolean(detailHash && window.location.hash === detailHash),
  );
  const [disableExitMotion, setDisableExitMotion] = useState(false);
  const [isHoverActive, setIsHoverActive] = useState(false);
  const [isExternalLinkRest, setIsExternalLinkRest] = useState(false);
  const [hoverSourceReady, setHoverSourceReady] = useState(false);
  const [isHoverVideoReady, setIsHoverVideoReady] = useState(false);
  const [tagPosition, setTagPosition] = useState<{ left: number; top: number; width: number } | null>(null);
  const [isExtraSmallViewport, setIsExtraSmallViewport] = useState(
    () => typeof window !== "undefined" && window.matchMedia(extraSmallViewportQuery).matches,
  );
  const expandedVideoSources = [
    slot.expandedVideoSrc,
    slot.alternateExpandedVideoSrc,
    slot.thirdExpandedVideoSrc,
  ].filter((source): source is string => Boolean(source));
  const baseExpandedMediaItems: ExpandedMediaItem[] = slot.expandedMediaSlides?.length
    ? slot.expandedMediaSlides.map((slide) => {
        const assets = Array.isArray(slide) ? slide : slide.assets;
        return assets.length === 1
          ? assets[0]
          : {
              assets,
              layout: Array.isArray(slide) ? undefined : slide.layout,
              type: "group",
            };
      })
    : slot.expandedImageSlides?.length
      ? slot.expandedImageSlides.map((sources) => (
          sources.length === 1
            ? { source: sources[0], type: "image" }
            : {
                assets: sources.map((source) => ({ source, type: "image" })),
                type: "group",
              }
        ))
      : expandedVideoSources.map((source) => ({ source, type: "video" }));
  const expandedMediaItems: ExpandedMediaItem[] = isExtraSmallViewport
    ? baseExpandedMediaItems.flatMap((item): ExpandedMediaItem[] => {
        if (!isExpandedMediaGroup(item) || item.layout === "matched-height-pair") return [item];
        return [...item.assets].sort((first, second) => {
          if (first.type === second.type) return 0;
          return first.type === "video" ? -1 : 1;
        });
      })
    : baseExpandedMediaItems;
  const firstExpandedVideoSource = expandedMediaItems.reduce<string | undefined>(
    (firstVideoSource, item) => {
      if (firstVideoSource) return firstVideoSource;
      if (isExpandedMediaGroup(item)) {
        return item.assets.find((asset) => asset.type === "video")?.source;
      }
      return item.type === "video" ? item.source : undefined;
    },
    undefined,
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia(extraSmallViewportQuery);
    const updateExtraSmallViewport = () => setIsExtraSmallViewport(mediaQuery.matches);
    mediaQuery.addEventListener("change", updateExtraSmallViewport);
    return () => mediaQuery.removeEventListener("change", updateExtraSmallViewport);
  }, []);

  useEffect(() => {
    if (closeDetailRequest.id > 0) {
      setDisableExitMotion(closeDetailRequest.disableExitMotion);
      setIsExpanded(false);
    }
  }, [closeDetailRequest]);

  useEffect(
    () => () => {
      if (hoverIntentTimeoutRef.current !== undefined) {
        clearTimeout(hoverIntentTimeoutRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (!isHoverActive) {
      setTagPosition(null);
      return;
    }

    const initialBounds = articleRef.current?.getBoundingClientRect();
    if (initialBounds) {
      setTagPosition({
        left: initialBounds.left,
        top: initialBounds.bottom + 10,
        width: initialBounds.width,
      });
    }

    let animationFrame: number;
    const updateTagPosition = () => {
      const article = articleRef.current;
      const tagOverlay = tagOverlayRef.current;
      if (!article || !tagOverlay) {
        animationFrame = requestAnimationFrame(updateTagPosition);
        return;
      }

      const bounds = article.getBoundingClientRect();
      tagOverlay.style.left = `${bounds.left}px`;
      tagOverlay.style.top = `${bounds.bottom + 10}px`;
      tagOverlay.style.width = `${bounds.width}px`;
      animationFrame = requestAnimationFrame(updateTagPosition);
    };

    updateTagPosition();
    return () => cancelAnimationFrame(animationFrame);
  }, [isHoverActive]);

  useLayoutEffect(() => {
    const tagOverlay = tagOverlayRef.current;
    if (!isHoverActive || !tagOverlay || !tagPosition) return;

    const limitVisibleTagRows = () => {
      const tags = Array.from(tagOverlay.querySelectorAll<HTMLElement>(".project-tag"));
      tags.forEach((tag) => {
        tag.hidden = false;
      });

      const rowTops: number[] = [];
      tags.forEach((tag) => {
        const tagTop = tag.offsetTop;
        if (!rowTops.some((rowTop) => Math.abs(rowTop - tagTop) < 1)) {
          rowTops.push(tagTop);
        }
        tag.hidden = rowTops.length > 2;
      });
    };

    const resizeObserver = new ResizeObserver(limitVisibleTagRows);
    resizeObserver.observe(tagOverlay);
    limitVisibleTagRows();

    return () => resizeObserver.disconnect();
  }, [isHoverActive, tagPosition]);

  const playVideo = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    // Retained sources keep their failure state after a temporary loading error.
    // Retry once on the next hover without discarding healthy playback buffers.
    if (video.error) video.load();
    video.play().then(() => {
      if (videoRef.current === video && !video.paused) setIsHoverVideoReady(true);
    }).catch((error: unknown) => {
      // Leaving a tile detaches its source and cancels any pending play.
      if (error instanceof DOMException && error.name === "AbortError") return;
      console.error(`Unable to play video in slot ${slot.id}.`, error);
    });
  };

  const resetVideo = () => {
    if (!videoRef.current) return;
    videoRef.current.pause();
    videoRef.current.currentTime = 0;
  };

  const cancelHoverIntent = () => {
    if (hoverIntentTimeoutRef.current === undefined) return;
    clearTimeout(hoverIntentTimeoutRef.current);
    hoverIntentTimeoutRef.current = undefined;
  };

  const clearHoverInteraction = useCallback(() => {
    if (hoverIntentTimeoutRef.current !== undefined) {
      clearTimeout(hoverIntentTimeoutRef.current);
      hoverIntentTimeoutRef.current = undefined;
    }
    setIsHoverActive(false);
    setIsHoverVideoReady(false);
    const video = videoRef.current;
    if (video) {
      video.pause();
      video.currentTime = 0;
    }
  }, []);

  useEffect(() => {
    const clearWhenHidden = () => {
      if (document.hidden) clearHoverInteraction();
    };
    window.addEventListener("blur", clearHoverInteraction);
    window.addEventListener("pagehide", clearHoverInteraction);
    document.addEventListener("visibilitychange", clearWhenHidden);
    return () => {
      window.removeEventListener("blur", clearHoverInteraction);
      window.removeEventListener("pagehide", clearHoverInteraction);
      document.removeEventListener("visibilitychange", clearWhenHidden);
    };
  }, [clearHoverInteraction]);

  const prepareHoverLayout = () => {
    const article = articleRef.current;
    if (!article || article.classList.contains("is-hovered")) return;

    const styles = getComputedStyle(article);
    const hoverScale = Number.parseFloat(styles.getPropertyValue("--hover-scale"));
    const width = Number.parseFloat(styles.width);
    const height = Number.parseFloat(styles.height);
    const left = Number.parseFloat(styles.left);
    const top = Number.parseFloat(styles.top);
    if (
      !Number.isFinite(hoverScale)
      || !Number.isFinite(width)
      || !Number.isFinite(height)
      || !Number.isFinite(left)
      || !Number.isFinite(top)
    ) {
      console.error(`Unable to calculate hover dimensions for slot ${slot.id}.`);
      return;
    }

    const hoverWidth = width * hoverScale;
    const hoverHeight = height * hoverScale;
    article.style.setProperty("--hover-width", `${hoverWidth}px`);
    article.style.setProperty("--hover-left", `${left - (hoverWidth - width) / 2}px`);
    article.style.setProperty("--hover-top", `${top - (hoverHeight - height) / 2}px`);
  };

  const activateHover = () => {
    if (isExpanded || document.body.classList.contains("has-detail-page-open")) return;
    if (slot.externalHref && externalHoverDismissedRef.current) return;
    setIsExternalLinkRest(false);
    prepareHoverLayout();
    setHoverSourceReady(true);
    setIsHoverActive(true);
  };

  const canExpand = !slot.externalHref && expandedMediaItems.length > 0;
  const SlotElement = slot.externalHref ? "a" : "article";
  const isClickable = Boolean(slot.externalHref) || canExpand;
  const hasHoverVideoCrossfade = Boolean(slot.imageSrc && slot.hoverVideoSrc && !slot.videoSrc);
  const activeVideoSrc = slot.videoSrc ?? slot.hoverVideoSrc;
  const restLabel = slot.restLabel ?? "Portfolio media";
  const expandedLabel = slot.expandedLabel ?? "Expanded portfolio media";
  const openExternalLink = () => {
    externalHoverDismissedRef.current = true;
    // Commit the rest state before the browser opens the anchor's new tab.
    flushSync(() => {
      setIsExternalLinkRest(true);
      clearHoverInteraction();
    });
  };

  useEffect(() => {
    if (isHoverActive && !isExpanded && (slot.videoSrc || slot.hoverVideoSrc)) {
      playVideo();
    } else {
      setIsHoverVideoReady(false);
      const video = videoRef.current;
      if (video) {
        video.pause();
        video.currentTime = 0;
        // Keep recently hovered bytes for a quick replay, but release idle
        // resources and hidden tile buffers when a detail page opens.
        if ((!hoverSourceReady || isExpanded) && video.currentSrc) video.load();
      }
    }
  }, [isHoverActive, hoverSourceReady, isExpanded, slot.videoSrc, slot.hoverVideoSrc]);

  useEffect(() => {
    if (isExpanded) {
      clearHoverInteraction();
      setHoverSourceReady(false);
      return;
    }
    if (!hoverSourceReady || isHoverActive) return;
    const release = setTimeout(() => setHoverSourceReady(false), 15000);
    return () => clearTimeout(release);
  }, [hoverSourceReady, isHoverActive, isExpanded, clearHoverInteraction]);

  useEffect(() => {
    const syncExpandedStateWithRoute = () => {
      const isCurrentDetail = Boolean(
        detailHash
        && canExpand
        && window.location.hash === detailHash
      );
      if (isCurrentDetail) setDisableExitMotion(false);
      setIsExpanded(isCurrentDetail);
    };

    window.addEventListener("hashchange", syncExpandedStateWithRoute);
    window.addEventListener("popstate", syncExpandedStateWithRoute);
    window.addEventListener(portfolioRouteChangeEvent, syncExpandedStateWithRoute);
    return () => {
      window.removeEventListener("hashchange", syncExpandedStateWithRoute);
      window.removeEventListener("popstate", syncExpandedStateWithRoute);
      window.removeEventListener(portfolioRouteChangeEvent, syncExpandedStateWithRoute);
    };
  }, [canExpand, detailHash]);

  const openExpandedMedia = (triggerTarget?: HTMLElement) => {
    clearHoverInteraction();
    if (!detailHash) {
      console.error(`Missing detail route for expandable slot ${slot.id}.`);
      return;
    }

    if (triggerTarget) detailOpenTriggerRef.current = triggerTarget;
    setDisableExitMotion(false);
    if (window.location.hash !== detailHash) {
      navigatePortfolio(detailHash, {
        state: { ...window.history.state, portfolioDetail: true },
      });
    }
    setIsExpanded(true);
  };
  const closeExpandedMedia = useCallback(() => {
    if (
      detailHash
      && window.location.hash === detailHash
      && window.history.state?.portfolioDetail
    ) {
      window.history.back();
      return;
    }

    if (window.location.hash !== "#/desktop") {
      navigatePortfolio("#/desktop", { replace: true });
    }
    setIsExpanded(false);
  }, [detailHash]);
  const restoreDetailTriggerFocus = () => {
    const target = detailOpenTriggerRef.current ?? articleRef.current;
    if (!target?.isConnected) return;

    suppressNextFocusInteractionRef.current = true;
    target.focus({ preventScroll: true });
    if (document.activeElement !== target) {
      suppressNextFocusInteractionRef.current = false;
    }
  };
  const detailTitleId = slot.expandedTitle ? `detail-title-${slot.id}` : undefined;

  return (
    <>
      <SlotElement
        ref={(element) => { articleRef.current = element; }}
        href={slot.externalHref}
        target={slot.externalHref ? "_blank" : undefined}
        rel={slot.externalHref ? "noopener noreferrer" : undefined}
        draggable={slot.externalHref ? false : undefined}
        onContextMenu={slot.externalHref ? (event) => event.preventDefault() : undefined}
        className={`media-slot slot-${slot.id} layer-${slot.layer}${isClickable ? " is-clickable" : ""}${isHoverActive ? " is-hovered" : ""}${isExternalLinkRest ? " is-external-link-rest" : ""}${isHoverVideoReady ? " is-hover-video-ready" : ""}`}
        onPointerEnter={(event) => {
          if (event.pointerType !== "mouse" || !window.matchMedia("(any-hover: hover)").matches) return;
          setHoverSourceReady(true);
          cancelHoverIntent();
          hoverIntentTimeoutRef.current = setTimeout(() => {
            hoverIntentTimeoutRef.current = undefined;
            activateHover();
          }, 400);
        }}
        onPointerMove={(event) => {
          if (
            event.pointerType === "mouse"
            && window.matchMedia("(any-hover: hover)").matches
            && slot.externalHref
            && externalHoverDismissedRef.current
            && (event.movementX !== 0 || event.movementY !== 0)
          ) {
            // Restored focus/hover events must not undo dismissal. Only a
            // fresh pointer movement or a new keyboard focus may reactivate it.
            externalHoverDismissedRef.current = false;
            activateHover();
          }
        }}
        onPointerLeave={() => {
          clearHoverInteraction();
        }}
        onPointerDown={(event) => {
          pointerFocusRef.current = true;
          if (event.pointerType !== "mouse") clearHoverInteraction();
        }}
        onFocus={(event) => {
          if (suppressNextFocusInteractionRef.current) {
            suppressNextFocusInteractionRef.current = false;
            return;
          }
          if (pointerFocusRef.current || !event.currentTarget.matches(":focus-visible")) return;
          if (event.relatedTarget) externalHoverDismissedRef.current = false;
          cancelHoverIntent();
          activateHover();
        }}
        onBlur={() => {
          pointerFocusRef.current = false;
          cancelHoverIntent();
          setIsHoverActive(false);
          if (slot.videoSrc || slot.hoverVideoSrc) resetVideo();
        }}
        onClick={slot.externalHref
          ? openExternalLink
          : canExpand
            ? (event) => openExpandedMedia(event.currentTarget)
            : undefined}
        onKeyDown={
          canExpand
            ? (event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  openExpandedMedia(event.currentTarget);
                }
              }
            : undefined
        }
        role={canExpand ? "button" : undefined}
        tabIndex={isClickable ? 0 : undefined}
        aria-label={slot.externalHref ? (slot.externalLinkLabel ?? `View ${slot.projectLabel} on Instagram (opens in a new tab)`) : canExpand ? `Open ${expandedLabel}` : undefined}
        aria-describedby={isClickable && slot.projectTags.length ? tagDescriptionId : undefined}
      >
        <div aria-hidden={isClickable ? true : undefined} className={`media-visual${hasHoverVideoCrossfade ? " has-hover-video" : ""}${slot.externalHref ? " has-external-link" : ""}`}>
          {hasHoverVideoCrossfade ? (
            <>
              <img
                className="media-hover-rest"
                src={slot.imageSrc}
                alt={restLabel}
              />
              <video
                ref={videoRef}
                className="media-hover-video"
                src={hoverSourceReady && !isExpanded ? slot.hoverVideoSrc : undefined}
                muted
                loop
                playsInline
                disablePictureInPicture
                preload={hoverSourceReady && !isExpanded ? (isHoverActive ? "auto" : "metadata") : "none"}
                aria-hidden="true"
                onCanPlay={() => setIsHoverVideoReady(isHoverActive && !isExpanded)}
                onError={() => {
                  setIsHoverVideoReady(false);
                  console.error(`Unable to load hover video in slot ${slot.id}: ${slot.hoverVideoSrc}`);
                }}
              />
            </>
          ) : activeVideoSrc ? (
            <video
              ref={videoRef}
              src={hoverSourceReady && !isExpanded ? activeVideoSrc : undefined}
              poster={videoMetadata[activeVideoSrc]?.poster}
              muted
              loop
              playsInline
              disablePictureInPicture
              preload={hoverSourceReady && !isExpanded ? (isHoverActive ? "auto" : "metadata") : "none"}
              aria-label={restLabel}
            />
          ) : slot.imageSrc ? (
            <img
              src={isHoverActive && slot.hoverImageSrc ? slot.hoverImageSrc : slot.imageSrc}
              alt={restLabel}
              draggable={slot.externalHref ? false : undefined}
            />
          ) : (
            <div className="slot-label">
              <span>{slot.layer}</span>
              <small>{slot.ratio}</small>
            </div>
          )}
          {slot.externalHref && (
            <div className="external-project-notice" aria-hidden={!isHoverActive}>
              {slot.externalMessageFollowsTags
                ? isHoverActive && tagPosition && (
                  <span className="external-project-message">
                    {slot.externalMessage ?? "This project will open Instagram"}
                  </span>
                )
                : slot.externalMessage ?? "This project will open Instagram"}
            </div>
          )}
        </div>
      </SlotElement>
      {isClickable && slot.projectTags.length > 0 && (
        <span id={tagDescriptionId} hidden>
          Project tags: {slot.projectTags.join(", ")}
        </span>
      )}
      {isHoverActive &&
        tagPosition &&
        createPortal(
          <div
            ref={tagOverlayRef}
            className="project-tags"
            style={{
              left: tagPosition.left,
              top: tagPosition.top,
              width: tagPosition.width,
            }}
            aria-hidden="true"
          >
            <TagComponent label={slot.projectLabel} primary />
            {slot.projectTags.map((tag) => (
              <TagComponent label={tag} key={tag} />
            ))}
          </div>,
          document.body,
        )}
      {canExpand && (
        <DetailPageTransition
          disableExitMotion={disableExitMotion}
          isOpen={isExpanded}
          label={expandedLabel}
          labelledBy={detailTitleId}
          onClose={closeExpandedMedia}
          restoreFocus={restoreDetailTriggerFocus}
          className="expanded-media"
        >
          {slot.expandedTitle && (
            <div className="expanded-media-copy" data-detail-page-content data-detail-slug={slot.detailSlug}>
              <h2 className="display" id={detailTitleId}>{slot.expandedTitle}</h2>
              <DetailDescription
                lines={slot.expandedSubtitleLines}
                alternateLines={slot.alternateExpandedSubtitleLines}
              />
            </div>
          )}
          <div className="expanded-media-stream" data-detail-slug={slot.detailSlug}>
            {expandedMediaItems.map((mediaItem, itemIndex) => (
              <div
                className={`expanded-media-visual${isExpandedMediaGroup(mediaItem) ? " is-media-pair" : ""}`}
                key={
                  isExpandedMediaGroup(mediaItem)
                    ? mediaItem.assets.map(({ source }) => source).join("|")
                    : mediaItem.source
                }
              >
                {isExpandedMediaGroup(mediaItem) ? (
                  <div
                    className={`expanded-media-image-group is-pair${mediaItem.layout ? ` is-${mediaItem.layout}` : ""}`}
                    style={mediaItem.layout === "matched-height-pair" ? {
                      gridTemplateColumns: mediaItem.assets.map((asset) => {
                        const dimensions = asset.type === "image"
                          ? imageMetadata[asset.source]
                          : videoMetadata[asset.source];
                        return `minmax(0, ${dimensions.width / dimensions.height}fr)`;
                      }).join(" "),
                    } : undefined}
                  >
                    {mediaItem.assets.map((asset, mediaIndex) => (
                      asset.type === "video" ? (
                        <ExpandedVideo
                          autoPlay={asset.source === firstExpandedVideoSource}
                          bordered={asset.bordered}
                          initialTime={asset.initialTime}
                          playbackStartTime={asset.playbackStartTime}
                          prefetchInitialRange={asset.prefetchInitialRange}
                          source={asset.source}
                          label={`${expandedLabel}, item ${itemIndex + 1}, video ${mediaIndex + 1} of ${mediaItem.assets.length}`}
                          slotId={slot.id}
                          key={asset.source}
                        />
                      ) : (
                        <ExpandedImage
                          grouped
                          bordered={asset.bordered ?? slot.expandedImageBorder}
                          caption={asset.caption}
                          specifications={asset.specifications}
                          source={asset.source}
                          alt={asset.alt?.trim() || `${expandedLabel}, item ${itemIndex + 1}, image ${mediaIndex + 1} of ${mediaItem.assets.length}`}
                          onLoad={() => undefined}
                          onError={() => console.error(`Unable to load expanded media in slot ${slot.id}: ${asset.source}`)}
                          key={asset.source}
                        />
                      )
                    ))}
                  </div>
                ) : mediaItem.type === "video" ? (
                  <ExpandedVideo
                    autoPlay={mediaItem.source === firstExpandedVideoSource}
                    bordered={mediaItem.bordered}
                    initialTime={mediaItem.initialTime}
                    playbackStartTime={mediaItem.playbackStartTime}
                    prefetchInitialRange={mediaItem.prefetchInitialRange}
                    source={mediaItem.source}
                    label={`${expandedLabel}, video ${itemIndex + 1} of ${expandedMediaItems.length}`}
                    slotId={slot.id}
                  />
                ) : mediaItem.type === "image" ? (
                  <ExpandedImage
                    bordered={mediaItem.bordered ?? slot.expandedImageBorder}
                    caption={mediaItem.caption}
                    specifications={mediaItem.specifications}
                    source={mediaItem.source}
                    alt={mediaItem.alt?.trim() || `${expandedLabel} ${itemIndex + 1} of ${expandedMediaItems.length}`}
                    onLoad={() => undefined}
                    onError={() => console.error(`Unable to load expanded media in slot ${slot.id}: ${mediaItem.source}`)}
                  />
                ) : null}
              </div>
            ))}
          </div>
        </DetailPageTransition>
      )}
    </>
  );
}
