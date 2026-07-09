# 2026-06-30 Inventory Lifecycle Audit And Negative Stock Guard

Date: 2026-06-30, America/Managua.

## Scope

This pass starts Step 4, inventory lifecycle hardening.

It adds a read-only production audit and fixes a code path that could create negative warehouse stock during POS order completion.

## Read-Only Audit

Added:

```text
client/scripts/auditInventoryLifecycle.mjs
```

Command:

```powershell
cd C:\Users\鍗庝负\Desktop\Restaurant_POS_Cloud_Clean\client
npm run audit:inventory-lifecycle -- --password admin123 --hours 96
```

The script reads only store-scoped collections:

- `inventory_items`
- `fridges`
- `fridge_inventory`
- `stock_transfer_records`
- `warehouse_stocktake_history`
- `fridge_stocktake_history`
- `purchase_orders`
- `expenses`

It does not call Firestore write APIs.

Latest output:

```text
docs/inventory-lifecycle-audit-latest.json
```

## Production Audit Result

Summary:

```text
issueCount: 7
criticalCount: 7
highCount: 0
mediumCount: 0
```

Bluefields:

```text
inventory items: 76
fridges: 3
fridge inventory rows: 39
transfer records: 14
warehouse stocktake history: 34
fridge stocktake history: 7
purchase orders: 83
```

All 7 issues are `negative_warehouse_stock`:

```text
TE VASO: -51 BOT
extra salsa: -0.30000000000000004 lb
水饺: -60 lb
Extra9*9 包装盒: -8 个
diferencia: -6 lb
Extra7*7 包装盒: -49 个
Extra8*8 包装盒: -76 lb
```

No issues were found for:

- negative fridge stock
- missing fridge item references
- missing fridge references
- duplicate fridge item records
- duplicate transfer operation ids
- recent cash purchase missing expense link

## Root Cause

The POS stock deduction logic correctly deducted fridge stock first.

However, when fridge stock was not enough, the remaining quantity was sent to warehouse deduction without checking whether the warehouse had enough stock.

That allowed this write pattern:

```text
inventory_items.currentStock += -remainingQuantity
```

even if `currentStock < remainingQuantity`.

## Fix

Added:

```text
client/src/utils/stockDeduction.ts
client/src/utils/stockDeduction.test.ts
```

The new planner:

- combines repeated requests for the same stock item
- deducts fridge stock first
- uses warehouse only for the shortage
- throws before any Firestore write if fridge plus warehouse cannot cover the requested quantity

`AppContext.deductStock` now calls `buildStockDeductionPlan` before creating any `smartIncrementField` stock writes.

Existing negative values were not changed automatically. They are production business data and should be corrected through a confirmed stocktake or adjustment flow.

## Verification

Tests:

```powershell
cd C:\Users\鍗庝负\Desktop\Restaurant_POS_Cloud_Clean\client
npm test -- --watchAll=false --runTestsByPath src/utils/stockDeduction.test.ts src/utils/posLifecycle.test.ts src/utils/dataSafety.test.ts
```

Result:

```text
PASS src/utils/stockDeduction.test.ts
PASS src/utils/posLifecycle.test.ts
PASS src/utils/dataSafety.test.ts
Tests: 203 passed, 203 total
```

Build:

```powershell
npm run build
```

Result:

```text
Compiled successfully.
main.d9da7682.js
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
BUNDLE=static/js/main.d9da7682.js
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
bundle: /static/js/main.d9da7682.js
```

## Remaining

- Existing negative warehouse values need approved stocktake correction.
- Continue inventory hardening:
  - purchase stock idempotency
  - stocktake adjustment ledger
  - POS completion stock deduction audit records
  - inventory repair UI for manager-approved corrections
