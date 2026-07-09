# 2026-06-29 POS current-day order subscription cost optimization

## Goal

Reduce Firestore daily reads for multi-device POS use without reintroducing automatic polling.

## Change

The global app order realtime subscription no longer listens to the full `pos_orders` collection.

New behavior:
- POS shared order state subscribes only to current Nicaragua business-day orders by `orderNumber` prefix.
- Prefix format remains `MMDD`, matching the existing daily order number format such as `0629xxx`.
- Historical orders remain in local cache and historical order/report screens can still load them through their existing snapshot reads.
- No 15-second cloud polling was added.
- A local-only 60-second date check updates the subscription after midnight if the POS page stays open. This only checks local time and does not read Firestore.

## Files

- `client/src/contexts/AppContext.tsx`
  - Replaced full-history realtime `pos_orders` subscription with `smartSubscribeToPosOrdersByDatePrefix(todayOrderPrefix, ...)`.
  - Uses `getLocalDateString()` so the date follows Nicaragua time.
- `client/src/services/smartSyncService.ts`
  - Added `smartSubscribeToPosOrdersByDatePrefix(datePrefix, callback)`.
  - Uses Firestore range query:
    - `where('orderNumber', '>=', datePrefix)`
    - `where('orderNumber', '<=', `${datePrefix}\uf8ff`)`
    - `orderBy('orderNumber', 'asc')`
  - Does not overwrite the full local `pos_orders` cache with only today's orders.
- `client/src/utils/dataSafety.test.ts`
  - Added regression guard so AppContext cannot silently return to full-history order realtime reads.
  - Updated existing AppContext subscription guard.

## Firestore Usage Impact

Before:
- Each POS-capable device opening the app could initially read the full store `pos_orders` collection.
- Current Bluefields store had about 1,268 order documents, so two devices could spend about 2,536 reads just on initial POS order subscription.

After:
- Each POS-capable device initially reads only current-day orders.
- On the verified day, current-day count was 43 orders, so two devices read about 86 order documents for initial POS order subscription.
- At 100 orders/day, initial POS order subscription cost is roughly 100 reads per device instead of growing with all historical orders.

## Verification

Commands:
- `npm test -- --runTestsByPath src/utils/dataSafety.test.ts --watchAll=false -t "app context subscribes only to current-day POS orders"`
- `npm test -- --runTestsByPath src/utils/dataSafety.test.ts --watchAll=false -t "app context keeps only active orders realtime|app context subscribes only to current-day POS orders|POS cloud completed or cancelled order state overrides|smart sync normalizes POS orders|POS right order list hides empty"`
- `npm run build`
- `firebase deploy --only hosting --project restaurant-pos-1b420`

Results:
- Targeted new test passed.
- Related 5-test regression set passed.
- Production build succeeded with bundle `main.9c16fc9a.js`.
- Firebase Hosting deployment completed.
- Production HTML returns HTTP `200` and references `main.9c16fc9a.js`.
- Production JS contains current-day range query markers and no longer contains full-history `smartSubscribeToCollection('pos_orders')`.
- Production JS does not contain `15000`, confirming the removed 15-second fallback did not return.
- Browser verification logged in as `zeng`, opened `/pos`, displayed current POS state, and reported no console errors or warnings.

## Status

Completed and deployed.
