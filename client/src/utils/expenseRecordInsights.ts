import { getExpenseCategoryPath, normalizeExpenseCategories } from './expenseCategories';
import { getExpenseDateKey, isPurchaseRelatedExpense } from './financeMetrics';
import { findExpensePurchaseOrder, getExpensePurchaseItems } from './expensePurchaseLink';

export interface ExpenseRecordFilters {
  parentCategoryId: string;
  categoryId: string;
  dateMode?: 'all' | 'today' | 'date' | 'month';
  date: string;
  month?: string;
  query: string;
}

export interface ExpenseDetailRanking {
  key: string;
  label: string;
  amount: number;
  quantity: number;
  count: number;
  amountShare: number;
}

const roundMoney = (value: number): number => Math.round((Number(value) || 0) * 100) / 100;
const normalize = (value: any): string => String(value || '').trim().toLowerCase();
const asArray = (value: any): any[] => Array.isArray(value) ? value : [];

const collectItemSearchText = (items: any[]): string => (
  items.map(item => [
    item?.itemName,
    item?.name,
    item?.category,
    item?.unit,
    item?.quantity,
    item?.unitPrice,
    item?.subtotal,
  ].filter(Boolean).join(' ')).join(' ')
);

export const buildExpenseRecordSearchText = (
  expense: any,
  categories: any[],
  purchaseOrders: any[]
): string => {
  const normalizedCategories = normalizeExpenseCategories(categories);
  const categoryPath = getExpenseCategoryPath(String(expense?.categoryId || ''), normalizedCategories, expense);
  const order = findExpensePurchaseOrder(expense, purchaseOrders);

  return [
    expense?.description,
    expense?.note,
    expense?.category,
    expense?.categoryName,
    expense?.parentCategoryName,
    categoryPath.fullName,
    expense?.supplierName,
    order?.supplierName,
    expense?.orderNumber,
    expense?.invoiceNumber,
    expense?.purchaseOrderId,
    order?.orderNumber,
    collectItemSearchText(getExpensePurchaseItems(expense, purchaseOrders)),
  ].filter(Boolean).join(' ').toLowerCase();
};

export const filterExpenseRecords = (
  expenses: any[],
  categories: any[],
  purchaseOrders: any[],
  filters: ExpenseRecordFilters
): any[] => {
  const normalizedCategories = normalizeExpenseCategories(categories);
  const query = normalize(filters.query);

  return asArray(expenses).filter(expense => {
    const categoryPath = getExpenseCategoryPath(String(expense?.categoryId || ''), normalizedCategories, expense);
    const dateMode = filters.dateMode || (filters.date ? 'date' : 'all');
    const expenseDate = getExpenseDateKey(expense);
    if (filters.parentCategoryId !== 'all' && categoryPath.parentId !== filters.parentCategoryId) return false;
    if (filters.categoryId !== 'all' && String(expense?.categoryId || '') !== filters.categoryId) return false;
    if ((dateMode === 'today' || dateMode === 'date') && filters.date && expenseDate !== filters.date) return false;
    if (dateMode === 'month' && filters.month && !expenseDate.startsWith(filters.month)) return false;
    if (query && !buildExpenseRecordSearchText(expense, normalizedCategories, purchaseOrders).includes(query)) return false;
    return true;
  });
};

const getFallbackDetailLabel = (expense: any): string => (
  String(expense?.description || expense?.categoryName || expense?.category || expense?.supplierName || '未命名开支').trim()
);

export const buildExpenseDetailRankings = (
  expenses: any[],
  purchaseOrders: any[],
  query = '',
  topN = 8
): ExpenseDetailRanking[] => {
  const queryText = normalize(query);
  const rankingMap = new Map<string, ExpenseDetailRanking>();

  const addRanking = (label: string, amount: number, quantity = 0) => {
    const normalizedLabel = String(label || '').trim() || '未命名开支';
    if (queryText && !normalize(normalizedLabel).includes(queryText)) return;
    const key = normalize(normalizedLabel);
    const current = rankingMap.get(key) || { key, label: normalizedLabel, amount: 0, quantity: 0, count: 0, amountShare: 0 };
    current.amount = roundMoney(current.amount + amount);
    current.quantity = roundMoney(current.quantity + quantity);
    current.count += 1;
    rankingMap.set(key, current);
  };

  asArray(expenses).forEach(expense => {
    const items = isPurchaseRelatedExpense(expense) ? getExpensePurchaseItems(expense, purchaseOrders) : [];
    if (items.length > 0) {
      items.forEach(item => addRanking(
        String(item?.itemName || item?.name || '未命名商品'),
        roundMoney(Number(item?.subtotal ?? ((Number(item?.quantity) || 0) * (Number(item?.unitPrice) || 0)))),
        Number(item?.quantity) || 0
      ));
      return;
    }
    addRanking(getFallbackDetailLabel(expense), roundMoney(Number(expense?.amount) || 0), 0);
  });

  const rankings = Array.from(rankingMap.values());
  const totalAmount = rankings.reduce((sum, item) => sum + item.amount, 0);

  return rankings
    .map(item => ({
      ...item,
      amount: roundMoney(item.amount),
      quantity: roundMoney(item.quantity),
      amountShare: totalAmount > 0 ? roundMoney((item.amount / totalAmount) * 100) : 0,
    }))
    .sort((a, b) => b.amount - a.amount || b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, topN);
};
