export type Theme = "her" | "him" | "neutral";

export function getTheme(): Theme {
  try {
    const v = localStorage.getItem("theme");
    if (v === "her" || v === "him" || v === "neutral") return v;
  } catch {}
  return "her";
}

export function setTheme(t: Theme) {
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem("theme", t); } catch {}
  // Lets any mounted theme switch update its highlighted pill.
  try { window.dispatchEvent(new Event("fs-theme")); } catch {}
}
