export const portfolioRouteChangeEvent = "portfolio:routechange";

// pushState/replaceState don't emit hashchange or popstate. Notify route
// consumers so detail views and page-level restrictions see the same URL.
export function navigatePortfolio(
  hash: string,
  options: { replace?: boolean; state?: unknown } = {},
) {
  if (window.location.hash === hash) return;
  if (options.replace) {
    window.history.replaceState(options.state ?? null, "", hash);
  } else {
    window.history.pushState(options.state ?? null, "", hash);
  }
  window.dispatchEvent(new Event(portfolioRouteChangeEvent));
}
