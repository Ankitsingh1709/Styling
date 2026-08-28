import { useEffect, type ReactNode } from "react";
import Icon from "./Icon";

/**
 * A sheet for a focused, dismissible sub-task. Swipe-to-dismiss on iOS maps to
 * tapping the scrim or Escape here; nothing destructive lives behind it, so
 * dismissal never needs a guard.
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
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      <div className="sheet-scrim" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="sheet-grabber" />
        <div className="sheet-head">
          <h2 className="t-title">{title}</h2>
          <button className="nav-bar-action" onClick={onClose} aria-label="Close" style={{ position: "static" }}>
            <Icon name="close" size={22} />
          </button>
        </div>
        {children}
      </div>
    </>
  );
}
