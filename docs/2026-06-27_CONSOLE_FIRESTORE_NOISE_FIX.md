# 2026-06-27 Console Firestore Noise Fix

## Problem

Production Chrome console showed many warnings and errors during POS use:

- Deprecated Firebase persistence warning:
  - `enableIndexedDbPersistence() will be deprecated`
- Weak-network fallback messages:
  - `WeakNetworkTimeoutError: weak-network-timeout:read:menu_items`
  - `Weak network timeout, update saved locally: $collectionName/$docId`
- Firestore offline/server messages:
  - `Could not reach Cloud Firestore backend`
  - `Failed to get documents from server`
- Older tabs could still show logs from stale bundles such as `main.a43d18bc.js`.

## Root Cause

- Firestore was initialized with the older persistence API.
- Weak-network fallback is expected for Nicaragua network conditions, but expected fallback paths were logged as console warnings/errors.
- One warning string used the wrong template syntax, so it printed `$collectionName/$docId` literally.
- Hosting did not set no-cache headers, so old browser tabs/caches could continue running a stale bundle after deployment.

## Changes

- `client/src/firebase/index.ts`
  - Replaced deprecated persistence setup with `initializeFirestore` and `persistentLocalCache`.
  - Enabled `persistentMultipleTabManager` for multi-tab IndexedDB cache coordination.
  - Set Firebase SDK log level to `silent` so expected SDK network warnings do not flood production console.

- `client/src/services/smartSyncService.ts`
  - Added expected offline/read-error classification.
  - Kept weak-network local fallback behavior.
  - Suppressed console noise for expected weak-network fallback paths.
  - Preserved `console.error` for unexpected Firestore/localStorage failures.
  - Fixed wrong literal log templates using `$collectionName/$docId`.

- `firebase.json`
  - Added Hosting `Cache-Control: no-cache, max-age=0, must-revalidate` headers so future deploys do not leave old app shells running.

- `client/src/App.tsx`
  - Removed two route-guard development warnings for unauthenticated redirects and role redirects.
  - Routing behavior is unchanged.

- `client/src/utils/dataSafety.test.ts`
  - Added regression coverage for the current quiet offline-cache API.
  - Added guards against weak-network fallback console noise and literal `$collectionName/$docId` messages.

## Verification

- Targeted safety tests:
  - `npm test -- --watchAll=false --runTestsByPath src/utils/dataSafety.test.ts`
  - Result: `176 passed`
- Full Jest suite:
  - `npm test -- --watchAll=false --runInBand`
  - Result: `18 passed`, `243 passed`
- Production build:
  - `npm run build`
  - Result: compiled successfully
  - Bundle: `build/static/js/main.fa1ba0eb.js`

## Notes

- These console errors did not prove business data was lost.
- They did indicate weak Firestore connectivity and expected offline fallback, which can delay multi-device realtime sync until pending writes reach the cloud.
- The fix keeps offline-capable behavior but stops expected weak-network fallbacks from flooding the browser console.
