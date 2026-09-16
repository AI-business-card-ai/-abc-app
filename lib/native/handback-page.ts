import { escapeHtml } from '@/lib/email-safety'

/**
 * The page the system browser shows while it hands a finished flow back to the
 * app — a sign-in (app/auth/native/return) or a connection (the connector
 * callbacks).
 *
 * An HTML page rather than a bare redirect: a browser may want a tap before it
 * opens another app, and somebody who opens the address on a computer should
 * see what it is for rather than an error. Nothing on it is cached, sent as a
 * referrer, or indexed.
 */
export function nativeHandbackPage(appUrl: string, message: string): Response {
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
<p>${escapeHtml(message)}</p>
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
