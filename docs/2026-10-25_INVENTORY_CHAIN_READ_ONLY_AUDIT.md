# Inventory chain read-only audit - 2026-10-25

## Scope and identity

- Repository: `Restaurant_POS_Cloud_Clean`
- Branch: `main`
- Firebase project: `restaurant-pos-1b420`
- Store: `store_1776725610354` (Bluefields)
- This audit was read-only. No Firestore document, inventory quantity, order, purchase, or stocktake record was changed.

## Paths reviewed

- Purchase receiving and purchase deletion
- POS completion stock deduction
- Warehouse-to-fridge and fridge-to-warehouse transfer
- Warehouse stocktake
- Fridge stocktake
- Offline pending writes, idempotent increment operation IDs, stock movement records, and current cloud balances

## Cloud evidence

The audit read the production store and compared 45 days of stock activity:

- Inventory items: 117
- Fridge inventory rows: 40
- Inventory movement records: 23,035 total; 9,827 in the 45-day window
- Warehouse stocktake records: 128
- Fridge stocktake records: 345
- Purchase orders: 227
- POS orders: 8,603

Safety checks found:

- Duplicate movement groups for the same source/item/location: 0
- Duplicate stocktake submissions with identical item values: 0
- Stocktake history rows missing their movement records: 0
- Purchase orders missing their movement records: 0
- Current quantities differing from the latest movement record: 1 apparent case, traced to an inaccurate purchase movement baseline rather than an incorrect atomic increment

## Human or operating-process evidence

Several large corrections are physically implausible as real stock movement and show immediate manual correction patterns:

- `Valle limon500ML`: warehouse `12 -> 0`, then `0 -> 12` about 45 seconds later.
- `Heineken`: fridge `8 -> 0`, then `0 -> 8` about 11 minutes later; `Coca 2LT` was reversed in the same two stocktakes.
- `Canada dry`: fridge `2 -> 14` and warehouse `24 -> 12` on the same date. The exact `+12/-12` pair indicates a physical transfer that was reconciled through two stocktakes instead of the transfer workflow.
- `SOL`: warehouse `6 -> 12` was a real stocktake correction of `+6`; the audit found no duplicate purchase or duplicate stocktake operation behind it.

These older movement rows store operator `system`, so the evidence identifies an operating pattern but cannot attribute it to a specific account.

## System defects and risks

### P0 - stocktake can overwrite concurrent business changes

Both stocktake pages capture system quantities from the page state, then write the entered count as an absolute quantity. They do not re-read and compare the current cloud version immediately before applying the stocktake.

- Warehouse path: `client/src/pages/Inventory/WarehouseStocktake.tsx`
- Fridge path: `client/src/pages/Inventory/FridgeStocktake.tsx`

If a purchase, sale, or transfer occurs after counting starts but before completion, the stocktake can overwrite that newer change. This is a real system race and can create a large discrepancy even when the employee counted correctly.

Offline risk is related: a pending absolute stocktake write can later conflict with newer cloud stock. The generic conflict guard prevents some stale replays, but stocktake history and movement rows can already have been accepted separately, leaving the audit trail and current quantity inconsistent.

### P1 - purchase movement before/after values can use stale UI stock

Purchase quantity changes use idempotent Firestore increments, which protected the real stock quantity in the traced case. However, purchase movement `beforeStock` and `afterStock` are currently prepared from the browser inventory snapshot before the cloud transaction.

Example: `Brocoli` was correctly changed from actual `121.2 + 2 = 123.2`, but its purchase movement row displayed `121.7 -> 123.7`. The movement display was stale by `0.5`; the cloud quantity was correct.

This explains many of the 72 movement continuity gaps. They are not all inventory corruption, but they make investigations look like stock was lost or duplicated.

### P1 - historical sales without a deduction ledger

Forty-five completed historical orders in the 45-day window were marked `stockDeducted` but had no sale movement record. A sampled order (`0910042`) contained no saved ingredient snapshot; the same menu item now has a recipe.

This indicates historical menu configuration gaps or recipe changes. A sale completed while an item had no inventory mapping could be marked processed without deducting physical stock, producing a later negative stocktake correction.

## Conclusion

The large discrepancies are caused by both factors:

- The strongest evidence in the sampled records is human/process error: wrong count, wrong location, or moving goods without using transfer.
- The system still has one high-risk correctness defect: stocktake uses an unprotected absolute overwrite and can lose concurrent purchase/sale/transfer changes.
- The purchase ledger has a display/audit defect: its before/after balances can be stale even when the real increment is correct.
- No evidence was found that current idempotent purchase, POS, transfer, or stocktake actions are being applied twice.

## Recommended precise repair order

1. Add optimistic concurrency to warehouse and fridge stocktake. Save the baseline quantity/version when counting starts, re-read cloud state on completion, and stop with a conflict requiring refresh/recount when any counted item changed.
2. Treat an offline stocktake as a draft. Do not replay an absolute quantity automatically after newer cloud movement; reconcile it first.
3. Generate purchase movement before/after balances from the Firestore transaction's current quantity, not from the browser snapshot.
4. Save the inventory recipe/direct-stock mapping snapshot into each confirmed order and flag any completed sellable item that has no deductible mapping.
5. Preserve current deterministic operation IDs and duplicate-submit locks; the audit confirms those controls are working.

## Verification

`npm test -- --watchAll=false --runInBand src/utils/stockDeduction.test.ts src/services/stockDeductionRetry.test.ts src/utils/dataSafety.test.ts`

- Test suites: 3 passed
- Tests: 309 passed
- Temporary audit scripts were removed after use.
