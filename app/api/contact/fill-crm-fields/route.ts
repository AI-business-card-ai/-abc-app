import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase-route'
import { ensureMandatoryCompanyFields } from '@/lib/company-field-estimator'
import type { ScannedContact } from '@/lib/types'
import { serverErrorResponse } from '@/lib/api/errors'

export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = (await req.json()) as { contactId?: string }
    if (!body.contactId) {
      return NextResponse.json({ error: 'Missing contactId' }, { status: 400 })
    }

    const { data: contact, error } = await supabase
      .from('scanned_contacts')
      .select('*')
      .eq('id', body.contactId)
      .eq('user_id', user.id)
      .single()

    if (error || !contact) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
    }

    const fieldUpdate = await ensureMandatoryCompanyFields(contact as ScannedContact)

    const { data: updated, error: updateError } = await supabase
      .from('scanned_contacts')
      .update(fieldUpdate)
      .eq('id', body.contactId)
      .eq('user_id', user.id)
      .select('*')
      .single()

    if (updateError || !updated) {
      return serverErrorResponse('contact/fill-crm-fields', updateError, 'Could not fill the CRM fields. Try again.')
    }

    return NextResponse.json({ success: true, contact: updated })
  } catch (err) {
    return serverErrorResponse('contact/fill-crm-fields', err, 'Could not fill the CRM fields. Try again.')
  }
}
