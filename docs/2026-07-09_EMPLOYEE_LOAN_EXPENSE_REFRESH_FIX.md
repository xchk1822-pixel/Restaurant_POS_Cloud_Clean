# 2026-07-09 Employee Loan Expense Refresh Fix

## Scope

Precise employee-module fix only. No POS, receipt printing, inventory, purchase, finance formula, or production data records were edited by this fix.

## Root Cause

Loan management and single salary settlement decide whether a loan is still visible by matching `loan_records` with employee-loan expense rows in `expenses`. Expense records and finance still had those rows, but the employee module was not refreshing the matching expense rows reliably.

An earlier repair loaded the full `expenses` collection into the employee module. That restored visibility, but it was not acceptable for Firestore usage or cache safety because `expenses` can be large and belongs to the expense/finance module.

## Final Design

- Adding a loan still writes both required cloud documents before local UI state changes:
  - `loan_records`
  - `expenses` with `relatedType: 'loan'` / `categoryId: 'employee_loan'`
- Employee module refresh reads only the small loan-expense subset:
  - `expenses where relatedType == loan`
  - `expenses where categoryId == employee_loan`
- Employee module stores only a small offline fallback cache named `employee_loan_expenses`.
- Employee module removes the old duplicate local `expenses` cache if it exists, so it does not keep a stale large expense copy.
- Salary settlement and loan management now receive `loanExpenseRecords` from employee module state instead of reading the full expense cache.

## Firestore Usage

This fix avoids a full `expenses` collection read in employee management. The employee page uses two filtered reads for loan-related expense rows only. In normal use this is a small subset compared with all purchase, daily expense, receipt, and supplier-payment records.

## Verification

- `npm test -- --watchAll=false --runInBand src/utils/dataSafety.test.ts --testNamePattern "employee module refreshes only employee loan expenses|employee module refresh does not duplicate large expenses cache|employee loan and salary screens use scoped loan expenses|employee loan and salary settlement wait for cloud writes"`
- `npm test -- --watchAll=false --runInBand src/utils/dataSafety.test.ts`
- `npm test -- --watchAll=false --runInBand src/utils/employeeLoans.test.ts`

- `npm run build` -> production bundle `main.55962fd2.js`
- `firebase deploy --only hosting` -> `https://restaurant-pos-1b420.web.app`
- Production browser verification:
  - Logged in as `zeng`.
  - `/employees/loans` loaded Rafa active loan `C$ 4000.00`.
  - Refresh button completed with no alert.
  - `/employees/salary` showed `Prestamo pendiente: C$ 4000.00` for Rafa in single settlement.
  - Browser console: 0 errors, 0 warnings.
  - Local cache check: `store_store_1776725610354_employee_loan_expenses` was about 1.1 KB; no duplicate full `store_store_1776725610354_expenses` cache remained.
