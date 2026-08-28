import fs from "node:fs";
import path from "node:path";
import { db, type GarmentRow } from "./db.js";
import { STORAGE_DIR } from "./config.js";
import { requireActiveProvider } from "./ai/index.js";
import type { GarmentAnalysisResult } from "./ai/schemas.js";

/**
 * Give the wardrobe words.
 *
 * A garment row is otherwise just a category and a PNG path, which is nothing
 * for a stylist to reason about. One vision call per garment — run once, when
 * it is saved — records what the thing actually looks like, and every later
 * suggestion is a cheap text-only call over these descriptions.
 *
 * Whether that call goes to Claude or to a model on this Mac is the active
 * provider's business; this file doesn't care.
 */
export async function analyzeGarment(id: number): Promise<GarmentAnalysisResult | null> {
  const row = db.prepare("SELECT * FROM garments WHERE id = ?").get(id) as unknown as
    | GarmentRow
    | undefined;
  if (!row) return null;

  const file = path.join(STORAGE_DIR, row.image_path);
  if (!fs.existsSync(file)) return null;
  const data = fs.readFileSync(file).toString("base64");

  const result = await requireActiveProvider().describeGarment(data);

  db.prepare("UPDATE garments SET analysis = ?, analyzed_at = datetime('now') WHERE id = ?")
    .run(JSON.stringify(result), id);
  return result;
}

/** Fire-and-forget wrapper used on the save path, so uploads stay fast. */
export function analyzeGarmentInBackground(id: number) {
  analyzeGarment(id).catch((err) => {
    console.error(`[stylist] failed to analyse garment ${id}:`, err);
  });
}

/**
 * Analyse everything that has no analysis yet — garments saved before this
 * feature existed, or whose background pass failed. Runs a few at a time so a
 * large wardrobe doesn't queue 30 requests at once (a local model serves one at
 * a time anyway). Individual failures are logged and skipped.
 */
export async function backfillMissing(concurrency = 2): Promise<number> {
  const rows = db
    .prepare("SELECT id FROM garments WHERE analysis IS NULL ORDER BY id")
    .all() as unknown as { id: number }[];
  if (rows.length === 0) return 0;

  let done = 0;
  const queue = [...rows];
  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    while (queue.length > 0) {
      const next = queue.shift();
      if (!next) return;
      try {
        if (await analyzeGarment(next.id)) done++;
      } catch (err) {
        console.error(`[stylist] backfill failed for garment ${next.id}:`, err);
      }
    }
  });
  await Promise.all(workers);
  return done;
}
