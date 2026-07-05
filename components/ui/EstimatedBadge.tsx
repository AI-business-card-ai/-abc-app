export default function EstimatedBadge({ compact }: { compact?: boolean }) {
  return (
    <span
      className={`inline-flex items-center rounded-full font-bold uppercase tracking-wide ${compact ? 'text-[8px] px-1 py-0' : 'text-[9px] px-1.5 py-0.5'}`}
      style={{
        background: 'rgba(245, 158, 11, 0.15)',
        border: '1px solid rgba(245, 158, 11, 0.45)',
        color: '#fbbf24',
        marginLeft: compact ? '4px' : '6px',
      }}
    >
      estimated
    </span>
  )
}
