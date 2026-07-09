# 2026-06-26 Stocktake Submit Guard

## Scope

Continue the high-risk write button hardening plan. This pass covers stocktake completion in:

- Warehouse Stocktake
- Fridge Stocktake

## Problem Prevented

Stocktake completion writes inventory quantities and stocktake history. On slow networks or repeated clicks, the old UI could start the same completion flow more than once before the first write finished.

## Fix

- Added `isStocktakeSubmitting` UI state and `isStocktakeSubmittingRef` runtime lock to both stocktake modules.
- The lock starts after the user confirms the stocktake and before cloud writes begin.
- Duplicate clicks are ignored while writes are pending.
- Completion buttons are disabled during submission and show `处理中...`.
- The lock is released in `finally`, so failures do not permanently freeze the button.
- Existing stocktake calculations, cloud write collections, and history formats were not changed.

## Verification

- `npm test -- --watchAll=false --runTestsByPath src/utils/dataSafety.test.ts --testNamePattern="stocktake completion"`
- `npx.cmd tsc --noEmit --pretty false`
- `npm run build`

## Deployment

- Deployed Firebase Hosting for `restaurant-pos-1b420`.
- Production URL check returned `STATUS=200`.
