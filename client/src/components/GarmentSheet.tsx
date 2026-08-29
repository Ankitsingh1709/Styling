import { useState } from "react";
import Sheet from "./Sheet";
import Icon from "./Icon";
import {
  CATEGORIES,
  CATEGORY_ICONS,
  CATEGORY_LABELS,
  describeGarment,
  setGarmentCategory,
  type Category,
  type Garment,
} from "../api";

/**
 * What to do about a garment the extractor got wrong. Before this the only
 * remedy for a mis-filed or mis-described piece was to delete it and reshoot —
 * and since the stylist reasons from the stored description rather than the
 * image, a bad description quietly skews every later suggestion.
 */
export default function GarmentSheet({
  garment,
  onChanged,
  onDeleted,
  onClose,
}: {
  garment: Garment;
  onChanged: (g: Garment) => void;
  onDeleted: (id: number) => void;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState<"category" | "describe" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const a = garment.analysis;

  async function recategorise(c: Category) {
    if (c === garment.category) return;
    setBusy("category");
    setError(null);
    try {
      onChanged(await setGarmentCategory(garment.id, c));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't change the category.");
    } finally {
      setBusy(null);
    }
  }

  async function redescribe() {
    setBusy("describe");
    setError(null);
    try {
      onChanged(await describeGarment(garment.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't describe that garment.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Sheet title={a?.description ?? CATEGORY_LABELS[garment.category]} onClose={onClose}>
      <div
        className="studio"
        style={{ borderRadius: 16, padding: 12, marginBottom: 20, textAlign: "center" }}
      >
        <img
          src={garment.imageUrl}
          alt={a?.description ?? CATEGORY_LABELS[garment.category]}
          style={{ maxHeight: 220, maxWidth: "100%", objectFit: "contain" }}
        />
      </div>

      {error && (
        <div className="notice is-error" style={{ marginBottom: 18 }} role="alert">
          <Icon name="alert" size={21} className="notice-icon" />
          <div>
            <strong className="t-headline">{error}</strong>
          </div>
        </div>
      )}

      <p className="group-title">Filed under</p>
      <div className="segmented" role="group" aria-label="Category">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            className={c === garment.category ? "active" : ""}
            onClick={() => recategorise(c)}
            disabled={busy !== null}
          >
            <Icon name={CATEGORY_ICONS[c]} size={17} />
            {CATEGORY_LABELS[c]}
          </button>
        ))}
      </div>
      <p className="t-foot secondary" style={{ margin: "8px 4px 22px" }}>
        Moving a garment clears it from any outfit slot that held it, so nothing
        ends up worn in the wrong place.
      </p>

      <p className="group-title">Description</p>
      <div className="group" style={{ padding: 16 }}>
        {a ? (
          <>
            <p className="t-body" style={{ margin: 0 }}>{a.description}</p>
            <p className="t-foot secondary" style={{ margin: "8px 0 0" }}>
              {[a.colors.join(", "), a.pattern, a.formality, a.warmth].filter(Boolean).join(" · ")}
            </p>
            {a.occasions.length > 0 && (
              <p className="t-foot secondary" style={{ margin: "4px 0 0" }}>
                Good for: {a.occasions.join(", ")}
              </p>
            )}
          </>
        ) : (
          <p className="t-sub secondary" style={{ margin: 0 }}>
            Not described yet — the stylist can&apos;t reason about this piece until
            it is.
          </p>
        )}
        <button
          className="btn btn-small"
          style={{ marginTop: 14 }}
          onClick={redescribe}
          disabled={busy !== null}
        >
          {busy === "describe" ? <span className="spinner" /> : <Icon name="sparkles" size={17} />}
          {busy === "describe" ? "Looking again…" : a ? "Describe again" : "Describe it"}
        </button>
      </div>

      <button
        className="btn btn-danger btn-block"
        style={{ marginTop: 22 }}
        onClick={() => {
          onDeleted(garment.id);
          onClose();
        }}
        disabled={busy !== null}
      >
        <Icon name="trash" size={19} />
        Delete this garment
      </button>
    </Sheet>
  );
}
