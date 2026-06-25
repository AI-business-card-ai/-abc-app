export default function SettingsLoading() {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center gap-3"
      style={{ background: '#0d0f1a', color: '#8892b0' }}
    >
      <div
        className="w-8 h-8 rounded-full border-2 border-transparent animate-spin"
        style={{ borderTopColor: '#00d4d4', borderRightColor: '#8b5cf6' }}
      />
      <p className="text-sm">Loading profile…</p>
    </div>
  )
}
