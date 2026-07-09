# 2026-06-28 POS Order Sync Cache Guard

## Problem
- Terminal A completed order `0628043`, but terminal B still showed it as waiting to complete.
- Terminal A created/completed a `C$280` order around 21:25. Cloud contained the completed order, but terminal B also showed an orange `0` order.
- Cloud check showed today's last order number `0628083` exists and today's cloud orders had no real `0` amount order.
- Cloud check also showed duplicate early order numbers such as `0628001` through `0628006`, caused by weak-network/local fallback sequence drift.

## Root Cause
- POS incremental publisher could republish any local cached order whose signature differed from the remembered published signature, even when that order was not a local pending write. This allowed stale terminal cache to rewrite cloud data.
- POS merge logic could let a newer local non-terminal or stale terminal cache block a cloud completed/cancelled terminal state.
- Local fallback order numbers could start below the largest same-day local order number when cloud counter access was weak.
- The right-side POS order list only excluded `draft`, so a local placeholder with no items/amount could show as an orange `0` card.
- Firestore rules allowed `expenses` but not `expense_records`, while app storage maps expense records to `expense_records`, causing permission-denied reads to look like network refresh failures.

## Changes
- `client/src/pages/POS/POS.tsx`
  - POS incremental publisher now publishes only orders explicitly marked pending in `pendingOrderSyncIdsRef`.
  - Cloud completed/cancelled order states override stale local cache unless the same order is currently pending locally.
  - Right-side order list hides empty zero-amount local placeholder orders.
- `client/src/services/smartSyncService.ts`
  - Local/weak-network order-number fallback now continues after the largest local same-day `MMDD###` order number.
  - Cloud counter transaction also respects the local same-day max sequence.
- `firestore.rules`
  - Added store-scoped read/write rule for `stores/{storeId}/expense_records/{expenseId}`.
- `client/src/utils/dataSafety.test.ts`
  - Added regression tests for stale local order publish prevention, terminal cloud-state override, order-number fallback, empty order-card hiding, and `expense_records` rules.

## Verification
- `npm test -- --runTestsByPath src/utils/dataSafety.test.ts --watchAll=false --testNamePattern "POS right order list hides empty zero-amount local placeholder orders|POS order number fallback continues|POS cloud completed or cancelled order state overrides|POS incremental publisher does not republish stale non-pending local cached orders|POS global order updates|POS order numbers keep MMDD sequence|expense records collection is allowed by firestore rules"` passed.
- `npm run build` passed.
- `firebase deploy --only hosting,firestore:rules` completed successfully.
- Live hosting HTML references `main.505a6ffa.js`.
- Authenticated read as `zeng` confirmed:
  - `pos_orders`: 1225 docs readable.
  - `expense_records`: readable, currently 0 docs.

## Production Notes
- The fix prevents future stale local cache from writing old orders back to cloud.
- Existing duplicate order numbers in today's cloud data were observed and left untouched because they are historical completed sales records.
- If a terminal still visually shows the old orange `0` card after deployment, hard refresh or logout/login will clear the old local runtime; the new bundle filters it from the order list.
