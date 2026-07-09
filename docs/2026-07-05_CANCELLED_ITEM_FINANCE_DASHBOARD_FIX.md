# 2026-07-05 Cancelled Item Finance/Dashboard Fix

## Scope
- Precise fix only for cancelled dish/item records missing from manager finance reports and data overview.
- No formula, inventory, table layout, or UI redesign changes.

## Root Cause
- Financial reports and data overview already read cancelled item counts from `order.cancelRecords` and `item.cancelRecords`.
- POS item cancellation only saved records to local `pos_cancel_records`.
- Existing order item cancellation also only updated the in-screen ticket unless another later order publish happened.
- Result: cloud `pos_orders` documents often had no cancelled item records, so finance/dashboard could not count them.

## Changes
- Added top-level `cancelRecords?: CancelRecord[]` to POS order documents.
- Added helpers in `client/src/pages/POS/POS.tsx`:
  - `getCurrentOrderCancelRecords`
  - `mergeOrderCancelRecords`
  - `persistItemCancellationForExistingOrder`
- Send-to-kitchen and payment order publish paths now merge current cancelled item records into the order before writing.
- Existing order reduce/delete item actions now immediately update and publish the order with cancelled item records.
- Add-item branch no longer writes to cancelled item records, preventing additions from being counted as cancellations.
- Added regression test in `client/src/utils/dataSafety.test.ts`.

## Verification
- `npm test -- --runTestsByPath src/utils/dataSafety.test.ts --runInBand --watchAll=false --testNamePattern="POS cancelled item records are persisted"`
- `npm test -- --runTestsByPath src/utils/financeMetrics.test.ts --runInBand --watchAll=false`
- `npm run build`
- `firebase deploy --only hosting`
- Browser verification on `https://restaurant-pos-1b420.web.app`:
  - Loaded deployed bundle `/static/js/main.1ecfc724.js`.
  - Logged in as store manager.
  - Opened financial reports successfully.
  - Opened data overview at `/manager` successfully.
  - No browser console errors during verification.

## Notes
- I did not create a real test order in production, to avoid polluting live restaurant data.
- Existing historical cancelled item records that were never saved into `pos_orders` may not backfill automatically; new cancellations from this build forward will be written with the order.
