import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * One screen in the navigation stack: a large title that collapses into an
 * inline bar title as you scroll, which is how a top-level iOS screen behaves.
 */
export default function Screen({
  title,
  lede,
  action,
  children,
}: {
  title: string;
  lede?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  const [scrolled, setScrolled] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    // The bar takes its title only once the large one has actually left.
    const observer = new IntersectionObserver(
      ([entry]) => setScrolled(!entry.isIntersecting),
      { rootMargin: "-44px 0px 0px 0px", threshold: 0 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="screen">
      <div className={`nav-bar ${scrolled ? "scrolled" : ""}`}>
        <span className="nav-bar-title">{title}</span>
        {action}
      </div>

      <header className="large-title">
        <h1>{title}</h1>
        {lede && <p className="lede">{lede}</p>}
      </header>
      <div ref={sentinel} aria-hidden="true" />

      <div className="screen-inner">{children}</div>
    </div>
  );
}
