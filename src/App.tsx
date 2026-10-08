import { useEffect, useState } from "react";
import { Navigation, type PageName } from "./components/Navigation";
import { DesktopPage } from "./pages/DesktopPage";
import { SimplePage } from "./pages/SimplePage";
import { useLandscapeScreenGuard } from "./hooks/useLandscapeScreenGuard";

function getPage(): PageName {
  const page = window.location.hash.replace("#/", "");
  return page === "about" ? page : "desktop";
}

export default function App() {
  const isLandscapeScreenBlocked = useLandscapeScreenGuard();
  const [activePage, setActivePage] = useState<PageName>(getPage);
  const [desktopCloseRequest, setDesktopCloseRequest] = useState({
    disableExitMotion: false,
    id: 0,
  });
  const [isThemeInverted, setIsThemeInverted] = useState(false);

  useEffect(() => {
    const handleHashChange = () => setActivePage(getPage());
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  useEffect(() => {
    if (isThemeInverted) {
      document.documentElement.dataset.theme = "inverted";
    } else {
      delete document.documentElement.dataset.theme;
    }
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