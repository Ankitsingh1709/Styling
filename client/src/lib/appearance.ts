import { createContext, useContext } from "react";

/**
 * Light and dark are equal first-class appearances (iOS treats them that way),
 * and the use scene demands both: this app is opened at a wardrobe in morning
 * light and in bed at night planning tomorrow. "system" follows the OS; the
 * other two are the user's explicit override.
 */
export type Appearance = "system" | "light" | "dark";

const KEY = "wardrobe.appearance";

export function loadAppearance(): Appearance {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" || v === "system" ? v : "system";
  } catch {
    return "system";
  }
}

export function persistAppearance(v: Appearance) {
  try {
    localStorage.setItem(KEY, v);
  } catch {
    /* storage may be unavailable (private mode); ignore */
  }
}

/**
 * Stamp the choice on <html>. "system" removes the attribute so the CSS falls
 * through to prefers-color-scheme rather than freezing one appearance in.
 */
export function applyAppearance(v: Appearance) {
  const root = document.documentElement;
  if (v === "system") root.removeAttribute("data-appearance");
  else root.setAttribute("data-appearance", v);
}

export const AppearanceContext = createContext<{
  appearance: Appearance;
  setAppearance: (v: Appearance) => void;
}>({ appearance: "system", setAppearance: () => {} });

export const useAppearance = () => useContext(AppearanceContext);
