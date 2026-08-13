import { initialsFromName } from '@/lib/card/theme'

/**
 * Circular avatar with the approved gold ring. Falls back to initials —
 * never to a stock portrait.
 */
export default function Avatar({
  src,
  name,
  size = 40,
  ring = false,
  className = '',
}: {
  src?: string | null
  name?: string | null
  size?: number
  ring?: boolean
  className?: string
}) {
  const ringStyle = ring
    ? { boxShadow: 'inset 0 0 0 2px var(--abc-gold-accent)' }
    : { boxShadow: 'inset 0 0 0 1px var(--abc-border)' }

  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-abc-raised ${className}`}
      style={{ width: size, height: size, ...ringStyle }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={name || ''}
          className="h-full w-full object-cover"
          loading="lazy"
        />
      ) : (
        <span
          className="font-semibold text-abc-secondary"
          style={{ fontSize: Math.max(10, Math.round(size * 0.34)) }}
        >
          {initialsFromName(name)}
        </span>
      )}
    </span>
  )
}
