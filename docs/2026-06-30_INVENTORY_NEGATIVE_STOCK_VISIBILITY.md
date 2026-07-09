# 2026-06-30 Inventory Negative Stock Visibility

## Scope

Continue Step 4 inventory lifecycle hardening by making negative stock visible in the Inventory item list. This change does not repair or overwrite stock quantities. Existing negative values must still be corrected through the approved stocktake/adjustment workflow.

## Changes

- Updated `client/src/pages/Inventory/Inventory.tsx`.
- Added a stock status filter for the inventory item list:
  - `全部状态`
  - `负库存`
  - `低库存`
- Added a visible negative-stock warning above the item table when any item has:
  - negative warehouse stock
  - negative fridge stock
  - negative total stock
- Added a `查看负库存` action that switches the list directly to the negative-stock filter.
- Added a `负库存` row status label so negative stock is not hidden under the generic low-stock status.
- Added a regression guard in `client/src/utils/dataSafety.test.ts` to ensure this remains visibility-only and does not clamp or silently mutate stock data.

## Current Read-Only Audit

Command:

```text
npm run audit:inventory-lifecycle -- --username admin --password admin123 --hours 96
```

Result:

- Bluefields: 7 critical negative warehouse stock issues.
- Managua: 0 issues.
- No cloud stock values were changed by this audit.

Negative warehouse stock items reported:

- `TE VASO`: `-51 BOT`
- `extra salsa`: `-0.30000000000000004 lb`
- `水饺`: `-60 lb`
- `Extra9*9 包装盒`: `-8 个`
- `diferencia`: `-6 lb`
- `Extra7*7 包装盒`: `-50 个`
- `Extra8*8 包装盒`: `-76 lb`

## Verification

- RED check failed before implementation:
  - `npm test -- --watchAll=false --runTestsByPath src/utils/dataSafety.test.ts --testNamePattern="negative stock visibility"`
- Targeted test passed after implementation:
  - same command passed, 1 focused test passed.
- Inventory/POS regression passed:
  - `npm test -- --watchAll=false --runTestsByPath src/utils/stockDeduction.test.ts src/utils/posLifecycle.test.ts src/utils/dataSafety.test.ts`
  - 3 suites passed, 209 tests passed.
- Production build passed:
  - `npm run build`
  - bundle `main.01d5f75c.js`.
- Firebase Hosting deployed:
  - `firebase deploy --only hosting`
  - `https://restaurant-pos-1b420.web.app`
- Online inventory browser verification passed:
  - loaded bundle `main.01d5f75c.js`
  - inventory page opened
  - negative stock option visible
  - negative stock warning visible
  - selecting the negative-stock filter kept negative-stock rows visible
  - console/page errors: 0
- Online POS smoke passed:
  - `/pos` rendered `Mesas` and `Pedidos`
  - bundle `main.01d5f75c.js`
  - console/page errors: 0

## Next

Continue Step 4 by checking remaining inventory repair visibility and then move toward controlled inventory correction flows. Do not silently rewrite negative stock values in code.
