import { NavLink } from "react-router-dom";
import Icon, { type IconName } from "./Icon";

/** Top-level sections, never actions — iOS allows 2–5 and this app has 5. */
const tabs: { to: string; label: string; icon: IconName; end: boolean }[] = [
  { to: "/", label: "Capture", icon: "camera", end: true },
  { to: "/wardrobe", label: "Wardrobe", icon: "hanger", end: false },
  { to: "/mixer", label: "Mixer", icon: "sliders", end: false },
  { to: "/calendar", label: "Calendar", icon: "calendar", end: false },
  { to: "/stylist", label: "Stylist", icon: "sparkles", end: false },
];

export default function TabBar() {
  return (
    <nav className="tab-bar" aria-label="Sections">
      {tabs.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          end={t.end}
          className={({ isActive }) => `tab ${isActive ? "active" : ""}`}
        >
          {({ isActive }) => (
            <>
              <Icon name={t.icon} size={25} strokeWidth={isActive ? 2 : 1.7} />
              <span className="tab-label">{t.label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
