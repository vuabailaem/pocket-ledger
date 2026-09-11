# Pocket Ledger

A personal iOS finance app: **English by default**, Vietnamese as a secondary language, VND accounting, an Expo/React Native client and a private NestJS + PostgreSQL + Prisma backend.

## What is included

- Overview: total account balance, monthly income/expenses, category chart, recent activity.
- Transactions: create, edit, search, delete manual entries; change imported categories/notes.
- Accounts: cash/bank accounts, opening balances and atomic two-sided transfers.
- Monthly category budgets with progress, remaining amounts and editing/deletion.
- English/Vietnamese switch persisted on the device (English on first launch).
- Device-local demo, clearly labelled and separate from your real server data.
- Single-owner server token saved using Expo SecureStore (iOS Keychain).
- SePay incoming/outgoing webhooks, account-number mapping and database-level deduplication.
- CSV statement import (atomic batch, duplicate-reference protection) and JSON export.
- Docker Compose for API/PostgreSQL; optional Caddy HTTPS reverse proxy.

This is a focused implementation based on Kebo's product direction and adapted color tokens. It is **not a full fork or migration of Kebo's existing mobile application**. The NestJS backend and screens here are newly implemented for personal use. See `docs/PROVENANCE.md`.

## Try the app without a server

Use Node.js 24 and npm. Install Expo Go compatible with SDK 55 on your iPhone.

```sh
cd apps/mobile
npm ci
npm start
```

Scan the Expo QR code with your iPhone on the same network. The app opens in **Demo mode** with sample data; edits are saved locally. No API key is needed for the demo. Language: **Settings → Language → Tiếng Việt / English**.

If your Expo Go version no longer supports SDK 55, use the development/native build below instead. The exact Expo dependencies are locked in `package-lock.json`.

## Run your private backend

Install Docker Engine with Compose on your own computer or server. From the project root:

```sh
cp .env.example .env
openssl rand -hex 32
openssl rand -hex 32
openssl rand -hex 32
```

Put the three independent values into `OWNER_TOKEN`, `SEPAY_WEBHOOK_KEY`, and `POSTGRES_PASSWORD`. Use hex passwords to avoid URL-encoding issues in `DATABASE_URL`.

```sh
docker compose up -d --build
curl http://localhost:3000/health
```

The API only binds to server loopback by default. The database has no published port. For iPhone access and real bank webhooks, point your domain DNS to the server, set `DOMAIN` in `.env`, then run:

```sh
docker compose --profile https up -d --build
```

Open TCP 80/443 on that server. Caddy obtains HTTPS certificates automatically. In the app, open **Settings → Your private server**, enter `https://your-domain` and `OWNER_TOKEN`, and tap **Connect**. There is one owner, no public signup. Demo data is not imported into the server.

No server/domain or Apple developer account was supplied in this task, so no remote backend or signed iPhone build has been deployed.

## Configure SePay

1. Link your supported bank account in your own SePay dashboard.
2. In Pocket Ledger **Accounts → Add account**, enter the exact bank account number. Set an opening balance from immediately **before** the first transactions you intend to import. Starting with today's balance and also importing older transactions would count them twice.
3. In SePay create a webhook to `https://your-domain/webhooks/sepay`.
4. Choose **both incoming and outgoing** transactions; avoid payment-prefix filters that would omit personal expenses.
5. Select **API Key** authentication and use `SEPAY_WEBHOOK_KEY`. SePay sends `Authorization: Apikey <key>`.
6. Send a test event and inspect the app. A valid event is persisted before the API returns `{"success":true}`. Repeated delivery with the same SePay ID will not add another transaction.

This release uses webhooks only. It does **not** automatically fetch past transactions or poll/reconcile missed events. Use CSV imports for historical records and review SePay delivery logs for missed events. Bank-specific account eligibility, outflow coverage, historical depth and pricing must be confirmed with SePay. No live bank connection has been tested here.

For transfers between your own linked banks, classify **both imported entries as Transfer**. They remain in account balances but are excluded from income/expense reports. Do not also create a manual transfer for the same movement. Automatic matching between CSV, manual and bank records is not implemented.

Documentation: https://docs.sepay.vn/tich-hop-webhooks.html

## Import a statement

In the connected app, choose **Accounts → Import statement**, select the target account and a CSV file. Convert the bank's original export into this explicit format first:

```csv
reference,date,amount,category,note
BANK-001,2026-09-01,28000000,salary,Monthly salary
BANK-002,2026-09-02,-85000,food,"Coffee, lunch"
```

- `reference`: stable, unique transaction identifier within that account. Re-importing the same reference is skipped; changed rows are not silently overwritten.
- `date`: valid `YYYY-MM-DD`, local booking date.
- `amount`: signed whole VND (negative for outflow). Range ±2,000,000,000 VND per entry; no decimals/thousand separators. Account opening balances have the same bound.
- `category`: `food`, `transport`, `shopping`, `bills`, `health`, `entertainment`, `salary`, `other`, `transfer`.
- `note`: optional, up to 500 characters.
- Up to 2,000 rows and a 1 MB file. Any invalid row rejects the batch before insertion.
- Do not overlap CSV imports with already received bank events. Deduplication is per source/reference, not a heuristic across sources.

A sample is provided at `docs/sample-statement.csv`. Imported amounts/dates cannot be edited or deleted from the app, preserving source integrity; categories/notes can be edited.

## Build/install on iPhone

Local native build needs macOS and Xcode:

```sh
cd apps/mobile
npm ci
npx expo run:ios --device
```

For a cloud build (your Expo account and Apple provisioning required):

```sh
npx eas-cli login
npx eas-cli build:configure
npx eas-cli build --platform ios --profile preview
```

Choose a unique bundle identifier if `app.personal.pocketledger` is unavailable. The `preview` profile is internal distribution. Register the target iPhone when EAS asks. `simulator` produces an iOS simulator build; `production` is for App Store/TestFlight signing. This package does not contain a signed `.ipa`.

## Development and validation

```sh
cd apps/api
npm ci
npm run build
npm test
```

For a locally reachable PostgreSQL database, create `apps/api/.env` from its example, edit values, then:

```sh
node --env-file=.env node_modules/prisma/build/index.js migrate deploy
npm run dev
```

The dev command compiles once and starts the compiled Nest app (decorator metadata required). After changes, re-run it. For mobile checks:

```sh
cd apps/mobile
npm run typecheck
npx expo export --platform ios
```

Validation actually performed is recorded in `docs/VALIDATION.md`. A Metro iOS bundle is not equivalent to a signed native build or a device test.

## Backup and token rotation

- Settings → Export all data uses the system share sheet to share JSON. Be mindful of the destination because this contains financial data.
- For a restorable full database backup:

```sh
docker compose exec -T db pg_dump -U pocket -d pocket > pocket-backup.sql
```

- Keep backups private. Do not remove the `pocket-db` volume unless intentionally deleting all data.
- Rotate `OWNER_TOKEN` in `.env`, recreate the API container, then reconnect the phone. Bank webhook authentication uses a separate key.
- Real server snapshots are held in app memory, not persisted into demo storage. Offline real-data editing/sync is not implemented.

## Current scope

Single owner, single VND currency, fixed categories, no lending/investment engine, no AI service, no bank-login scraping. Casso, automatic bank history retrieval, statement-format auto-detection, notification alerts, account editing/deletion and import rollback are not included. Review imported transfer categories and reconcile balances with bank statements.
