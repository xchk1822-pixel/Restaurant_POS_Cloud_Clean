# 2026-07-05 Financial Report Order Type Counts

## Scope

Precise fix for Manager > Financial Reports order column only.

Touched files:

- `client/src/pages/Manager/FinancialReports.tsx`
- `client/src/utils/financeMetrics.ts`
- `client/src/utils/financeMetrics.test.ts`
- `client/src/utils/dataSafety.test.ts`

No POS, inventory, employee, expense-category, or sync-service behavior was changed.

## Change

The financial report order field now includes collected order counts by front-of-house type:

- Mesa: `dine_in`
- Barra: `takeout`
- Delivery: `delivery`

The same formatter is used by:

- top order stat card
- report detail table order column
- A4 print summary and date rows

Cancelled whole orders and cancelled item counts stay in the same order field.

## Verification

- `npm test -- --runTestsByPath src/utils/financeMetrics.test.ts src/utils/dataSafety.test.ts --runInBand --watchAll=false`
  - Passed: 244 tests.

- `npm run build`
  - Passed.
  - Production bundle: `main.93642e1e.js`.

- `npx firebase deploy --only hosting --project restaurant-pos-1b420`
  - Deployed successfully.

- Production browser verification:
  - URL: `https://restaurant-pos-1b420.web.app/manager/financial-reports`
  - Loaded bundle: `/static/js/main.93642e1e.js`
  - Top order stat card contains `Mesa`, `Barra`, and `Delivery`
  - Report detail order column also contains `Mesa`, `Barra`, and `Delivery`
  - Browser console errors: 0.
