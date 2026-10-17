# Employee Salary Daily Proration - 2026-10-16

## Scope

- Production checkout: `Restaurant_POS_Cloud_Clean`
- Firebase project: `restaurant-pos-1b420`
- Changed only the shared employee base-salary calculation and its focused tests.

## Rule

- Daily salary is monthly salary divided by the actual calendar days in that month.
- The selected settlement period is calculated day by day.
- Rest days are paid; explicitly absent or leave days are unpaid.
- A new employee starts accruing salary on the recorded hire date.
- Decimal daily values are accumulated first, then the period base salary is rounded once to a whole cordoba.
- Single-person preview, batch preview, and final settlement continue to use the same shared calculation.

## Unchanged

- Overtime, benefits, subsidy, social security, employee loans, printing, expense posting, and synchronization logic are unchanged.

## Verification

- Focused salary helper tests passed: 12/12.
- Full client test suite passed: 40 suites, 534 tests.
- Production build passed with bundle `main.f92ea54a.js`.
- Real-browser preview on 2026-10-16 confirmed Rafa's displayed daily rate is
  `C$1129.03` (`35000 / 31`) and the one-day base/net salary preview is rounded
  to `C$1129`.
- The preview was cancelled; no salary settlement or financial record was
  submitted during verification.
- Browser console: 0 errors, 0 warnings.
