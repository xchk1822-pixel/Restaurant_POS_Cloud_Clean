# 2026-10-07 Production Baseline Audit

## Project Boundary

- Production repository: `C:\Users\华为\Desktop\Restaurant_POS_Cloud_Clean`
- Git branch: `main`
- Firebase project: `restaurant-pos-1b420`
- Hosting: `https://restaurant-pos-1b420.web.app`
- `Xing_Long_Restaurant` was not modified or deployed.

## Completed Cleanup And Fixes

- Removed five one-time audit, repair, and deletion scripts that had no runtime references.
- Added and committed `client/package-lock.json` for reproducible installs.
- Updated production dependencies and pinned a safe `@grpc/grpc-js` override.
- Added missing customer promotion collections to backup export coverage.
- Updated stale source-contract tests to match the approved reservation, salary, purchase-entry, permission, and POS behavior.
- Corrected inventory lifecycle audit policy: negative stock is allowed by business rules and is now informational rather than a blocking critical failure.
- Improved POS lifecycle audit so empty completed orders do not produce false stock-deduction failures and existing POS stock ledgers are checked before reporting a missing deduction.
- Fixed reservation list filtering so completed and cancelled reservations appear only on their actual terminal date.
- Made reservation closed-record subscriptions follow the selected reservation date.
- Excluded cancelled reservation payments from reservation prepayment and cash-flow totals.
- Added login autocomplete metadata and hardened the deployed POS smoke check for both Chinese and Spanish UI labels.

## Verification

- Full client tests: 40 suites, 528 tests passed.
- Production build: successful.
- Production bundle: `main.c6b34084.js`.
- Print bridge tests: 11 tests passed.
- Production dependency audit: 0 vulnerabilities.
- Full dependency audit: 99 development-only findings inherited from Create React App 5; production runtime dependencies are unaffected. Replacing the build chain should be a separate migration, because forced audit repair proposes an invalid `react-scripts@0.0.0` downgrade.
- Static cleanup checks: no merge markers, TODO/FIXME/HACK markers, temporary backup files, or production frontend `console.log` calls.
- Firebase Hosting deployment: successful.
- Deployed POS smoke: tables and orders rendered, correct bundle loaded, browser console errors: 0.
- Deployed reservation date check: cancelled reservations appeared on `2026-10-07` only and did not appear on `2026-10-06` or `2026-10-08`.
- Deployed finance check: active reservation `1007010` contributed C$540; cancelled reservation `1007004` had C$640 of prior payments and contributed C$0. The displayed prepayment total was C$540.

## Read-Only Cloud Audit

- Inventory lifecycle: 0 critical, 0 high, 0 medium issues. Fifteen negative warehouse balances remain visible as informational stocktake items; no stock value was changed.
- Historical POS data contains three zero-item numbered placeholder orders: `0930023`, `0930024`, and `1005012`. Current order confirmation and payment paths reject empty orders, so these are historical records rather than a currently reproducible write path.
- Historical order `0930030` is completed with three items but has neither a stock-deduction marker nor POS stock-ledger evidence. It was not deducted retroactively because later stocktakes may already have corrected physical inventory; automatic retroactive deduction would risk corrupting current stock.

## Deployment Freeze

- Deploy target: Firebase Hosting for `restaurant-pos-1b420` only.
- Firestore and Storage rules were not changed in this batch.
- No destructive cloud repair was performed.
