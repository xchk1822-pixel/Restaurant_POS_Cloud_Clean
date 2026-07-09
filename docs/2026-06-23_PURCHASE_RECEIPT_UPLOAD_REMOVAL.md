# 2026-06-23 Purchase Receipt Upload Removal

## Scope
- Removed the separate receipt/invoice image upload entry from Inventory -> Purchase Order Management.
- Kept Expense Records as the single official place for receipt image upload and display.
- Did not change purchase order submit, inventory increment, supplier balance, or purchase expense write logic.

## Reason
- Purchase orders and expense records had two receipt upload interfaces.
- The purchase order upload did not reliably display uploaded receipt images.
- Keeping only the expense-record receipt upload reduces maintenance risk and avoids duplicate receipt paths.

## Code Changes
- `client/src/pages/Inventory/PurchaseManagement.tsx`
  - Removed `invoiceImage` from purchase order typing and new-order form state.
  - Removed `fileInputRef` and `handleInvoiceUpload`.
  - Removed the receipt upload input and preview block from the new purchase order modal.
  - Kept order number, supplier, payment type, items, notes, and submit flow unchanged.
- `client/src/utils/dataSafety.test.ts`
  - Added a regression guard proving purchase orders no longer contain a separate image upload entry.
  - The same guard also proves `ExpenseRecords.tsx` still contains the receipt upload functions and file input.

## Verification
- Targeted test:
  - `npm test -- --watchAll=false --runTestsByPath src/utils/dataSafety.test.ts -t "purchase orders do not keep a separate invoice image upload entry"`
  - Result: passed.
- Full data safety test:
  - `npm test -- --watchAll=false --runTestsByPath src/utils/dataSafety.test.ts`
  - Result: 143 tests passed.
- Production build:
  - `npm run build`
  - Result: passed.
- Deployment:
  - `firebase deploy --only hosting --project restaurant-pos-1b420`
  - Result: deployed to `https://restaurant-pos-1b420.web.app`.
- Browser verification:
  - Logged in as `zeng/123456`.
  - Opened Inventory -> Purchase Inbound -> New Purchase Order.
  - Confirmed the modal contains supplier, invoice/order number, payment type, item list, notes, cancel, and submit.
  - Confirmed no receipt/image upload input or preview remains in the purchase order modal.
  - Browser console showed 0 errors during the checked flow.

## Operational Rule
- Purchase order receipt upload is deprecated and removed.
- Receipt/invoice evidence should be uploaded from Manager -> Expense Records only.
- This keeps the image evidence path unified for later owner review and financial reporting.
