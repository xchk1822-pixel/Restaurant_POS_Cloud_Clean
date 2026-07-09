# POS Order Terminal Sync Retry Fix - 2026-06-24

## Problem

When device A completed or cleared an order, device A could return to the normal table state, but device B did not update. Manual refresh on device B still showed the old order state in some cases.

This was not only a network-delay symptom. The POS publish path could mark an order as synced even when the cloud write had fallen back to local pending storage.

## Root Cause

- `completeOrderWithStockDeduction` publishes terminal order changes through `queueOrderPublish`.
- `publishOrderImmediately` called `smartUpdateDocument('pos_orders', ...)`.
- `smartUpdateDocument` could fall back to local pending storage when Firestore failed, timed out on weak network, or was offline.
- The old return value did not distinguish a real cloud write from a local pending fallback.
- `publishOrderImmediately` then updated `publishedOrderSignaturesRef` and removed the order from `pendingOrderSyncIdsRef`.
- Result: device A looked completed locally, but the change could be absent from Firestore. Device B could not see it, even after manual refresh, because there was nothing new in the cloud yet.

## Changes

- Added explicit `SmartWriteResult` from `smartUpdateDocument`.
- Cloud write success now returns `{ success: true, cloudSynced: true }`.
- Weak-network or Firestore failure fallback now returns `{ success: false, pending: true, weakNetworkFallback: ... }`.
- Offline fallback now returns `{ success: true, pending: true, offline: true }`.
- Wrapped Firestore `setDoc(..., { merge: true })` updates in `withWeakNetworkTimeout` so weak network is handled consistently.
- Added a pending-sync retry scheduler:
  - first retry after 3 seconds,
  - continued retries every 10 seconds while pending changes remain.
- Changed POS order publisher so pending or failed cloud writes are not marked as published and the pending order ID is not cleared.

## Expected Behavior

- If device A is online and the cloud write succeeds, device B should receive the terminal order state through the existing realtime listener.
- If device A is on weak network and the cloud write fails or times out, the order remains pending locally and retries automatically instead of being silently treated as synced.
- If device A is fully offline, device B cannot receive that local-only change until device A reconnects and the pending write reaches Firestore. This is a physical limit of offline operation.

## Verification

Commands run from `client`:

```powershell
npm test -- --watchAll=false --runTestsByPath src/utils/dataSafety.test.ts --testNamePattern="POS order publisher|smart update returns pending"
```

Result after fix: 2 tests passed.

```powershell
npm test -- --watchAll=false --runTestsByPath src/utils/dataSafety.test.ts --testNamePattern="POS cancel and complete|pending sync|smart sync weak-network|POS completion|POS table status|POS cloud terminal|smart update uses Firestore|POS order publisher|smart update returns pending"
```

Result after fix: 12 tests passed.

```powershell
npm run build
```

Result: production build compiled successfully.

## Files Changed

- `client/src/services/smartSyncService.ts`
- `client/src/pages/POS/POS.tsx`
- `client/src/utils/dataSafety.test.ts`

## Deployment

Deployed Firebase Hosting only to project `restaurant-pos-1b420`.

Hosting URL: `https://restaurant-pos-1b420.web.app`
