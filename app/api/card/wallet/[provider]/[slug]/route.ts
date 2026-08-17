import { NextRequest, NextResponse } from 'next/server'
import { loadPublishedCardBySlug } from '@/lib/card/public-data'
import { WALLET_REQUIREMENTS, walletCapabilities, type WalletProvider } from '@/lib/card/wallet'
import { createServerSupabase } from '@/lib/supabase'

/**
 * Wallet pass endpoint.
 *
 * The card resolution, ownership and error handling are real. What is not yet
 * possible is the pass itself: signing a .pkpass needs an Apple pass-type
 * certificate and the WWDR chain, and a Google Wallet object needs an issuer
 * account and a service-account key. Neither exists in this project.
 *
 * When the credentials are absent this returns 501 and names exactly what is
 * missing, rather than returning something that merely looks like a pass. In
 * particular it never falls back to a vCard — a wallet action that quietly
 * hands over a .vcf would be a lie about what the product does.
 */

function isProvider(value: string): value is WalletProvider {
  return value === 'apple' || value === 'google'
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { provider: string; slug: string } }
) {
  try {
    const provider = params.provider
    if (!isProvider(provider)) {
      return NextResponse.json({ error: 'Unknown wallet provider.' }, { status: 404 })
    }

    const slug = decodeURIComponent(params.slug || '').trim().toLowerCase()
    if (!slug) return NextResponse.json({ error: 'Missing card address.' }, { status: 400 })

    const supabase = createServerSupabase()
    const card = await loadPublishedCardBySlug(supabase, slug)
    if (!card) return NextResponse.json({ error: 'Card not found.' }, { status: 404 })

    const capability = walletCapabilities()[provider]
    if (!capability.configured) {
      return NextResponse.json(
        {
          error:
            provider === 'apple'
              ? 'Apple Wallet is not set up for this deployment yet.'
              : 'Google Wallet is not set up for this deployment yet.',
          reason: 'not_configured',
          missing: capability.missing,
          required: WALLET_REQUIREMENTS[provider],
        },
        { status: 501 }
      )
    }

    // Credentials exist but pass generation is not implemented yet. Fail loudly
    // rather than return a file that is not a real pass.
    return NextResponse.json(
      {
        error: 'Pass generation is not implemented yet.',
        reason: 'not_implemented',
      },
      { status: 501 }
    )
  } catch (err) {
    console.error('[card/wallet] error:', err)
    return NextResponse.json({ error: 'Wallet pass could not be created.' }, { status: 500 })
  }
}
