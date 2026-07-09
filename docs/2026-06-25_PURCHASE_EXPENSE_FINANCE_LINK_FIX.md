# 2026-06-25 Purchase Expense Finance Link Fix

## Problem

Cash purchase orders created from Inventory -> Purchase Management were not reliably appearing in Expense Records and Financial Reports on the current device.

## Root Cause

- The purchase module wrote the cash purchase expense to the cloud `expenses` collection, but the local back-office pages read through `dataManager.getData('expenses')`.
- `smartSyncService` and `dataManager` use different local cache keys for `expenses`, so the current device could have a new cloud/local sync record without the manager pages immediately seeing it.
- The generated purchase expense also did not include enough stable linkage fields for finance/report matching, such as `type: 'purchase'` and `purchaseOrderId`.

## Fix

- Cash purchase expense records now use deterministic ids: `purchase-expense-${purchaseOrderId}`.
- Cash purchase expense writes now use `smartSetDocument('expenses', purchaseExpense.id, purchaseExpense)` to avoid duplicate records on retry.
- Purchase expense records now include:
  - `type: 'purchase'`
  - `relatedType: 'purchase'`
  - `purchaseOrderId`
  - `orderId`
  - `supplierId`
  - `supplierName`
  - `orderNumber`
- After a successful purchase submit, the module updates local `purchases` and `expenses` through `dataManager.saveData(..., { syncFirestore: false })`, which triggers local update events.
- Expense Records now listens for `expensesUpdated`.
- Financial Reports now listens for `expensesUpdated` and `purchasesUpdated` and recalculates.
- Historical repair added for purchases created before this fix:
  - Expense Records refresh now reads `purchase_orders` and repairs missing cash purchase expense records.
  - Financial Reports refresh does the same repair, so old cash purchases can appear without visiting Expense Records first.
  - Repair uses deterministic ids and skips purchases that already have linked expense records.
  - Credit purchase orders are not repaired into expenses, because they are supplier debt until repayment.

## Business Rule Preserved

- Cash / same-day paid purchase orders create purchase expense records immediately.
- Credit purchase orders do not create purchase expense records immediately. They remain supplier debt until repayment, and repayment creates the purchase expense.

## Verification

- `npm test -- --watchAll=false --runTestsByPath src/utils/dataSafety.test.ts --testNamePattern="purchase order creation|purchase expenses notify|manager refresh repairs|financial reports"`
- `npm run build`

## Deployment

- Firebase Hosting target: `restaurant-pos-1b420`.
- Status: deployed successfully with `firebase deploy --only hosting --project restaurant-pos-1b420`.
