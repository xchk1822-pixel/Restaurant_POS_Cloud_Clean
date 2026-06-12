export interface EmployeeLoanRecord {
  id: string;
  employeeId: string;
  date?: string;
  amount?: number;
  remainingAmount?: number;
  status?: string;
  expenseId?: string;
  relatedExpenseId?: string;
}

export interface EmployeeLoanExpense {
  id?: string;
  employeeId?: string;
  date?: string;
  amount?: number;
  categoryId?: string;
  relatedType?: string;
  relatedLoanId?: string;
}

const toNumber = (value: unknown): number => {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
};

export const isEmployeeLoanExpense = (expense: EmployeeLoanExpense): boolean => (
  expense.relatedType === 'loan'
  || expense.categoryId === 'employee_loan'
  || String(expense.id || '').startsWith('loan_')
);

export const loanMatchesExpense = (
  loan: EmployeeLoanRecord,
  expense: EmployeeLoanExpense
): boolean => {
  if (!isEmployeeLoanExpense(expense)) return false;

  if (expense.relatedLoanId && expense.relatedLoanId === loan.id) return true;
  if (loan.expenseId && expense.id === loan.expenseId) return true;
  if (loan.relatedExpenseId && expense.id === loan.relatedExpenseId) return true;

  return (
    !expense.relatedLoanId
    && !loan.expenseId
    && !loan.relatedExpenseId
    && expense.employeeId === loan.employeeId
    && expense.date === loan.date
    && toNumber(expense.amount) === toNumber(loan.amount)
  );
};

export const getVisibleLoanRecords = <T extends EmployeeLoanRecord>(
  loans: T[],
  expenses: EmployeeLoanExpense[]
): T[] => {
  return loans.filter((loan) => {
    if (loan.status !== 'active') return false;
    if (toNumber(loan.remainingAmount) <= 0) return false;
    return expenses.some(expense => loanMatchesExpense(loan, expense));
  });
};
