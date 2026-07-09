# 2026-07-01 POS Cancelled Partial Payment Display Fix

## Scope

Investigated order `0701024`, which appeared in the POS order list as `Cancelado` but still showed a partial-payment warning: `Pagado: C$235.00 / C$350.00 (falta C$115.00)`.

Business rule confirmed:

- Whole-order cancellation is a cancelled order.
- Item cancellation is equivalent to refunding/cancelling specific items.
- A cancelled whole order should not display the unpaid remainder as money still due.

## Cloud Data Finding

Firestore order `0701024` is valid historical data, not missing data:

- Store: `store_1776725610354` / Bluefields
- Document: `stores/store_1776725610354/pos_orders/order-1782947403791-z84bgc4by`
- Status: `cancelled`
- Payment status: `partial`
- Total: `C$350.00`
- Paid: `C$235.00`
- Cancelled remainder: `C$115.00`
- Created: `2026-07-01 17:10` Nicaragua time
- Cancelled: `2026-07-01 18:02` Nicaragua time
- Reason: recorded in cloud as a cancellation reason

## Root Cause

The POS order card mixed two separate concepts:

1. It displayed the order list time as the `Pedido` time. For cancelled orders that helper intentionally uses `cancelledAt` for sorting, so the card showed the cancellation time under `Pedido`.
2. It rendered the partial-payment banner for every partial order, including cancelled orders, so a cancelled whole order looked like it still had `falta C$115.00`.

## Fix

Changed `client/src/pages/POS/POS.tsx`:

- `Pedido` now shows the real order creation time.
- Cancelled orders show a `Cancelado` time field using `cancelledAt`.
- Whole-order cancellations with payment now show a cancellation summary:
  - `Cancelado: cobrado C$235.00 / anulado C$115.00`
- Partial-payment "falta" banner is hidden for cancelled orders.

Changed `client/src/utils/dataSafety.test.ts`:

- Added/updated regression coverage for cancelled order card timing.
- Added regression coverage to ensure cancelled whole orders do not show partial payment as still due.

## Verification

Commands run:

```powershell
cd C:\Users\华为\Desktop\Restaurant_POS_Cloud_Clean\client
npm test -- --watchAll=false --runTestsByPath src/utils/dataSafety.test.ts --testNamePattern="cancelled order list time|cancelled whole orders"
npm run build

cd C:\Users\华为\Desktop\Restaurant_POS_Cloud_Clean
firebase deploy --only hosting
```

Results:

- Targeted tests passed.
- Production build passed.
- Firebase Hosting deploy completed for `restaurant-pos-1b420`.
- Browser verified on production POS with `zeng / 123456`.

Production browser result for `0701024`:

- Shows `Pedido 17:10`.
- Shows `Cancelado 18:02`.
- Shows `Cancelado: cobrado C$235.00 / anulado C$115.00`.
- No longer shows `falta C$115.00`.
- No console errors were captured during this verification.

Screenshot evidence:

- `client/output/playwright/pos-cancelled-0701024-after-spacing.png`

## Notes

This fix only changes POS order-card semantics for cancelled whole orders. It does not rewrite historical Firestore data and does not change finance/report totals.
