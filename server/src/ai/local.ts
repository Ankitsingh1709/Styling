import { z } from "zod";
import { LOCAL_BASE_URL, LOCAL_MODEL } from "../config.js";
import { AnalysisSchema, StylistSchema } from "./schemas.js";
import type { GarmentAnalysisResult, StylistResult } from "./schemas.js";
import { ProviderUnavailableError, type AiProvider, type ChatTurn } from "./types.js";

/**
 * A model running on this machine, over the OpenAI-compatible endpoint that
 * LM Studio (:1234) and Ollama (:11434) both expose.
 *
 * Three things were measured against LM Studio + qwen3.6-35b-a3b and shape this
 * implementation — see CLAUDE.md:
 *  1. `response_format: json_schema` (strict grammar) makes reasoning models
 *     return EMPTY content, and made gemma degenerate into repeated tokens.
 *     `json_object` isn't accepted at all. So we stay in plain text mode and ask
 *     for JSON in the prompt.
 *  2. These are reasoning models: they spend 4-5k characters thinking before
 *     answering. With a small `max_tokens` the budget is gone before the answer
 *     starts and you get an empty string, so the cap is deliberately generous.
 *  3. Loading a model can take a minute, so timeouts are long.
 */
const REQUEST_TIMEOUT_MS = 10 * 60 * 1000;
/** Generous on purpose: reasoning is spent from the same budget as the answer. */
const MAX_TOKENS = 8000;
/** A retry gets more room still, plus an instruction to stop deliberating. */
const RETRY_MAX_TOKENS = 12000;

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string | unknown[];
}

interface ChatResult {
  content: string;
  finishReason: string;
}

async function chat(messages: ChatMessage[], maxTokens = MAX_TOKENS): Promise<ChatResult> {
  let res: Response;
  try {
    res = await fetch(`${LOCAL_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: LOCAL_MODEL,
        messages,
        temperature: 0.4,
        max_tokens: maxTokens,
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    throw new ProviderUnavailableError(
      `Couldn't reach the local model server at ${LOCAL_BASE_URL}. Is LM Studio (or Ollama) running? ${
        err instanceof Error ? err.message : ""
      }`,
    );
  }

  if (!res.ok) {
    throw new Error(`Local model server returned ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }

  const body = (await res.json()) as {
    choices?: { message?: { content?: string }; finish_reason?: string }[];
  };
  const choice = body.choices?.[0];
  // Empty content is normal-ish here (the reasoning phase ate the budget), so
  // report it rather than throwing — askForJson retries with more room.
  return {
    content: choice?.message?.content?.trim() ?? "",
    finishReason: choice?.finish_reason ?? "unknown",
  };
}

/**
 * Pull a JSON object out of a model reply. Local models like to wrap it in a
 * ```json fence or add a sentence either side, so take the outermost braces
 * rather than trusting the whole string.
 */
function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end <= start) {
    throw new Error("No JSON object found in the model's reply");
  }
  return JSON.parse(candidate.slice(start, end + 1));
}

/**
 * Ask, parse, validate — with one retry, because local reasoning models fail in
 * two distinct ways: they return prose around the JSON, or they think for so
 * long that the token budget runs out before the answer starts (empty content,
 * finish_reason "length"). The retry handles both: more room, and an explicit
 * instruction to stop deliberating.
 */
async function askForJson<T>(messages: ChatMessage[], schema: z.ZodType<T>): Promise<T> {
  const first = await chat(messages);

  if (first.content) {
    try {
      return schema.parse(extractJson(first.content));
    } catch (err) {
      const retry = await chat(
        [
          ...messages,
          { role: "assistant", content: first.content },
          {
            role: "user",
            content:
              `That wasn't valid: ${err instanceof Error ? err.message : String(err)}. ` +
              "Reply again with ONLY the JSON object, no prose and no code fence.",
          },
        ],
        RETRY_MAX_TOKENS,
      );
      if (!retry.content) throw emptyReply(retry.finishReason);
      return schema.parse(extractJson(retry.content));
    }
  }

  // Nothing came back at all — give it more room and tell it to answer straight away.
  const retry = await chat(
    [
      ...messages,
      {
        role: "user",
        content:
          "Answer immediately with ONLY the JSON object. Keep your reasoning to a " +
          "minimum — do not deliberate, just describe what you see.",
      },
    ],
    RETRY_MAX_TOKENS,
  );
  if (!retry.content) throw emptyReply(retry.finishReason);
  return schema.parse(extractJson(retry.content));
}

function emptyReply(finishReason: string): Error {
  return new Error(
    `The local model returned nothing (finish_reason: ${finishReason}). It spent its ` +
      "whole token budget thinking — try a model with a shorter reasoning phase.",
  );
}

/** Describe the required shape from the zod schema, so they can't drift apart. */
function shapeHint(schema: z.ZodType): string {
  return JSON.stringify(z.toJSONSchema(schema));
}

const ANALYSIS_PROMPT =
  "This is a single clothing item cut out of a photo, on a transparent background. " +
  "Describe the garment itself — ignore the background and any leftover fragments " +
  "around the edges. Be concrete about colour and material, and judge formality, " +
  "warmth and occasions the way a stylist would.\n\n" +
  "Reply with ONLY a JSON object matching this schema, no prose and no code fence:\n";

export const localProvider: AiProvider = {
  id: "local",
  label: "On this Mac",

  describeModel: () => LOCAL_MODEL,

  isConfigured: () => Boolean(LOCAL_BASE_URL && LOCAL_MODEL),

  async checkAvailable() {
    try {
      const res = await fetch(`${LOCAL_BASE_URL}/models`, {
        signal: AbortSignal.timeout(3000),
      });
      if (!res.ok) return { ok: false, detail: `Server responded ${res.status}` };
      const body = (await res.json()) as { data?: { id: string }[] };
      const ids = (body.data ?? []).map((m) => m.id);
      if (!ids.includes(LOCAL_MODEL)) {
        return {
          ok: false,
          detail: `"${LOCAL_MODEL}" isn't loaded. Available: ${ids.join(", ") || "none"}`,
        };
      }
      return { ok: true, detail: "loaded and ready" };
    } catch {
      return { ok: false, detail: `Nothing listening at ${LOCAL_BASE_URL}` };
    }
  },

  async describeGarment(pngBase64: string): Promise<GarmentAnalysisResult> {
    return askForJson(
      [
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: { url: `data:image/png;base64,${pngBase64}` },
            },
            { type: "text", text: ANALYSIS_PROMPT + shapeHint(AnalysisSchema) },
          ],
        },
      ],
      AnalysisSchema,
    );
  },

  async suggestOutfit(system: string, messages: ChatTurn[]): Promise<StylistResult> {
    return askForJson(
      [
        {
          role: "system",
          content:
            `${system}\n\nReply with ONLY a JSON object matching this schema, ` +
            `no prose and no code fence:\n${shapeHint(StylistSchema)}`,
        },
        ...messages,
      ],
      StylistSchema,
    );
  },
};
