# 2026-07-01 POS Table Release Binding Fix

Date: 2026-07-01, America/Managua.

## Scope

Emergency POS fix for the same-device table release problem after completing or clearing paid orders.

Reported symptom:

- Clicking clear table / complete order could leave the same device showing the table as still occupied or needing cleaning.
- Some completed orders stayed visually orange on another or the same terminal until later refreshes.
- The UI sometimes showed a sync failure even though the correct weak-network behavior is local completion first and cloud retry later.

## Root Cause

The Firestore serializer intentionally skips `undefined` and `null` fields.

Several table release paths wrote:

```ts
currentOrderId: undefined
```

That meant the cloud document kept the old `currentOrderId` even after the local table was set to `available`. Later table snapshots could pull the stale old order binding back into the POS.

There was a second related stock-completion lock risk: if stock deduction failed after claiming the order deduction lock, `stockDeductionInProgress` could remain true and keep the paid order visually stuck.

## Completed

- Changed table release writes to use an explicit empty string:
  - complete / clear table release
  - whole-order cancellation release
  - automatic table reconciliation release
- Kept the serializer unchanged to avoid broad data-layer risk.
- Added lock recovery for failed stock deduction:
  - if deduction fails after the claim, the order lock is cleared.
  - the same stock deduction operation id can resume instead of blocking itself.
- Repaired existing cloud table residues:
  - cleared 11 `pos_tables` records where `status` was already `available` but `currentOrderId` still pointed to an old order.
  - did not change order totals, inventory totals, or historical records.

## Verification

- Red tests failed before the release-path fix:
  - `POS full order cancel keeps cancelled status locally and releases the order table`
  - `POS cancelled orders are frozen and cannot be reused for new table orders`
- Targeted data safety tests passed after the fix:
  - `npm test -- --runTestsByPath src/utils/dataSafety.test.ts --runInBand`
  - Result: 213 passed.
- Production build passed:
  - `npm run build`
  - Bundle: `main.d98c0487.js`.
- Firebase Hosting deployed successfully:
  - `firebase deploy --only hosting`
  - URL: `https://restaurant-pos-1b420.web.app`.
- Production browser verification:
  - Logged in as `zeng / 123456`.
  - Opened `/pos`.
  - Confirmed previously stuck orders `0701042`, `0701043`, and `0701045` display as `Completado`.
  - Confirmed order `0701050` displays as `Completado`.
  - Confirmed table 1 cloud state is `available` with `currentOrderId: ""`.
  - Confirmed cloud has `staleAvailableBindings: 0`.

## Data Repair Evidence

Before repair:

```json
{
  "staleCount": 11
}
```

After repair:

```json
{
  "staleAvailableBindings": 0,
  "table1": {
    "number": "1",
    "status": "available",
    "currentOrderId": ""
  }
}
```

## Follow-Up

This fix keeps the current architecture stable with minimal changes. A later offline/sync productization task should expose pending order/table writes in a visible recovery panel, but POS operation must not block on weak network.
