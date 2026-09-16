import Link from 'next/link'

export const metadata = {
  title: 'Page not found — ABC',
}

/**
 * An address ABC does not have.
 *
 * Next's default 404 is an unstyled black-on-white page with no way back, which
 * inside the installed app or the store apps is a dead end — there is no
 * browser address bar to escape it with. Public card addresses keep their own
 * not-found (app/d/[slug]/not-found.tsx).
 */
export default function NotFound() {
  return (
    <div className="mx-auto w-full max-w-[560px] abc-page-top px-4 pb-12 text-center">
      <p className="text-[15px] font-semibold text-abc-text">Page not found</p>
      <p className="mt-1.5 text-[13px] leading-[1.5] text-abc-secondary">
        This address does not exist in ABC, or it has moved.
      </p>
      <div className="mt-5">
        <Link
          href="/home"
          className="inline-flex h-[48px] items-center justify-center rounded-btn bg-abc-gold px-5 text-[15px] font-semibold text-[#1a1205] transition-[filter] hover:brightness-[1.06] abc-focus-ring"
        >
          Go home
        </Link>
      </div>
    </div>
  )
}
