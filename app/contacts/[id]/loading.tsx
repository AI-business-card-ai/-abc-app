import { Skeleton } from '@/components/ui/abc/Bits'

export default function ContactDetailLoading() {
  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 pb-10 pt-4 sm:px-6 lg:px-8 lg:pt-6">
      <Skeleton className="h-4 w-24" />

      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center">
        <Skeleton className="h-[76px] w-[76px]" radius={999} />
        <div className="min-w-0 flex-1">
          <Skeleton className="h-7 w-56" />
          <Skeleton className="mt-2.5 h-4 w-40" />
          <Skeleton className="mt-2 h-3 w-48" />
        </div>
      </div>

      <div className="mt-5 flex gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[62px] flex-1" radius={15} />
        ))}
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] lg:items-start">
        <div className="flex flex-col gap-4">
          <Skeleton className="h-[280px] w-full" radius={22} />
          <Skeleton className="h-[240px] w-full" radius={22} />
        </div>
        <div className="flex flex-col gap-4">
          <Skeleton className="h-[220px] w-full" radius={22} />
          <Skeleton className="h-[180px] w-full" radius={22} />
        </div>
      </div>
    </div>
  )
}
