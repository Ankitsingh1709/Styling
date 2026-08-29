import { useCallback, useEffect, useRef } from "react";
import Icon from "./Icon";
import { CATEGORY_LABELS, type Category, type Garment } from "../api";

/**
 * One layer of the outfit as a horizontal snap carousel: the centred garment is
 * full size, its neighbours stay visible at the edges, smaller and dimmed.
 *
 * Built on real overflow scrolling rather than a drag/spring carousel — the
 * browser's own scroll already carries momentum, hands off velocity, is
 * interruptible mid-flick and rubber-bands at the ends, which is exactly what
 * the fluid feel is made of. Reimplementing that by hand does it worse.
 */
export default function MixStrip({
  items,
  category,
  index,
  onIndexChange,
}: {
  items: Garment[];
  category: Category;
  index: number;
  onIndexChange: (index: number) => void;
}) {
  const strip = useRef<HTMLDivElement>(null);
  const label = CATEGORY_LABELS[category].toLowerCase();

  /** Distance from one item's start to the next, gap included. */
  const stride = useCallback(() => {
    const el = strip.current;
    if (!el) return 0;
    const cells = el.querySelectorAll<HTMLElement>(".mix-item");
    if (cells.length > 1) return cells[1].offsetLeft - cells[0].offsetLeft;
    return cells[0]?.offsetWidth ?? 0;
  }, []);

  /** Which item is centred once the scroll has come to rest. */
  const settle = useCallback(() => {
    const el = strip.current;
    const step = stride();
    if (!el || step === 0 || items.length === 0) return;
    const next = Math.max(0, Math.min(items.length - 1, Math.round(el.scrollLeft / step)));
    if (next !== index) onIndexChange(next);
  }, [index, items.length, onIndexChange, stride]);

  useEffect(() => {
    const el = strip.current;
    if (!el) return;
    // `scrollend` fires once the momentum finishes, which is exactly the moment
    // we want — but it isn't everywhere yet, so a settle timeout backs it up.
    let timer: ReturnType<typeof setTimeout>;
    const onScroll = () => {
      clearTimeout(timer);
      timer = setTimeout(settle, 90);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    el.addEventListener("scrollend", settle);
    return () => {
      clearTimeout(timer);
      el.removeEventListener("scroll", onScroll);
      el.removeEventListener("scrollend", settle);
    };
  }, [settle]);

  function step(direction: 1 | -1) {
    strip.current?.scrollBy({ left: direction * stride(), behavior: "smooth" });
  }

  if (items.length === 0) {
    return (
      <div className={`mix-row ${category}`}>
        <div className="mix-strip is-empty">
          <span className="placeholder">No {label} yet</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`mix-row ${category}`}>
      <button
        className="arrow"
        onClick={() => step(-1)}
        disabled={items.length < 2}
        aria-label={`Previous ${label}`}
      >
        <Icon name="chevronLeft" size={20} strokeWidth={2} />
      </button>

      <div className="mix-strip" ref={strip} role="group" aria-label={CATEGORY_LABELS[category]}>
        {items.map((g, i) => (
          <button
            key={g.id}
            className={`mix-item ${i === index ? "is-selected" : ""}`}
            aria-current={i === index}
            aria-label={g.analysis?.description ?? label}
            // Neighbours are visible, so they have to be reachable: tapping one
            // brings it to the centre rather than doing nothing.
            onClick={(e) =>
              e.currentTarget.scrollIntoView({
                inline: "center",
                block: "nearest",
                behavior: "smooth",
              })
            }
          >
            <img src={g.imageUrl} alt="" />
          </button>
        ))}
      </div>

      <button
        className="arrow"
        onClick={() => step(1)}
        disabled={items.length < 2}
        aria-label={`Next ${label}`}
      >
        <Icon name="chevronRight" size={20} strokeWidth={2} />
      </button>
    </div>
  );
}
