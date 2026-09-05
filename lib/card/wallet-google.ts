import { createSign } from 'node:crypto'
import type { WalletCardPayload } from '@/lib/card/wallet-payload'
import { googleObjectSuffix, walletQrUrl, walletSubtitle } from '@/lib/card/wallet-payload'

/**
 * The Google Wallet pass.
 *
 * Two things happen here that Apple does not need. The object is created on
 * Google's side over the REST API before anything is handed to the browser,
 * and the link the owner follows carries only a reference to it. Google
 * documents a safe length of about 1800 characters for the encoded token in a
 * save link; a whole pass inlined in there is a pass that works until somebody
 * writes a long enough job title, and then silently truncates. A reference is
 * a hundred-odd characters whatever the card says.
 *
 * It also means the object is a durable record we can amend later with a
 * PATCH, rather than something reconstructed on every save.
 *
 * No new dependency: the service-account grant and the save token are both
 * RS256, which `node:crypto` signs directly.
 *
 * Server-only. The service-account key is read here and must never reach a
 * browser bundle.
 */

const WALLET_API = 'https://walletobjects.googleapis.com/walletobjects/v1'
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'
const ISSUER_SCOPE = 'https://www.googleapis.com/auth/wallet_object.issuer'
const SAVE_LINK_BASE = 'https://pay.google.com/gp/v/save/'

export const GOOGLE_WALLET_ORIGIN = 'https://abccard.io'
export const GOOGLE_WALLET_ISSUER_NAME = 'ABC Card'
const GOOGLE_LOGO_URI = `${GOOGLE_WALLET_ORIGIN}/wallet/abc-wallet-logo.png`
const LANGUAGE = 'en-US'
const BACKGROUND_COLOR = '#0a0a0b'

export type GoogleWalletConfig = {
  issuerId: string
  serviceAccountEmail: string
  serviceAccountKey: string
  classId: string
}

export function readGoogleWalletConfig(): GoogleWalletConfig | null {
  const issuerId = process.env.GOOGLE_WALLET_ISSUER_ID?.trim()
  const serviceAccountEmail = process.env.GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL?.trim()
  const serviceAccountKey = process.env.GOOGLE_WALLET_SERVICE_ACCOUNT_KEY?.trim()
  const rawClassId = process.env.GOOGLE_WALLET_CLASS_ID?.trim()

  if (!issuerId || !serviceAccountEmail || !serviceAccountKey || !rawClassId) return null

  return {
    issuerId,
    serviceAccountEmail,
    serviceAccountKey: decodeKey(serviceAccountKey),
    /*
      Google addresses every resource as `<issuerId>.<suffix>`. Accept the
      configured value either way round, so a bare suffix in the dashboard is
      not a production-only failure.
    */
    classId: rawClassId.includes('.') ? rawClassId : `${issuerId}.${rawClassId}`,
  }
}

/** Service-account keys travel base64-encoded for the same reason PEMs do. */
function decodeKey(value: string): string {
  if (value.includes('-----BEGIN')) return value.replace(/\\n/g, '\n')
  try {
    return Buffer.from(value, 'base64').toString('utf8')
  } catch {
    return value
  }
}

function base64Url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function signRs256(payload: Record<string, unknown>, key: string): string {
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const body = base64Url(JSON.stringify(payload))
  const signer = createSign('RSA-SHA256')
  signer.update(`${header}.${body}`)
  signer.end()
  return `${header}.${body}.${base64Url(signer.sign(key))}`
}

/**
 * Exchanges the service-account key for an access token, using the JWT-bearer
 * grant. This is the whole of what `google-auth-library` would have been used
 * for here.
 */
async function getAccessToken(config: GoogleWalletConfig): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const assertion = signRs256(
    {
      iss: config.serviceAccountEmail,
      scope: ISSUER_SCOPE,
      aud: TOKEN_ENDPOINT,
      iat: now,
      exp: now + 3600,
    },
    config.serviceAccountKey
  )

  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  })

  if (!res.ok) {
    /* The body can echo key material back, so only the status is logged. */
    throw new Error(`google wallet token request failed (${res.status})`)
  }

  const json = (await res.json()) as { access_token?: string }
  if (!json.access_token) throw new Error('google wallet token response had no access_token')
  return json.access_token
}

function localized(value: string) {
  return { defaultValue: { language: LANGUAGE, value } }
}

export function googleObjectId(payload: WalletCardPayload, config: GoogleWalletConfig): string {
  return `${config.issuerId}.${googleObjectSuffix(payload)}`
}

export function buildGoogleObject(payload: WalletCardPayload, config: GoogleWalletConfig) {
  const subtitle = walletSubtitle(payload)

  return {
    id: googleObjectId(payload, config),
    classId: config.classId,
    genericType: 'GENERIC_TYPE_UNSPECIFIED',
    state: 'ACTIVE',
    hexBackgroundColor: BACKGROUND_COLOR,
    /* cardTitle is the business, header is the pass — so the person's name. */
    cardTitle: localized(GOOGLE_WALLET_ISSUER_NAME),
    header: localized(payload.fullName),
    ...(subtitle ? { subheader: localized(subtitle) } : {}),
    logo: {
      sourceUri: { uri: GOOGLE_LOGO_URI },
      contentDescription: localized(GOOGLE_WALLET_ISSUER_NAME),
    },
    barcode: {
      type: 'QR_CODE',
      value: walletQrUrl(payload, 'google'),
      alternateText: payload.publicUrl.replace(/^https?:\/\//, ''),
    },
    linksModuleData: {
      uris: [{ id: 'public_card', uri: payload.publicUrl, description: 'Open ABC Card' }],
    },
  }
}

async function walletRequest(
  token: string,
  path: string,
  init: { method: string; body?: unknown }
): Promise<Response> {
  return fetch(`${WALLET_API}${path}`, {
    method: init.method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    ...(init.body ? { body: JSON.stringify(init.body) } : {}),
  })
}

/**
 * Creates the shared product class if it is not already there.
 *
 * One class for every ABC card, not one per owner: a class describes the kind
 * of pass, and every ABC card is the same kind. Idempotent by reading first,
 * and tolerant of the race where two owners save at the same moment and the
 * second create comes back as a conflict.
 */
async function ensureClass(token: string, config: GoogleWalletConfig): Promise<void> {
  const existing = await walletRequest(token, `/genericClass/${config.classId}`, { method: 'GET' })
  if (existing.ok) return
  if (existing.status !== 404) {
    throw new Error(`google wallet class read failed (${existing.status})`)
  }

  const created = await walletRequest(token, '/genericClass', {
    method: 'POST',
    body: { id: config.classId },
  })
  if (!created.ok && created.status !== 409) {
    throw new Error(`google wallet class create failed (${created.status})`)
  }
}

/**
 * Writes the owner's object, creating it the first time and updating it after.
 *
 * The id is deterministic, so this is an upsert rather than an insert: an
 * owner who edits their card and saves the pass again amends the object they
 * already have instead of accumulating one per attempt.
 */
async function upsertObject(
  token: string,
  payload: WalletCardPayload,
  config: GoogleWalletConfig
): Promise<void> {
  const object = buildGoogleObject(payload, config)
  const existing = await walletRequest(token, `/genericObject/${object.id}`, { method: 'GET' })

  if (existing.status === 404) {
    const created = await walletRequest(token, '/genericObject', { method: 'POST', body: object })
    if (!created.ok && created.status !== 409) {
      throw new Error(`google wallet object create failed (${created.status})`)
    }
    return
  }

  if (!existing.ok) {
    throw new Error(`google wallet object read failed (${existing.status})`)
  }

  const updated = await walletRequest(token, `/genericObject/${object.id}`, {
    method: 'PATCH',
    body: object,
  })
  if (!updated.ok) {
    throw new Error(`google wallet object update failed (${updated.status})`)
  }
}

/**
 * The save token: a reference to the object that already exists, and nothing
 * else. `origins` scopes the link to the site that issued it.
 */
export function buildSaveJwt(
  payload: WalletCardPayload,
  config: GoogleWalletConfig
): string {
  return signRs256(
    {
      iss: config.serviceAccountEmail,
      aud: 'google',
      typ: 'savetowallet',
      iat: Math.floor(Date.now() / 1000),
      origins: [GOOGLE_WALLET_ORIGIN],
      payload: { genericObjects: [{ id: googleObjectId(payload, config) }] },
    },
    config.serviceAccountKey
  )
}

export function saveUrlFromJwt(jwt: string): string {
  return `${SAVE_LINK_BASE}${jwt}`
}

/**
 * Ensures the class and object exist, then returns the link that saves the
 * pass. Throws rather than returning a link that would fail on Google's side.
 */
export async function createGoogleSaveUrl(
  payload: WalletCardPayload,
  config: GoogleWalletConfig
): Promise<string> {
  const token = await getAccessToken(config)
  await ensureClass(token, config)
  await upsertObject(token, payload, config)
  return saveUrlFromJwt(buildSaveJwt(payload, config))
}
