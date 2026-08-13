/**
 * ABC Card lockup — gold diamond mark + "ABCCARD by EXPOGUY" wordmark.
 *
 * Drawn in SVG/CSS to match the approved dashboard mockups. Replace the mark
 * with the official vector asset when it is supplied (see brand asset list).
 */

export function AbcMark({ size = 32 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 44 44"
      fill="none"
      aria-hidden="true"
      className="shrink-0"
    >
      <rect
        x="6.5"
        y="6.5"
        width="31"
        height="31"
        rx="6"
        transform="rotate(45 22 22)"
        stroke="#d9a441"
        strokeWidth="2"
      />
      <text
        x="22"
        y="26"
        textAnchor="middle"
        fill="#ffffff"
        fontSize="12"
        fontWeight="700"
        letterSpacing="0.5"
        fontFamily="var(--font-inter), system-ui, sans-serif"
      >
        ABC
      </text>
    </svg>
  );
}

export default function AbcLogo({
  size = 32,
  compact = false,
}: {
  size?: number;
  /** Mark only — used where horizontal space is tight. */
  compact?: boolean;
}) {
  if (compact) return <AbcMark size={size} />;

  return (
    <span className="flex items-center gap-2.5">
      <AbcMark size={size} />
      <span className="flex flex-col leading-none">
        <span className="text-[17px] font-bold tracking-tight text-abc-text">
          ABC<span className="text-abc-gold-accent">CARD</span>
        </span>
        <span className="mt-1 text-[8.5px] font-semibold uppercase tracking-[0.18em] text-abc-muted">
          by ExpoGuy
        </span>
      </span>
    </span>
  );
}
