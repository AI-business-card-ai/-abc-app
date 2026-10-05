export default function AuthOrDivider() {
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-px" style={{ background: 'var(--abc-border-strong)' }} />
      <span className="text-xs shrink-0" style={{ color: 'var(--abc-text-secondary)' }}>or</span>
      <div className="flex-1 h-px" style={{ background: 'var(--abc-border-strong)' }} />
    </div>
  )
}
