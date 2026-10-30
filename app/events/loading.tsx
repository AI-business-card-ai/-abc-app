import { Skeleton } from '@/components/ui/abc/Bits'

/*
  Without a loading state this route gave no sign a tap had registered: Next
  can only prefetch a dynamic page up to its nearest loading boundary, so the
  previous screen stayed up until the whole event grouping had come back.
*/
export default function EventsLoading() {
  return (
    <div className="mx-auto w-full max-w-[900px] abc-page-top px-4 pb-10 sm:px-6 lg:px-8">
      <Skeleton className="h-3 w-40" />
      <Skeleton className="mt-3 h-8 w-36 lg:h-10" />
      <Skeleton className="mt-3 h-4 w-72 max-w-full" />

      <div className="mt-6 flex flex-col gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="abc-surface flex items-center gap-3 p-4 sm:p-5">
            <div className="min-w-0 flex-1">
              <Skeleton className="h-4 w-48 max-w-full" />
              <Skeleton className="mt-2 h-3 w-32" />
              <Skeleton className="mt-3 h-3 w-56 max-w-full" />
            </div>
            <Skeleton className="h-5 w-5 shrink-0" radius={6} />
          </div>
        ))}
      </div>
    </div>
  )
}
