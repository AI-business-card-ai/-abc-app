import { Skeleton } from '@/components/ui/abc/Bits'

/** The board's shape in the light workspace's own skeleton — never a dark flash. */
export default function CrmPipelineLoading() {
  return (
    <div aria-busy="true" aria-label="Loading pipeline">
      <Skeleton className="h-4 w-56" />

      <div className="mt-4 flex gap-2 lg:hidden">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-11 w-24" radius={999} />
        ))}
      </div>
      <div className="mt-3 flex flex-col gap-3 lg:hidden">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-[136px] w-full" radius={22} />
        ))}
      </div>

      <div className="mt-5 hidden grid-cols-4 gap-4 lg:grid">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i}>
            <Skeleton className="mb-2.5 h-4 w-24" />
            <div className="flex flex-col gap-3 rounded-card border border-abc-border p-2.5">
              {Array.from({ length: i === 0 ? 3 : 2 }).map((__, j) => (
                <Skeleton key={j} className="h-[136px] w-full" radius={22} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
