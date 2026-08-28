import { db } from "./db.js";
import { garmentDtoById } from "./garmentDto.js";

export interface OutfitRow {
  id: number;
  name: string | null;
  top_id: number | null;
  bottom_id: number | null;
  shoes_id: number | null;
  created_at: string;
}

/** Resolve an outfit row into a DTO with the actual garment images embedded. */
export function toOutfitDto(row: OutfitRow) {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    top: garmentDtoById(row.top_id),
    bottom: garmentDtoById(row.bottom_id),
    shoes: garmentDtoById(row.shoes_id),
  };
}

export function outfitDtoById(id: number | null): ReturnType<typeof toOutfitDto> | null {
  if (id == null) return null;
  const row = db.prepare("SELECT * FROM outfits WHERE id = ?").get(id) as unknown as
    | OutfitRow
    | undefined;
  return row ? toOutfitDto(row) : null;
}
