# Store and privacy readiness — drafts

Drafts for the owner, written from the code. **Nothing here has been submitted**, and none
of it is legal advice. **OWNER REVIEW** marks every answer that needs a decision, a legal
reading, or a fact the repository cannot supply.

| Document | Use |
| --- | --- |
| [data-inventory.md](data-inventory.md) | The facts every other document is built from: processors, data categories, Google scopes, native permissions, Privacy/Terms status |
| [apple-privacy-label.md](apple-privacy-label.md) | App Store Connect privacy nutrition label |
| [google-play-data-safety.md](google-play-data-safety.md) | Play Console Data safety form |
| [account-deletion.md](account-deletion.md) | Store account deletion description and Play deletion URL |
| [google-oauth-verification.md](google-oauth-verification.md) | `gmail.send` scope justification and demo video script |
| [app-review-notes.md](app-review-notes.md) | Reviewer notes, demo account, review risks |

Also relevant: `native-shell/README.md` (native build, signing, deep links),
`docs/auth-email-links.md` (Supabase email templates), [`docs/launch`](../launch/README.md)
(owner launch runbook, release checklist, test matrix, environment and callback contracts,
migration rehearsal).

`npm run test:final-release-cleanup` pins the card-media listing policy, the removed enrichment and
transcription providers, Gmail disconnect and Android Back.

`npm run test:privacy-readiness` fails if the code stops matching the facts these drafts rely on
(Gmail scope and send-only use, identity-only Google sign-in, native permissions, no analytics
SDK, no stored scan photos, no automatic sending, Privacy text).
