# Blind Stocktake Active View

Date: 2026-10-08

## Scope

- Warehouse and fridge stocktake entry screens now use blind counting for employee roles.
- Store managers, multi-store managers, and super admins continue to see all live system quantities and differences.
- No approval stage was added. Completing a stocktake keeps the existing direct inventory update flow.

## Behavior

- Employee active-count screens mask system, warehouse, fridge, total, and difference values with `***`.
- Employee inputs remain blank until physically counted.
- Difference colors, check marks, row highlighting, and discrepancy-count confirmation are hidden during employee entry.
- Warehouse stocktake blocks submission until every item in the current filtered list has a physical count.
- Fridge stocktake keeps its existing uncounted-item guard.
- Managers retain the existing visible quantities, prefilled warehouse count, difference highlighting, and confirmation details.

## Unchanged

- Completed stocktake history still shows system quantity, physical count, and difference.
- CSV export and printed history remain unchanged.
- Stock updates, stock movement records, offline synchronization, duplicate-submit protection, store isolation, and manager permissions remain unchanged.

## Files

- `client/src/pages/Inventory/WarehouseStocktake.tsx`
- `client/src/pages/Inventory/FridgeStocktake.tsx`
- `client/src/i18n/translations.ts`
- `client/src/utils/dataSafety.test.ts`

## Verification

- Targeted tests passed: 2 suites, 320 tests.
- Full test suite passed: 40 suites, 530 tests.
- Production build passed: `main.22705e8a.js`.
- Real browser, store-manager session: warehouse stock values, prefilled physical counts, and difference indicators remained visible.
- Real browser, local cashier-role simulation: warehouse system/difference values and fridge total/warehouse/fridge/difference values displayed `***`; physical-count inputs started blank.
- Real browser confirmed incomplete fridge counting is blocked before any submit.
- Warehouse history modal and print/export controls remain available. Regression tests confirm completed history and print output still use the original system quantity, physical count, and difference fields.
- Browser verification did not submit a stocktake and did not change cloud business data.
- Firebase Hosting deployment completed for `restaurant-pos-1b420`; production serves `main.22705e8a.js`.
- Production browser verification with the store-manager account loaded warehouse stocktake successfully, retained visible/prefilled quantities (including decimal input support), and produced 0 console errors and 0 warnings.
