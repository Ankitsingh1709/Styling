import { db, type GarmentRow } from "./db.js";

/** What the vision pass records about a garment. See garmentAnalysis.ts. */
export interface GarmentAnalysis {
  description: string;
  colors: string[];
  pattern: string;
  formality: "casual" | "smart-casual" | "formal";
  warmth: "light" | "mid" | "warm";
  seasons: string[];
  occasions: string[];
}

/** Parse the stored analysis JSON, tolerating null/garbage. */
export function parseAnalysis(row: GarmentRow): GarmentAnalysis | null {
  if (!row.analysis) return null;
  try {
    return JSON.parse(row.analysis) as GarmentAnalysis;
  } catch {
    return null;
  }
}

/** Shape returned to the client. `imageUrl` is a ready-to-render path. */
export function toGarmentDto(row: GarmentRow) {
  return {
    id: row.id,
    category: row.category,
    imageUrl: `/storage/${row.image_path}`,
    createdAt: row.created_at,
    analysis: parseAnalysis(row),
  };
}

/**
 * Resolve an id for a specific slot: returns the id only if that garment exists
 * AND is actually in that category. Guards two things — a hallucinated id from
 * the stylist, and a client posting a shoes id as an outfit's `topId` (which
 * would render shoes on the torso in the mixer).
 */
export function garmentIdForCategory(id: unknown, category: string): number | null {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) return null;
  const row = db
    .prepare("SELECT category FROM garments WHERE id = ?")
    .get(n) as unknown as { category: string } | undefined;
  return row?.category === category ? n : null;
}

/** Look up one garment DTO by id, or null if it doesn't exist. */
export function garmentDtoById(id: number | null): ReturnType<typeof toGarmentDto> | null {
  if (id == null) return null;
  const row = db.prepare("SELECT * FROM garments WHERE id = ?").get(id) as unknown as
    | GarmentRow
    | undefined;
  return row ? toGarmentDto(row) : null;
}
