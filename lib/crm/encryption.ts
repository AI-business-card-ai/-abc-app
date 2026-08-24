import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'crypto'

/**
 * Encryption for CRM OAuth tokens.
 *
 * These tokens let anyone holding them read and write a customer's entire CRM,
 * so they are treated as secrets rather than as data: encrypted before they
 * reach the database, decrypted only inside a server route that is about to
 * call the provider, and never returned to a browser in any form.
 *
 * AES-256-GCM, from Node's own crypto — authenticated encryption, so a
 * ciphertext altered in the database fails to decrypt instead of yielding a
 * corrupted token. No new dependency: a cryptography library is a poor thing to
 * add for a primitive the platform already ships.
 *
 * The stored form is versioned so a future key rotation or format change can
 * tell old records from new ones without guessing.
 */

/** Format: v1:<iv b64>:<auth tag b64>:<ciphertext b64> */
const VERSION = 'v1'
const ALGORITHM = 'aes-256-gcm'
const KEY_BYTES = 32
const IV_BYTES = 12

/** The exact string an operator must set. 32 bytes, base64 — 44 characters. */
export const KEY_ENV = 'CRM_TOKEN_ENCRYPTION_KEY'

let cachedKey: Buffer | null = null

/**
 * The encryption key, or a clear failure.
 *
 * Deliberately not derived from the Supabase key or the HubSpot client secret:
 * a key that doubles as another credential cannot be rotated without breaking
 * the other thing, and rotating a leaked key is the whole point of having one.
 *
 * Throws rather than falling back. There is no safe default here — storing
 * tokens unencrypted because configuration is missing would defeat the file.
 */
function getKey(): Buffer {
  if (cachedKey) return cachedKey

  const raw = process.env[KEY_ENV]
  if (!raw) {
    throw new Error(`${KEY_ENV} is not configured`)
  }

  let key: Buffer
  try {
    key = Buffer.from(raw.trim(), 'base64')
  } catch {
    throw new Error(`${KEY_ENV} is not valid base64`)
  }

  if (key.length !== KEY_BYTES) {
    // Length only — the value itself must never reach a log or an error string.
    throw new Error(`${KEY_ENV} must decode to ${KEY_BYTES} bytes, got ${key.length}`)
  }

  cachedKey = key
  return key
}

/** Whether tokens can be stored at all, for a configuration check that must not throw. */
export function isTokenEncryptionConfigured(): boolean {
  try {
    getKey()
    return true
  } catch {
    return false
  }
}

/**
 * A token, encrypted.
 *
 * A fresh random IV every time, so encrypting the same token twice produces
 * different ciphertext and the database cannot be used to tell which two
 * accounts share a credential.
 */
export function encryptToken(plaintext: string): string {
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGORITHM, getKey(), iv)

  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()

  return [VERSION, iv.toString('base64'), tag.toString('base64'), encrypted.toString('base64')].join(':')
}

/**
 * A token, decrypted, or null.
 *
 * Returns null rather than throwing for anything malformed, truncated, from an
 * unknown version, or tampered with — callers treat "no usable token" as
 * needing a reconnect, which is the honest outcome either way. The provider's
 * error is never surfaced and neither is the value.
 */
export function decryptToken(stored: string | null | undefined): string | null {
  const value = (stored || '').trim()
  if (!value) return null

  const parts = value.split(':')
  if (parts.length !== 4) return null

  const [version, ivB64, tagB64, dataB64] = parts
  if (version !== VERSION) return null

  try {
    const iv = Buffer.from(ivB64, 'base64')
    const tag = Buffer.from(tagB64, 'base64')
    const data = Buffer.from(dataB64, 'base64')

    if (iv.length !== IV_BYTES || tag.length !== 16 || data.length === 0) return null

    const decipher = createDecipheriv(ALGORITHM, getKey(), iv)
    decipher.setAuthTag(tag)

    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
  } catch {
    // Wrong key, wrong tag, altered ciphertext. All the same answer.
    return null
  }
}

/** Constant-time comparison, for OAuth state and anything else attacker-supplied. */
export function safeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}
