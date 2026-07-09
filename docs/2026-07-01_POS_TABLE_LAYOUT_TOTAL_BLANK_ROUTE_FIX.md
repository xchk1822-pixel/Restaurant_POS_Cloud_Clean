# 2026-07-01 POS table layout, total, and blank route emergency fix

## Scope

Emergency production fix for three visible issues:

- POS table layout became unstable after deployment and showed default placeholder tables.
- POS right-side total showed `C$15065.00` while manager reports showed `C$14715.00`.
- Some manager links rendered a blank page.

## Root Cause

1. `POS.tsx` normalized default table placeholders with `Date.now()` as `lastModified`. That made locally generated placeholder tables look newer than real cloud table layout data, so they could overwrite Firestore.
2. POS right-side order summary summed every visible order `totalAmount`, including whole cancelled orders. Manager report and order history correctly exclude whole cancelled order totals from revenue.
3. Legacy manager URLs such as `/manager/orders`, `/manager/reports`, and `/manager/overview` were not routed after module path cleanup, so direct loads rendered no route.

## Code Changes

- `client/src/pages/POS/POS.tsx`
  - Removed the `Date.now()` fallback from table normalization.
  - Blocked table publishing until the POS table collection has hydrated from cloud.
  - Added `getPosOrderSummaryAmount()` so whole cancelled orders remain visible but count as `0` in POS revenue summary.

- `client/src/App.tsx`
  - Added legacy redirects:
    - `/manager/orders` -> `/manager/order-history`
    - `/manager/reports` -> `/manager/financial-reports`
    - `/manager/overview` -> `/manager`

- `client/src/utils/dataSafety.test.ts`
  - Added regression guards for table placeholder overwrite prevention.
  - Added POS cancelled-order summary total guard.
  - Added legacy manager route redirect guard.

## Production Data Repair

Firestore store `store_1776725610354` was repaired:

- Deleted default placeholder table documents `1` through `6`.
- Restored canonical table ids for tables `1` through `6`.
- Released table `13` because order `0701051` was already completed and cleared.
- Repaired 4 orders that had `completedAt` and `clearedAt` but a non-terminal status.

Post-repair cloud check:

- `0701051`: `completed`, paid, table 13 no longer blocks the table.
- `0701049`: repaired from `served` to `completed`.
- Table 1-13 all exist and all checked tables are available after repair.
- Today `0701` totals:
  - `sumAll`: `15065`
  - `sumNotCancelled`: `14715`
  - `sumCompleted`: `14715`
  - `sumCollected`: `14715`
  - Cancelled whole order: `0701024`, `total=350`, `paid=235`

## Verification

Commands:

```powershell
cd C:\Users\华为\Desktop\Restaurant_POS_Cloud_Clean\client
$env:CI='true'; npm test -- --runTestsByPath src/utils/dataSafety.test.ts --runInBand
$env:CI='true'; npm run build

cd C:\Users\华为\Desktop\Restaurant_POS_Cloud_Clean
firebase deploy --only hosting
```

Results:

- `dataSafety.test.ts`: `216 passed`.
- Production build: compiled successfully, `main.5e456d0e.js`.
- Firebase Hosting deploy: complete.

Browser verification:

- `/manager/orders` redirects to `/manager/order-history`.
- `/manager/reports` redirects to `/manager/financial-reports`.
- `/manager/overview` redirects to `/manager`.
- POS page loads without console errors.
- POS total shows `C$14715.00`.
- Manager order history shows `51` orders, collected amount `C$14715.00`.
- Financial report shows营业额 `C$14715.00`.
- Manager overview shows营业额 `C$14715.00`.
- POS table DOM contains tables `1` through `13`.

## Remaining Risk

- Tables 1-6 had to be restored with usable coordinates because no local layout backup with exact old positions was found. The restored ids are canonical and stable; visual fine-tuning can be done from the table editor without code changes.
- The repo still contains many historical uncommitted changes. Continue with narrow, verified changes only.
