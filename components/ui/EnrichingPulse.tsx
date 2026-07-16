'use client'

type Props = {
  compact?: boolean
  className?: string
}

export default function EnrichingPulse({ compact, className = '' }: Props) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 ${compact ? 'text-[10px]' : 'text-xs'} ${className}`}
      style={{ color: '#999999' }}
    >
      <span
        className="shrink-0 rounded-full enriching-pulse-dot"
        style={{
          width: compact ? 6 : 8,
          height: compact ? 6 : 8,
          background: 'linear-gradient(135deg, #f0197d, #00d4d4)',
        }}
      />
      <span style={{ color: '#b8b8b8' }}>AI enriching…</span>
    </span>
  )
}
