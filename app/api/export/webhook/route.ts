import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase-route'
import { createServiceClient } from '@/lib/supabase/service'
import { logActivity } from '@/lib/crm'

export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { webhookUrl, contactIds } = (await req.json()) as {
    webhookUrl?: string
    contactIds?: string[]
  }

  if (!webhookUrl) {
    return NextResponse.json({ error: 'Missing webhookUrl' }, { status: 400 })
  }

  let query = supabase.from('scanned_contacts').select('*').eq('user_id', user.id)

  if (contactIds?.length) {
    query = query.in('id', contactIds)
  }

  const { data: contacts, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!contacts?.length) {
    return NextResponse.json({ error: 'No contacts found' }, { status: 404 })
  }

  const payload = {
    source: 'ABC AI Business Card',
    exported_at: new Date().toISOString(),
    user_id: user.id,
    total_contacts: contacts.length,
    contacts: contacts.map((c) => {
      const nameParts = (c.name || '').split(' ')
      const summary = c.company_summary || c.notes || ''
      return {
        id: c.id,
        first_name: nameParts[0] || '',
        last_name: nameParts.slice(1).join(' ') || '',
        full_name: c.name || '',
        company: c.company || '',
        job_title: c.role || '',
        email: c.email || '',
        phone: c.phone || '',
        website: c.website || '',
        linkedin_url: c.linkedin_url || '',
        notes: summary,
        ai_lead_score: c.ai_lead_score || 0,
        crm_status: c.crm_status || 'NEW',
        pipeline_stage: c.pipeline_stage || 'new',
        tags: c.tags || [],
        contact_count: c.contact_count || 0,
        scanned_at: c.created_at,
        last_activity_at: c.last_activity_at,
        last_activity_type: c.last_activity_type,
        salesforce: {
          FirstName: nameParts[0] || '',
          LastName: nameParts.slice(1).join(' ') || c.name || '',
          Company: c.company || '',
          Title: c.role || '',
          Email: c.email || '',
          Phone: c.phone || '',
          Website: c.website || '',
          Description: summary,
          LeadSource: 'ABC AI Business Card',
        },
        hubspot: {
          firstname: nameParts[0] || '',
          lastname: nameParts.slice(1).join(' ') || c.name || '',
          company: c.company || '',
          jobtitle: c.role || '',
          email: c.email || '',
          phone: c.phone || '',
          website: c.website || '',
          notes: summary,
        },
      }
    }),
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10000)

  try {
    const webhookResponse = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })

    clearTimeout(timeout)

    if (!webhookResponse.ok) {
      throw new Error(`Webhook returned ${webhookResponse.status}`)
    }

    const service = createServiceClient()
    await service
      .from('abc_profiles')
      .update({ webhook_url: webhookUrl })
      .eq('id', user.id)

    for (const c of contacts.slice(0, 10)) {
      logActivity({
        contactId: c.id,
        userId: user.id,
        activityType: 'WEBHOOK_SENT',
        activityDetail: 'Contacts sent to webhook',
        metadata: { webhookUrl, count: contacts.length },
      }).catch(console.error)
    }

    return NextResponse.json({
      success: true,
      contacts_sent: contacts.length,
      webhook_status: webhookResponse.status,
    })
  } catch (err) {
    clearTimeout(timeout)
    return NextResponse.json(
      {
        error: 'Webhook delivery failed',
        details: err instanceof Error ? err.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
