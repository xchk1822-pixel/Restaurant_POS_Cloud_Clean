# 2026-07-01 POS Clear Table Pending Sync Fix

Date: 2026-07-01, America/Managua.

## Scope

Emergency POS fix for the clear-table / complete-order flow. The reported symptom was a red toast:

```text
No se pudo sincronizar. Revise la red e intente de nuevo.
```

It appeared after clicking clear table, blocking the cashier from clearing the table.

## Root Cause

`completeOrderWithStockDeduction` already saved the completed/cleared order locally and queued the order for pending cloud sync when Firestore was slow. After doing that, it still threw `complete-order-cloud-sync-pending`.

That made weak-network pending sync look like a hard failure, which violates the system rule that POS must remain usable in Nicaragua weak-network/offline conditions.

Follow-up production browser verification found a second blocker in the same visible flow. The real Mesa 6 clear-table click failed because stock deduction threw:

```text
insufficient-stock:Extra8*8 包装盒
```

The business rule is that POS stock is allowed to go negative when needed. The previous stock planning code incorrectly blocked completion when fridge plus warehouse stock could not cover the sale.

## Completed

- Removed the blocking throw for `complete-order-cloud-sync-pending`.
- Kept inventory stock deduction safety unchanged.
- Kept pending order sync tracking unchanged, so cloud confirmation still clears the pending flag later.
- Added a regression guard: POS clear-table must treat pending cloud publish as local success instead of blocking the cashier.
- Updated the older POS terminal-state guard to match the new rule: pending cloud publish skips noncritical points post-processing, but does not block completed/cleared local state.
- Restored the restaurant stock rule: sales deduct fridge first, then warehouse, and warehouse may become negative.
- Removed the stock deduction planner's `insufficient-stock` hard stop.
- Updated stock ledger and local inventory updates so negative warehouse balances are recorded instead of being clamped to zero.

## Verification

- Red test verified before the fix:
  - `POS clear-table treats pending cloud publish as local success instead of blocking the cashier`
  - Failed because `throw new Error('complete-order-cloud-sync-pending')` still existed.
- Targeted test passed after the fix:
  - `npm test -- --watchAll=false --runTestsByPath src/utils/dataSafety.test.ts --testNamePattern="POS clear-table treats pending cloud publish"`
- Related POS sync regression group passed:
  - `POS cancel and complete`
  - `POS order publisher`
  - `smart update returns pending`
  - `POS terminal completion`
  - `POS completion keeps`
  - `POS completion feedback`
  - `POS clear-table treats`
  - `POS table status changes`
  - `POS global order updates`
  - `POS incremental publisher`
  - `POS cloud completed`
  - Result: 14 passed.
- Production build passed:
  - `npm run build`
  - Bundle: `main.6e39ecbb.js`.
- Local browser verification passed:
  - Login `zeng / 123456`.
  - `/pos` rendered.
  - The red sync error was not visible on load.
  - Console/page errors and warnings: 0.
  - Screenshot: `client/output/playwright/pos-clear-table-sync-fix.png`.
- Stock deduction test passed:
  - `npm test -- --watchAll=false --runTestsByPath src/utils/stockDeduction.test.ts`
  - Confirms fridge-first deduction and warehouse negative-stock allowance.
- Production browser verification:
  - Login `zeng / 123456`.
  - Opened `/pos`.
  - Clicked real table 6, opened `Mesa 6 - Acción`.
  - Clicked `Liberar mesa`.
  - `#0701003` changed from `Pagado` to `Completado`.
  - Final time recorded as `14:15`.
  - Table 6 returned to natural visual state.
  - No `No se pudo sincronizar` toast.
  - No `Inventario insuficiente` toast.
  - Screenshot: `client/output/playwright/live-negative-stock-clear-after.png`.

## Deployment

- Firebase Hosting deployed successfully to `https://restaurant-pos-1b420.web.app`.
- Live HTML points to `main.6e39ecbb.js`.
- Production browser smoke verification passed:
  - Login `zeng / 123456`.
  - `/pos` rendered.
  - The red sync error was not visible on load.
  - Console/page errors and warnings: 0.
