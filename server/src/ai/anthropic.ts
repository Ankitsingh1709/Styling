import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { ANTHROPIC_API_KEY, STYLIST_MODEL } from "../config.js";
import { AnalysisSchema, StylistSchema } from "./schemas.js";
import type { GarmentAnalysisResult, StylistResult } from "./schemas.js";
import { ProviderUnavailableError, type AiProvider, type ChatTurn } from "./types.js";

/**
 * Claude via the Anthropic API. Unlike the local backend this has real
 * structured outputs — `messages.parse` + `zodOutputFormat` validates the
 * response against the same schema the local provider has to prompt for.
 *
 * Server-side only: the key must never reach the client bundle.
 */
let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!ANTHROPIC_API_KEY) {
    throw new ProviderUnavailableError(
      "ANTHROPIC_API_KEY is not set. Add it to server/.env and restart the server.",
    );
  }
  client ??= new Anthropic();
  return client;
}

const ANALYSIS_PROMPT =
  "This is a single clothing item cut out of a photo, on a transparent background. " +
  "Describe the garment itself — ignore the background and any leftover fragments " +
  "around the edges. Be concrete about colour and material, and judge formality, " +
  "warmth and occasions the way a stylist would.";

export const anthropicProvider: AiProvider = {
  id: "anthropic",
  label: "Claude (cloud)",

  describeModel: () => STYLIST_MODEL,

  isConfigured: () => ANTHROPIC_API_KEY !== null,

  async checkAvailable() {
    if (!ANTHROPIC_API_KEY) {
      return { ok: false, detail: "ANTHROPIC_API_KEY not set in server/.env" };
    }
    return { ok: true, detail: "via the Anthropic API" };
  },

  async describeGarment(pngBase64: string): Promise<GarmentAnalysisResult> {
    const response = await getClient().messages.parse({
      model: STYLIST_MODEL,
      max_tokens: 1000,
      thinking: { type: "adaptive" },
      // Perception, not reasoning — low effort keeps this fast and cheap.
      output_config: { effort: "low", format: zodOutputFormat(AnalysisSchema) },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: "image/png", data: pngBase64 },
            },
            { type: "text", text: ANALYSIS_PROMPT },
          ],
        },
      ],
    });
    if (!response.parsed_output) throw new Error("Claude returned an unreadable description");
    return response.parsed_output;
  },

  async suggestOutfit(system: string, messages: ChatTurn[]): Promise<StylistResult> {
    const response = await getClient().messages.parse({
      model: STYLIST_MODEL,
      max_tokens: 2000,
      thinking: { type: "adaptive" },
      output_config: { effort: "medium", format: zodOutputFormat(StylistSchema) },
      system,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    });
    if (!response.parsed_output) throw new Error("Claude returned an unreadable suggestion");
    return response.parsed_output;
  },
};

/**
 * Map a failure onto an HTTP status + a message worth showing a user. Checked
 * most-specific first; one broad catch would lose the difference between
 * "retry in a minute" and "your key is wrong".
 */
export function describeAiError(err: unknown): { status: number; message: string } {
  if (err instanceof ProviderUnavailableError) return { status: 503, message: err.message };
  if (err instanceof Anthropic.AuthenticationError) {
    return { status: 502, message: "Claude rejected the API key — check ANTHROPIC_API_KEY." };
  }
  if (err instanceof Anthropic.RateLimitError) {
    return { status: 429, message: "Claude is rate limiting — try again in a moment." };
  }
  if (err instanceof Anthropic.BadRequestError) {
    return { status: 502, message: `Claude rejected the request: ${err.message}` };
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return { status: 504, message: "Couldn't reach Claude — check your connection." };
  }
  if (err instanceof Anthropic.APIError) {
    return { status: 502, message: `Claude error ${err.status}: ${err.message}` };
  }
  return {
    status: 500,
    message: err instanceof Error ? err.message : "Unexpected stylist failure",
  };
}
