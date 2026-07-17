# Packscan API v1

The HTTP seam for device apps (and any future integration). It mirrors the
web app's server actions one-to-one: the same `src/lib/` domain functions run
behind both, so business rules can never drift between web and app.

Base path: `/api/v1` · All bodies and responses are JSON.

## Authentication

`POST /api/v1/auth/login` with either credential form:

```json
{ "email": "clerk@store.example", "password": "…" }
{ "email": "clerk@store.example", "pin": "123456" }
```

Response:

```json
{
  "ok": true,
  "token": "<JWT>",
  "expiresAt": "2026-07-18T10:00:00.000Z",
  "user": { "id": "…", "name": "…", "role": "CLERK", "storeId": "…", "locale": "SV", "authMethod": "PIN" },
  "store": { "id": "…", "name": "Demo Store", "code": "DEMO-01", "brandColor": "#e3000f" }
}
```

Send the token on every other call: `Authorization: Bearer <token>`.

Notes:

- The login shares `verifyCredentials` with the web form: same rate limits
  (10/email, 30/IP per 15 min), same active-account check, one generic
  `INVALID_CREDENTIALS` — the API never reveals which part failed.
- **PIN tokens scan; passwords manage.** A PIN-issued token acts as CLERK on
  every mutation regardless of the account's role, exactly like the web.
  Manager overrides therefore always require a password login.
- Tokens live 12 h (`API_TOKEN_TTL_HOURS` to change, `API_JWT_SECRET` to use
  a dedicated signing secret; falls back to `AUTH_SECRET`). Role, store, and
  the active flag are read fresh from the DB on **every** request, so
  deactivating an account revokes API access immediately. The app should add
  its own idle lock (PIN re-entry) for shared handhelds, mirroring the web's
  idle timeout.

## Error shape

Non-2xx responses (and domain failures) return:

```json
{ "ok": false, "error": { "code": "UNAUTHENTICATED", "message": "…" } }
```

Domain outcomes from the scan pipeline instead use the same result objects
the web client gets (`ok`, `code`, `error`, …) — see below.

## Endpoints

| Method & path | Purpose |
| --- | --- |
| `POST /auth/login` | Credentials → bearer token + user + store branding |
| `GET /me` | Validate a stored token; fresh user + store (incl. `logoData`, `pickupDeadlineDays`) |
| `POST /scans` | Register a scan — the app's Scan-screen submit |
| `GET /pre-advice?tracking=…` | Pre-advice match for a just-scanned label (pre-fill intake) |
| `GET /packages?status=&direction=&q=&overdue=1&page=` | Store-scoped package list (50/page) |
| `GET /packages/:id` | Full detail: parcel, scan history + verifications, notifications |
| `POST /packages/:id/pickup` | Complete pickup with handover verification |
| `POST /packages/:id/actions` | `{ "action": "advance" \| "mark-return" \| "cancel", … }` |
| `GET /packages/:id/carrier-status` | Live carrier tracking lookup (lost parcels) |
| `GET /expected` | Announced pre-advice + received today |

### The scan → verification flow

`POST /scans` takes the web's `ScanInput`:

```json
{
  "trackingNumber": "RR900000019SE",
  "flow": "INBOUND_PICKUP",            // INBOUND_LOG | INBOUND_PICKUP | OUTBOUND_HANDOFF
  "carrier": "POSTNORD",               // from the app's detect UI; UNKNOWN allowed
  "carrierManual": false,
  "inputMethod": "CAMERA",             // CAMERA | HARDWARE_SCANNER | MANUAL_ENTRY
  "customerName": "Anna Svensson",     // optional intake details…
  "shelfLocation": "A2",
  "offline": { "queuedAt": 1752690000000, "queuedByUserId": "…" }  // offline replay stamp
}
```

When the scan would complete a pickup, the server answers **409** with
`code: "VERIFICATION_REQUIRED"` and a `handover` context (carrier, policy,
customer). The app shows its verification screen and either resubmits the
scan with a `verification` object, or calls `POST /packages/:id/pickup`:

```json
{ "presentedCode": "QR-FROM-CARRIER-APP", "idChecked": true, "idType": "DRIVERS_LICENSE",
  "collectorName": null, "override": false }
```

The server re-validates against the carrier's pickup policy — client-side
gating is a convenience, never the enforcement.

### Offline queue

Scans captured offline should be replayed to `POST /scans` in captured order
with the `offline` stamp; the audit event records the original capture time
and flags replays synced by a different account. Conflicts (e.g. parcel
already handled) come back as normal domain errors for the app to surface.

## Design rules (for future endpoints)

1. Store and role always come from the verified token's user — never from
   the request body.
2. Reuse the `src/lib/` service + the zod schema the equivalent server
   action uses; routes stay thin.
3. Domain failures are 4xx with machine-readable `code`s; clients translate
   codes to the user's language (the server never localizes).
4. Anything not in this file is not API — the inbound carrier webhook
   (`/api/carriers/events`, HMAC-authenticated) is a separate seam.

## Testing

`npm run test:api` runs `scripts/test-api.ts` over HTTP against a running
dev server (default `http://localhost:3100`, override with `API_BASE_URL`):
login both ways, token gate, scan → 409 verification → pickup, PIN-override
refusal, list/detail/carrier-status/cancel, and cross-store scoping.
