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

Use Node.js 20.19.4 or newer (tested on 20.20.2) and npm. Install Expo Go from the App Store; the project targets **Expo SDK 57**, the current release, so the store version of Expo Go supports it.

```sh
cd apps/mobile
npm ci
npm start
```

Scan the Expo QR code with your iPhone on the same network. The app opens in **Demo mode** with sample data; edits are saved locally. No API key is needed for the demo. Language: **Settings → Language → Tiếng Việt / English**.

Expo Go only runs the SDK versions it ships with, so when SDK 57 ages out you will need to upgrade the project (`npx expo install expo@^NN && npx expo install --fix`) or use the development/native build below. The exact dependency versions are locked in `package-lock.json`.

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

For a phone on your own network without a domain, see the next section instead.

No server/domain or Apple developer account was supplied in this task, so no remote backend or signed iPhone build has been deployed.

## Reach the API from your iPhone

`localhost` on the phone means the phone, not this computer, and an Expo tunnel only
exposes Metro — not the backend. So the phone needs a real address for the API.

By default Compose publishes the API on loopback only. For development on a trusted
home network, set the bind address in `.env` and recreate the container:

```sh
echo 'API_BIND=0.0.0.0' >> .env
docker compose up -d
```

Find the address of the interface your phone shares — on this machine the phone is on
Wi-Fi, so use the Wi-Fi address:

```sh
ip -4 addr show scope global | grep inet
curl http://<that-address>:3000/health
```

Start Metro on the same interface so the QR code points at an address the phone can reach:

```sh
cd apps/mobile
REACT_NATIVE_PACKAGER_HOSTNAME=<that-address> npx expo start --go --lan
```

Then in the app: **Settings → Your private server**, URL `http://<that-address>:3000`,
paste `OWNER_TOKEN`, tap **Connect**. Plain `http://` is accepted **only** in a
development build; a release build requires `https://`.

Caveats:

- This sends the owner token in clear text over your LAN. Use it on a network you trust,
  and use the `https` Caddy profile for anything beyond local development.
- Docker publishes ports through its own iptables chain, so a `ufw` rule will not block
  port 3000 once `API_BIND=0.0.0.0`. Set it back to `127.0.0.1` when you are done.
- Windows: if you run Docker inside WSL2, also allow the port through Windows Firewall,
  and prefer Docker Desktop's WSL integration so the port is published on the Windows host.
- Phone and computer must be on the same subnet. If Metro picks the wrong interface,
  `REACT_NATIVE_PACKAGER_HOSTNAME` overrides it.

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

`npm run dev` compiles with `tsc` and then runs `dist/main.js`, because NestJS needs
emitted decorator metadata. It is not a watch mode: re-run it after each change.

The dev command compiles once and starts the compiled Nest app (decorator metadata required). After changes, re-run it. For mobile checks:

```sh
cd apps/mobile
npm run typecheck
npx expo export --platform ios
```

Validation actually performed is recorded in `docs/VALIDATION.md`. A Metro iOS bundle is not equivalent to a signed native build or a device test.

## Inspect the database with a desktop client

The base `compose.yaml` publishes no database port. To point DBeaver, pgAdmin or `psql`
at it, add the opt-in override:

```sh
docker compose -f compose.yaml -f compose.db-access.yaml up -d
```

That publishes PostgreSQL on `127.0.0.1:5432` only — loopback, still unreachable from
the network. Connect with:

| Field | Value |
|---|---|
| Host | `127.0.0.1` |
| Port | `5432` |
| Database | `pocket` |
| User | `pocket` |
| Password | `POSTGRES_PASSWORD` from `.env` |

Tables are `Account`, `Transaction` and `Budget`, plus Prisma's `_prisma_migrations`.
They are quoted CamelCase identifiers, so in SQL you must write `SELECT * FROM "Account"`
— unquoted `account` will not resolve.

Without the override you can still reach the container directly on the Compose network
(`docker inspect pocket-ledger-db-1` shows its IP, e.g. `172.18.0.2:5432`), but that
address changes whenever the container is recreated, so a saved connection will break.
`docker compose exec db psql -U pocket -d pocket` always works and needs no port at all.

Treat this as read-mostly access. Writing rows by hand bypasses the API's validation and
the invariants the app depends on — signed whole VND within ±2,000,000,000, paired
`transferId` legs, and `externalId` deduplication. Take a `pg_dump` before editing anything.

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
