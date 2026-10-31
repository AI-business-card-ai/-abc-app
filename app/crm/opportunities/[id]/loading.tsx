import { Skeleton } from '@/components/ui/abc/Bits'

export default function OpportunityLoading() {
  return (
    <div className="mx-auto w-full max-w-[1100px] abc-page-top px-4 pb-10 sm:px-6 lg:px-8" aria-busy="true" aria-label="Loading opportunity">
      <Skeleton className="h-4 w-14" />
      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center">
        <Skeleton className="h-16 w-16" radius={999} />
        <div className="min-w-0 flex-1">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="mt-2.5 h-8 w-56" />
          <Skeleton className="mt-2 h-4 w-40" />
          <Skeleton className="mt-2.5 h-6 w-24" radius={999} />
        </div>
      </div>
      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          <Skeleton className="h-[150px] w-full" radius={22} />
          <Skeleton className="h-[130px] w-full" radius={22} />
          <Skeleton className="h-[190px] w-full" radius={22} />
        </div>
        <div className="flex flex-col gap-4">
          <Skeleton className="h-[170px] w-full" radius={22} />
          <Skeleton className="h-[230px] w-full" radius={22} />
        </div>
      </div>
    </div>
  )
}
