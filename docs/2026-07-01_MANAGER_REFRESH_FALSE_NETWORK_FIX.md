# 2026-07-01 Manager Refresh False Network Error Fix

## Scope

Fixed the store manager module symptom where POS orders were synchronized correctly across devices, but manager pages showed stale or historical data and repeatedly alerted that refresh failed or the network should be checked.

Affected manager pages:

- Data overview
- Expense records
- Financial reports
- Order history
- Shift handover

## Root Cause

The error message was misleading. The manager pages used server reads through `smartGetDocuments(..., true)`, but after reading cloud data they also saved the whole report snapshot into browser `localStorage` through `dataManager.saveData`.

On an older cashier/manager browser with accumulated cached orders, expenses, purchase records, and receipt images, `localStorage` can fail because of quota or corrupted old data. The catch block then showed a generic "check network" message, even though the network and Firestore reads could be working.

POS did not fail in the same way because POS active order synchronization uses a different realtime/current-day path and does not depend on writing the same large manager report snapshots to `localStorage`.

## Fix

Changed `client/src/services/dataManager.ts`:

- Added `persistLocal?: boolean` to `dataManager.saveData`.
- Default remains `true`, so normal business saves still preserve local data.
- When `persistLocal: false`, the data manager updates memory/cache but skips writing the large snapshot to `localStorage`.

Changed manager refresh paths:

- `client/src/pages/Manager/Dashboard.tsx`
- `client/src/pages/Manager/ExpenseRecords.tsx`
- `client/src/pages/Manager/FinancialReports.tsx`
- `client/src/pages/Manager/OrderHistoryPage.tsx`
- `client/src/pages/Manager/ShiftHandover.tsx`

These refresh functions now use `persistLocal: false` for cloud report snapshots. This prevents a local browser storage problem from blocking fresh cloud data from displaying.

Important: this does not change real record saves, such as creating expenses or saving shift handovers. Those still write through the existing save paths.

## Verification

Commands run:

```powershell
cd C:\Users\华为\Desktop\Restaurant_POS_Cloud_Clean\client
npm test -- --watchAll=false --runTestsByPath src/utils/dataSafety.test.ts --testNamePattern="manager cloud refresh snapshots"
npm run build

cd C:\Users\华为\Desktop\Restaurant_POS_Cloud_Clean
firebase deploy --only hosting
```

Results:

- Targeted regression test passed.
- Production build passed.
- Firebase Hosting deploy completed.
- Live bundle verified: `main.7d16674e.js`.

Production browser verification:

- Logged in with `zeng / 123456`.
- Opened and refreshed:
  - `/manager`
  - `/manager/expense-records`
  - `/manager/financial-reports`
  - `/manager/order-history`
  - `/manager/shift-handover`
- No refresh-failed dialogs appeared.
- No console errors were captured.
- Pages displayed fresh sync timestamps.

Screenshot evidence:

- `client/output/playwright/manager-refresh-after-cache-fix.png`

## Follow-Up

Many existing alerts still say "check network" for every caught error. A later reliability pass should classify errors into network, permission, local storage, and data format errors so the message matches the real cause.
