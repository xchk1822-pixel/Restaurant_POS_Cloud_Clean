# 2026-07-09 BAMBOO Stock Deduction Recovery

## Problem

- Item: `BAMBOO` / barcode `6907740569471`.
- Store: Bluefields (`store_1776725610354`).
- Order: `0709044`, takeout, completed and paid, quantity `2`.
- Expected: fridge stock from `19` to `17`.
- Actual before fix: fridge stayed `19`, no stock ledger row existed.

## Root Cause

The POS completion flow marked the order completed first, then ran stock deduction in a background task. If the background task claimed the stock-deduction lock and was interrupted before finishing, the order could remain:

- `stockDeducted=false`
- `stockDeductionPending=true`
- `stockDeductionInProgress=true`

No automatic recovery retried these stale pending stock deductions when POS was opened again.

After the first recovery run, stock was deducted successfully, but the order marker still depended on a later outer publish. If the page closed before that publish completed, the stock ledger could exist while the order remained pending.

## Fix

- Added POS recovery for stale completed orders with pending stock deduction:
  - only runs for `completed` orders,
  - skips already deducted orders,
  - requires `stockDeductionPending=true`,
  - retries when the deduction lock is older than 2 minutes.
- After stock is deducted, `deductStockForOrder` now immediately writes the stock-deduction marker to `pos_orders`.
- Added inventory stock-record search in the `出入库记录` tab.

## Verification

- Targeted tests passed:
  - `npm test -- --watchAll=false --runInBand src/utils/dataSafety.test.ts src/utils/stockDeduction.test.ts`
  - `257 passed`
- Production build passed:
  - `npm run build`
- Firebase Hosting deployed:
  - `https://restaurant-pos-1b420.web.app`
- Real browser verification:
  - Logged in as `zeng`.
  - Opened production POS.
  - Confirmed order list loaded normally.
  - Confirmed `BAMBOO` stock recovery ran.
  - Opened Inventory -> `出入库记录`, searched `BAMBOO`.
  - Search showed `BAMBOO`, `-2`, `销售出库 0709044`, `POS收银`.

## Final Cloud State

- `inventory_items/6907740569471.currentStock`: `12`
- `fridge_inventory/fridge-1778035349898-6907740569471.quantity`: `17`
- Total BAMBOO stock: `29`
- Stock record:
  - id: `stock-order-1783645390214-jy1q7o0fk-fridge-fridge-1778035349898-6907740569471`
  - quantity: `2`
  - signedQuantity: `-2`
  - orderNumber: `0709044`
  - beforeStock: `19`
  - afterStock: `17`
- Order `0709044`:
  - `stockDeducted=true`
  - `stockDeductionPending=false`
  - `stockDeductionInProgress=false`
