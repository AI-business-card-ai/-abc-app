import { NextRequest } from 'next/server'
import { escapeHtml } from '@/lib/email-safety'
import { openNativeAuthFlow } from '@/lib/native/auth-flow'
import { NATIVE_AUTH_CALLBACK_URL, NATIVE_AUTH_CODE_PATTERN } from '@/lib/native/deep-link'

/**
 * Where the system browser lands after a native sign-in, and the hand back into
 * the app.
 *
 * This page completes nothing. It checks that the flow is one of ours and still
 * live, then passes the code and flow to the app's URL scheme, where the app
 * finishes the sign-in with the nonce only it holds. A link to this page crafted
 * by somebody else can therefore get as far as opening the app, and no further.
 *
 * An HTML page rather than a bare redirect: a browser may want a tap before it
 * opens another app, and somebody who opens this address on a computer should
 * see what it is for rather than an error.
 */

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const flow = params.get('flow')
  const code = params.get('code')
  const providerError = params.get('error')

  const target = new URL(NATIVE_AUTH_CALLBACK_URL)
  const opened = openNativeAuthFlow(flow)

  if (providerError) {
    target.searchParams.set('error', providerError === 'access_denied' ? 'cancelled' : 'failed')
  } else if (!opened.ok || !code || !NATIVE_AUTH_CODE_PATTERN.test(code) || !flow) {
    console.error('[auth/native/return] refused:', opened.ok ? 'code missing or malformed' : `flow ${opened.reason}`)
    target.searchParams.set('error', 'failed')
  } else {
    target.searchParams.set('code', code)
    target.searchParams.set('flow', flow)
  }

  return returnPage(target.toString())
}

function returnPage(appUrl: string) {
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex">
<title>Return to ABC Card</title>
<style>
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0a0a0b;color:#f5f5f4;font:15px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;text-align:center;padding:max(24px,env(safe-area-inset-top)) 24px max(24px,env(safe-area-inset-bottom))}
h1{font-size:20px;margin:0 0 8px}
p{margin:0 0 24px;color:#a8a29e}
a{display:inline-block;padding:12px 20px;border-radius:12px;background:#d9a441;color:#1a1205;font-weight:600;text-decoration:none}
</style>
</head>
<body>
<main>
<h1>Return to ABC Card</h1>
<p>Your sign-in continues in the app.</p>
<a href="${escapeHtml(appUrl)}">Open ABC Card</a>
</main>
<script>window.location.replace(${JSON.stringify(appUrl).replace(/</g, '\\u003c')})</script>
</body>
</html>`

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
      'X-Robots-Tag': 'noindex',
    },
  })
}
