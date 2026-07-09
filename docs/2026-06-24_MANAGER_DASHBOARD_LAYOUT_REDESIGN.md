# Manager Dashboard Layout Redesign

Date: 2026-06-24
Project: `Restaurant_POS_Cloud_Clean`
Module: Store Manager -> Data Overview

## Completed

- Reorganized the dashboard top summary into five KPI cards:
  - Revenue: includes cash and card amounts.
  - Orders: includes dine-in, Barra, and Delivery order counts.
  - Sales: includes sold quantity and product count.
  - Expense: includes purchase and operating expense totals.
  - Profit/Loss: shows the current profit/loss amount.
- Removed the separate middle business-type analysis block because those counts now live in the Orders KPI card.
- Grouped the dashboard into clearer commercial sections:
  - Sales Analysis: monthly sales calendar and product sales ranking.
  - Current vs Previous Period: sales movement on the left and expense movement on the right.
  - Expense Analysis: expense ranking/share and purchase item Top 10.
  - Customer Analysis: customer composition, peak hours, category preference, and VIP customers.
- Kept data source behavior unchanged:
  - No new realtime subscription was added.
  - Existing manual refresh and store-scoped dashboard reads remain in place.
  - Existing sales, expense, purchase, and customer analytics helpers remain the data source.
- Added/updated a source guard in `client/src/utils/dataSafety.test.ts` so future edits preserve the five-card grouped layout.

## Verification

- `npm test -- --watchAll=false --runTestsByPath src/utils/dataSafety.test.ts -t "five-card grouped overview|manager dashboard uses expense ranking analytics"`
  - Result: passed.
- `npm test -- --watchAll=false --runTestsByPath src/utils/dashboardAnalytics.test.ts`
  - Result: 10 tests passed.
- `npm run build`
  - Result: production build passed.
- Local browser verification:
  - Served production build at `http://localhost:52341`.
  - Logged in as `zeng / 123456`.
  - Confirmed Data Overview renders the five KPI cards and the Sales, Current-vs-Previous, Expense, and Customer sections.
  - Browser console error count: 0.
  - Screenshot: `client/output/playwright/manager-dashboard-layout-local.png`.

## Deployment

- Deployed Firebase Hosting:
  - Project: `restaurant-pos-1b420`.
  - Command: `firebase deploy --only hosting --project restaurant-pos-1b420`.
  - Hosting URL: `https://restaurant-pos-1b420.web.app`.
- Live browser verification:
  - Opened `https://restaurant-pos-1b420.web.app/manager`.
  - Logged in as `zeng / 123456`.
  - Confirmed the five KPI cards and grouped analysis sections render on the deployed build.
  - Browser console error count: 0.
  - Screenshot: `client/output/playwright/manager-dashboard-layout-live.png`.

## Next Planned Work

- Continue the system-wide cleanup and UI polish plan one module at a time.
- Avoid changing business storage or sync logic while doing UI-only dashboard improvements.
