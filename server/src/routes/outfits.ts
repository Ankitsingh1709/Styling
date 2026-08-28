import { Router } from "express";
import { db } from "../db.js";
import { toOutfitDto as toDto, type OutfitRow } from "../outfitDto.js";
import { garmentIdForCategory } from "../garmentDto.js";

export const outfitsRouter = Router();

// GET /api/outfits — newest first, with garment images resolved.
outfitsRouter.get("/", (_req, res) => {
  const rows = db
    .prepare("SELECT * FROM outfits ORDER BY id DESC")
    .all() as unknown as OutfitRow[];
  res.json(rows.map(toDto));
});

// POST /api/outfits — body: { name?, topId?, bottomId?, shoesId? }
outfitsRouter.post("/", (req, res) => {
  const name = typeof req.body?.name === "string" ? req.body.name.trim() || null : null;
  // Each id must exist and be in the slot's own category — otherwise the FK
  // constraint throws a 500, or shoes end up stored as the top.
  const topId = garmentIdForCategory(req.body?.topId, "top");
  const bottomId = garmentIdForCategory(req.body?.bottomId, "bottom");
  const shoesId = garmentIdForCategory(req.body?.shoesId, "shoes");

  if (!topId && !bottomId && !shoesId) {
    return res
      .status(400)
      .json({ error: "Pick at least one garment (each must match its category)" });
  }

  const info = db
    .prepare(
      "INSERT INTO outfits (name, top_id, bottom_id, shoes_id) VALUES (?, ?, ?, ?)",
    )
    .run(name, topId, bottomId, shoesId);
  const row = db
    .prepare("SELECT * FROM outfits WHERE id = ?")
    .get(info.lastInsertRowid) as unknown as OutfitRow;

  res.status(201).json(toDto(row));
});

// PATCH /api/outfits/:id — rename. Body: { name }.
outfitsRouter.patch("/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid id" });
  const name =
    typeof req.body?.name === "string" ? req.body.name.trim() || null : null;

  const info = db.prepare("UPDATE outfits SET name = ? WHERE id = ?").run(name, id);
  if (info.changes === 0) return res.status(404).json({ error: "Not found" });

  const row = db
    .prepare("SELECT * FROM outfits WHERE id = ?")
    .get(id) as unknown as OutfitRow;
  res.json(toDto(row));
});

// DELETE /api/outfits/:id
outfitsRouter.delete("/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid id" });
  const info = db.prepare("DELETE FROM outfits WHERE id = ?").run(id);
  if (info.changes === 0) return res.status(404).json({ error: "Not found" });
  res.status(204).end();
});
