import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  CATEGORIES,
  CATEGORY_LABELS,
  deleteGarment,
  listGarments,
  type Category,
  type Garment,
} from "../api";

const CATEGORY_ICONS: Record<Category, string> = {
  top: "👕",
  bottom: "👖",
  shoes: "👟",
};

type Filter = Category | "all";

export default function WardrobePage() {
  const [garments, setGarments] = useState<Garment[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    try {
      setGarments(await listGarments());
      setError(null);
    } catch {
      setError("Could not load your wardrobe.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function remove(id: number) {
    setGarments((g) => g.filter((x) => x.id !== id)); // optimistic
    try {
      await deleteGarment(id);
    } catch {
      refresh(); // revert to server truth on failure
    }
  }

  const counts = useMemo(() => {
    const c: Record<Category, number> = { top: 0, bottom: 0, shoes: 0 };
    for (const g of garments) c[g.category]++;
    return c;
  }, [garments]);

  const shown = CATEGORIES.filter((c) => filter === "all" || c === filter);

  if (loading) {
    return (
      <div className="page">
        <header className="page-head">
          <h1>Wardrobe</h1>
          <p className="lede">Fetching your pieces…</p>
        </header>
        <div className="grid">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="skeleton tile" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page">
        <h1>Wardrobe</h1>
        <div className="toast error" role="alert">
          <span className="toast-icon">⚠️</span>
          <div>
            <strong>{error}</strong>
            <p className="muted">Is the server running?</p>
          </div>
          <button className="ghost" onClick={refresh}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <header className="page-head">
        <h1>Wardrobe</h1>
        <p className="lede">
          {garments.length === 0
            ? "Empty for now — every piece you scan lands here."
            : `${garments.length} ${garments.length === 1 ? "piece" : "pieces"}, cut out and ready to mix.`}
        </p>
      </header>

      {garments.length === 0 ? (
        <div className="empty-state">
          <span className="art">🪞</span>
          <strong>Nothing hanging up yet</strong>
          <p>
            Take one full-body photo and we&apos;ll pull the top, bottom and shoes out of
            it in a single pass.
          </p>
          <Link to="/">
            <button className="primary">Add your first look</button>
          </Link>
        </div>
      ) : (
        <>
          <div className="stats">
            {CATEGORIES.map((c) => (
              <div className="stat" key={c}>
                <div className="stat-n">{counts[c]}</div>
                <div className="stat-l">{CATEGORY_LABELS[c]}</div>
              </div>
            ))}
          </div>

          <div className="chips">
            <button
              className={`chip ${filter === "all" ? "active" : ""}`}
              onClick={() => setFilter("all")}
            >
              All <span className="count">{garments.length}</span>
            </button>
            {CATEGORIES.map((c) => (
              <button
                key={c}
                className={`chip ${filter === c ? "active" : ""}`}
                onClick={() => setFilter(c)}
              >
                {CATEGORY_ICONS[c]} {CATEGORY_LABELS[c]}
                <span className="count">{counts[c]}</span>
              </button>
            ))}
          </div>

          {shown.map((category) => {
            const items = garments.filter((g) => g.category === category);
            if (items.length === 0) return null;
            return (
              <section key={category} style={{ marginBottom: 28 }}>
                <div className="section-head">
                  <h2>
                    {CATEGORY_ICONS[category]} {CATEGORY_LABELS[category]}
                  </h2>
                  <span className="muted small">{items.length}</span>
                </div>
                <div className="grid">
                  {items.map((g, i) => (
                    <div
                      className="garment"
                      key={g.id}
                      style={{ animationDelay: `${Math.min(i, 8) * 0.04}s` }}
                    >
                      <img src={g.imageUrl} alt={CATEGORY_LABELS[category]} />
                      <span className="tag">{CATEGORY_ICONS[category]}</span>
                      <button
                        className="del"
                        onClick={() => remove(g.id)}
                        aria-label={`Delete ${CATEGORY_LABELS[category]}`}
                      >
                        Delete
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}

          {shown.every((c) => counts[c] === 0) && (
            <div className="empty-state">
              <span className="art">🧺</span>
              <strong>Nothing in this category yet</strong>
              <p>Scan a look that includes one.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
