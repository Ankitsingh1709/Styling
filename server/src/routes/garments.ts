import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { Router } from "express";
import multer from "multer";
import { db, type GarmentRow } from "../db.js";
import { STORAGE_DIR, isCategory } from "../config.js";
import { toGarmentDto as toDto } from "../garmentDto.js";
import { analyzeGarmentInBackground } from "../garmentAnalysis.js";
import { isAnyProviderConfigured } from "../ai/index.js";

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
