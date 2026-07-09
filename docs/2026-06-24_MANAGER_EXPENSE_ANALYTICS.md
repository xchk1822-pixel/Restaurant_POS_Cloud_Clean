# Manager Dashboard Expense Analytics - 2026-06-24

## Scope

Store Manager -> Data Overview now has professional expense analytics alongside the existing sales ranking analytics.

## Completed

- Added expense ranking analytics in `client/src/utils/dashboardAnalytics.ts`.
- Added `buildExpenseRankings`:
  - Purchase-related expenses are grouped by supplier or purchase order fallback.
  - Operating expenses are grouped by expense parent / child category path.
  - Rankings include amount, count, average amount, and amount share.
  - Filters support all expenses, operating expenses, purchase payments, amount sort, count sort, and Top 10/20/50.
- Added `buildExpenseRankingComparison`:
  - Compares the selected period against the previous equal-length period.
  - Shows increased and decreased spend by amount or count.
- Updated `client/src/pages/Manager/Dashboard.tsx`:
  - Reads `expense_categories` from Firestore during manual refresh.
  - Stores expense categories in store-scoped localStorage through `dataService.getStoreKey('expense_categories')`.
  - Replaced the old daily expense category list with a three-panel analytics section:
    - Expense ranking and share.
    - Expense movement compared with previous period.
    - Purchase item Top 10 from purchase-order details.
  - Kept low-frequency behavior: manual refresh only, no realtime subscription.
- Added regression guards:
  - `client/src/utils/dashboardAnalytics.test.ts`
  - `client/src/utils/dataSafety.test.ts`

## Verification

- `npm test -- --watchAll=false --runTestsByPath src/utils/dashboardAnalytics.test.ts`
  - 10 tests passed.
- `npm test -- --watchAll=false --runTestsByPath src/utils/dataSafety.test.ts -t "manager dashboard uses expense ranking analytics"`
  - 1 targeted test passed.
- `npm run build`
  - Production build passed.
- Local browser verification:
  - Served production build on `http://localhost:52341`.
  - Logged in as `zeng/123456`.
  - Confirmed Store Manager -> Data Overview renders `开支排行与占比`, `开支变化`, and `采购物品 Top 10`.
  - Browser console had 0 errors.
  - Screenshot: `client/output/playwright/manager-expense-analytics-local.png`.
- Firebase deployment:
  - `firebase deploy --only hosting --project restaurant-pos-1b420`
  - Hosting URL: `https://restaurant-pos-1b420.web.app`.
- Live browser verification:
  - Logged in as `zeng/123456`.
  - Confirmed the deployed Data Overview renders the new expense analytics modules.
  - Browser console had 0 errors.
  - Screenshot: `client/output/playwright/manager-expense-analytics-live.png`.

## Notes

- This change does not alter POS, inventory, purchase submission, supplier repayment, or financial report write logic.
- Expense category caching follows the same store-scoped localStorage pattern already used by Expense Records and Financial Reports.
- The old `expenseByCategory` temporary dashboard summary is removed from the manager dashboard.
