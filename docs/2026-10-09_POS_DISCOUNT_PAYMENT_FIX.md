# POS Discount Payment Fix - 2026-10-09

## Scope

- Production checkout: `Restaurant_POS_Cloud_Clean`
- Firebase project: `restaurant-pos-1b420`
- Changed only the POS payment eligibility guard and its regression test.

## Root cause

The payment button required `remainingAmount > 0.001`. A 100% discount correctly reduced the order balance to zero, but that condition permanently disabled payment completion. The payment handler also used a stricter floating-point comparison than the button.

## Fix

- Allow payment completion when the discounted remaining balance is zero.
- Use the same `0.001` tolerance in the button guard and payment handler.
- Keep the existing item requirement, payment lock, order flow, inventory, printing, and sync behavior unchanged.

## Verification

- Focused payment regression: passed.
- Full test suite: 40 suites, 531 tests passed.
- Production build: passed; bundle `main.ae0385ea.js`.
- Local real-browser checks:
  - 100% discount: total `C$0.00`, payment button enabled.
  - 10% discount on `C$220.00`: total `C$198.00`; button disabled before payment and enabled after entering `C$198.00`.
- Production real-browser check:
  - 100% discount on `C$220.00`: total `C$0.00`, payment button enabled.
  - No payment was submitted and no test order was written.
- Firebase Hosting deployment completed successfully.

