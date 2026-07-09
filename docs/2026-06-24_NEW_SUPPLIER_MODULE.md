# 2026-06-24 New Supplier Module

## Scope

Built a new supplier accounts-payable module and routed `/suppliers` to it.

This module is not a four-tab copy of the old supplier page. It is organized as a supplier-centered payable workspace:

- Supplier search and debt status list
- Supplier account summary
- True unpaid purchase order queue
- Dated payable ledger
- Action panel for supplier edit, payment, bill generation, and deletion

## Data Rules

The module keeps existing data relationships:

- suppliers: `suppliers`
- purchase orders: `purchase_orders`
- supplier payments: `supplier_payments`
- linked finance expense entries: `expenses`

No cloud collection path was changed.

The new local accounting layer is in:

- `client/src/pages/Suppliers/supplierLedger.ts`

Important logic:

- Cash purchase orders are labeled as `现付采购`.
- Cash purchase orders use `paidAmount === totalAmount` and do not create supplier debt.
- Credit purchase orders use `totalAmount - paidAmount` as remaining debt.
- Part-paid credit orders are labeled as `部分挂账`.
- Ledger rows always use normalized dates and no longer show blank or moving dates.

## Files Added

- `client/src/pages/Suppliers/SupplierWorkbench.tsx`
- `client/src/pages/Suppliers/supplierLedger.ts`
- `client/src/pages/Suppliers/supplierLedger.test.ts`

## Entry Changed

- `client/src/App.tsx`
  - `/suppliers` now renders `SupplierWorkbench`.

## Verification

Commands run:

- `npm test -- --watchAll=false --runTestsByPath src/pages/Suppliers/supplierLedger.test.ts`
- `npm test -- --watchAll=false --runTestsByPath src/utils/dataSafety.test.ts -t supplier`
- `npm run build`
- `firebase deploy --only hosting --project restaurant-pos-1b420`

Online browser verification:

- URL: `https://restaurant-pos-1b420.web.app/suppliers`
- Login: `zeng / 123456`
- Confirmed markers:
  - `data-new-supplier-module`
  - `data-supplier-ledger-workspace`
  - `data-supplier-ledger-timeline`
  - `data-supplier-action-panel`
- Confirmed old section labels are absent:
  - `供应商档案`
  - `欠款订单`
  - `还款记录`
  - `对账打印`
- Console errors: `0`

Screenshot:

- `client/output/new-supplier-module-live.png`

## 2026-06-24 Date Filter Update

Added bill-date filtering to the new supplier module.

Behavior:

- Default range is the current month.
- Quick filters are available:
  - Today
  - Current month
  - Previous month
  - Last 30 days
- Manual start and end date inputs are available.
- Date filtering affects:
  - supplier ledger rows
  - period purchase amount
  - period payment amount
  - period purchase count
  - period payment count
  - generated supplier bill printout
- Current remaining debt still shows the true all-time balance, so historical unpaid debt is not hidden by a month filter.

Additional files touched:

- `client/src/pages/Suppliers/SupplierWorkbench.tsx`
- `client/src/pages/Suppliers/supplierLedger.ts`
- `client/src/pages/Suppliers/supplierLedger.test.ts`

Additional verification:

- `npm test -- --watchAll=false --runTestsByPath src/pages/Suppliers/supplierLedger.test.ts`
- `npm test -- --watchAll=false --runTestsByPath src/utils/dataSafety.test.ts -t supplier`
- `npm run build`
- `firebase deploy --only hosting --project restaurant-pos-1b420`

Online browser check:

- URL: `https://restaurant-pos-1b420.web.app/suppliers`
- Default date range confirmed:
  - `2026-06-01`
  - `2026-06-30`
- Confirmed UI labels:
  - `账单开始日期`
  - `账单结束日期`
  - `本月`
  - `上月`
  - `近30天`
  - `期间采购`
  - `期间付款`
- Console errors: `0`
- Screenshot: `client/output/new-supplier-date-filter-live.png`

## 2026-06-24 Legacy Cleanup

Removed the previous supplier implementation so it can no longer pollute routing, tests, or future maintenance.

Deleted files:

- `client/src/pages/Inventory/SupplierManagement.tsx`
- `client/src/utils/supplierAccounts.ts`
- `client/src/utils/supplierAccounts.test.ts`

Current canonical files:

- `client/src/pages/Suppliers/SupplierWorkbench.tsx`
- `client/src/pages/Suppliers/supplierLedger.ts`
- `client/src/pages/Suppliers/supplierLedger.test.ts`

Regression guard:

- `client/src/utils/dataSafety.test.ts` now asserts the deleted legacy supplier files do not exist and that `App.tsx` imports only `./pages/Suppliers/SupplierWorkbench`.

Verification:

- `npm test -- --watchAll=false --runTestsByPath src/utils/dataSafety.test.ts -t supplier`
- `npm test -- --watchAll=false --runTestsByPath src/pages/Suppliers/supplierLedger.test.ts`
- `npm run build`
- `firebase deploy --only hosting --project restaurant-pos-1b420`

Online browser check:

- URL: `https://restaurant-pos-1b420.web.app/suppliers`
- Confirmed markers:
  - `data-new-supplier-module`
  - `data-supplier-date-filter`
  - `data-supplier-period-summary`
  - `data-supplier-ledger-timeline`
- Default date range confirmed:
  - `2026-06-01`
  - `2026-06-30`
- Confirmed old section labels are absent:
  - `供应商档案`
  - `欠款订单`
  - `还款记录`
  - `对账打印`
- Console errors: `0`
- Screenshot: `client/output/new-supplier-cleanup-live.png`
