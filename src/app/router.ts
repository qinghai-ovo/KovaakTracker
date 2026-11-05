import { useEffect, useState } from "react";

export type RouteName = "today" | "map" | "journal" | "data" | "settings";

export interface Route {
  name: RouteName;
  /** Optional scenario name, e.g. #/map/Micro%20Flick */
  param: string | null;
}

const NAMES: RouteName[] = ["today", "map", "journal", "data", "settings"];

export function parseHash(hash: string): Route {
  const [, name = "", param] = hash.replace(/^#/, "").split("/");
  const routeName = NAMES.includes(name as RouteName) ? (name as RouteName) : "today";
  return { name: routeName, param: param ? decodeURIComponent(param) : null };
}

export function routeHref(name: RouteName, param?: string | null): string {
  return `#/${name}${param ? `/${encodeURIComponent(param)}` : ""}`;
}

/** Minimal hash router: no dependency, works from file:// and inside a Tauri webview. */
export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseHash(window.location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash));
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}

export function navigate(name: RouteName, param?: string | null) {
  window.location.hash = routeHref(name, param);
}
