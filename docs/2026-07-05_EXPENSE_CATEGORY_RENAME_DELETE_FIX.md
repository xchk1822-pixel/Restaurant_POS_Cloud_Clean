# 2026-07-05 Expense Category Rename/Delete Fix

## Scope

Precise fix only for Manager > Expense Records category management.

Touched files:

- `client/src/pages/Manager/ExpenseRecords.tsx`
- `client/src/utils/expenseCategories.ts`
- `client/src/utils/expenseCategories.test.ts`
- `client/src/utils/dataSafety.test.ts`

No POS, inventory, employee, finance formula, Firebase sync service, or unrelated module code was changed for this fix.

## Final Business Rule

- Parent category names can be renamed even if the category was already used.
- Child category names can be renamed even if the category was already used.
- Used parent and child categories can also be deleted.
- Deleting a parent category deletes its child categories together, so no orphan child category remains.
- Historical expense rows keep their saved `parentCategoryName` and `categoryName` snapshots, so old records can still display names after a category is deleted.

## Verification

- `npm test -- --runTestsByPath src/utils/expenseCategories.test.ts src/utils/dataSafety.test.ts --runInBand --watchAll=false`
  - Passed: 238 tests.

- `npm run build`
  - Passed.
  - Production bundle: `main.ed14fe9d.js`.

- `npx firebase deploy --only hosting --project restaurant-pos-1b420`
  - Deployed successfully.

- Production browser verification:
  - URL: `https://restaurant-pos-1b420.web.app/manager/expense-records`
  - Loaded bundle: `/static/js/main.ed14fe9d.js`
  - Opened category manager.
  - Found 8 rename buttons for category rename.
  - Browser console errors: 0.
