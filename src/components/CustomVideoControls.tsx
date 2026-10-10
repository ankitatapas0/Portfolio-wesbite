import { useEffect, useId, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { activateVideoVolume, getVideoVolume, releaseVideoVolume, setVideoVolume as applyVideoVolume } from "./videoVolume";
import playIcon from "../assets/player-icons/play.svg";
import pauseIcon from "../assets/player-icons/pause.svg";
import volumeOnIcon from "../assets/player-icons/volume-on.svg";
import volumeMutedIcon from "../assets/player-icons/volume-muted.svg";
import enterIcon from "../assets/player-icons/fullscreen-enter.svg";
import exitIcon from "../assets/player-icons/fullscreen-exit.svg";

type Props = {
  videoRef: RefObject<HTMLVideoElement | null>;
  label: string;
  visible: boolean;
  showCenterAtRest: boolean;
  showToolbarWhilePaused: boolean;
  onPlaybackStarted: () => void;
  onPlaybackPaused: () => void;
  fullscreen: boolean;
  onToggleFullscreen: () => void;
  onManualVolume: () => void;
  onPlayError: (error: unknown) => void;
};

const formatTime = (value: number) => {
  const seconds = Math.floor(Number.isFinite(value) && value > 0 ? value : 0);
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
};

const formatAccessibleTime = (value: number) => {
  const tenths = Math.floor((Number.isFinite(value) && value > 0 ? value : 0) * 10);
  const minutes = Math.floor(tenths / 600);
  const seconds = (tenths % 600) / 10;
  return `${String(minutes).padStart(2, "0")}:${seconds.toFixed(1).padStart(4, "0")}`;
};

function Icon({ src }: { src: string }) {
  const url = `url("${src}")`;
  return <span className="cvc-icon" aria-hidden="true" style={{ maskImage: url, WebkitMaskImage: url } as CSSProperties} />;
}

export function CustomVideoControls({ videoRef, label, visible, showCenterAtRest, showToolbarWhilePaused, onPlaybackStarted, onPlaybackPaused, fullscreen, onToggleFullscreen, onManualVolume, onPlayError }: Props) {
  const [centerPressed, setCenterPressed] = useState(false);
  const volumePopupId = useId();
  const [paused, setPaused] = useState(true);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.5);
  const [muted, setMuted] = useState(false);
  const [volumeOpen, setVolumeOpen] = useState(false);
  const [volumeError, setVolumeError] = useState<string>();
  const volumeControlRef = useRef<HTMLDivElement>(null);
  const volumeDragPointer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!visible) setVolumeOpen(false);
  }, [visible]);

  useEffect(() => {
    if (!volumeOpen) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !volumeControlRef.current?.contains(event.target)) setVolumeOpen(false);
    };
    document.addEventListener("pointerdown", outside, true);
    return () => document.removeEventListener("pointerdown", outside, true);
  }, [volumeOpen]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const sync = () => {
      setPaused(video.paused);
      setTime(video.currentTime);
      setDuration(Number.isFinite(video.duration) ? video.duration : 0);
      setVolume(getVideoVolume(video));
      setMuted(video.muted);
    };
    const events = ["play", "pause", "timeupdate", "loadedmetadata", "durationchange", "volumechange", "seeked", "emptied"];
    events.forEach((name) => video.addEventListener(name, sync));
    sync();
    return () => {
      events.forEach((name) => video.removeEventListener(name, sync));
      releaseVideoVolume(video);
    };
  }, [videoRef]);

  const ready = duration > 0;
  const progress = ready ? Math.min(time / duration, 1) : 0;
  const seekTime = ready ? Math.min(time, duration) : 0;
  const activateVolume = (allowProbe = true) => {
    const video = videoRef.current;
    if (!video) return;
    void activateVideoVolume(video, allowProbe).then(() => setVolumeError(undefined)).catch((error: unknown) => {
      console.warn("Unable to activate video volume adjustment", error);
      setVolumeError("Volume adjustment is unavailable. Use your device’s volume buttons.");
    });
  };
  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      activateVolume(false);
      void video.play().then(() => {
      if (videoRef.current === video && !video.paused) onPlaybackStarted();
    }).catch(onPlayError);
    } else {
      video.pause();
      onPlaybackPaused();
    }
  };
  const setVideoVolume = (next: number) => {
    const video = videoRef.current;
    if (!video) return;
    onManualVolume();
    video.muted = next === 0;
    applyVideoVolume(video, next);
    activateVolume();
  };
  const changeVolumeAtPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    // Match the visible rail's 6px end insets, with a full-width touch target.
    const position = (bounds.bottom - 6 - event.clientY) / Math.max(1, bounds.height - 12);
    setVideoVolume(Math.round(Math.max(0, Math.min(1, position)) * 20) / 20);
  };
  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    setVolumeOpen(true);
    onManualVolume();
    activateVolume();
    if (video.muted || getVideoVolume(video) === 0) {
      video.muted = false;
      if (getVideoVolume(video) === 0) applyVideoVolume(video, 0.5);
    } else video.muted = true;
  };
  const silent = muted || volume === 0;
  const stop = { onClick: (e: { stopPropagation: () => void }) => e.stopPropagation() };

  return (
    <div className={`cvc${visible ? " is-visible" : ""}${showCenterAtRest ? " has-rest-button" : ""}${paused ? " is-paused" : ""}${visible && (!paused || showToolbarWhilePaused) ? " is-bar-visible" : ""}`} {...stop}>
      <button type="button" className={`cvc-center${centerPressed ? " is-pressed" : ""}`} data-testid="button-video-play"
        aria-label={`${paused ? "Play" : "Pause"} ${label}`} onClick={togglePlay}
        onPointerDown={() => setCenterPressed(true)}
        onPointerUp={() => setCenterPressed(false)}
        onPointerLeave={() => setCenterPressed(false)}
        onPointerCancel={() => setCenterPressed(false)}
        onBlur={() => setCenterPressed(false)}
        onKeyDown={event => {
          if (event.key === " " || event.key === "Enter") setCenterPressed(true);
        }}
        onKeyUp={() => setCenterPressed(false)}>
        <Icon src={paused ? playIcon : pauseIcon} />
      </button>
      <div className="cvc-bar">
        <div className="cvc-timeline">
        <span className="cvc-time" data-testid="text-video-time">{formatTime(time)} / {formatTime(duration)}</span>
        <div className="cvc-seek-track">
        <input className="cvc-range cvc-seek" type="range" min={0} max={ready ? duration : 1} step="any"
          value={seekTime} disabled={!ready} aria-label={`Seek ${label}`}
          aria-valuetext={`${formatAccessibleTime(seekTime)} of ${formatAccessibleTime(duration)}`}
          style={{ "--cvc-fill": `${progress * 100}%` } as CSSProperties}
          onInput={(e) => {
            const nextTime = Number(e.currentTarget.value);
            setTime(nextTime);
            const video = videoRef.current;
            if (video) video.currentTime = nextTime;
          }} />
        </div>
        </div>
        <div className="cvc-right">
          <div className="cvc-volume-control" ref={volumeControlRef}
            onPointerEnter={event => { if (event.pointerType === "mouse") setVolumeOpen(true); }}
             onPointerLeave={event => {
               if (event.pointerType !== "mouse") return;
               const focused = document.activeElement;
               if (
                 focused instanceof HTMLElement
                 && event.currentTarget.contains(focused)
                 && focused.matches(":focus-visible")
               ) return;
               setVolumeOpen(false);
             }}
            onFocusCapture={event => { if (event.target.matches(":focus-visible")) setVolumeOpen(true); }}
            onBlurCapture={event => {
              if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setVolumeOpen(false);
            }}>
            <button type="button" className="cvc-btn" data-testid="button-video-mute"
              aria-label={`Mute ${label}`}
              aria-pressed={silent}
              aria-expanded={volumeOpen}
              aria-controls={volumePopupId}
              onClick={toggleMute}>
              <Icon src={silent ? volumeMutedIcon : volumeOnIcon} />
            </button>
            <div id={volumePopupId} className={`cvc-volume-popup${volumeOpen ? " is-open" : ""}`}
              inert={!volumeOpen}>
              <div className="cvc-volume-slider"
                style={{ "--cvc-level": `${(silent ? 0 : volume) * 100}%` } as CSSProperties}
                  onPointerDown={(event) => {
                    if (event.pointerType === "mouse" && event.button !== 0) return;
                    event.preventDefault();
                    volumeDragPointer.current = event.pointerId;
                    event.currentTarget.setPointerCapture(event.pointerId);
                    changeVolumeAtPointer(event);
                  }}
                  onPointerMove={(event) => {
                    if (volumeDragPointer.current === event.pointerId) changeVolumeAtPointer(event);
                  }}
                  onPointerUp={(event) => {
                    if (volumeDragPointer.current !== event.pointerId) return;
                    changeVolumeAtPointer(event);
                    volumeDragPointer.current = undefined;
                    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
                  }}
                  onPointerCancel={() => { volumeDragPointer.current = undefined; }}>
                <div className="cvc-volume-rail" aria-hidden="true">
                  <span className="cvc-volume-fill" />
                  <span className="cvc-volume-thumb" />
                </div>
                <input className="cvc-volume" type="range" min={0} max={1} step={0.05}
                  value={silent ? 0 : volume} aria-label={`Volume for ${label}`} aria-orientation="vertical"
                  aria-valuetext={`${Math.round((silent ? 0 : volume) * 100)} percent`}
                  tabIndex={volumeOpen ? 0 : -1}
                  onChange={(e) => setVideoVolume(Number(e.target.value))} />
              </div>
            </div>
            {volumeOpen && volumeError && <div className="cvc-volume-error" role="status">{volumeError}</div>}
          </div>
          <button type="button" className="cvc-btn" data-testid="button-video-fullscreen"
            aria-label={fullscreen ? "Exit fullscreen" : "Enter fullscreen"} onClick={onToggleFullscreen}>
            <Icon src={fullscreen ? exitIcon : enterIcon} />
          </button>
        </div>
      </div>
    </div>
  );
}
