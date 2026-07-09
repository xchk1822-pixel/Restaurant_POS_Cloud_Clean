# 2026-06-29 POS order lifecycle sync fix

## Scope

Fixed the intermittent POS multi-device issue where a completed order could still appear on another terminal as unpaid or waiting for completion.

Reported examples:
- `0629002`
- `0629012`
- `0629021`

## Root Cause

Firestore contained mixed lifecycle records. The affected orders had completion signals (`completedAt`, `clearedAt`, and `stockDeducted`) but stale lifecycle fields such as `status: served`, `status: confirmed`, or `paymentStatus: unpaid`.

This means the issue was not only a local browser refresh problem. The cloud record itself had been partially overwritten by older order state, so another terminal correctly followed the bad cloud fields.

Why it appeared intermittent:
- Only orders that received a stale non-terminal write after completion were affected.
- Orders without that later stale write stayed correct.
- The bad records kept completion timestamps, so inventory had already been deducted while the visible status regressed.

## Code Fix

File: `client/src/services/smartSyncService.ts`

Added POS order lifecycle normalization at the sync boundary:
- POS orders with `completedAt` or `clearedAt` are normalized to `status: completed`.
- Payment fields are reconstructed from `paidAmount`, `settledAmount`, or `cashAmount + cardAmount`.
- Cancelled orders are excluded from this normalization so cancellation history is not converted to completed orders.
- The normalizer runs before local/cloud merge and before local cache writes.

Regression coverage:
- `client/src/utils/dataSafety.test.ts`
- Added/updated tests for terminal order state priority and POS lifecycle normalization.

## Data Repair

Only the three affected 2026-06-29 orders were repaired in Firestore under store `store_1776725610354`:
- `0629002`: `served/paid` -> `completed/paid`
- `0629012`: `served/paid` -> `completed/paid`
- `0629021`: `confirmed/unpaid` -> `completed/paid`

After repair, a read-only scan of all `0629` orders found `remainingInconsistentToday0629: 0`.

## Verification

Commands:
- `npm test -- --runTestsByPath src/utils/dataSafety.test.ts --watchAll=false -t "smart sync normalizes POS orders|POS cloud terminal order state overrides|POS cloud completed or cancelled order state overrides"`
- `npm run build`
- `firebase deploy --only hosting --project restaurant-pos-1b420`

Browser verification:
- Production URL: `https://restaurant-pos-1b420.web.app`
- Loaded deployed bundle: `main.4c4e3d00.js`
- Logged in as store manager.
- Local POS cache showed all three orders as `completed/paid`.
- POS order list showed `#0629021` as `Completado`.

## Status

Completed and deployed.

## Follow-up: 0629023 delayed completion sync

Reported after the first deploy:
- Order `0629023` completed at 17:05 on one terminal.
- Another terminal stayed in the waiting-to-complete state for about 4 minutes before updating.

Cloud check:
- Firestore already had `0629023` as `status: completed`, `paymentStatus: paid`, `stockDeducted: true`.
- This confirmed the second symptom was not bad cloud data. It was delayed acceptance of the cloud terminal update on the other terminal.

Additional fix:
- `client/src/pages/POS/POS.tsx`
  - Cloud terminal order states now override stale local pending cache unless the local record is already terminal.
- `client/src/services/smartSyncService.ts`
  - Pending POS order sync replay now skips stale local non-terminal updates when the remote order is already terminal.
  - All pending `pos_orders` updates go through the guarded POS pending-sync path, not only stock-deducted updates.

Verification:
- Targeted tests passed:
  - pending POS sync conflict/idempotency guard
  - cloud terminal state priority
  - stale local pending cache override
  - POS lifecycle normalization
- Production build succeeded with bundle `main.eed71d4f.js`.
- Firebase Hosting deployment completed.
- Browser verification loaded `main.eed71d4f.js` and showed `#0629023` as `Completado`.

## Follow-up: POS current order list showed historical orders after refresh

Reported after refreshing another terminal:
- POS right-side order list showed some previous-day and older May orders.
- The issue looked random because only historical orders whose time fields had been touched by later sync writes could pass the current-day time filter.

Root cause:
- The POS current order list used order display time fields to decide whether an order was "today".
- In Nicaragua evenings, UTC timestamps can fall on the next UTC date.
- Some old orders also had newer `updatedAt` or `lastModified` values after repair/sync operations.
- Therefore a pure timestamp-based current list can accidentally include historical orders.

Fix:
- `client/src/pages/POS/POS.tsx`
  - The POS current order list now uses the business order number prefix first.
  - Current-day orders must match today's `MMDD` prefix, for example `0629xxx`.
  - Legacy `ORD-` orders are excluded from the POS current list and remain available in historical order views.
  - Timestamp fallback is kept only for records that do not use the modern numeric order-number format.

Verification:
- Targeted POS list and sync tests passed.
- Production build succeeded with bundle `main.8cd16b01.js`.
- Firebase Hosting deployment completed.
- Browser verification loaded `main.8cd16b01.js`.
- POS right-side list showed 24 orders, all `#0629xxx`, with `nonToday: []`.

## Follow-up: minimal realtime fallback for intermittent Firestore listener misses

Observed:
- Cloud data was correct and complete.
- A clean browser could read the latest orders after load.
- A temporary realtime probe did not arrive through the active POS page within 15 seconds.
- The issue later recovered by itself, which indicates an intermittent realtime channel delay rather than permanent data loss.

Minimal fix:
- Keep Firestore `onSnapshot` as the primary realtime path.
- Add a lightweight POS fallback refresh every 15 seconds while the POS page is visible.
- The fallback only queries current business-day order numbers by prefix, for example `0629xxx`.
- It does not query the full `pos_orders` history and does not change payment, stock, or UI logic.

Files:
- `client/src/services/smartSyncService.ts`
  - Added `smartGetPosOrdersByDatePrefix(datePrefix, forceServer)`.
- `client/src/pages/POS/POS.tsx`
  - Added visible-page current-day refresh using that helper.
- `client/src/utils/dataSafety.test.ts`
  - Added regression guard that the fallback uses order-number range and not full POS order reads.

Verification:
- Targeted tests passed.
- Production build succeeded with bundle `main.d25e1784.js`.
- Firebase Hosting deployment completed.
- Browser verification loaded `main.d25e1784.js`.
- POS right-side list showed latest current-day orders, including `#0629025` to `#0629028`, and later `#0629039`.
- Historical-order check returned `nonToday: []`.
- Pending sync queue was `0`.

## Follow-up: remove 15-second fallback after Firestore usage review

Decision:
- The 15-second POS current-day fallback was removed to avoid unnecessary Firestore reads.
- No extra manual refresh button was kept in the POS order panel.
- Current policy is to rely on Firestore realtime listeners, normal page load, and existing user navigation/refresh behavior.
- The strict current-day order-number filter remains in place so historical orders do not appear in the POS right-side current order list.

Files:
- `client/src/pages/POS/POS.tsx`
  - Removed visible-page current-day fallback refresh.
- `client/src/services/smartSyncService.ts`
  - Removed `smartGetPosOrdersByDatePrefix`.
- `client/src/utils/dataSafety.test.ts`
  - Removed the fallback-specific regression test.

Verification:
- Targeted POS sync/list tests passed:
  - pending POS sync conflict/idempotency guard
  - cloud completed/cancelled override
  - lifecycle normalization
  - empty zero-amount placeholder filter
- Production build succeeded with bundle `main.8cd16b01.js`.
- Firebase Hosting deployment completed.
- Production URL returned HTTP `200`.
- Production HTML references `main.8cd16b01.js`.
- Production JS does not contain `smartGetPosOrdersByDatePrefix`, `refreshCurrentDayOrders`, `Actualizando`, `Actualizar`, or `15000`.
- Browser screenshot verification loaded the deployed login page successfully.
