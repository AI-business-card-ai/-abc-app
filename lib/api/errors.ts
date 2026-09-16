import { NextResponse } from 'next/server'

/**
 * An unexpected failure, said to the browser in one sentence of ours and
 * recorded in the server log by kind.
 *
 * Many routes used to answer `{ error: err.message }` from their catch block.
 * Whatever threw decided what the browser read: a Postgres message quoting a
 * row or a constraint, a provider's `error_description`, a configuration
 * message naming an environment variable, an SDK stack detail. None of that is
 * for the person holding the phone, and some of it is for nobody outside the
 * server.
 *
 * Expected outcomes keep their own codes and words — `pro_required`,
 * `insufficient_scan_credits`, `active_subscription`, validation messages the
 * route writes itself. This is only for the catch-all.
 *
 * The log gets the error's class name, or a short error code when the thrown
 * value is a plain object such as a PostgrestError — never its message, which
 * can quote a row, an address or a token.
 */

export const GENERIC_SERVER_ERROR = 'Something went wrong. Please try again.'

export function errorKind(err: unknown): string {
  if (err instanceof Error) {
    const code = (err as { code?: unknown }).code
    const name = err.constructor?.name || err.name || 'Error'
    return typeof code === 'string' && /^[A-Za-z0-9_.-]{1,40}$/.test(code) ? `${name} code=${code}` : name
  }
  if (err && typeof err === 'object') {
    const code = (err as { code?: unknown }).code
    return typeof code === 'string' && /^[A-Za-z0-9_.-]{1,40}$/.test(code) ? `code=${code}` : 'object'
  }
  return typeof err
}

export function serverErrorResponse(
  scope: string,
  err: unknown,
  userMessage: string = GENERIC_SERVER_ERROR,
  status = 500
): NextResponse {
  console.error(`[${scope}] failed:`, errorKind(err))
  return NextResponse.json({ error: userMessage }, { status })
}
