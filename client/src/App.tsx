import { Component, lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { Routes, Route } from "react-router-dom";
import TabBar from "./components/TabBar";
import Sheet from "./components/Sheet";
import BodySilhouette from "./components/BodySilhouette";
/**
 * Routes are split so the extractor doesn't ride along on every page load:
 * transformers.js and the ONNX runtime are only used by Capture, but a static
 * import put them in the entry chunk, so opening the Calendar downloaded the
 * whole model runtime.
 */
const CapturePage = lazy(() => import("./pages/CapturePage"));
const WardrobePage = lazy(() => import("./pages/WardrobePage"));
const MixerPage = lazy(() => import("./pages/MixerPage"));
const CalendarPage = lazy(() => import("./pages/CalendarPage"));
const StylistPage = lazy(() => import("./pages/StylistPage"));

/**
 * Splitting the routes introduced a failure mode that didn't exist when every
 * page shipped in the entry bundle: a rejected import() — offline, or a
 * redeploy that invalidates the hashed chunk this tab still points at — would
 * throw through the root and blank the whole app.
 */
class ChunkBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error("[app] failed to load a screen:", error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="screen">
        <div className="screen-inner" style={{ paddingTop: 40 }}>
          <div className="empty">
            <strong className="t-title">This screen didn&apos;t load</strong>
            <p className="t-sub">
              You may be offline, or the app updated while this tab was open.
            </p>
            <button className="btn btn-primary" onClick={() => window.location.reload()}>
              Reload
            </button>
          </div>
        </div>
      </div>
    );
  }
}

/** Holds the screen's shape while its chunk arrives, so the bars don't jump. */
function ScreenFallback() {
  return (
    <div className="screen">
      <div className="nav-bar" />
      <div className="screen-inner" style={{ paddingTop: 30 }}>
        <div className="skeleton" style={{ height: 40, width: "55%" }} />
        <div className="skeleton" style={{ height: 220, marginTop: 20 }} />
      </div>
    </div>
  );
}
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
          <ChunkBoundary>
            <Suspense fallback={<ScreenFallback />}>
              <Routes>
                <Route path="/" element={<CapturePage />} />
                <Route path="/wardrobe" element={<WardrobePage />} />
                <Route path="/mixer" element={<MixerPage />} />
                <Route path="/calendar" element={<CalendarPage />} />
                <Route path="/stylist" element={<StylistPage />} />
              </Routes>
            </Suspense>
          </ChunkBoundary>
          <TabBar />
          {!bodyType && <BodyTypeSheet onChoose={choose} />}
        </div>
      </BodyTypeContext.Provider>
    </AppearanceContext.Provider>
  );
}
