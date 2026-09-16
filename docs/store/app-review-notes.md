# App Review notes — draft (App Store and Google Play)

**Status:** draft, not submitted. Replace every `<…>` and resolve each **OWNER REVIEW** first.

## Notes to reviewer

> ABC Card is a digital business card and meeting follow-up tool for trade shows. Users publish a
> card, share it by QR code, scan other people's paper cards and badges with the camera, record
> where they met and what was discussed, and follow up by email or by pushing the contact to their
> own CRM.
>
> **Demo account:** `<email>` / `<password>` — **OWNER REVIEW:** create a reviewer account with a
> published card and sample contacts. ABC Pro features need Pro access on that account.
>
> **Sign-in:** email and password, Sign in with Apple, or Google. Google and Apple sign-in open in
> the system browser and return to the app.
>
> **Native features:** camera scanning of business cards, badges and QR codes; share sheet for the
> card link, vCard and QR image; saving the QR image to Photos; file handoff for CSV export and
> Apple Wallet pass; system-browser sign-in and CRM/Gmail connection with return to the app; the
> Android Back button closes the full-screen card, QR code or camera before going back a page; an
> offline page when the network is unavailable.
>
> **Purchases:** the app does not sell anything and does not link to external purchasing. Smart
> Scan credits and ABC Pro bought on the web are recognised on the same account.
> **OWNER REVIEW:** In-App Purchase / Play Billing decision; guideline 3.1.3(b) reader/multiplatform
> position.
>
> **Account deletion:** Settings → Profile & Account → Delete account. A public explanation is at
> `https://<canonical origin>/account-deletion`.
>
> **Permissions:** Camera (scanning). Photos add-only (saving the QR image). No location, contacts,
> microphone or tracking.
>
> **Optional connections:** Gmail (send-only, separate consent), HubSpot, Salesforce, Pipedrive —
> each sends only what the user explicitly sends or pushes, and each can be disconnected in
> Settings → Integrations.

## Known review risks

- **Apple 4.2 (minimum functionality):** the app loads ABC from its web origin. The native layer
  listed above is the answer; approval is not guaranteed.
- **Apple 5.1.1(v):** in-app account deletion is present — verify on device before submission.
- **Apple 4.8:** Sign in with Apple is offered alongside Google.
- **OWNER REVIEW:** bundle / package id, final icons and screenshots, age rating, export compliance
  (HTTPS only), content rights for sample data in screenshots.
