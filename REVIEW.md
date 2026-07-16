# Code review guide

A 30-minute orientation for an external reviewer. For the full feature list
and setup, see [README.md](README.md).

## What this is

Packscan is a parcel pickup/drop-off system for stores acting as agents for
**DHL, PostNord, PostNL, FedEx, and DB Schenker** — one device, one app, all
carriers. The store scans a parcel in, verifies the customer at handover per
the carrier's rules, and reports the events back to the carrier. Built
Next.js 15 (App Router, Server Actions) · TypeScript · Prisma 6 + Postgres ·
Auth.js v5 · Tailwind 4.

## Run it (your own DB — never ours)

```bash
cp .env.example .env          # set your own DATABASE_URL + AUTH_SECRET
npm install
npx prisma migrate deploy
npx prisma db seed            # prints demo admin/manager/clerk logins
npm run dev
```

The seeded passwords are dev-only placeholders, safe to see. Camera scanning
needs a secure context: `localhost` is fine; for a phone use
`next dev --experimental-https`.

## What the code guarantees (run these first)

```bash
npm run test:detect   # pure logic: detection, policies, HMAC, rate limiter (offline)
npm run test:scan     # full scan/handover/returns/outbox against a DB
npm run test:users    # role & lifecycle rules against a DB
npm run bench         # response-time baseline
```

111 assertions across the three suites. CI (`.github/workflows/ci.yml`) runs
typecheck + lint + all suites on every push.

## Where the logic lives (read in this order)

| Concern | File |
|---|---|
| **State machine** — the whole parcel lifecycle | `src/lib/status.ts` |
| **Scan engine** — one entry point for every scan; create vs. advance, P2002 race, carrier events | `src/lib/packages.ts` |
| **Handover gate** — carrier-policy verification, override, code validation | `src/lib/verification.ts` + `packages.ts#advanceStatus` |
| **Carrier seam** — the interface each carrier implements | `src/lib/carriers/types.ts` (+ `rules/*.ts`) |
| **At-least-once carrier events** — transactional outbox | `src/lib/carrier-events.ts` |
| **Inbound webhook engine** + HMAC | `src/lib/carrier-ingest.ts`, `src/lib/webhook-security.ts` |
| **Auth** — JWT, PIN vs password, idle timeout, re-check | `src/auth.ts`, `src/lib/auth-config.ts`, `src/lib/session.ts` |
| **Chain-scale reporting** (SQL aggregates) | `src/lib/reports.ts` |
| **Server Actions** (the mutation API) | `src/actions/*.ts` |
| **Schema** | `prisma/schema.prisma` |

## Design decisions worth knowing (so you don't flag them)

- **Server Actions, not a REST API, for the app itself.** Mutations are
  type-safe RPC; `storeId`/role always come from the session, never the
  client. HTTP routes exist only for machine-to-machine (carrier webhook,
  settlement CSV) and NextAuth.
- **Carrier APIs are stubs behind one interface** (`CarrierProvider`). Every
  method returns `NOT_CONFIGURED` until credentials exist. Implementing a
  carrier = one `rules/*.ts` file. This is intentional, not unfinished.
- **Store-only by design.** Customers authenticate in the *carrier's* own
  app; we capture/validate the code, never issue our own. ID documents are
  classified then **discarded** — only the verification fact is stored (GDPR).
- **Append-only audit** (`ScanEvent`) with `Restrict` FKs; parcels/history
  survive contact-data erasure.

## Known limitations (already on the roadmap — not review findings)

- **2FA** for admin/manager not built yet (planned before first chain deal).
- **Deployment**: runs against a laptop today; production needs a long-lived
  process co-located with the DB, Redis for the rate limiter (fallback is
  in-memory), and cron for `dispatch:events` + `purge:pii`.
- Store **logos** are DB-stored data URLs (fine now; move to blob/CDN at scale).
- Free-text search uses `contains` (add pg_trgm indexes at millions of rows).

## How to report findings

Open **GitHub Issues** (one per finding) or a **PR with inline comments** —
keeps the review trackable. Flag anything under `src/lib/` and `src/actions/`
first; that's where correctness and security live. The UI (`src/components`,
`src/app`) is lower-risk.
