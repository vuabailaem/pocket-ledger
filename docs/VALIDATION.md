# Validation performed

Environment: Linux, Node.js 24.19.0. This describes evidence from this task, not production certification.

Passed:
- Installed locked dependencies for both API and mobile.
- Generated Prisma Client 6.19.0 from the PostgreSQL schema.
- Compiled the NestJS API using TypeScript with decorator metadata.
- Type-checked the Expo client in strict mode. Vietnamese dictionary is typed against all English keys.
- Exported the iOS production JavaScript/Hermes bundle with Expo SDK 55 / Metro (605 modules, approximately 1.8 MB).
- 9 domain tests: report totals, transfer exclusion, CSV BOM/quoted fields, stable import keys, duplicate reference rejection, amount precision, calendar dates, SePay direction normalization, source-field injection rejection, and imported-transfer classification (some tests cover several assertions).

Not performed:
- PostgreSQL-backed integration tests or Docker image startup. Docker/PostgreSQL are not installed here; Prisma migration engine execution was blocked by the execution environment. The initial SQL migration is included for deployment.
- Native Xcode build, Apple signing, TestFlight upload or installation on a physical iPhone.
- Interactive device UI verification or real SePay/bank events.
- Remote hosting: no server, domain, credentials or Apple account was supplied.

The app's demo is useful for initial evaluation, but the API/DB and real-device flows must pass the following checks on the target environment before use with real financial data.

## Acceptance checks on your environment

1. Run Docker Compose and require `/health` to return `{"status":"ok"}`.
2. An unauthenticated `/api/snapshot?month=2026-09` must return 401.
3. Connect the phone using your private URL/token; verify that a new server is empty (no demo records).
4. Create two accounts, add an income and expense, then transfer between the two accounts. Verify the total balance is unchanged by the transfer and monthly income/expenses exclude it.
5. Restart containers and verify data persists.
6. Import the sample CSV twice. The first run imports 3 records; the second imports 0 and skips 3. Test an invalid row and confirm no partial insertion.
7. Send the same authenticated SePay event twice. Confirm exactly one new record. A wrong key or unknown bank number must not create a transaction.
8. Switch to Vietnamese, fully close/reopen the app and confirm the choice persists.
9. Disconnect: real data must be replaced by the explicitly labelled local demo. Reconnect: the real server data must return.
10. Confirm manual transaction editing/deletion, read-only bank amounts, budget progress, month navigation, file picker and JSON share sheet on the physical iPhone.
