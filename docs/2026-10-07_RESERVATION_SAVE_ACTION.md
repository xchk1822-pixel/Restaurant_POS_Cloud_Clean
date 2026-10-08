# Reservation Save Action

Date: 2026-10-07

## Scope

- Added an independent Save action for editable existing reservation orders.
- Button order is Print, Save, Confirm Order, followed by Split and Cancel Order.
- Save persists item, quantity, customer, amount, payment status, and delivery-date edits through the existing local-first order sync path.
- Save does not send items to the kitchen, print, deduct inventory, or change the order workflow status.
- Confirm Order keeps the existing kitchen send and print behavior.
- Ordinary Mesa, Barra, and Delivery order behavior is unchanged.
- The Save action is yellow only while the reservation has unsaved changes.
- After Save, the action changes to a pale-yellow locked state and cannot write again until the reservation changes.
- Restoring the original values also locks the action, avoiding unnecessary duplicate writes.

## Files

- `client/src/pages/POS/POS.tsx`
- `client/src/utils/dataSafety.test.ts`

## Verification

- Targeted data-safety test: 298 passed.
- Full test suite: 40 suites, 529 tests passed.
- Production build passed: `main.e2441922.js`.
- Follow-up locked-state build passed: `main.8cf034ae.js`.
- Local real-browser verification:
  - Reservation edits stay as a draft until Save is clicked.
  - Returning without Save keeps the original reservation data.
  - Ordinary orders do not show the Save action.
  - Existing reservations open with Save locked.
  - Editing an item enables the yellow Save action.
  - Saving locks it again; another edit enables it again.
- Production real-browser verification:
  - Existing reservation `1007010` showed Print, Save, Confirm Order in the required order.
  - Split and Cancel Order remained in their original row.
  - No order data was edited during the production check.
  - Browser console: 0 errors, 0 warnings.

## Deployment

- Firebase project: `restaurant-pos-1b420`
- Hosting: `https://restaurant-pos-1b420.web.app`
- Deployment completed successfully on 2026-10-07.
