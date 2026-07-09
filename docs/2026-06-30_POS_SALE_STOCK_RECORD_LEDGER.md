# 2026-06-30 POS Sale Stock Record Ledger

## Scope

Continue Step 4 inventory lifecycle hardening by recording POS completion stock deductions in the unified stock in/out records ledger.

## Changes

- Updated `client/src/contexts/AppContext.tsx`.
- Extended `deductStock` with an optional `StockDeductionSource` so callers can pass order context without changing existing non-POS behavior.
- POS completion now passes order context into stock deduction:
  - operation id
  - order id
  - order number
  - order type
  - completion timestamp
- Every successful POS stock deduction now writes deterministic `inventory_stock_records` rows:
  - warehouse rows: `${operationId}-warehouse-${item.id}`
  - fridge rows: `${operationId}-fridge-${recordId}`
- Ledger rows use `source: 'pos_sale'`, `type: 'out'`, signed negative quantity, before stock, after stock, item/unit, location type, fridge id when applicable, and order metadata.
- POS stock increments now pass stable `syncOperationId` values derived from the order stock deduction operation id to reduce duplicate deduction risk during weak-network replay.

## Verification

- RED check failed before implementation:
  - `npm test -- --watchAll=false --runTestsByPath src/utils/dataSafety.test.ts --testNamePattern="POS stock deduction writes audited sale records"`
- Targeted test passed after implementation:
  - same command passed, 1 test passed.
- Regression group passed:
  - `npm test -- --watchAll=false --runTestsByPath src/utils/stockDeduction.test.ts src/utils/posLifecycle.test.ts src/utils/dataSafety.test.ts`
  - 3 suites passed, 205 tests passed for the POS ledger change.
  - After the related stock-record date normalization guard, 3 suites passed, 206 tests passed.
- Production build passed:
  - `npm run build`
  - final deployed bundle `main.e9cae7ac.js`.
- Firebase Hosting deployed:
  - `firebase deploy --only hosting`
  - live URL returned HTTP 200 with `static/js/main.e9cae7ac.js`.
- Online POS smoke passed:
  - `npm run verify:pos-smoke -- --password 123456`
  - `/pos` rendered `Mesas` and `Pedidos`, console/page errors 0.
- Online inventory browser verification passed:
  - `/inventory` stock in/out records tab opened and rendered, console/page errors 0.
  - Follow-up verification confirmed no `Invalid Date` text after Firestore Timestamp date normalization.

## Notes

- This change does not create production test orders.
- Existing stock errors still require stocktake or an approved adjustment flow. Code should not silently rewrite business stock values.
