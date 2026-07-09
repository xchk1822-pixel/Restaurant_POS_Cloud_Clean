# 2026-06-22 Purchase Submit Lock

## Problem

- In Inventory > Purchase Management > New purchase order, the submit button looked idle while cloud writes were still pending.
- Repeated clicks could start multiple concurrent submit flows.
- Result risk: duplicate purchase orders, duplicate warehouse stock increments, duplicate cash purchase expense records, and duplicate supplier balance changes.

## Root Cause

- `submitPurchaseOrder` had no synchronous in-flight guard.
- The submit button was not disabled while the async Firestore and local persistence writes were running.
- On weak networks, the user could click several times before the modal closed.

## Completed

- Added `isSubmittingPurchaseOrderRef` as an immediate submit lock.
- Added `isSubmittingPurchaseOrder` UI state.
- Disabled the submit button while purchase writes are pending.
- Changed button feedback to `提交中...` while pending.
- Kept the existing safety order: purchase order, inventory stock increments, expense record, and supplier balance cloud writes still complete before local UI state is updated.

## Verification

- RED check was run before the implementation and failed on the missing purchase submit lock.
- Targeted test passed:
  - `npm test -- --watchAll=false --runTestsByPath src/utils/dataSafety.test.ts -t "purchase order submit"`
- Full data safety guard passed:
  - `npm test -- --watchAll=false --runTestsByPath src/utils/dataSafety.test.ts`
  - Result: 135 passed.
- Production build passed:
  - `npm run build`
- Firebase Hosting deploy passed:
  - `firebase deploy --only hosting`
  - Hosting URL: `https://restaurant-pos-1b420.web.app`
- Browser smoke check passed:
  - Opened deployed site at `https://restaurant-pos-1b420.web.app/dashboard`.
  - Console showed 0 errors.

## Notes

- This prevents future duplicate purchase submissions from repeated clicks.
- Existing duplicate purchase orders created before this fix were not automatically deleted, because deleting real purchase and inventory records needs manual confirmation.
