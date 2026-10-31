import Link from 'next/link'
import { redirect } from 'next/navigation'
import { IconLayoutKanban } from '@tabler/icons-react'
import OpportunityDetailView from '@/components/opportunities/OpportunityDetailView'
import Button from '@/components/ui/abc/Button'
import { EmptyState } from '@/components/ui/abc/Bits'
import { getOpportunityDetail } from '@/lib/opportunities/data'
import { createServerComponentClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export default async function OpportunityPage({
  params,
  searchParams,
}: {
  params: { id: string }
  searchParams?: { step?: string }
}) {
  const supabase = createServerComponentClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const data = await getOpportunityDetail(params.id)

  if (!data) {
    return (
      <div className="mx-auto w-full max-w-[640px] abc-page-top px-4 pb-10 sm:px-6">
        <Link href="/crm" className="text-[13.5px] font-medium text-abc-secondary transition-colors hover:text-abc-text">
          ← CRM
        </Link>
        <div className="abc-surface mt-4">
          <EmptyState
            icon={IconLayoutKanban}
            title="We couldn't find that opportunity."
            description="It may have been removed with its contact, or the link is no longer valid."
            action={<Button href="/crm">Back to CRM</Button>}
          />
        </div>
      </div>
    )
  }

  return <OpportunityDetailView data={data} stepUnsaved={searchParams?.step === 'unsaved'} />
}
