# 2026-07-08 Receipt Font Clarity Fix

## Scope
- Precision fix for cashier receipt print clarity only.
- No POS order sync, inventory, payment, table, or manager-module logic was changed.

## Root Cause
- The raw ESC/POS receipt used bold and double-height commands on title, order metadata, item names, totals, and section headers.
- The browser fallback receipt CSS also used heavy font weights (`650`, `800`, `900`), making 80mm thermal output look dark and fuzzy.

## Changes
- `client/src/utils/receiptPrinter.ts`
  - Raw receipt now resets to normal print mode and Font A.
  - Removed double-height commands from the cashier receipt text payload.
  - Added printer heat/density setup for darker thermal output.
  - Restored selective emphasis for important receipt parts: store title, order number, order type/table, item name, section headers, total, and payment header.
  - Kept ordinary customer/address/payment detail lines in normal weight.
  - Added right-side safety inset for the order number so the final digit is not clipped by the 80mm paper edge.
  - Lowered fallback HTML receipt font weights to regular/controlled emphasis values.
- `client/src/utils/receiptPrinter.test.ts`
  - Added regression checks that cashier raw receipt text uses selective emphasis and no double-height command.
  - Added regression checks for darker print setup and order-number right-side inset.
  - Added CSS regression checks to prevent uncontrolled heavy receipt font weights from returning.

## Verification
- `npm test -- --runTestsByPath src/utils/receiptPrinter.test.ts --watchAll=false`
  - Passed: 6 tests.
- `npm run build`
  - Passed.
  - Production bundle: `main.dab7da96.js`.

## Follow-up: Amount Alignment And Normal Text Density
- Increased raw ESC/POS density setup for darker normal-weight text without making every line bold.
- Right-side amount columns now print plain numbers only; currency marker stays in the left label or unit price.
- HTML fallback receipt follows the same amount-column convention.
- Verification:
  - `npm test -- --runTestsByPath src/utils/receiptPrinter.test.ts --watchAll=false` passed.
  - `npm run build` passed.
  - Production bundle: `main.945b2c06.js`.

## Follow-up: Full Receipt Darkness And Right Edge Safety
- Changed raw cashier receipt to keep global bold/dark mode active across the whole ticket so normal content does not print in a lighter shade than headings.
- Kept ESC/POS density and heat setup active for the whole raw receipt.
- Added 4-character right inset for item subtotals, summary totals, and the table header amount column, not only the order number.
- Removed unused receipt-only helper after switching all right-side columns to inset alignment.
- Verification:
  - `npm test -- --runTestsByPath src/utils/receiptPrinter.test.ts --watchAll=false` passed.
  - `npm run build` passed without warnings.
  - Production bundle: `main.4c63181d.js`.
