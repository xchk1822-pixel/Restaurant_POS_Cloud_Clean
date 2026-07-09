# POS Clear Table Flicker Fix

Date: 2026-06-28

## Problem

When clearing a paid dine-in table, the table sometimes flashed 4-5 times before settling.

## Root Cause

The POS table subscription accepted every `pos_tables` cloud snapshot directly. During clear-table flow, the local terminal had already changed the table to `available`, but a stale cloud snapshot could arrive with the older `needs_cleaning` or `occupied` state. The local order reconciler then changed it back again, creating repeated visible state bounce.

## Change

- Added `mergeTablesByVersion` in `client/src/pages/POS/POS.tsx`.
- The `pos_tables` realtime subscription now merges incoming cloud tables with current local tables by `lastModified`.
- Newer local table state wins over older cloud snapshots, so clear-table state is not overwritten by stale snapshots.
- Incoming newer cloud table state from another terminal can still update the local terminal.
- No order amount, payment, inventory, report, or menu logic was changed.

## Verification

- Added regression guard in `client/src/utils/dataSafety.test.ts`.
- Verified the new failing test first caught the missing protection.
- Ran targeted regression:
  - `npm test -- --runTestsByPath src/utils/dataSafety.test.ts --watchAll=false --testNamePattern "POS table cloud snapshots cannot overwrite newer local clear-table state"`
- Ran POS table regression group:
  - `npm test -- --runTestsByPath src/utils/dataSafety.test.ts --watchAll=false --testNamePattern "POS table"`
  - Result: 11 passed.
- Ran production build:
  - `npm run build`
  - Result: compiled successfully as `main.5e4f1c13.js`.

## Deployment

- Deployed Firebase Hosting to project `restaurant-pos-1b420`.
- Hosting URL: `https://restaurant-pos-1b420.web.app`
- Deployed bundle: `main.5e4f1c13.js`.
