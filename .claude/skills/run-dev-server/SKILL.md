---
name: run-dev-server
description: Launch and drive the Packscan web app locally — dev server, seeded logins, and a scan-flow smoke test. Use when asked to run, preview, or verify the app in a browser.
---

# Run the Packscan dev server

Verified cold-start from a fresh session (2026-07-20). The database is
remote (Supabase eu-west-1, session pooler) — there is nothing local to
start besides Next.js, and `docker-compose.yml` is NOT needed for a dev
run.

## 1. Environment

`.env` is untracked. Git worktrees (e.g. under `.claude/worktrees/`)
therefore don't have it, and the app starts but every request fails with
`MissingSecret`. Copy it in first:

```bash
cp /Users/johan/Packscan/.env <worktree>/.env
```

## 2. Launch

Use the Claude Code Browser pane with `.claude/launch.json` (never run
the dev server via Bash):

- `packscan-dev` — port 3000, the default choice.
- `packscan-dev-alt` — hardcodes port 3100 and collides when another
  session already uses it. Check `lsof -nP -iTCP:3000 -sTCP:LISTEN`
  first and pick the free one.
- `packscan-dev-phone` — HTTPS on 3200 for phone testing (needs the LAN
  certs in `certificates/`).

`/` redirects to `/login` until signed in.

## 3. Sign in (seeded dev accounts, from `prisma/seed.ts`)

All seeded users have app locale **Swedish** — handy for i18n checks,
so expect a Swedish UI. If the logins don't exist, run
`npx prisma db seed`.

| tab | email | credential | role |
|---|---|---|---|
| PIN (default) | clerk@packscan.local | 123456 | CLERK |
| Lösenord | admin@packscan.local | admin-dev-password | ADMIN |
| Lösenord | manager@packscan.local | manager-dev-password | ADMIN (own store) |

The PIN tab is preselected. If using the password accounts, click
"Lösenord" and confirm the tab visibly switched before filling —
otherwise the password lands in the 6-char PIN field and the submit
silently fails HTML validation.

## 4. Drive it (smoke test)

On `/scan`, type a tracking number into "Ange spårningsnummer manuellt"
and click "Använd":

- A nonsense number (e.g. `LOCALDROP2026X`) matches no carrier rule →
  the confirm card appears with the carrier select on the localized
  UNKNOWN entry ("Okänd / annan" in Swedish). This exercises detection,
  the confirm flow, and i18n in one step.
- Real-format numbers exercise carrier detection: `RR900000019SE`
  (PostNord S10), `JVGL12345678901` (DHL).

The dev DB is shared and persistent: "Släng" discards without writing;
"Bekräfta skanning" registers a real package — use obviously fake
numbers and cancel test packages afterwards from their detail page.

## Gotchas

- Browser-pane automation (observed 2026-07-20): ref-based `computer`
  clicks from `read_page` can resolve to viewport coordinates while the
  pane renders at screenshot scale — clicks miss silently (no request,
  no console error) while `form_input` still works. If clicks have no
  effect, take a screenshot and click by screenshot-space coordinates.
- Port 3000/3100 collisions across parallel Claude sessions are common;
  always check before launching.
