/**
 * ABC Card lockup — gold diamond mark + "ABC CARD by EXPOGUY" wordmark.
 *
 * Drawn in SVG/CSS to match the approved dashboard reference: a gold-edged
 * diamond on ivory with the letters in ink, for the light app chrome it sits
 * in. Replace the mark with the official vector asset when it is supplied
 * (see brand asset list).
 */
import { useId } from 'react';

export function AbcMark({ size = 32 }: { size?: number }) {
  // The mark is in the DOM twice (mobile header, desktop sidebar), so its
  // gradients need their own ids or one copy paints with the other's.
  const id = useId().replace(/:/g, '');
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 44 44"
      fill="none"
      aria-hidden="true"
      className="shrink-0"
    >
      <defs>
        <linearGradient id={`e${id}`}x1="4" y1="4" x2="40" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#e9c46a" />
          <stop offset="0.5" stopColor="#c99628" />
          <stop offset="1" stopColor="#a97d1c" />
        </linearGradient>
        <linearGradient id={`f${id}`}x1="22" y1="5" x2="22" y2="39" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fffdf7" />
          <stop offset="1" stopColor="#f6ead0" />
        </linearGradient>
      </defs>
      <rect
        x="7"
        y="7"
        width="30"
        height="30"
        rx="6.5"
        transform="rotate(45 22 22)"
        fill={`url(#f${id})`}
        stroke={`url(#e${id})`}
        strokeWidth="2.2"
      />
      <text
        x="22"
        y="25.6"
        textAnchor="middle"
        fill="#161412"
        fontSize="10.5"
        fontWeight="800"
        letterSpacing="0.2"
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

  // The wordmark scales with the mark, so one size prop sets the lockup.
  const word = Math.round(size * 0.42);

  return (
    <span className="flex items-center gap-2.5">
      <AbcMark size={size} />
      <span className="flex flex-col leading-none">
        <span className="font-bold tracking-tight text-abc-text" style={{ fontSize: word }}>
          ABC <span className="text-abc-gold-accent">CARD</span>
        </span>
        <span
          className="mt-1 font-semibold uppercase tracking-[0.24em] text-[#4a453e]"
          style={{ fontSize: Math.max(8.5, Math.round(size * 0.2)) }}
        >
          by Expoguy
        </span>
      </span>
    </span>
  );
}
