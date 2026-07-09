# 2026-07-02 POS real UI sync fix

## Scope

Fix POS multi-terminal lifecycle sync where a newly created order appeared quickly on another device, but later payment or completion state could arrive several minutes late or appear step-by-step.

## Root cause

Old async POS order writes could arrive after newer lifecycle writes. The old payload was being re-stamped with fresh sync metadata, so Firestore could accept a stale state such as `confirmed/unpaid` or `served/paid` after another terminal had already written `completed/paid`.

Realtime subscription was receiving cloud changes, but the cloud state itself could be regressed by stale pending writes. Later pending retries could replay the newer state, which looked like a network delay.

## Fix

- `smartUpdateDocument` now treats `pos_orders` lifecycle as monotonic.
- Local writes cannot downgrade a locally newer order lifecycle state.
- Cloud writes for `pos_orders` use a Firestore transaction.
- The transaction reads the current remote order and skips stale lifecycle-regressing writes.
- Pending POS order updates are coalesced so only the latest update per order is replayed.

## Verification

- `npm test -- --runTestsByPath src/utils/dataSafety.test.ts --runInBand --watchAll=false`
  - Passed: 223 tests.
- `npm run build`
  - Passed.
  - Bundle: `main.9b8f8e2a.js`.
- `firebase deploy --only hosting`
  - Passed.
  - Hosting: `https://restaurant-pos-1b420.web.app`.
- `npm run verify:pos-smoke -- --url https://restaurant-pos-1b420.web.app --username zeng --password 123456 --channel msedge`
  - Passed.
  - Confirmed live bundle: `main.9b8f8e2a.js`.

## Real browser A/B test

Live URL: `https://restaurant-pos-1b420.web.app`

### Barra flow

1. A terminal logged in as `zeng`.
2. B terminal logged in as `zeng`.
3. A created a Barra test order with `extra salsa`.
4. B observed the same order card.
5. A paid the order.
6. B observed paid state.
7. A clicked `Retirado en barra` and accepted the confirmation.
8. B observed completed state.
9. Waited another 5 seconds to ensure the order did not regress.
10. Test order was deleted from Firestore.

Result:

- Test order: `0702038`.
- B saw confirmed state in `10 ms`.
- B saw paid state in `4 ms`.
- B saw completed state in `3 ms`.
- After 5 seconds B still showed `Completado`.
- Cloud final state before cleanup: `status=completed`, `paymentStatus=paid`, `totalAmount=10`, `version=3`.
- Cleanup deleted test order document `order-1783033306584-vppg56bid`.

### Mesa table flow

Test item: `Extra Arroz Blanco`.

Flow:

1. A terminal logged in as `zeng`.
2. B terminal logged in as `zeng`.
3. A selected Mesa 2.
4. A created a dine-in order.
5. B observed the same order card.
6. A paid the order.
7. B observed paid state.
8. A clicked Mesa 2 and selected `Liberar mesa`.
9. B observed completed state.
10. Cloud table state was checked after completion.
11. Test order was deleted from Firestore.

Result:

- Test order: `0702039`.
- B saw confirmed state in `5 ms`.
- B saw paid state in `3 ms`.
- B saw completed state in `2 ms`.
- After 5 seconds B still showed `Completado`.
- Cloud final state before cleanup: `status=completed`, `paymentStatus=paid`, `orderType=dine_in`, `tableNumber=2`, `totalAmount=25`, `version=3`.
- Mesa 2 cloud state after clear: `status=available`, `currentOrderId=""`.
- Cleanup deleted test order document `order-1783033988349-y5p2h8vc0`.

### Mesa 90-second regression monitor

Because the reported production symptom was a delayed rollback or delayed state progression, a second Mesa test kept the completed order visible for 90 seconds before cleanup.

Result:

- Test order: `0702040`.
- B saw confirmed state in `9 ms`.
- B saw paid state in `786 ms`.
- B saw completed state in `515 ms`.
- B was sampled every 10 seconds for 90 seconds.
- All samples stayed `Completado`.
- Regression count: `0`.
- Cloud final state before cleanup: `status=completed`, `paymentStatus=paid`, `totalAmount=25`, `version=3`.
- Cleanup deleted test order document `order-1783034099018-gngchasye`.

### Delivery flow

Test item: `Extra Arroz Blanco`.

Flow:

1. A terminal logged in as `zeng`.
2. B terminal logged in as `zeng`.
3. A selected `Delivery`.
4. A created a delivery order.
5. B observed the same order card.
6. A paid the order.
7. B observed paid state.
8. A clicked `Delivery completado`.
9. B observed completed state.
10. B was sampled every 10 seconds for 60 seconds.
11. Test order was deleted from Firestore.

Result:

- Test order: `0702043`.
- B saw confirmed state in `10 ms`.
- B saw paid state in `535 ms`.
- B saw completed state in `527 ms`.
- All 60-second monitor samples stayed `Completado`.
- Regression count: `0`.
- Cloud final state before cleanup: `status=completed`, `paymentStatus=paid`, `orderType=delivery`, `deliveryType=self`, `deliveryFee=0`, `totalAmount=25`, `version=2`.
- Cleanup deleted test order document `order-1783034713801-6s6v93nvq`.

### Three order types covered

- `Mesa`: verified with table release and cloud table returning to `available`.
- `Barra`: verified with `Retirado en barra`.
- `Delivery`: verified with `Delivery completado`.

## Notes

- A previous test order residue `0702031` was found and deleted before deployment verification.
- Delivery payment testing must fill the cash input after the delivery fee field; the first number input on a Delivery order is `Costo de envío`, not `Efectivo C$`.
- The verified root cause was stale lifecycle writes, not Firestore realtime listener delay.
- Do not validate this problem with direct Firestore writes only; validation must use the real POS UI flow.
