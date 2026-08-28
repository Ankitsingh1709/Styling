import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import CameraCapture from "../components/CameraCapture";
import {
  extractAllGarments,
  extractGarment,
  releaseSegmentationCache,
  type ExtractedPiece,
} from "../lib/extract";
import { CATEGORIES, CATEGORY_LABELS, saveGarment, type Category } from "../api";

type Stage = "choose" | "camera" | "review";
/** "look" = one full-body photo → every piece. "item" = one garment, one category. */
type Mode = "look" | "item";

const CATEGORY_ICONS: Record<Category, string> = {
  top: "👕",
  bottom: "👖",
  shoes: "👟",
};

export default function CapturePage() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<Mode>("look");
  const [stage, setStage] = useState<Stage>("choose");
  const [original, setOriginal] = useState<Blob | null>(null);
  const [dragging, setDragging] = useState(false);

  // Single-item mode
  const [extracted, setExtracted] = useState<Blob | null>(null);
  const [category, setCategory] = useState<Category>("top");

  // Full-look mode
  const [pieces, setPieces] = useState<ExtractedPiece[] | null>(null);
  const [skipped, setSkipped] = useState<Set<Category>>(new Set());

  const [extracting, setExtracting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<number | null>(null);

  // Object URL for the source photo; revoked when it changes.
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!original) {
      setPhotoUrl(null);
      return;
    }
    const url = URL.createObjectURL(original);
    setPhotoUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [original]);

  // Object URL for the single-item cutout.
  const [cutUrl, setCutUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!extracted) {
      setCutUrl(null);
      return;
    }
    const url = URL.createObjectURL(extracted);
    setCutUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [extracted]);

  // Object URLs for every detected piece.
  const [pieceUrls, setPieceUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!pieces) {
      setPieceUrls({});
      return;
    }
    const urls = Object.fromEntries(
      pieces.map((p) => [p.category, URL.createObjectURL(p.blob)]),
    );
    setPieceUrls(urls);
    return () => Object.values(urls).forEach(URL.revokeObjectURL);
  }, [pieces]);

  // Masks are heavy; don't hold them once the user leaves this screen.
  useEffect(() => releaseSegmentationCache, []);

  const useImage = useCallback((blob: Blob) => {
    setOriginal(blob);
    setExtracted(null);
    setPieces(null);
    setSkipped(new Set());
    setError(null);
    setSaved(null);
    setStage("review");
  }, []);

  function reset() {
    setOriginal(null);
    setExtracted(null);
    setPieces(null);
    setSkipped(new Set());
    setProgress(0);
    setError(null);
    setStage("choose");
  }

  function pickMode(m: Mode) {
    setMode(m);
    setExtracted(null);
    setPieces(null);
    setSkipped(new Set()); // stale exclusions must not silently drop new pieces
    setError(null);
  }

  function pickCategory(c: Category) {
    setCategory(c);
    setExtracted(null); // require a re-extract for the new category (cached → fast)
    setError(null);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file?.type.startsWith("image/")) useImage(file);
  }

  async function run() {
    if (!original) return;
    setExtracting(true);
    setProgress(0);
    setError(null);
    try {
      if (mode === "look") {
        setPieces(await extractAllGarments(original, setProgress));
      } else {
        setExtracted(await extractGarment(original, category, setProgress));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Extraction failed");
    } finally {
      setExtracting(false);
    }
  }

  const keeping = useMemo(
    () => (pieces ?? []).filter((p) => !skipped.has(p.category)),
    [pieces, skipped],
  );

  function toggle(c: Category) {
    setSkipped((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });
  }

  async function save() {
    const batch =
      mode === "look"
        ? keeping.map((p) => ({ blob: p.blob, category: p.category }))
        : extracted
          ? [{ blob: extracted, category }]
          : [];
    if (batch.length === 0) return;

    setSaving(true);
    setError(null);
    const done: Category[] = [];
    try {
      for (const item of batch) {
        await saveGarment(item.blob, item.category);
        done.push(item.category);
      }
      setSaved(batch.length);
      reset();
    } catch (err) {
      const failed = err instanceof Error ? err.message : "Save failed";
      // Anything already committed server-side is dropped from the pending set,
      // so retrying can't save the same piece twice.
      if (done.length > 0) {
        setPieces((prev) => prev?.filter((p) => !done.includes(p.category)) ?? null);
        setError(`${failed} — ${done.length} piece(s) saved, the rest are still here.`);
      } else {
        setError(failed);
      }
    } finally {
      setSaving(false);
    }
  }

  const busyLabel = progress > 0 && progress < 1 ? "Downloading the AI model" : "Reading the photo";

  return (
    <div className="page">
      <header className="page-head">
        <h1>Add to wardrobe</h1>
        <p className="lede">
          Drop in a full-body photo and we&apos;ll lift out the top, the bottom and the
          shoes as separate pieces — background and body removed.
        </p>
      </header>

      {saved !== null && (
        <div className="toast success" role="status">
          <span className="toast-icon">✨</span>
          <div>
            <strong>{saved === 1 ? "1 piece" : `${saved} pieces`} added</strong>
            <p className="muted">Your wardrobe just grew.</p>
          </div>
          <button className="ghost" onClick={() => navigate("/wardrobe")}>
            View
          </button>
        </div>
      )}

      {error && (
        <div className="toast error" role="alert">
          <span className="toast-icon">⚠️</span>
          <div>
            <strong>Didn&apos;t work</strong>
            <p className="muted">{error}</p>
          </div>
        </div>
      )}

      {stage !== "camera" && (
        <div className="mode-switch">
          <button
            className={mode === "look" ? "active" : ""}
            onClick={() => pickMode("look")}
            disabled={extracting}
          >
            <span className="mode-emoji">🧍</span>
            <span className="mode-title">Full look</span>
            <span className="mode-sub">One photo → every piece</span>
          </button>
          <button
            className={mode === "item" ? "active" : ""}
            onClick={() => pickMode("item")}
            disabled={extracting}
          >
            <span className="mode-emoji">🧺</span>
            <span className="mode-title">Single item</span>
            <span className="mode-sub">Just one garment</span>
          </button>
        </div>
      )}

      {stage === "choose" && (
        <>
          <div
            className={`dropzone ${dragging ? "dragging" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === "Enter" && fileInputRef.current?.click()}
          >
            <div className="dropzone-art" aria-hidden="true">
              <span>👕</span>
              <span>👖</span>
              <span>👟</span>
            </div>
            <strong>Drop a photo here</strong>
            <p className="muted">or click to browse — JPG, PNG, HEIC</p>
          </div>

          <div className="row">
            <button className="primary grow" onClick={() => setStage("camera")}>
              📸 Use camera
            </button>
            <button className="grow" onClick={() => fileInputRef.current?.click()}>
              Choose file
            </button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) useImage(file);
              e.target.value = "";
            }}
          />

          <ol className="steps">
            <li>
              <span className="step-n">1</span> Photograph your outfit — full body, plain
              wall works best.
            </li>
            <li>
              <span className="step-n">2</span> We cut each garment out on your device.
              Nothing leaves the browser until you save.
            </li>
            <li>
              <span className="step-n">3</span> Mix pieces into outfits and plan them on
              the calendar.
            </li>
          </ol>
        </>
      )}

      {stage === "camera" && (
        <CameraCapture onCapture={useImage} onCancel={() => setStage("choose")} />
      )}

      {stage === "review" && photoUrl && (
        <>
          <div className={`shot ${extracting ? "scanning" : ""}`}>
            <img
              src={mode === "item" && cutUrl ? cutUrl : photoUrl}
              className="preview"
              alt="photo preview"
            />
            {extracting && <div className="scanline" aria-hidden="true" />}
          </div>

          {extracting && (
            <div className="progress-wrap">
              <div className="progress">
                <div
                  className="progress-bar"
                  style={{ width: `${Math.max(6, Math.round(progress * 100))}%` }}
                />
              </div>
              <p className="muted small">
                {busyLabel}… {progress > 0 ? `${Math.round(progress * 100)}%` : ""} — the
                model downloads once, then it&apos;s instant.
              </p>
            </div>
          )}

          {mode === "item" && (
            <>
              <p className="field-label">Which part is it?</p>
              <div className="segmented">
                {CATEGORIES.map((c) => (
                  <button
                    key={c}
                    className={c === category ? "active" : ""}
                    onClick={() => pickCategory(c)}
                    disabled={extracting}
                  >
                    {CATEGORY_ICONS[c]} {CATEGORY_LABELS[c]}
                  </button>
                ))}
              </div>
            </>
          )}

          {mode === "look" && pieces && (
            <section className="found">
              <p className="field-label">
                Found {pieces.length} {pieces.length === 1 ? "piece" : "pieces"} — tap to
                exclude any you don&apos;t want.
              </p>
              <div className="piece-grid">
                {pieces.map((p) => {
                  const off = skipped.has(p.category);
                  return (
                    <button
                      key={p.category}
                      className={`piece ${off ? "off" : ""}`}
                      onClick={() => toggle(p.category)}
                      aria-pressed={!off}
                    >
                      <span className="piece-check">{off ? "＋" : "✓"}</span>
                      <img src={pieceUrls[p.category]} alt={CATEGORY_LABELS[p.category]} />
                      <span className="piece-label">
                        {CATEGORY_ICONS[p.category]} {CATEGORY_LABELS[p.category]}
                      </span>
                    </button>
                  );
                })}
              </div>
              {CATEGORIES.filter((c) => !pieces.some((p) => p.category === c)).length > 0 && (
                <p className="muted small">
                  Not spotted:{" "}
                  {CATEGORIES.filter((c) => !pieces.some((p) => p.category === c))
                    .map((c) => CATEGORY_LABELS[c].toLowerCase())
                    .join(", ")}
                  . Try a shot where the whole outfit is visible.
                </p>
              )}
            </section>
          )}

          <div className="row sticky-actions">
            {mode === "look" ? (
              !pieces ? (
                <>
                  <button className="primary grow" onClick={run} disabled={extracting}>
                    {extracting ? (
                      <>
                        <span className="spinner" />
                        Scanning…
                      </>
                    ) : (
                      "✨ Scan for pieces"
                    )}
                  </button>
                  <button onClick={reset} disabled={extracting}>
                    Retake
                  </button>
                </>
              ) : (
                <>
                  <button
                    className="primary grow"
                    onClick={save}
                    disabled={saving || keeping.length === 0}
                  >
                    {saving
                      ? "Saving…"
                      : `Add ${keeping.length} ${keeping.length === 1 ? "piece" : "pieces"} to wardrobe`}
                  </button>
                  <button onClick={reset} disabled={saving}>
                    Discard
                  </button>
                </>
              )
            ) : !extracted ? (
              <>
                <button className="primary grow" onClick={run} disabled={extracting}>
                  {extracting ? (
                    <>
                      <span className="spinner" />
                      Extracting… {Math.round(progress * 100)}%
                    </>
                  ) : (
                    `Extract ${CATEGORY_LABELS[category].toLowerCase()}`
                  )}
                </button>
                <button onClick={reset} disabled={extracting}>
                  Retake
                </button>
              </>
            ) : (
              <>
                <button className="primary grow" onClick={save} disabled={saving}>
                  {saving ? "Saving…" : "Save to wardrobe"}
                </button>
                <button onClick={reset} disabled={saving}>
                  Discard
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
