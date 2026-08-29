import { useEffect, useRef, type ReactNode } from "react";
import Icon from "./Icon";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * A sheet for a focused, dismissible sub-task. Swipe-to-dismiss on iOS maps to
 * tapping the scrim or Escape here; nothing destructive lives behind it, so
 * dismissal never needs a guard.
 *
 * Focus moves in on open, stays inside while open, and returns to whatever
 * opened it on close — otherwise a keyboard or screen-reader user is left
 * behind the scrim, tabbing through a page they can't see.
 */
export default function Sheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  // Callers pass an inline arrow, so `onClose` is a new value on every parent
  // render. Keeping it in a ref lets the effects below hold empty deps — with
  // `[onClose]` they tore down and re-ran on every re-render, throwing focus
  // out to the element behind the scrim and back again on each keystroke.
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  // Focus in on mount, back out on unmount. Runs exactly once.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    // Focus the panel itself rather than its first control, so a screen reader
    // announces the sheet before its contents.
    panel.current?.focus();
    return () => {
      // The opener can be gone by now — deleting a garment removes the very
      // tile that opened this sheet — and focusing a detached node silently
      // drops focus to <body>.
      if (opener && document.contains(opener)) opener.focus?.();
    };
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") return closeRef.current();
      if (e.key !== "Tab") return;
      const el = panel.current;
      if (!el) return;

      const items = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (n) => n.offsetParent !== null,
      );
      const active = document.activeElement;

      // Focus can sit outside the sheet entirely: disabling the button you just
      // activated (every action here disables while busy) blurs it to <body>.
      // Without this branch the next Tab walks into the page behind the scrim.
      if (!el.contains(active)) {
        e.preventDefault();
        const target = e.shiftKey ? items[items.length - 1] : items[0];
        if (target) target.focus();
        else el.focus();
        return;
      }
      if (items.length === 0) return;

      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && (active === first || active === el)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <div className="sheet-scrim" onClick={() => closeRef.current()} />
      <div
        className="sheet"
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
        <div className="sheet-grabber" />
        <div className="sheet-head">
          <h2 className="t-title">{title}</h2>
          <button
            className="nav-bar-action"
            onClick={() => closeRef.current()}
            aria-label="Close"
            style={{ position: "static" }}
          >
            <Icon name="close" size={22} />
          </button>
        </div>
        {children}
      </div>
    </>
  );
}
