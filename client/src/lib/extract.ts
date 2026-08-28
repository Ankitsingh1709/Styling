import { pipeline, env } from "@huggingface/transformers";
import { CATEGORIES, type Category } from "../api";

// Models are fetched from the Hugging Face hub CDN at runtime and cached by the
// browser. We don't ship local weights.
env.allowLocalModels = false;

const MODEL_ID = "Xenova/segformer_b2_clothes";

/**
 * Which segmentation classes count as each garment category. The model emits
 * the ATR-18 label set exactly — there is no "T-shirt" or "Shorts" class, so a
 * tee arrives as "Upper-clothes" (or "Dress" for a long one) and shorts arrive
 * as "Pants". Verified by dumping the labels for a real full-body photo.
 */
const CATEGORY_CLASSES: Record<Category, string[]> = {
  top: ["Upper-clothes", "Dress"],
  bottom: ["Pants", "Skirt"],
  shoes: ["Left-shoe", "Right-shoe"],
};

/**
 * Noise floor: below this fraction of the frame a "detection" is stray speckle,
 * not a garment. It has to stay low — in a real full-body photo the subject is
 * a small part of the frame, and shoes measured just 0.31% of one (a pair of
 * sneakers is genuinely tiny), so anything stricter silently loses them.
 */
const MIN_COVERAGE = 0.0005;

/**
 * Second guard used only by the full-look scan: a piece must also be at least
 * this fraction of the *largest* garment found. Kills the handful of pixels the
 * model misfires into another class (e.g. 12 "Skirt" pixels on a jeans photo)
 * without penalising legitimately small pieces like shoes.
 */
const MIN_RELATIVE = 0.02;

type Mask = { data: Uint8Array | Uint8ClampedArray; width: number; height: number };
type Segment = { label: string; mask: Mask };
type Segmenter = (input: string) => Promise<Segment[]>;

let segmenterPromise: Promise<Segmenter> | null = null;

function getSegmenter(onProgress?: (fraction: number) => void) {
  if (segmenterPromise) return segmenterPromise;
  // `pipeline` has a very large overloaded return type; cast through `any` so
  // TypeScript doesn't try to represent the whole union (TS2590).
  const loading = (pipeline as any)("image-segmentation", MODEL_ID, {
    // Quantized weights: small download, fast on CPU/WASM.
    dtype: "q8",
    progress_callback: (p: { status?: string; progress?: number }) => {
      if (onProgress && p.status === "progress" && typeof p.progress === "number") {
        onProgress(p.progress / 100);
      }
    },
  }) as Promise<Segmenter>;
  // Never keep a *failed* load: a CDN blip would otherwise poison every later
  // attempt with the same rejection, recoverable only by reloading the page.
  loading.catch(() => {
    if (segmenterPromise === loading) segmenterPromise = null;
  });
  segmenterPromise = loading;
  return loading;
}

// Cache the segmentation for the most recent image so switching category (or
// pulling every piece out of one full-body photo) is instant — no re-inference,
// just a different class mask applied to the same segments.
let cache: { key: Blob; segments: Segment[] } | null = null;

async function segment(input: Blob, onProgress?: (f: number) => void): Promise<Segment[]> {
  if (cache && cache.key === input) return cache.segments;
  const segmenter = await getSegmenter(onProgress);
  const url = URL.createObjectURL(input);
  try {
    const segments = await segmenter(url);
    cache = { key: input, segments };
    return segments;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Decode a Blob to an ImageBitmap for pixel access. */
async function toBitmap(input: Blob): Promise<ImageBitmap> {
  return createImageBitmap(input);
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Failed to encode cutout"))),
      "image/png",
    ),
  );
}

/**
 * Mask the bitmap down to one category's classes and tight-crop the result.
 * Returns null when that category isn't present in the photo (or is only a few
 * stray pixels).
 */
async function cutout(
  bitmap: ImageBitmap,
  segments: Segment[],
  category: Category,
): Promise<{ blob: Blob; coverage: number } | null> {
  const wanted = new Set(CATEGORY_CLASSES[category]);
  const parts = segments.filter((s) => wanted.has(s.label));
  if (parts.length === 0) return null;

  const mw = parts[0].mask.width;
  const mh = parts[0].mask.height;

  // Combine the selected class masks (union) into one alpha map.
  const alpha = new Uint8Array(mw * mh);
  for (const p of parts) {
    const d = p.mask.data;
    for (let i = 0; i < alpha.length; i++) alpha[i] = Math.max(alpha[i], d[i]);
  }

  // Draw the original at mask resolution and stamp the alpha channel.
  const canvas = document.createElement("canvas");
  canvas.width = mw;
  canvas.height = mh;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0, mw, mh);
  const img = ctx.getImageData(0, 0, mw, mh);

  let minX = mw, minY = mh, maxX = 0, maxY = 0, solid = 0;
  for (let y = 0; y < mh; y++) {
    for (let x = 0; x < mw; x++) {
      const a = alpha[y * mw + x];
      img.data[(y * mw + x) * 4 + 3] = a;
      if (a > 128) {
        solid++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  const coverage = solid / (mw * mh);
  if (coverage < MIN_COVERAGE) return null;

  ctx.putImageData(img, 0, 0);

  // Tight-crop to the garment bounding box with a small margin, so it sits
  // centered like a product photo.
  const margin = Math.round(Math.max(mw, mh) * 0.03);
  const cx = Math.max(0, minX - margin);
  const cy = Math.max(0, minY - margin);
  // maxX/maxY are inclusive indices, so +1 keeps the garment's last pixel row
  // and column instead of shaving them off.
  const cw = Math.min(mw, maxX + 1 + margin) - cx;
  const ch = Math.min(mh, maxY + 1 + margin) - cy;

  const out = document.createElement("canvas");
  out.width = cw;
  out.height = ch;
  out.getContext("2d")!.drawImage(canvas, cx, cy, cw, ch, 0, 0, cw, ch);

  return { blob: await canvasToBlob(out), coverage };
}

/**
 * Drop the cached segmentation. The masks are full-resolution and there is one
 * per detected class, so a phone photo can pin ~100 MB — call this when leaving
 * the capture screen.
 */
export function releaseSegmentationCache() {
  cache = null;
}

/**
 * Extract ONLY the chosen garment from a photo of a person, returning a
 * transparent-background PNG tight-cropped to the garment — a catalog-style
 * cutout. The person's skin, face, hair and other clothes are dropped.
 *
 * This is the ONE place the web-only model runs. On the future React Native
 * build, swap this function's body for a native/server equivalent; nothing else
 * changes.
 */
export async function extractGarment(
  input: Blob,
  category: Category,
  onProgress?: (fraction: number) => void,
): Promise<Blob> {
  const [segments, bitmap] = await Promise.all([
    segment(input, onProgress),
    toBitmap(input),
  ]);

  const result = await cutout(bitmap, segments, category);
  if (!result) {
    throw new Error(
      `No ${category} found in the photo. Try a clearer shot of the item.`,
    );
  }
  return result.blob;
}

export interface ExtractedPiece {
  category: Category;
  blob: Blob;
  /** Fraction of the photo this garment covers — used to sort/report results. */
  coverage: number;
}

/**
 * Scan ONE full-body photo and pull out every garment it contains: upper body,
 * lower body and shoes, each as its own transparent cutout. Uses a single
 * inference pass — the segments are computed once and re-masked per category —
 * so this costs the same as extracting one piece.
 *
 * Returns the pieces actually found, in wardrobe order (top, bottom, shoes).
 * Throws only when the photo contains no recognisable clothing at all.
 */
export async function extractAllGarments(
  input: Blob,
  onProgress?: (fraction: number) => void,
): Promise<ExtractedPiece[]> {
  const [segments, bitmap] = await Promise.all([
    segment(input, onProgress),
    toBitmap(input),
  ]);

  const found: ExtractedPiece[] = [];
  for (const category of CATEGORIES) {
    const result = await cutout(bitmap, segments, category);
    if (result) found.push({ category, blob: result.blob, coverage: result.coverage });
  }

  const biggest = Math.max(...found.map((p) => p.coverage), 0);
  const pieces = found.filter((p) => p.coverage >= biggest * MIN_RELATIVE);

  if (pieces.length === 0) {
    throw new Error(
      "Couldn't find any clothing in that photo. Try a full-body shot in good light.",
    );
  }
  return pieces;
}
