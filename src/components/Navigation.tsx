import { useEffect, useState } from "react";

export type PageName = "desktop" | "about";

type NavigationProps = {
  activePage: PageName;
  isThemeInverted: boolean;
  onPageSelect?: (
    page: PageName,
    options: { disableDetailExitMotion: boolean },
  ) => void;
  onThemeToggle: () => void;
  pages?: PageName[];
};

const defaultPages: PageName[] = ["desktop", "about"];

export function Navigation({
  activePage,
  isThemeInverted,
  onPageSelect,
  onThemeToggle,
  pages = defaultPages,
}: NavigationProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  useEffect(() => {
    setIsMenuOpen(false);
  }, [activePage]);

  useEffect(() => {
    if (!isMenuOpen) return;

    const previousOverflow = document.body.style.overflow;
    const closeMenu = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsMenuOpen(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeMenu);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeMenu);
    };
  }, [isMenuOpen]);

  useEffect(() => {
    const extraSmallQuery = window.matchMedia("(max-width: 719.98px)");
    const closeMenuAboveExtraSmall = () => {
      if (!extraSmallQuery.matches) setIsMenuOpen(false);
    };
    extraSmallQuery.addEventListener("change", closeMenuAboveExtraSmall);
    return () => extraSmallQuery.removeEventListener("change", closeMenuAboveExtraSmall);
  }, []);

  return (
    <header className="site-header">
      <button
        className="theme-toggle"
        type="button"
        aria-label={isThemeInverted ? "Switch to dark theme" : "Switch to light theme"}
        aria-pressed={isThemeInverted}
        onClick={onThemeToggle}
      />
      <nav
        id="primary-navigation"
        className={`site-nav${isMenuOpen ? " is-open" : ""}`}
        aria-label="Primary navigation"
      >
        {pages.map((page) => (
          <a
            key={page}
            className={
              page !== "about" && activePage === page
                ? "nav-link nav-tabs-type-ramp is-active"
                : "nav-link nav-tabs-type-ramp"
            }
            data-label={page}
            href={
              page === "about"
                ? "https://www.linkedin.com/in/ankita-panda-421022143/"
                : `#/${page}`
            }
            target={page === "about" ? "_blank" : undefined}
            rel={page === "about" ? "noreferrer" : undefined}
            aria-current={
              page !== "about" && activePage === page ? "page" : undefined
            }
            onClick={() => {
              const disableDetailExitMotion = isMenuOpen;
              setIsMenuOpen(false);
              onPageSelect?.(page, { disableDetailExitMotion });
            }}
          >
            <span className="nav-link-text">{page}</span>
          </a>
        ))}
        <a
          className="nav-link nav-tabs-type-ramp"
          data-label="instagram"
          href="https://www.instagram.com/ankitaaa.gif/"
          target="_blank"
          rel="noreferrer"
          onClick={() => setIsMenuOpen(false)}
        >
          <span className="nav-link-text">instagram</span>
        </a>
      </nav>
      <button
        className={`menu-toggle${isMenuOpen ? " is-open" : ""}`}
        type="button"
        aria-label={isMenuOpen ? "Close navigation menu" : "Open navigation menu"}
        aria-controls="primary-navigation"
        aria-expanded={isMenuOpen}
        onClick={() => setIsMenuOpen((isOpen) => !isOpen)}
      >
        <span className="menu-toggle-icon" aria-hidden="true" />
      </button>
    </header>
  );
}