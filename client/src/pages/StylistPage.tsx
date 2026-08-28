import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import Screen from "../components/Screen";
import Icon from "../components/Icon";
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

interface Turn extends ChatMessage {
  pick?: StylistPick | null;
}

const STARTERS = [
  "I'm going to a party tonight",
  "Something for work tomorrow",
  "Dinner date, keep it smart",
  "It's cold out",
];

interface PickState {
  savedOutfitId?: number;
  worn?: boolean;
  busy?: "save" | "wear";
  error?: string;
}

function Suggestion({
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
    <div className="suggestion">
      <div className="suggestion-stack">
        {pieces.map((g) => (
          <img key={g!.id} src={g!.imageUrl} alt="" />
        ))}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <strong className="t-headline">{pick.name ?? "This look"}</strong>
        <p className="t-foot secondary" style={{ margin: "3px 0 10px" }}>{pick.why}</p>
        <div className="row" style={{ gap: 8 }}>
          <button
            className="btn btn-primary btn-small"
            onClick={onWear}
            disabled={state.busy !== undefined || state.worn}
          >
            {state.busy === "wear" ? <span className="spinner" /> : null}
            {state.worn ? "On today's calendar" : "Wear it today"}
          </button>
          {!alreadySaved && (
            <button className="btn btn-small" onClick={onSave} disabled={state.busy !== undefined}>
              {state.busy === "save" ? <span className="spinner" /> : null}
              Save
            </button>
          )}
        </div>
        {state.error && (
          <p className="t-foot" style={{ color: "var(--danger)", marginTop: 8 }}>
            {state.error}
          </p>
        )}
      </div>
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

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns, thinking]);

  async function pickProvider(id: ProviderId) {
    setSwitching(true);
    setNeedsSetup(false);
    try {
      setProviders((await setProvider(id)).providers);
    } catch {
      /* leave the old selection showing */
    } finally {
      setSwitching(false);
    }
  }

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
      if (err instanceof ApiError && err.status === 503) setNeedsSetup(true);
      else setError(err instanceof Error ? err.message : "The stylist couldn't answer.");
      setTurns((prev) => prev.slice(0, -1)); // drop the unanswered turn
      setDraft(content);
    } finally {
      setThinking(false);
    }
  }

  /** A fresh combination has to become a real outfit before it can be worn. */
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

  async function act(pick: StylistPick, index: number, kind: "save" | "wear") {
    setPicks((p) => ({ ...p, [index]: { ...p[index], busy: kind, error: undefined } }));
    try {
      const outfitId = await persist(pick, index);
      if (kind === "wear") await setWear(ymd(new Date()), outfitId);
      setPicks((p) => ({
        ...p,
        [index]: { ...p[index], busy: undefined, worn: kind === "wear" || p[index]?.worn },
      }));
    } catch (err) {
      setPicks((p) => ({
        ...p,
        [index]: {
          ...p[index],
          busy: undefined,
          error: err instanceof Error ? err.message : "That didn't save.",
        },
      }));
    }
  }

  const providerPicker = providers.length > 0 && (
    <div style={{ marginBottom: 18 }}>
      <div className="segmented" role="group" aria-label="Where the stylist runs">
        {providers.map((p) => (
          <button
            key={p.id}
            className={p.active ? "active" : ""}
            onClick={() => pickProvider(p.id)}
            disabled={switching || p.active}
            title={p.detail}
          >
            {p.label}
          </button>
        ))}
      </div>
      <p className="t-foot secondary" style={{ margin: "7px 4px 0", textAlign: "center" }}>
        {providers.find((p) => p.active)?.model} — {providers.find((p) => p.active)?.detail}
      </p>
    </div>
  );

  if (needsSetup) {
    return (
      <Screen title="Stylist" lede="Choose where the styling runs — your own machine, or Claude.">
        {providerPicker}
        <div className="group" style={{ padding: 18 }}>
          <strong className="t-headline">Set up one of these</strong>
          <p className="t-sub secondary" style={{ margin: "10px 0 4px" }}>
            <b>On this Mac</b> — run LM Studio or Ollama with a vision-capable model
            loaded, then set it in <code>server/.env</code>:
          </p>
          <pre className="t-foot" style={{ overflowX: "auto", background: "var(--fill)", padding: 12, borderRadius: 10 }}>
{`LOCAL_BASE_URL=http://localhost:1234/v1
LOCAL_MODEL=qwen/qwen3.6-35b-a3b`}
          </pre>
          <p className="t-sub secondary" style={{ margin: "14px 0 4px" }}>
            <b>Claude</b> — add a key to <code>server/.env</code>:
          </p>
          <pre className="t-foot" style={{ overflowX: "auto", background: "var(--fill)", padding: 12, borderRadius: 10 }}>
            ANTHROPIC_API_KEY=…
          </pre>
          <p className="t-foot secondary" style={{ marginBottom: 0 }}>
            Restart the server afterwards. Everything else works without either.
          </p>
        </div>
      </Screen>
    );
  }

  return (
    <Screen title="Stylist" lede="Say where you're going and I'll pull a look from your own wardrobe.">
      {providerPicker}

      {turns.length === 0 && (
        <div className="empty" style={{ paddingTop: 26 }}>
          <span className="empty-icon">
            <Icon name="sparkles" size={28} />
          </span>
          <strong className="t-title">Where are you headed?</strong>
          <p className="t-sub">I only suggest things you actually own.</p>
          <div className="chip-row">
            {STARTERS.map((s) => (
              <button key={s} className="chip" onClick={() => send(s)}>
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="thread">
        {turns.map((t, i) => (
          <div key={i} className={`bubble ${t.role}`}>
            <p>{t.content}</p>
            {t.pick && (
              <Suggestion
                pick={t.pick}
                state={picks[i] ?? {}}
                onSave={() => act(t.pick!, i, "save")}
                onWear={() => act(t.pick!, i, "wear")}
              />
            )}
            {t.role === "assistant" && !t.pick && (
              <p className="t-foot secondary" style={{ marginTop: 8 }}>
                Nothing in your wardrobe fits that yet —{" "}
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
        <div className="notice is-error" style={{ marginTop: 14 }} role="alert">
          <Icon name="alert" size={21} className="notice-icon" />
          <div>
            <strong className="t-headline">{error}</strong>
          </div>
        </div>
      )}

      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          send(draft);
        }}
      >
        <input
          className="field"
          placeholder="Where are you going?"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={2000}
          disabled={thinking}
        />
        <button className="send" type="submit" disabled={thinking || !draft.trim()} aria-label="Ask">
          {thinking ? <span className="spinner" /> : <Icon name="arrowUp" size={21} strokeWidth={2.1} />}
        </button>
      </form>
    </Screen>
  );
}
