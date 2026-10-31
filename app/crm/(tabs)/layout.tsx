import type { ReactNode } from 'react'
import CrmTabs from '@/components/opportunities/CrmTabs'

/**
 * ABC CRM — the header and tabs every CRM view shares.
 *
 * The header and tabs belong to this layout, not to the pages, so switching
 * tabs only swaps the body: the title stays where it is and the tab's own
 * light skeleton fills in underneath.
 */
export default function CrmLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[1180px] abc-page-top px-4 pb-10 sm:px-6 lg:px-8">
      <header className="min-w-0">
        <h1 className="text-[28px] font-bold leading-tight tracking-tight text-abc-text lg:text-[36px]">CRM</h1>
        <p className="mt-1.5 text-[14px] text-abc-secondary lg:text-[16px]">Keep every opportunity moving.</p>
      </header>
      <CrmTabs />
      <div className="mt-5">{children}</div>
    </div>
  )
}
