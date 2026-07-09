# 2026-06-30 Inventory Stock Records Ledger

Date: 2026-06-30, America/Managua.

## Scope

This pass continues Step 4, inventory lifecycle hardening.

The existing Inventory module already had a tab named stock in/out records, but it only read local `inventory_stock_records` cache. It did not read a store-scoped cloud collection and stocktake corrections did not write records into it.

## Design

Use the existing stock in/out records entry instead of creating a separate adjustment module.

Cloud path:

```text
stores/{storeId}/inventory_stock_records
```

Current implemented writers:

- warehouse stocktake discrepancies
- fridge stocktake discrepancies

Each stocktake discrepancy writes one `adjust` record with:

- item id and name
- source: `warehouse_stocktake` or `fridge_stocktake`
- source stocktake id
- location type
- fridge id/name when applicable
- before stock
- signed difference
- after stock
- created time and local date-compatible date field

## Files Changed

```text
client/src/pages/Inventory/Inventory.tsx
client/src/pages/Inventory/WarehouseStocktake.tsx
client/src/pages/Inventory/FridgeStocktake.tsx
client/src/services/backupExportService.ts
client/scripts/auditInventoryLifecycle.mjs
client/src/utils/dataSafety.test.ts
firestore.rules
```

## Verification

Red test first:

```powershell
cd C:\Users\华为\Desktop\Restaurant_POS_Cloud_Clean\client
npm test -- --watchAll=false --runTestsByPath src/utils/dataSafety.test.ts --testNamePattern="stocktake corrections"
```

Initial result:

```text
FAIL src/utils/dataSafety.test.ts
Expected cloud inventory_stock_records read/write coverage was missing.
```

Targeted tests:

```powershell
npm test -- --watchAll=false --runTestsByPath src/utils/stockDeduction.test.ts src/utils/posLifecycle.test.ts src/utils/dataSafety.test.ts
```

Result:

```text
PASS src/utils/dataSafety.test.ts
PASS src/utils/stockDeduction.test.ts
PASS src/utils/posLifecycle.test.ts
Tests: 204 passed, 204 total
```

Build:

```powershell
npm run build
```

Result:

```text
Compiled successfully.
main.1fc7560e.js
```

Deployment:

```powershell
firebase deploy --only hosting,firestore:rules
```

Result:

```text
firestore.rules compiled successfully
Deploy complete.
Hosting URL: https://restaurant-pos-1b420.web.app
```

Live checks:

```text
STATUS=200
BUNDLE=static/js/main.1fc7560e.js
```

POS browser smoke:

```text
url: https://restaurant-pos-1b420.web.app/pos
hasMesas: true
hasPedidos: true
errorCount: 0
bundle: /static/js/main.1fc7560e.js
```

Inventory browser check:

```text
url: https://restaurant-pos-1b420.web.app/inventory
stock in/out tab visible: true
records tab rendered: true
errorCount: 0
bundle: /static/js/main.1fc7560e.js
```

Inventory audit:

```powershell
node scripts/auditInventoryLifecycle.mjs --password admin123 --hours 96
```

Result:

```text
inventoryStockRecordCount: 0
exit code: 2 because the previous 7 negative warehouse stock records still exist
```

The audit confirms the new collection is readable. Existing negative stock values remain unchanged and need approved stocktake correction.

## Remaining

- Extend `inventory_stock_records` writers to purchase orders, POS completion deductions, and fridge transfers.
- Add filters in the stock in/out records UI after enough real records exist.
- Existing negative warehouse values still need approved stocktake correction.
