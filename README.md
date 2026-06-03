# ABC — AI Business Card

> Scan. Know. Connect.

Naskenuj vizitku → Claude (Vision) z ní vytáhne kontakt, spočítá **match score**
a vygeneruje personalizované outreach zprávy (LinkedIn / Email / WhatsApp).
Vše s lidským schválením (3+1 pravidlo: nikdy auto-send bez tvého souhlasu).

## Tech stack

- **Next.js 14** (App Router) + **TypeScript** (strict)
- **Tailwind CSS** (dark-only, mobile-first `max-w-[430px]`)
- **Supabase** (auth + Postgres)
- **Claude** `claude-sonnet-4-5` (Vision + Text)
- **Framer Motion**, **@tabler/icons-react**

## Setup

1. Nainstaluj závislosti:

```bash
npm install
```

2. Zkopíruj `.env.local.example` → `.env.local` a vyplň hodnoty:

```bash
cp .env.local.example .env.local
```

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
ANTHROPIC_API_KEY=...
```

3. Vytvoř databázové schéma — spusť `supabase/schema.sql` v Supabase SQL editoru.
   (Vytvoří tabulky `abc_profiles`, `scanned_contacts`, `followup_sequences`,
   RLS politiky a trigger na auto-vytvoření profilu po registraci.)

4. Spusť dev server:

```bash
npm run dev
```

Otevři <http://localhost:3000>.

## Struktura

```
app/
  (auth)/login, (auth)/register   – přihlášení / registrace
  scan/                           – skenování vizitky
  contact/[id]/                   – výsledek analýzy + zprávy
  contacts/                       – kartotéka (Apple Wallet stack)
  chat/, chat/[id]/               – konverzace + plánované follow-upy
  settings/                       – profil + komunikační styl
  api/card/scan|send|followup/    – API routes
lib/
  types.ts, supabase.ts, claude.ts
components/ui/
  BottomNav, LoadingMatrix, MatchScore, GlowButton, CardStack
middleware.ts                     – ochrana privátních route
supabase/schema.sql               – DB schéma + RLS
```

## Skripty

| příkaz | popis |
| --- | --- |
| `npm run dev` | dev server |
| `npm run build` | produkční build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
