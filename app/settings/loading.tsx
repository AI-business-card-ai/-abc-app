import { Skeleton } from '@/components/ui/abc/Bits'

/* Drawn to the Settings hub's own frame, so the real page lands without a jump. */
export default function SettingsLoading() {
  return (
    <div className="mx-auto w-full max-w-[560px] abc-page-top px-4 pb-10 sm:px-6">
      <Skeleton className="h-3 w-20" />
      <Skeleton className="mt-3 h-8 w-40" />
      <Skeleton className="mt-3 h-4 w-64 max-w-full" />

      <div className="mt-6 rounded-card border border-abc-border bg-abc-card p-4">
        <div className="flex items-center gap-3.5">
          <Skeleton className="h-12 w-12 shrink-0" radius={999} />
          <div className="min-w-0 flex-1">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="mt-2 h-3 w-52 max-w-full" />
          </div>
        </div>
        <div className="mt-3.5 flex flex-col gap-2.5 border-t border-abc-border pt-3.5">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-full" />
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3.5 rounded-card border border-abc-border bg-abc-card p-4">
            <Skeleton className="h-5 w-5 shrink-0" radius={6} />
            <div className="min-w-0 flex-1">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="mt-2 h-3 w-56 max-w-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
