import { Router } from "express";
import { getActiveProviderId, listProviders, setActiveProviderId } from "../ai/index.js";
import { isProviderId } from "../ai/types.js";
import { backfillMissing } from "../garmentAnalysis.js";

export const aiRouter = Router();

// GET /api/ai/providers — live status of every backend, for the picker.
aiRouter.get("/providers", async (_req, res) => {
  res.json({ active: getActiveProviderId(), providers: await listProviders() });
});

// PUT /api/ai/provider — body: { id: "anthropic" | "local" }
aiRouter.put("/provider", async (req, res) => {
  const id = req.body?.id;
  if (!isProviderId(id)) return res.status(400).json({ error: "Unknown provider" });

  setActiveProviderId(id);

  // Garments described by the previous provider keep their descriptions; only
  // ones that were never analysed (e.g. saved while nothing was configured)
  // get picked up. Fire-and-forget so switching stays instant.
  backfillMissing().catch((err) => console.error("[stylist] backfill failed:", err));

  res.json({ active: getActiveProviderId(), providers: await listProviders() });
});
