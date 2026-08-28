import { useEffect, useState } from "react";
import { Routes, Route } from "react-router-dom";
import TabBar from "./components/TabBar";
import Sheet from "./components/Sheet";
import BodySilhouette from "./components/BodySilhouette";
import CapturePage from "./pages/CapturePage";
import WardrobePage from "./pages/WardrobePage";
import MixerPage from "./pages/MixerPage";
import CalendarPage from "./pages/CalendarPage";
import StylistPage from "./pages/StylistPage";
import {
  BodyTypeContext,
  loadBodyType,
  persistBodyType,
  type BodyType,
} from "./lib/bodyType";
import {
  AppearanceContext,
  applyAppearance,
  loadAppearance,
  persistAppearance,
  type Appearance,
} from "./lib/appearance";

/** Asked once, on first launch. A sheet, because it's a dismissible sub-task. */
function BodyTypeSheet({ onChoose }: { onChoose: (b: BodyType) => void }) {
  return (
    <Sheet title="Who are we dressing?" onClose={() => onChoose("female")}>
      <p className="t-sub secondary" style={{ marginTop: 0 }}>
        This sets the silhouette shown behind your outfits in the mixer. You can
        change it any time in Settings.
      </p>
      <div className="row" style={{ marginTop: 18 }}>
        {(["male", "female"] as BodyType[]).map((b) => (
          <button
            key={b}
            className="btn grow"
            style={{ flexDirection: "column", height: 190, gap: 12 }}
            onClick={() => onChoose(b)}
          >
            <BodySilhouette gender={b} className="" />
            <span>{b === "male" ? "Male" : "Female"}</span>
          </button>
        ))}
      </div>
    </Sheet>
  );
}

export default function App() {
  const [bodyType, setBodyType] = useState<BodyType | null>(() => loadBodyType());
  const [appearance, setAppearanceState] = useState<Appearance>(() => loadAppearance());

  useEffect(() => {
    applyAppearance(appearance);
  }, [appearance]);

  const setAppearance = (v: Appearance) => {
    persistAppearance(v);
    setAppearanceState(v);
  };

  const choose = (b: BodyType) => {
    persistBodyType(b);
    setBodyType(b);
  };

  return (
    <AppearanceContext.Provider value={{ appearance, setAppearance }}>
      <BodyTypeContext.Provider value={{ bodyType, choose }}>
        <div className="app">
          <Routes>
            <Route path="/" element={<CapturePage />} />
            <Route path="/wardrobe" element={<WardrobePage />} />
            <Route path="/mixer" element={<MixerPage />} />
            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/stylist" element={<StylistPage />} />
          </Routes>
          <TabBar />
          {!bodyType && <BodyTypeSheet onChoose={choose} />}
        </div>
      </BodyTypeContext.Provider>
    </AppearanceContext.Provider>
  );
}
