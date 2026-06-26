import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase-route'
import { onExported } from '@/lib/crm-engine'
import { contactsToCsv } from '@/lib/crm-export'
import {
  mapToUniversalRow,
  UNIVERSAL_CSV_HEADERS,
} from '@/lib/salesforce-mapper'
import type { ScannedContact } from '@/lib/types'

function csvEscape(value: string | number) {
  return `"${String(value).replace(/"/g, '""')}"`
}

function rowToCsv(values: (string | number)[]) {
  return values.map(csvEscape).join(',')
}

export async function GET(req: NextRequest) {
  const supabase = createRouteHandlerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

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

  const rows = contacts as ScannedContact[]
  const csvRows: string[] = []
  const filename = `abc-contacts-${format}-${new Date().toISOString().split('T')[0]}.csv`

  let csv: string
  if (format === 'hubspot') {
    csv = contactsToCsv(rows, 'hubspot')
  } else if (format === 'universal') {
    csvRows.push(UNIVERSAL_CSV_HEADERS.join(','))
    for (const c of rows) {
      const mapped = mapToUniversalRow(c)
      csvRows.push(rowToCsv(UNIVERSAL_CSV_HEADERS.map((h) => mapped[h] ?? '')))
    }
    csv = csvRows.join('\n')
  } else {
    csv = contactsToCsv(rows, 'salesforce')
  }

  for (const c of rows.slice(0, 10)) {
    onExported(c.id, user.id, format).catch(console.error)
  }

  const csvContent = '\uFEFF' + csv

  return new Response(csvContent, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
