import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load server/.env if present. Node has this built in (>=20.12), so we don't
// need `dotenv` — one less dependency in a workspace that can't build native
// modules anyway.
try {
  process.loadEnvFile(path.resolve(__dirname, "..", ".env"));
} catch {
  /* no .env file — fall back to the real environment */
}

/** Server root (the `server/` folder). */
export const SERVER_ROOT = path.resolve(__dirname, "..");

/** Where extracted garment PNGs are written and served from. */
export const STORAGE_DIR = path.join(SERVER_ROOT, "storage");

/** SQLite database file location. */
export const DATA_DIR = path.join(SERVER_ROOT, "data");
export const DB_PATH = path.join(DATA_DIR, "app.db");

export const PORT = Number(process.env.PORT) || 3001;

/**
 * Claude credentials for the AI stylist. Server-side ONLY — never expose this
 * to the client bundle; Vite would inline anything it can see.
 *
 * Absent is a supported state: the server still boots and every other feature
 * works, and the stylist route answers 503 so the UI can explain the setup.
 */
export const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY?.trim() || null;

/** Claude model used for both garment tagging and outfit suggestions. */
export const STYLIST_MODEL = "claude-opus-5";

/**
 * A model running on this machine, over an OpenAI-compatible endpoint.
 * Defaults suit LM Studio; for Ollama use http://localhost:11434/v1.
 *
 * `qwen/qwen3.6-35b-a3b` is the default because it was the fastest of the
 * vision-capable local models measured on this Mac (MoE, ~3B active) — see the
 * AI provider notes in CLAUDE.md.
 */
export const LOCAL_BASE_URL =
  process.env.LOCAL_BASE_URL?.replace(/\/$/, "") || "http://localhost:1234/v1";
export const LOCAL_MODEL = process.env.LOCAL_MODEL || "qwen/qwen3.6-35b-a3b";

/**
 * Which backend to use when the user hasn't picked one yet. Honours AI_PROVIDER,
 * otherwise prefers Claude when a key exists and falls back to the local model.
 */
export const DEFAULT_AI_PROVIDER: "anthropic" | "local" =
  process.env.AI_PROVIDER === "anthropic" || process.env.AI_PROVIDER === "local"
    ? process.env.AI_PROVIDER
    : ANTHROPIC_API_KEY
      ? "anthropic"
      : "local";

/**
 * The garment categories the app supports. The user named three: upper body,
 * lower body, shoes. Adding a category later is a one-line change here (plus a
 * matching update to the DB CHECK constraint in db.ts).
 */
export const CATEGORIES = ["top", "bottom", "shoes"] as const;
export type Category = (typeof CATEGORIES)[number];

export function isCategory(value: unknown): value is Category {
  return typeof value === "string" && (CATEGORIES as readonly string[]).includes(value);
}
