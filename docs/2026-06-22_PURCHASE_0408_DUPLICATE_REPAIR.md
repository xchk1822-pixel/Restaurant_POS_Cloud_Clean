# 2026-06-22 Purchase Order 0408 Duplicate Repair

## Scope

Live data repair for purchase order `0408`.

## Findings

- Store: `Bluefields` (`store_1776725610354`)
- Supplier: `蔬菜`
- Payment type: cash
- Duplicate purchase orders found: 10 total
- Correct state: keep 1 order, remove 9 duplicates
- Duplicate purchase expenses found: 10 total
- Correct state: keep 1 expense, remove 9 duplicates

## Repair Applied

Kept:

- Purchase order: `po-1782170574339`
- Expense: `purchase_1782170574339`

Deleted duplicate purchase orders:

- `po-1782170574418`
- `po-1782170576371`
- `po-1782170577010`
- `po-1782170577042`
- `po-1782170577346`
- `po-1782170577362`
- `po-1782170578314`
- `po-1782170578674`
- `po-1782170578693`

Deleted duplicate purchase expenses:

- `purchase_1782170574419`
- `purchase_1782170576371`
- `purchase_1782170577011`
- `purchase_1782170577043`
- `purchase_1782170577346`
- `purchase_1782170577363`
- `purchase_1782170578314`
- `purchase_1782170578675`
- `purchase_1782170578693`

Inventory corrections applied to reverse the 9 duplicate incoming-stock writes:

- `6904509823789`: `-378`
- `6907940756314`: `-225`
- `6907236397672`: `-90`
- `6900416486047`: `-108`
- `6908261426173`: `-225`

Supplier balance recalculated:

- `sup-1781323756007`: `0`

## Verification

Ran dry-run verification after repair:

- Bluefields purchase order `0408`: 1 remaining
- Bluefields matching purchase expense: 1 remaining
- Bluefields matching purchase expense total: `C$3015`
- Managua purchase order `0408`: 0
- Managua matching purchase expense: 0

## Tooling

Added `client/scripts/repairPurchaseOrderDuplicates.mjs`.

Default mode is dry-run. `--apply` is required before it mutates Firestore data.
