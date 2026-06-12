import { getVisibleLoanRecords } from './employeeLoans';

describe('employee loan helpers', () => {
  const linkedExpense = {
    id: 'expense-1',
    relatedLoanId: 'loan-1',
    relatedType: 'loan',
    categoryId: 'employee_loan',
    employeeId: 'emp-1',
    amount: 100,
    date: '2026-06-12',
  };

  test('shows only active loans with remaining balance and existing expense record', () => {
    const loans = [
      {
        id: 'loan-1',
        employeeId: 'emp-1',
        amount: 100,
        remainingAmount: 60,
        status: 'active',
        date: '2026-06-12',
      },
      {
        id: 'loan-2',
        employeeId: 'emp-1',
        amount: 80,
        remainingAmount: 0,
        status: 'active',
        date: '2026-06-12',
      },
      {
        id: 'loan-3',
        employeeId: 'emp-1',
        amount: 50,
        remainingAmount: 50,
        status: 'deducted',
        date: '2026-06-12',
      },
      {
        id: 'loan-4',
        employeeId: 'emp-1',
        amount: 70,
        remainingAmount: 70,
        status: 'active',
        date: '2026-06-12',
      },
    ];

    expect(getVisibleLoanRecords(loans, [linkedExpense]).map(loan => loan.id)).toEqual(['loan-1']);
  });

  test('supports legacy loans by matching employee, amount, and date when no explicit link exists', () => {
    const loans = [
      {
        id: 'legacy-loan',
        employeeId: 'emp-2',
        amount: 200,
        remainingAmount: 200,
        status: 'active',
        date: '2026-06-11',
      },
    ];
    const expenses = [
      {
        id: 'loan_legacy',
        relatedType: 'loan',
        categoryId: 'employee_loan',
        employeeId: 'emp-2',
        amount: 200,
        date: '2026-06-11',
      },
    ];

    expect(getVisibleLoanRecords(loans, expenses).map(loan => loan.id)).toEqual(['legacy-loan']);
  });
});
