import { MEDALS, type MedalTier } from "@/lib/medal";

/**
 * A medal struck into a disc with a ribbon behind it. Drawn as SVG so it stays
 * crisp on a projector, and used for the same shape again when the podium is
 * rendered to a PNG (see `lib/podium-image.ts`).
 *
 * The viewBox is the contract between the two implementations: keep this and
 * the canvas version in the same 100 × 134 space and they line up.
 */
export function Medal({
  tier,
  rank,
  size = 52,
  className,
}: {
  tier: MedalTier;
  /** The digit shown on the face — usually the rank, or the podium place. */
  rank: number;
  size?: number;
  className?: string;
}) {
  const metal = MEDALS[tier];

  return (
    <svg
      viewBox="0 0 100 134"
      width={size}
      height={Math.round(size * 1.34)}
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {/* Ribbon: two straps crossing behind the disc. */}
      <path d="M24 0 H40 L55 54 L41 61 Z" fill={metal.ribbon} />
      <path d="M76 0 H60 L45 54 L59 61 Z" fill={metal.ribbon} opacity="0.72" />

      {/* Disc: rim, face, a single catch of light, then the struck digit. */}
      <circle cx="50" cy="92" r="40" fill={metal.edge} />
      <circle cx="50" cy="92" r="34" fill={metal.face} />
      <path
        d="M31 76 a26 26 0 0 1 24 -15"
        fill="none"
        stroke="#ffffff"
        strokeOpacity="0.55"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <text
        x="50"
        y="93"
        textAnchor="middle"
        dominantBaseline="central"
        fill={metal.digit}
        style={{
          fontFamily: "var(--type-display)",
          fontSize: 38,
          fontWeight: 700,
          letterSpacing: "0.02em",
        }}
      >
        {rank}
      </text>
    </svg>
  );
}
