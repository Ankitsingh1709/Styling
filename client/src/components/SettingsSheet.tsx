import Sheet from "./Sheet";
import Icon, { type IconName } from "./Icon";
import { useAppearance, type Appearance } from "../lib/appearance";
import { useBodyType, type BodyType } from "../lib/bodyType";

const appearances: { id: Appearance; label: string; icon: IconName }[] = [
  { id: "system", label: "System", icon: "contrast" },
  { id: "light", label: "Light", icon: "sun" },
  { id: "dark", label: "Dark", icon: "moon" },
];

export default function SettingsSheet({ onClose }: { onClose: () => void }) {
  const { appearance, setAppearance } = useAppearance();
  const { bodyType, choose } = useBodyType();

  return (
    <Sheet title="Settings" onClose={onClose}>
      <p className="group-title">Appearance</p>
      <div className="segmented" role="group" aria-label="Appearance">
        {appearances.map((a) => (
          <button
            key={a.id}
            className={appearance === a.id ? "active" : ""}
            onClick={() => setAppearance(a.id)}
            aria-pressed={appearance === a.id}
          >
            <Icon name={a.icon} size={17} />
            {a.label}
          </button>
        ))}
      </div>
      <p className="t-foot secondary" style={{ margin: "8px 4px 22px" }}>
        System follows your device. Light and dark are both designed for; pick one
        to override.
      </p>

      <p className="group-title">Body shape</p>
      <div className="segmented" role="group" aria-label="Body shape">
        {(["male", "female"] as BodyType[]).map((b) => (
          <button
            key={b}
            className={bodyType === b ? "active" : ""}
            onClick={() => choose(b)}
            aria-pressed={bodyType === b}
          >
            {b === "male" ? "Male" : "Female"}
          </button>
        ))}
      </div>
      <p className="t-foot secondary" style={{ margin: "8px 4px 0" }}>
        Sets the silhouette shown behind your outfits in the mixer. Stays on this
        device.
      </p>
    </Sheet>
  );
}
