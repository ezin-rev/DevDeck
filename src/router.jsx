import { useEffect, useState } from "react";

// Everything lives under the site's base folder ("/" unless vite's base says otherwise).
export const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
export const href = (to) => (to === "/" ? `${BASE}/` : BASE + to);

// Old links from when this design lived at /aurora/… now open the same page at the top level.
const LEGACY = /^\/aurora(?=\/|$)/;
if (LEGACY.test(window.location.pathname)) {
  window.history.replaceState({}, "", href(window.location.pathname.replace(LEGACY, "") || "/") + window.location.search + window.location.hash);
}

const current = () => {
  let p = window.location.pathname;
  if (BASE && p.startsWith(BASE)) p = p.slice(BASE.length);
  p = p.replace(/\/+$/, "");
  return p || "/";
};

export function usePath() {
  const [path, setPath] = useState(current);
  useEffect(() => {
    const onPop = () => setPath(current());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  return path;
}

export function navigate(to) {
  if (to === current()) return;
  window.history.pushState({}, "", href(to));
  window.dispatchEvent(new PopStateEvent("popstate"));
  window.scrollTo(0, 0);
}

export function Link({ to, onClick, ...rest }) {
  return (
    <a
      href={href(to)}
      onClick={(e) => {
        onClick?.(e);
        if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        navigate(to);
      }}
      {...rest}
    />
  );
}
