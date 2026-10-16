# Employee Loan Audit History - 2026-10-16

## Scope

- Production checkout: `Restaurant_POS_Cloud_Clean`
- Firebase project: `restaurant-pos-1b420`
- Changed only employee loan list visibility and related bilingual labels.

## Root cause

Salary settlement correctly changed a fully repaid loan to `deducted` with a zero remaining balance. The loan management table reused the salary calculation helper, which intentionally returns only active loans with an outstanding balance, so repaid records disappeared from the table.

## Fix

- Salary calculation continues to use active loans only.
- Loan management uses a separate audit list that keeps active and deducted loans with their original linked expense evidence.
- Cancelled loans remain excluded.
- Deducted rows show zero remaining balance, `已扣除` / `Deducido`, and the salary deduction period when available.
- Active-loan counters and outstanding totals remain unchanged.

## Verification

- Focused employee loan and translation tests passed.
- Full suite passed: 40 suites, 532 tests.
- Production build passed: `main.150af586.js`.
- Real browser loaded current cloud data and confirmed:
  - active counters remained zero for fully settled loans;
  - historical deducted loans remained visible;
  - deduction periods were displayed;
  - Spanish showed `Estado` and `Deducido`;
  - browser console had no errors or warnings.

