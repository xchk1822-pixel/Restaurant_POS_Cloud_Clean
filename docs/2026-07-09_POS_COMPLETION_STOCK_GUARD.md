# 2026-07-09 POS Completion Stock Guard

## Scope

Precise P0 fix only. No historical inventory restore was performed because stock was already corrected by stocktake.

## Changes

- POS completion now still attempts stock deduction when the completed-order cloud publish is queued locally.
- POS completion checks existing stock ledger rows before claiming stock deduction, so retrying an order with sale records does not double deduct.
- Zero-amount cancelled POS orders remain visible and show `Pedido anulado`.

## Verification

- `npm test -- --watchAll=false --runInBand src/utils/dataSafety.test.ts`
- `npm run build`
- `firebase deploy --only hosting`
- Browser smoke on production `https://restaurant-pos-1b420.web.app/pos`: login succeeded, `Mesas` and `Pedidos` rendered, console error count was 0, bundle `main.62ee5ffd.js`.
