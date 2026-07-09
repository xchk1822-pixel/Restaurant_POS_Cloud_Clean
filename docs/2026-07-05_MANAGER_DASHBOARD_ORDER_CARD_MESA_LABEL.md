# 2026-07-05 Manager Dashboard Order Card Mesa Label

## Scope
- Precise UI text fix only.
- Touched:
  - `client/src/pages/Manager/Dashboard.tsx`
  - `client/src/utils/dataSafety.test.ts`

## Change
- In manager data overview top KPI order card, changed the dine-in label from `堂食` to `Mesa`.
- Did not change order calculations, filters, data loading, POS, inventory, finance formulas, or cloud sync logic.

## Regression Guard
- Updated the five-card dashboard regression test to inspect the `orders` KPI card block specifically.
- The test now requires `Mesa ${stats.dineInOrders}` and rejects `堂食 ${stats.dineInOrders}` inside that card.

## Verification
- Red test before fix:
  - `npm test -- --runTestsByPath src/utils/dataSafety.test.ts --runInBand --watchAll=false --testNamePattern="manager dashboard presents the requested five-card"`
  - Failed because the order KPI card still contained `堂食`.
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
  - Read `[data-kpi-card="orders"]`.
  - Text showed `Mesa 0 / Barra 0 / Delivery 0 / 取消 0 / 取消菜品 0`.
  - `堂食` was not present in the order card.
  - Loaded bundle: `main.3277406b.js`.
  - Console error count: 0.
