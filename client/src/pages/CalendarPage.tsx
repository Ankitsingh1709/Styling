import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  clearWear,
  listOutfits,
  listWears,
  setWear,
  ymd,
  type Outfit,
  type Wear,
} from "../api";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

function OutfitStack({ outfit }: { outfit: Outfit }) {
  return (
    <div className="stack">
      {outfit.top && <img src={outfit.top.imageUrl} alt="top" />}
      {outfit.bottom && <img src={outfit.bottom.imageUrl} alt="bottom" />}
      {outfit.shoes && <img src={outfit.shoes.imageUrl} alt="shoes" />}
    </div>
  );
}

export default function CalendarPage() {
  const today = new Date();
  const [view, setView] = useState({ year: today.getFullYear(), month: today.getMonth() });
  const [outfits, setOutfits] = useState<Outfit[]>([]);
  const [wears, setWears] = useState<Wear[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([listOutfits(), listWears()])
      .then(([o, w]) => {
        setOutfits(o);
        setWears(w);
      })
      .catch(() => setMessage("Could not load the calendar."))
      .finally(() => setLoading(false));
  }, []);

  const wearByDate = useMemo(() => {
    const m = new Map<string, Wear>();
    for (const w of wears) m.set(w.date, w);
    return m;
  }, [wears]);

  const todayStr = ymd(today);

  function shiftMonth(delta: number) {
    setView((v) => {
      const d = new Date(v.year, v.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
    setSelected(null);
  }

  function goToday() {
    setView({ year: today.getFullYear(), month: today.getMonth() });
    setSelected(todayStr);
  }

  async function assign(date: string, outfitId: number) {
    setMessage(null);
    try {
      const wear = await setWear(date, outfitId);
      setWears((prev) => [...prev.filter((w) => w.date !== date), wear]);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to save");
    }
  }

  async function clear(date: string) {
    setWears((prev) => prev.filter((w) => w.date !== date)); // optimistic
    try {
      await clearWear(date);
    } catch {
      listWears().then(setWears).catch(() => {});
    }
  }

  // Build the grid: leading blanks for the first-of-month offset, then the days.
  const firstDow = new Date(view.year, view.month, 1).getDay();
  const daysInMonth = new Date(view.year, view.month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  if (loading) {
    return (
      <div className="page">
        <header className="page-head">
          <h1>Calendar</h1>
          <p className="lede">Loading your plan…</p>
        </header>
        <div className="skeleton" style={{ height: 320 }} />
      </div>
    );
  }

  const selectedWear = selected ? wearByDate.get(selected) : undefined;

  return (
    <div className="page">
      <header className="page-head">
        <h1>Calendar</h1>
        <p className="lede">
          Plan what you&apos;re wearing — tap a day, pick a saved outfit.
        </p>
      </header>

      <div className="cal-header">
        <button className="arrow" onClick={() => shiftMonth(-1)} aria-label="Previous month">‹</button>
        <div className="cal-title">
          {MONTHS[view.month]} {view.year}
        </div>
        <button className="arrow" onClick={() => shiftMonth(1)} aria-label="Next month">›</button>
      </div>
      <div className="row" style={{ justifyContent: "center", marginBottom: 12 }}>
        <button onClick={goToday}>Today</button>
      </div>

      <div className="cal-grid">
        {WEEKDAYS.map((d, i) => (
          <div key={`h${i}`} className="cal-dow">{d}</div>
        ))}
        {cells.map((day, i) => {
          if (day === null) return <div key={`b${i}`} />;
          const date = ymd(new Date(view.year, view.month, day));
          const wear = wearByDate.get(date);
          const classes = [
            "cal-day",
            date === todayStr ? "is-today" : "",
            date === selected ? "is-selected" : "",
          ].join(" ");
          return (
            <button key={date} className={classes} onClick={() => setSelected(date)}>
              <span className="cal-num">
                {day}
                {wear && <span className="cal-dot" aria-label="outfit planned" />}
              </span>
              {wear && (
                <div className="cal-mini" title={wear.outfit.name ?? "Outfit planned"}>
                  <OutfitStack outfit={wear.outfit} />
                </div>
              )}
            </button>
          );
        })}
      </div>

      {selected && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
            <strong>{selected === todayStr ? "Today" : selected}</strong>
            {selectedWear && (
              <button className="danger" onClick={() => clear(selected)}>Clear day</button>
            )}
          </div>

          {selectedWear && (
            <div style={{ marginTop: 10 }}>
              <p className="muted" style={{ margin: "0 0 6px" }}>
                Wearing{selectedWear.outfit.name ? `: ${selectedWear.outfit.name}` : ""}
              </p>
              <div className="outfit-thumb" style={{ maxWidth: 110 }}>
                <OutfitStack outfit={selectedWear.outfit} />
              </div>
            </div>
          )}

          <p className="muted" style={{ margin: "14px 0 8px" }}>
            {selectedWear ? "Change to another outfit:" : "Pick an outfit for this day:"}
          </p>
          {outfits.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>
              No saved outfits yet — build one in the <Link to="/mixer">Mixer</Link>.
            </p>
          ) : (
            <div className="outfit-thumbs">
              {outfits.map((o) => (
                <button
                  key={o.id}
                  className="outfit-thumb"
                  style={{ cursor: "pointer" }}
                  onClick={() => assign(selected, o.id)}
                >
                  <OutfitStack outfit={o} />
                  {o.name && <p className="thumb-name">{o.name}</p>}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {message && (
        <div className="toast error" style={{ marginTop: 14 }} role="alert">
          <span className="toast-icon">⚠️</span>
          <div>
            <strong>{message}</strong>
          </div>
        </div>
      )}
    </div>
  );
}
