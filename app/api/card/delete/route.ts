import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase-route'
import { createServiceClient } from '@/lib/supabase/service'
import { deleteOwnedContact } from '@/lib/contacts/delete'

const DELETE_FAILED = 'Could not delete this contact.'

async function deleteContact(req: NextRequest) {
  try {
    const authClient = createRouteHandlerClient()
    const {
      data: { user },
    } = await authClient.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = (await req.json()) as { contactId?: string }
    const { contactId } = body

    if (!contactId) {
      return NextResponse.json({ error: 'Missing contactId' }, { status: 400 })
    }

    // The owner is the verified session user; the body names a contact and nothing else.
    const result = await deleteOwnedContact(createServiceClient(), user.id, contactId)
    if (!result.ok) {
      return NextResponse.json({ error: DELETE_FAILED }, { status: 500 })
    }

    // Also a success when nothing matched: already deleted, or not this owner's.
    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    // Never the raw message: a database error can quote the row it refused.
    console.error('[card/delete] failed:', err instanceof Error ? err.name : 'unknown')
    return NextResponse.json({ error: DELETE_FAILED }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  return deleteContact(req)
}

export async function POST(req: NextRequest) {
  return deleteContact(req)
}
