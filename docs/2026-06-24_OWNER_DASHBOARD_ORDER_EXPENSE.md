# 2026-06-24 Owner Dashboard Order And Expense Analytics

## Scope

- Updated the owner mobile dashboard only.
- Added Mesa / Barra / Delivery order split inside the Orders metric card.
- Added an Expense Ranking panel below Cost Summary.
- Removed the old Reminder panel from the owner dashboard.
- Kept the existing low-frequency manual refresh model; no realtime subscriptions were added.

## Data Behavior

- Owner dashboard now loads store-scoped `expense_categories` with the same manual refresh loop as orders, expenses, purchases, inventory, menu items, and employees.
- Expense ranking reuses `buildExpenseRankings` from `dashboardAnalytics.ts`, so it follows the same category and purchase-payment grouping rules as manager data overview.
- Order split uses `summarizeOwnerOrderTypes`, counting only orders with collected revenue:
  - `dine_in` or missing type -> Mesa
  - `takeout` -> Barra
  - `delivery` -> Delivery

## Changed Files

- `client/src/pages/Dashboard/OwnerDashboard.tsx`
  - Added expense category cache/loading.
  - Added order type split UI.
  - Added owner expense ranking panel.
  - Removed reminder calculation, styles, and panel.
- `client/src/utils/ownerDashboardData.ts`
  - Added `summarizeOwnerOrderTypes`.
- `client/src/utils/ownerDashboardData.test.ts`
  - Added regression coverage for Mesa / Barra / Delivery split.
- `client/src/utils/dataSafety.test.ts`
  - Added source guard for owner dashboard order split, expense ranking, `expense_categories` loading, and reminder removal.

## Verification

- Red tests first:
  - `ownerDashboardData.test.ts` failed before `summarizeOwnerOrderTypes` existed.
  - `dataSafety.test.ts` failed before owner dashboard rendered the new split/ranking structure.
- Green tests:
  - `npm test -- --watchAll=false --runTestsByPath src/utils/ownerDashboardData.test.ts -t "summarizes owner orders"`
  - `npm test -- --watchAll=false --runTestsByPath src/utils/dataSafety.test.ts -t "owner dashboard shows order type split"`
- Production build:
  - `npm run build`
  - Passed.
- Browser verification:
  - Local production build opened at `/dashboard`.
  - Logged in as `admin/admin123`.
  - Verified Orders card shows Mesa / Barra / Delivery.
  - Verified Expense Ranking panel renders below Cost Summary.
  - Verified Reminder panel is absent.
  - Browser console: 0 errors.
- Firebase deployment:
  - `firebase deploy --only hosting --project restaurant-pos-1b420`
  - Succeeded.
- Live browser verification:
  - Opened `https://restaurant-pos-1b420.web.app/dashboard`.
  - Logged in as `admin/admin123`.
  - Verified Orders card shows Mesa / Barra / Delivery.
  - Verified Expense Ranking panel renders below Cost Summary.
  - Verified Reminder panel is absent.
  - Browser console: 0 errors.

## Evidence

- `client/output/playwright/owner-dashboard-orders-expense-local.png`
- `client/output/playwright/owner-dashboard-orders-expense-live.png`

## Status

- Completed and deployed.
