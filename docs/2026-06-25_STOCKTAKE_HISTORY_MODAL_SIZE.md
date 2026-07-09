# 2026-06-25 Stocktake History Modal Size

## Scope

Warehouse Stocktake history modal was still using the older small layout, while Fridge Stocktake history had already been enlarged.

## Fix

- Updated Warehouse Stocktake history modal to match Fridge Stocktake history:
  - `width: 96vw`
  - `maxWidth: 1320px`
  - `height: 90vh`
  - compact wrapped header actions
  - main modal body scrolls vertically with `minHeight: 0`
  - history table uses horizontal overflow only
- Removed the small nested table scroller from Warehouse Stocktake history.
- Added a regression guard so Warehouse and Fridge stocktake history both stay on the large modal layout.

## Verification

- `npm test -- --watchAll=false --runTestsByPath src/utils/dataSafety.test.ts --testNamePattern="stocktake history"`
- `npm run build`

## Deployment

- Pending deployment together with the current purchase expense history repair batch.
