import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  CATEGORIES,
  CATEGORY_LABELS,
  deleteOutfit,
  listGarments,
  listOutfits,
  renameOutfit,
  saveOutfit,
  type Category,
  type Garment,
  type Outfit,
} from "../api";
import BodySilhouette from "../components/BodySilhouette";
import { useBodyType } from "../lib/bodyType";

type Grouped = Record<Category, Garment[]>;
type Indices = Record<Category, number>;

const emptyGroups: Grouped = { top: [], bottom: [], shoes: [] };
const zeroIdx: Indices = { top: 0, bottom: 0, shoes: 0 };

export default function MixerPage() {
  const [groups, setGroups] = useState<Grouped>(emptyGroups);
  const [idx, setIdx] = useState<Indices>(zeroIdx);
  const [outfits, setOutfits] = useState<Outfit[]>([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const { bodyType } = useBodyType();

  useEffect(() => {
    Promise.all([listGarments(), listOutfits()])
      .then(([garments, savedOutfits]) => {
        const grouped: Grouped = { top: [], bottom: [], shoes: [] };
        for (const g of garments) grouped[g.category].push(g);
        setGroups(grouped);
        setOutfits(savedOutfits);
      })
      .catch(() => {
        setMessage("Could not load your wardrobe.");
        setFailed(true);
      })
      .finally(() => setLoading(false));
  }, []);

  function cycle(category: Category, dir: 1 | -1) {
    const len = groups[category].length;
    if (len === 0) return;
    setIdx((prev) => ({ ...prev, [category]: (prev[category] + dir + len) % len }));
    if (!failed) setMessage(null);
  }

  function current(category: Category): Garment | undefined {
    return groups[category][idx[category]];
  }

  const totalGarments = CATEGORIES.reduce((n, c) => n + groups[c].length, 0);

  async function save() {
    const sel = {
      topId: current("top")?.id ?? null,
      bottomId: current("bottom")?.id ?? null,
      shoesId: current("shoes")?.id ?? null,
    };
    if (!sel.topId && !sel.bottomId && !sel.shoesId) {
      setMessage("Add some garments first.");
      setFailed(true);
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const outfit = await saveOutfit({ ...sel, name: name.trim() || undefined });
      setOutfits((prev) => [outfit, ...prev]);
      setName("");
      setFailed(false);
      setMessage("Outfit saved.");
    } catch (err) {
      setFailed(true);
      setMessage(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function startEdit(o: Outfit) {
    setEditingId(o.id);
    setDraft(o.name ?? "");
  }

  async function commitEdit(id: number) {
    const value = draft.trim();
    setEditingId(null);
    try {
      const updated = await renameOutfit(id, value);
      setOutfits((prev) => prev.map((o) => (o.id === id ? updated : o)));
    } catch {
      /* keep previous name on failure */
    }
  }

  async function removeOutfit(id: number) {
    setOutfits((prev) => prev.filter((o) => o.id !== id));
    try {
      await deleteOutfit(id);
    } catch {
      listOutfits().then(setOutfits).catch(() => {});
    }
  }

  if (loading) {
    return (
      <div className="page">
        <header className="page-head">
          <h1>Mixer</h1>
          <p className="lede">Pulling your wardrobe together…</p>
        </header>
        <div className="skeleton" style={{ height: 420 }} />
      </div>
    );
  }

  if (totalGarments === 0) {
    return (
      <div className="page">
        <header className="page-head">
          <h1>Mixer</h1>
          <p className="lede">Swipe through your pieces to build a look.</p>
        </header>
        {failed && message ? (
          <div className="toast error" role="alert">
            <span className="toast-icon">⚠️</span>
            <div>
              <strong>{message}</strong>
              <p className="muted">Is the server running?</p>
            </div>
          </div>
        ) : (
        <div className="empty-state">
          <span className="art">🎛️</span>
          <strong>No pieces to mix yet</strong>
          <p>
            Scan a look first — one photo gives you a top, a bottom and shoes to play
            with.
          </p>
          <Link to="/">
            <button className="primary">Add garments</button>
          </Link>
        </div>
        )}
      </div>
    );
  }

  return (
    <div className="page">
      <header className="page-head">
        <h1>Mixer</h1>
        <p className="lede">
          Arrow through each layer to build a look, then name it and save.
        </p>
      </header>

      <div className="outfit">
        {bodyType && <BodySilhouette gender={bodyType} className="body-silhouette" />}
        {CATEGORIES.map((category) => {
          const items = groups[category];
          const g = current(category);
          return (
            <div key={category} style={{ width: "100%" }}>
              <div className={`mix-row ${category}`}>
                <button
                  className="arrow"
                  onClick={() => cycle(category, -1)}
                  disabled={items.length < 2}
                  aria-label={`Previous ${category}`}
                >
                  ‹
                </button>
                <div className="slot">
                  {g ? (
                    <img src={g.imageUrl} alt={category} />
                  ) : (
                    <span className="empty">No {CATEGORY_LABELS[category].toLowerCase()} yet</span>
                  )}
                </div>
                <button
                  className="arrow"
                  onClick={() => cycle(category, 1)}
                  disabled={items.length < 2}
                  aria-label={`Next ${category}`}
                >
                  ›
                </button>
              </div>
              <p className="mix-caption" style={{ textAlign: "center" }}>
                {CATEGORY_LABELS[category]}
                {items.length > 0 && ` · ${idx[category] + 1}/${items.length}`}
              </p>
            </div>
          );
        })}
      </div>

      <input
        className="text-input"
        style={{ marginTop: 16 }}
        placeholder="Name this outfit (optional) — e.g. Casual Friday"
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={60}
      />
      <button
        className="primary"
        style={{ width: "100%", marginTop: 10 }}
        onClick={save}
        disabled={saving}
      >
        {saving ? "Saving…" : "Save this outfit"}
      </button>

      {message && (
        <div
          className={`toast ${failed ? "error" : "success"}`}
          style={{ marginTop: 14 }}
          role="status"
        >
          <span className="toast-icon">{failed ? "⚠️" : "👗"}</span>
          <div>
            <strong>{message}</strong>
          </div>
        </div>
      )}

      {outfits.length > 0 && (
        <section style={{ marginTop: 32 }}>
          <div className="section-head">
            <h2>Saved outfits</h2>
            <span className="muted small">{outfits.length}</span>
          </div>
          <div className="outfit-thumbs">
            {outfits.map((o) => (
              <div className="outfit-thumb" key={o.id}>
                <div className="stack">
                  {o.top && <img src={o.top.imageUrl} alt="top" />}
                  {o.bottom && <img src={o.bottom.imageUrl} alt="bottom" />}
                  {o.shoes && <img src={o.shoes.imageUrl} alt="shoes" />}
                </div>
                <button className="del" onClick={() => removeOutfit(o.id)}>
                  ✕
                </button>
                {editingId === o.id ? (
                  <input
                    className="thumb-name-input"
                    value={draft}
                    autoFocus
                    maxLength={60}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={() => commitEdit(o.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitEdit(o.id);
                      if (e.key === "Escape") setEditingId(null);
                    }}
                  />
                ) : (
                  <button className="thumb-name-btn" onClick={() => startEdit(o)}>
                    {o.name ? o.name : "＋ name"}
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
