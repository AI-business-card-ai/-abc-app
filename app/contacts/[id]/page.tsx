import Link from 'next/link'
import { redirect } from 'next/navigation'
import { IconUserQuestion } from '@tabler/icons-react'
import ContactDetailView from '@/components/contacts/detail/ContactDetailView'
import Button from '@/components/ui/abc/Button'
import { EmptyState } from '@/components/ui/abc/Bits'
import { getContactDetail } from '@/lib/contact-detail'
import { createServerComponentClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export default async function ContactDetailPage({ params }: { params: { id: string } }) {
  const supabase = createServerComponentClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const data = await getContactDetail(params.id)

  if (!data) {
    return (
      <div className="mx-auto w-full max-w-[640px] px-4 pb-10 pt-6 sm:px-6">
        <Link
          href="/contacts"
          className="text-[13.5px] font-medium text-abc-secondary transition-colors hover:text-abc-text"
        >
          ← Contacts
        </Link>
        <div className="abc-surface mt-4">
          <EmptyState
            icon={IconUserQuestion}
            title="We couldn't find that contact."
            description="It may have been deleted, or the link is no longer valid."
            action={<Button href="/contacts">Back to contacts</Button>}
          />
        </div>
      </div>
    )
  }

  return <ContactDetailView contact={data.contact} crm={data.crm} />
}
