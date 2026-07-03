# Packscan

Unified parcel scanning for stores acting as pickup/drop-off points for **DHL, PostNord, PostNL, and FedEx** — one device, one app, all carriers.

## What it does

- **Three workflows**, picked per scan: inbound customer pickup (arrive → SMS/email notify → picked up), plain inventory logging, and outbound carrier handoff (pending → handed off).
- **Carrier auto-detection** from tracking-number format (UPU S10 checksums, carrier prefix rules) with confidence ranking; manual override is always one tap away. Ambiguous formats (e.g. the `3S` prefix shared by PostNL and DHL Parcel Benelux) surface all candidates.
- **Three scan inputs on one screen**: phone/tablet camera (ZXing), USB/Bluetooth keyboard-wedge scanners (burst-timing discrimination so human typing never misfires), and manual entry.
- **Multi-store** with ADMIN/CLERK roles. Clerks are hard-scoped to their store server-side; admins manage stores/users and see a cross-store overview.
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
npm run test:detect   # carrier detection rules (offline, 17 checks)
npm run test:scan     # scan workflows against the DB (13 checks, cleans up after itself)
```

## Architecture notes

- `src/lib/status.ts` — the status state machine; both scanning and detail-page buttons go through it.
- `src/lib/packages.ts#registerScan` — single entry point for every scan: first scan creates, rescan advances (pickup collection, handoff completion), terminal states reject.
- `src/lib/carriers/` — pure detection rules per carrier; `detectCarrierCandidates()` runs client-side.
- **Security boundary**: clerk-level Server Actions never accept a `storeId` from the client — it always comes from the session (`src/lib/session.ts`).
- Production build: stop the dev server first (`next build` and `next dev` share `.next`).
