import { createContext, useContext } from "react";

export type BodyType = "male" | "female";

const KEY = "wardrobe.bodyType";

/** Read the saved body type (per-browser). Null if not chosen yet. */
export function loadBodyType(): BodyType | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === "male" || v === "female" ? v : null;
  } catch {
    return null;
  }
}

export function persistBodyType(v: BodyType) {
  try {
    localStorage.setItem(KEY, v);
  } catch {
    /* storage may be unavailable (private mode); ignore */
  }
}

export const BodyTypeContext = createContext<{
  bodyType: BodyType | null;
  choose: (b: BodyType) => void;
}>({ bodyType: null, choose: () => {} });

export const useBodyType = () => useContext(BodyTypeContext);
