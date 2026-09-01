import { Skeleton } from '@/components/ui/abc/Bits'

export default function ContactsLoading() {
  return (
    <div className="mx-auto w-full max-w-[1100px] abc-page-top px-4 pb-10 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="mt-3 h-8 w-56" />
          <Skeleton className="mt-3 h-4 w-72" />
        </div>
        <Skeleton className="h-11 w-[190px]" radius={13} />
      </div>

      <Skeleton className="mt-6 h-12 w-full" radius={15} />

      <div className="mt-3 flex gap-2">
        <Skeleton className="h-10 w-16" radius={999} />
        <Skeleton className="h-10 w-32" radius={999} />
        <Skeleton className="h-10 w-24" radius={999} />
      </div>

      <Skeleton className="mt-4 h-3 w-28" />

      <div className="abc-surface mt-3 divide-y divide-abc-border overflow-hidden">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex gap-4 px-4 py-4 sm:px-5">
            <Skeleton className="h-11 w-11" radius={999} />
            <div className="min-w-0 flex-1">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="mt-2 h-3 w-56" />
              <Skeleton className="mt-3 h-3 w-32" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
