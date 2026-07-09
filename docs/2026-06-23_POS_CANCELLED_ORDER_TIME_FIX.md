# 2026-06-23 POS Cancelled Order Time Fix

## Issue

The user reported that a cancelled POS order showed the current time and appeared to keep changing.

Live Firestore audit found the affected Bluefields order:

- Order id: `order-1782184672149-bqkbn459o`
- Status: `cancelled`
- Order number: missing, shown as `#N/A`
- Table: missing
- Total: `C$0.00`
- Items: `4`
- Cancel reason: `8UN8U8U`
- `createdAt`: missing
- `preparingAt`: missing
- `cancelledAt`: `2026-06-23T03:55:50.606Z`, Nicaragua local `2026-06-22 21:55:50`
- `lastModified`: `2026-06-23T05:44:58.959Z`, Nicaragua local `2026-06-22 23:44:58`

## Root Cause

The POS order list used this fallback for the displayed order time:

`createdAt || preparingAt || completedAt || lastModified`

For malformed cancelled orders that were missing `createdAt` and `preparingAt`, the UI fell back to `lastModified`. Sync operations can rewrite `lastModified`, so the visible order time looked like the current sync time instead of the cancellation time.

During browser verification, the live page also exposed a related console failure:

`RangeError: Invalid time value`

This came from serializing old invalid `Date` objects through `.toISOString()`.

## Fix

Changed `client/src/pages/POS/POS.tsx`:

- Added `getOrderListTimeValue(order)`.
- Cancelled orders now display and filter by `cancelledAt` first, then `createdAt`, `preparingAt`, and `updatedAt`.
- Non-cancelled orders still use normal business time order, but avoid using `lastModified` unless no better business timestamp exists.
- Added `serializeDateForFirestore(value)` so invalid `Date` objects are omitted instead of throwing during Firestore sync.
- Updated `serializeOrderForFirestore(order)` to use the date serializer for all POS order date fields.

## Regression Tests

Added guards in `client/src/utils/dataSafety.test.ts`:

- `POS cancelled order list time uses cancellation time instead of mutable sync time`
- `POS order serialization skips invalid Date objects instead of throwing toISOString errors`

## Verification

Commands run:

- `npm test -- --watchAll=false --runTestsByPath src/utils/dataSafety.test.ts -t "cancelled order list time"`
- `npm test -- --watchAll=false --runTestsByPath src/utils/dataSafety.test.ts -t "invalid Date objects"`
- `npm test -- --watchAll=false --runTestsByPath src/utils/dataSafety.test.ts`
- `npm run build`
- `firebase deploy --only hosting --project restaurant-pos-1b420`
- `node client/scripts/auditPosOrderAnomalies.mjs --username admin --password admin123 --hours 72`
- `node client/scripts/verifyLivePosCancelledOrderTime.mjs`

Results:

- Data safety tests: `139 passed`
- Production build: passed
- Firebase Hosting deploy: passed
- Live browser verification: passed
- The affected cancelled order renders as `Cancelado`, `Pedido 21:55`
- Browser console had `0` errors during the final verification
- No `Invalid time value` / `.toISOString()` error remained

## Notes

The final browser verification mocks the page clock to `2026-06-22T23:58:00-06:00` only for verification, because the real Nicaragua time had already crossed midnight to `2026-06-23`. POS intentionally shows only today's orders; after midnight, the June 22 cancelled order correctly leaves the POS "today" list and belongs in history/report views.
