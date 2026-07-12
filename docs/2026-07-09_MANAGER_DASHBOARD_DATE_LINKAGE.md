# Manager Dashboard Date Linkage Fix

Date: 2026-07-09

## Scope

Precision fix for the manager data overview date selector. No POS, inventory, purchase, employee, supplier, or customer business logic was changed.

## Problem

The month selector only refreshed the monthly sales calendar. KPI cards, sales rankings, expense rankings, comparisons, trends, and customer analysis still used the old dashboard range logic.

The toolbar also still exposed `近7天` and `近30天`, which no longer matched the requested workflow.

## Fix

- Kept only three dashboard range modes: `今日`, `自定义时间`, and `月度`.
- `月度` now normalizes to the selected full calendar month.
- The previous-period comparison for `月度` now uses the previous full calendar month.
- All analytics modules now use the same normalized range:
  - KPI cards
  - sales rankings
  - sales movement comparison
  - expense rankings
  - expense movement comparison
  - sales trend
  - customer analysis
  - monthly sales calendar
- The month picker is shown only in `月度`.
- The two date inputs are shown only in `自定义时间`.

## Verification

- `npm test -- --watchAll=false --runInBand src/utils/dashboardAnalytics.test.ts src/utils/dataSafety.test.ts`
  - 266 passed
- `npm run build`
  - compiled successfully
  - deployed bundle: `main.0da9e8be.js`
- `firebase deploy --only hosting`
  - deployed to `https://restaurant-pos-1b420.web.app`
- Production browser verification with Playwright:
  - logged in as store manager
  - opened `https://restaurant-pos-1b420.web.app/manager`
  - verified toolbar has `今日`, `自定义时间`, `月度`
  - verified `近7天` and `近30天` are gone
  - verified month mode shows the month input and keeps all main analytics sections rendered
  - verified custom mode shows two date inputs and hides the month input
  - verified no browser console errors during the checks

Screenshots:

- `client/output/playwright/manager-dashboard-date-linkage-verify.png`
- `client/output/playwright/manager-dashboard-custom-date-verify.png`
