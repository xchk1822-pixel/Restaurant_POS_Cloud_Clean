# 2026-06-30 POS Lifecycle Read-Only Audit

Date: 2026-06-30, America/Managua.

## Scope

This pass adds a repeatable read-only production audit for POS order/table lifecycle state.

It is designed to catch the class of issues where one terminal has completed or cancelled an order but another terminal still shows a stale active state.

## Completed

- Added `client/scripts/auditPosLifecycle.mjs`.
- Added package script:

```powershell
npm run audit:pos-lifecycle -- --password <password> --hours 96
```

- Added a data-safety guard that checks the script:
  - reads `stores/{storeId}/pos_orders`
  - reads `stores/{storeId}/pos_tables`
  - checks table/order mismatch issue codes
  - does not call Firestore write APIs

## Audit Rules

- Active dine-in orders must have a table.
- A table cannot have more than one active dine-in order.
- Active order table status must match payment state.
- Busy tables cannot point to missing or terminal orders.
- Recent visible placeholder orders are reported.
- Recent completed orders without `completedAt` are reported.
- Recent completed orders without `stockDeducted` are reported using business time, not sync update time.

## Important Fix

The first audit pass used `lastModified` when deciding whether a completed order was recent.

That was too broad because old orders can be touched by later sync or cleanup work. A May order touched in late June looked like a recent completed order and was incorrectly flagged for missing `stockDeducted`.

The script now separates:

- `businessTime`: `completedAt` or `createdAt` for completed orders, `cancelledAt` or `createdAt` for cancelled orders.
- `activityTime`: latest operational timestamp including `lastModified`.

Stock-deduction checks use `businessTime`.

## Production Result

Command:

```powershell
cd C:\Users\鍗庝负\Desktop\Restaurant_POS_Cloud_Clean\client
npm run audit:pos-lifecycle -- --password admin123 --hours 96
```

Result:

```text
issueCount: 0
criticalCount: 0
highCount: 0
mediumCount: 0
Bluefields: 1299 orders, 13 tables, 3 active orders, 0 issues
Managua: 0 orders, 0 tables, 0 active orders, 0 issues
```

Clean JSON output:

```text
docs/pos-lifecycle-audit-latest.json
```

## Verification

Tests:

```powershell
cd C:\Users\鍗庝负\Desktop\Restaurant_POS_Cloud_Clean\client
npm test -- --watchAll=false --runTestsByPath src/utils/dataSafety.test.ts src/utils/posLifecycle.test.ts
```

Result:

```text
PASS src/utils/posLifecycle.test.ts
PASS src/utils/dataSafety.test.ts
Tests: 197 passed, 197 total
```

Build:

```powershell
npm run build
```

Result:

```text
Compiled successfully.
main.a0adf546.js
```

Deployment:

```powershell
firebase deploy --only hosting
```

Result:

```text
Deploy complete.
Hosting URL: https://restaurant-pos-1b420.web.app
```

Live checks:

```text
STATUS=200
BUNDLE=static/js/main.a0adf546.js
```

POS smoke:

```powershell
npm run verify:pos-smoke -- --password 123456
```

Result:

```text
url: https://restaurant-pos-1b420.web.app/pos
hasMesas: true
hasPedidos: true
errorCount: 0
bundle: /static/js/main.a0adf546.js
```

## Remaining

The next POS lifecycle task is a controlled E2E order-flow test against staging or emulator:

- create dine-in order
- add item
- pay
- complete and deduct stock
- clear table
- cancel whole order
- cancel item
- repeat for Barra and Delivery

Do not create production test orders without an explicit cleanup plan.
