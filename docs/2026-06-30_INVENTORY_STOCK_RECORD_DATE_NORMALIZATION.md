# 2026-06-30 Inventory Stock Record Date Normalization

## Scope

Close a follow-up edge case from the unified stock ledger work: Firestore stores JavaScript `Date` values as Timestamp objects, so the stock in/out records page must normalize dates before sorting and rendering.

## Changes

- Updated `client/src/pages/Inventory/Inventory.tsx`.
- Added and hardened `normalizeStockRecordDate`.
- Stock records loaded from local cache and cloud now normalize:
  - Firestore Timestamp values via `.toDate()`
  - JSON-serialized Firestore Timestamp shapes with `seconds/_seconds`
  - existing `Date` objects
  - ISO/date strings
  - date-only `YYYY-MM-DD` strings as local dates, not UTC dates
  - millisecond timestamps
- Stock record display now prefers true operation timestamps in this order:
  - `createdAtMs`
  - `lastModified`
  - `createdAt`
  - `date`
- Stock in/out records sort by normalized dates and render normalized dates.
- Added `formatStockRecordQuantity` so stocktake adjustment rows display the real signed direction:
  - stocktake increase `+24` displays as `+24`
  - stocktake decrease displays as a negative value
  - in/out rows still use normal positive/negative business direction
- Added business display labels for old internal reason/operator values:
  - `warehouse to fridge` -> `仓库调拨到冰箱`
  - `fridge to warehouse` -> `冰箱退回仓库`
  - `system` -> `系统操作`
- Added a regression guard in `client/src/utils/dataSafety.test.ts` so direct `new Date(record.date)` cannot return.

## Verification

- RED check failed before implementation:
  - `npm test -- --watchAll=false --runTestsByPath src/utils/dataSafety.test.ts --testNamePattern="inventory stock record dates"`
- Targeted test passed after implementation:
  - same command passed, 1 test passed.
- Regression group passed:
  - `npm test -- --watchAll=false --runTestsByPath src/utils/stockDeduction.test.ts src/utils/posLifecycle.test.ts src/utils/dataSafety.test.ts`
  - 3 suites passed, 208 tests passed after the signed adjustment and timestamp-priority follow-up.
- Production build passed:
  - `npm run build`
  - final bundle `main.b7164b87.js`.
- Firebase Hosting deployed:
  - `firebase deploy --only hosting`
  - live URL deployed to `https://restaurant-pos-1b420.web.app`.
- Online verification passed:
  - POS smoke opened `/pos`, rendered `Mesas` and `Pedidos`, console/page errors 0, bundle `main.b7164b87.js`.
  - Inventory stock in/out records tab opened with bundle `main.b7164b87.js`.
  - Browser verification found `Invalid Date: false`.
  - Browser verification found `2026/6/29 18:00:00: false`, confirming date-only UTC rollback is no longer shown for the stock ledger.
  - Browser verification found friendly transfer/operator labels and console/page errors 0.
