# 2026-06-22 Fridge Transfer Warehouse Cache Fix

## Problem

Fridge transfer showed success, but the warehouse `currentStock` could still display the old value afterward.

## Root Cause

The fridge transfer screen already called `smartIncrementField('inventory_items', item.id, 'currentStock', -transferQuantity, ...)` before increasing `fridge_inventory`.

The bug was lower in `smartIncrementField`:

- Firestore increment success returned immediately without updating the store-scoped local cache.
- Weak-network fallback updated only existing local documents and did not append a missing increment target document.

That meant cloud data could be correct while the local browser cache still showed the pre-transfer warehouse quantity until a fully authoritative refresh replaced it.

## Completed

- Added `applyIncrementToLocalStorage` in `client/src/services/smartSyncService.ts`.
- Cloud increment success now updates the local cache before returning success.
- Weak-network fallback now uses the same local increment helper.
- Missing increment target documents are appended locally instead of silently dropping the local update.
- Added a regression guard in `client/src/utils/dataSafety.test.ts`.

## Verification

- RED confirmed first: the new guard failed before `smartIncrementField` updated local cache after cloud success.
- GREEN: `npm test -- --watchAll=false --runTestsByPath src/utils/dataSafety.test.ts -t "smart increment keeps local cache"` passed.
- Full guard: `npm test -- --watchAll=false --runTestsByPath src/utils/dataSafety.test.ts` passed, 136 tests.
- Build: `npm run build` passed.
- Deploy: `firebase deploy --only hosting` completed for Firebase project `restaurant-pos-1b420`.
- Browser smoke: `https://restaurant-pos-1b420.web.app` loaded to the login page with 0 console errors. Screenshot saved at `output/playwright/fridge-transfer-cache-fix-live.png`.

## Notes

No real production fridge transfer was performed during verification because it would mutate live inventory. Existing incorrect quantities from earlier operations still need correction through stocktake/manual reconciliation if present.
