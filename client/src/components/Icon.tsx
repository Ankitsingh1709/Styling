/**
 * The app's icon system: authored SVG on one grid, one stroke weight, round
 * caps and joins — the same discipline SF Symbols carries on iOS. Everything
 * inherits `currentColor` and scales with its container, so an icon in a tab
 * bar and an icon in a button are the same drawing at different sizes.
 *
 * Emoji are not an icon system; nothing here falls back to one.
 */

export type IconName =
  | "camera"
  | "hanger"
  | "sliders"
  | "calendar"
  | "sparkles"
  | "shirt"
  | "trousers"
  | "shoe"
  | "chevronLeft"
  | "chevronRight"
  | "close"
  | "plus"
  | "trash"
  | "check"
  | "alert"
  | "photo"
  | "arrowUp"
  | "sun"
  | "moon"
  | "contrast"
  | "person";

const paths: Record<IconName, JSX.Element> = {
  camera: (
    <>
      <path d="M3 8.5A2.5 2.5 0 0 1 5.5 6h1.7a1 1 0 0 0 .83-.45l.94-1.4A1 1 0 0 1 9.8 3.7h4.4a1 1 0 0 1 .83.45l.94 1.4a1 1 0 0 0 .83.45h1.7A2.5 2.5 0 0 1 21 8.5v8A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5Z" />
      <circle cx="12" cy="12.3" r="3.4" />
    </>
  ),
  hanger: (
    <>
      <path d="M12 8.2V7a2.2 2.2 0 1 1 3 2.05" />
      <path d="M12 8.2 4.3 14.4a1.6 1.6 0 0 0 1 2.85h13.4a1.6 1.6 0 0 0 1-2.85L12 8.2Z" />
    </>
  ),
  sliders: (
    <>
      <path d="M4 7h9M17 7h3M4 12h3M11 12h9M4 17h9M17 17h3" />
      <circle cx="15" cy="7" r="2" />
      <circle cx="9" cy="12" r="2" />
      <circle cx="15" cy="17" r="2" />
    </>
  ),
  calendar: (
    <>
      <rect x="3.2" y="5" width="17.6" height="15.5" rx="3" />
      <path d="M3.2 9.6h17.6M8 3.5v3M16 3.5v3" />
    </>
  ),
  sparkles: (
    <>
      <path d="M12 3.5c.55 3.2 1.55 4.2 4.75 4.75-3.2.55-4.2 1.55-4.75 4.75-.55-3.2-1.55-4.2-4.75-4.75C10.45 7.7 11.45 6.7 12 3.5Z" />
      <path d="M17.5 14c.33 1.9.93 2.5 2.83 2.83-1.9.33-2.5.93-2.83 2.83-.33-1.9-.93-2.5-2.83-2.83 1.9-.33 2.5-.93 2.83-2.83Z" />
      <path d="M6.5 14.5c.26 1.5.74 1.98 2.24 2.24-1.5.26-1.98.74-2.24 2.24-.26-1.5-.74-1.98-2.24-2.24 1.5-.26 1.98-.74 2.24-2.24Z" />
    </>
  ),
  shirt: (
    <>
      <path d="M9 3.6 5 5.4a1.6 1.6 0 0 0-.94 1.83l.7 3.05a1 1 0 0 0 1.2.75l1.3-.3v8.07a1 1 0 0 0 1 1h7.48a1 1 0 0 0 1-1v-8.07l1.3.3a1 1 0 0 0 1.2-.75l.7-3.05A1.6 1.6 0 0 0 19 5.4l-4-1.8" />
      <path d="M9 3.6a3 3 0 0 0 6 0" />
    </>
  ),
  trousers: (
    <>
      <path d="M6.4 3.5h11.2l.7 17h-4.2l-1.4-9.8h-1.4l-1.4 9.8H5.7Z" />
      <path d="M6.1 8.2h11.8" />
    </>
  ),
  shoe: (
    <>
      <path d="M2.8 16.8V11c0-.5.42-.9.93-.9h2.2c.36 0 .69.2.84.53l.7 1.5 3.1 1.05a5 5 0 0 0 2.5.2l1.9-.35a5 5 0 0 1 4.3 1.2l1.2 1.1c.4.36.63.88.63 1.42v1.15a1 1 0 0 1-1 1H3.8a1 1 0 0 1-1-1Z" />
      <path d="M6.8 12.1V15" />
    </>
  ),
  chevronLeft: <path d="M14.5 5 8 12l6.5 7" />,
  chevronRight: <path d="M9.5 5 16 12l-6.5 7" />,
  close: <path d="M6.2 6.2 17.8 17.8M17.8 6.2 6.2 17.8" />,
  plus: <path d="M12 5.2v13.6M5.2 12h13.6" />,
  trash: (
    <>
      <path d="M4.6 6.8h14.8M9.4 6.8V5.2a1.4 1.4 0 0 1 1.4-1.4h2.4a1.4 1.4 0 0 1 1.4 1.4v1.6" />
      <path d="M6.6 6.8 7.5 19a1.4 1.4 0 0 0 1.4 1.3h6.2a1.4 1.4 0 0 0 1.4-1.3l.9-12.2" />
      <path d="M10.4 10.5v6M13.6 10.5v6" />
    </>
  ),
  check: <path d="M4.8 12.6 9.6 17.4 19.2 6.6" />,
  alert: (
    <>
      <path d="M12 4.2 2.9 19.4h18.2L12 4.2Z" />
      <path d="M12 10v4.1" />
      <circle cx="12" cy="17" r=".55" fill="currentColor" stroke="none" />
    </>
  ),
  photo: (
    <>
      <rect x="3.2" y="4.8" width="17.6" height="14.4" rx="3" />
      <path d="m3.6 16.4 4.3-4.1a1.8 1.8 0 0 1 2.5 0l3.1 3" />
      <path d="m13.2 14.4 1.6-1.5a1.8 1.8 0 0 1 2.5 0l3.1 3" />
      <circle cx="9" cy="9.4" r="1.4" />
    </>
  ),
  arrowUp: <path d="M12 19V5.5M6 11.4l6-6 6 6" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4.1" />
      <path d="M12 2.6v2.1M12 19.3v2.1M21.4 12h-2.1M4.7 12H2.6M18.6 5.4l-1.5 1.5M6.9 17.1l-1.5 1.5M18.6 18.6l-1.5-1.5M6.9 6.9 5.4 5.4" />
    </>
  ),
  moon: <path d="M20.2 14.4A8.6 8.6 0 0 1 9.6 3.8a8.6 8.6 0 1 0 10.6 10.6Z" />,
  contrast: (
    <>
      <circle cx="12" cy="12" r="8.6" />
      <path d="M12 3.4v17.2a8.6 8.6 0 0 0 0-17.2Z" fill="currentColor" stroke="none" />
    </>
  ),
  person: (
    <>
      <circle cx="12" cy="8" r="3.9" />
      <path d="M4.8 20.2a7.2 7.2 0 0 1 14.4 0" />
    </>
  ),
};

export default function Icon({
  name,
  size = 24,
  className,
  strokeWidth = 1.7,
}: {
  name: IconName;
  size?: number;
  className?: string;
  strokeWidth?: number;
}) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {paths[name]}
    </svg>
  );
}
