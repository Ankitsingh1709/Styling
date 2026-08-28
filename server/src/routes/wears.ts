import { Router } from "express";
import { db } from "../db.js";
import { outfitDtoById } from "../outfitDto.js";

export const wearsRouter = Router();

interface WearRow {
  date: string;
  outfit_id: number;
}

function isDate(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

// GET /api/wears — every planned day with its outfit resolved.
wearsRouter.get("/", (_req, res) => {
  const rows = db
    .prepare("SELECT date, outfit_id FROM wears ORDER BY date")
    .all() as unknown as WearRow[];
  const wears = rows
    .map((r) => ({ date: r.date, outfit: outfitDtoById(r.outfit_id) }))
    .filter((w) => w.outfit !== null);
  res.json(wears);
});

// PUT /api/wears/:date — assign an outfit to a day (upsert). Body: { outfitId }.
wearsRouter.put("/:date", (req, res) => {
  const { date } = req.params;
  if (!isDate(date)) return res.status(400).json({ error: "Invalid date" });

  const outfitId = Number(req.body?.outfitId);
  if (!Number.isInteger(outfitId)) {
    return res.status(400).json({ error: "Invalid outfitId" });
  }
  const outfit = outfitDtoById(outfitId);
  if (!outfit) return res.status(404).json({ error: "Outfit not found" });

  db.prepare(
    `INSERT INTO wears (date, outfit_id) VALUES (?, ?)
     ON CONFLICT(date) DO UPDATE SET outfit_id = excluded.outfit_id`,
  ).run(date, outfitId);

  res.json({ date, outfit });
});

// DELETE /api/wears/:date — clear a day.
wearsRouter.delete("/:date", (req, res) => {
  const { date } = req.params;
  if (!isDate(date)) return res.status(400).json({ error: "Invalid date" });
  db.prepare("DELETE FROM wears WHERE date = ?").run(date);
  res.status(204).end();
});
