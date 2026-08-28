import { Router } from "express";
import { db, type GarmentRow } from "../db.js";
import { CATEGORIES } from "../config.js";
import {
  describeAiError,
  getActiveProviderId,
  isAnyProviderConfigured,
  requireActiveProvider,
} from "../ai/index.js";
import type { RawPick } from "../ai/schemas.js";
import { backfillMissing } from "../garmentAnalysis.js";
import {
  garmentDtoById,
  garmentIdForCategory,
  parseAnalysis,
} from "../garmentDto.js";
import { outfitDtoById, type OutfitRow } from "../outfitDto.js";

export const stylistRouter = Router();

const SYSTEM = `You are the user's personal stylist inside their wardrobe app.
You can ONLY suggest clothes from the catalog below — never invent garments, and
never use an id that isn't listed.

How to choose:
- Prefer one of their SAVED OUTFITS when one genuinely suits the occasion; return
  kind "saved" with its outfitId.
- Otherwise build a new combination from individual garments: kind "fresh", with
  topId / bottomId / shoesId from the catalog and a short name for the look.
- Every id you return must come from the matching category list.
- Avoid repeating something worn in the last few days unless it's clearly the best
  choice; if you do repeat it, say so.
- If the wardrobe genuinely has nothing suitable, set pick to null and say what's
  missing — do not force a bad outfit.

Tone: talk like a friend with taste. Name the actual colours and pieces ("the cream
crop top with the light-wash jeans"), and keep the reply to one to three sentences.`;

/** Compact catalog lines: enough for the model to judge, cheap to send. */
function buildCatalog(): string {
  const rows = db
    .prepare("SELECT * FROM garments ORDER BY id")
    .all() as unknown as GarmentRow[];

  const sections = CATEGORIES.map((category) => {
    const items = rows.filter((r) => r.category === category);
    if (items.length === 0) return `${category.toUpperCase()}: (none yet)`;
    const lines = items.map((r) => {
      const a = parseAnalysis(r);
      if (!a) return `- #${r.id} (not described yet)`;
      return (
        `- #${r.id} "${a.description}" | colours: ${a.colors.join(", ")} | ${a.pattern}` +
        ` | ${a.formality} | ${a.warmth} | seasons: ${a.seasons.join(", ")}` +
        ` | good for: ${a.occasions.join(", ")}`
      );
    });
    return `${category.toUpperCase()}:\n${lines.join("\n")}`;
  });

  const outfits = db
    .prepare("SELECT * FROM outfits ORDER BY id DESC")
    .all() as unknown as OutfitRow[];
  const outfitLines = outfits.length
    ? outfits
        .map((o) => {
          const parts = [
            o.top_id ? `top #${o.top_id}` : null,
            o.bottom_id ? `bottom #${o.bottom_id}` : null,
            o.shoes_id ? `shoes #${o.shoes_id}` : null,
          ].filter(Boolean);
          return `- outfit #${o.id} ${o.name ? `"${o.name}"` : "(unnamed)"} = ${parts.join(" + ")}`;
        })
        .join("\n")
    : "(none saved yet)";

  const wears = db
    .prepare("SELECT date, outfit_id FROM wears ORDER BY date DESC LIMIT 14")
    .all() as unknown as { date: string; outfit_id: number }[];
  const wearLines = wears.length
    ? wears.map((w) => `- ${w.date}: outfit #${w.outfit_id}`).join("\n")
    : "(nothing worn yet)";

  return [
    `Today is ${new Date().toISOString().slice(0, 10)}.`,
    "",
    "GARMENTS",
    sections.join("\n\n"),
    "",
    "SAVED OUTFITS",
    outfitLines,
    "",
    "RECENTLY WORN",
    wearLines,
  ].join("\n");
}

interface IncomingMessage {
  role: "user" | "assistant";
  content: string;
}

function readMessages(value: unknown): IncomingMessage[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const out: IncomingMessage[] = [];
  // Cap the history so one long session can't send an unbounded prompt.
  for (const m of value.slice(-20)) {
    const role = m?.role;
    const content = m?.content;
    if ((role !== "user" && role !== "assistant") || typeof content !== "string") return null;
    const trimmed = content.trim();
    if (!trimmed) return null;
    out.push({ role, content: trimmed.slice(0, 2000) });
  }
  // The API requires the conversation to start with a user turn.
  return out[0].role === "user" ? out : null;
}

// POST /api/stylist — body: { messages: [{ role, content }], bodyType? }
stylistRouter.post("/", async (req, res) => {
  if (!isAnyProviderConfigured()) {
    return res.status(503).json({
      error:
        "No AI provider is set up. Either run a local model (LM Studio / Ollama), " +
        "or add ANTHROPIC_API_KEY to server/.env.",
    });
  }

  const messages = readMessages(req.body?.messages);
  if (!messages) return res.status(400).json({ error: "Invalid messages" });

  const total = db.prepare("SELECT COUNT(*) AS n FROM garments").get() as unknown as {
    n: number;
  };
  if (total.n === 0) {
    return res.json({
      reply: "Your wardrobe is empty — add a few pieces and I'll put looks together for you.",
      pick: null,
    });
  }

  try {
    // Anything saved before the stylist existed (or whose background pass
    // failed) gets described now. Normally a no-op — the server warms this on
    // boot and each save describes itself.
    await backfillMissing();

    const bodyType = req.body?.bodyType === "male" || req.body?.bodyType === "female"
      ? ` The user's body type preference is ${req.body.bodyType}.`
      : "";

    const result = await requireActiveProvider().suggestOutfit(
      `${SYSTEM}${bodyType}\n\n--- WARDROBE CATALOG ---\n${buildCatalog()}`,
      messages,
    );

    res.json({
      reply: result.reply,
      pick: resolvePick(result.pick),
      provider: getActiveProviderId(),
    });
  } catch (err) {
    const { status, message } = describeAiError(err);
    console.error("[stylist]", err);
    res.status(status).json({ error: message });
  }
});

/**
 * Turn the model's ids into real data — dropping anything that doesn't exist or
 * is in the wrong slot. A stylist that hallucinates garment #99 should degrade
 * to "no pick", never to a broken image or a bad row in the database.
 */
function resolvePick(pick: RawPick | null) {
  if (!pick) return null;

  if (pick.kind === "saved") {
    const outfit = outfitDtoById(pick.outfitId);
    if (!outfit) return null;
    return {
      kind: "saved" as const,
      outfit,
      name: outfit.name,
      why: pick.why,
      top: outfit.top,
      bottom: outfit.bottom,
      shoes: outfit.shoes,
    };
  }

  const topId = garmentIdForCategory(pick.topId, "top");
  const bottomId = garmentIdForCategory(pick.bottomId, "bottom");
  const shoesId = garmentIdForCategory(pick.shoesId, "shoes");
  if (!topId && !bottomId && !shoesId) return null;

  return {
    kind: "fresh" as const,
    outfit: null,
    name: pick.name,
    why: pick.why,
    top: garmentDtoById(topId),
    bottom: garmentDtoById(bottomId),
    shoes: garmentDtoById(shoesId),
  };
}
