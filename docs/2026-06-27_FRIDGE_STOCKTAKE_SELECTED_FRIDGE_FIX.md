# 2026-06-27 Fridge Stocktake Selected-Fridge Fix

## Problem

Fridge stocktake required all fridges to be counted before pressing the completion button. This was inconsistent with Warehouse Stocktake, where the current category/list can be completed immediately.

Operationally this was risky:

- Staff may finish one fridge but forget to click completion after all fridges.
- Moving between warehouse and fridge stocktake trains inconsistent habits.
- The same item in multiple fridges could share the same `actualQuantities[itemId]` key, making counts bleed between fridges.

## Changes

- `FridgeStocktake.tsx`
  - Completion now scopes to the currently selected fridge only.
  - Uncounted-item checks only inspect the selected fridge.
  - Cloud writes only update `fridge_inventory` rows for the selected fridge.
  - History writes now save one record for the selected fridge instead of requiring every fridge.
  - Count input state now uses `fridgeId:itemId` keys, preventing the same product in different fridges from sharing a count.
  - After successful completion, only the selected fridge's count inputs are cleared.

- UI compacting
  - Reduced page padding and vertical gaps.
  - Tightened the title bar and action buttons.
  - Made fridge selector buttons smaller.
  - Reduced the search/complete row height.
  - Added `minHeight: 0` to the list panel so the table receives the available height.

- `dataSafety.test.ts`
  - Replaced the old all-fridges stocktake guard with a selected-fridge guard.
  - Added a compact-header regression guard.

## Verification

- Failed first before implementation:
  - `npm test -- --watchAll=false --runTestsByPath src/utils/dataSafety.test.ts -t "fridge stocktake completion submits only the selected fridge"`
- Targeted stocktake tests:
  - `npm test -- --watchAll=false --runTestsByPath src/utils/dataSafety.test.ts -t "stocktake|fridge stocktake"`
  - Result: `12 passed`
- Full data-safety suite:
  - `npm test -- --watchAll=false --runTestsByPath src/utils/dataSafety.test.ts`
  - Result: `177 passed`
- Full Jest suite:
  - `npm test -- --watchAll=false --runInBand`
  - Result: `18 passed`, `244 passed`
- Production build:
  - `npm run build`
  - Result: compiled successfully
  - Bundle: `build/static/js/main.1c54fa4b.js`

## Notes

- This changes future stocktake behavior only. Existing stocktake history records remain readable.
- No Firestore rules or data paths were changed.
