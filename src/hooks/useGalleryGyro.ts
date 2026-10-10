import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { galleryDeviceMotionAngles, type GalleryDevicePose } from "../lib/galleryMotion";

type OrientationPermissionAPI = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<"granted" | "denied">;
};

function permissionApi() {
  return typeof window.DeviceOrientationEvent === "undefined"
    ? null
    : window.DeviceOrientationEvent as OrientationPermissionAPI;
}

export function useGalleryGyro(artboardRef: RefObject<HTMLElement | null>) {
  const [available, setAvailable] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [active, setActive] = useState(false);
  const mounted = useRef(false);
  const permissionRequested = useRef(false);
  const permissionGranted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateAvailability = () => {
      const supported = window.isSecureContext &&
        typeof window.DeviceOrientationEvent !== "undefined" && !reducedMotion.matches;
      setAvailable(supported);
      if (!supported) {
        setEnabled(false);
      }
    };
    updateAvailability();
    reducedMotion.addEventListener("change", updateAvailability);
    return () => {
      mounted.current = false;
      reducedMotion.removeEventListener("change", updateAvailability);
    };
  }, []);

  useEffect(() => {
    if (!available) return;
    const api = permissionApi();
    if (!api?.requestPermission || permissionGranted.current) {
      // Browsers without a gesture-gated API can start automatically. Reuse
      // any permission already granted if motion is re-enabled later.
      setEnabled(true);
    }
  }, [available]);

  useEffect(() => {
    const artboard = artboardRef.current;
    if (!enabled || !available || !artboard) {
      setActive(false);
      return;
    }

    let neutral: GalleryDevicePose | null = null;
    let pointerId: number | null = null;
    let frame: number | null = null;
    let receivedData = false;
    let suspended = document.hidden;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const blocked = () => suspended || document.hidden ||
      document.body.classList.contains("has-detail-page-open") ||
      document.documentElement.classList.contains("has-small-landscape-viewport") ||
      reducedMotion.matches;
    const reset = () => {
      neutral = null;
      artboard.classList.remove("is-gyro-active");
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
      artboard.style.setProperty("--camera-x", "0deg");
      artboard.style.setProperty("--camera-y", "0deg");
      artboard.style.setProperty("--camera-z", "0deg");
    };
    const onOrientation = (event: DeviceOrientationEvent) => {
      if (
        event.beta === null || event.gamma === null ||
        !Number.isFinite(event.beta) || !Number.isFinite(event.gamma)
      ) return;
      receivedData = true;
      if (blocked()) {
        reset();
        return;
      }
      if (pointerId !== null) {
        neutral = null;
        artboard.classList.remove("is-gyro-active");
        return;
      }
      setActive(true);
      const pose: GalleryDevicePose = {
        alpha: Number.isFinite(event.alpha) ? event.alpha : null,
        beta: event.beta,
        gamma: event.gamma,
      };
      neutral ??= pose;
      // If complete orientation arrives after partial startup data, calibrate
      // once in the complete frame rather than mixing two coordinate systems.
      if (neutral.alpha === null && pose.alpha !== null) neutral = pose;
      if (neutral.alpha !== null && pose.alpha === null) return;
      const screenAngle = window.screen.orientation?.angle ??
        (window as Window & { orientation?: number }).orientation ?? 0;
      const angles = galleryDeviceMotionAngles(pose, neutral, screenAngle);
      if (frame !== null) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        frame = null;
        if (blocked() || pointerId !== null) return;
        artboard.classList.add("is-gyro-active");
        artboard.style.setProperty("--camera-x", `${angles.yaw}deg`);
        artboard.style.setProperty("--camera-y", `${angles.tilt}deg`);
        artboard.style.setProperty("--camera-z", "0deg");
      });
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!event.isPrimary || event.button !== 0) return;
      pointerId = event.pointerId;
      neutral = null;
      artboard.classList.remove("is-gyro-active");
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
    };
    const onPointerEnd = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return;
      pointerId = null;
      neutral = null;
    };
    const onVisibilityChange = () => {
      suspended = document.hidden;
      pointerId = null;
      if (document.hidden) setActive(false);
      // A sensorless probe must not clear a pointer-driven camera position.
      if (receivedData) reset();
    };
    const onPageHide = () => {
      suspended = true;
      pointerId = null;
      setActive(false);
      if (receivedData) reset();
    };
    const onPageShow = () => {
      suspended = document.hidden;
      pointerId = null;
      setActive(false);
      if (receivedData) reset();
    };
    const observer = new MutationObserver(reset);
    observer.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    observer.observe(document.documentElement, {
      attributes: true, attributeFilter: ["class"],
    });
    const noDataTimeout = window.setTimeout(() => {
      if (receivedData || document.hidden) return;
      setEnabled(false);
      setAvailable(false);
      setActive(false);
    }, 5000);
    window.addEventListener("deviceorientation", onOrientation, { passive: true });
    window.addEventListener("orientationchange", reset);
    window.screen.orientation?.addEventListener?.("change", reset);
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("pageshow", onPageShow);
    reducedMotion.addEventListener("change", reset);
    artboard.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("pointerup", onPointerEnd);
    window.addEventListener("pointercancel", onPointerEnd);

    return () => {
      window.clearTimeout(noDataTimeout);
      observer.disconnect();
      window.removeEventListener("deviceorientation", onOrientation);
      window.removeEventListener("orientationchange", reset);
      window.screen.orientation?.removeEventListener?.("change", reset);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("pageshow", onPageShow);
      reducedMotion.removeEventListener("change", reset);
      artboard.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("pointerup", onPointerEnd);
      window.removeEventListener("pointercancel", onPointerEnd);
      // Preserve pointer movement if no sensor data ever reached this hook.
      if (receivedData) reset();
    };
  }, [enabled, available, artboardRef]);

  const requestEnableFromGesture = useCallback(async () => {
    if (!available || enabled || permissionRequested.current) return;
    const api = permissionApi();
    if (!api) return;
    if (!api.requestPermission) {
      permissionGranted.current = true;
      setEnabled(true);
      return;
    }
    permissionRequested.current = true;
    try {
      const permission = await api.requestPermission();
      if (!mounted.current) return;
      if (permission === "granted" &&
          !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        permissionGranted.current = true;
        setEnabled(true);
      }
    } catch {
      // Denied or unavailable motion leaves finger dragging intact, without UI.
    }
  }, [available, enabled]);

  useEffect(() => {
    if (!available || enabled || permissionRequested.current) return;
    const onFirstTap = (event: Event) => {
      if (!event.isTrusted || document.hidden ||
          document.body.classList.contains("has-detail-page-open") ||
          document.documentElement.classList.contains("has-small-landscape-viewport") ||
          window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      // iOS touch activation occurs at touchend, not touch pointerdown.
      // Call the native API synchronously from the gesture; don't defer it.
      void requestEnableFromGesture();
    };
    document.addEventListener("touchend", onFirstTap, { capture: true, passive: true });
    document.addEventListener("click", onFirstTap, true);
    return () => {
      document.removeEventListener("touchend", onFirstTap, true);
      document.removeEventListener("click", onFirstTap, true);
    };
  }, [available, enabled, requestEnableFromGesture]);

  return { active };
}
