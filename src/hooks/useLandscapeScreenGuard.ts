import { useEffect, useState } from "react";

const landscapeQuery = "(orientation: landscape)";
const touchPrimaryQuery = "(hover: none) and (pointer: coarse)";

function shouldBlockLandscapeScreen() {
  if (typeof window === "undefined") return false;

  const isMobileOrTablet =
    /Android|iPhone|iPad|iPod|Mobile|Tablet/i.test(navigator.userAgent) ||
    // iPadOS can identify as a Mac, including when a trackpad is attached.
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) ||
    window.matchMedia(touchPrimaryQuery).matches;
  const viewportHeight = window.visualViewport?.height ?? window.innerHeight;

  return (
    isMobileOrTablet &&
    window.matchMedia(landscapeQuery).matches &&
    viewportHeight < 667
  );
}

export function useLandscapeScreenGuard(enabled: boolean) {
  const [isBlocked, setIsBlocked] = useState(shouldBlockLandscapeScreen);
  const isPageBlocked = enabled && isBlocked;

  useEffect(() => {
    const landscape = window.matchMedia(landscapeQuery);
    const touchPrimary = window.matchMedia(touchPrimaryQuery);
    const visualViewport = window.visualViewport;
    const update = () => setIsBlocked(shouldBlockLandscapeScreen());

    update();
    landscape.addEventListener("change", update);
    touchPrimary.addEventListener("change", update);
    window.addEventListener("resize", update);
    visualViewport?.addEventListener("resize", update);

    return () => {
      landscape.removeEventListener("change", update);
      touchPrimary.removeEventListener("change", update);
      window.removeEventListener("resize", update);
      visualViewport?.removeEventListener("resize", update);
    };
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("has-small-landscape-viewport", isPageBlocked);
    return () => document.documentElement.classList.remove("has-small-landscape-viewport");
  }, [isPageBlocked]);

  return isPageBlocked;
}
