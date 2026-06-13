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

export interface ExpenseReportDetail {
  id: string;
  dateKey: string;
  type: 'purchase' | 'operating';
  typeLabel: string;
  category: string;
  description: string;
  amount: number;
  createdAt: string;
}

export interface ExpenseReportSummary {
  type: 'purchase' | 'operating';
  typeLabel: string;
  category: string;
  count: number;
  amount: number;
}

export interface ExpenseReportGroup extends ExpenseReportSummary {
  title: string;
  details: ExpenseReportDetail[];
}

const getExpenseType = (expense: any): 'purchase' | 'operating' =>
  isPurchaseRelatedExpense(expense) ? 'purchase' : 'operating';

const getExpenseTypeLabel = (type: 'purchase' | 'operating'): string =>
  type === 'purchase' ? '\u91c7\u8d2d\u4ed8\u6b3e' : '\u65e5\u5e38\u5f00\u652f';

const getCategoryNameFromList = (categoryId: string, categories: any[]): string => {
  if (!categoryId) return '';
  const category = categories.find((item: any) =>
    String(item?.id || '') === categoryId ||
    String(item?.key || '') === categoryId ||
    String(item?.code || '') === categoryId
  );
  return String(category?.name || '');
};

const looksLikeInternalCategoryId = (value: string): boolean =>
  /^cat[-_]/i.test(value) || value === 'supplier_payment';

const getExpenseCategoryLabel = (
  expense: any,
  type: 'purchase' | 'operating',
  categories: any[]
): string => {
  const supplierName = String(expense?.supplierName || '').trim();
  const orderNumber = String(expense?.orderNumber || expense?.invoiceNumber || '').trim();

  if (type === 'purchase' && (supplierName || orderNumber)) {
    return `${supplierName || getExpenseTypeLabel(type)}${orderNumber ? ` - \u5355\u53f7 ${orderNumber}` : ''}`;
  }

  const categoryId = String(expense?.categoryId || '').trim();
  const categoryFromList = getCategoryNameFromList(categoryId, categories);
  if (categoryFromList) return categoryFromList;

  const explicitCategory = String(expense?.categoryName || expense?.category || '').trim();
  if (explicitCategory) return explicitCategory;

  if (categoryId && !looksLikeInternalCategoryId(categoryId)) return categoryId;

  return getExpenseTypeLabel(type);
};

export const buildDailyExpenseBreakdown = (
  expenses: any[],
  date: string,
  categories: any[] = []
): { summaries: ExpenseReportSummary[]; details: ExpenseReportDetail[]; groups: ExpenseReportGroup[] } => {
  const details = expenses
    .filter((expense: any) => getExpenseDateKey(expense) === date)
    .map((expense: any): ExpenseReportDetail => {
      const type = getExpenseType(expense);
      return {
        id: String(expense?.id || ''),
        dateKey: date,
        type,
        typeLabel: getExpenseTypeLabel(type),
        category: getExpenseCategoryLabel(expense, type, categories),
        description: String(expense?.description || expense?.note || expense?.supplierName || '-'),
        amount: toMoneyNumber(expense?.amount),
        createdAt: String(expense?.createdAt || expense?.updatedAt || expense?.date || expense?.id || ''),
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const summaryMap = new Map<string, ExpenseReportSummary>();
  details.forEach(detail => {
    const key = `${detail.type}|${detail.category}`;
    const current = summaryMap.get(key) || {
      type: detail.type,
      typeLabel: detail.typeLabel,
      category: detail.category,
      count: 0,
      amount: 0,
    };

    current.count += 1;
    current.amount += detail.amount;
    summaryMap.set(key, current);
  });

  const summaries = Array.from(summaryMap.values()).sort((a, b) => {
    if (a.type !== b.type) return a.type === 'purchase' ? -1 : 1;
    return a.category.localeCompare(b.category);
  });
  const groups = summaries.map(summary => ({
    ...summary,
    title: summary.category,
    details: details.filter(detail => detail.type === summary.type && detail.category === summary.category),
  }));

  return { summaries, details, groups };
};

export const calculateFinancialReportTotals = ({
  cashPayment,
  cardPayment,
  purchaseAmount,
  expenseAmount,
  handoverAmount,
}: {
  cashPayment: number;
  cardPayment: number;
  purchaseAmount: number;
  expenseAmount: number;
  handoverAmount?: number;
}): { totalSales: number; profit: number; difference?: number } => {
  const totalSales = toMoneyNumber(cashPayment) + toMoneyNumber(cardPayment);
  const profit = totalSales - toMoneyNumber(purchaseAmount) - toMoneyNumber(expenseAmount);
  const difference = handoverAmount !== undefined
    ? toMoneyNumber(cashPayment) - toMoneyNumber(handoverAmount)
    : undefined;

  return {
    totalSales,
    profit,
    difference,
  };
};

export const getLatestHandoverAmountForDate = (handovers: any[], date: string): number | undefined => {
  const latest = handovers
    .filter((handover: any) => String(handover?.t || '').startsWith(date))
    .sort((a: any, b: any) => {
      const aTime = toTimestampMillis(a?.createdAt || a?.updatedAt || String(a?.t || '').replace(' ', 'T')) || 0;
      const bTime = toTimestampMillis(b?.createdAt || b?.updatedAt || String(b?.t || '').replace(' ', 'T')) || 0;
      return bTime - aTime;
    })[0];

  if (!latest) return undefined;
  const amount = toMoneyNumber(latest.rawG ?? latest.g);
  return amount || undefined;
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
    const tenderedTotal = cashAmount + cardAmount;
    const changeAmount = Math.max(tenderedTotal - collectedAmount, 0);
    const settledCash = Math.max(cashAmount - changeAmount, 0);
    const settledCard = Math.min(cardAmount, Math.max(collectedAmount - settledCash, 0));

    return {
      cash: settledCash,
      card: settledCard,
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

export const getOrderFinancialDateKey = (order: any): string => {
  if (getOrderCollectedAmount(order) <= 0) return '';

  const timestamp = toTimestampMillis(
    order?.lastPaidAt ||
    order?.paidAt ||
    order?.completedAt ||
    order?.clearedAt ||
    order?.date ||
    order?.createdAt ||
    order?.orderDate ||
    order?.updatedAt
  );

  return timestamp ? getLocalDateString(new Date(timestamp)) : '';
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
