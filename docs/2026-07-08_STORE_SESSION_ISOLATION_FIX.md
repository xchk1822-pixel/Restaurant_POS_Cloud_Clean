# 2026-07-08 Store Session Isolation Fix

## Scope
- Fixed same-browser account switching so a boss computer can log into different store accounts without showing the previous store's in-memory data.
- Kept the change limited to authentication session persistence and AppContext active memory reload.
- Did not change POS order flow, inventory deduction, printing, finance formulas, Firestore rules, or Storage rules.

## Root Cause
- Store business data was already saved under store-scoped localStorage keys such as `store_{storeId}_pos_orders`.
- The active React state in `AppContext` only replaced a module when the next store cache had data.
- If the next store cache was empty or still loading, old store arrays could remain visible in memory.

## Fix
- Added `storeSessionIsolation.ts` to compare the previous cached user with the next authenticated user.
- Login, Firebase auth restore, logout, and admin store switching now use the session isolation helper.
- A `storeSessionChanged` event is dispatched when the active user/store scope changes.
- `AppContext` listens to that event and reloads each store-scoped dataset from the current store key.
- Empty current-store datasets now overwrite old in-memory arrays with `[]`.

## Offline/Data Safety
- The fix does not call `localStorage.clear()`.
- The fix does not delete any `store_{storeId}_...` cache.
- Existing per-store offline caches remain available for later login.
- Pending sync/conflict keys are not removed.

## Verification
- `npm test -- --watchAll=false --runInBand src/utils/storeSessionIsolation.test.ts`
- `npm test -- --watchAll=false --runInBand src/utils/dataSafety.test.ts --testNamePattern="branch account switching|auth state restore"`
- `npm run build`
- `firebase deploy --only hosting`
- Browser production check on `https://restaurant-pos-1b420.web.app/login?redirect=/pos`:
  - seeded an old fake store cache containing order `FAKEOLD`
  - logged in as `zeng`
  - confirmed current user store is `store_1776725610354`
  - confirmed fake old order is not displayed
  - confirmed old fake store cache is preserved
  - confirmed POS page shows `Pedidos`
  - confirmed no console errors during the check
