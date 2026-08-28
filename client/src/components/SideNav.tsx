import { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useBodyType } from "../lib/bodyType";

const links = [
  { to: "/", label: "Capture", icon: "📸", end: true },
  { to: "/wardrobe", label: "Wardrobe", icon: "🧥", end: false },
  { to: "/mixer", label: "Mixer", icon: "🎛️", end: false },
  { to: "/calendar", label: "Calendar", icon: "🗓️", end: false },
  { to: "/stylist", label: "Stylist", icon: "✨", end: false },
];

export default function SideNav() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const { bodyType, choose } = useBodyType();

  // Title beside the burger reflects the current section.
  const active = links.find((l) => (l.end ? location.pathname === l.to : location.pathname.startsWith(l.to)));
  const title = active?.label ?? "Wardrobe";

  return (
    <>
      <header className="topbar">
        <button
          className="burger"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          aria-expanded={open}
        >
          <span />
          <span />
          <span />
        </button>
        <span className="topbar-title">
          {active?.icon} {title}
        </span>
        <span className="topbar-brand">Wardrobe</span>
      </header>

      {open && <div className="drawer-overlay" onClick={() => setOpen(false)} />}

      <aside className={`drawer ${open ? "open" : ""}`} aria-hidden={!open}>
        <div className="drawer-head">
          <span className="drawer-logo">Wardrobe</span>
          <button
            className="drawer-close"
            onClick={() => setOpen(false)}
            aria-label="Close menu"
          >
            ✕
          </button>
        </div>
        <nav>
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              className={({ isActive }) => (isActive ? "active" : "")}
              onClick={() => setOpen(false)}
            >
              <span className="nav-icon" aria-hidden="true">{l.icon}</span>
              {l.label}
            </NavLink>
          ))}
        </nav>

        <div className="drawer-foot">
          <p className="field-label" style={{ margin: "0 0 8px" }}>Body type</p>
          <div className="segmented">
            <button
              className={bodyType === "male" ? "active" : ""}
              onClick={() => choose("male")}
            >
              Male
            </button>
            <button
              className={bodyType === "female" ? "active" : ""}
              onClick={() => choose("female")}
            >
              Female
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
