import type { NextRequest } from 'next/server'
import {
  finishNativeConnectorCallback,
  isNativeConnectorState,
  nativeConnectHandbackUrl,
  type HandbackTarget,
} from '@/lib/connectors/native'
import { exchangeNativeConnectorCode } from '@/lib/connectors/native-providers'
import type { NativeConnectorProvider } from '@/lib/connectors/native-shared'
import { nativeHandbackPage } from '@/lib/native/handback-page'
import { createServiceClient } from '@/lib/supabase/service'

/**
 * The branch each connector callback takes first.
 *
 * A state minted for the native flow (lib/connectors/native.ts) is finished
 * here and handed back to the app. Any other state returns null and the web
 * callback runs exactly as before — its signed cookie and session checks
 * untouched. The two shapes cannot be confused: a web state is a bare nonce, a
 * native one is prefixed and signed.
 */
export async function nativeConnectorCallback(
  request: NextRequest,
  provider: NativeConnectorProvider
): Promise<Response | null> {
  const params = request.nextUrl.searchParams
  const state = params.get('state')
  if (!isNativeConnectorState(state)) return null

  let target: HandbackTarget
  try {
    target = await finishNativeConnectorCallback(
      { db: createServiceClient(), exchange: exchangeNativeConnectorCode },
      provider,
      { code: params.get('code'), state, error: params.get('error') }
    )
  } catch (err) {
    console.error(`[connectors/native/callback] provider=${provider} stage=unavailable_${err instanceof Error ? err.constructor.name : 'error'}`)
    target = { kind: 'failed', attemptId: null }
  }

  const message =
    target.kind === 'authorized'
      ? 'Your connection continues in the app.'
      : target.kind === 'cancelled'
        ? 'The connection was cancelled. You can return to the app.'
        : 'The connection could not be completed. Return to the app to try again.'

  return nativeHandbackPage(nativeConnectHandbackUrl(target), message)
}
