import { db } from "../db.js";
import { DEFAULT_AI_PROVIDER } from "../config.js";
import { anthropicProvider } from "./anthropic.js";
import { localProvider } from "./local.js";
import {
  isProviderId,
  ProviderUnavailableError,
  PROVIDER_IDS,
  type AiProvider,
  type ProviderId,
} from "./types.js";

export { describeAiError } from "./anthropic.js";
export { ProviderUnavailableError } from "./types.js";
export type { ProviderId, ChatTurn } from "./types.js";

const PROVIDERS: Record<ProviderId, AiProvider> = {
  anthropic: anthropicProvider,
  local: localProvider,
};

const SETTING_KEY = "ai.provider";

/**
 * Which backend is in use. Persisted in SQLite rather than held in memory so
 * the choice survives a restart, and so garment tagging (which runs in the
 * background) and the stylist chat always agree on it.
 */
export function getActiveProviderId(): ProviderId {
  const row = db
    .prepare("SELECT value FROM settings WHERE key = ?")
    .get(SETTING_KEY) as unknown as { value: string } | undefined;
  if (row && isProviderId(row.value)) return row.value;
  return DEFAULT_AI_PROVIDER;
}

export function setActiveProviderId(id: ProviderId) {
  db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(SETTING_KEY, id);
}

export function getProvider(id: ProviderId = getActiveProviderId()): AiProvider {
  return PROVIDERS[id];
}

/** The active provider, or a clear error explaining how to set one up. */
export function requireActiveProvider(): AiProvider {
  const provider = getProvider();
  if (!provider.isConfigured()) {
    throw new ProviderUnavailableError(
      provider.id === "anthropic"
        ? "Claude isn't set up. Add ANTHROPIC_API_KEY to server/.env, or switch to the local model."
        : "No local model configured. Set LOCAL_MODEL in server/.env, or switch to Claude.",
    );
  }
  return provider;
}

/** Is any provider usable at all? Used to decide whether to tag on save. */
export function isAnyProviderConfigured(): boolean {
  return PROVIDER_IDS.some((id) => PROVIDERS[id].isConfigured());
}

export interface ProviderStatus {
  id: ProviderId;
  label: string;
  model: string;
  configured: boolean;
  available: boolean;
  detail: string;
  active: boolean;
}

/** Live status of every backend, for the picker in the UI. */
export async function listProviders(): Promise<ProviderStatus[]> {
  const active = getActiveProviderId();
  return Promise.all(
    PROVIDER_IDS.map(async (id) => {
      const p = PROVIDERS[id];
      const { ok, detail } = await p.checkAvailable();
      return {
        id,
        label: p.label,
        model: p.describeModel(),
        configured: p.isConfigured(),
        available: ok,
        detail,
        active: id === active,
      };
    }),
  );
}
