import type { GarmentAnalysisResult, StylistResult } from "./schemas.js";

export const PROVIDER_IDS = ["anthropic", "local"] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

export function isProviderId(v: unknown): v is ProviderId {
  return typeof v === "string" && (PROVIDER_IDS as readonly string[]).includes(v);
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

/**
 * One AI backend. The app talks to this interface only, so switching between
 * Claude and a model running on the user's own machine changes nothing above
 * this line.
 */
export interface AiProvider {
  readonly id: ProviderId;
  readonly label: string;
  /** Which model this backend will use — shown in the UI. */
  describeModel(): string;
  /** Does it have the configuration it needs to be worth trying? */
  isConfigured(): boolean;
  /** Live reachability check (key present / server responding). */
  checkAvailable(): Promise<{ ok: boolean; detail: string }>;
  /** Vision: describe one garment cutout (base64 PNG). */
  describeGarment(pngBase64: string): Promise<GarmentAnalysisResult>;
  /** Text: pick an outfit from the catalog in the system prompt. */
  suggestOutfit(system: string, messages: ChatTurn[]): Promise<StylistResult>;
}

/** Thrown when a provider isn't usable — distinct from a call that failed. */
export class ProviderUnavailableError extends Error {}
