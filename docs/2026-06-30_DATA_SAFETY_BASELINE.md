# 2026-06-30 Data Safety Baseline

Date: 2026-06-30, America/Managua.

## Scope

This pass documents the data-safety baseline for commercial rollout and fixes one backup coverage gap. It does not change POS, inventory, finance, or UI behavior.

## Firestore Global Collections

These are not branch-specific:

- `stores`
- `users`
- `system_roles`

## Firestore Store-Scoped Collections

Every collection below is scoped under:

```text
stores/{storeId}/{collectionName}
```

| Collection | Owner / Purpose |
| --- | --- |
| `attendance_records` | Employee attendance |
| `cash_flow_records` | Cash movement records |
| `customer_deletions` | Customer deletion tombstones |
| `customers` | Customer records |
| `employee_deletions` | Employee deletion tombstones |
| `employees` | Employee records |
| `exchange_rate` | Store exchange rate settings |
| `expense_categories` | Expense parent/child category settings |
| `expense_records` | Store expense records |
| `expenses` | Legacy/current expense compatibility collection |
| `fridge_inventory` | Fridge item stock records |
| `fridge_stocktake_history` | Fridge stocktake history |
| `fridges` | Fridge definitions |
| `handovers` | Shift handover records |
| `inventory_categories` | Inventory categories |
| `inventory_items` | Warehouse inventory items |
| `loan_records` | Employee loan records |
| `menu_items` | POS menu items and recipes |
| `order_counters` | Store/day order number counters |
| `points_transactions` | Customer point ledger |
| `pos_cancel_records` | Cancelled order/item records |
| `pos_held_orders` | Held POS orders |
| `pos_orders` | POS order records |
| `pos_tables` | POS table layout and table state |
| `purchase_orders` | Purchase order records |
| `salary_records` | Salary settlement records |
| `stock_transfer_records` | Warehouse/fridge transfer audit records |
| `supplier_payments` | Supplier repayment records |
| `suppliers` | Supplier records |
| `warehouse_stocktake_history` | Warehouse stocktake history |

## Fixed In This Pass

Backup export previously did not include every store-scoped Firestore collection allowed by `firestore.rules`.

Added these missing backup collections to `client/src/services/backupExportService.ts`:

- `expense_records`
- `order_counters`
- `stock_transfer_records`
- `warehouse_stocktake_history`
- `fridge_stocktake_history`
- `customer_deletions`

Added regression coverage in `client/src/utils/dataSafety.test.ts`:

- The test now parses `firestore.rules` for every `stores/{storeId}/...` collection.
- It asserts each store-scoped collection is present in the backup service.
- This prevents future Firestore collections from being created without backup coverage.

## Backup And Restore Policy

Commercial rollout requires this operating rule:

1. Owner/admin exports a backup before every production deployment that touches data paths, rules, sync, inventory, POS lifecycle, finance, employees, suppliers, or customers.
2. Backup file must be stored outside the browser, ideally in two places:
   - local computer folder by date
   - external/cloud drive controlled by the owner
3. Backup must include all global collections and all store-scoped collections.
4. Restore must never be a blind bulk overwrite from the app UI.
5. Restore should be a controlled admin script with:
   - dry-run mode
   - storeId filter
   - collection filter
   - record count summary
   - conflict report
   - explicit confirmation

## Restore Rehearsal Steps

Before commercial launch:

1. Create a Firebase staging project or emulator dataset.
2. Export production backup from owner settings.
3. Restore into staging only.
4. Compare record counts for every global and store-scoped collection.
5. Open these flows against staging:
   - POS orders
   - inventory items
   - fridge inventory
   - purchase orders
   - expenses
   - financial reports
   - employees
   - customers
   - suppliers
6. Only after the rehearsal works, keep the restore script as an emergency-only operator tool.

## Remaining Data-Safety Risks

- Firestore rules still allow broad same-store read/write access through `hasStoreAccess(storeId)`. Per-role write restrictions are still needed.
- Storage rules still have a broad authenticated fallback. This should be tightened before commercial launch.
- Current local cache and pending sync behavior is functional but needs a visible queue/conflict recovery screen for weak networks.
- Large collection reads still exist in analytics/dashboard paths and should be replaced with date windows, pagination, summaries, or archives.

## Verification

Targeted test command:

```powershell
cd C:\Users\华为\Desktop\Restaurant_POS_Cloud_Clean\client
npm test -- --watchAll=false --runTestsByPath src/utils/dataSafety.test.ts
```

Result:

```text
PASS src/utils/dataSafety.test.ts
Tests: 191 passed, 191 total
```

Production build:

```powershell
cd C:\Users\华为\Desktop\Restaurant_POS_Cloud_Clean\client
npm run build
```

Result:

```text
Compiled successfully.
main.41fbf153.js
```

Deployment:

```powershell
cd C:\Users\华为\Desktop\Restaurant_POS_Cloud_Clean
firebase deploy --only hosting --project restaurant-pos-1b420
```

Result:

```text
Deploy complete.
Hosting URL: https://restaurant-pos-1b420.web.app
```

Live URL check:

```text
STATUS=200
BUNDLE=main.41fbf153.js
```

## Next Task

POS lifecycle hardening:

- Create/confirm E2E coverage for order create, add, cancel, pay, complete, and clear table.
- Verify cloud publish path after terminal states.
- Verify no stale local cache can resurrect historical or terminal orders.
- Keep changes minimal and test-first.
