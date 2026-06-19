import { createServerSupabase } from '@/lib/supabase'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  try {
    const { userId, apiKey } = (await req.json()) as {
      userId?: string
      apiKey?: string
    }

    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!apiKey) return NextResponse.json({ error: 'Missing apiKey' }, { status: 400 })

    // Validace — ověř, že token funguje proti HubSpot API
    const testRes = await fetch(
      'https://api.hubapi.com/crm/v3/objects/contacts?limit=1',
      { headers: { Authorization: `Bearer ${apiKey}` } }
    )

    if (!testRes.ok) {
      return NextResponse.json({ error: 'Invalid HubSpot token' }, { status: 400 })
    }

    const supabase = createServerSupabase()
    const { error } = await supabase
      .from('abc_profiles')
      .update({ hubspot_api_key: apiKey })
      .eq('id', userId)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save token'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const { userId } = (await req.json()) as { userId?: string }

    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = createServerSupabase()
    const { error } = await supabase
      .from('abc_profiles')
      .update({ hubspot_api_key: null })
      .eq('id', userId)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to disconnect'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
