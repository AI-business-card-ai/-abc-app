import { Skeleton } from '@/components/ui/abc/Bits'

export default function HomeLoading() {
  return (
    <div className="mx-auto w-full max-w-[1440px] abc-page-top px-4 pb-10 sm:px-6 lg:px-8">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="mt-3 h-4 w-72" />

      <div className="mt-6 grid grid-cols-1 gap-4 min-[430px]:grid-cols-2 lg:mt-8 lg:grid-cols-4 lg:gap-5">
        <div className="min-[430px]:col-span-2 lg:col-span-1">
          <Skeleton className="h-[260px] w-full" radius={22} />
        </div>
        <Skeleton className="h-[260px] w-full" radius={22} />
        <Skeleton className="h-[260px] w-full" radius={22} />
        <div className="min-[430px]:col-span-2 lg:col-span-1">
          <Skeleton className="h-[260px] w-full" radius={22} />
        </div>
      </div>
    </div>
  )
}
