# POS Empty Order Return Fix

Date: 2026-06-22 Nicaragua local time

## Problem

When entering POS ordering mode and no dish had been selected, the current order panel only showed `Sin pedido`. There was no visible way to return to the table/order overview, so staff could get stuck unless they selected an item or used another indirect navigation path.

## Change

- Updated `client/src/pages/POS/POS.tsx`.
- Added a visible `← Volver` button inside the empty order state.
- The button only resets current POS UI selection state:
  - view mode back to `overview`
  - current items cleared
  - selected order/table/customer cleared
  - service fee, tax, delivery fee, and tender fields reset
  - order type reset to `dine_in`
- No cloud writes, inventory writes, order creation, or payment logic were changed.

## Regression Guard

- Added `POS empty order state keeps a visible return action to overview` in `client/src/utils/dataSafety.test.ts`.
- Verified RED first: the test failed before the empty-state marker and return action existed.

## Verification

- `npm test -- --watchAll=false --runTestsByPath src/utils/dataSafety.test.ts -t "POS empty order state keeps"` passed.
- `npm test -- --watchAll=false --runTestsByPath src/utils/dataSafety.test.ts` passed: 137 tests.
- `npm run build` passed.
- `firebase deploy --only hosting` completed for project `restaurant-pos-1b420`.
- Browser smoke test on `https://restaurant-pos-1b420.web.app`:
  - logged in as `zeng`
  - opened POS
  - selected a table and skipped customer selection
  - confirmed empty order panel showed `Sin pedido` and `← Volver`
  - clicked `← Volver` and returned to `Mesas` / `Pedidos`
  - order count stayed unchanged during this verification
  - browser console showed 0 errors

## Next

Continue the cancelled/no-table order investigation after this UI blocker. A read-only audit script exists at `client/scripts/auditPosOrderAnomalies.mjs`.
