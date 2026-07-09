# 2026-06-30 POS Lifecycle Merge Hardening

Date: 2026-06-30, America/Managua.

## Scope

This pass hardens POS multi-terminal lifecycle merge rules without changing the visible order workflow.

The goal is to make terminal order states testable and prevent regressions where one terminal completes or cancels an order but another terminal keeps showing an older active state.

## Completed

- Extracted POS lifecycle merge/status rules from `POS.tsx` into `client/src/utils/posLifecycle.ts`.
- Added focused regression tests in `client/src/utils/posLifecycle.test.ts`.
- Updated existing data-safety guards to check the new utility location instead of requiring the rules to stay inside the large POS component.
- Added a repeatable no-mutation POS smoke script:
  - `client/scripts/verifyPosSmoke.mjs`
  - `npm run verify:pos-smoke -- --password <password>`
- Added a read-only production lifecycle audit script:
  - `client/scripts/auditPosLifecycle.mjs`
  - `npm run audit:pos-lifecycle -- --password <password> --hours 96`
  - The script reads store-scoped `pos_orders` and `pos_tables`; it does not call Firestore write APIs.

## Protected Rules

- A cloud `completed` order overrides a stale local `served/paid` order even if the stale local copy has a newer timestamp.
- A cloud `cancelled` order overrides a stale local `confirmed` order.
- A local completed order cannot be regressed by an older unpaid cloud snapshot.
- A pending local terminal order is not replaced until cloud echoes the same terminal state.
- Table status follows order lifecycle:
  - confirmed/unpaid -> `occupied`
  - served/paid -> `needs_cleaning`
  - completed/cleared -> `available`
  - cancelled -> `available`
- Empty zero-amount local placeholder orders stay hidden from the POS order list.

## Production Read-Only Audit

Command:

```powershell
cd C:\Users\鍗庝负\Desktop\Restaurant_POS_Cloud_Clean\client
npm run audit:pos-lifecycle -- --password admin123 --hours 96
```

Result after correcting the audit time window to use order business time for completed/cancelled orders:

```text
summary.issueCount: 0
summary.criticalCount: 0
summary.highCount: 0
summary.mediumCount: 0
Bluefields: orders 1299, tables 13, active orders 3, issues 0
Managua: orders 0, tables 0, active orders 0, issues 0
```

Audit output was also saved to:

```text
docs/pos-lifecycle-audit-latest.json
```

Important correction:

- The first audit version used `lastModified` as part of the recent-order check. That made old May orders look recent when they were merely touched by a later sync operation.
- The script now separates business time from activity time. Stock-deduction checks for completed orders use `completedAt` or `createdAt`, not `lastModified`.

## Verification

POS lifecycle tests:

```powershell
cd C:\Users\华为\Desktop\Restaurant_POS_Cloud_Clean\client
npm test -- --watchAll=false --runTestsByPath src/utils/posLifecycle.test.ts
```

Result:

```text
PASS src/utils/posLifecycle.test.ts
Tests: 5 passed, 5 total
```

Data-safety guards:

```powershell
npm test -- --watchAll=false --runTestsByPath src/utils/dataSafety.test.ts src/utils/posLifecycle.test.ts
```

Result:

```text
PASS src/utils/dataSafety.test.ts
PASS src/utils/posLifecycle.test.ts
Tests: 197 passed, 197 total
```

Production build:

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
firebase deploy --only hosting --project restaurant-pos-1b420
```

Result:

```text
Deploy complete.
Hosting URL: https://restaurant-pos-1b420.web.app
```

Live checks:

```text
STATUS=200
BUNDLE=main.a0adf546.js
```

Browser smoke check:

```text
url: https://restaurant-pos-1b420.web.app/pos
hasMesas: true
hasPedidos: true
errorCount: 0
bundle: /static/js/main.a0adf546.js
```

Repeatable smoke command:

```powershell
cd C:\Users\华为\Desktop\Restaurant_POS_Cloud_Clean\client
npm run verify:pos-smoke -- --password 123456
```

Result:

```text
hasMesas: true
hasPedidos: true
errorCount: 0
bundle: /static/js/main.a0adf546.js
```

## Remaining POS Lifecycle Work

This pass does not create live test orders. The next POS hardening step should add a controlled E2E path, preferably against Firebase Emulator or a staging project, for:

- Create dine-in order.
- Add items.
- Pay.
- Complete and deduct stock.
- Clear table.
- Cancel whole order.
- Cancel item.
- Repeat for Barra and Delivery.

Do not run these against production data unless the owner explicitly approves a test order and cleanup plan.
