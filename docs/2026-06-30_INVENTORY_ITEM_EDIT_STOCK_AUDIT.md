# 2026-06-30 Inventory Item Edit Stock Audit

## Scope

Continue Step 4 inventory lifecycle hardening by making manual warehouse stock edits traceable. This change does not alter existing inventory quantities and does not auto-correct negative stock.

## Problem

The Inventory item edit modal could change `inventory_items.currentStock` directly. That updated the main item record, but it did not create an `inventory_stock_records` adjustment row, so later stock investigations could not tell when a manual edit changed the warehouse quantity.

## Changes

- Updated `client/src/pages/Inventory/Inventory.tsx`.
- Added `createInventoryItemEditStockRecord`.
- When editing an existing item changes `currentStock`, the save flow now writes one audited adjustment record to `inventory_stock_records`.
- The adjustment record includes:
  - item id and item name
  - `type: 'adjust'`
  - signed quantity difference
  - before stock and after stock
  - `reason: 'inventory item edit'`
  - `source: 'inventory_item_edit'`
  - source item id
  - created timestamp and last modified timestamp
- The local stock records list is updated only after cloud writes complete.
- The stock in/out records reason formatter now displays this as a manual item edit adjustment.

## Verification

- RED check failed before implementation:
  - `npm test -- --watchAll=false --runTestsByPath src/utils/dataSafety.test.ts --testNamePattern="inventory item stock edits"`
- Targeted test passed after implementation:
  - same command passed, 1 focused test passed.
- Inventory/POS regression passed:
  - `npm test -- --watchAll=false --runTestsByPath src/utils/stockDeduction.test.ts src/utils/posLifecycle.test.ts src/utils/dataSafety.test.ts`
  - 3 suites passed, 210 tests passed.
- Production build passed:
  - `npm run build`
  - bundle `main.2a048f92.js`.
- Firebase Hosting deployed:
  - `firebase deploy --only hosting`
  - `https://restaurant-pos-1b420.web.app`
- Online POS smoke passed:
  - `/pos` rendered `Mesas` and `Pedidos`
  - bundle `main.2a048f92.js`
  - console/page errors: 0
- Online inventory browser verification passed:
  - `/inventory` loaded bundle `main.2a048f92.js`
  - inventory page opened
  - negative stock filter still visible
  - console/page errors: 0

## Read-Only Audit Snapshot

Command:

```text
npm run audit:inventory-lifecycle -- --username admin --password admin123 --hours 96
```

Result:

- Bluefields: 7 critical negative warehouse stock issues remain visible.
- Managua: 0 issues.
- No cloud stock values were changed by this audit.

## Next

Continue Step 4 by checking remaining stock mutation entry points. Do not silently rewrite production stock values; corrections should go through stocktake or explicit adjustment flows with audit records.
