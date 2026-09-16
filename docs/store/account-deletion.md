# Account deletion — store description (draft)

**Status:** draft for App Store Connect review notes and the Google Play "Data deletion"
section. Not submitted. Matches `app/account-deletion/page.tsx` and `lib/account/delete.ts`.
Requires migration `20260916120000_account_deletion.sql` in production.

## Where

- **In the app (iOS, Android, web, installed PWA):** Settings → Profile & Account → Delete account.
  Type `DELETE` and confirm. No purchase, plan or credit is needed to reach it.
- **On the web:** `https://<canonical origin>/account-deletion` — how to delete, what to do if you
  cannot sign in, what is removed and what may be kept. **OWNER REVIEW:** canonical origin.

## Short text (Play Console)

> Open ABC, go to Settings → Profile & Account → Delete account, type DELETE and confirm. Your
> account is deleted and you are signed out. If you cannot sign in, reset your password or email
> support@abccard.io from the address on the account.

## What is deleted

Profile and public card (links, events, showcase, uploaded images); contacts, meeting history,
notes, follow-ups, activities and opportunities; scan sessions and CRM sync records; Gmail,
HubSpot, Salesforce and Pipedrive connections stored by ABC; pending native connection attempts;
the sign-in account.

## What may be kept

A record that the account was deleted, with a summary of its Smart Scan credits, purchases and
ABC Pro billing and the Stripe customer reference — no name, email, card or contacts — so
payments can still be accounted for. Payment records held by Stripe. **OWNER REVIEW:** how long
this record is kept has not been decided; do not state a period until it is.

## Conditions

- An ABC Pro subscription that still renews must be cancelled first (Plan & Billing → Manage
  subscription, on the web). ABC does not cancel subscriptions on the owner's behalf.
- Unused Smart Scan credits and remaining Pro time end with the account; nothing is refunded
  automatically.
- Data already outside ABC stays there: emails sent through Gmail, records pushed to a CRM,
  exported files, Wallet passes. Other ABC users keep their own record of having met the person.
