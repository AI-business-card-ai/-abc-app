import Link from 'next/link'

export const metadata = {
  title: 'Offline — ABC',
}

export default function OfflinePage() {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-6 text-center"
      style={{ background: '#0f0f0f' }}
    >
      <p className="text-4xl mb-4" aria-hidden>
        📡
      </p>
      <h1 className="text-xl font-bold mb-3" style={{ color: '#ffffff' }}>
        Jsi offline
      </h1>
      <p className="text-sm max-w-sm leading-relaxed mb-8" style={{ color: '#999999' }}>
        Naskenované vizitky se odešlou, až budeš zpět online.
      </p>
      <Link
        href="/scan"
        className="interactive-primary rounded-xl px-5 py-3 text-sm font-semibold text-white"
        style={{ background: 'linear-gradient(135deg, #f0197d, #00d4d4)' }}
      >
        Zkusit znovu
      </Link>
    </div>
  )
}
