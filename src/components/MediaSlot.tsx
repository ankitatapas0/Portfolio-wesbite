import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { extraSmallViewportQuery } from "../breakpoints";
import { DetailPageTransition } from "./DetailPageTransition";
import { TagComponent } from "./tag_component";

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
  initialTime?: number;
  source: string;
  type: "image" | "video";
};

export type ExpandedMediaSlide = ExpandedMediaAsset[] | {
  assets: ExpandedMediaAsset[];
  layout: "fountain-pair" | "spatial-pair" | "wide-image";
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
  grouped = false,
  onError,
  onLoad,
  source,
  transitionClass = "",
}: ExpandedImageProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const fullscreenAnimationTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const wasFullscreenRef = useRef(false);
  const [aspectRatio, setAspectRatio] = useState<number | null>(null);
  const [isFullscreenEntering, setIsFullscreenEntering] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isTouchControlVisible, setIsTouchControlVisible] = useState(false);
  const style: ExpandedImageStyle | undefined = aspectRatio
    ? {
        aspectRatio,
        "--expanded-image-height": `${100 / aspectRatio}cqw`,
        "--expanded-image-width": `${aspectRatio * 100}cqh`,
      }
    : undefined;

  useEffect(() => {
    const updateFullscreenState = () => {
      const isCurrentImageFullscreen = document.fullscreenElement === frameRef.current;
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
      }
      wasFullscreenRef.current = isCurrentImageFullscreen;
    };

    document.addEventListener("fullscreenchange", updateFullscreenState);
    return () => {
      document.removeEventListener("fullscreenchange", updateFullscreenState);
      if (fullscreenAnimationTimeoutRef.current !== undefined) {
        clearTimeout(fullscreenAnimationTimeoutRef.current);
      }
    };
  }, []);

  const toggleFullscreenImage = () => {
    const frame = frameRef.current;
    if (!frame?.requestFullscreen || !document.exitFullscreen) {
      console.error(`Fullscreen images are not supported for ${source}.`);
      return;
    }

    if (document.fullscreenElement === frame) {
      document.exitFullscreen().catch((error: unknown) => {
        console.error(`Unable to exit image fullscreen: ${source}`, error);
      });
    } else {
      frame.requestFullscreen().catch((error: unknown) => {
        console.error(`Unable to show image fullscreen: ${source}`, error);
      });
    }
    setIsTouchControlVisible(false);
  };

  return (
    <div
      ref={frameRef}
      className={`expanded-media-image-frame${grouped ? " is-grouped" : ""}${aspectRatio ? " is-ready" : ""}${isTouchControlVisible ? " is-fullscreen-control-visible" : ""}${isFullscreenEntering ? " is-fullscreen-entering" : ""}${transitionClass}`}
      data-detail-page-content
      style={style}
      onPointerDown={(event) => {
        if (event.pointerType === "touch") setIsTouchControlVisible(true);
      }}
    >
      <img
        ref={imageRef}
        src={source}
        alt={alt}
        onLoad={(event) => {
          const image = event.currentTarget;
          setAspectRatio(image.naturalWidth / image.naturalHeight);
          onLoad();
        }}
        onError={onError}
      />
      <button
        className="expanded-image-fullscreen"
        type="button"
        aria-label={`${isFullscreen ? "Exit fullscreen for" : "View"} ${alt}${isFullscreen ? "" : " fullscreen"}`}
        onClick={toggleFullscreenImage}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            d={
              isFullscreen
                ? "M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"
                : "M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"
            }
          />
        </svg>
      </button>
    </div>
  );
}

type ExpandedVideoProps = {
  autoPlay: boolean;
  initialTime?: number;
  label: string;
  slotId: string;
  source: string;
};

function ExpandedVideo({
  autoPlay,
  initialTime = 0,
  label,
  slotId,
  source,
}: ExpandedVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioFadeFrameRef = useRef<number | undefined>(undefined);
  const hasUserAdjustedVolumeRef = useRef(false);
  const isApplyingSharedVolumeRef = useRef(false);
  const isPointerOverRef = useRef(false);
  const shouldRestartOnFirstPlayRef = useRef(initialTime > 0);
  const [supportsHover, setSupportsHover] = useState(
    () => typeof window !== "undefined"
      && window.matchMedia("(hover: hover) and (pointer: fine)").matches,
  );
  const [showControls, setShowControls] = useState(() => !supportsHover);
  const initializeVideo = useCallback((video: HTMLVideoElement | null) => {
    videoRef.current = video;
    if (!video) return;

    const preferences = loadMediaVolumePreferences();
    hasUserAdjustedVolumeRef.current = false;
    isApplyingSharedVolumeRef.current = true;
    video.volume = autoPlay
      ? Math.min(audioFadeStartVolume, preferences.volume)
      : preferences.volume;
    video.muted = preferences.muted;
  }, [autoPlay]);

  useEffect(() => {
    const hoverQuery = window.matchMedia("(hover: hover) and (pointer: fine)");
    const updateHoverSupport = () => {
      setSupportsHover(hoverQuery.matches);
      setShowControls(!hoverQuery.matches);
    };
    hoverQuery.addEventListener("change", updateHoverSupport);
    return () => hoverQuery.removeEventListener("change", updateHoverSupport);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const preferences = loadMediaVolumePreferences();
    isApplyingSharedVolumeRef.current = true;
    const fadeStartVolume = Math.min(audioFadeStartVolume, preferences.volume);
    video.volume = autoPlay ? fadeStartVolume : preferences.volume;
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
          if (hasUserAdjustedVolumeRef.current) return;

          isApplyingSharedVolumeRef.current = true;
          const fadeStartedAt = performance.now();
          const fadeIn = (now: number) => {
            const fadeProgress = Math.min(Math.max((now - fadeStartedAt) / 3000, 0), 1);
            video.volume = fadeStartVolume + (preferences.volume - fadeStartVolume) * fadeProgress;
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
          if (error instanceof DOMException && error.name === "AbortError" && video.paused) return;
          console.error(`Unable to play expanded video in slot ${slotId}.`, error);
        });
    };

    const applySharedVolume = (event: Event) => {
      const preferences = (event as CustomEvent<MediaVolumePreferences>).detail;
      stopAudioFade();
      isApplyingSharedVolumeRef.current = true;
      video.volume = preferences.volume;
      video.muted = preferences.muted;
      requestAnimationFrame(() => {
        isApplyingSharedVolumeRef.current = false;
      });
    };

    const scrollRoot = video.closest<HTMLElement>(".detail-page-transition-backdrop");
    let visibleRatio: number | null = null;
    const pauseIfMostlyOutsideViewport = (intersectionRatio: number) => {
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
    const handlePlay = () => {
      if (shouldRestartOnFirstPlayRef.current) {
        shouldRestartOnFirstPlayRef.current = false;
        video.currentTime = 0;
      }

      const previousVideo = activeExpandedVideo;
      activeExpandedVideo = video;
      if (previousVideo && previousVideo !== video) {
        previousVideo.pause();
      }

      if (visibleRatio !== null) {
        pauseIfMostlyOutsideViewport(visibleRatio);
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
  }, [autoPlay, slotId, source]);

  const beginManualVolumeAdjustment = () => {
    hasUserAdjustedVolumeRef.current = true;
    if (audioFadeFrameRef.current !== undefined) {
      cancelAnimationFrame(audioFadeFrameRef.current);
      audioFadeFrameRef.current = undefined;
    }
    isApplyingSharedVolumeRef.current = false;
  };

  return (
    <video
      ref={initializeVideo}
      data-detail-page-content
      src={source}
      loop
      playsInline
      preload="metadata"
      controls={showControls}
      controlsList="nodownload"
      aria-label={label}
      tabIndex={0}
      onPointerEnter={() => {
        isPointerOverRef.current = true;
        if (supportsHover) setShowControls(true);
      }}
      onPointerLeave={(event) => {
        isPointerOverRef.current = false;
        if (supportsHover && event.currentTarget !== document.activeElement) {
          setShowControls(false);
        }
      }}
      onFocus={() => setShowControls(true)}
      onBlur={() => {
        if (supportsHover && !isPointerOverRef.current) setShowControls(false);
      }}
      onLoadedMetadata={(event) => {
        const video = event.currentTarget;
        const preferences = loadMediaVolumePreferences();
        video.currentTime = initialTime;
        shouldRestartOnFirstPlayRef.current = initialTime > 0;
        isApplyingSharedVolumeRef.current = true;
        video.volume = autoPlay
          ? Math.min(audioFadeStartVolume, preferences.volume)
          : preferences.volume;
        video.muted = preferences.muted;
        if (!autoPlay) {
          requestAnimationFrame(() => {
            isApplyingSharedVolumeRef.current = false;
          });
        }
      }}
      onPointerDownCapture={beginManualVolumeAdjustment}
      onKeyDownCapture={beginManualVolumeAdjustment}
      onError={() => console.error(`Unable to load expanded media in slot ${slotId}: ${source}`)}
      onVolumeChange={(event) => {
        if (isApplyingSharedVolumeRef.current) return;
        saveMediaVolumePreferences({
          volume: event.currentTarget.volume,
          muted: event.currentTarget.muted,
        });
      }}
    />
  );
}

type ExpandedMediaGroup = {
  assets: ExpandedMediaAsset[];
  layout?: "fountain-pair" | "spatial-pair" | "wide-image";
  type: "group";
};

type ExpandedMediaItem = ExpandedMediaAsset | ExpandedMediaGroup;

function isExpandedMediaGroup(item: ExpandedMediaItem): item is ExpandedMediaGroup {
  return item.type === "group";
}

export function MediaSlot({ closeDetailRequest, slot }: MediaSlotProps) {
  const detailHash = slot.detailSlug ? `#/desktop/${slot.detailSlug}` : undefined;
  const articleRef = useRef<HTMLElement>(null);
  const tagOverlayRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hoverIntentTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [isExpanded, setIsExpanded] = useState(
    () => Boolean(detailHash && window.location.hash === detailHash),
  );
  const [disableExitMotion, setDisableExitMotion] = useState(false);
  const [isHoverActive, setIsHoverActive] = useState(false);
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
        if (!isExpandedMediaGroup(item)) return [item];
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
    videoRef.current.play().catch((error: unknown) => {
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
    prepareHoverLayout();
    setIsHoverActive(true);
  };

  const canExpand = expandedMediaItems.length > 0;
  const hasHoverVideoCrossfade = Boolean(slot.imageSrc && slot.hoverVideoSrc && !slot.videoSrc);
  const activeVideoSrc = slot.videoSrc ?? (isHoverActive ? slot.hoverVideoSrc : undefined);
  const restLabel = slot.restLabel ?? "Portfolio media";
  const expandedLabel = slot.expandedLabel ?? "Expanded portfolio media";

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
    return () => window.removeEventListener("hashchange", syncExpandedStateWithRoute);
  }, [canExpand, detailHash]);

  const openExpandedMedia = () => {
    if (!detailHash) {
      console.error(`Missing detail route for expandable slot ${slot.id}.`);
      return;
    }

    setDisableExitMotion(false);
    if (window.location.hash !== detailHash) {
      window.history.pushState(
        { ...window.history.state, portfolioDetail: true },
        "",
        detailHash,
      );
    }
    setIsExpanded(true);
  };
  const closeExpandedMedia = () => {
    if (
      detailHash
      && window.location.hash === detailHash
      && window.history.state?.portfolioDetail
    ) {
      window.history.back();
      return;
    }

    if (window.location.hash !== "#/desktop") {
      window.history.replaceState(null, "", "#/desktop");
    }
    setIsExpanded(false);
  };

  return (
    <>
      <article
        ref={articleRef}
        className={`media-slot slot-${slot.id} layer-${slot.layer}${canExpand ? " is-clickable" : ""}${isHoverActive ? " is-hovered" : ""}${isHoverVideoReady ? " is-hover-video-ready" : ""}`}
        onMouseEnter={() => {
          cancelHoverIntent();
          hoverIntentTimeoutRef.current = setTimeout(() => {
            hoverIntentTimeoutRef.current = undefined;
            activateHover();
            if (slot.videoSrc || slot.hoverVideoSrc) playVideo();
          }, 400);
        }}
        onMouseLeave={() => {
          cancelHoverIntent();
          setIsHoverActive(false);
          if (slot.videoSrc || slot.hoverVideoSrc) resetVideo();
        }}
        onFocus={() => {
          cancelHoverIntent();
          activateHover();
          if (slot.videoSrc || slot.hoverVideoSrc) playVideo();
        }}
        onBlur={() => {
          cancelHoverIntent();
          setIsHoverActive(false);
          if (slot.videoSrc || slot.hoverVideoSrc) resetVideo();
        }}
        onClick={canExpand ? openExpandedMedia : undefined}
        onKeyDown={
          canExpand
            ? (event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  openExpandedMedia();
                }
              }
            : undefined
        }
        role={canExpand ? "button" : undefined}
        tabIndex={canExpand ? 0 : undefined}
        aria-label={canExpand ? `Open ${expandedLabel}` : undefined}
      >
        <div className={`media-visual${hasHoverVideoCrossfade ? " has-hover-video" : ""}`}>
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
                src={slot.hoverVideoSrc}
                muted
                loop
                playsInline
                preload="auto"
                aria-hidden="true"
                onCanPlay={() => setIsHoverVideoReady(true)}
                onError={() => {
                  setIsHoverVideoReady(false);
                  console.error(`Unable to load hover video in slot ${slot.id}: ${slot.hoverVideoSrc}`);
                }}
              />
            </>
          ) : activeVideoSrc ? (
            <video
              ref={videoRef}
              src={activeVideoSrc}
              muted
              loop
              playsInline
              preload="auto"
              autoPlay={!slot.videoSrc && Boolean(slot.hoverVideoSrc)}
              aria-label={restLabel}
            />
          ) : slot.imageSrc ? (
            <img
              src={isHoverActive && slot.hoverImageSrc ? slot.hoverImageSrc : slot.imageSrc}
              alt={restLabel}
            />
          ) : (
            <div className="slot-label">
              <span>{slot.layer}</span>
              <small>{slot.ratio}</small>
            </div>
          )}
        </div>
      </article>
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
          onClose={closeExpandedMedia}
          className="expanded-media"
        >
          {slot.expandedTitle && (
            <div className="expanded-media-copy" data-detail-page-content>
              <h2 className="display">{slot.expandedTitle}</h2>
              {slot.expandedSubtitleLines?.map((line) => <p className="body" key={line}>{line}</p>)}
              {slot.alternateExpandedSubtitleLines?.map((line) => <p className="body" key={line}>{line}</p>)}
            </div>
          )}
          <div className="expanded-media-stream">
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
                  >
                    {mediaItem.assets.map((asset, mediaIndex) => (
                      asset.type === "video" ? (
                        <ExpandedVideo
                          autoPlay={asset.source === firstExpandedVideoSource}
                          initialTime={asset.initialTime}
                          source={asset.source}
                          label={`${expandedLabel}, item ${itemIndex + 1}, video ${mediaIndex + 1} of ${mediaItem.assets.length}`}
                          slotId={slot.id}
                          key={asset.source}
                        />
                      ) : (
                        <ExpandedImage
                          grouped
                          source={asset.source}
                          alt={`${expandedLabel}, item ${itemIndex + 1}, image ${mediaIndex + 1} of ${mediaItem.assets.length}`}
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
                    initialTime={mediaItem.initialTime}
                    source={mediaItem.source}
                    label={`${expandedLabel}, video ${itemIndex + 1} of ${expandedMediaItems.length}`}
                    slotId={slot.id}
                  />
                ) : mediaItem.type === "image" ? (
                  <ExpandedImage
                    source={mediaItem.source}
                    alt={`${expandedLabel} ${itemIndex + 1} of ${expandedMediaItems.length}`}
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