# Employee Loan Date Filter and Print - 2026-10-16

## Scope

- Production checkout: `Restaurant_POS_Cloud_Clean`
- Firebase project: `restaurant-pos-1b420`
- Changed only employee loan history filtering, printing, translations, and focused tests.

## Behavior

- Loan history defaults to the first day of the current month through today.
- Start and end dates filter the visible audit history and the printed reconciliation together.
- Each employee group shows its record count, total loan amount, and remaining balance directly in the page header.
- The employee selector defaults to all employees and can narrow both the history list and printout to one employee.
- Outstanding-loan counters remain all-time so older unpaid loans are never hidden by the history filter.
- Printing produces an A4 reconciliation grouped by employee with dates, amounts, remaining balances, status, deduction period, notes, employee subtotals, and filtered totals.
- Loan creation, salary deductions, settlement, expenses, and cloud synchronization are unchanged.

## Verification

- Date-range helper test covers inclusive start and end boundaries.
- Full suite passed: 40 suites, 533 tests.
- Production build passed: `main.a2c006b6.js`.
- Real browser loaded current cloud data and confirmed:
  - default range was `2026-10-01` through `2026-10-16`;
  - all-employee mode displayed record count, total amount, and remaining amount for every employee group;
  - selecting Rafa reduced the history to four records with C$ 5000.00 total and C$ 0.00 remaining;
  - the Rafa printout identified the selected employee and contained only the same four records and totals;
  - Chinese and Nicaraguan Spanish employee selectors, group summaries, and print labels rendered correctly;
  - browser console had no errors or warnings.
