# Packscan

Unified parcel scanning for stores acting as pickup/drop-off points for **DHL, PostNord, PostNL, and FedEx** — one device, one app, all carriers.

## What it does

- **Three workflows**, picked per scan: inbound customer pickup (arrive → carrier/customer notified → verified handover), plain inventory logging, and outbound carrier handoff — including drop-offs from private senders, with sender capture and a printable **drop-off receipt**.
- **Carrier-policy pickup verification**: completing a pickup is gated on what each carrier mandates at handover — pickup code and/or photo-ID check, proxy-pickup rules (`pickupPolicy` per carrier rule module). Store-only by design: customers authenticate with the **carrier's own app** — the clerk scans the QR/code off their phone screen (hardware scanner, camera, or typed) and the proof (captured code, ID type, collector) is persisted on the audit event. The parcel's own label is rejected as evidence, and a **manager override** (admin-only, mandatory reason, flagged loudly in the audit trail and listed on the admin overview) unblocks the customer the policy would strand. Cancelling requires a reason.
- **Shelf locations**: captured at intake, shown big at handover and in the packages list — the clerk knows where the box is before the customer finishes talking.
- **Returns & aging**: per-store pickup deadline (admin-set, 3-30 days) drives an overdue view on the Packages page; overdue parcels go `RETURN_PENDING → RETURNED_TO_CARRIER` with the driver/route reference recorded. Packages list has search (tracking/name/phone), status/direction/date filters, and pagination.
- **Pre-advice**: carriers' announced-parcel manifests live in `PreAdvice` (paste-import on the Expected page until API feeds exist). Scanning an announced parcel pre-fills recipient and exact carrier; the Expected page shows announced-but-missing parcels the same day.
- **ID scan-to-verify**: the handover scanner recognizes ID documents (AAMVA PDF417 driver's licenses, ICAO MRZ passports/ID cards) and flips the ID check automatically — document contents are classified and **discarded, never stored** (`classifyHandoverScan`).
- **Carrier-first event reporting with at-least-once delivery**: every lifecycle event (`ARRIVAL`, `PICKED_UP` with POD summary, `ACCEPTED_OUTBOUND`, `RETURNED`) is written to the `CarrierEventOutbox` **in the same transaction as the scan event**, attempted immediately, and retried with exponential backoff by `npm run dispatch:events` (cron it) until sent, `NOT_CONFIGURED` (re-queueable once credentials arrive), or dead-lettered after 20 attempts. The direct SMS/email stub is only the arrival/pickup fallback while carrier APIs are unconfigured.
- **Rapid intake**: a toggle on the Scan screen auto-confirms parcels straight off the scanner with a sticky batch shelf — pre-advised parcels for the pickup flow (so nothing registers without contact info), plus unambiguous labels in log-only mode; anything uncertain still gets the confirm card.
- **Offline tolerance**: scans that fail at the network level are queued in the browser (`localStorage`) and replayed automatically when the connection returns; a banner shows the pending count and any replays that need attention. Each item is stamped with the queuing user and expires after 72 h; the audit event notes when a scan was captured offline (and when a different account synced it).
- **Operations dashboard** (`/admin/operations`): today's volumes per store and carrier, shelf aging (overdue pickups + returns awaiting driver collection), and carrier-event outbox health with re-queue controls for dead-lettered and awaiting-credentials events.
- **Login rate limiting** per email (10/15 min) and per client IP (30/15 min) with a bounded in-memory map; CI (GitHub Actions) runs typecheck, lint, and all three suites against a Postgres service container.
- **PII retention**: `npm run purge:pii` (cron it) scrubs customer/sender contact data from terminal packages, their notifications, and consumed pre-advice after 90 days (`PII_RETENTION_DAYS`). Audit history survives.
- **Carrier auto-detection** from tracking-number format (UPU S10 checksums, carrier prefix rules) with confidence ranking; manual override is always one tap away. Ambiguous formats (e.g. the `3S` prefix shared by PostNL and DHL Parcel Benelux) surface all candidates.
- **Three scan inputs on one screen**: phone/tablet camera (ZXing), USB/Bluetooth keyboard-wedge scanners (burst-timing discrimination so human typing never misfires), and manual entry.
- **Handheld-first UI**: bottom tab navigation, camera-first scanning (remembered per device), 44 pt touch targets, card lists instead of tables on phones, full-width primary actions, and add-to-home-screen (PWA manifest + Apple web-app meta) for a full-screen counter app.
- **Multi-store** with ADMIN/CLERK roles. Clerks are hard-scoped to their store server-side; admins manage stores/users (deactivate/reactivate, role changes, password resets — guarded so the last active admin can't be locked out) and see a cross-store overview.
- **Session security for shared devices**: per-store inactivity logout (1–10 min, admin-configured on the Stores page), failed-login rate limiting, and a periodic account re-check so deactivating a user revokes their session within ~5 minutes.
- **Full audit trail**: every scan/status action is an append-only `ScanEvent` with actor and input method.
- Notifications and carrier tracking APIs are **stubbed behind interfaces** (`src/lib/notifications`, `CarrierProvider.lookupTrackingDetails`) — swap in Twilio/Resend/carrier credentials without restructuring.

## Stack

Next.js 15 (App Router, Server Actions) · TypeScript · Prisma 6 + Postgres · Auth.js v5 (JWT, credentials) · Tailwind 4 + shadcn/ui · ZXing.

## Setup

```bash
npm install
cp .env.example .env   # then fill in:
```

- `DATABASE_URL` — Postgres connection string.
  - Hosted (Neon/Supabase): use the **direct/session-pooler** string, not a transaction pooler, so migrations work. Note: Supabase's `db.*.supabase.co` host is IPv6-only; on IPv4-only networks use the session pooler (`aws-0-<region>.pooler.supabase.com:5432`, user `postgres.<project-ref>`).
  - Local: `docker compose up -d` starts Postgres 16 matching the example URL.
- `AUTH_SECRET` — `openssl rand -base64 32`

```bash
npx prisma migrate deploy   # apply migrations (idempotent)
npx prisma db seed          # demo store + admin/clerk logins (printed to console)
npm run dev
```

Log in with the seeded credentials from the seed output. Camera scanning requires a secure context: `localhost` works as-is; for a phone on your LAN use `next dev --experimental-https`.

## Verification scripts

```bash
npm run test:detect   # detection, pickup policies, ID-scan classification, rate limiter (offline, 33 checks)
npm run test:scan     # scan workflows, handover gating, overrides, returns, pre-advice, outbox, races (41 checks, cleans up after itself)
npm run test:users    # user lifecycle rules + lockout guards against the DB (11 checks, cleans up after itself)
```

## Architecture notes

- `src/lib/status.ts` — the status state machine; both scanning and detail-page buttons go through it.
- `src/lib/packages.ts#registerScan` — single entry point for every scan: first scan creates, rescan advances (pickup collection, handoff completion), terminal states reject.
- `src/lib/verification.ts#checkHandover` — pure gate for AWAITING_PICKUP → PICKED_UP, driven by the carrier's `pickupPolicy`; the UI checklist (`HandoverPanel`) mirrors it but the server re-validates. Captured carrier-app codes are audit evidence in v1; validating them (and pushing proof-of-delivery) goes through the `CarrierProvider` seam once API credentials exist.
- `src/lib/carriers/` — pure detection rules per carrier; `detectCarrierCandidates()` runs client-side.
- **Security boundary**: clerk-level Server Actions never accept a `storeId` from the client — it always comes from the session (`src/lib/session.ts`).
- Production build: stop the dev server first (`next build` and `next dev` share `.next`).
