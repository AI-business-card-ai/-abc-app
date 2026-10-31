import { Skeleton } from '@/components/ui/abc/Bits'

export default function CrmNextLoading() {
  return (
    <div aria-busy="true" aria-label="Loading next actions" className="flex flex-col gap-6">
      {[3, 2].map((rows, i) => (
        <div key={i}>
          <Skeleton className="mb-2.5 h-3 w-24" />
          <div className="abc-surface divide-y divide-abc-border overflow-hidden">
            {Array.from({ length: rows }).map((_, j) => (
              <div key={j} className="flex items-center gap-3 px-4 py-3.5 sm:px-5">
                <Skeleton className="h-9 w-9" radius={999} />
                <div className="min-w-0 flex-1">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="mt-2 h-3 w-36" />
                  <Skeleton className="mt-2 h-3 w-28" />
                </div>
                <Skeleton className="h-11 w-20" radius={13} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
