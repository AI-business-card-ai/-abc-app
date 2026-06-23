import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase-route'
import { logActivity } from '@/lib/crm'

function csvEscape(value: string) {
  return `"${String(value).replace(/"/g, '""')}"`
}

export async function GET(req: NextRequest) {
  const supabase = createRouteHandlerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const format = req.nextUrl.searchParams.get('format') || 'salesforce'

  const { data: contacts, error } = await supabase
    .from('scanned_contacts')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!contacts?.length) {
    return NextResponse.json({ error: 'No contacts to export' }, { status: 404 })
  }

  const csvRows: string[] = []
  const filename = `abc-contacts-${format}-${new Date().toISOString().split('T')[0]}.csv`

  if (format === 'hubspot') {
    csvRows.push(
      'First Name,Last Name,Company Name,Job Title,Email Address,Phone Number,Website URL,Notes,Lead Score'
    )
    for (const c of contacts) {
      const nameParts = (c.name || '').split(' ')
      const firstName = nameParts[0] || ''
      const lastName = nameParts.slice(1).join(' ') || ''
      csvRows.push(
        [
          csvEscape(firstName),
          csvEscape(lastName),
          csvEscape(c.company || ''),
          csvEscape(c.role || ''),
          csvEscape(c.email || ''),
          csvEscape(c.phone || ''),
          csvEscape(c.website || ''),
          csvEscape((c.company_summary || c.notes || '').replace(/"/g, "'")),
          csvEscape(String(c.ai_lead_score || 0)),
        ].join(',')
      )
    }
  } else {
    csvRows.push(
      'First Name,Last Name,Company,Title,Email,Phone,Mobile,Website,Description,Lead Score,Status,Pipeline Stage,Last Activity'
    )
    for (const c of contacts) {
      const nameParts = (c.name || '').split(' ')
      const firstName = nameParts[0] || ''
      const lastName = nameParts.slice(1).join(' ') || ''
      csvRows.push(
        [
          csvEscape(firstName),
          csvEscape(lastName),
          csvEscape(c.company || ''),
          csvEscape(c.role || ''),
          csvEscape(c.email || ''),
          csvEscape(c.phone || ''),
          csvEscape(c.phone || ''),
          csvEscape(c.website || ''),
          csvEscape((c.company_summary || c.notes || '').replace(/"/g, "'")),
          csvEscape(String(c.ai_lead_score || 0)),
          csvEscape(c.crm_status || 'NEW'),
          csvEscape(c.pipeline_stage || 'new'),
          csvEscape(c.last_activity_at || ''),
        ].join(',')
      )
    }
  }

  for (const c of contacts.slice(0, 10)) {
    logActivity({
      contactId: c.id,
      userId: user.id,
      activityType: 'EXPORTED_CSV',
      activityDetail: `Exported to ${format} CSV`,
      metadata: { format, filename },
    }).catch(console.error)
  }

  const csv = '\uFEFF' + csvRows.join('\n')

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
