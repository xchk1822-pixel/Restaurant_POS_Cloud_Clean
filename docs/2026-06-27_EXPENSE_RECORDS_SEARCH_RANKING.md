# 2026-06-27 Expense Records Search And Ranking

## Scope

- Module: Store Manager -> Expense Records.
- Goal: turn Expense Records into the detailed accounting search tool, while keeping Manager Overview as the business analytics view.

## Completed

- Added a keyword search box to Expense Records.
- Search works inside the current parent category, child category, and date filters.
- Search text covers:
  - expense description and notes
  - parent and child expense categories
  - supplier name
  - purchase order number / invoice number
  - linked purchase item names, quantities, prices, and subtotals
- Added category expense ranking based on the current filtered records.
- Added item/detail ranking based on linked purchase order line items.
- Added a shared purchase-link utility:
  - `client/src/utils/expensePurchaseLink.ts`
  - This centralizes the logic that links an expense record back to its purchase order.
  - Expense Records, Manager Overview expense analytics, and Financial Reports daily detail now use the same purchase-order matching path.
- Added regression tests:
  - `client/src/utils/expenseRecordInsights.test.ts`
  - `client/src/utils/dataSafety.test.ts`
- Revised the Expense Records layout after hands-on review:
  - date filters stay at the top
  - default date mode is today
  - supported date modes are all, today, specific date, and month
  - expense records list is now above rankings and takes the main visible area
  - rankings are now below the list and grouped compactly by parent category and item/detail

## Data Safety Notes

- No expense write path was changed.
- No purchase order write path was changed.
- No financial report formula was changed.
- No realtime subscription was added.
- Expense search and ranking are derived read-only views from:
  - `expenses`
  - `expense_categories`
  - `purchases`
- Purchase-detail parsing is centralized so future field changes only need one utility update.

## Verification

- `npm test -- --runTestsByPath src/utils/expenseRecordInsights.test.ts src/utils/dataSafety.test.ts --watchAll=false`
  - Passed: 2 suites, 180 tests.
- `npm run build`
  - Passed.
  - Built bundle: `main.9ac3460d.js`.
- Local Playwright check against `http://localhost:52344/manager/expense-records`
  - Login: `zeng / 123456`.
  - Verified Expense Records title, search box, category ranking, item/detail ranking.
  - Verified entering `鸡肉` in search.
  - Console errors/warnings: 0.
  - Screenshot: `client/output/playwright/expense-records-search-ranking-local.png`.
- Firebase Hosting deploy:
  - Project: `restaurant-pos-1b420`
  - URL: `https://restaurant-pos-1b420.web.app`
- Production Playwright check against `https://restaurant-pos-1b420.web.app/manager/expense-records`
  - Login: `zeng / 123456`.
  - Verified Expense Records title, search box, category ranking, item/detail ranking.
  - Verified entering `鸡肉` in search.
  - Console errors/warnings: 0.
- Layout revision verification:
  - `npm test -- --runTestsByPath src/utils/expenseRecordInsights.test.ts src/utils/dataSafety.test.ts --watchAll=false`
  - Passed: 2 suites, 182 tests.
  - `npm run build` passed with bundle `main.c8d1a50a.js`.
  - Local Playwright verified date modes, list-before-ranking order, search box, and 0 console errors/warnings.
  - Production Playwright verified date modes, list-before-ranking order, search box, and 0 console errors/warnings.
- Follow-up layout fix:
  - Removed the redundant Today and All shortcut buttons because the date-mode selector already contains those choices.
  - Changed the Expense Records page container to scroll vertically inside the app shell.
  - Replaced the cramped bounded table scroll with an outer large page container and natural record-list height.
  - The records list now keeps only horizontal overflow for narrow columns; vertical scrolling belongs to the outer page shell.
  - Verified targeted layout guard: passed.
  - Verified targeted tests: 2 suites, 182 tests passed.
  - Verified production build compiles successfully as `main.a6b3b907.js`.
  - Verified local and deployed pages with Playwright: date modes visible, redundant buttons absent, ranking visible, console errors/warnings 0.
- Large-container correction:
  - User-facing issue: the Expense Records list could show only one visible row and forced small inner scrolling.
  - Removed list-card vertical clipping and the fixed `minHeight: '360px'` table area.
  - Added regression coverage that the list block does not reintroduce `overflow: hidden` or fixed min-height vertical containment.
  - Browser verification at 1366x768 with 12 local test records: 7 rows visible, table wrapper `scrollHeight` equals `clientHeight`, and outer page shell is the only vertical scroll container.
  - Screenshot: `client/output/playwright/expense-records-large-container-dev-1366.png`.

## Next Recommended Step

- Reuse the same shared expense ranking and purchase-detail linkage in Manager Overview when adding deeper cost comparison widgets.
