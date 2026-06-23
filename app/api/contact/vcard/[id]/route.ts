import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase-route'
import { createServerSupabase } from '@/lib/supabase'
import { logActivity } from '@/lib/crm'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const authClient = createRouteHandlerClient()
  const { data: { user } } = await authClient.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServerSupabase()

  const { data: contact } = await supabase
    .from('scanned_contacts')
    .select('*')
    .eq('id', params.id)
    .eq('user_id', user.id)
    .single()

  if (!contact) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const nameParts = (contact.name || '').split(' ')
  const firstName = nameParts[0] || ''
  const lastName = nameParts.slice(1).join(' ') || ''

  const vcard = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `FN:${contact.name || ''}`,
    `N:${lastName};${firstName};;;`,
    `ORG:${contact.company || ''}`,
    `TITLE:${contact.role || ''}`,
    `TEL:${contact.phone || ''}`,
    `EMAIL:${contact.email || ''}`,
    `URL:${contact.website || ''}`,
    'END:VCARD',
  ].join('\r\n')

  const filename = (contact.name || 'contact').replace(/[^\w\s-]/g, '').trim() || 'contact'

  logActivity({
    contactId: contact.id,
    userId: user.id,
    activityType: 'VCARD_SAVED',
    activityDetail: `Contact saved to phone: ${contact.name || 'contact'}`,
  }).catch(console.error)

  return new Response(vcard, {
    headers: {
      'Content-Type': 'text/vcard; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}.vcf"`,
    },
  })
}
