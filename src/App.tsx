import { useEffect, useState } from "react";
import { Navigation, type PageName } from "./components/Navigation";
import { DesktopPage } from "./pages/DesktopPage";
import { SimplePage } from "./pages/SimplePage";
import { useLandscapeScreenGuard } from "./hooks/useLandscapeScreenGuard";
import { portfolioRouteChangeEvent } from "./portfolioRouting";

function getPage(hash: string): PageName {
  const page = hash.replace("#/", "");
  return page === "about" ? page : "desktop";
}

export default function App() {
  const [routeHash, setRouteHash] = useState(() => window.location.hash);
  const activePage = getPage(routeHash);
  const isDesktopGallery = ["", "#", "#/", "#/desktop", "#/desktop/"].includes(routeHash);
  const isLandscapeScreenBlocked = useLandscapeScreenGuard(isDesktopGallery);
  const [desktopCloseRequest, setDesktopCloseRequest] = useState({
    disableExitMotion: false,
    id: 0,
  });
  const [isThemeInverted, setIsThemeInverted] = useState(false);

  useEffect(() => {
    const handleHashChange = () => setRouteHash(window.location.hash);
    window.addEventListener("hashchange", handleHashChange);
    window.addEventListener("popstate", handleHashChange);
    window.addEventListener(portfolioRouteChangeEvent, handleHashChange);
    return () => {
      window.removeEventListener("hashchange", handleHashChange);
      window.removeEventListener("popstate", handleHashChange);
      window.removeEventListener(portfolioRouteChangeEvent, handleHashChange);
    };
  }, []);

  useEffect(() => {
    if (isThemeInverted) {
      document.documentElement.dataset.theme = "inverted";
    } else {
      delete document.documentElement.dataset.theme;
    }
    const backgroundColor = getComputedStyle(document.documentElement)
      .getPropertyValue("--color-main-1").trim();
    document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
      ?.setAttribute("content", backgroundColor);
  }, [isThemeInverted]);

  if (isLandscapeScreenBlocked) {
    return (
      <main className="landscape-size-notice" role="alert">
        <p className="description-type-ramp">
          This content needs a larger screen. Rotate your device to portrait or switch to a device with a bigger screen
        </p>
      </main>
    );
  }

  return (
    <div className="app-shell">
      <Navigation
        activePage={activePage}
        isThemeInverted={isThemeInverted}
        onThemeToggle={() => setIsThemeInverted((isInverted) => !isInverted)}
        onPageSelect={(page, options) => {
          if (page === "desktop") {
            setDesktopCloseRequest((request) => ({
              disableExitMotion: options.disableDetailExitMotion,
              id: request.id + 1,
            }));
          }
        }}
      />
      {activePage === "desktop" ? (
        <DesktopPage closeDetailRequest={desktopCloseRequest} />
      ) : (
        <SimplePage title="About" />
      )}
    </div>
  );
}
