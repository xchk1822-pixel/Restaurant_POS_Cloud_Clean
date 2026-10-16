# Employee Loan Date Filter and Print - 2026-10-16

## Scope

- Production checkout: `Restaurant_POS_Cloud_Clean`
- Firebase project: `restaurant-pos-1b420`
- Changed only employee loan history filtering, printing, translations, and focused tests.

## Behavior

- Loan history defaults to the first day of the current month through today.
- Start and end dates filter the visible audit history and the printed reconciliation together.
- Outstanding-loan counters remain all-time so older unpaid loans are never hidden by the history filter.
- Printing produces an A4 reconciliation grouped by employee with dates, amounts, remaining balances, status, deduction period, notes, employee subtotals, and filtered totals.
- Loan creation, salary deductions, settlement, expenses, and cloud synchronization are unchanged.

## Verification

- Date-range helper test covers inclusive start and end boundaries.
- Full suite passed: 40 suites, 533 tests.
- Production build passed: `main.ab221d53.js`.
- Real browser loaded current cloud data and confirmed:
  - default range was `2026-10-01` through `2026-10-16`;
  - changing the start date to `2026-10-10` updated employee groups to OSMAN 3, Rafa 2, and YENI 1;
  - Chinese and Spanish print views contained only the six filtered records;
  - employee subtotals and overall totals matched the filtered records;
  - browser console had no errors or warnings.
