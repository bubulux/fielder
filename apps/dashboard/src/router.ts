import { useEffect, useState } from "preact/hooks";

export type Stage = "photo" | "rigs" | "position" | "compose";
export type LibrarySection = "projects" | "fields" | "rigs" | "locations";
export const LIBRARY_SECTIONS: readonly LibrarySection[] = ["projects", "fields", "rigs", "locations"];

/** Everything the URL hash can address, so deep links survive a reload. */
export type Route =
  | { page: "shots"; viewId: string | null }
  | { page: "shot"; shotId: string; stage: Stage }
  | { page: "review" }
  | { page: "plan"; dayId: string | null }
  | { page: "timeline"; timelineId: string | null }
  | { page: "library"; section: LibrarySection; id: string | null };

export const DEFAULT_ROUTE: Route = { page: "shots", viewId: null };

export function parseRoute(hash: string): Route {
  const [path, query = ""] = hash.replace(/^#\/?/, "").split("?");
  const q = new URLSearchParams(query);
  const parts = path.split("/").filter(Boolean).map(decodeURIComponent);
  switch (parts[0]) {
    case "shots":
      if (parts[1]) {
        const st = q.get("stage");
        return { page: "shot", shotId: parts[1], stage: st === "rigs" || st === "position" || st === "compose" ? st : "photo" };
      }
      return { page: "shots", viewId: q.get("view") };
    case "review": return { page: "review" };
    case "plan": return { page: "plan", dayId: parts[1] ?? null };
    case "timeline": return { page: "timeline", timelineId: parts[1] ?? null };
    case "library": {
      const section = (LIBRARY_SECTIONS as readonly string[]).includes(parts[1]) ? (parts[1] as LibrarySection) : "projects";
      return { page: "library", section, id: parts[2] ?? null };
    }
    default: return DEFAULT_ROUTE;
  }
}

export function routeHash(r: Route): string {
  switch (r.page) {
    case "shots": return r.viewId ? `#/shots?view=${r.viewId}` : "#/shots";
    case "shot": return `#/shots/${r.shotId}${r.stage === "photo" ? "" : `?stage=${r.stage}`}`;
    case "review": return "#/review";
    case "plan": return r.dayId ? `#/plan/${r.dayId}` : "#/plan";
    case "timeline": return r.timelineId ? `#/timeline/${r.timelineId}` : "#/timeline";
    case "library": return `#/library/${r.section}${r.id ? `/${r.id}` : ""}`;
  }
}

/** The current route; `navigate` pushes a history entry, `replace` does not. */
export function useRoute(): [Route, (r: Route) => void, (r: Route) => void] {
  const [route, setRoute] = useState<Route>(() => parseRoute(location.hash));
  useEffect(() => {
    const on = () => setRoute(parseRoute(location.hash));
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  const navigate = (r: Route) => { const h = routeHash(r); if (h !== location.hash) location.hash = h; else setRoute(r); };
  const replace = (r: Route) => { history.replaceState(null, "", routeHash(r)); setRoute(r); };
  return [route, navigate, replace];
}
