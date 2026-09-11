# Validation performed

This records evidence gathered while running the project, not production certification.
Two rounds are described: a build-only round, and a round that ran the real stack.

## Round 2 — 2026-09-11, running stack

Environment: Ubuntu 24.04.4 LTS (kernel 6.8), Node.js 20.20.2, npm 10.8.2,
Docker 29.5.2, Docker Compose v5.1.4, PostgreSQL 17-alpine, Expo SDK 55
(runtime `exposdk:55.0.0`), React Native 0.83.10.

### Build and static checks

- `npm ci` for both apps against the committed lockfiles.
- `npm run build` in `apps/api`: Prisma Client 6.19.0 generated, TypeScript compiled.
- `npm test`: 9/9 domain tests pass.
- `npm run typecheck` in `apps/mobile`: clean in strict mode.
- `npx expo export --platform ios`: 610 modules, ~1.8 MB Hermes bundle.
- Node 20.20.2 is sufficient. React Native 0.83 requires `>= 20.19.4`; the earlier
  "Node.js 24" note described the previous environment, not a requirement.
- `npx expo install --fix` aligned `react-native` 0.83.4 to the 0.83.10 expected by
  the installed Expo SDK 55. Typecheck and iOS export were re-run after the change.

### Database and API — now actually executed

- `docker compose up -d --build` starts PostgreSQL 17 and the API.
- The initial migration `20260911000000_init` **applies successfully to a real
  database**. Verified twice from an empty volume (`docker compose down -v`).
- Restarting the API finds `No pending migrations to apply` (idempotent).
- `/health` returns `{"status":"ok"}` and does query the database.

### End-to-end API checks: 53/53 passed

Executed with `curl` against the running container. Covered:

- **Auth** — missing token, wrong token and a `Bearer` token on the webhook route all
  return 401; the correct token returns 200; a malformed month returns 400.
- **Empty server** — a fresh database returns no accounts/transactions; no demo data leaks in.
- **Accounts and balances** — two accounts with opening balances, one income, one expense;
  balances and monthly income/expense totals match expectations exactly.
- **Transfers** — a two-sided transfer leaves the **total balance unchanged**, moves both
  account balances correctly, and is excluded from income, expense and the category breakdown.
- **Transfer integrity** — editing a single transfer leg returns 400; deleting one leg removes
  **both** legs and restores the prior total balance.
- **Budgets** — create, upsert-by-month+category (no duplicate row, amount updated), delete.
- **CSV import** — `docs/sample-statement.csv` imports 3 rows; re-importing the same file
  imports 0 and skips 3; a file with one invalid amount returns 400 and inserts **nothing**
  (verified the valid row in that file was not persisted).
- **Imported-record integrity** — deleting an imported row returns 400, editing its amount
  returns 400, editing only category/note returns 200.
- **SePay webhook** — a valid `Apikey` event is stored; replaying the same SePay id keeps
  exactly one row; an outflow is stored as a negative amount; an unknown bank number
  returns 400 and stores nothing.
- **Validation bounds** — amounts above 2,000,000,000 and zero amounts rejected; `2026-02-30`
  rejected; unknown category rejected; a client-supplied `source` field rejected;
  a duplicate `bankNumber` returns 409; a transfer to the same account returns 400.
- **Export** — `/api/export` returns the expected record counts and `version: 1`.
- **Persistence** — after `docker compose restart`, accounts, balances, transaction count
  and the monthly summary are byte-identical to before the restart.

### Expo dev server

- `npx expo start --go --lan` serves the iOS manifest with `runtimeVersion exposdk:55.0.0`.
- Metro compiled and served the full iOS dev bundle (~5 MB) over the LAN address in ~5 s,
  confirming a phone on the same network can fetch it.
- The API was reachable over both LAN interfaces of this machine once `API_BIND=0.0.0.0`
  was set (see README, "Reach the API from your iPhone").

## Round 1 — build-only

Environment: Linux, Node.js 24.19.0. Dependency install, Prisma generate, API compile,
mobile typecheck, iOS bundle export and the 9 domain tests all passed. No database,
Docker or device was available in that environment.

## Still not verified

- **Interactive UI on a physical iPhone.** No device was attached to this machine. Every
  check above is API-level or bundler-level. Tapping through the screens, the file picker,
  the JSON share sheet, keyboard behaviour and the language switch persisting across a
  full app restart still need to be confirmed on the phone.
- **Native build, Apple signing, TestFlight.** Not attempted; no Mac or paid Apple account.
- **A real bank.** No bank chosen, no SePay account, no API key, no real webhook delivered.
  Only synthetic SePay payloads matching the documented shape were tested.
- **Remote hosting.** No server or domain; the Caddy HTTPS profile was not started, so
  certificate issuance is unverified.
- **Long-running behaviour.** No load, concurrency or backup/restore testing.

## Acceptance checks on your environment

Checks 1–7 below were executed on this machine and passed. Re-run them wherever you
deploy, and do 8–10 on the phone.

1. `/health` returns `{"status":"ok"}`. ✅ verified here
2. An unauthenticated `/api/snapshot?month=2026-09` returns 401. ✅ verified here
3. A new server is empty — no demo records. ✅ verified here
4. Two accounts, an income and an expense, then a transfer: total balance unchanged,
   monthly income/expenses exclude the transfer. ✅ verified here
5. Restart the containers and confirm data persists. ✅ verified here
6. Import the sample CSV twice: 3 imported, then 0 imported / 3 skipped; an invalid row
   causes no partial insertion. ✅ verified here
7. Send the same authenticated SePay event twice: exactly one record. A wrong key or an
   unknown bank number creates nothing. ✅ verified here
8. Switch to Vietnamese, fully close and reopen the app, confirm the choice persists. ⬜ phone
9. Disconnect: real data is replaced by the labelled local demo. Reconnect: real data
   returns. ⬜ phone
10. Confirm manual editing/deletion, read-only bank amounts, budget progress, month
    navigation, the file picker and the JSON share sheet on the phone. ⬜ phone
