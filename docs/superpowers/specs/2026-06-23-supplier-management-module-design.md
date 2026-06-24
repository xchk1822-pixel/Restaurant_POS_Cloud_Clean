# Supplier Management Module Redesign

## Decision

Use the supplier accounts-payable module design.

Supplier Management will become an independent first-level module near the bottom of the left navigation. It will no longer be treated as a child of Inventory Management, because supplier work covers purchasing, payable balances, repayment, financial expenses, and reconciliation.

## Goals

- Keep supplier data strictly isolated per store.
- Make supplier payable balances easy to understand and audit.
- Connect purchase orders, repayments, expenses, and financial reports through explicit IDs.
- Avoid duplicate receipt upload paths. Receipt evidence remains in Expense Records.
- Improve maintenance by separating supplier code from inventory item code.
- Keep the first implementation low-risk by avoiding data migration unless a later audit proves it is required.

## Non-Goals

- Do not merge suppliers across stores.
- Do not build a global supplier master database.
- Do not redesign purchase order creation in the first pass.
- Do not change inventory stock increment logic in the first pass.
- Do not add a new supplier receipt upload interface.

## Navigation

Store-user navigation should become:

```text
POS
Waiter Ordering
Kitchen Display
Inventory Management
Employee Management
Manager Management
Supplier Management
Customer Management
```

Supplier Management and Customer Management should sit near the bottom because they are lower-frequency maintenance modules.

Old routes should remain compatible:

```text
/inventory/suppliers -> /suppliers
```

The new canonical route should be:

```text
/suppliers
```

## Store-Scoped Data Model

All supplier data must use the current store key:

```text
stores/{storeId}/suppliers
stores/{storeId}/purchase_orders
stores/{storeId}/supplier_payments
stores/{storeId}/expenses
```

The module must not read or write global supplier, purchase, payment, or expense collections for branch business data.

## Source Of Truth

Supplier base information lives in:

```text
stores/{storeId}/suppliers
```

Purchase debt lives in:

```text
stores/{storeId}/purchase_orders
```

Repayment records live in:

```text
stores/{storeId}/supplier_payments
```

Paid supplier money that should affect financial reports lives in:

```text
stores/{storeId}/expenses
```

## Balance Rule

Supplier remaining debt should be calculated from purchase orders:

```text
remainingDebt = sum(max(totalAmount - paidAmount, 0)) for this supplier
```

The `supplier.balance` field can remain as a cached display value for compatibility, but it must not be the only truth used for reports or deletion checks.

Deletion should be blocked when calculated remaining debt is greater than zero.

## Purchase And Payment Rules

Cash purchase:

- Create purchase order.
- Increase inventory as currently designed.
- Create purchase expense immediately.
- Supplier remaining debt remains zero for that order.

Credit purchase:

- Create purchase order.
- Increase inventory as currently designed.
- Do not create purchase expense at purchase time.
- Remaining debt increases by unpaid order amount.

Supplier repayment:

- Update the linked purchase order `paidAmount`.
- Update the linked purchase order `status`.
- Create one `supplier_payments` record.
- Create one `expenses` record for the paid amount.
- The expense record should identify it as supplier repayment and include:
  - `supplierPaymentId`
  - `supplierId`
  - `supplierName`
  - `purchaseOrderId`
  - `orderNumber`
  - `relatedType: supplier_repayment`

## Proposed Page Structure

Supplier Management should have four internal sections:

```text
Supplier Profiles
Debt Orders
Payment Records
Reconciliation Print
```

### Supplier Profiles

Purpose:

- Add, edit, disable, and delete suppliers.
- Show contact, phone, address, status, remaining debt, purchase count, last purchase date, and last payment date.

Behavior:

- Edit and delete operations must wait for cloud writes before mutating local UI state.
- Delete should be blocked if calculated remaining debt is greater than zero.
- Inactive suppliers should remain visible with a filter, but should not be the default choice for new purchase orders unless manually selected.

### Debt Orders

Purpose:

- Show all unpaid or partially paid purchase orders.
- Make repayment entry easy and auditable.

Filters:

- Supplier
- Date range
- Status: all, unpaid, partial, paid
- Search by order number

Sorting:

- Newest purchase date first by default.

Behavior:

- Repayment is initiated from an order row.
- Repayment amount cannot exceed remaining order debt.

### Payment Records

Purpose:

- Show all supplier repayments from `supplier_payments`.
- Allow audit against related expense records.

Columns:

- Date
- Supplier
- Order number
- Amount
- Method
- Notes
- Related expense status

Sorting:

- Newest payment first.

### Reconciliation Print

Purpose:

- Print or preview a supplier reconciliation statement.

Options:

- Supplier
- Date range
- Single order number or all orders

Contents:

- Supplier info
- Purchase order summary
- Repayment records
- Remaining debt

Receipt images should not be uploaded here. Receipt review remains in Expense Records.

## Financial Report Connection

Financial reports should keep the existing business rule:

- Purchase paid amount reads actual paid supplier money from expenses.
- Supplier debt reads current remaining supplier debt from purchase orders.

Supplier Management must not create purchase expense records for credit purchases before payment.

## Offline And Weak Network Behavior

First pass:

- Supplier profile edits, deletes, and repayments continue to require cloud write success before local state changes.
- This protects payable data from silent divergence.
- The UI should show a pending/disabled state while the write is in progress.

Later pass:

- If offline supplier repayment is needed, it must use a queued local transaction with conflict detection and visible pending status. It should not silently mark debt as paid.

## Compatibility Plan

Phase 1:

- Add `/suppliers` canonical route.
- Move the navigation entry to a first-level module near the bottom.
- Keep `/inventory/suppliers` redirecting to `/suppliers`.
- Keep current store-scoped collection names.
- Keep purchase order creation unchanged.

Phase 2:

- Split supplier page into the four internal sections.
- Replace local per-supplier payment cache as the primary reader with `supplier_payments` cloud/store cache.
- Calculate remaining debt from purchase orders for display and deletion rules.
- Add regression tests for route, store isolation, payment-expense linkage, and debt calculation.

Phase 3:

- Polish UI and reconciliation print layout.
- Review whether `supplier.balance` should remain as a compatibility cache or be removed in a future migration.

## Testing Requirements

- Supplier module route exists at `/suppliers`.
- Old route `/inventory/suppliers` redirects to `/suppliers`.
- Supplier reads and writes stay store-scoped.
- Payment records read from `supplier_payments`.
- Repayment creates both `supplier_payments` and `expenses`.
- Credit purchase does not create paid purchase expense until repayment.
- Supplier remaining debt is calculated from purchase orders.
- Deletion is blocked when calculated remaining debt is greater than zero.
- Full `dataSafety.test.ts` passes.
- Production build passes.
- Browser verification checks the live route loads and old route redirects without creating live business data.
