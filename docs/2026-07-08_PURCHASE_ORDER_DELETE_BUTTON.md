# 2026-07-08 Purchase Order Delete Button

## Scope
- Added a delete button to the purchase order list.
- The delete action is guarded by a confirmation dialog and per-order click lock.
- Deleting a purchase order now reverses the linked purchase effects before removing the row from the UI:
  - deletes the `purchase_orders` document,
  - subtracts the purchased quantities from `inventory_items.currentStock`,
  - removes the deterministic purchase stock ledger rows,
  - removes the linked cash purchase expense,
  - recalculates supplier balance for credit purchases.

## Safety Rules
- The local purchase row is removed only after linked cloud writes complete.
- Local cache updates are non-blocking after successful cloud writes.
- This change is limited to `PurchaseManagement.tsx` and regression tests.

## Verification
- `npm test -- --watchAll=false --runInBand src/utils/dataSafety.test.ts --testNamePattern "purchase order delete|purchase order list exposes"`
- `npm test -- --watchAll=false --runInBand src/utils/dataSafety.test.ts --testNamePattern "purchase order"`
- `npm test -- --watchAll=false --runInBand src/utils/dataSafety.test.ts`
- `npm run build`

