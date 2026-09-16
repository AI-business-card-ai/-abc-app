# Google OAuth verification — `gmail.send` demo script (draft)

**Status:** draft for the owner-recorded verification video and the scope justification.
Not submitted. Requires the production OAuth client, a verified domain, and a test account —
all owner actions.

## Scope requested

| Scope | Sensitivity | Why |
| --- | --- | --- |
| `https://www.googleapis.com/auth/gmail.send` | Sensitive | Send a follow-up email the user has written or approved, from their own mailbox, to a person they met |
| `openid`, `email` | Non-sensitive | Show which mailbox was connected |

Sign in with Google is a separate client flow with identity scopes only and is not part of this
request.

## Scope justification (text)

> ABC Card helps people follow up with contacts they meet at events. When a user chooses to send a
> follow-up email from ABC, the gmail.send scope sends that single message from the user's own
> Gmail account. ABC never sends without the user pressing Send, does not read, list, modify or
> delete any email, and does not access Google Contacts. The connection is optional and separate
> from signing in.

## Demo video — shot list

1. Show the browser address bar on the production origin.
2. Sign in to ABC with email (or Google). Point out that sign-in does not request Gmail access.
3. Open Messages → a contact's conversation. Press **Connect Gmail to send from here**.
4. The Google consent screen appears: show the app name, the verified domain, and the single
   `gmail.send` permission. Choose the mailbox and allow.
5. Back in ABC, the mailbox is shown as connected.
6. Review the drafted email, edit it, press **Send**, confirm.
7. Open the Gmail account's **Sent** folder: the message is there, sent by the user.
8. Show that ABC has no inbox view and requests nothing else.
9. Show revoking access at `myaccount.google.com/permissions`, then that ABC asks to reconnect on
   the next send.
10. Show Privacy §5 and the privacy policy link on the consent screen.

## Facts for reviewers (from code)

- Only Gmail API call: `POST https://gmail.googleapis.com/gmail/v1/users/me/messages/send`
  (`lib/gmail.ts`).
- Tokens are stored server-side and never returned to the browser
  (`20260824130000_profile_credential_containment.sql`); refresh happens on the server
  (`lib/google-gmail-auth.ts`).
- The connecting ABC account is bound by a signed, single-use state and the live session
  (`app/api/auth/google-gmail/*`); the native apps use the claim-back flow in
  `lib/connectors/native.ts`.
- **OWNER REVIEW:** there is no in-app "Disconnect Gmail" control. Revocation is through the Google
  account today; decide whether reviewers need an in-app control before submission.
- **OWNER REVIEW:** Limited Use disclosure wording on the privacy policy, if Google asks for it.
