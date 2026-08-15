import { Skeleton } from '@/components/ui/abc/Bits'

export default function FollowUpsLoading() {
  return (
    <div className="mx-auto w-full max-w-[900px] px-4 pb-10 pt-5 sm:px-6 lg:px-8 lg:pt-8">
      <Skeleton className="h-3 w-20" />
      <Skeleton className="mt-3 h-8 w-48" />
      <Skeleton className="mt-3 h-4 w-72" />

      <Skeleton className="mt-8 h-3 w-24" />
      <div className="mt-3 flex flex-col gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="abc-surface p-4 sm:p-5">
            <div className="flex gap-3.5">
              <Skeleton className="h-11 w-11" radius={999} />
              <div className="min-w-0 flex-1">
                <Skeleton className="h-4 w-44" />
                <Skeleton className="mt-2 h-3 w-56" />
                <Skeleton className="mt-3 h-3 w-40" />
              </div>
            </div>
            <Skeleton className="mt-4 h-11 w-full" radius={13} />
          </div>
        ))}
      </div>
    </div>
  )
}
