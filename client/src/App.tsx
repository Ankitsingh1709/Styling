import { useState } from "react";
import { Routes, Route } from "react-router-dom";
import SideNav from "./components/SideNav";
import CapturePage from "./pages/CapturePage";
import WardrobePage from "./pages/WardrobePage";
import MixerPage from "./pages/MixerPage";
import CalendarPage from "./pages/CalendarPage";
import StylistPage from "./pages/StylistPage";
import BodySilhouette from "./components/BodySilhouette";
import {
  BodyTypeContext,
  loadBodyType,
  persistBodyType,
  type BodyType,
} from "./lib/bodyType";

function Onboarding({ onChoose }: { onChoose: (b: BodyType) => void }) {
  return (
    <div className="modal-overlay">
      <div className="modal">
        <h1 style={{ marginTop: 0, fontSize: "1.5rem" }}>Welcome to your wardrobe</h1>
        <p className="muted" style={{ lineHeight: 1.55, marginTop: 0 }}>
          Who are we dressing? This sets the body shape shown behind your outfits in
          the mixer — change it anytime from the menu.
        </p>
        <div className="row" style={{ marginTop: 8 }}>
          <button className="body-pick" onClick={() => onChoose("male")}>
            <BodySilhouette gender="male" className="body-pick-svg" />
            <span>Male</span>
          </button>
          <button className="body-pick" onClick={() => onChoose("female")}>
            <BodySilhouette gender="female" className="body-pick-svg" />
            <span>Female</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [bodyType, setBodyType] = useState<BodyType | null>(() => loadBodyType());

  const choose = (b: BodyType) => {
    persistBodyType(b);
    setBodyType(b);
  };

  return (
    <BodyTypeContext.Provider value={{ bodyType, choose }}>
      <div className="app">
        <SideNav />
        {!bodyType && <Onboarding onChoose={choose} />}
        <Routes>
          <Route path="/" element={<CapturePage />} />
          <Route path="/wardrobe" element={<WardrobePage />} />
          <Route path="/mixer" element={<MixerPage />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/stylist" element={<StylistPage />} />
        </Routes>
      </div>
    </BodyTypeContext.Provider>
  );
}
