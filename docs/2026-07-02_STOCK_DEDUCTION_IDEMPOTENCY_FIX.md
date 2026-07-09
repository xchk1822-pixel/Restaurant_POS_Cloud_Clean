# 2026-07-02 Stock Deduction Idempotency Fix

## Scope

Fixed POS inventory duplicate-deduction risk discovered from SELTZER stock inconsistency.

The operator will correct current stock quantities manually. Code changes in this note are only to prevent the same duplicate-deduction pattern from happening again.

## Root Cause

POS completion generated `stockDeductionOperationId` with `Date.now()`.

When a completed order was retried by background sync, refresh recovery, or another terminal before the order had a final `stockDeducted` echo, the same order could receive a second stock operation id. The Firestore increment idempotency guard only protects identical operation ids, so a second id could deduct inventory again.

SELTZER evidence:

- Latest fridge stocktake: 2026-07-01 21:45, fridge No.1 actual quantity 2.
- 2026-07-02 SELTZER sales found: order 0702056, quantity 1.
- Incorrect cloud state found during diagnosis: warehouse -1, fridge -5, total -6.
- Correct state from stocktake minus sales would be warehouse 0, fridge 1, total 1.
- The fridge record contained extra applied stock operation ids for old orders, proving duplicate operation application.

## Code Changes

- `client/src/services/smartSyncService.ts`
  - Added `getStableStockDeductionOperationId(orderId)`.
  - `smartClaimOrderStockDeduction` now falls back to a stable per-order id instead of `Date.now()`.
  - Pending local inventory/fridge increment sync now checks the related POS order and target stock document before replaying old queued stock deductions.
  - If cloud already has `stockDeducted` for the order, or the target document already contains another legacy `stock-{orderId}-...` operation id for the same order, the queued legacy increment is skipped instead of deducting again.

- `client/src/pages/POS/POS.tsx`
  - POS stock deduction now uses the stable per-order operation id.

- `client/src/contexts/AppContext.tsx`
  - Fridge stock deduction no longer clamps local quantity to zero. Negative stock stays visible for audit, matching the business rule that negative stock is allowed and must be traceable.

- `client/src/utils/dataSafety.test.ts`
  - Added regression coverage for stable stock deduction operation ids.
  - Added regression coverage so fridge stock can go negative locally instead of being hidden as zero.
  - Added regression coverage that stale legacy pending POS stock increments are skipped after the cloud order was already deducted.

## Data Repair Performed During Diagnosis

Before the operator clarified that stock quantities would be corrected manually, SELTZER was repaired in Firestore with a guarded transaction that only ran if the current incorrect values were still present.

- Inventory item `6905688134912` / `SELTZER`
  - Warehouse: `-1 -> 0`
  - Fridge No.1 record `fridge-1778035349898-6905688134912`: `-5 -> 1`

Audit records written:

- `repair-seltzer-20260702-1783050145419-warehouse-6905688134912`
- `repair-seltzer-20260702-1783050145419-fridge-fridge-1778035349898-6905688134912`

No further stock quantity repair should be done by code unless explicitly requested.

## Coca cola 600ML Check

Exact item `6908557178926` was checked separately.

- Warehouse current stock: 0.
- Fridge No.2 current quantity: 4.
- Latest stocktake at 2026-07-02 21:39 recorded system 2, actual 4, difference +2.
- Current fridge quantity matched that stocktake correction at the time of checking.
- No missing stock ledger ids were found for Coca cola 600ML.

## Verification

- `npm test -- --runTestsByPath src/utils/dataSafety.test.ts --runInBand --watchAll=false`
  - Passed: 230 tests.

- `npm run build`
  - Passed.
  - Production bundle: `main.bae3cb7d.js`.

- `npx firebase deploy --only hosting --project restaurant-pos-1b420`
  - Deployed successfully.
  - Hosting URL: `https://restaurant-pos-1b420.web.app`

- Production browser verification:
  - Confirmed loaded script `/static/js/main.bae3cb7d.js`.
  - Login with `zeng`.
  - Opened `/pos`.
  - Verified visible POS controls: Mesa, Barra, Delivery, Nuevo pedido, Pedidos.
  - Browser console errors: 0.

## Remaining Follow-Up

Historical item counts should be corrected by stocktake/manual adjustment so the audit trail stays clear.

The system is now protected against new duplicate stock operation ids and stale legacy queued POS stock deductions, but older already-applied duplicate deductions may still exist in historical stock state until corrected operationally.
