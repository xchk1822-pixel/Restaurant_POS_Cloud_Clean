# 2026-07-03 POS Sync Edit Rollback and 0702054 Check

## Scope

- Official project only: `C:\Users\华为\Desktop\Restaurant_POS_Cloud_Clean`.
- Production site: `https://restaurant-pos-1b420.web.app`.
- Reported symptom: order `0702054` had reportedly been completed about half an hour earlier, but the current device still showed it as pending/not completed.

## Cloud Evidence

- Firestore path checked: `stores/store_1776725610354/pos_orders`.
- Query by `orderNumber == "0702054"` found document `order-1783039052540-d2se57268`.
- Cloud state at read time:
  - `status = confirmed`
  - `paymentStatus = unpaid`
  - `paidAmount = 0`
  - `settledAmount = 0`
  - no `completedAt`
  - no `clearedAt`
  - `updateTime = 2026-07-03T00:37:36.639479Z`
- Real browser localStorage after production login also showed the same `confirmed/unpaid` state for `0702054`.

Conclusion: `0702054` was not a browser display-only refresh problem. The cloud order itself did not contain a completed state.

## Root Cause Fixed in Code

- The previous 2026-07-03 frontend change incorrectly made normal POS item edits publish active orders immediately.
- That introduced `syncEditableOrderItems`, which added the order id to `pos_pending_order_sync` and called `publishOrderImmediately` from add/remove/quantity/cancel-item paths.
- This violated the POS sync boundary: normal local item editing should remain local until an explicit business action such as send to kitchen, payment, cancel, or complete.

## Changes

- `client/src/pages/POS/POS.tsx`
  - Removed `syncEditableOrderItems`.
  - Removed the item-edit paths that marked active orders pending and immediately published them.
  - Removed the pricing-state helper references introduced by the same change.
  - Kept the 2026-07-02 current-day cloud cache protections intact.
- `client/src/utils/dataSafety.test.ts`
  - Removed the incorrect tests that required immediate publish on item edits.
  - Added regression coverage that POS item edits must not call `publishOrderImmediately` or add pending sync ids before an explicit business action.
- Removed the incorrect archive:
  - `docs/2026-07-03_POS_FRONTEND_ORDER_EDIT_STABILITY_FIX.md`

## Verification

- Targeted regression test:
  - `npm test -- --runTestsByPath src/utils/dataSafety.test.ts --runInBand --watchAll=false`
  - Result: `227 passed`.
- Production build:
  - `npm run build`
  - Result: compiled successfully.
  - Bundle: `main.9e30d433.js`.
- Firebase Hosting deploy:
  - `npx firebase deploy --only hosting --project restaurant-pos-1b420`
  - Result: deploy complete.
- Production bundle check:
  - `bundle=main.9e30d433.js`.
- Real browser POS smoke:
  - `npm run verify:pos-smoke -- --password 123456 --username zeng --url https://restaurant-pos-1b420.web.app --channel msedge`
  - Result: POS loaded, `hasMesas=true`, `hasPedidos=true`, `errorCount=0`, bundle `/static/js/main.9e30d433.js`.

## Notes

- This deployment prevents the 2026-07-03 edit-publish regression from continuing.
- It does not automatically rewrite `0702054`. That order remains `confirmed/unpaid` in cloud and requires explicit business confirmation before any production data repair, because changing it to completed would affect real order/inventory state.
