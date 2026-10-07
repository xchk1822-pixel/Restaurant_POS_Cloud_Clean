import { getLocalDateString } from './exchangeRate';
import { toTimestampMillis } from './localTime';
import { getExpenseCategoryPath, normalizeExpenseCategories } from './expenseCategories';
import { findExpensePurchaseOrder } from './expensePurchaseLink';
import { isEmployeeLoanExpense } from './employeeLoans';

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

const hasExplicitMoneyValue = (value: any): boolean =>
  value !== undefined && value !== null && value !== '' && Number.isFinite(Number(value));

export const getExpenseProfitAmount = (expense: any): number => {
  if (isEmployeeLoanExpense(expense)) return 0;
  return hasExplicitMoneyValue(expense?.profitAmount)
    ? toMoneyNumber(expense.profitAmount)
    : toMoneyNumber(expense?.amount);
};

export const getExpenseCashAmount = (expense: any): number => (
  hasExplicitMoneyValue(expense?.cashAmount)
    ? toMoneyNumber(expense.cashAmount)
    : toMoneyNumber(expense?.amount)
);

const roundMoney = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;

export interface ExpenseReportDetail {
  id: string;
  dateKey: string;
  type: 'purchase' | 'operating';
  typeLabel: string;
  parentCategory?: string;
  category: string;
  fullCategory?: string;
  description: string;
  amount: number;
  createdAt: string;
  supplierName?: string;
  orderNumber?: string;
  quantity?: number;
  unitPrice?: number;
}

export interface ExpenseReportSummary {
  type: 'purchase' | 'operating';
  typeLabel: string;
  parentCategory?: string;
  category: string;
  fullCategory?: string;
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

const getExpenseCategoryLabels = (
  expense: any,
  type: 'purchase' | 'operating',
  categories: any[]
): { parentCategory?: string; category: string; fullCategory?: string } => {
  if (type === 'purchase') {
    const category = getExpenseCategoryLabel(expense, type, categories);
    return { parentCategory: getExpenseTypeLabel(type), category, fullCategory: category };
  }

  const normalizedCategories = normalizeExpenseCategories(categories);
  const path = getExpenseCategoryPath(String(expense?.categoryId || ''), normalizedCategories, expense);
  return {
    parentCategory: path.parentName,
    category: path.categoryName,
    fullCategory: path.fullName,
  };
};

const normalizeText = (value: any): string => String(value || '').trim();

const buildExpenseDetailRows = (
  expense: any,
  date: string,
  type: 'purchase' | 'operating',
  typeLabel: string,
  labels: { parentCategory?: string; category: string; fullCategory?: string },
  purchaseOrders: any[]
): ExpenseReportDetail[] => {
  const baseDetail = {
    id: String(expense?.id || ''),
    dateKey: date,
    type,
    typeLabel,
    parentCategory: labels.parentCategory,
    category: labels.category,
    fullCategory: labels.fullCategory,
    createdAt: String(expense?.createdAt || expense?.updatedAt || expense?.date || expense?.id || ''),
    supplierName: normalizeText(expense?.supplierName) || undefined,
    orderNumber: normalizeText(expense?.orderNumber || expense?.invoiceNumber) || undefined,
  };

  if (type === 'purchase') {
    const order = findExpensePurchaseOrder(expense, purchaseOrders);
    const orderItems = Array.isArray(order?.items) ? order.items : [];
    if (orderItems.length > 0) {
      return orderItems.map((item: any, index: number) => ({
        ...baseDetail,
        id: `${baseDetail.id || order?.id || 'purchase'}-${index}`,
        category: getExpenseCategoryLabel({ ...expense, supplierName: order?.supplierName || expense?.supplierName, orderNumber: order?.orderNumber || expense?.orderNumber }, type, []),
        fullCategory: getExpenseCategoryLabel({ ...expense, supplierName: order?.supplierName || expense?.supplierName, orderNumber: order?.orderNumber || expense?.orderNumber }, type, []),
        description: String(item?.itemName || item?.name || '-'),
        amount: toMoneyNumber(item?.subtotal ?? (toMoneyNumber(item?.quantity) * toMoneyNumber(item?.unitPrice))),
        supplierName: normalizeText(order?.supplierName || expense?.supplierName) || undefined,
        orderNumber: normalizeText(order?.orderNumber || expense?.orderNumber || expense?.invoiceNumber) || undefined,
        quantity: toMoneyNumber(item?.quantity),
        unitPrice: toMoneyNumber(item?.unitPrice),
      }));
    }
  }

  return [{
    ...baseDetail,
    description: String(expense?.description || expense?.note || expense?.supplierName || '-'),
    amount: type === 'operating' ? getExpenseProfitAmount(expense) : toMoneyNumber(expense?.amount),
  }];
};

export const buildDailyExpenseBreakdown = (
  expenses: any[],
  date: string,
  categories: any[] = [],
  purchaseOrders: any[] = []
): { summaries: ExpenseReportSummary[]; details: ExpenseReportDetail[]; groups: ExpenseReportGroup[] } => {
  const filteredExpenses = expenses.filter((expense: any) =>
    getExpenseDateKey(expense) === date && !isEmployeeLoanExpense(expense)
  );
  const details = filteredExpenses
    .flatMap((expense: any): ExpenseReportDetail[] => {
      const type = getExpenseType(expense);
      const typeLabel = getExpenseTypeLabel(type);
      const labels = getExpenseCategoryLabels(expense, type, categories);
      return buildExpenseDetailRows(expense, date, type, typeLabel, labels, purchaseOrders);
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const summaryMap = new Map<string, ExpenseReportSummary>();
  filteredExpenses.forEach(expense => {
    const type = getExpenseType(expense);
    const typeLabel = getExpenseTypeLabel(type);
    const labels = getExpenseCategoryLabels(expense, type, categories);
    const key = `${type}|${labels.fullCategory || labels.category}`;
    const current = summaryMap.get(key) || {
      type,
      typeLabel,
      parentCategory: labels.parentCategory,
      category: labels.category,
      fullCategory: labels.fullCategory,
      count: 0,
      amount: 0,
    };

    current.count += 1;
    current.amount += type === 'operating'
      ? getExpenseProfitAmount(expense)
      : toMoneyNumber(expense?.amount);
    summaryMap.set(key, current);
  });

  const summaries = Array.from(summaryMap.values()).sort((a, b) => {
    if (a.type !== b.type) return a.type === 'purchase' ? -1 : 1;
    return String(a.parentCategory || '').localeCompare(String(b.parentCategory || '')) || a.category.localeCompare(b.category);
  });
  const groups = summaries.map(summary => ({
    ...summary,
    title: summary.fullCategory || summary.category,
    details: details.filter(detail => detail.type === summary.type && (detail.fullCategory || detail.category) === (summary.fullCategory || summary.category)),
  }));

  return { summaries, details, groups };
};

export const calculateFinancialReportTotals = ({
  cashPayment,
  cardPayment,
  purchaseAmount,
  expenseAmount,
  cashExpenseAmount,
  handoverAmount,
}: {
  cashPayment: number;
  cardPayment: number;
  purchaseAmount: number;
  expenseAmount: number;
  cashExpenseAmount?: number;
  handoverAmount?: number;
}): {
  totalSales: number;
  profit: number;
  difference?: number;
  expectedCashHandover: number;
  fundingGap: number;
} => {
  const cash = roundMoney(toMoneyNumber(cashPayment));
  const card = roundMoney(toMoneyNumber(cardPayment));
  const purchase = toMoneyNumber(purchaseAmount);
  const expense = toMoneyNumber(expenseAmount);
  const cashExpense = cashExpenseAmount === undefined
    ? expense
    : toMoneyNumber(cashExpenseAmount);
  const totalSales = roundMoney(cash + card);
  const baseProfit = roundMoney(totalSales - purchase - expense);
  const rawExpectedCashHandover = roundMoney(cash - purchase - cashExpense);
  const expectedCashHandover = Math.max(rawExpectedCashHandover, 0);
  const fundingGap = Math.max(roundMoney(-rawExpectedCashHandover), 0);
  const difference = handoverAmount !== undefined
    ? roundMoney(toMoneyNumber(handoverAmount) - expectedCashHandover)
    : undefined;
  const profit = roundMoney(baseProfit + (difference || 0));

  return {
    totalSales,
    profit,
    difference,
    expectedCashHandover,
    fundingGap,
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
  const rawAmount = latest.rawG ?? latest.g;
  if (rawAmount === undefined || rawAmount === null || rawAmount === '') return undefined;
  return toMoneyNumber(rawAmount);
};

export const getOrderCollectedAmount = (order: any): number => {
  if (!order || order.isDeleted || order.status === 'cancelled') return 0;

  const hasTotalAmount = order.totalAmount !== undefined && order.totalAmount !== null && order.totalAmount !== '';
  const hasLegacyTotal = order.total !== undefined && order.total !== null && order.total !== '';
  const hasRecordedTotal = hasTotalAmount || hasLegacyTotal;
  const totalAmount = toMoneyNumber(
    hasTotalAmount ? order.totalAmount : order.total
  );
  const paidAmount = Math.max(toMoneyNumber(order.settledAmount), toMoneyNumber(order.paidAmount));
  const paymentParts = toMoneyNumber(order.cashAmount) + toMoneyNumber(order.cardAmount);

  if (order.paymentStatus === 'paid') {
    return hasRecordedTotal ? totalAmount : paidAmount || paymentParts;
  }

  if (order.paymentStatus === 'partial') {
    return paidAmount || paymentParts;
  }

  // Legacy completed records may not have paymentStatus but were already settled.
  if (!order.paymentStatus && order.status === 'completed') {
    return hasRecordedTotal ? totalAmount : paidAmount || paymentParts;
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

  if (order?.orderType === 'reservation') {
    if (order?.status !== 'completed') return '';
    const completedTimestamp = toTimestampMillis(order?.completedAt || order?.clearedAt);
    return completedTimestamp ? getLocalDateString(new Date(completedTimestamp)) : '';
  }

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

const getReservationPaymentRecords = (order: any): any[] => {
  if (Array.isArray(order?.reservationPayments) && order.reservationPayments.length > 0) {
    return order.reservationPayments;
  }

  const paidAt = order?.lastPaidAt || order?.paidAt;
  if (!paidAt || getOrderCollectedAmount(order) <= 0) return [];
  const breakdown = getOrderPaymentBreakdown(order);
  return [{
    id: `legacy-${String(order?.id || '')}`,
    paidAt,
    amount: breakdown.cash + breakdown.card,
    cashAmount: breakdown.cash,
    cardAmount: breakdown.card,
  }];
};

export const getReservationCashFlowForDate = (
  order: any,
  date: string
): { total: number; cash: number; card: number } => {
  if (!order || order.isDeleted || order.status === 'cancelled' || order.orderType !== 'reservation' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { total: 0, cash: 0, card: 0 };
  }

  return getReservationPaymentRecords(order).reduce((result, payment) => {
    const timestamp = toTimestampMillis(payment?.paidAt || payment?.createdAt);
    if (!timestamp || getLocalDateString(new Date(timestamp)) !== date) return result;
    const cash = Math.max(toMoneyNumber(payment?.cashAmount), 0);
    const card = Math.max(toMoneyNumber(payment?.cardAmount), 0);
    const explicitAmount = Math.max(toMoneyNumber(payment?.amount), 0);
    const total = explicitAmount > 0 ? explicitAmount : cash + card;
    return {
      total: roundMoney(result.total + total),
      cash: roundMoney(result.cash + cash),
      card: roundMoney(result.card + card),
    };
  }, { total: 0, cash: 0, card: 0 });
};

export const getReservationPrepaymentAmountForDate = (order: any, date: string): number => {
  const paymentFlow = getReservationCashFlowForDate(order, date);
  if (paymentFlow.total <= 0) return 0;

  const completionTimestamp = toTimestampMillis(order?.completedAt || order?.clearedAt);
  if (!completionTimestamp) return paymentFlow.total;
  const completionDate = getLocalDateString(new Date(completionTimestamp));
  return date < completionDate ? paymentFlow.total : 0;
};

export const calculateHandoverDifferenceForDates = ({
  dates,
  orders,
  expenses,
  handovers,
}: {
  dates: string[];
  orders: any[];
  expenses: any[];
  handovers: any[];
}): number => roundMoney(dates.reduce((total, date) => {
  const handoverAmount = getLatestHandoverAmountForDate(handovers, date);
  if (handoverAmount === undefined) return total;
  const recognizedCashPayment = orders
    .filter(order => getOrderFinancialDateKey(order) === date)
    .reduce((sum, order) => sum + getOrderPaymentBreakdown(order).cash, 0);
  const recognizedReservationCash = orders
    .filter(order => order?.orderType === 'reservation' && getOrderFinancialDateKey(order) === date)
    .reduce((sum, order) => sum + getOrderPaymentBreakdown(order).cash, 0);
  const reservationCashFlow = orders.reduce(
    (sum, order) => sum + getReservationCashFlowForDate(order, date).cash,
    0
  );
  const cashPayment = recognizedCashPayment - recognizedReservationCash + reservationCashFlow;
  const dailyExpenses = expenses.filter(expense => getExpenseDateKey(expense) === date);
  const purchaseAmount = dailyExpenses.filter(isPurchaseRelatedExpense).reduce((sum, expense) => sum + toMoneyNumber(expense?.amount), 0);
  const operatingExpenses = dailyExpenses.filter(expense => !isPurchaseRelatedExpense(expense));
  const expenseAmount = operatingExpenses.reduce((sum, expense) => sum + getExpenseProfitAmount(expense), 0);
  const cashExpenseAmount = operatingExpenses.reduce((sum, expense) => sum + getExpenseCashAmount(expense), 0);
  const { difference = 0 } = calculateFinancialReportTotals({
    cashPayment,
    cardPayment: 0,
    purchaseAmount,
    expenseAmount,
    cashExpenseAmount,
    handoverAmount,
  });
  return total + difference;
}, 0));

export interface OrderStatusSummary {
  completedOrders: number;
  dineInOrders: number;
  takeoutOrders: number;
  deliveryOrders: number;
  reservationOrders: number;
  cancelledOrders: number;
  cancelledItems: number;
}

const getDateKeyFromValues = (...values: any[]): string => {
  for (const value of values) {
    const timestamp = toTimestampMillis(value);
    if (timestamp) return getLocalDateString(new Date(timestamp));
  }
  return '';
};

export const getOrderCancellationDateKey = (order: any): string => {
  if (!order || order.isDeleted || order.status !== 'cancelled') return '';
  return getDateKeyFromValues(
    order?.cancelledAt,
    order?.cancelAt,
    order?.voidedAt,
    order?.updatedAt,
    order?.createdAt,
    order?.date,
    order?.orderDate
  );
};

const getCancelRecordDateKey = (record: any, order: any): string => getDateKeyFromValues(
  record?.cancelledAt,
  record?.cancelAt,
  record?.voidedAt,
  record?.createdAt,
  record?.updatedAt,
  order?.updatedAt,
  order?.createdAt,
  order?.date,
  order?.orderDate
);

const getCancelRecordQuantity = (record: any): number => {
  const explicitQuantity = toMoneyNumber(
    record?.quantity ??
    record?.cancelledQuantity ??
    record?.cancelQuantity ??
    record?.voidedQuantity
  );
  return explicitQuantity > 0 ? explicitQuantity : 1;
};

export const getCancelledItemCountForDate = (order: any, date: string): number => {
  if (!order || order.isDeleted || !date) return 0;

  const orderCancelRecords = Array.isArray(order?.cancelRecords)
    ? order.cancelRecords.filter((record: any) => record?.orderType !== 'order' && record?.type !== 'order')
    : [];

  if (orderCancelRecords.length > 0) {
    return orderCancelRecords.reduce((sum: number, record: any) => (
      getCancelRecordDateKey(record, order) === date ? sum + getCancelRecordQuantity(record) : sum
    ), 0);
  }

  const items = Array.isArray(order?.items) ? order.items : [];
  let cancelledItems = 0;
  let hasDatedItemRecords = false;

  items.forEach((item: any) => {
    const itemCancelRecords = Array.isArray(item?.cancelRecords) ? item.cancelRecords : [];
    if (itemCancelRecords.length > 0) {
      hasDatedItemRecords = true;
      itemCancelRecords.forEach((record: any) => {
        if (getCancelRecordDateKey(record, order) === date) {
          cancelledItems += getCancelRecordQuantity(record);
        }
      });
    }
  });

  if (hasDatedItemRecords) return cancelledItems;

  const fallbackDate = getOrderFinancialDateKey(order) || getOrderCancellationDateKey(order) || getDateKeyFromValues(order?.createdAt, order?.date, order?.orderDate);
  if (fallbackDate !== date) return 0;

  return items.reduce((sum: number, item: any) => {
    const cancelledQuantity = toMoneyNumber(
      item?.cancelledQuantity ??
      item?.cancelQuantity ??
      item?.voidedQuantity
    );
    return sum + Math.max(cancelledQuantity, 0);
  }, 0);
};

export const calculateOrderStatusSummary = (orders: any[], date: string): OrderStatusSummary => {
  return (Array.isArray(orders) ? orders : []).reduce((summary: OrderStatusSummary, order: any) => {
    if (getOrderFinancialDateKey(order) === date && getOrderCollectedAmount(order) > 0) {
      summary.completedOrders += 1;
      const orderType = order?.orderType || 'dine_in';
      if (orderType === 'delivery') {
        summary.deliveryOrders += 1;
      } else if (orderType === 'takeout') {
        summary.takeoutOrders += 1;
      } else if (orderType === 'reservation') {
        summary.reservationOrders += 1;
      } else {
        summary.dineInOrders += 1;
      }
    }
    if (getOrderCancellationDateKey(order) === date) {
      summary.cancelledOrders += 1;
    }
    summary.cancelledItems += getCancelledItemCountForDate(order, date);
    return summary;
  }, { completedOrders: 0, dineInOrders: 0, takeoutOrders: 0, deliveryOrders: 0, reservationOrders: 0, cancelledOrders: 0, cancelledItems: 0 });
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
      return sum + getExpenseProfitAmount(expense);
    }
    return sum;
  }, 0);
};
