// Navigation minimale par l'URL (History API) : adresses lisibles et partageables, sans dépendance.
// Firebase Hosting renvoie index.html pour toute adresse (réécriture « ** »).
import { useEffect, useState, type AnchorHTMLAttributes } from "react";

const CHANGE = "tkd:navigate";

export function usePath(): string {
  const [path, setPath] = useState(() => window.location.pathname);
  useEffect(() => {
    const update = () => setPath(window.location.pathname);
    window.addEventListener("popstate", update);
    window.addEventListener(CHANGE, update);
    return () => {
      window.removeEventListener("popstate", update);
      window.removeEventListener(CHANGE, update);
    };
  }, []);
  return path;
}

export function navigate(to: string, options: { replace?: boolean } = {}) {
  if (to === window.location.pathname) return;
  if (options.replace) window.history.replaceState(null, "", to);
  else window.history.pushState(null, "", to);
  window.dispatchEvent(new Event(CHANGE));
  window.scrollTo(0, 0);
}

export function Link({ to, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) {
  return (
    <a href={to} {...props} onClick={(event) => {
      props.onClick?.(event);
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      navigate(to);
    }} />
  );
}

/** « /competitions/:cid » appliqué à « /competitions/gp » → { cid: "gp" } ; null si l'adresse ne correspond pas. */
export function matchPath(pattern: string, path: string): Record<string, string> | null {
  const expected = pattern.split("/").filter(Boolean);
  const actual = path.split("/").filter(Boolean);
  if (expected.length !== actual.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < expected.length; i += 1) {
    if (expected[i].startsWith(":")) params[expected[i].slice(1)] = decodeURIComponent(actual[i]);
    else if (expected[i] !== actual[i]) return null;
  }
  return params;
}
