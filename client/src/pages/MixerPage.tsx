import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Screen from "../components/Screen";
import Icon from "../components/Icon";
import BodySilhouette from "../components/BodySilhouette";
import MixStrip from "../components/MixStrip";
import { useBodyType } from "../lib/bodyType";
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
      .then(([garments, saved]) => {
        const grouped: Grouped = { top: [], bottom: [], shoes: [] };
        for (const g of garments) grouped[g.category].push(g);
        setGroups(grouped);
        setOutfits(saved);
      })
      .catch(() => {
        setMessage("Couldn't reach the server.");
        setFailed(true);
      })
      .finally(() => setLoading(false));
  }, []);

  function selectIndex(category: Category, next: number) {
    setIdx((prev) => (prev[category] === next ? prev : { ...prev, [category]: next }));
    if (!failed) setMessage(null);
  }

  const current = (c: Category): Garment | undefined => groups[c][idx[c]];
  const total = CATEGORIES.reduce((n, c) => n + groups[c].length, 0);

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
      setMessage(err instanceof Error ? err.message : "Couldn't save that outfit.");
    } finally {
      setSaving(false);
    }
  }

  async function commitEdit(id: number) {
    const value = draft.trim();
    setEditingId(null);
    try {
      const updated = await renameOutfit(id, value);
      setOutfits((prev) => prev.map((o) => (o.id === id ? updated : o)));
    } catch {
      /* keep the previous name on failure */
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
      <Screen title="Mixer" lede="Pulling your wardrobe together…">
        <div className="skeleton" style={{ height: 420 }} />
      </Screen>
    );
  }

  if (total === 0) {
    return (
      <Screen title="Mixer" lede="Swipe through your pieces to build a look.">
        {failed && message ? (
          <div className="notice is-error" role="alert">
            <Icon name="alert" size={21} className="notice-icon" />
            <div>
              <strong className="t-headline">{message}</strong>
              <p className="t-foot">Check that the app&apos;s server is running.</p>
            </div>
          </div>
        ) : (
          <div className="empty">
            <span className="empty-icon">
              <Icon name="sliders" size={28} />
            </span>
            <strong className="t-title">No pieces to mix yet</strong>
            <p className="t-sub">
              Scan a look first — one photo gives you a top, a bottom and shoes to
              play with.
            </p>
            <Link to="/">
              <button className="btn btn-primary">Add garments</button>
            </Link>
          </div>
        )}
      </Screen>
    );
  }

  return (
    <Screen title="Mixer" lede="Swipe each layer to the piece you want, then name the look and save it.">
      <div className="outfit">
        {bodyType && <BodySilhouette gender={bodyType} className="body-silhouette" />}
        {CATEGORIES.map((category) => {
          const items = groups[category];
          return (
            <div key={category} style={{ width: "100%" }}>
              <MixStrip
                items={items}
                category={category}
                index={idx[category]}
                onIndexChange={(i) => selectIndex(category, i)}
              />
              <p className="mix-caption" style={{ textAlign: "center" }}>
                {CATEGORY_LABELS[category]}
                {items.length > 0 && ` · ${idx[category] + 1} of ${items.length}`}
              </p>
            </div>
          );
        })}
      </div>

      <input
        className="field"
        style={{ marginTop: 16 }}
        placeholder="Name this look (optional)"
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={60}
      />
      <button
        className="btn btn-primary btn-block"
        style={{ marginTop: 10 }}
        onClick={save}
        disabled={saving}
      >
        {saving ? "Saving…" : "Save this outfit"}
      </button>

      {message && (
        <div
          className={`notice ${failed ? "is-error" : ""}`}
          style={{ marginTop: 14 }}
          role="status"
        >
          <Icon name={failed ? "alert" : "check"} size={21} className="notice-icon" />
          <div>
            <strong className="t-headline">{message}</strong>
          </div>
        </div>
      )}

      {outfits.length > 0 && (
        <section style={{ marginTop: 30 }}>
          <p className="group-title">Saved outfits · {outfits.length}</p>
          <div className="outfit-grid soften-at-edges">
            {outfits.map((o) => (
              <div className="outfit-card" key={o.id}>
                <div className="stack">
                  {o.top && <img src={o.top.imageUrl} alt="" />}
                  {o.bottom && <img src={o.bottom.imageUrl} alt="" />}
                  {o.shoes && <img src={o.shoes.imageUrl} alt="" />}
                </div>
                <button
                  className="remove"
                  onClick={() => removeOutfit(o.id)}
                  aria-label={`Delete ${o.name ?? "outfit"}`}
                >
                  <Icon name="close" size={13} strokeWidth={2.2} />
                </button>
                {editingId === o.id ? (
                  <input
                    className="field"
                    style={{ minHeight: 30, padding: "4px 6px", fontSize: "0.6875rem", marginTop: 5 }}
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
                  <button
                    className="name"
                    style={{ background: "none", border: "none", width: "100%" }}
                    onClick={() => {
                      setEditingId(o.id);
                      setDraft(o.name ?? "");
                    }}
                  >
                    {o.name ?? "Add a name"}
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </Screen>
  );
}
