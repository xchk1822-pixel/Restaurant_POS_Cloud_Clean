# 2026-07-08 Employee Loan Input And Single Salary Date Fix

## Scope

Precision fix for employee management only:

- Loan Management: new loan amount input.
- Salary Settlement: individual settlement default date range.

No POS, inventory, finance, supplier, or customer logic was changed.

## Changes

- `client/src/pages/Employees/LoanManagement.tsx`
  - New loan amount input now stores the visible field as a string while typing.
  - Clearing the field leaves it empty instead of forcing `0` back into the box.
  - Save logic converts the value once and requires an amount greater than `0`.

- `client/src/utils/employeeRecords.ts`
  - Added `parseOptionalMoneyInput`.
  - Added `getSingleSalaryDefaultPeriod`.

- `client/src/pages/Employees/SalarySettlement.tsx`
  - Individual salary settlement cards now default to:
    - Current month day `1` through today.
    - Day `16` through today after the employee already has a first-half settlement.
    - Employee hire date through today when the employee started mid-period.

- `client/src/utils/employeeRecords.test.ts`
  - Added regression coverage for empty money input and individual settlement default date rules.

## Verification

- `npm test -- --runTestsByPath src/utils/employeeRecords.test.ts --watchAll=false`
  - 5 passed.
- `npm run build`
  - compiled successfully.
- Browser verification on local production build at `http://localhost:52347`:
  - Logged in as `zeng`.
  - Opened `借款管理`, opened `新增借款`, typed `0`, selected all, deleted.
  - Verified amount input value became empty string.
  - Opened `工资结算`.
  - Verified first individual settlement date inputs showed `2026-07-01` to `2026-07-08`.
  - No console errors captured.
- Firebase Hosting deploy completed:
  - `https://restaurant-pos-1b420.web.app`
