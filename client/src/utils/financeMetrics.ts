import { getLocalDateString } from './exchangeRate';
import { toTimestampMillis } from './localTime';

export const isPurchaseRelatedExpense = (expense: any): boolean => {
  return expense?.relatedType === 'purchase' ||
    expense?.relatedType === 'supplier_repayment' ||
    expense?.categoryId === 'supplier_payment' ||
    (typeof expense?.id === 'string' && expense.id.startsWith('purchase_'));
};

const toMoneyNumber = (value: any): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const getOrderCollectedAmount = (order: any): number => {
  if (!order || order.status === 'cancelled') return 0;

  const totalAmount = toMoneyNumber(order.totalAmount || order.total);
  const paidAmount = Math.max(toMoneyNumber(order.settledAmount), toMoneyNumber(order.paidAmount));
  const paymentParts = toMoneyNumber(order.cashAmount) + toMoneyNumber(order.cardAmount);

  if (order.paymentStatus === 'paid') {
    return totalAmount || paidAmount || paymentParts;
  }

  if (order.paymentStatus === 'partial') {
    return paidAmount || paymentParts;
  }

  // Legacy completed records may not have paymentStatus but were already settled.
  if (!order.paymentStatus && order.status === 'completed') {
    return totalAmount || paidAmount || paymentParts;
  }

  return 0;
};

export const getOrderPaymentBreakdown = (order: any): { cash: number; card: number } => {
  const collectedAmount = getOrderCollectedAmount(order);
  if (collectedAmount <= 0) return { cash: 0, card: 0 };

  const cashAmount = toMoneyNumber(order.cashAmount);
  const cardAmount = toMoneyNumber(order.cardAmount);
  if (cashAmount > 0 || cardAmount > 0) {
    return {
      cash: cashAmount,
      card: cardAmount,
    };
  }

  if (order.paymentMethod === 'card') {
    return { cash: 0, card: collectedAmount };
  }

  if (order.paymentMethod === 'mixed') {
    return { cash: collectedAmount, card: 0 };
  }

  return { cash: collectedAmount, card: 0 };
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
