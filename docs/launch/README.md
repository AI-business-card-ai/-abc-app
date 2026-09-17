# ABC launch — readiness documents

**Status:** prepared 2026-09-17 from the combined release candidate. Nothing here has been
configured, deployed, applied to a remote database or submitted to a store.

| Document | Use |
| --- | --- |
| [owner-launch-runbook.md](owner-launch-runbook.md) | Every owner step, in dependency order, with where, what to enter, expected result and how to verify |
| [final-release-checklist.md](final-release-checklist.md) | Tick-box view: code complete, decisions, external configuration, QA, stores, post-launch |
| [test-matrix.md](test-matrix.md) | What to test at which level (automated, local, staging, real device, provider live) |
| [launch-contracts.md](launch-contracts.md) | Environment variables, callback URLs, canonical-origin and app-ID dependencies, provider scopes, release blockers |
| [migration-rehearsal.md](migration-rehearsal.md) | Local rehearsal of the five unapplied migrations, and the owner's pre-flight, apply and post-check SQL |

Store drafts stay in [`docs/store`](../store/README.md); native build detail in
`native-shell/README.md`; Supabase email links in `docs/auth-email-links.md`.

## Release candidate composition

Verified with `git fetch origin --prune`, `git merge-base --is-ancestor` and `git log --graph`:

| Ref | SHA |
| --- | --- |
| `origin/main` (production code) | `14751d503c870e2a4ba1c55306550f3a986a5acc` |
| `origin/berlin-final-release-cleanup` (core release candidate) | `8f9f2a15cb27fef86f7139a16aad4952f78e3f1f` |
| `origin/landing-rc-sync` | `145550a3e38cf865c924e6198f646ad01b73af46` |
| `origin/landing-cinematic-system` (**combined release candidate**) | `bd7199281aa3936352c53e0b6d4cc98b9fd3b3ed` |
| `origin/launch-owner-runbook` (release candidate + these documents) | `6bc90dd259a12c8c14d372f4120d314be780d6a4` |
| `release-final-blocker-fixes` (runbook branch + code blocker fixes B0, B1, B1a) | this branch |

- `origin/main` (`14751d5`) is the second parent of the merge `c3371ae`; from that merge the
  history is linear, with no further merges, through `8f9f2a1` → `145550a` → `bd71992`.
  `main` has no commit that the release candidate lacks.
- `landing-cinematic-system` contains `berlin-final-release-cleanup` and `landing-rc-sync`;
  no merge branch is needed.
- The two landing commits change 33 files, all landing, public-page presentation, pricing
  return pages and `components/layout/AppShell.tsx`. Privacy and Terms clause text is carried
  over verbatim.

## Reproduce the local checks

```bash
node scripts/rehearse-migrations.mjs
npm run typecheck
npm run lint
npm run build
```

The test suites are listed in [test-matrix.md](test-matrix.md#automated-suites--state-on-the-release-candidate).
