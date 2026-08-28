import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Screen from "../components/Screen";
import Sheet from "../components/Sheet";
import Icon from "../components/Icon";
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

function Stack({ outfit }: { outfit: Outfit }) {
  return (
    <div className="stack">
      {outfit.top && <img src={outfit.top.imageUrl} alt="" />}
      {outfit.bottom && <img src={outfit.bottom.imageUrl} alt="" />}
      {outfit.shoes && <img src={outfit.shoes.imageUrl} alt="" />}
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
      .catch(() => setMessage("Couldn't reach the server."))
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

  async function assign(date: string, outfitId: number) {
    setMessage(null);
    try {
      const wear = await setWear(date, outfitId);
      setWears((prev) => [...prev.filter((w) => w.date !== date), wear]);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Couldn't save that.");
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

  const firstDow = new Date(view.year, view.month, 1).getDay();
  const daysInMonth = new Date(view.year, view.month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  if (loading) {
    return (
      <Screen title="Calendar" lede="Loading your plan…">
        <div className="skeleton" style={{ height: 320 }} />
      </Screen>
    );
  }

  const selectedWear = selected ? wearByDate.get(selected) : undefined;
  const monthLabel = `${MONTHS[view.month]} ${view.year}`;
  const isThisMonth =
    view.year === today.getFullYear() && view.month === today.getMonth();

  return (
    <Screen title="Calendar" lede="Tap a day to plan what you're wearing.">
      <div className="cal-head">
        <h2 className="t-title">{monthLabel}</h2>
        <div className="row" style={{ gap: 2 }}>
          {!isThisMonth && (
            <button
              className="btn btn-plain btn-small"
              onClick={() => setView({ year: today.getFullYear(), month: today.getMonth() })}
            >
              Today
            </button>
          )}
          <button
            className="nav-bar-action"
            style={{ position: "static" }}
            onClick={() => shiftMonth(-1)}
            aria-label="Previous month"
          >
            <Icon name="chevronLeft" size={20} strokeWidth={2} />
          </button>
          <button
            className="nav-bar-action"
            style={{ position: "static" }}
            onClick={() => shiftMonth(1)}
            aria-label="Next month"
          >
            <Icon name="chevronRight" size={20} strokeWidth={2} />
          </button>
        </div>
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
            date === todayStr ? "today" : "",
            date === selected ? "selected" : "",
          ].join(" ");
          return (
            <button
              key={date}
              className={classes}
              onClick={() => setSelected(date)}
              aria-label={`${day} ${monthLabel}${wear ? `, wearing ${wear.outfit.name ?? "an outfit"}` : ""}`}
            >
              {wear && (
                <img
                  className="thumb"
                  src={wear.outfit.top?.imageUrl ?? wear.outfit.bottom?.imageUrl}
                  alt=""
                />
              )}
              <span>{day}</span>
            </button>
          );
        })}
      </div>

      {message && (
        <div className="notice is-error" style={{ marginTop: 18 }} role="alert">
          <Icon name="alert" size={21} className="notice-icon" />
          <div>
            <strong className="t-headline">{message}</strong>
          </div>
        </div>
      )}

      {selected && (
        <Sheet
          title={selected === todayStr ? "Today" : new Date(selected).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}
          onClose={() => setSelected(null)}
        >
          {selectedWear && (
            <div style={{ marginBottom: 20 }}>
              <p className="group-title">
                Wearing{selectedWear.outfit.name ? ` · ${selectedWear.outfit.name}` : ""}
              </p>
              <div className="row" style={{ alignItems: "center", gap: 14 }}>
                <div className="outfit-card" style={{ width: 96, flex: "0 0 auto" }}>
                  <Stack outfit={selectedWear.outfit} />
                </div>
                <button className="btn btn-danger btn-small" onClick={() => clear(selected)}>
                  <Icon name="trash" size={17} />
                  Clear day
                </button>
              </div>
            </div>
          )}

          <p className="group-title">
            {selectedWear ? "Change to" : "Pick an outfit"}
          </p>
          {outfits.length === 0 ? (
            <div className="empty" style={{ padding: "24px 8px" }}>
              <span className="empty-icon">
                <Icon name="sliders" size={26} />
              </span>
              <strong className="t-headline">No saved outfits yet</strong>
              <p className="t-sub">
                Build one in the <Link to="/mixer">Mixer</Link> and it&apos;ll show up here.
              </p>
            </div>
          ) : (
            <div className="outfit-grid">
              {outfits.map((o) => (
                <button
                  key={o.id}
                  className="outfit-card"
                  onClick={() => {
                    assign(selected, o.id);
                    setSelected(null);
                  }}
                >
                  <Stack outfit={o} />
                  <span className="name">{o.name ?? "Unnamed"}</span>
                </button>
              ))}
            </div>
          )}
        </Sheet>
      )}
    </Screen>
  );
}
