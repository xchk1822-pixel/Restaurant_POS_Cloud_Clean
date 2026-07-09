# 2026-06-30 POS Order Visual State Guard

Date: 2026-06-30, America/Managua.

## Scope

This pass keeps POS order card visual state consistent with the agreed lifecycle:

- confirmed / preparing / served and unpaid -> red
- paid but not completed -> orange
- completed / cancelled -> neutral

The change is intentionally narrow. It does not change order creation, payment, completion, inventory deduction, or cloud sync logic.

## Root Cause

The POS component had a local `getStatusColor` switch with a corrupted mojibake inline comment.

That comment swallowed the `confirmed` case on the same line, so a newly confirmed unpaid order could fall through to the default neutral color instead of red.

## Completed

- Added `getPosOrderCardColor` to `client/src/utils/posLifecycle.ts`.
- Added `getPosOrderStatusText` to `client/src/utils/posLifecycle.ts`.
- Updated `client/src/pages/POS/POS.tsx` to call the shared lifecycle utility.
- Added regression coverage in `client/src/utils/posLifecycle.test.ts`.
- Updated `client/src/utils/dataSafety.test.ts` so source guards follow the utility location.
- Restored split-table recovery code after verifying the damaged block cleanup removed too much code:
  - `deletedTableIdsRef.current.delete(restoredTable.id)`
  - `smartSetDocument('pos_tables', restoredTable.id, restoredTable)`
  - delete merged split source table
  - reset local table state with normalized restored tables

## Verification

Red test observed first:

```text
TypeError: getPosOrderCardColor is not a function
```

Targeted tests:

```powershell
cd C:\Users\鍗庝负\Desktop\Restaurant_POS_Cloud_Clean\client
npm test -- --watchAll=false --runTestsByPath src/utils/dataSafety.test.ts src/utils/posLifecycle.test.ts
```

Result:

```text
PASS src/utils/posLifecycle.test.ts
PASS src/utils/dataSafety.test.ts
Tests: 198 passed, 198 total
```

Build:

```powershell
npm run build
```

Result:

```text
Compiled successfully.
main.4031293d.js
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
BUNDLE=static/js/main.4031293d.js
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
bundle: /static/js/main.4031293d.js
```

## Remaining

The next POS lifecycle task is still controlled E2E order-flow verification against staging or emulator. Do not create production test orders without an explicit cleanup plan.
