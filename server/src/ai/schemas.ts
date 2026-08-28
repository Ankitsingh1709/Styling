import { z } from "zod";

/**
 * The two shapes every AI provider must return, defined once so the cloud and
 * local backends can't drift apart. Anthropic enforces these natively via
 * `zodOutputFormat`; the local backend prompts for them and validates after.
 */
export const AnalysisSchema = z.object({
  description: z
    .string()
    .describe("One short phrase naming the item, e.g. 'cream ribbed crop top'"),
  colors: z.array(z.string()).describe("Dominant colours, plain English"),
  pattern: z.string().describe("solid, striped, floral, graphic, checked, …"),
  formality: z.enum(["casual", "smart-casual", "formal"]),
  warmth: z.enum(["light", "mid", "warm"]),
  seasons: z.array(z.enum(["spring", "summer", "autumn", "winter"])),
  occasions: z
    .array(z.string())
    .describe("Occasions it suits, e.g. party, work, gym, dinner, beach"),
});

export type GarmentAnalysisResult = z.infer<typeof AnalysisSchema>;

export const PickSchema = z.object({
  kind: z.enum(["saved", "fresh"]).describe("'saved' reuses an outfit, 'fresh' builds one"),
  outfitId: z.number().nullable().describe("Required when kind is 'saved'"),
  topId: z.number().nullable(),
  bottomId: z.number().nullable(),
  shoesId: z.number().nullable(),
  name: z.string().nullable().describe("Short name for a fresh combination"),
  why: z.string().describe("One sentence on why this suits the occasion"),
});

export const StylistSchema = z.object({
  reply: z.string().describe("Warm, specific, 1-3 sentences. Speak to the user directly."),
  pick: PickSchema.nullable().describe("null when nothing in the wardrobe fits"),
});

export type StylistResult = z.infer<typeof StylistSchema>;
export type RawPick = z.infer<typeof PickSchema>;
