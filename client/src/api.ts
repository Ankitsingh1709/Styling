export const CATEGORIES = ["top", "bottom", "shoes"] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  top: "Upper body",
  bottom: "Lower body",
  shoes: "Shoes",
};

export interface Garment {
  id: number;
  category: Category;
  imageUrl: string;
  createdAt: string;
}

export async function listGarments(category?: Category): Promise<Garment[]> {
  const url = category ? `/api/garments?category=${category}` : "/api/garments";
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to load garments");
  return res.json();
}

export async function saveGarment(image: Blob, category: Category): Promise<Garment> {
  const form = new FormData();
  form.append("image", image, "garment.png");
  form.append("category", category);
  const res = await fetch("/api/garments", { method: "POST", body: form });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "Failed to save garment");
  }
  return res.json();
}

export async function deleteGarment(id: number): Promise<void> {
  const res = await fetch(`/api/garments/${id}`, { method: "DELETE" });
  if (!res.ok && res.status !== 204) throw new Error("Failed to delete garment");
}

// ---- Outfits ----

export interface Outfit {
  id: number;
  name: string | null;
  createdAt: string;
  top: Garment | null;
  bottom: Garment | null;
  shoes: Garment | null;
}

export async function listOutfits(): Promise<Outfit[]> {
  const res = await fetch("/api/outfits");
  if (!res.ok) throw new Error("Failed to load outfits");
  return res.json();
}

export async function saveOutfit(sel: {
  topId?: number | null;
  bottomId?: number | null;
  shoesId?: number | null;
  name?: string;
}): Promise<Outfit> {
  const res = await fetch("/api/outfits", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(sel),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "Failed to save outfit");
  }
  return res.json();
}

export async function renameOutfit(id: number, name: string): Promise<Outfit> {
  const res = await fetch(`/api/outfits/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error("Failed to rename outfit");
  return res.json();
}

export async function deleteOutfit(id: number): Promise<void> {
  const res = await fetch(`/api/outfits/${id}`, { method: "DELETE" });
  if (!res.ok && res.status !== 204) throw new Error("Failed to delete outfit");
}

// ---- Calendar (wears) ----

export interface Wear {
  date: string; // YYYY-MM-DD
  outfit: Outfit;
}

export async function listWears(): Promise<Wear[]> {
  const res = await fetch("/api/wears");
  if (!res.ok) throw new Error("Failed to load calendar");
  return res.json();
}

export async function setWear(date: string, outfitId: number): Promise<Wear> {
  const res = await fetch(`/api/wears/${date}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ outfitId }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "Failed to save to calendar");
  }
  return res.json();
}

export async function clearWear(date: string): Promise<void> {
  const res = await fetch(`/api/wears/${date}`, { method: "DELETE" });
  if (!res.ok && res.status !== 204) throw new Error("Failed to clear day");
}

// ---- AI stylist ----

/** An API failure that carries the HTTP status, so callers can react to it. */
export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/** A concrete outfit the stylist picked, with images already resolved. */
export interface StylistPick {
  kind: "saved" | "fresh";
  /** The saved outfit, when the stylist reused one. Null for a fresh combination. */
  outfit: Outfit | null;
  name: string | null;
  why: string;
  top: Garment | null;
  bottom: Garment | null;
  shoes: Garment | null;
}

export interface StylistReply {
  reply: string;
  pick: StylistPick | null;
  provider?: ProviderId;
}

// ---- AI providers (cloud vs. local) ----

export type ProviderId = "anthropic" | "local";

export interface ProviderStatus {
  id: ProviderId;
  label: string;
  /** The model this backend will use. */
  model: string;
  /** Has the configuration it needs. */
  configured: boolean;
  /** Reachable right now (key present / local server responding). */
  available: boolean;
  detail: string;
  active: boolean;
}

export interface ProviderList {
  active: ProviderId;
  providers: ProviderStatus[];
}

export async function listProviders(): Promise<ProviderList> {
  const res = await fetch("/api/ai/providers");
  if (!res.ok) throw new Error("Couldn't load AI providers");
  return res.json();
}

export async function setProvider(id: ProviderId): Promise<ProviderList> {
  const res = await fetch("/api/ai/provider", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  });
  if (!res.ok) throw new Error("Couldn't switch provider");
  return res.json();
}

export async function askStylist(
  messages: ChatMessage[],
  bodyType?: string | null,
): Promise<StylistReply> {
  const res = await fetch("/api/stylist", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, bodyType: bodyType ?? undefined }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(body.error ?? "The stylist couldn't answer", res.status);
  }
  return res.json();
}

/** Local YYYY-MM-DD (avoids the UTC shift of toISOString). */
export function ymd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
