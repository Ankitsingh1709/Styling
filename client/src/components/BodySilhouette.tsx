import type { BodyType } from "../lib/bodyType";

/**
 * A faint front-facing body impression shown behind the mixer's garment stack so
 * clothes read as if worn. Two builds differ in shoulder/waist/hip shape.
 * Purely decorative (aria-hidden); className positions it behind the garments.
 */
export default function BodySilhouette({
  gender,
  className,
}: {
  gender: BodyType;
  className?: string;
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 120 330"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
      fill="#c8c8d2"
    >
      <circle cx="60" cy="26" r="16" />
      <rect x="54" y="40" width="12" height="9" />
      {gender === "male" ? (
        <>
          {/* broad shoulders, straight torso */}
          <path d="M34 54 L86 54 L74 156 L46 156 Z" />
          {/* arms */}
          <path d="M34 56 L27 158 L37 158 L45 64 Z" />
          <path d="M86 56 L93 158 L83 158 L75 64 Z" />
          {/* pelvis */}
          <path d="M46 156 L74 156 L71 184 L49 184 Z" />
          {/* legs */}
          <path d="M49 184 L59 184 L57 312 L47 312 Z" />
          <path d="M61 184 L71 184 L73 312 L63 312 Z" />
        </>
      ) : (
        <>
          {/* narrower shoulders, cinched waist */}
          <path d="M42 54 L78 54 L72 100 L60 112 L48 100 Z" />
          {/* arms */}
          <path d="M42 56 L36 150 L45 150 L50 62 Z" />
          <path d="M78 56 L84 150 L75 150 L70 62 Z" />
          {/* hips / A-line */}
          <path d="M48 100 L60 112 L72 100 L82 186 L38 186 Z" />
          {/* legs */}
          <path d="M50 186 L59 186 L57 312 L49 312 Z" />
          <path d="M61 186 L70 186 L71 312 L63 312 Z" />
        </>
      )}
    </svg>
  );
}
