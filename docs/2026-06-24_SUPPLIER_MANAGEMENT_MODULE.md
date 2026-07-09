# 2026-06-24 Supplier Management Module

## Completed
- Supplier Management now has canonical route `/suppliers`.
- Old route `/inventory/suppliers` was removed because the system is not yet commercially live.
- Store manager permission now uses `suppliers:manage`; old `inventory:suppliers` compatibility was removed.
- Supplier account helpers calculate supplier debt from purchase orders instead of trusting stale supplier balance cache.
- Supplier UI displays debt from purchase-order-derived helper summaries, not stale `supplier.balance`.
- Supplier repayment records are loaded from one store-scoped `supplier_payments` collection.
- Old per-supplier local payment cache paths were removed from the page flow.
- Supplier repayment now links supplier payment, purchase order, and expense records through `supplierPaymentId` and `purchaseOrderId`.
- Supplier balance cache is recalculated from purchase order remaining debt after repayment.
- Supplier page exposes four sections: Supplier Profiles, Debt Orders, Payment Records, and Reconciliation Print.

## Verification
- `npm test -- --watchAll=false --runTestsByPath src/utils/supplierAccounts.test.ts`
- `npm test -- --watchAll=false --runTestsByPath src/utils/dataSafety.test.ts` (149 tests passed)
- `npm run build` (`Compiled successfully.`)
- Firebase Hosting deploy to `restaurant-pos-1b420`
- Browser verification on deployed `/suppliers` after login as `zeng/123456`: four sections visible, console error count 0.

## Data Rule
- Supplier debt is calculated from purchase orders.
- Credit purchases do not become purchase expenses until supplier repayment.
- Supplier repayment creates a supplier payment record and a linked expense record.
- Supplier receipt evidence remains unified under Expense Records.
- Supplier data remains store-scoped; do not add global supplier/payment caches.

## Next Planned Work
- Continue checking Supplier Management UI polish after live use.
- Continue planned modules in order after supplier module completion.
