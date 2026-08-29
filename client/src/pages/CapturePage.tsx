import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Screen from "../components/Screen";
import Icon from "../components/Icon";
import CameraCapture from "../components/CameraCapture";
import {
  extractAllGarments,
  extractGarment,
  releaseSegmentationCache,
  type ExtractedPiece,
} from "../lib/extract";
import {
  CATEGORIES,
  CATEGORY_ICONS,
  CATEGORY_LABELS,
  saveGarment,
  type Category,
} from "../api";

type Stage = "choose" | "camera" | "review";
/** "look" = one full-body photo → every piece. "item" = one garment, one category. */
type Mode = "look" | "item";

export default function CapturePage() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<Mode>("look");
  const [stage, setStage] = useState<Stage>("choose");
  const [original, setOriginal] = useState<Blob | null>(null);
  const [dragging, setDragging] = useState(false);

  const [extracted, setExtracted] = useState<Blob | null>(null);
  const [category, setCategory] = useState<Category>("top");

  const [pieces, setPieces] = useState<ExtractedPiece[] | null>(null);
  const [skipped, setSkipped] = useState<Set<Category>>(new Set());

  const [extracting, setExtracting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<number | null>(null);

  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!original) return setPhotoUrl(null);
    const url = URL.createObjectURL(original);
    setPhotoUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [original]);

  const [cutUrl, setCutUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!extracted) return setCutUrl(null);
    const url = URL.createObjectURL(extracted);
    setCutUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [extracted]);

  const [pieceUrls, setPieceUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!pieces) return setPieceUrls({});
    const urls = Object.fromEntries(pieces.map((p) => [p.category, URL.createObjectURL(p.blob)]));
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
    setExtracted(null); // re-extract for the new category (cached → fast)
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
      if (mode === "look") setPieces(await extractAllGarments(original, setProgress));
      else setExtracted(await extractGarment(original, category, setProgress));
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
      next.has(c) ? next.delete(c) : next.add(c);
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

  const missing = pieces
    ? CATEGORIES.filter((c) => !pieces.some((p) => p.category === c))
    : [];

  return (
    <Screen
      title="Capture"
      lede="Photograph a whole outfit and we'll lift the top, the bottom and the shoes out of it as separate pieces."
    >
      {saved !== null && (
        <div className="notice" style={{ marginBottom: 18 }} role="status">
          <Icon name="check" size={21} className="notice-icon" />
          <div>
            <strong className="t-headline">
              {saved === 1 ? "1 piece added" : `${saved} pieces added`}
            </strong>
            <p className="t-foot">Your wardrobe just grew.</p>
          </div>
          <button className="btn btn-plain btn-small" onClick={() => navigate("/wardrobe")}>
            View
          </button>
        </div>
      )}

      {error && (
        <div className="notice is-error" style={{ marginBottom: 18 }} role="alert">
          <Icon name="alert" size={21} className="notice-icon" />
          <div>
            <strong className="t-headline">That didn&apos;t work</strong>
            <p className="t-foot">{error}</p>
          </div>
        </div>
      )}

      {stage !== "camera" && (
        <div className="segmented" style={{ marginBottom: 18 }} role="group" aria-label="Capture mode">
          <button
            className={mode === "look" ? "active" : ""}
            onClick={() => pickMode("look")}
            disabled={extracting}
          >
            Full look
          </button>
          <button
            className={mode === "item" ? "active" : ""}
            onClick={() => pickMode("item")}
            disabled={extracting}
          >
            Single item
          </button>
        </div>
      )}

      {stage === "choose" && (
        <>
          <button
            className={`dropzone ${dragging ? "dragging" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <Icon name="photo" size={30} />
            <span className="t-headline">Drop a photo, or choose one</span>
            <span className="t-foot hint">
              {mode === "look"
                ? "A full-body shot works best — plain wall, good light."
                : "One garment, laid flat or worn."}
            </span>
          </button>

          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn btn-primary grow" onClick={() => setStage("camera")}>
              <Icon name="camera" size={20} />
              Use camera
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

          <p className="t-foot secondary measure" style={{ marginTop: 22 }}>
            Everything is cut out on your device. Nothing is uploaded until you save.
          </p>
        </>
      )}

      {stage === "camera" && (
        <CameraCapture onCapture={useImage} onCancel={() => setStage("choose")} />
      )}

      {stage === "review" && photoUrl && (
        <>
          <div className="shot">
            <img src={mode === "item" && cutUrl ? cutUrl : photoUrl} alt="" />
            {extracting && <div className="scan-veil" />}
          </div>

          {extracting && (
            <div style={{ marginTop: 14 }}>
              <div className="progress">
                <div
                  className="progress-bar"
                  style={{ width: `${Math.max(6, Math.round(progress * 100))}%` }}
                />
              </div>
              <p className="t-foot secondary" style={{ marginTop: 8 }}>
                {progress > 0 && progress < 1
                  ? `Downloading the model — ${Math.round(progress * 100)}%. This happens once.`
                  : "Reading the photo…"}
              </p>
            </div>
          )}

          {mode === "item" && (
            <>
              <p className="group-title" style={{ marginTop: 20 }}>Which part is it?</p>
              <div className="segmented" role="group" aria-label="Category">
                {CATEGORIES.map((c) => (
                  <button
                    key={c}
                    className={c === category ? "active" : ""}
                    onClick={() => pickCategory(c)}
                    disabled={extracting}
                  >
                    <Icon name={CATEGORY_ICONS[c]} size={17} />
                    {CATEGORY_LABELS[c]}
                  </button>
                ))}
              </div>
            </>
          )}

          {mode === "look" && pieces && (
            <section style={{ marginTop: 20 }}>
              <p className="group-title">
                Found {pieces.length} {pieces.length === 1 ? "piece" : "pieces"} — tap one to leave it out
              </p>
              <div className="piece-grid">
                {pieces.map((p) => {
                  const off = skipped.has(p.category);
                  return (
                    <button
                      key={p.category}
                      className={`piece ${off ? "excluded" : ""}`}
                      onClick={() => toggle(p.category)}
                      aria-pressed={!off}
                    >
                      <span className="tick">
                        <Icon name={off ? "plus" : "check"} size={13} strokeWidth={2.4} />
                      </span>
                      <img src={pieceUrls[p.category]} alt={CATEGORY_LABELS[p.category]} />
                      <span className="piece-name">{CATEGORY_LABELS[p.category]}</span>
                    </button>
                  );
                })}
              </div>
              {missing.length > 0 && (
                <p className="t-foot secondary" style={{ marginTop: 10 }}>
                  No {missing.map((c) => CATEGORY_LABELS[c].toLowerCase()).join(" or ")} found.
                  Try a shot where the whole outfit is visible.
                </p>
              )}
            </section>
          )}

          <div className="row" style={{ marginTop: 18 }}>
            {mode === "look" ? (
              !pieces ? (
                <>
                  <button className="btn btn-primary grow" onClick={run} disabled={extracting}>
                    {extracting ? <span className="spinner" /> : <Icon name="sparkles" size={20} />}
                    {extracting ? "Scanning…" : "Scan for pieces"}
                  </button>
                  <button className="btn" onClick={reset} disabled={extracting}>
                    Retake
                  </button>
                </>
              ) : (
                <>
                  <button
                    className="btn btn-primary grow"
                    onClick={save}
                    disabled={saving || keeping.length === 0}
                  >
                    {saving
                      ? "Saving…"
                      : `Add ${keeping.length} ${keeping.length === 1 ? "piece" : "pieces"}`}
                  </button>
                  <button className="btn" onClick={reset} disabled={saving}>
                    Discard
                  </button>
                </>
              )
            ) : !extracted ? (
              <>
                <button className="btn btn-primary grow" onClick={run} disabled={extracting}>
                  {extracting ? <span className="spinner" /> : null}
                  {extracting
                    ? `Extracting… ${Math.round(progress * 100)}%`
                    : `Extract ${CATEGORY_LABELS[category].toLowerCase()}`}
                </button>
                <button className="btn" onClick={reset} disabled={extracting}>
                  Retake
                </button>
              </>
            ) : (
              <>
                <button className="btn btn-primary grow" onClick={save} disabled={saving}>
                  {saving ? "Saving…" : "Save to wardrobe"}
                </button>
                <button className="btn" onClick={reset} disabled={saving}>
                  Discard
                </button>
              </>
            )}
          </div>
        </>
      )}
    </Screen>
  );
}
