export type SupabaseErrorLike = {
  message?: string
  code?: string
  details?: string
  hint?: string
}

export function isSupabaseError(error: unknown): error is SupabaseErrorLike {
  return (
    typeof error === 'object'
    && error !== null
    && 'message' in error
    && typeof (error as SupabaseErrorLike).message === 'string'
  )
}

/** Flatten Supabase/Postgres client errors for logs and URL reason params. */
export function formatSupabaseError(error: unknown): string {
  if (isSupabaseError(error)) {
    const parts = [
      error.message,
      error.code ? `code=${error.code}` : null,
      error.details ? `details=${error.details}` : null,
      error.hint ? `hint=${error.hint}` : null,
    ].filter(Boolean)
    return parts.join(' | ') || 'unknown_supabase_error'
  }

  if (error instanceof Error) {
    return error.message || error.name || 'unknown_error'
  }

  if (typeof error === 'string') return error

  try {
    return JSON.stringify(error)
  } catch {
    return 'unknown_error'
  }
}

export function toThrownError(error: unknown): Error {
  return new Error(formatSupabaseError(error))
}
