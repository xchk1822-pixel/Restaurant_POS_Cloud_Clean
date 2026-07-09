# 2026-07-02 POS Deleted Order Cache Fix

## Scope

- Issue: order `0702044` was deleted from Firestore and inventory was restored, but POS could still show it from the local browser cache.
- Store path checked: `stores/store_1776725610354/pos_orders`.

## Root Cause

- Firestore no longer had order `0702044`, but `store_store_1776725610354_pos_orders` in browser `localStorage` still had the old order.
- POS startup and app context could keep writing the stale in-memory order list back to local cache.
- Current-day order subscription needed an authoritative server refresh, not only local/IndexedDB realtime snapshots.
- POS order cache save effect was writing unchanged order arrays repeatedly, creating flicker risk and making stale cache harder to clear.

## Changes

- `client/src/services/smartSyncService.ts`
  - `smartSubscribeToPosOrdersByDatePrefix` now performs an initial `getDocsFromServer(orderQuery)` refresh for current-day POS orders.
  - Online Firestore cache-only snapshots are ignored for current-day POS orders.
  - Current-day local POS cache is replaced by the cloud snapshot while preserving pending offline order ids.

- `client/src/pages/POS/POS.tsx`
  - Startup `dataService.getData('pos_orders')` merge skips current-day non-pending cached orders.
  - POS order cache save effect now returns early when the order signature has not changed, reducing repeated `pos_orders` writes.

- `client/src/utils/dataSafety.test.ts`
  - Added/updated regression checks for deleted cloud orders not reappearing from startup cache.
  - Added checks for current-day server refresh and duplicate cache-save prevention.

## Verification

- Firestore check: `0702044` matches `0`.
- Targeted tests: `npm test -- --runTestsByPath src/utils/dataSafety.test.ts --runInBand --watchAll=false`
  - Result: 226 passed.
- Build: `npm run build`
  - Result: compiled successfully.
- Deployment: `npx firebase deploy --only hosting`
  - Hosted bundle: `main.c2fd0066.js`.
- Real browser proof:
  - Logged in as `zeng`.
  - Injected stale local cache order `0702044`.
  - Reloaded POS production page.
  - Result: `visible0702044: false`, local cache match count `0`, browser console errors `0`.

## Notes

- During verification, live production orders continued to be created by the store, so total order counts changed naturally.
- Cache writes dropped from roughly 597 writes in 90 seconds during diagnosis to 11 writes in 35 seconds after the save-signature guard.
- If a deleted order still appears on a device, first hard refresh that browser. The deployed code should then replace current-day local cache from Firestore server data.
