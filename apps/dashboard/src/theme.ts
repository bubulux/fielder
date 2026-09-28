import { useEffect, useState } from "preact/hooks";

/** "auto" follows the OS; "sun" (light, for daylight) and "set" (dark) are manual overrides kept in localStorage. */
export type ThemeChoice = "auto" | "sun" | "set";

const mq = () => window.matchMedia?.("(prefers-color-scheme: dark)");
function stored(): ThemeChoice {
  try { const v = localStorage.getItem("theme"); return v === "sun" || v === "set" ? v : "auto"; } catch { return "auto"; }
}
function apply(choice: ThemeChoice) {
  const t = choice === "auto" ? (mq()?.matches ? "set" : "sun") : choice;
  document.documentElement.setAttribute("data-theme", t);
}

/** The inline script in index.html sets the theme before first paint; this keeps it in sync afterwards. */
export function useTheme(): [ThemeChoice, (c: ThemeChoice) => void] {
  const [choice, setChoice] = useState<ThemeChoice>(stored);
  useEffect(() => {
    apply(choice);
    if (choice !== "auto") return;
    const m = mq();
    const on = () => apply("auto");
    m?.addEventListener("change", on);
    return () => m?.removeEventListener("change", on);
  }, [choice]);
  const set = (c: ThemeChoice) => {
    try { if (c === "auto") localStorage.removeItem("theme"); else localStorage.setItem("theme", c); } catch { /* ignore */ }
    setChoice(c);
  };
  return [choice, set];
}
