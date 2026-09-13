/**
 * Notification email templates: untrusted text stays text.
 *
 * Run with `npm run test:email` from the repository root.
 *
 * The renderers are pure and tested directly. The senders are the real ones:
 * the Resend SDK sends through the global `fetch`, which is replaced here by a
 * spy that records the exact payload the provider would have received and
 * answers like the provider. Nothing reaches the network.
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

import {
  appOrigin,
  contactLink,
  escapeHtml,
  headerText,
  htmlMultiline,
  isSingleEmailAddress,
} from '@/lib/email-safety'
import { isUsableRecipient } from '@/lib/welcome-email'
import { rateLimitBucket } from '@/lib/rate-limit'

const ROOT = process.cwd()
let passed = 0
const failures: string[] = []

function check(label: string, got: unknown, want: unknown) {
  if (JSON.stringify(got) === JSON.stringify(want)) {
    passed++
    return
  }
  failures.push(`${label}\n     got:  ${JSON.stringify(got)}\n     want: ${JSON.stringify(want)}`)
}

const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8')
const code = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
const git = (...args: string[]) =>
  execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()

type Captured = { url: string; payload: Record<string, unknown> }
const provider: Captured[] = []

async function captureFetch(input: unknown, init?: { body?: unknown }): Promise<Response> {
  let url = ''
  let body = ''
  if (typeof input === 'string') url = input
  else if (input instanceof URL) url = input.toString()
  else if (input instanceof Request) {
    url = input.url
    body = await input.clone().text()
  }
  if (!body && init && typeof init.body === 'string') body = init.body
  provider.push({ url, payload: body ? (JSON.parse(body) as Record<string, unknown>) : {} })
  return new Response(JSON.stringify({ id: 'email_test_0001' }), { status: 200, headers: { 'content-type': 'application/json' } })
}

const OWNER = 'owner@example.com'
const CONTACT_ID = '2f1c5d7e-8a9b-4c3d-9e2f-1a2b3c4d5e6f'
const XSS = '<img src=x onerror=alert(1)>'
const SCRIPT = '<script>alert(1)</script>'
const LINK = '<a href="https://evil.example">ABC</a>'

const noMarkup = (html: string) => !/<img\b|<script\b|<a href="https:\/\/evil|onerror=alert\(1\)>/i.test(html)

async function run() {
  const realFetch = globalThis.fetch
  globalThis.fetch = captureFetch as typeof fetch
  process.env.RESEND_API_KEY = 're_test_never_used_for_real'
  process.env.NEXT_PUBLIC_APP_URL = 'https://www.abccard.io'

  const email = await import('@/lib/email')

  // ═══════════════════ ESCAPING ═══════════════════

  check('1  <script> is literal text', [escapeHtml(SCRIPT), noMarkup(email.renderCardExchangeEmail({ ownerName: 'Owner', contactName: SCRIPT, contactId: CONTACT_ID }).html)], ['&lt;script&gt;alert(1)&lt;/script&gt;', true])
  check('2  <img onerror> is literal text', [escapeHtml(XSS), noMarkup(email.renderReverseLeadEmail({ ownerName: 'Owner', contactName: XSS, contactId: CONTACT_ID }).html)], ['&lt;img src=x onerror=alert(1)&gt;', true])
  check('3  <a href> is literal text', [escapeHtml(LINK), noMarkup(email.renderQrConnectEmail({ ownerName: 'Owner', newUserName: LINK }).html)], ['&lt;a href=&quot;https://evil.example&quot;&gt;ABC&lt;/a&gt;', true])
  check('4  an ampersand reads as one', [escapeHtml('David & Co.'), email.renderCardExchangeEmail({ ownerName: 'Owner', contactName: 'David & Co.', contactId: CONTACT_ID }).html.includes('David &amp; Co.')], ['David &amp; Co.', true])
  check('5  double quotes are encoded', escapeHtml('The "Best" Ltd'), 'The &quot;Best&quot; Ltd')
  check('6  apostrophes are encoded', escapeHtml("O'Neil"), 'O&#39;Neil')

  const unicode = email.renderCardExchangeEmail({
    ownerName: 'Jana Nováková',
    contactName: 'Jiří Dvořák',
    company: 'Müller & Söhne GmbH',
    role: '営業部長',
    email: 'jürgen@münchen.example',
    contactId: CONTACT_ID,
  })
  check('7  names in other scripts are preserved', [unicode.html.includes('営業部長'), escapeHtml('田中太郎 · 김민준 · Ωμέγα')], [true, '田中太郎 · 김민준 · Ωμέγα'])
  check('8  Czech accents are preserved', [unicode.html.includes('Jiří Dvořák'), unicode.html.includes('Jana Nováková'), unicode.subject.startsWith('Nová vizitka: Jiří Dvořák')], [true, true, true])
  check('9  German characters are preserved, ampersand escaped only in HTML', [unicode.html.includes('Müller &amp; Söhne GmbH'), unicode.subject.includes('(Müller & Söhne GmbH)'), unicode.html.includes('jürgen@münchen.example')], [true, true, true])

  const multiline = email.renderCardExchangeEmail({ ownerName: 'Owner', contactName: 'Anna', note: 'Line one\r\nLine <two>\nLine & three\n', contactId: CONTACT_ID })
  check('10 a multi-line note keeps its line breaks, escaped first', [htmlMultiline('Line one\r\nLine <two>\nLine & three\n'), multiline.html.includes('Line one<br>Line &lt;two&gt;<br>Line &amp; three')], ['Line one<br>Line &lt;two&gt;<br>Line &amp; three', true])
  check('10b a line break cannot smuggle a tag', htmlMultiline('<scr\nipt>'), '&lt;scr<br>ipt&gt;')
  check('11 an entity cannot decode back into markup', [escapeHtml('&lt;script&gt;alert(1)&lt;/script&gt;'), noMarkup(email.renderReverseLeadEmail({ ownerName: 'Owner', contactName: '&lt;img src=x onerror=alert(1)&gt;', context: '&#60;script&#62;', contactId: CONTACT_ID }).html)], ['&amp;lt;script&amp;gt;alert(1)&amp;lt;/script&amp;gt;', true])

  const everyField = email.renderCardExchangeEmail({ ownerName: XSS, contactName: XSS, company: LINK, role: SCRIPT, email: `${XSS}@example.com`, phone: LINK, note: `${SCRIPT}\n${XSS}`, contactId: CONTACT_ID })
  check('12 name, company and role are all escaped', [noMarkup(everyField.html), everyField.html.includes('&lt;a href=&quot;https://evil.example&quot;&gt;ABC&lt;/a&gt;'), everyField.html.includes('&lt;script&gt;alert(1)&lt;/script&gt;')], [true, true, true])
  const reverseEverything = email.renderReverseLeadEmail({ ownerName: LINK, contactName: SCRIPT, company: XSS, context: `${LINK}\n${SCRIPT}`, contactId: CONTACT_ID })
  check('13 notes, context and message text are escaped', [noMarkup(everyField.html), noMarkup(reverseEverything.html), reverseEverything.html.includes('&lt;a href=&quot;https://evil.example&quot;&gt;ABC&lt;/a&gt;<br>&lt;script&gt;')], [true, true, true])

  check(
    '13b untrusted text never reaches an attribute: a hostile contact id gets no deep link, and the origin is configuration',
    [
      contactLink('https://www.abccard.io', CONTACT_ID),
      contactLink('https://www.abccard.io', '"><script>alert(1)</script>'),
      contactLink('javascript:alert(1)', CONTACT_ID),
      appOrigin('data:text/html,<script>'),
      email.renderCardExchangeEmail({ ownerName: 'Owner', contactName: 'Anna', contactId: '" onmouseover="alert(1)' }).html.includes('onmouseover'),
    ],
    [`https://www.abccard.io/contacts/${CONTACT_ID}`, 'https://www.abccard.io/contacts', `https://abccard.io/contacts/${CONTACT_ID}`, 'https://abccard.io', false]
  )

  // ═══════════════════ HEADERS ═══════════════════

  const injectedName = 'Eve\r\nBcc: victims@example.com\r\nX-Evil: 1'
  const headerEmail = email.renderCardExchangeEmail({ ownerName: 'Owner', contactName: injectedName, company: 'Acme\nReply-To: evil@example.com', email: 'eve@example.com', contactId: CONTACT_ID })
  check('14 a visitor cannot inject a header: the subject is one line', [/[\r\n]/.test(headerEmail.subject), headerEmail.subject, headerText('A' + String.fromCharCode(0) + 'B' + String.fromCharCode(0x2028) + 'C\tD' + String.fromCharCode(0x2029, 0x7f))], [false, 'Nová vizitka: Eve Bcc: victims@example.com X-Evil: 1 (Acme Reply-To: evil@example.com)', 'A B C D'])
  check('14b plain text is not HTML-escaped: a subject keeps its ampersand', email.renderReverseLeadEmail({ ownerName: 'Owner', contactName: 'Tom & Jerry', contactId: CONTACT_ID }).subject, 'New contact from your ABC card: Tom & Jerry')
  check(
    '16 a recipient is exactly one mailbox',
    [OWNER, 'owner@example.com\r\nBcc: x@example.com', 'owner@example.com, victim@example.com', 'owner@example.com;victim@example.com', 'Owner <owner@example.com>', '"a"@example.com', 'jürgen@münchen.example', 'not-an-address'].map((value) => isSingleEmailAddress(value)),
    [true, false, false, false, false, false, true, false]
  )
  check('16b the welcome route uses the same check', [isUsableRecipient('owner@example.com'), isUsableRecipient('a@b.com, c@d.com'), code('lib/welcome-email.ts').includes('return isSingleEmailAddress(value)')], [true, false, true])

  // ═══════════════════ FLOWS (real senders, provider captured) ═══════════════════

  provider.length = 0
  const exchange = await email.sendCardExchangeNotification({ to: OWNER, ownerName: 'Jana Nováková', contactName: 'Jiří Dvořák', company: 'Müller & Söhne GmbH', email: 'jiri@example.cz', phone: '+420 777 123 456', role: 'Sales Director', contactId: CONTACT_ID })
  const exchangeCall = provider[0]
  check('17 a card exchange notification is sent, with safe content', [exchange, provider.length, exchangeCall?.url.endsWith('/emails'), noMarkup(String(exchangeCall?.payload.html))], [{ ok: true }, 1, true, true])
  check('20 legitimate details look normal', [exchangeCall?.payload.subject, String(exchangeCall?.payload.html).includes('Jiří Dvořák'), String(exchangeCall?.payload.html).includes('+420 777 123 456')], ['Nová vizitka: Jiří Dvořák (Müller & Söhne GmbH)', true, true])
  check(
    '22 the owner receives every intended field, with a deep link to the contact',
    ['Jiří Dvořák', 'Sales Director', 'Müller &amp; Söhne GmbH', 'jiri@example.cz', '+420 777 123 456', `https://www.abccard.io/contacts/${CONTACT_ID}`, 'Ahoj Jana Nováková'].filter((part) => !String(exchangeCall?.payload.html).includes(part)),
    []
  )

  provider.length = 0
  const reverse = await email.sendReverseLeadNotification({ to: OWNER, ownerName: 'Owner', contactName: 'David & Co.', company: 'Acme', context: 'Met at the stand\nWants a demo', contactId: CONTACT_ID })
  check('18 a reverse-lead notification is sent', [reverse, provider.length, provider[0]?.payload.subject, String(provider[0]?.payload.html).includes('Met at the stand<br>Wants a demo')], [{ ok: true }, 1, 'New contact from your ABC card: David & Co.', true])

  provider.length = 0
  const qr = await email.sendQrConnectNotification({ to: OWNER, ownerName: 'Owner', newUserName: LINK })
  check('19 a QR-connect notification is sent, the new user\'s name as text', [qr, provider.length, noMarkup(String(provider[0]?.payload.html)), provider[0]?.payload.subject], [{ ok: true }, 1, true, '<a href="https://evil.example">ABC</a> joined ABC and saved your card'])

  provider.length = 0
  await email.sendCardExchangeNotification({ to: OWNER, ownerName: 'Owner', contactName: injectedName, company: 'Acme', email: 'eve@example.com\r\nBcc: x@example.com', phone: '1', role: 'x', contactId: CONTACT_ID })
  const hostile = provider[0]?.payload ?? {}
  check('15 no public value can change the sender', hostile.from, 'ABC AI Business Card <hello@abccard.io>')
  check('14c the provider receives sender, recipient, subject and body only — no reply-to, cc or bcc', Object.keys(hostile).sort(), ['from', 'html', 'subject', 'to'])
  check('16c the recipient is the owner alone', hostile.to, OWNER)

  provider.length = 0
  const refusedRecipients = []
  for (const to of ['owner@example.com\r\nBcc: x@example.com', 'owner@example.com, victim@example.com', 'Owner <owner@example.com>', '']) {
    refusedRecipients.push((await email.sendQrConnectNotification({ to, ownerName: 'Owner', newUserName: 'Someone' })).ok)
  }
  check('24 a recipient carrying a second address or a header never reaches the provider', [refusedRecipients, provider.length], [[false, false, false, false], 0])

  provider.length = 0
  await email.sendCardExchangeNotification({ to: OWNER, ownerName: 'Owner', contactName: 'One', contactId: CONTACT_ID })
  await email.sendReverseLeadNotification({ to: OWNER, ownerName: 'Owner', contactName: 'Two', contactId: CONTACT_ID })
  await email.sendQrConnectNotification({ to: OWNER, ownerName: 'Owner', newUserName: 'Three' })
  check('23 the provider is called exactly once per notification', [provider.length, provider.map((call) => call.payload.to)], [3, [OWNER, OWNER, OWNER]])

  const emailCode = code('lib/email.ts')
  check('15b the sender is a literal in every send, and no header is built from a variable', [(emailCode.match(/from: 'ABC AI Business Card <hello@abccard\.io>'/g) ?? []).length, /replyTo|reply_to|\bcc:|\bbcc:|headers:/i.test(emailCode)], [2, false])

  // ═══════════════════ GMAIL (the owner's own mailbox) ═══════════════════

  const { sendGmailMessage } = await import('@/lib/gmail')
  const decode = (raw: unknown) => Buffer.from(String(raw).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')

  provider.length = 0
  await sendGmailMessage('ya29.test-token', 'contact@example.com', 'Follow-up\r\nBcc: everyone@example.com', 'Hi <b>Anna</b>,\nGreat to meet you & your team.')
  const mime = decode(provider[0]?.payload.raw)
  const [headerBlock, ...bodyParts] = mime.split('\n\n')
  const headerLines = headerBlock.split('\n')
  check('G1 a Gmail subject cannot add a header, and the recipient is one address', [headerLines.map((line) => line.split(':')[0]), headerLines[0], headerLines[1]], [['To', 'Subject', 'Content-Type'], 'To: contact@example.com', 'Subject: Follow-up Bcc: everyone@example.com'])
  check('G2 the Gmail body is escaped by the canonical helper, line breaks kept', bodyParts.join('\n\n'), 'Hi &lt;b&gt;Anna&lt;/b&gt;,<br>Great to meet you &amp; your team.')

  provider.length = 0
  let refusedRecipient = ''
  try {
    await sendGmailMessage('ya29.test-token', 'contact@example.com\r\nBcc: everyone@example.com', 'Hi', 'Body')
  } catch (err) {
    refusedRecipient = (err as Error).message
  }
  check('G3 a stored address carrying a header is refused before Gmail is called', [refusedRecipient, provider.length], ['Invalid recipient address', 0])

  const capturing = globalThis.fetch
  globalThis.fetch = (async () => new Response('{"error":{"message":"SECRET_UPSTREAM_DETAIL invalid_grant"}}', { status: 400 })) as typeof fetch
  let upstream = ''
  try {
    await sendGmailMessage('ya29.test-token', 'contact@example.com', 'Hi', 'Body')
  } catch (err) {
    upstream = (err as Error).message
  }
  globalThis.fetch = capturing
  check("G4 Gmail's own error text is never passed on", upstream, 'Failed to send Gmail message')

  // ═══════════════════ UNCHANGED BEHAVIOUR ═══════════════════

  const untouched = ['app/api/card/exchange/route.ts', 'lib/card/exchange.ts', 'lib/qr-connect.ts', 'components/card/CardExchangeModal.tsx', 'lib/rate-limit.ts', 'app/api/email/send/route.ts']
  check('21 contact and lead creation are unchanged: the exchange, QR-connect and rate-limit code is untouched', git('diff', '--name-only', 'origin/berlin-security-hardening', '--', ...untouched), '')
  check('21b the callers still pass the same fields', [code('app/api/card/exchange/route.ts').includes('void sendCardExchangeNotification({'), code('lib/qr-connect.ts').includes('sendQrConnectNotification({')], [true, true])

  provider.length = 0
  const welcome = await email.sendWelcomeEmail(OWNER, 'Anna <b>')
  check('W  the welcome email is unchanged: same subject, still escaped, sent once', [welcome, provider.length, provider[0]?.payload.subject, String(provider[0]?.payload.html).includes('Welcome to ABC, Anna &lt;b&gt;!'), email.renderWelcomeEmailHtml('Anna').includes('Welcome to ABC, Anna!')], [{ ok: true }, 1, 'Welcome to ABC — Scan. Know. Connect.', true, true])

  const escapers = ['lib', 'app', 'components']
    .flatMap((dir) => git('ls-files', dir).split('\n'))
    .filter((f) => /\.(ts|tsx)$/.test(f) && f !== 'lib/email-safety.ts' && /replace\(\s*\/&\/g,\s*'&amp;'\)/.test(read(f)))
  check('C  one canonical escaper: no other file carries its own ampersand-escaping chain', escapers, [])

  // ═══════════════════ RATE-LIMIT SALT ═══════════════════

  const salt = process.env.EXCHANGE_RATE_LIMIT_SALT
  delete process.env.EXCHANGE_RATE_LIMIT_SALT
  const missing = rateLimitBucket('email:welcome', 'user-a', 'user-a')
  process.env.EXCHANGE_RATE_LIMIT_SALT = 'test-salt'
  const present = rateLimitBucket('email:welcome', 'user-a', 'user-a')
  if (salt === undefined) delete process.env.EXCHANGE_RATE_LIMIT_SALT
  else process.env.EXCHANGE_RATE_LIMIT_SALT = salt
  check('S  without the salt the limiter refuses (no weak default), with it keys are opaque', [missing, typeof present === 'string' && /^[0-9a-f]{48}$/.test(present), (code('lib/rate-limit.ts').match(/EXCHANGE_RATE_LIMIT_SALT/g) ?? []).length], [null, true, 1])
  check('S2 the salt is part of the documented environment, with no value', /^EXCHANGE_RATE_LIMIT_SALT=$/m.test(read('.env.local.example')), true)

  globalThis.fetch = realFetch

  const total = passed + failures.length
  if (failures.length) {
    console.log(`\nEmail templates: ${passed}/${total} PASS, ${failures.length} FAILED\n`)
    for (const failure of failures) console.log('  FAIL ' + failure)
    process.exit(1)
  }
  console.log(`\nEmail templates: ${passed}/${total} PASS`)
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
