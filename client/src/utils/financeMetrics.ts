import { getLocalDateString } from './exchangeRate';
import { toTimestampMillis } from './localTime';

export const isPurchaseRelatedExpense = (expense: any): boolean => {
  return expense?.relatedType === 'purchase' ||
    expense?.relatedType === 'supplier_repayment' ||
    expense?.categoryId === 'supplier_payment' ||
    (typeof expense?.id === 'string' && expense.id.startsWith('purchase_'));
};

export const getExpenseDateKey = (expense: any): string => {
  if (expense?.date && /^\d{4}-\d{2}-\d{2}$/.test(String(expense.date))) {
    return String(expense.date);
  }

  const timestamp = toTimestampMillis(expense?.date || expense?.createdAt || expense?.updatedAt);
  return timestamp ? getLocalDateString(new Date(timestamp)) : '';
};

export const isDateInHalfOpenRange = (dateKey: string, startDate: string, endDate: string): boolean => {
  return Boolean(dateKey && dateKey >= startDate && dateKey < endDate);
};

export const sumExpensesByKind = (
  expenses: any[],
  startDate: string,
  endDate: string,
  kind: 'purchase' | 'operating'
): number => {
  return expenses.reduce((sum: number, expense: any) => {
    const dateKey = getExpenseDateKey(expense);
    if (!isDateInHalfOpenRange(dateKey, startDate, endDate)) return sum;

    const purchaseRelated = isPurchaseRelatedExpense(expense);
    if (kind === 'purchase' && purchaseRelated) {
      return sum + (Number(expense.amount) || 0);
    }
    if (kind === 'operating' && !purchaseRelated) {
      return sum + (Number(expense.amount) || 0);
    }
    return sum;
  }, 0);
};
