import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Screen from "../components/Screen";
import Icon from "../components/Icon";
import SettingsSheet from "../components/SettingsSheet";
import GarmentSheet from "../components/GarmentSheet";
import {
  CATEGORIES,
  CATEGORY_ICONS,
  CATEGORY_LABELS,
  deleteGarment,
  listGarments,
  type Category,
  type Garment,
} from "../api";

type Filter = Category | "all";

export default function WardrobePage() {
  const [garments, setGarments] = useState<Garment[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState(false);
  const [openGarment, setOpenGarment] = useState<Garment | null>(null);

  async function refresh() {
    try {
      setGarments(await listGarments());
      setError(null);
    } catch {
      setError("Couldn't reach the server.");
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

  const settingsAction = (
    <button
      className="nav-bar-action"
      onClick={() => setSettings(true)}
      aria-label="Settings"
    >
      <Icon name="person" size={22} />
    </button>
  );

  // Re-filing the last garment of the filtered category would otherwise leave a
  // dead screen: the chip disabled but still active, no items, and no empty
  // state (the wardrobe as a whole isn't empty).
  useEffect(() => {
    if (filter !== "all" && counts[filter] === 0) setFilter("all");
  }, [filter, counts]);

  const shown = CATEGORIES.filter((c) => filter === "all" || c === filter);

  return (
    <Screen
      title="Wardrobe"
      action={settingsAction}
      lede={
        loading
          ? "Loading your pieces…"
          : garments.length === 0
            ? "Every piece you scan lands here."
            : `${garments.length} ${garments.length === 1 ? "piece" : "pieces"}, cut out and ready to mix.`
      }
    >
      {settings && <SettingsSheet onClose={() => setSettings(false)} />}

      {openGarment && (
        <GarmentSheet
          garment={openGarment}
          onChanged={(g) => {
            setGarments((prev) => prev.map((x) => (x.id === g.id ? g : x)));
            setOpenGarment(g);
          }}
          onDeleted={remove}
          onClose={() => setOpenGarment(null)}
        />
      )}

      {loading && (
        <div className="garment-grid">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="skeleton tile" />
          ))}
        </div>
      )}

      {!loading && error && (
        <div className="notice is-error" role="alert">
          <Icon name="alert" size={21} className="notice-icon" />
          <div>
            <strong className="t-headline">{error}</strong>
            <p className="t-foot">Check that the app&apos;s server is running.</p>
          </div>
          <button className="btn btn-plain btn-small" onClick={refresh}>
            Retry
          </button>
        </div>
      )}

      {!loading && !error && garments.length === 0 && (
        <div className="empty">
          <span className="empty-icon">
            <Icon name="hanger" size={28} />
          </span>
          <strong className="t-title">Nothing hanging up yet</strong>
          <p className="t-sub">
            Photograph one outfit and we&apos;ll pull the top, bottom and shoes out
            of it in a single pass.
          </p>
          <Link to="/">
            <button className="btn btn-primary">Add your first look</button>
          </Link>
        </div>
      )}

      {!loading && !error && garments.length > 0 && (
        <>
          <div className="segmented" style={{ marginBottom: 20 }} role="group" aria-label="Filter">
            <button
              className={filter === "all" ? "active" : ""}
              onClick={() => setFilter("all")}
            >
              All
            </button>
            {CATEGORIES.map((c) => (
              <button
                key={c}
                className={filter === c ? "active" : ""}
                onClick={() => setFilter(c)}
                disabled={counts[c] === 0}
              >
                <Icon name={CATEGORY_ICONS[c]} size={17} />
                {counts[c]}
              </button>
            ))}
          </div>

          {shown.map((category) => {
            const items = garments.filter((g) => g.category === category);
            if (items.length === 0) return null;
            return (
              <section key={category} style={{ marginBottom: 26 }}>
                <p className="group-title">
                  {CATEGORY_LABELS[category]} · {items.length}
                </p>
                <div className="garment-grid">
                  {items.map((g) => (
                    <button
                      className="garment"
                      key={g.id}
                      onClick={() => setOpenGarment(g)}
                      aria-label={`${g.analysis?.description ?? CATEGORY_LABELS[category]} — edit`}
                    >
                      <img
                        src={g.imageUrl}
                        alt={g.analysis?.description ?? CATEGORY_LABELS[category]}
                        loading="lazy"
                      />
                    </button>
                  ))}
                </div>
              </section>
            );
          })}
        </>
      )}
    </Screen>
  );
}
