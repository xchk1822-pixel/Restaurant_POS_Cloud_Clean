# POS Pending Completion Echo Guard - 2026-06-26

## Problem

Order `0626031` was completed on terminal A, but terminal B kept showing the order as paid and awaiting completion. Manual refresh did not fix it. Later orders could still sync, so the realtime order listener itself was not fully broken.

## Evidence

Firestore showed the order in store `store_1776725610354` as:

- `orderNumber`: `0626031`
- `status`: `served`
- `paymentStatus`: `paid`
- `orderType`: `takeout`
- no `completedAt`
- no `clearedAt`
- no `stockDeducted`
- no `stockDeductionOperationId`

This means the cloud document never reached the terminal `completed` state. Device B was correctly showing what cloud had.

## Root Cause

The previous weak-network fix kept locally completed orders in `pendingOrderSyncIdsRef` when cloud publishing returned pending.

The remaining bug was in the POS global order merge effect:

- A terminal could complete an order locally and queue it for cloud retry.
- Before the retry succeeded, the app could receive an older cloud snapshot for the same order, still `served/paid`.
- The merge effect then updated `publishedOrderSignaturesRef` and deleted `pendingOrderSyncIdsRef` for every merged order.
- That could cancel the retry marker for the locally completed order before cloud echoed the same completed state.

Result: the order looked completed on terminal A but remained `served/paid` in Firestore, so terminal B could never refresh to completed.

## Fix

`client/src/pages/POS/POS.tsx` now builds `incomingById` for global order updates and only clears a pending order ID when cloud has echoed the exact same order signature that the POS is keeping locally.

If cloud still has an older state, the local pending marker is preserved so automatic retry can continue.

## Verification

Commands run from `client`:

```powershell
npm test -- --watchAll=false --runTestsByPath src/utils/dataSafety.test.ts -t "POS global order updates|POS order publisher does not mark pending|POS cancel and complete actions publish terminal"
```

Result: 4 targeted POS sync tests passed.

```powershell
npm run build
```

Result: production build compiled successfully.

Full `dataSafety.test.ts` still has unrelated pre-existing string/assertion failures outside this POS sync fix.

## Deployment

Deployed Firebase Hosting only to project `restaurant-pos-1b420`.

Hosting URL: `https://restaurant-pos-1b420.web.app`

