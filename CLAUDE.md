# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Packscan is parcel pickup/drop-off for stores acting as agents for DHL, PostNord, PostNL, FedEx, and DB Schenker. Next.js 15 (App Router, Server Actions) · TypeScript · Prisma 6 + Postgres · Auth.js v5 (JWT, credentials) · Tailwind 4 + shadcn/ui. `REVIEW.md` is the 30-minute orientation and lists the design decisions that are intentional (carrier API stubs, DB-stored logos, no REST API for the web app) — read it before flagging any of them. `docs/api-v1.md` documents the device-facing HTTP API.

## Commands

Setup: `.env` needs `DATABASE_URL` + `AUTH_SECRET` (README covers the Supabase pooler/IPv6 caveat; `docker compose up -d` starts a matching local Postgres 16). Then:

```bash
npx prisma migrate deploy && npx prisma db seed   # seed prints the demo logins
npm run dev
```

Verification (the first five are exactly what CI runs):

```bash
npx tsc --noEmit          # typecheck — also the i18n completeness check
npx eslint src scripts    # lint (CI's invocation; `npm run lint` is bare eslint)
npm run test:detect       # pure logic: detection, policies, HMAC, rate limiter — offline
npm run test:scan         # scan/handover/returns/outbox — needs DATABASE_URL, cleans up
npm run test:users        # roles, lifecycle, lockout guards — needs DATABASE_URL, cleans up
npm run test:api          # /api/v1 end to end — needs `npm run dev -- -p 3100` running (or API_BASE_URL); not in CI
```

There is no test framework: each suite is one `tsx` script in `scripts/`; the smallest runnable unit is a suite. DB-backed suites read `.env` via `tsx --env-file`.

Ops entry points (production crons): `npm run dispatch:events` (carrier-event outbox), `npm run purge:pii`, `npm run privacy lookup|erase <phone-or-email>` (GDPR).

Gotchas: `next build` and `next dev` share `.next` — stop the dev server before building. The mobile app is its own TS project: `cd mobile && npx tsc --noEmit`. For launching and driving the app locally (seeded logins, the worktree `.env` caveat), see `.claude/skills/run-dev-server/SKILL.md`.

## Architecture

Mutations are Server Actions (`src/actions/*`) — thin wrappers over domain functions in `src/lib/`. `/api/v1` re-exposes the same `src/lib/` functions for the Expo app, so business rules cannot drift between web and device. Standalone HTTP routes exist only for machine-to-machine traffic (carrier webhook, settlement CSV, NextAuth).

The domain core, in the order to read it:

- `src/lib/status.ts` — the parcel state machine; scanning and detail-page buttons both go through it.
- `src/lib/packages.ts#registerScan` — single entry point for every scan: first scan creates, rescan advances (pickup collection, handoff completion), terminal states reject.
- `src/lib/verification.ts#checkHandover` — pure gate for `AWAITING_PICKUP → PICKED_UP`, driven by the carrier's `pickupPolicy`. The UI checklist (`HandoverPanel`) mirrors it but the server re-validates.
- `src/lib/carriers/` — `CARRIER_CODES` in `types.ts` is the single source of carrier identity; adding a carrier = extend that tuple + the Prisma enum + one `rules/*.ts` provider module. Every provider network method returns `NOT_CONFIGURED` until credentials exist — intentional stubs behind one interface, not unfinished work.
- `src/lib/carrier-events.ts` — transactional outbox: carrier events are written in the same transaction as the scan event and drained at-least-once by `dispatch:events`.
- `src/lib/carrier-ingest.ts` + `src/lib/webhook-security.ts` — inbound HMAC-signed carrier webhook feeding `PreAdvice`.

Security boundaries that shape every change:

- Clerk-level Server Actions never accept a `storeId` (or role) from the client — always from the session (`src/lib/session.ts`).
- Sessions carry `authMethod`: PIN sign-ins act as CLERK and never reach administration or manager overrides, even for admin accounts; password sign-in (and all admin capability) is web-only — the device API refuses it.
- `ScanEvent` is an append-only audit trail with `Restrict` FKs. Scanned ID documents are classified then discarded — only the fact of verification is stored.

i18n: `src/lib/i18n/messages/en.ts` is the `Messages` type source — add a key there first, then translate it in all six other locales (sv, de, nl, no, da, fi); `tsc` enforces completeness. Server components call `getT()` (`src/lib/i18n/server.ts`); client components call `useT()` (`src/components/i18n/I18nProvider`). Enum labels live in top-level groups keyed by enum value (`status`, `idType`, `carrier`, …). Carrier brand names stay untranslated — only the UNKNOWN pseudo-carrier localizes, via `carrierLabel(code, t)` in `src/lib/carriers/labels.ts`. Admin dashboards are deliberately English for now (see the `en.ts` header comment).

`mobile/` is a separate Expo TypeScript project with its own dependency tree, pinned to SDK 54 — do not bump (`mobile/AGENTS.md`).

## Conventions

- Branch off `main` and open a PR; CI (`.github/workflows/ci.yml`) runs typecheck, lint, and the three suites against a Postgres service container, plus the mobile typecheck as a separate job.
- User-visible changes get a one-line Swedish entry in `CHANGELOG.md` — what changed and why; the how stays in git history.
