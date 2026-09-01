'use client'

export default function ProfileError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto w-full max-w-[560px] abc-page-top px-4 pb-12 text-center">
      <p className="text-[15px] font-semibold text-abc-text">Settings could not be opened</p>
      <p className="mt-1.5 text-[13px] leading-[1.5] text-abc-secondary">
        Something went wrong loading your account. Try again.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-5 inline-flex h-[48px] items-center justify-center rounded-btn bg-abc-gold px-5 text-[15px] font-semibold text-[#1a1205] transition-[filter] hover:brightness-[1.06] abc-focus-ring"
      >
        Try again
      </button>
    </div>
  )
}
