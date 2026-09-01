import { Skeleton } from '@/components/ui/abc/Bits'

export default function MyCardLoading() {
  return (
    <div className="mx-auto w-full max-w-[560px] abc-page-top px-4 pb-10 sm:px-6">
      <Skeleton className="h-3 w-20" />
      <Skeleton className="mt-3 h-8 w-52" />
      <Skeleton className="mt-3 h-4 w-64" />

      {/* Card preview */}
      <div className="mt-6 rounded-card border border-abc-border bg-abc-card p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <Skeleton className="h-6 w-44" />
            <Skeleton className="mt-2.5 h-4 w-36" />
          </div>
          <Skeleton className="h-[68px] w-[68px]" radius={999} />
        </div>
        <div className="mt-5 space-y-2.5 border-t border-abc-border pt-4">
          <Skeleton className="h-3.5 w-40" />
          <Skeleton className="h-3.5 w-52" />
          <Skeleton className="h-3.5 w-32" />
        </div>
      </div>

      {/* QR */}
      <div className="mt-6 flex flex-col items-center rounded-card border border-abc-border bg-abc-card p-5 sm:p-6">
        <Skeleton className="h-[236px] w-[min(62vw,236px)]" radius={18} />
        <Skeleton className="mt-4 h-3.5 w-56" />
        <Skeleton className="mt-5 h-[52px] w-full" radius={13} />
        <div className="mt-2.5 grid w-full grid-cols-2 gap-2.5">
          <Skeleton className="h-[52px] w-full" radius={13} />
          <Skeleton className="h-[52px] w-full" radius={13} />
        </div>
      </div>
    </div>
  )
}
