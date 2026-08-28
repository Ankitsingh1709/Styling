import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ApiError,
  askStylist,
  listProviders,
  saveOutfit,
  setProvider,
  setWear,
  ymd,
  type ChatMessage,
  type ProviderId,
  type ProviderStatus,
  type StylistPick,
} from "../api";
import { useBodyType } from "../lib/bodyType";

/** One turn in the thread. Assistant turns can carry an outfit the AI picked. */
interface Turn extends ChatMessage {
  pick?: StylistPick | null;
}

const STARTERS = [
  "I'm going to a party tonight",
  "Something for work tomorrow",
  "Dinner date, keep it smart",
  "It's cold — what's warm?",
];

/** Tracks what the user has already done with a given suggestion. */
interface PickState {
  savedOutfitId?: number;
  worn?: boolean;
  busy?: "save" | "wear";
  error?: string;
}

function PickCard({
  pick,
  state,
  onSave,
  onWear,
}: {
  pick: StylistPick;
  state: PickState;
  onSave: () => void;
  onWear: () => void;
}) {
  const pieces = [pick.top, pick.bottom, pick.shoes].filter(Boolean);
  const alreadySaved = pick.kind === "saved" || state.savedOutfitId !== undefined;

  return (
    <div className="pick-card">
      <div className="pick-stack">
        {pieces.map((g) => (
          <img key={g!.id} src={g!.imageUrl} alt="" />
        ))}
      </div>
      <div className="pick-body">
        <strong>{pick.name ?? "This look"}</strong>
        <p className="muted small">{pick.why}</p>
        <div className="row">
          <button onClick={onWear} disabled={state.busy !== undefined || state.worn}>
            {state.busy === "wear" ? (
              <>
                <span className="spinner" />
                Saving…
              </>
            ) : state.worn ? (
              "✓ On today's calendar"
            ) : (
              "Wear it today"
            )}
          </button>
          {!alreadySaved && (
            <button onClick={onSave} disabled={state.busy !== undefined}>
              {state.busy === "save" ? (
                <>
                  <span className="spinner" />
                  Saving…
                </>
              ) : (
                "Save as an outfit"
              )}
            </button>
          )}
          {alreadySaved && pick.kind === "fresh" && (
            <span className="muted small" style={{ alignSelf: "center" }}>
              ✓ Saved to outfits
            </span>
          )}
        </div>
        {state.error && <p className="muted small">{state.error}</p>}
      </div>
    </div>
  );
}

/**
 * Cloud vs. on-device. Switching is a server-side setting, so garment tagging
 * and the chat always use the same backend.
 */
function ProviderPicker({
  providers,
  busy,
  onPick,
}: {
  providers: ProviderStatus[];
  busy: boolean;
  onPick: (id: ProviderId) => void;
}) {
  const active = providers.find((p) => p.active);
  return (
    <div className="provider-picker">
      <div className="segmented">
        {providers.map((p) => (
          <button
            key={p.id}
            className={p.active ? "active" : ""}
            onClick={() => onPick(p.id)}
            disabled={busy || p.active}
            title={p.detail}
          >
            <span className={`dot ${p.available ? "ok" : "off"}`} aria-hidden="true" />
            {p.label}
          </button>
        ))}
      </div>
      {active && (
        <p className="muted small provider-detail">
          {active.available ? "▸" : "⚠"} {active.model} — {active.detail}
        </p>
      )}
    </div>
  );
}

export default function StylistPage() {
  const { bodyType } = useBodyType();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [picks, setPicks] = useState<Record<number, PickState>>({});
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [switching, setSwitching] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listProviders()
      .then((r) => setProviders(r.providers))
      .catch(() => setProviders([]));
  }, []);

  async function pickProvider(id: ProviderId) {
    setSwitching(true);
    setNeedsSetup(false);
    try {
      const r = await setProvider(id);
      setProviders(r.providers);
    } catch {
      /* leave the old selection showing */
    } finally {
      setSwitching(false);
    }
  }

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns, thinking]);

  async function send(text: string) {
    const content = text.trim();
    if (!content || thinking) return;

    const history: Turn[] = [...turns, { role: "user", content }];
    setTurns(history);
    setDraft("");
    setError(null);
    setThinking(true);

    try {
      const { reply, pick } = await askStylist(
        history.map(({ role, content }) => ({ role, content })),
        bodyType,
      );
      setTurns((prev) => [...prev, { role: "assistant", content: reply, pick }]);
    } catch (err) {
      if (err instanceof ApiError && err.status === 503) {
        setNeedsSetup(true);
      } else {
        setError(err instanceof Error ? err.message : "The stylist couldn't answer");
      }
      // Drop the unanswered turn so the retry doesn't duplicate it.
      setTurns((prev) => prev.slice(0, -1));
      setDraft(content);
    } finally {
      setThinking(false);
    }
  }

  /** Save a fresh combination so it exists as a real outfit. Returns its id. */
  async function persist(pick: StylistPick, index: number): Promise<number> {
    if (pick.kind === "saved" && pick.outfit) return pick.outfit.id;
    const existing = picks[index]?.savedOutfitId;
    if (existing !== undefined) return existing;

    const outfit = await saveOutfit({
      topId: pick.top?.id ?? null,
      bottomId: pick.bottom?.id ?? null,
      shoesId: pick.shoes?.id ?? null,
      name: pick.name ?? undefined,
    });
    setPicks((p) => ({ ...p, [index]: { ...p[index], savedOutfitId: outfit.id } }));
    return outfit.id;
  }

  async function handleSave(pick: StylistPick, index: number) {
    setPicks((p) => ({ ...p, [index]: { ...p[index], busy: "save", error: undefined } }));
    try {
      await persist(pick, index);
      setPicks((p) => ({ ...p, [index]: { ...p[index], busy: undefined } }));
    } catch (err) {
      setPicks((p) => ({
        ...p,
        [index]: {
          ...p[index],
          busy: undefined,
          error: err instanceof Error ? err.message : "Couldn't save that",
        },
      }));
    }
  }

  async function handleWear(pick: StylistPick, index: number) {
    setPicks((p) => ({ ...p, [index]: { ...p[index], busy: "wear", error: undefined } }));
    try {
      // The calendar stores outfit ids, so a fresh combination has to become a
      // real outfit before it can be worn.
      const outfitId = await persist(pick, index);
      await setWear(ymd(new Date()), outfitId);
      setPicks((p) => ({ ...p, [index]: { ...p[index], busy: undefined, worn: true } }));
    } catch (err) {
      setPicks((p) => ({
        ...p,
        [index]: {
          ...p[index],
          busy: undefined,
          error: err instanceof Error ? err.message : "Couldn't add it to the calendar",
        },
      }));
    }
  }

  if (needsSetup) {
    return (
      <div className="page">
        <header className="page-head">
          <h1>Stylist</h1>
          <p className="lede">Pick where the styling runs — your Mac, or Claude.</p>
        </header>
        {providers.length > 0 && (
          <ProviderPicker providers={providers} busy={switching} onPick={pickProvider} />
        )}
        <div className="card">
          <strong>Set up one of these</strong>
          <p className="muted small" style={{ marginTop: 8, marginBottom: 4 }}>
            <b>On this Mac</b> — start LM Studio (or Ollama) and load a vision-capable
            model. Point the server at it if it isn&apos;t on the default port:
          </p>
          <pre className="code-block">
{`LOCAL_BASE_URL=http://localhost:1234/v1
LOCAL_MODEL=qwen/qwen3.6-35b-a3b`}
          </pre>
          <p className="muted small" style={{ marginBottom: 4 }}>
            <b>Claude</b> — put a key in <code>server/.env</code>:
          </p>
          <pre className="code-block">ANTHROPIC_API_KEY=sk-ant-...</pre>
          <p className="muted small">
            Then restart the server. Everything else in the app works without either.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="page stylist-page">
      <header className="page-head">
        <h1>Stylist</h1>
        <p className="lede">
          Tell me where you&apos;re going and I&apos;ll pull a look from your own wardrobe.
        </p>
      </header>

      {providers.length > 0 && (
        <ProviderPicker providers={providers} busy={switching} onPick={pickProvider} />
      )}

      {turns.length === 0 && (
        <div className="empty-state" style={{ padding: "28px 20px" }}>
          <span className="art">✨</span>
          <strong>Where are you headed?</strong>
          <p>I only suggest things you actually own.</p>
          <div className="chips" style={{ justifyContent: "center", marginBottom: 0 }}>
            {STARTERS.map((s) => (
              <button key={s} className="chip" onClick={() => send(s)}>
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="chat">
        {turns.map((t, i) => (
          <div key={i} className={`bubble ${t.role}`}>
            <p>{t.content}</p>
            {t.pick && (
              <PickCard
                pick={t.pick}
                state={picks[i] ?? {}}
                onSave={() => handleSave(t.pick!, i)}
                onWear={() => handleWear(t.pick!, i)}
              />
            )}
            {t.role === "assistant" && !t.pick && (
              <p className="muted small" style={{ marginBottom: 0 }}>
                Nothing in the wardrobe fits that yet —{" "}
                <Link to="/">add a few more pieces</Link>.
              </p>
            )}
          </div>
        ))}

        {thinking && (
          <div className="bubble assistant">
            <span className="typing" aria-label="Thinking">
              <i />
              <i />
              <i />
            </span>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {error && (
        <div className="toast error" role="alert">
          <span className="toast-icon">⚠️</span>
          <div>
            <strong>{error}</strong>
          </div>
        </div>
      )}

      <form
        className="chat-form"
        onSubmit={(e) => {
          e.preventDefault();
          send(draft);
        }}
      >
        <input
          className="text-input"
          placeholder="e.g. I'm going to a party tonight"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={2000}
          disabled={thinking}
        />
        <button className="primary" type="submit" disabled={thinking || !draft.trim()}>
          {thinking ? <span className="spinner" /> : "Ask"}
        </button>
      </form>
    </div>
  );
}
