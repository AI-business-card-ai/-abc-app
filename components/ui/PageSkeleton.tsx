type Variant = 'contacts' | 'pipeline' | 'scan' | 'profile' | 'dashboard'

export default function PageSkeleton({ variant = 'contacts' }: { variant?: Variant }) {
  if (variant === 'scan') {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center px-6 gap-6">
        <div className="skeleton-block w-[85%] max-w-[320px] aspect-[1.6/1] rounded-2xl" />
        <div className="skeleton-block h-14 w-full max-w-[320px] rounded-xl" />
        <div className="skeleton-block h-12 w-full max-w-[320px] rounded-xl" />
      </div>
    )
  }

  if (variant === 'pipeline') {
    return (
      <div className="page-shell page-shell--wide pb-8">
        <div className="skeleton-block h-8 w-40 rounded-lg mb-2" />
        <div className="skeleton-block h-4 w-56 rounded mb-6" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton-block h-20 rounded-xl" />
          ))}
        </div>
        <div className="flex gap-3 overflow-hidden">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="skeleton-block min-w-[260px] h-[360px] rounded-xl shrink-0" />
          ))}
        </div>
      </div>
    )
  }

  if (variant === 'profile') {
    return (
      <div className="max-w-[600px] mx-auto px-4 py-6 space-y-4">
        <div className="skeleton-block h-24 rounded-xl" />
        <div className="skeleton-block h-40 rounded-xl" />
        <div className="skeleton-block h-64 rounded-xl" />
        <div className="skeleton-block h-14 rounded-xl" />
      </div>
    )
  }

  if (variant === 'dashboard') {
    return (
      <div className="page-shell space-y-4">
        <div className="skeleton-block h-8 w-48 rounded-lg" />
        <div className="skeleton-block h-4 w-64 rounded" />
        <div className="grid grid-cols-2 gap-3 mt-6">
          <div className="skeleton-block h-28 rounded-xl" />
          <div className="skeleton-block h-28 rounded-xl" />
        </div>
        <div className="skeleton-block h-48 rounded-xl mt-4" />
      </div>
    )
  }

  // contacts (default)
  return (
    <div className="page-shell pb-8">
      <div className="flex items-center justify-between pb-3">
        <div>
          <div className="skeleton-block h-7 w-36 rounded-lg" />
          <div className="skeleton-block h-3 w-48 rounded mt-2" />
        </div>
        <div className="skeleton-block h-9 w-20 rounded-xl" />
      </div>
      <div className="grid grid-cols-3 gap-2 py-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="skeleton-block h-16 rounded-xl" />
        ))}
      </div>
      <div className="flex gap-2 pb-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="skeleton-block h-8 w-16 rounded-full" />
        ))}
      </div>
      <div className="flex flex-col gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="skeleton-block h-24 rounded-2xl" />
        ))}
      </div>
    </div>
  )
}
