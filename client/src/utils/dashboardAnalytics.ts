import { getLocalDateString } from './exchangeRate';
import { getOrderCollectedAmount, getOrderFinancialDateKey, getOrderPaymentBreakdown, isPurchaseRelatedExpense } from './financeMetrics';
import { getExpenseCategoryPath, normalizeExpenseCategories } from './expenseCategories';
import { findExpensePurchaseOrder } from './expensePurchaseLink';

export type RankingScope = 'all' | 'dishes' | 'beverages';
export type RankingSortBy = 'revenue' | 'quantity';
export type BeverageCategoryFilter = 'all' | 'Cerveza' | 'Bebida' | 'Jugo';
export type DashboardOrderTypeFilter = 'all' | 'dine_in' | 'takeout' | 'delivery';
export type ExpenseRankingScope = 'all' | 'operating' | 'purchase';
export type ExpenseRankingSortBy = 'amount' | 'count';

export interface SalesRankingFilters {
  scope: RankingScope;
  sortBy: RankingSortBy;
  orderType: DashboardOrderTypeFilter;
  topN: number;
  beverageCategory: BeverageCategoryFilter;
}

export interface SalesRanking {
  name: string;
  category: string;
  quantity: number;
  revenue: number;
  averagePrice: number;
  revenueShare: number;
}

export interface ExpenseRankingFilters {
  scope: ExpenseRankingScope;
  sortBy: ExpenseRankingSortBy;
  topN: number;
}

export interface ExpenseRanking {
  key: string;
  label: string;
  parentCategory: string;
  fullCategory: string;
  type: 'purchase' | 'operating';
  typeLabel: string;
  count: number;
  amount: number;
  averageAmount: number;
  amountShare: number;
}

export interface ExpenseRankingMovement {
  key: string;
  label: string;
  parentCategory: string;
  fullCategory: string;
  type: 'purchase' | 'operating';
  typeLabel: string;
  currentAmount: number;
  previousAmount: number;
  amountDelta: number;
  amountPercent: number | null;
  currentCount: number;
  previousCount: number;
  countDelta: number;
  countPercent: number | null;
}

export interface RankingMovement {
  name: string;
  category: string;
  currentQuantity: number;
  previousQuantity: number;
  quantityDelta: number;
  quantityPercent: number | null;
  currentRevenue: number;
  previousRevenue: number;
  revenueDelta: number;
  revenuePercent: number | null;
}

export interface MonthlyCalendarDay {
  date: string;
  day: number;
  inMonth: boolean;
  revenue: number;
  orderCount: number;
  averageDeltaPercent: number | null;
  intensity: number;
}

export interface MonthlyCalendarWeek {
  days: MonthlyCalendarDay[];
  weeklyRevenue: number;
  weeklyOrders: number;
}

export interface MonthlySalesCalendar {
  month: string;
  weekdays: string[];
  weeks: MonthlyCalendarWeek[];
  totalRevenue: number;
  totalOrders: number;
  dailyAverage: number;
  bestWeekday: { weekday: string; revenue: number; orderCount: number } | null;
  worstWeekday: { weekday: string; revenue: number; orderCount: number } | null;
}

export interface DashboardRange {
  startDate: string;
  endDateExclusive: string;
  previousStartDate: string;
  previousEndDateExclusive: string;
  label: string;
  previousLabel: string;
}

export interface PeriodComparison {
  value: number;
  percent: number | null;
  direction: 'up' | 'down' | 'flat';
}

export interface DashboardKpis {
  totalSales: number;
  orderCount: number;
  averageTicket: number;
  cashPayment: number;
  cardPayment: number;
  profit: number;
}

const weekdayLabels = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
const beverageKeys = new Set(['cerveza', 'beer', 'alcohol', 'bebida', 'beverage', 'drink', 'jugo', 'jugos', 'juice']);
const cervezaKeys = new Set(['cerveza', 'beer', 'alcohol']);
const bebidaKeys = new Set(['bebida', 'beverage', 'drink']);
const jugoKeys = new Set(['jugo', 'jugos', 'juice']);

const roundMoney = (value: number): number => Math.round((Number(value) || 0) * 100) / 100;

const normalize = (value: any): string => String(value || '').trim().toLowerCase();

const addDays = (date: Date, days: number): Date => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const parseDateKey = (dateKey: string): Date => {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, month - 1, day);
};

const toDateKey = (date: Date): string => getLocalDateString(date);

const getMonthKey = (value: string): string => /^\d{4}-\d{2}$/.test(value) ? value : getLocalDateString(new Date(value)).slice(0, 7);

const getDaysBetween = (startDate: string, endDateExclusive: string): number => {
  const start = parseDateKey(startDate).getTime();
  const end = parseDateKey(endDateExclusive).getTime();
  return Math.max(1, Math.round((end - start) / 86400000));
};

const calculatePreviousRange = (startDate: string, endDateExclusive: string): { previousStartDate: string; previousEndDateExclusive: string } => {
  const days = getDaysBetween(startDate, endDateExclusive);
  const previousEnd = parseDateKey(startDate);
  const previousStart = addDays(previousEnd, -days);

  return {
    previousStartDate: toDateKey(previousStart),
    previousEndDateExclusive: toDateKey(previousEnd),
  };
};

export const normalizeDashboardRange = (
  range: 'today' | 'week' | 'month' | 'custom',
  startDate: string,
  endDate: string,
  now = new Date()
): DashboardRange => {
  let start: Date;
  let endExclusive: Date;
  let label: string;

  if (range === 'today') {
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    endExclusive = addDays(start, 1);
    label = '今日';
  } else if (range === 'week') {
    endExclusive = addDays(new Date(now.getFullYear(), now.getMonth(), now.getDate()), 1);
    start = addDays(endExclusive, -7);
    label = '近7天';
  } else if (range === 'month') {
    endExclusive = addDays(new Date(now.getFullYear(), now.getMonth(), now.getDate()), 1);
    start = addDays(endExclusive, -30);
    label = '近30天';
  } else {
    start = parseDateKey(startDate);
    endExclusive = addDays(parseDateKey(endDate), 1);
    label = `${startDate} 至 ${endDate}`;
  }

  const normalizedStart = toDateKey(start);
  const normalizedEnd = toDateKey(endExclusive);
  const previous = calculatePreviousRange(normalizedStart, normalizedEnd);

  return {
    startDate: normalizedStart,
    endDateExclusive: normalizedEnd,
    previousStartDate: previous.previousStartDate,
    previousEndDateExclusive: previous.previousEndDateExclusive,
    label,
    previousLabel: `${previous.previousStartDate} 至 ${toDateKey(addDays(parseDateKey(previous.previousEndDateExclusive), -1))}`,
  };
};

export const buildPeriodComparison = (current: number, previous: number): PeriodComparison => {
  const value = roundMoney(current - previous);
  const percent = previous === 0 ? null : roundMoney((value / previous) * 100);
  return {
    value,
    percent,
    direction: value > 0 ? 'up' : value < 0 ? 'down' : 'flat',
  };
};

const isDateInRange = (dateKey: string, startDate: string, endDateExclusive: string): boolean => (
  Boolean(dateKey && dateKey >= startDate && dateKey < endDateExclusive)
);

export const filterOrdersByRange = (orders: any[], startDate: string, endDateExclusive: string): any[] => (
  (Array.isArray(orders) ? orders : []).filter(order => isDateInRange(getOrderFinancialDateKey(order), startDate, endDateExclusive))
);

const getMatchedRecord = (item: any, menuItems: any[], inventoryItems: any[]): any => {
  const menuById = item?.menuItemId ? menuItems.find(menu => String(menu?.id) === String(item.menuItemId)) : null;
  if (menuById) return menuById;

  const stockId = item?.stockItemId || item?.itemId || item?.inventoryItemId;
  const inventoryById = stockId ? inventoryItems.find(inventory => String(inventory?.id) === String(stockId)) : null;
  if (inventoryById) return inventoryById;

  const itemName = normalize(item?.name || item?.itemName);
  if (!itemName) return null;

  return menuItems.find(menu => normalize(menu?.name || menu?.itemName) === itemName)
    || inventoryItems.find(inventory => normalize(inventory?.name || inventory?.itemName) === itemName)
    || null;
};

const getBeverageCategory = (category: string): BeverageCategoryFilter | null => {
  const normalized = normalize(category);
  if (!normalized) return null;
  if (cervezaKeys.has(normalized) || normalized.includes('cerveza') || normalized.includes('beer')) return 'Cerveza';
  if (jugoKeys.has(normalized) || normalized.includes('jugo') || normalized.includes('juice')) return 'Jugo';
  if (bebidaKeys.has(normalized) || normalized.includes('bebida') || normalized.includes('drink') || normalized.includes('beverage')) return 'Bebida';
  if (beverageKeys.has(normalized)) return 'Bebida';
  return null;
};

const resolveItemCategory = (item: any, menuItems: any[], inventoryItems: any[]): string => {
  const matchedRecord = getMatchedRecord(item, menuItems, inventoryItems);
  const rawCategory = item?.category || item?.categoryName || matchedRecord?.category || matchedRecord?.categoryName || matchedRecord?.type || '';
  const beverageCategory = getBeverageCategory(rawCategory);
  if (beverageCategory) return beverageCategory;

  return String(rawCategory || '其他');
};

const isBeverageCategory = (category: string): boolean => Boolean(getBeverageCategory(category));

const shouldIncludeRankingItem = (category: string, filters: SalesRankingFilters): boolean => {
  const beverageCategory = getBeverageCategory(category);

  if (filters.scope === 'beverages') {
    if (!beverageCategory) return false;
    return filters.beverageCategory === 'all' || filters.beverageCategory === beverageCategory;
  }

  if (filters.scope === 'dishes') {
    return !beverageCategory;
  }

  return true;
};

const getItemSubtotal = (item: any): number => {
  const subtotal = Number(item?.subtotal);
  if (Number.isFinite(subtotal) && subtotal > 0) return subtotal;
  return (Number(item?.price) || 0) * (Number(item?.quantity) || 1);
};

const collectRankingMap = (
  orders: any[],
  menuItems: any[],
  inventoryItems: any[],
  filters: SalesRankingFilters
): Record<string, SalesRanking> => {
  const rankingMap: Record<string, SalesRanking> = {};

  (Array.isArray(orders) ? orders : []).forEach(order => {
    if (getOrderCollectedAmount(order) <= 0) return;
    if (filters.orderType !== 'all' && (order?.orderType || 'dine_in') !== filters.orderType) return;

    const items = Array.isArray(order?.items) ? order.items : [];
    items.forEach((item: any) => {
      const name = String(item?.name || item?.itemName || '未知商品');
      const category = resolveItemCategory(item, menuItems, inventoryItems);
      if (!shouldIncludeRankingItem(category, filters)) return;

      const key = normalize(name);
      const quantity = Number(item?.quantity) || 1;
      const revenue = getItemSubtotal(item);
      const existing = rankingMap[key] || {
        name,
        category,
        quantity: 0,
        revenue: 0,
        averagePrice: 0,
        revenueShare: 0,
      };

      existing.quantity += quantity;
      existing.revenue = roundMoney(existing.revenue + revenue);
      existing.averagePrice = existing.quantity > 0 ? roundMoney(existing.revenue / existing.quantity) : 0;
      existing.category = isBeverageCategory(existing.category) ? existing.category : category;
      rankingMap[key] = existing;
    });
  });

  return rankingMap;
};

export const buildSalesRankings = (
  orders: any[],
  menuItems: any[],
  inventoryItems: any[],
  filters: SalesRankingFilters
): SalesRanking[] => {
  const rankingMap = collectRankingMap(orders, menuItems, inventoryItems, filters);
  const rankings = Object.values(rankingMap);
  const totalRevenue = rankings.reduce((sum, item) => sum + item.revenue, 0);

  return rankings
    .map(item => ({
      ...item,
      revenue: roundMoney(item.revenue),
      quantity: roundMoney(item.quantity),
      averagePrice: item.quantity > 0 ? roundMoney(item.revenue / item.quantity) : 0,
      revenueShare: totalRevenue > 0 ? roundMoney((item.revenue / totalRevenue) * 100) : 0,
    }))
    .sort((a, b) => {
      const primary = filters.sortBy === 'quantity' ? b.quantity - a.quantity : b.revenue - a.revenue;
      return primary || b.revenue - a.revenue || a.name.localeCompare(b.name);
    })
    .slice(0, filters.topN);
};

const comparePercent = (current: number, previous: number): number | null => (
  previous === 0 ? null : roundMoney(((current - previous) / previous) * 100)
);

export const buildRankingComparison = (
  currentOrders: any[],
  previousOrders: any[],
  menuItems: any[],
  inventoryItems: any[],
  filters: SalesRankingFilters
): { increased: RankingMovement[]; decreased: RankingMovement[] } => {
  const currentMap = collectRankingMap(currentOrders, menuItems, inventoryItems, filters);
  const previousMap = collectRankingMap(previousOrders, menuItems, inventoryItems, filters);
  const keys = Array.from(new Set([...Object.keys(currentMap), ...Object.keys(previousMap)]));

  const movements = keys.map(key => {
    const current = currentMap[key];
    const previous = previousMap[key];
    const currentQuantity = current?.quantity || 0;
    const previousQuantity = previous?.quantity || 0;
    const currentRevenue = current?.revenue || 0;
    const previousRevenue = previous?.revenue || 0;

    return {
      name: current?.name || previous?.name || key,
      category: current?.category || previous?.category || '其他',
      currentQuantity: roundMoney(currentQuantity),
      previousQuantity: roundMoney(previousQuantity),
      quantityDelta: roundMoney(currentQuantity - previousQuantity),
      quantityPercent: comparePercent(currentQuantity, previousQuantity),
      currentRevenue: roundMoney(currentRevenue),
      previousRevenue: roundMoney(previousRevenue),
      revenueDelta: roundMoney(currentRevenue - previousRevenue),
      revenuePercent: comparePercent(currentRevenue, previousRevenue),
    };
  });

  const sortKey = filters.sortBy === 'quantity' ? 'quantityDelta' : 'revenueDelta';
  const increased = movements
    .filter(item => (item as any)[sortKey] > 0)
    .sort((a, b) => (b as any)[sortKey] - (a as any)[sortKey])
    .slice(0, filters.topN);
  const decreased = movements
    .filter(item => (item as any)[sortKey] < 0)
    .sort((a, b) => (a as any)[sortKey] - (b as any)[sortKey])
    .slice(0, filters.topN);

  return { increased, decreased };
};

const expenseTypeLabel = (type: 'purchase' | 'operating'): string => (
  type === 'purchase' ? '采购付款' : '日常开支'
);

const resolvePurchaseSupplierName = (expense: any, purchaseOrders: any[]): string => {
  const matchingOrder = findExpensePurchaseOrder(expense, purchaseOrders);
  const supplierName = String(expense?.supplierName || matchingOrder?.supplierName || '').trim();
  const orderNumber = String(expense?.orderNumber || expense?.invoiceNumber || matchingOrder?.orderNumber || '').trim();

  if (supplierName) return supplierName;
  if (orderNumber) return `采购单 ${orderNumber}`;
  return '采购付款';
};

const resolveExpenseRankingIdentity = (
  expense: any,
  categories: any[],
  purchaseOrders: any[]
): Pick<ExpenseRanking, 'key' | 'label' | 'parentCategory' | 'fullCategory' | 'type' | 'typeLabel'> => {
  const type: 'purchase' | 'operating' = isPurchaseRelatedExpense(expense) ? 'purchase' : 'operating';
  const typeLabel = expenseTypeLabel(type);

  if (type === 'purchase') {
    const label = resolvePurchaseSupplierName(expense, purchaseOrders);
    return {
      key: `purchase|${normalize(label)}`,
      label,
      parentCategory: typeLabel,
      fullCategory: label,
      type,
      typeLabel,
    };
  }

  const normalizedCategories = normalizeExpenseCategories(categories);
  const path = getExpenseCategoryPath(String(expense?.categoryId || ''), normalizedCategories, expense);

  return {
    key: `operating|${normalize(path.fullName)}`,
    label: path.categoryName,
    parentCategory: path.parentName,
    fullCategory: path.fullName,
    type,
    typeLabel,
  };
};

const shouldIncludeExpenseRanking = (type: 'purchase' | 'operating', filters: ExpenseRankingFilters): boolean => (
  filters.scope === 'all' || filters.scope === type
);

const collectExpenseRankingMap = (
  expenses: any[],
  categories: any[],
  purchaseOrders: any[],
  filters: ExpenseRankingFilters
): Record<string, ExpenseRanking> => {
  const rankingMap: Record<string, ExpenseRanking> = {};

  (Array.isArray(expenses) ? expenses : []).forEach(expense => {
    const amount = roundMoney(Number(expense?.amount) || 0);
    if (amount <= 0) return;

    const identity = resolveExpenseRankingIdentity(expense, categories, purchaseOrders);
    if (!shouldIncludeExpenseRanking(identity.type, filters)) return;

    const existing = rankingMap[identity.key] || {
      ...identity,
      count: 0,
      amount: 0,
      averageAmount: 0,
      amountShare: 0,
    };

    existing.count += 1;
    existing.amount = roundMoney(existing.amount + amount);
    existing.averageAmount = existing.count > 0 ? roundMoney(existing.amount / existing.count) : 0;
    rankingMap[identity.key] = existing;
  });

  return rankingMap;
};

export const buildExpenseRankings = (
  expenses: any[],
  categories: any[],
  purchaseOrders: any[],
  filters: ExpenseRankingFilters
): ExpenseRanking[] => {
  const rankingMap = collectExpenseRankingMap(expenses, categories, purchaseOrders, filters);
  const rankings = Object.values(rankingMap);
  const totalAmount = rankings.reduce((sum, item) => sum + item.amount, 0);

  return rankings
    .map(item => ({
      ...item,
      count: roundMoney(item.count),
      amount: roundMoney(item.amount),
      averageAmount: item.count > 0 ? roundMoney(item.amount / item.count) : 0,
      amountShare: totalAmount > 0 ? roundMoney((item.amount / totalAmount) * 100) : 0,
    }))
    .sort((a, b) => {
      const primary = filters.sortBy === 'count' ? b.count - a.count : b.amount - a.amount;
      return primary || b.amount - a.amount || a.label.localeCompare(b.label);
    })
    .slice(0, filters.topN);
};

export const buildExpenseRankingComparison = (
  currentExpenses: any[],
  previousExpenses: any[],
  categories: any[],
  purchaseOrders: any[],
  filters: ExpenseRankingFilters
): { increased: ExpenseRankingMovement[]; decreased: ExpenseRankingMovement[] } => {
  const allFilters = { ...filters, topN: Number.MAX_SAFE_INTEGER };
  const currentMap = collectExpenseRankingMap(currentExpenses, categories, purchaseOrders, allFilters);
  const previousMap = collectExpenseRankingMap(previousExpenses, categories, purchaseOrders, allFilters);
  const keys = Array.from(new Set([...Object.keys(currentMap), ...Object.keys(previousMap)]));

  const movements = keys.map(key => {
    const current = currentMap[key];
    const previous = previousMap[key];
    const currentAmount = current?.amount || 0;
    const previousAmount = previous?.amount || 0;
    const currentCount = current?.count || 0;
    const previousCount = previous?.count || 0;
    const source = current || previous;

    return {
      key,
      label: source?.label || key,
      parentCategory: source?.parentCategory || '其他开支',
      fullCategory: source?.fullCategory || source?.label || key,
      type: source?.type || 'operating',
      typeLabel: source?.typeLabel || expenseTypeLabel(source?.type || 'operating'),
      currentAmount: roundMoney(currentAmount),
      previousAmount: roundMoney(previousAmount),
      amountDelta: roundMoney(currentAmount - previousAmount),
      amountPercent: comparePercent(currentAmount, previousAmount),
      currentCount: roundMoney(currentCount),
      previousCount: roundMoney(previousCount),
      countDelta: roundMoney(currentCount - previousCount),
      countPercent: comparePercent(currentCount, previousCount),
    };
  });

  const sortKey = filters.sortBy === 'count' ? 'countDelta' : 'amountDelta';
  const increased = movements
    .filter(item => (item as any)[sortKey] > 0)
    .sort((a, b) => (b as any)[sortKey] - (a as any)[sortKey])
    .slice(0, filters.topN);
  const decreased = movements
    .filter(item => (item as any)[sortKey] < 0)
    .sort((a, b) => (a as any)[sortKey] - (b as any)[sortKey])
    .slice(0, filters.topN);

  return { increased, decreased };
};

export const buildMonthlySalesCalendar = (orders: any[], monthDate: string): MonthlySalesCalendar => {
  const month = getMonthKey(monthDate);
  const [year, monthNumber] = month.split('-').map(Number);
  const firstDay = new Date(year, monthNumber - 1, 1);
  const lastDay = new Date(year, monthNumber, 0);
  const firstGridDay = addDays(firstDay, -((firstDay.getDay() + 6) % 7));
  const lastGridDay = addDays(lastDay, 6 - ((lastDay.getDay() + 6) % 7));

  const dayMap: Record<string, { revenue: number; orderCount: number }> = {};
  (Array.isArray(orders) ? orders : []).forEach(order => {
    const dateKey = getOrderFinancialDateKey(order);
    if (!dateKey.startsWith(month)) return;

    if (!dayMap[dateKey]) dayMap[dateKey] = { revenue: 0, orderCount: 0 };
    dayMap[dateKey].revenue = roundMoney(dayMap[dateKey].revenue + getOrderCollectedAmount(order));
    dayMap[dateKey].orderCount += 1;
  });

  const inMonthDays = Array.from({ length: lastDay.getDate() }, (_, index) => `${month}-${String(index + 1).padStart(2, '0')}`);
  const totalRevenue = roundMoney(inMonthDays.reduce((sum, dateKey) => sum + (dayMap[dateKey]?.revenue || 0), 0));
  const totalOrders = inMonthDays.reduce((sum, dateKey) => sum + (dayMap[dateKey]?.orderCount || 0), 0);
  const activeDays = inMonthDays.filter(dateKey => (dayMap[dateKey]?.revenue || 0) > 0).length;
  const dailyAverage = activeDays > 0 ? roundMoney(totalRevenue / activeDays) : 0;
  const maxRevenue = Math.max(...inMonthDays.map(dateKey => dayMap[dateKey]?.revenue || 0), 0);

  const weeks: MonthlyCalendarWeek[] = [];
  const weekdayStats = weekdayLabels.map(weekday => ({ weekday, revenue: 0, orderCount: 0 }));
  let cursor = new Date(firstGridDay);

  while (cursor <= lastGridDay) {
    const days: MonthlyCalendarDay[] = [];
    for (let index = 0; index < 7; index += 1) {
      const dateKey = toDateKey(cursor);
      const inMonth = dateKey.startsWith(month);
      const revenue = inMonth ? (dayMap[dateKey]?.revenue || 0) : 0;
      const orderCount = inMonth ? (dayMap[dateKey]?.orderCount || 0) : 0;
      const weekdayIndex = (cursor.getDay() + 6) % 7;

      if (inMonth) {
        weekdayStats[weekdayIndex].revenue = roundMoney(weekdayStats[weekdayIndex].revenue + revenue);
        weekdayStats[weekdayIndex].orderCount += orderCount;
      }

      days.push({
        date: dateKey,
        day: cursor.getDate(),
        inMonth,
        revenue,
        orderCount,
        averageDeltaPercent: dailyAverage > 0 && inMonth ? roundMoney(((revenue - dailyAverage) / dailyAverage) * 100) : null,
        intensity: maxRevenue > 0 && inMonth ? roundMoney((revenue / maxRevenue) * 100) : 0,
      });
      cursor = addDays(cursor, 1);
    }

    weeks.push({
      days,
      weeklyRevenue: roundMoney(days.reduce((sum, day) => sum + day.revenue, 0)),
      weeklyOrders: days.reduce((sum, day) => sum + day.orderCount, 0),
    });
  }

  const activeWeekdays = weekdayStats.filter(day => day.revenue > 0 || day.orderCount > 0);
  const sortedWeekdays = [...activeWeekdays].sort((a, b) => b.revenue - a.revenue);

  return {
    month,
    weekdays: weekdayLabels,
    weeks,
    totalRevenue,
    totalOrders,
    dailyAverage,
    bestWeekday: sortedWeekdays[0] || null,
    worstWeekday: sortedWeekdays.length > 0 ? sortedWeekdays[sortedWeekdays.length - 1] : null,
  };
};

export const buildKpis = (orders: any[], expenses = { purchaseAmount: 0, expenseAmount: 0 }): DashboardKpis => {
  const totalSales = roundMoney((Array.isArray(orders) ? orders : []).reduce((sum, order) => sum + getOrderCollectedAmount(order), 0));
  const orderCount = (Array.isArray(orders) ? orders : []).filter(order => getOrderCollectedAmount(order) > 0).length;
  const payment = (Array.isArray(orders) ? orders : []).reduce((sum, order) => {
    const breakdown = getOrderPaymentBreakdown(order);
    return {
      cash: sum.cash + breakdown.cash,
      card: sum.card + breakdown.card,
    };
  }, { cash: 0, card: 0 });

  return {
    totalSales,
    orderCount,
    averageTicket: orderCount > 0 ? roundMoney(totalSales / orderCount) : 0,
    cashPayment: roundMoney(payment.cash),
    cardPayment: roundMoney(payment.card),
    profit: roundMoney(totalSales - expenses.purchaseAmount - expenses.expenseAmount),
  };
};
