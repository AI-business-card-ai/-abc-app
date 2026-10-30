import { Skeleton } from '@/components/ui/abc/Bits'

export default function EventLoading() {
  return (
    <div className="mx-auto w-full max-w-[900px] abc-page-top px-4 pb-10 sm:px-6 lg:px-8">
      <div className="flex min-h-[44px] items-center">
        <Skeleton className="h-3.5 w-24" />
      </div>
      <Skeleton className="mt-1 h-3 w-40" />
      <Skeleton className="mt-3 h-8 w-64 max-w-full lg:h-10" />
      <Skeleton className="mt-3 h-4 w-48" />

      <div className="abc-surface mt-5 grid grid-cols-2 gap-4 p-4 sm:grid-cols-4 sm:p-5">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i}>
            <Skeleton className="h-7 w-12" />
            <Skeleton className="mt-2 h-3 w-20" />
          </div>
        ))}
      </div>

      <div className="mt-5 flex gap-2">
        <Skeleton className="h-10 w-20" radius={999} />
        <Skeleton className="h-10 w-28" radius={999} />
        <Skeleton className="h-10 w-24" radius={999} />
      </div>

      <div className="mt-4 flex flex-col gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="abc-surface flex gap-3.5 p-4 sm:p-5">
            <Skeleton className="h-11 w-11 shrink-0" radius={999} />
            <div className="min-w-0 flex-1">
              <Skeleton className="h-4 w-44 max-w-full" />
              <Skeleton className="mt-2 h-3 w-56 max-w-full" />
              <Skeleton className="mt-3 h-3 w-36" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
