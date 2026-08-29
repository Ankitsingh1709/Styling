import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { Router } from "express";
import multer from "multer";
import { db, type GarmentRow } from "../db.js";
import { STORAGE_DIR, isCategory, type Category } from "../config.js";
import { toGarmentDto as toDto } from "../garmentDto.js";
import { analyzeGarment, analyzeGarmentInBackground } from "../garmentAnalysis.js";
import { describeAiError, isAnyProviderConfigured } from "../ai/index.js";

fs.mkdirSync(STORAGE_DIR, { recursive: true });

// Keep the extracted PNG in memory so we control the filename and only write
// to disk once the row is successfully inserted.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB
});

export const garmentsRouter = Router();

// GET /api/garments?category=top
garmentsRouter.get("/", (req, res) => {
  const { category } = req.query;
  let rows: GarmentRow[];
  if (typeof category === "string" && category.length > 0) {
    if (!isCategory(category)) {
      return res.status(400).json({ error: "Unknown category" });
    }
    rows = db
      .prepare("SELECT * FROM garments WHERE category = ? ORDER BY id DESC")
      .all(category) as unknown as GarmentRow[];
  } else {
    rows = db
      .prepare("SELECT * FROM garments ORDER BY id DESC")
      .all() as unknown as GarmentRow[];
  }
  res.json(rows.map(toDto));
});

// POST /api/garments  (multipart: image=<extracted png>, category=<top|bottom|shoes>)
garmentsRouter.post("/", upload.single("image"), (req, res) => {
  const category = req.body?.category;
  if (!isCategory(category)) {
    return res.status(400).json({ error: "Missing or invalid category" });
  }
  if (!req.file) {
    return res.status(400).json({ error: "Missing image file" });
  }

  const filename = `${crypto.randomUUID()}.png`;
  fs.writeFileSync(path.join(STORAGE_DIR, filename), req.file.buffer);

  const info = db
    .prepare("INSERT INTO garments (category, image_path) VALUES (?, ?)")
    .run(category, filename);
  const row = db
    .prepare("SELECT * FROM garments WHERE id = ?")
    .get(info.lastInsertRowid) as unknown as GarmentRow;

  // Describe the garment for the stylist, but don't make the user wait for it —
  // saving is already slow enough after extraction.
  if (isAnyProviderConfigured()) analyzeGarmentInBackground(row.id);

  res.status(201).json(toDto(row));
});

/**
 * PATCH /api/garments/:id — body: { category }
 *
 * Fixes a mis-filed garment. Extraction gets the category wrong often enough
 * to matter (a jacket tied round the waist comes back as a "bottom"), and
 * before this the only remedy was delete-and-reshoot.
 */
garmentsRouter.patch("/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid id" });

  const category = req.body?.category;
  if (!isCategory(category)) {
    return res.status(400).json({ error: "Missing or invalid category" });
  }

  const row = db.prepare("SELECT * FROM garments WHERE id = ?").get(id) as unknown as
    | GarmentRow
    | undefined;
  if (!row) return res.status(404).json({ error: "Not found" });
  if (row.category === category) return res.json(toDto(row));

  // Outfits reference a garment by slot, so a garment that changes category
  // would otherwise keep sitting in the wrong slot — shoes rendered on the
  // torso. Clear the stale references; the outfit survives with an empty slot,
  // which is the same thing that happens when a garment is deleted.
  const slot: Record<Category, string> = {
    top: "top_id",
    bottom: "bottom_id",
    shoes: "shoes_id",
  };
  const oldSlot = slot[row.category as Category];
  db.prepare(`UPDATE outfits SET ${oldSlot} = NULL WHERE ${oldSlot} = ?`).run(id);
  db.prepare("UPDATE garments SET category = ? WHERE id = ?").run(category, id);

  const updated = db
    .prepare("SELECT * FROM garments WHERE id = ?")
    .get(id) as unknown as GarmentRow;
  res.json(toDto(updated));
});

/**
 * POST /api/garments/:id/describe — re-run the vision pass.
 * Used when the stored description is wrong, since every stylist suggestion is
 * reasoned from that text rather than from the image.
 */
garmentsRouter.post("/:id/describe", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid id" });

  // analyzeGarment returns null for three different reasons; only one of them
  // is the model's fault, so rule the other two out here rather than showing an
  // AI-shaped error the user would retry forever.
  const row = db.prepare("SELECT * FROM garments WHERE id = ?").get(id) as unknown as
    | GarmentRow
    | undefined;
  if (!row) return res.status(404).json({ error: "Not found" });
  if (!fs.existsSync(path.join(STORAGE_DIR, row.image_path))) {
    return res.status(500).json({ error: "That garment's image is missing from storage." });
  }

  try {
    const result = await analyzeGarment(id);
    if (!result) {
      return res.status(502).json({ error: "The model didn't return a description." });
    }
    const row = db
      .prepare("SELECT * FROM garments WHERE id = ?")
      .get(id) as unknown as GarmentRow;
    res.json(toDto(row));
  } catch (err) {
    const { status, message } = describeAiError(err);
    console.error("[garments] describe failed:", err);
    res.status(status).json({ error: message });
  }
});

// DELETE /api/garments/:id  (removes the row and the file)
garmentsRouter.delete("/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: "Invalid id" });
  }
  const row = db.prepare("SELECT * FROM garments WHERE id = ?").get(id) as unknown as
    | GarmentRow
    | undefined;
  if (!row) {
    return res.status(404).json({ error: "Not found" });
  }

  db.prepare("DELETE FROM garments WHERE id = ?").run(id);
  fs.rmSync(path.join(STORAGE_DIR, row.image_path), { force: true });

  res.status(204).end();
});
