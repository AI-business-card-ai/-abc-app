export default function AuthOrDivider() {
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-px" style={{ background: '#2a2a2a' }} />
      <span className="text-xs shrink-0" style={{ color: '#999999' }}>nebo</span>
      <div className="flex-1 h-px" style={{ background: '#2a2a2a' }} />
    </div>
  )
}
