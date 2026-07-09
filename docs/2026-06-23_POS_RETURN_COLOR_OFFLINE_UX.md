# 2026-06-23 POS Return, Status Color, And Completion UX Fix

## Scope

- Project: `C:\Users\华为\Desktop\Restaurant_POS_Cloud_Clean`
- Module: POS front desk ordering screen.
- Request:
  - If dishes are selected but not confirmed/sent to kitchen, returning to the main POS screen must clear those temporary items so staff can start a clean order.
  - Confirmed unpaid dine-in orders should show red on both table and order card.
  - Paid but not completed orders should show orange on both table and order card.
  - Completed/cleared orders should return to the natural table/card color.
  - Completion/clear-table success or weak-network failure messages must not block the cashier with browser alerts.

## Root Cause

- The POS return buttons each reset state manually. Some paths could leave unconfirmed temporary items in `currentItems`, and existing-order add-dish flows could keep unsent additions locally before staff confirmed the order.
- Table image status filters applied selected-table blue before occupied/paid table status colors, so an occupied table could look blue after returning to the overview.
- Completion and clear-table flows still used blocking `alert()` messages after async work. On weak networks this kept the POS screen trapped behind a browser modal.

## Changes

- Added `resetOrderEntryState`, `discardUnconfirmedOrderItems`, and `returnToOverviewFromOrder` in `client/src/pages/POS/POS.tsx`.
- All POS order-screen return buttons now call `returnToOverviewFromOrder`.
- Returning from an unconfirmed order:
  - clears temporary unsent items,
  - keeps already-confirmed/sent items,
  - resets local UI selection state,
  - does not create cloud orders or touch inventory.
- Table status image color priority now applies real order status before selected-table blue:
  - `occupied` -> red filter,
  - `needs_cleaning` -> orange filter,
  - `available` -> natural image.
- Added a small non-blocking POS toast for completion/clear-table results:
  - success: `Mesa liberada. Lista para nuevo cliente.` or `Pedido completado. Inventario descontado.`
  - error: `No se pudo sincronizar. Revise la red e intente de nuevo.`
- Replaced completion/clear-table result alerts with the toast; confirmation prompts remain unchanged.

## Offline And Time Scenarios

- This POS system must keep working in Nicaragua weak-network/offline conditions.
- Business time must mean the time when the restaurant action happened, not the later time when cloud sync succeeds.
- For POS orders:
  - `createdAt` = when the order is first confirmed/sent.
  - `lastPaidAt` / payment fields = when payment is taken.
  - `completedAt` / `clearedAt` = when staff completes or clears the order.
  - `cancelledAt` = when cancellation is authorized.
- Cloud retry/sync must preserve those business timestamps. It must not replace them with the sync retry time.
- UI display, filtering, and reports should use Nicaragua local date/time helpers (`getLocalDateString`, `formatNicaraguaTime`, `formatNicaraguaDateTime`) so day boundaries match the restaurant's local day.
- If a terminal is fully offline, staff must physically avoid operating the same order on multiple devices. When cloud returns, pending sync should keep the original local business time and surface conflicts instead of silently rewriting newer cloud state.
- This fix follows that principle for the touched flow:
  - returning from an unconfirmed order does not create a business timestamp or cloud record,
  - completion feedback no longer blocks the cashier while weak-network sync continues,
  - existing completion/payment/cancellation timestamp fields are left intact.

## Tests

- Added regression guards in `client/src/utils/dataSafety.test.ts`:
  - `POS returning from an unconfirmed order clears only unsent temporary items`
  - `POS completion feedback is non-blocking so weak network does not trap the cashier`
  - `POS table and order card colors use the same order lifecycle priority`
- Updated the empty-order return-button guard to expect the shared return handler.

## Verification

- RED verified first:
  - new targeted guards failed before implementation.
- GREEN verified:
  - `npm test -- --watchAll=false --runTestsByPath src/utils/dataSafety.test.ts -t "POS returning from an unconfirmed order|POS table and order card colors|POS completion feedback|POS table status changes the table image color"` passed.
  - `npm test -- --watchAll=false --runTestsByPath src/utils/dataSafety.test.ts` passed: 142 tests.
  - `npm run build` passed.

## Deployment

- Deployed Firebase Hosting only to project `restaurant-pos-1b420`.
- Hosting URL: `https://restaurant-pos-1b420.web.app`
- Browser verification:
  - Public login page loaded with 0 browser console errors.
  - Logged in as `zeng/123456`, opened `/pos`, and confirmed the POS page rendered `Mesas` and `Pedidos`.
  - Screenshot saved: `output/playwright/pos-return-color-offline-live-pos.png`.
  - Browser console showed 2 existing weak-network fallback logs for `menu_items` and `inventory_items`; the POS page still loaded through local cache.
