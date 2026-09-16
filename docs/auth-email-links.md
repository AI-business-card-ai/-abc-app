# Auth email links — token hash verification

**Status:** code shipped on `berlin-auth-link-hardening`. **The live email flow is not
switched over and has not been tested end to end:** that needs the Supabase dashboard
changes below, which are an owner action.

## The problem

Sign-up confirmation and password recovery emails currently carry a PKCE code. A PKCE
code can only be exchanged by the browser that asked for the email, because only that
browser holds the code verifier. A link opened anywhere else — another browser, a mail
app's in-app browser, another device, the installed iPhone PWA (whose cookies are
separate from Safari's), the store apps — fails with `oauth_exchange_failed`.

Sign-up had a second problem: no `emailRedirectTo`, so the confirmation link returned to
the site root, where nothing exchanges a code. The register page now sends it through
`/auth/callback`, which fixes the same-browser case while the old template is in use.

## The fix in code

`GET /auth/confirm?token_hash=…&type=…&next=…` (`app/auth/confirm/route.ts`,
`lib/auth/email-link.ts`):

- `type` must be one of `email`, `signup`, `recovery`, `invite`, `magiclink`,
  `email_change`; anything else is refused.
- `token_hash` is shape-checked, then verified server-side with Supabase's
  `verifyOtp({ type, token_hash })`, which needs no verifier and works in any browser.
- The session is written as cookies onto the redirect for whoever opened the link.
- `next` is accepted only as a path on this site; `//host`, `/\host`, absolute URLs and
  control characters are ignored. **Recovery always lands on `/reset-password`**,
  whatever `next` says. `email_change` defaults to `/settings/profile`. Everything else
  is a sign-in and goes through the same destination logic as every other sign-in
  (profile row, onboarding for unfinished accounts, default `/dashboard`).
- Every failure redirects to `/login?error=auth&reason=email_link_invalid` (or
  `oauth_unexpected`). The token hash is never logged, never put into a redirect, and
  the response is `no-store` with `Referrer-Policy: no-referrer`.

`/auth/callback` is unchanged and keeps serving Google and Apple sign-in and any email
sent before the templates change.

## OWNER ACTION — Supabase dashboard

Supabase → Authentication → **URL Configuration**

- **Site URL** must be the canonical production origin (still to be confirmed; the
  working assumption is `https://www.abccard.io`). The templates below build links from
  it.
- No new redirect allowlist entry is needed for `/auth/confirm` (the templates use the
  Site URL directly). Keep `/auth/callback` allowlisted for OAuth.

Supabase → Authentication → **Email Templates** — replace the link in each template:

| Template | Link |
| --- | --- |
| Confirm signup | `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/dashboard` |
| Reset password | `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery` |
| Magic link (if enabled) | `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/dashboard` |
| Invite user (if used) | `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next=/onboarding` |
| Change email address | `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email_change&next=/settings/profile` |

In each template, replace `{{ .ConfirmationURL }}` in both the `href` and any visible
link text. Leave the rest of the template as it is.

## Test after the change (owner-assisted, real mail)

1. Sign up with a new address on a laptop browser; open the confirmation email on a
   phone. Expect: signed in on the phone, sent to onboarding.
2. Request a password reset in the installed iPhone PWA; open the email in Safari.
   Expect: `/reset-password` in Safari; set a password; sign in with it in the PWA.
3. Request a reset on Android Chrome; open the link from the Gmail app. Same result.
4. Open a used or expired reset link. Expect: `/login` saying the link is invalid or
   expired.
5. Edit `next=` in a confirmation link to `https://example.com` or `//example.com`.
   Expect: it is ignored and the normal destination is used.

## Native apps

Email links open in the system browser today, so a reset or confirmation completes
there; the person then signs in to the app. When iOS universal links and Android App
Links are verified (AASA / `assetlinks.json`, owner queue), add `/auth/confirm` to the
associated paths: the app already opens verified ABC links in its WebView
(`lib/native/deep-link.ts`), and the same route will then write the session into the
app itself.
