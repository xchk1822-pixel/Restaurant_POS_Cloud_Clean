# 2026-07-05 Manager Dashboard Monthly Calendar UI Fix

## Scope
- Precise UI fix only for the manager dashboard monthly sales calendar.
- Touched:
  - `client/src/pages/Manager/Dashboard.tsx`
  - `client/src/utils/dataSafety.test.ts`

## Change
- Calendar daily sales amounts now use full currency display through `money(day.revenue)`.
- Removed the old compact `K` display from the calendar.
- Date number is centered at the top of each day cell.
- Removed the weekly total column and weekly total cells.
- Added stable markers:
  - `data-monthly-sales-calendar="true"`
  - `data-sales-ranking-panel="true"`

## Not Changed
- No data formulas changed.
- No order, expense, ranking, Firebase, POS, inventory, or financial report logic changed.
- Monthly calendar source data still comes from the existing `buildMonthlySalesCalendar` flow.

## Verification
- Red test before fix:
  - `npm test -- --runTestsByPath src/utils/dataSafety.test.ts --runInBand --watchAll=false --testNamePattern="monthly sales calendar uses full amounts"`
  - Failed because the calendar still lacked the new structure.
- Green test after fix:
  - Same command passed.
- Build:
  - `npm run build`
  - Result: compiled successfully.
- Deploy:
  - `npx firebase deploy --only hosting --project restaurant-pos-1b420`
  - Result: deployed to `https://restaurant-pos-1b420.web.app`.
- Real browser verification:
  - Logged in as `zeng`.
  - Opened `/manager`.
  - Confirmed monthly calendar exists.
  - Confirmed weekly total label is absent.
  - Confirmed no `C$...k` amount exists in the calendar.
  - Confirmed full `C$` amounts are present.
  - Confirmed calendar grid has 7 day columns.
  - Confirmed date number text alignment is `center`.
  - Loaded bundle: `main.845966ab.js`.
  - Console error count: 0.
