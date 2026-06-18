# Expense Category Hierarchy Design

## Goal

Redesign expense categories from a flat list into a parent-child accounting structure while preserving old expense records and store-scoped cloud/local storage.

## Data Model

`expense_categories` stays the canonical collection. Category documents support:

- `id`: stable document id.
- `name`: display name.
- `code`: optional accounting code.
- `level`: `parent` or `child`.
- `parentId`: parent category id for child categories.
- `sortOrder`: display ordering.

Expense records keep `categoryId` for compatibility and add:

- `parentCategoryId`
- `parentCategoryName`
- `categoryName`

Old records without parent fields remain valid. Reports resolve parent and child names from the current category list.

## Default Parent Groups

The default parent categories are:

- 采购支出
- 人工支出
- 房租水电
- 运营杂费
- 设备维修
- 外卖配送
- 供应商货款
- 其他支出

Legacy flat categories are normalized into child categories under the closest parent by id/code/name. Unknown legacy categories go under `其他支出`.

## UI Behavior

In `ExpenseRecords.tsx`:

- Add/edit form selects parent category first, then child category.
- Child dropdown only shows children under the selected parent.
- Category manager shows parent categories on the left and children for the selected parent on the right.
- Users can add parent categories and child categories.
- Deleting a parent is blocked if it has child categories or referenced expenses.
- Deleting a child is blocked if it is referenced by expenses.

## Report Behavior

Daily financial report details group by parent category, then child category.

Weekly/monthly/custom summaries keep existing daily summary rows, but their daily detail helper can still resolve parent/child labels for printing and future expansion.

## Safety

No bulk overwrite or migration is required. Cloud writes stay single-document through `smartSetDocument` and `smartDeleteDocument`, and local cache remains store-scoped through `dataService.getStoreKey('expense_categories')`.
