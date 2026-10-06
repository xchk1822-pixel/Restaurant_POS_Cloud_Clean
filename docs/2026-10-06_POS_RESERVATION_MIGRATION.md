# POS Reservation Workflow Migration

Date: 2026-10-06

## Scope

This change migrates the proven reservation workflow from the Xing Long project into the active Restaurant POS project without modifying or deploying Xing Long.

## Business Rules

- Reservation is the fourth POS order type beside dine-in, takeout, and delivery.
- A reservation has an editable planned delivery date.
- It can be unpaid, partially paid, or fully paid before delivery.
- Staff can reopen the reservation and add more items.
- Only items explicitly sent to the kitchen are printed on kitchen tickets.
- Reservation receipts include the planned delivery date.
- Pre-delivery payments are cash-flow receipts only and do not count as sales.
- Sales revenue and inventory deduction occur only when staff confirms actual delivery completion.
- The financial date is the actual completion date (`completedAt`), never the planned delivery date.
- The financial-report cash-handover card includes its difference; the replaced card shows reservation prepayments.

## Data And Sync

- Reservation orders remain in the existing `pos_orders` collection and existing store isolation.
- `reservationOpen` keeps active reservations in the realtime subscription.
- `reservationClosedDate` keeps reservations completed or cancelled today in the bounded subscription.
- The client keeps the existing local-first pending-sync protection and can recover missing reservation details by document ID.
- Reservation confirmation has a processing lock to prevent repeated clicks from requesting multiple order numbers.

## Verification

- Focused automated tests: 36 passed.
  - `financeMetrics.test.ts`
  - `receiptPrinter.test.ts`
  - `orderCreationIntegration.test.ts`
- Full regression suite: 496 passed out of 523 tests. The remaining 27 failures are in three pre-existing source-string assertion suites (`dataSafety`, `translations`, and `employeeOperationPersistence`) and are outside this reservation migration. They were not papered over with unrelated production-code changes.
- Production build: passed (`main.eb004ec7.js`).
- Real browser verification at `http://localhost:52341`:
  - Chinese POS shows the fourth `预订` order filter and planned-delivery date.
  - Spanish POS shows `Reserva`.
  - Financial reports show `预订预收款` / `Anticipos de reservas`.
  - Cash handover shows the shift difference in the same card.
  - Browser console: 0 errors and 0 warnings.
- Firebase Hosting deployment: completed for `restaurant-pos-1b420` only.
- Production browser verification at `https://restaurant-pos-1b420.web.app`:
  - Logged in with the existing Bluefields store-manager account.
  - Reservation filter and planned-delivery date rendered from `main.eb004ec7.js`.
  - Financial data completed cloud synchronization and showed the reservation prepayment card.
  - No production test order or inventory mutation was created.
- Screenshots:
  - `output/playwright/pos-reservation-filter.png`
  - `output/playwright/pos-reservation-spanish.png`
  - `output/playwright/financial-reservation-prepayment.png`
  - `output/playwright/production-pos-reservation.png`
  - `output/playwright/production-financial-reservation.png`

## Recovery

- Pre-change safety branch: `archive/pre-reservation-2026-10-06`
- Baseline commit: `427e7c1`
