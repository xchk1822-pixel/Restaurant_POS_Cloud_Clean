import React, { useEffect, useState } from 'react';
import { dataService } from '../../services/DataService';
import { smartGetDocuments, smartGetDocumentsByDateRange, smartGetPosOrdersByActivityDateRange } from '../../services/smartSyncService';
import { toTimestampMillis } from '../../utils/localTime';
import { getLocalDateString } from '../../utils/exchangeRate';
import { getPurchaseOrderDateKey } from '../../utils/purchaseDates';
import {
  calculateHandoverDifferenceForDates,
  getCancelledItemCountForDate,
  getExpenseDateKey,
  getExpenseProfitAmount,
  getOrderCancellationDateKey,
  getOrderCollectedAmount,
  getOrderFinancialDateKey,
  getOrderPaymentBreakdown,
  sumExpensesByKind,
} from '../../utils/financeMetrics';
import {
  buildExpenseRankingComparison,
  buildExpenseRankings,
  buildKpis,
  buildMonthlySalesCalendar,
  buildPeriodComparison,
  buildRankingComparison,
  buildSalesRankings,
  filterOrdersByRange,
  normalizeDashboardRange,
  type BeverageCategoryFilter,
  type DashboardKpis,
  type DashboardOrderTypeFilter,
  type ExpenseRanking,
  type ExpenseRankingMovement,
  type ExpenseRankingScope,
  type ExpenseRankingSortBy,
  type MonthlySalesCalendar,
  type PeriodComparison,
  type RankingMovement,
  type RankingScope,
  type RankingSortBy,
  type SalesRanking as AnalyticsSalesRanking,
} from '../../utils/dashboardAnalytics';
import { colors, font, radii, shadows } from '../../styles/uiTokens';
import { useI18n } from '../../i18n/I18nContext';
import type { TranslationKey } from '../../i18n/translations';

interface TimeRangeStats {
  totalSales: number;
  orderCount: number;
  cashPayment: number;
  cardPayment: number;
  purchaseAmount: number;
  expenseAmount: number;
  profit: number;
  dineInOrders: number;
  takeoutOrders: number;
  deliveryOrders: number;
  cancelledOrders: number;
  cancelledItems: number;
  dineInRevenue: number;
  takeoutRevenue: number;
  deliveryRevenue: number;
  soldQuantity: number;
  soldProductCount: number;
}

interface DailyTrend {
  date: string;
  sales: number;
  orders: number;
  profit: number;
  dineInSales: number;
  takeoutSales: number;
  deliverySales: number;
}

interface CustomerProfile {
  totalCustomers: number;
  newCustomers: number;
  returningCustomers: number;
  newCustomerRate: number;
  avgOrderFrequency: number;
  topCustomers: Array<{
    phone?: string;
    orderCount: number;
    totalSpent: number;
    lastVisit: string;
    favoriteDish?: string;
  }>;
  peakHours: Array<{
    hour: number;
    orderCount: number;
    revenue: number;
  }>;
  categoryPreference: Array<{
    category: string;
    orderCount: number;
    revenue: number;
    percentage: number;
  }>;
}

interface DashboardModuleProps {
  orders?: any[];
}

interface ComparisonStats {
  totalSales: PeriodComparison;
  orderCount: PeriodComparison;
  averageTicket: PeriodComparison;
  cashPayment: PeriodComparison;
  cardPayment: PeriodComparison;
  totalExpense: PeriodComparison;
  profit: PeriodComparison;
}

interface ManagerDashboardRangeSnapshot {
  orders: any[];
  expenses: any[];
  purchases: any[];
  handovers: any[];
  syncedAt: number;
}

interface ManagerDashboardStaticSnapshot {
  menuItems: any[];
  inventoryItems: any[];
  expenseCategories: any[];
}

const managerDashboardRangeCache = new Map<string, ManagerDashboardRangeSnapshot>();
const managerDashboardStaticCache = new Map<string, ManagerDashboardStaticSnapshot>();

const rememberManagerSnapshot = <T,>(cache: Map<string, T>, key: string, value: T): void => {
  cache.delete(key);
  cache.set(key, value);
  if (cache.size > 8) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey) cache.delete(oldestKey);
  }
};

const clearManagerRangeSnapshotsForStore = (storeId: string): void => {
  const prefix = `${storeId}|`;
  Array.from(managerDashboardRangeCache.keys()).forEach(key => {
    if (key.startsWith(prefix)) managerDashboardRangeCache.delete(key);
  });
};

const emptyStats: TimeRangeStats = {
  totalSales: 0,
  orderCount: 0,
  cashPayment: 0,
  cardPayment: 0,
  purchaseAmount: 0,
  expenseAmount: 0,
  profit: 0,
  dineInOrders: 0,
  takeoutOrders: 0,
  deliveryOrders: 0,
  cancelledOrders: 0,
  cancelledItems: 0,
  dineInRevenue: 0,
  takeoutRevenue: 0,
  deliveryRevenue: 0,
  soldQuantity: 0,
  soldProductCount: 0,
};

const emptyKpis: DashboardKpis = {
  totalSales: 0,
  orderCount: 0,
  averageTicket: 0,
  cashPayment: 0,
  cardPayment: 0,
  profit: 0,
};

const emptyComparison: ComparisonStats = {
  totalSales: buildPeriodComparison(0, 0),
  orderCount: buildPeriodComparison(0, 0),
  averageTicket: buildPeriodComparison(0, 0),
  cashPayment: buildPeriodComparison(0, 0),
  cardPayment: buildPeriodComparison(0, 0),
  totalExpense: buildPeriodComparison(0, 0),
  profit: buildPeriodComparison(0, 0),
};

const getStoreOrdersDirect = (): any[] => {
  try {
    const currentUser = localStorage.getItem('current_user');
    const storeId = currentUser ? JSON.parse(currentUser).storeId : null;
    const keys = [
      ...(storeId ? [`store_${storeId}_pos_orders`] : []),
      'pos_orders',
    ];

    for (const key of keys) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (error) {
    console.error('读取数据概览订单失败:', error);
  }
  return [];
};

const money = (value: number): string => `C$ ${Number(value || 0).toFixed(2)}`;
const pct = (value: number): string => `${Number(value || 0).toFixed(1)}%`;
const comparisonText = (comparison: PeriodComparison, t: (key: TranslationKey) => string): string => {
  if (comparison.direction === 'flat') return t('dashboard.comparison.flat');
  const sign = comparison.value > 0 ? '+' : '';
  const percentText = comparison.percent === null ? '' : ` / ${sign}${comparison.percent.toFixed(1)}%`;
  return `${sign}${comparison.value.toFixed(2)}${percentText}`;
};

const comparisonColor = (comparison: PeriodComparison): string => {
  if (comparison.direction === 'up') return colors.teal;
  if (comparison.direction === 'down') return '#c2410c';
  return colors.textSecondary;
};

const getOrderType = (order: any): DashboardOrderTypeFilter => order?.orderType || 'dine_in';

const getDateKeysInRange = (startDate: string, endDateExclusive: string): string[] => {
  const dates: string[] = [];
  const cursor = new Date(`${startDate}T00:00:00-06:00`);
  const end = new Date(`${endDateExclusive}T00:00:00-06:00`);
  while (cursor < end) {
    dates.push(getLocalDateString(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
};

const getInclusiveEndDate = (endDateExclusive: string): string => {
  const date = new Date(`${endDateExclusive}T12:00:00`);
  date.setDate(date.getDate() - 1);
  return getLocalDateString(date);
};

const getMonthDateRange = (monthKey: string) => {
  const firstDate = `${monthKey}-01`;
  const lastDate = new Date(`${firstDate}T12:00:00`);
  lastDate.setMonth(lastDate.getMonth() + 1, 0);
  return { startDate: firstDate, endDate: getLocalDateString(lastDate) };
};

const getRankingScopeLabel = (scope: RankingScope, beverageCategory: BeverageCategoryFilter, t: (key: TranslationKey) => string): string => {
  if (scope === 'dishes') return t('dashboard.scope.dishes');
  if (scope === 'beverages') return beverageCategory === 'all' ? t('dashboard.scope.beverages') : beverageCategory;
  return t('dashboard.scope.allProducts');
};

const getExpenseScopeLabel = (scope: ExpenseRankingScope, t: (key: TranslationKey) => string): string => {
  if (scope === 'operating') return t('dashboard.expenseScope.operating');
  if (scope === 'purchase') return t('dashboard.expenseScope.purchase');
  return t('dashboard.expenseScope.all');
};

const weekdayTranslationKeys: TranslationKey[] = [
  'dashboard.weekday.monday',
  'dashboard.weekday.tuesday',
  'dashboard.weekday.wednesday',
  'dashboard.weekday.thursday',
  'dashboard.weekday.friday',
  'dashboard.weekday.saturday',
  'dashboard.weekday.sunday',
];

const getWeekdayLabel = (weekday: string, t: (key: TranslationKey) => string): string => {
  const weekdays = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
  const index = weekdays.indexOf(weekday);
  return index >= 0 ? t(weekdayTranslationKeys[index]) : weekday;
};

const getHeatBackground = (intensity: number, inMonth: boolean): string => {
  if (!inMonth) return '#f8fafc';
  if (intensity <= 0) return '#ffffff';
  if (intensity < 25) return '#ecfeff';
  if (intensity < 50) return '#ccfbf1';
  if (intensity < 75) return '#7dd3fc';
  return '#2dd4bf';
};

const DashboardModule: React.FC<DashboardModuleProps> = ({ orders: propOrders }) => {
  const { t } = useI18n();
  const expenseCategoryStorageKey = dataService.getStoreKey('expense_categories');
  const [timeRange, setTimeRange] = useState<'today' | 'month' | 'custom'>('today');
  const [startDate, setStartDate] = useState(getLocalDateString());
  const [endDate, setEndDate] = useState(getLocalDateString());
  const [calendarMonth, setCalendarMonth] = useState(getLocalDateString().slice(0, 7));

  const [orders, setOrders] = useState<any[]>(() => propOrders || []);
  const [expenseRecords, setExpenseRecords] = useState<any[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<any[]>([]);
  const [handoverRecords, setHandoverRecords] = useState<any[]>([]);
  const [menuItems, setMenuItems] = useState<any[]>([]);
  const [inventoryItems, setInventoryItems] = useState<any[]>([]);
  const [expenseCategoryConfig, setExpenseCategoryConfig] = useState<any[]>(() => {
    const cached = localStorage.getItem(expenseCategoryStorageKey);
    return cached ? JSON.parse(cached) : [];
  });
  const [dataVersion, setDataVersion] = useState(0);
  const [hasLoadedRangeData, setHasLoadedRangeData] = useState(false);

  const [rankingScope, setRankingScope] = useState<RankingScope>('all');
  const [rankingSortBy, setRankingSortBy] = useState<RankingSortBy>('revenue');
  const [rankingOrderType, setRankingOrderType] = useState<DashboardOrderTypeFilter>('all');
  const [rankingTopN, setRankingTopN] = useState<number>(10);
  const [beverageCategoryFilter, setBeverageCategoryFilter] = useState<BeverageCategoryFilter>('all');
  const [movementMetric, setMovementMetric] = useState<RankingSortBy>('revenue');
  const [expenseRankingScope, setExpenseRankingScope] = useState<ExpenseRankingScope>('all');
  const [expenseRankingSortBy, setExpenseRankingSortBy] = useState<ExpenseRankingSortBy>('amount');
  const [expenseRankingTopN, setExpenseRankingTopN] = useState<number>(10);

  const [stats, setStats] = useState<TimeRangeStats>(emptyStats);
  const [currentKpis, setCurrentKpis] = useState<DashboardKpis>(emptyKpis);
  const [comparisonStats, setComparisonStats] = useState<ComparisonStats>(emptyComparison);
  const [focusedRankings, setFocusedRankings] = useState<AnalyticsSalesRanking[]>([]);
  const [rankingMovement, setRankingMovement] = useState<{ increased: RankingMovement[]; decreased: RankingMovement[] }>({ increased: [], decreased: [] });
  const [monthlyCalendar, setMonthlyCalendar] = useState<MonthlySalesCalendar | null>(null);
  const [salesTrend, setSalesTrend] = useState<DailyTrend[]>([]);
  const [expenseRankings, setExpenseRankings] = useState<ExpenseRanking[]>([]);
  const [expenseMovement, setExpenseMovement] = useState<{ increased: ExpenseRankingMovement[]; decreased: ExpenseRankingMovement[] }>({ increased: [], decreased: [] });
  const [topPurchases, setTopPurchases] = useState<Array<{ name: string; quantity: number; amount: number }>>([]);
  const [customerProfile, setCustomerProfile] = useState<CustomerProfile>({
    totalCustomers: 0,
    newCustomers: 0,
    returningCustomers: 0,
    newCustomerRate: 0,
    avgOrderFrequency: 0,
    topCustomers: [],
    peakHours: [],
    categoryPreference: [],
  });
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);

  const refreshManagerData = React.useCallback(async (forceCloud = false) => {
    setIsRefreshing(true);
    try {
      const storeId = dataService.getCurrentStoreId();
      if (!storeId) throw new Error('Missing storeId for manager dashboard');
      const range = normalizeDashboardRange(timeRange, startDate, endDate, new Date(), calendarMonth);
      const calendarRange = getMonthDateRange(calendarMonth);
      const comparisonStartDate = [range.startDate, range.previousStartDate].sort()[0];
      const comparisonEndDate = [
        getInclusiveEndDate(range.endDateExclusive),
        getInclusiveEndDate(range.previousEndDateExclusive),
      ].sort().slice(-1)[0];
      const orderStartDate = [comparisonStartDate, calendarRange.startDate].sort()[0];
      const orderEndDate = [comparisonEndDate, calendarRange.endDate].sort().slice(-1)[0];
      const rangeCacheKey = `${storeId}|${orderStartDate}|${orderEndDate}|${comparisonStartDate}|${comparisonEndDate}`;
      const cachedRange = forceCloud ? undefined : managerDashboardRangeCache.get(rangeCacheKey);
      const cachedStatic = forceCloud ? undefined : managerDashboardStaticCache.get(storeId);
      const [cloudOrders, cloudExpenses, cloudPurchases, cloudHandovers, cloudMenuItems, cloudInventoryItems, cloudExpenseCategories] = await Promise.all([
        cachedRange
          ? Promise.resolve(cachedRange.orders)
          : smartGetPosOrdersByActivityDateRange(orderStartDate, orderEndDate, true, undefined, ['completedAt', 'lastPaidAt', 'cancelledAt'], false),
        cachedRange
          ? Promise.resolve(cachedRange.expenses)
          : smartGetDocumentsByDateRange('expenses', 'date', comparisonStartDate, comparisonEndDate, true),
        cachedRange
          ? Promise.resolve(cachedRange.purchases)
          : smartGetDocumentsByDateRange('purchase_orders', 'orderDate', comparisonStartDate, comparisonEndDate, true, 'timestamp'),
        cachedRange
          ? Promise.resolve(cachedRange.handovers)
          : smartGetDocumentsByDateRange('handovers', 't', comparisonStartDate, comparisonEndDate, true),
        cachedStatic ? Promise.resolve(cachedStatic.menuItems) : smartGetDocuments('menu_items', true),
        cachedStatic ? Promise.resolve(cachedStatic.inventoryItems) : smartGetDocuments('inventory_items', true),
        cachedStatic ? Promise.resolve(cachedStatic.expenseCategories) : smartGetDocuments('expense_categories', true),
      ]);

      const syncedAt = cachedRange?.syncedAt || Date.now();
      if (!cachedRange) {
        rememberManagerSnapshot(managerDashboardRangeCache, rangeCacheKey, {
          orders: cloudOrders,
          expenses: cloudExpenses,
          purchases: cloudPurchases,
          handovers: cloudHandovers,
          syncedAt,
        });
      }
      if (!cachedStatic) {
        rememberManagerSnapshot(managerDashboardStaticCache, storeId, {
          menuItems: cloudMenuItems,
          inventoryItems: cloudInventoryItems,
          expenseCategories: cloudExpenseCategories,
        });
      }

      try {
        localStorage.setItem(expenseCategoryStorageKey, JSON.stringify(cloudExpenseCategories));
      } catch (cacheError) {
        console.warn('店长开支类别缓存写入失败，继续使用云端数据:', cacheError);
      }

      setOrders(cloudOrders);
      setExpenseRecords(cloudExpenses);
      setPurchaseOrders(cloudPurchases);
      setHandoverRecords(cloudHandovers);
      setMenuItems(cloudMenuItems);
      setInventoryItems(cloudInventoryItems);
      setExpenseCategoryConfig(cloudExpenseCategories);
      setHasLoadedRangeData(true);
      setDataVersion(version => version + 1);
      setLastSyncedAt(new Date(syncedAt));
    } catch (error) {
      console.error('刷新店长数据失败:', error);
      alert(t('dashboard.alert.refreshFailed'));
    } finally {
      setIsRefreshing(false);
    }
  }, [calendarMonth, endDate, expenseCategoryStorageKey, startDate, t, timeRange]);

  useEffect(() => {
    refreshManagerData(false);
  }, [refreshManagerData]);

  useEffect(() => {
    const invalidateCurrentStoreRange = () => {
      const storeId = dataService.getCurrentStoreId();
      if (storeId) clearManagerRangeSnapshotsForStore(storeId);
    };

    window.addEventListener('posOrdersUpdated', invalidateCurrentStoreRange);
    window.addEventListener('expensesUpdated', invalidateCurrentStoreRange);
    window.addEventListener('purchasesUpdated', invalidateCurrentStoreRange);
    return () => {
      window.removeEventListener('posOrdersUpdated', invalidateCurrentStoreRange);
      window.removeEventListener('expensesUpdated', invalidateCurrentStoreRange);
      window.removeEventListener('purchasesUpdated', invalidateCurrentStoreRange);
    };
  }, []);

  const handleCalendarDayClick = React.useCallback((dateKey: string) => {
    setStartDate(dateKey);
    setEndDate(dateKey);
    setTimeRange('custom');
  }, []);

  const calculateCustomerProfile = React.useCallback((sourceOrders: any[]): CustomerProfile => {
    const customerMap: Record<string, {
      orderCount: number;
      totalSpent: number;
      lastVisit: string;
      dishes: Record<string, number>;
    }> = {};

    sourceOrders.forEach((order: any) => {
      const phone = order.customerPhone || '散客';
      const orderDate = String(order.date || order.createdAt || getOrderFinancialDateKey(order));
      const spent = getOrderCollectedAmount(order);
      if (spent <= 0) return;

      if (!customerMap[phone]) {
        customerMap[phone] = {
          orderCount: 0,
          totalSpent: 0,
          lastVisit: orderDate,
          dishes: {},
        };
      }

      customerMap[phone].orderCount += 1;
      customerMap[phone].totalSpent += spent;
      if (orderDate > customerMap[phone].lastVisit) customerMap[phone].lastVisit = orderDate;

      (Array.isArray(order.items) ? order.items : []).forEach((item: any) => {
        const dishName = String(item.name || item.itemName || '未知商品');
        customerMap[phone].dishes[dishName] = (customerMap[phone].dishes[dishName] || 0) + 1;
      });
    });

    const customers = Object.entries(customerMap);
    const totalCustomers = customers.length;
    const newCustomers = customers.filter(([, data]) => data.orderCount === 1).length;
    const returningCustomers = customers.filter(([, data]) => data.orderCount > 1).length;
    const newCustomerRate = totalCustomers > 0 ? (newCustomers / totalCustomers) * 100 : 0;
    const avgOrderFrequency = totalCustomers > 0
      ? customers.reduce((sum, [, data]) => sum + data.orderCount, 0) / totalCustomers
      : 0;

    const topCustomers = customers
      .map(([phone, data]) => ({
        phone: phone === '散客' ? undefined : phone,
        orderCount: data.orderCount,
        totalSpent: data.totalSpent,
        lastVisit: data.lastVisit,
        favoriteDish: Object.entries(data.dishes).sort((a, b) => b[1] - a[1])[0]?.[0],
      }))
      .sort((a, b) => b.totalSpent - a.totalSpent)
      .slice(0, 10);

    const hourStats: Record<number, { orderCount: number; revenue: number }> = {};
    for (let hour = 0; hour < 24; hour += 1) hourStats[hour] = { orderCount: 0, revenue: 0 };

    sourceOrders.forEach((order: any) => {
      const amount = getOrderCollectedAmount(order);
      if (amount <= 0) return;
      const rawTime = order.date || order.createdAt || order.completedAt || order.paidAt;
      const timestamp = toTimestampMillis(rawTime);
      const hour = timestamp ? new Date(timestamp).getHours() : 0;
      hourStats[hour].orderCount += 1;
      hourStats[hour].revenue += amount;
    });

    const peakHours = Object.entries(hourStats)
      .map(([hour, data]) => ({ hour: Number(hour), orderCount: data.orderCount, revenue: data.revenue }))
      .filter(item => item.orderCount > 0)
      .sort((a, b) => b.orderCount - a.orderCount)
      .slice(0, 5);

    const categoryStats: Record<string, { orderCount: number; revenue: number }> = {};
    sourceOrders.forEach((order: any) => {
      if (getOrderCollectedAmount(order) <= 0) return;
      (Array.isArray(order.items) ? order.items : []).forEach((item: any) => {
        const category = item.category || '其他';
        if (!categoryStats[category]) categoryStats[category] = { orderCount: 0, revenue: 0 };
        categoryStats[category].orderCount += Number(item.quantity || 1);
        categoryStats[category].revenue += Number(item.subtotal ?? (Number(item.price || 0) * Number(item.quantity || 1)));
      });
    });

    const totalCategoryOrders = Object.values(categoryStats).reduce((sum, item) => sum + item.orderCount, 0);
    const categoryPreference = Object.entries(categoryStats)
      .map(([category, data]) => ({
        category,
        orderCount: data.orderCount,
        revenue: data.revenue,
        percentage: totalCategoryOrders > 0 ? (data.orderCount / totalCategoryOrders) * 100 : 0,
      }))
      .sort((a, b) => b.orderCount - a.orderCount);

    return {
      totalCustomers,
      newCustomers,
      returningCustomers,
      newCustomerRate,
      avgOrderFrequency,
      topCustomers,
      peakHours,
      categoryPreference,
    };
  }, []);

  const loadDashboardData = React.useCallback(() => {
    try {
      const range = normalizeDashboardRange(timeRange, startDate, endDate, new Date(), calendarMonth);
      const calendarRange = normalizeDashboardRange('month', startDate, endDate, new Date(), calendarMonth);
      const dashboardOrders = hasLoadedRangeData ? orders : (propOrders || getStoreOrdersDirect());
      const filteredOrders = filterOrdersByRange(dashboardOrders, range.startDate, range.endDateExclusive);
      const calendarOrders = filterOrdersByRange(dashboardOrders, calendarRange.startDate, calendarRange.endDateExclusive);
      const previousOrders = filterOrdersByRange(dashboardOrders, range.previousStartDate, range.previousEndDateExclusive);
      const financialOrders = filteredOrders.filter((order: any) => getOrderCollectedAmount(order) > 0);
      const previousFinancialOrders = previousOrders.filter((order: any) => getOrderCollectedAmount(order) > 0);
      const expenses = expenseRecords;
      const purchases = purchaseOrders;
      const expenseCategories = expenseCategoryConfig.length > 0
        ? expenseCategoryConfig
        : JSON.parse(localStorage.getItem(expenseCategoryStorageKey) || '[]');
      const currentExpenseRecords = expenses.filter((expense: any) => {
        const dateKey = getExpenseDateKey(expense);
        return dateKey >= range.startDate && dateKey < range.endDateExclusive;
      });
      const previousExpenseRecords = expenses.filter((expense: any) => {
        const dateKey = getExpenseDateKey(expense);
        return dateKey >= range.previousStartDate && dateKey < range.previousEndDateExclusive;
      });

      const expenseAmount = sumExpensesByKind(expenses, range.startDate, range.endDateExclusive, 'operating');
      const purchaseAmount = sumExpensesByKind(expenses, range.startDate, range.endDateExclusive, 'purchase');
      const previousExpenseAmount = sumExpensesByKind(expenses, range.previousStartDate, range.previousEndDateExclusive, 'operating');
      const previousPurchaseAmount = sumExpensesByKind(expenses, range.previousStartDate, range.previousEndDateExclusive, 'purchase');
      const rangeDateKeys = getDateKeysInRange(range.startDate, range.endDateExclusive);
      const previousDateKeys = getDateKeysInRange(range.previousStartDate, range.previousEndDateExclusive);
      const handoverDifference = calculateHandoverDifferenceForDates({ dates: rangeDateKeys, orders: financialOrders, expenses, handovers: handoverRecords });
      const previousHandoverDifference = calculateHandoverDifferenceForDates({ dates: previousDateKeys, orders: previousFinancialOrders, expenses, handovers: handoverRecords });
      const totalSales = financialOrders.reduce((sum: number, order: any) => sum + getOrderCollectedAmount(order), 0);
      const orderCount = financialOrders.length;
      const cardPayment = financialOrders.reduce((sum: number, order: any) => {
        if (order.paymentMethod === 'card') return sum + getOrderCollectedAmount(order);
        if (order.paymentMethod === 'mixed') return sum + getOrderPaymentBreakdown(order).card;
        return sum;
      }, 0);
      const cashPayment = financialOrders.reduce((sum: number, order: any) => {
        if (order.paymentMethod === 'cash') return sum + getOrderCollectedAmount(order);
        if (order.paymentMethod === 'mixed') return sum + getOrderPaymentBreakdown(order).cash;
        return sum;
      }, 0);
      const profit = totalSales - purchaseAmount - expenseAmount + handoverDifference;

      const dineInOrders = financialOrders.filter((order: any) => getOrderType(order) === 'dine_in').length;
      const takeoutOrders = financialOrders.filter((order: any) => getOrderType(order) === 'takeout').length;
      const deliveryOrders = financialOrders.filter((order: any) => getOrderType(order) === 'delivery').length;
      const cancelledOrders = dashboardOrders.filter((order: any) => {
        const dateKey = getOrderCancellationDateKey(order);
        return dateKey >= range.startDate && dateKey < range.endDateExclusive;
      }).length;
      const cancelledItems = dashboardOrders.reduce((sum: number, order: any) => (
        sum + rangeDateKeys.reduce((dateSum, dateKey) => dateSum + getCancelledItemCountForDate(order, dateKey), 0)
      ), 0);
      const dineInRevenue = financialOrders
        .filter((order: any) => getOrderType(order) === 'dine_in')
        .reduce((sum: number, order: any) => sum + getOrderCollectedAmount(order), 0);
      const takeoutRevenue = financialOrders
        .filter((order: any) => getOrderType(order) === 'takeout')
        .reduce((sum: number, order: any) => sum + getOrderCollectedAmount(order), 0);
      const deliveryRevenue = financialOrders
        .filter((order: any) => getOrderType(order) === 'delivery')
        .reduce((sum: number, order: any) => sum + getOrderCollectedAmount(order), 0);
      const soldProductNames = new Set<string>();
      const soldQuantity = financialOrders.reduce((sum: number, order: any) => {
        return sum + (Array.isArray(order.items) ? order.items : []).reduce((itemSum: number, item: any) => {
          const name = String(item.name || item.itemName || '').trim();
          if (name) soldProductNames.add(name.toLowerCase());
          return itemSum + (Number(item.quantity) || 1);
        }, 0);
      }, 0);
      const soldProductCount = soldProductNames.size;

      const currentKpiBase = buildKpis(financialOrders, { purchaseAmount, expenseAmount });
      const previousKpiBase = buildKpis(previousFinancialOrders, { purchaseAmount: previousPurchaseAmount, expenseAmount: previousExpenseAmount });
      const currentKpiData = { ...currentKpiBase, profit: currentKpiBase.profit + handoverDifference };
      const previousKpiData = { ...previousKpiBase, profit: previousKpiBase.profit + previousHandoverDifference };
      const rankingFilters = {
        scope: rankingScope,
        sortBy: rankingSortBy,
        orderType: rankingOrderType,
        topN: rankingTopN,
        beverageCategory: beverageCategoryFilter,
      };
      const movementFilters = { ...rankingFilters, sortBy: movementMetric };
      const expenseRankingFilters = {
        scope: expenseRankingScope,
        sortBy: expenseRankingSortBy,
        topN: expenseRankingTopN,
      };

      const trendMap: Record<string, DailyTrend> = {};
      for (let date = new Date(`${range.startDate}T00:00:00`); getLocalDateString(date) < range.endDateExclusive; date.setDate(date.getDate() + 1)) {
        const dateKey = getLocalDateString(date);
        trendMap[dateKey] = { date: dateKey, sales: 0, orders: 0, profit: 0, dineInSales: 0, takeoutSales: 0, deliverySales: 0 };
      }

      financialOrders.forEach((order: any) => {
        const dateKey = getOrderFinancialDateKey(order);
        const amount = getOrderCollectedAmount(order);
        if (!trendMap[dateKey]) return;
        trendMap[dateKey].sales += amount;
        trendMap[dateKey].orders += 1;
        if (getOrderType(order) === 'takeout') trendMap[dateKey].takeoutSales += amount;
        else if (getOrderType(order) === 'delivery') trendMap[dateKey].deliverySales += amount;
        else trendMap[dateKey].dineInSales += amount;
      });

      expenses.forEach((expense: any) => {
        const dateKey = getExpenseDateKey(expense);
        if (trendMap[dateKey]) trendMap[dateKey].profit -= getExpenseProfitAmount(expense);
      });
      Object.keys(trendMap).forEach(dateKey => {
        trendMap[dateKey].profit += trendMap[dateKey].sales + calculateHandoverDifferenceForDates({
          dates: [dateKey],
          orders: financialOrders,
          expenses,
          handovers: handoverRecords,
        });
      });

      const purchaseItems: Record<string, { name: string; quantity: number; amount: number }> = {};
      purchases.forEach((purchase: any) => {
        const purchaseDate = getPurchaseOrderDateKey(purchase);
        if (!purchaseDate || purchaseDate < range.startDate || purchaseDate >= range.endDateExclusive) return;
        (Array.isArray(purchase.items) ? purchase.items : []).forEach((item: any) => {
          const name = String(item.itemName || item.name || '未知物品');
          if (!purchaseItems[name]) purchaseItems[name] = { name, quantity: 0, amount: 0 };
          purchaseItems[name].quantity += Number(item.quantity || 0);
          purchaseItems[name].amount += Number(item.subtotal || 0);
        });
      });

      setStats({
        totalSales,
        orderCount,
        cashPayment,
        cardPayment,
        purchaseAmount,
        expenseAmount,
        profit,
        dineInOrders,
        takeoutOrders,
        deliveryOrders,
        cancelledOrders,
        cancelledItems,
        dineInRevenue,
        takeoutRevenue,
        deliveryRevenue,
        soldQuantity,
        soldProductCount,
      });
      setCurrentKpis(currentKpiData);
      setComparisonStats({
        totalSales: buildPeriodComparison(currentKpiData.totalSales, previousKpiData.totalSales),
        orderCount: buildPeriodComparison(currentKpiData.orderCount, previousKpiData.orderCount),
        averageTicket: buildPeriodComparison(currentKpiData.averageTicket, previousKpiData.averageTicket),
        cashPayment: buildPeriodComparison(currentKpiData.cashPayment, previousKpiData.cashPayment),
        cardPayment: buildPeriodComparison(currentKpiData.cardPayment, previousKpiData.cardPayment),
        totalExpense: buildPeriodComparison(purchaseAmount + expenseAmount, previousPurchaseAmount + previousExpenseAmount),
        profit: buildPeriodComparison(currentKpiData.profit, previousKpiData.profit),
      });
      setFocusedRankings(buildSalesRankings(financialOrders, menuItems, inventoryItems, rankingFilters));
      setRankingMovement(buildRankingComparison(financialOrders, previousFinancialOrders, menuItems, inventoryItems, movementFilters));
      setMonthlyCalendar(buildMonthlySalesCalendar(calendarOrders, calendarMonth));
      setSalesTrend(Object.values(trendMap).sort((a, b) => a.date.localeCompare(b.date)));
      setExpenseRankings(buildExpenseRankings(currentExpenseRecords, expenseCategories, purchases, expenseRankingFilters));
      setExpenseMovement(buildExpenseRankingComparison(currentExpenseRecords, previousExpenseRecords, expenseCategories, purchases, expenseRankingFilters));
      setTopPurchases(Object.values(purchaseItems).sort((a, b) => b.amount - a.amount).slice(0, 10));
      setCustomerProfile(calculateCustomerProfile(financialOrders));
    } catch (error) {
      console.error('加载数据概览失败:', error);
    } finally {
      setLoading(false);
    }
  }, [
    timeRange,
    startDate,
    endDate,
    propOrders,
    orders,
    hasLoadedRangeData,
    expenseRecords,
    handoverRecords,
    purchaseOrders,
    menuItems,
    inventoryItems,
    expenseCategoryConfig,
    expenseCategoryStorageKey,
    rankingScope,
    rankingSortBy,
    rankingOrderType,
    rankingTopN,
    beverageCategoryFilter,
    calendarMonth,
    movementMetric,
    expenseRankingScope,
    expenseRankingSortBy,
    expenseRankingTopN,
    calculateCustomerProfile,
  ]);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData, dataVersion]);

  const styles = {
    container: {
      display: 'flex',
      flexDirection: 'column' as const,
      height: '100%',
      padding: '1.1rem 1.25rem',
      background: colors.page,
      color: colors.textPrimary,
      fontFamily: font.family,
    },
    header: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: '1rem',
      marginBottom: '0.85rem',
      flexWrap: 'wrap' as const,
      flexShrink: 0 as const,
    },
    title: {
      fontSize: font.title,
      fontWeight: 750,
      margin: 0,
      color: colors.textPrimary,
      letterSpacing: 0,
    },
    subtitle: {
      marginTop: '0.35rem',
      color: colors.textSecondary,
      fontSize: font.body,
    },
    toolbar: {
      display: 'flex',
      alignItems: 'center',
      flexWrap: 'wrap' as const,
      gap: '0.45rem',
      background: colors.surface,
      border: `1px solid ${colors.border}`,
      borderRadius: radii.lg,
      padding: '0.55rem',
      boxShadow: shadows.soft,
    },
    segmentButton: (active: boolean) => ({
      border: active ? `1px solid ${colors.teal}` : `1px solid ${colors.borderStrong}`,
      background: active ? colors.teal : colors.surface,
      color: active ? colors.surface : colors.textPrimary,
      borderRadius: radii.md,
      padding: '0.5rem 0.75rem',
      fontSize: font.caption,
      fontWeight: 700,
      cursor: 'pointer',
      whiteSpace: 'nowrap' as const,
      boxShadow: active ? '0 8px 18px rgba(15, 118, 110, 0.16)' : 'none',
    }),
    input: {
      height: '2.25rem',
      border: `1px solid ${colors.borderStrong}`,
      borderRadius: radii.md,
      padding: '0 0.5rem',
      fontSize: font.caption,
      background: colors.surface,
      color: colors.textPrimary,
    },
    select: {
      height: '2.25rem',
      border: `1px solid ${colors.borderStrong}`,
      borderRadius: radii.md,
      padding: '0 0.5rem',
      fontSize: font.caption,
      background: colors.surface,
      color: colors.textPrimary,
    },
    scroll: {
      flex: 1,
      overflowY: 'auto' as const,
      paddingRight: '0.25rem',
    },
    card: {
      background: colors.surface,
      border: `1px solid ${colors.border}`,
      borderRadius: radii.lg,
      padding: '1.05rem',
      boxShadow: shadows.soft,
    },
    section: {
      background: colors.surface,
      border: `1px solid ${colors.border}`,
      borderRadius: radii.lg,
      padding: '1rem',
      boxShadow: shadows.soft,
      marginBottom: '1rem',
    },
    sectionTitle: {
      margin: 0,
      fontSize: font.section,
      fontWeight: 750,
      color: colors.textPrimary,
    },
    muted: {
      color: colors.textSecondary,
      fontSize: font.caption,
    },
    table: {
      width: '100%',
      borderCollapse: 'collapse' as const,
      fontSize: font.caption,
    },
    th: {
      textAlign: 'left' as const,
      padding: '0.625rem',
      color: colors.textSecondary,
      background: colors.surfaceMuted,
      borderBottom: `1px solid ${colors.border}`,
      fontWeight: 700,
    },
    td: {
      padding: '0.625rem',
      borderBottom: `1px solid ${colors.border}`,
      color: colors.textPrimary,
    },
  };

  const kpiCards = [
    { key: 'revenue', label: t('dashboard.kpi.revenue'), value: money(currentKpis.totalSales), sub: `${t('dashboard.kpi.cash')} ${money(stats.cashPayment)} / ${t('dashboard.kpi.card')} ${money(stats.cardPayment)}`, comparison: comparisonStats.totalSales, accent: colors.success, soft: colors.successSoft, mark: 'C$' },
    { key: 'orders', label: t('dashboard.kpi.orders'), value: `${t('dashboard.kpi.completed')} ${currentKpis.orderCount}`, sub: `Mesa ${stats.dineInOrders} / Barra ${stats.takeoutOrders} / Delivery ${stats.deliveryOrders} / ${t('dashboard.kpi.cancelled')} ${stats.cancelledOrders} / ${t('dashboard.kpi.cancelledItems')} ${stats.cancelledItems}`, comparison: comparisonStats.orderCount, accent: colors.blue, soft: colors.blueSoft, mark: '#' },
    { key: 'sales', label: t('dashboard.kpi.sales'), value: `${stats.soldQuantity.toFixed(1)} ${t('dashboard.unit.portions')}`, sub: `${t('dashboard.kpi.products')} ${stats.soldProductCount} ${t('dashboard.unit.types')} / ${t('dashboard.kpi.averageTicket')} ${money(currentKpis.averageTicket)}`, comparison: comparisonStats.averageTicket, accent: '#7c74d8', soft: '#f5f3ff', mark: 'Qty' },
    { key: 'expense', label: t('dashboard.kpi.expenses'), value: money(stats.purchaseAmount + stats.expenseAmount), sub: `${t('dashboard.kpi.purchases')} ${money(stats.purchaseAmount)} / ${t('dashboard.kpi.operating')} ${money(stats.expenseAmount)}`, comparison: comparisonStats.totalExpense, accent: '#b45309', soft: '#fff7ed', mark: '-' },
    { key: 'profit', label: t('dashboard.kpi.profit'), value: money(currentKpis.profit), sub: t('dashboard.kpi.profitFormula'), comparison: comparisonStats.profit, accent: '#fb6f55', soft: '#ffe4df', mark: '±' },
  ];

  const maxRankingRevenue = Math.max(...focusedRankings.map(item => item.revenue), 0);
  const maxExpenseAmount = Math.max(...expenseRankings.map(item => item.amount), 0);
  const rankMetricLabel = rankingSortBy === 'revenue' ? t('dashboard.metric.amount') : t('dashboard.metric.quantity');
  const movementMetricLabel = movementMetric === 'revenue' ? t('dashboard.metric.amount') : t('dashboard.metric.quantity');
  const expenseMetricLabel = expenseRankingSortBy === 'amount' ? t('dashboard.metric.amount') : t('dashboard.metric.records');
  const expenseScopeLabel = getExpenseScopeLabel(expenseRankingScope, t);

  const renderMovementRow = (item: RankingMovement, index: number, type: 'up' | 'down') => {
    const delta = movementMetric === 'revenue' ? item.revenueDelta : item.quantityDelta;
    const current = movementMetric === 'revenue' ? item.currentRevenue : item.currentQuantity;
    const previous = movementMetric === 'revenue' ? item.previousRevenue : item.previousQuantity;
    const percentValue = movementMetric === 'revenue' ? item.revenuePercent : item.quantityPercent;
    const color = type === 'up' ? '#0f9488' : '#c2410c';
    const formattedDelta = movementMetric === 'revenue' ? money(delta) : delta.toFixed(1);
    const formattedCurrent = movementMetric === 'revenue' ? money(current) : current.toFixed(1);
    const formattedPrevious = movementMetric === 'revenue' ? money(previous) : previous.toFixed(1);

    return (
      <div key={`${item.name}-${index}`} style={{ display: 'grid', gridTemplateColumns: '32px 1fr auto', gap: '0.75rem', alignItems: 'center', padding: '0.625rem 0', borderBottom: '1px solid #edf4f6' }}>
        <div style={{ width: 28, height: 28, borderRadius: 14, background: type === 'up' ? '#dff7ef' : '#ffedd5', color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.75rem' }}>{index + 1}</div>
        <div>
          <div style={{ fontWeight: 700, color: '#263d50' }}>{item.name}</div>
          <div style={{ ...styles.muted, marginTop: 2 }}>{item.category} · {t('dashboard.period.current')} {formattedCurrent} / {t('dashboard.period.previous')} {formattedPrevious}</div>
        </div>
        <div style={{ textAlign: 'right', color, fontWeight: 700 }}>
          {delta > 0 ? '+' : ''}{formattedDelta}
          <div style={{ fontSize: '0.75rem', fontWeight: 650 }}>{percentValue === null ? t('dashboard.comparison.new') : `${percentValue > 0 ? '+' : ''}${percentValue.toFixed(1)}%`}</div>
        </div>
      </div>
    );
  };

  const renderExpenseMovementRow = (item: ExpenseRankingMovement, index: number, type: 'up' | 'down') => {
    const delta = expenseRankingSortBy === 'amount' ? item.amountDelta : item.countDelta;
    const current = expenseRankingSortBy === 'amount' ? item.currentAmount : item.currentCount;
    const previous = expenseRankingSortBy === 'amount' ? item.previousAmount : item.previousCount;
    const percentValue = expenseRankingSortBy === 'amount' ? item.amountPercent : item.countPercent;
    const color = type === 'up' ? '#b45309' : '#0f9488';
    const formattedDelta = expenseRankingSortBy === 'amount' ? money(delta) : `${delta.toFixed(0)} ${t('dashboard.unit.records')}`;
    const formattedCurrent = expenseRankingSortBy === 'amount' ? money(current) : `${current.toFixed(0)} ${t('dashboard.unit.records')}`;
    const formattedPrevious = expenseRankingSortBy === 'amount' ? money(previous) : `${previous.toFixed(0)} ${t('dashboard.unit.records')}`;

    return (
      <div key={`${item.key}-${index}`} style={{ display: 'grid', gridTemplateColumns: '30px minmax(0, 1fr) auto', gap: '0.65rem', alignItems: 'center', padding: '0.58rem 0', borderBottom: `1px solid ${colors.border}` }}>
        <div style={{ width: 24, height: 24, borderRadius: 12, background: type === 'up' ? '#fff7ed' : '#ecfdf5', color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 750, fontSize: '0.72rem' }}>{index + 1}</div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 720, color: colors.textPrimary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.label}</div>
          <div style={{ ...styles.muted, marginTop: 2 }}>{item.type === 'purchase' ? t('dashboard.expenseScope.purchase') : (item.parentCategory === '其他开支' ? t('dashboard.otherExpense') : item.parentCategory)} · {t('dashboard.period.current')} {formattedCurrent} / {t('dashboard.period.previous')} {formattedPrevious}</div>
        </div>
        <div style={{ textAlign: 'right', color, fontWeight: 750 }}>
          {delta > 0 ? '+' : ''}{formattedDelta}
          <div style={{ fontSize: '0.72rem', fontWeight: 650 }}>{percentValue === null ? t('dashboard.comparison.new') : `${percentValue > 0 ? '+' : ''}${percentValue.toFixed(1)}%`}</div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div style={{ padding: '3rem', textAlign: 'center', color: '#475569' }}>
        {t('dashboard.loading')}
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>{t('dashboard.title')}</h1>
          <div style={styles.subtitle}>{t('dashboard.subtitle')}</div>
        </div>
        <div style={styles.toolbar}>
          {[
            ['today', t('dashboard.range.today')],
            ['custom', t('dashboard.range.custom')],
            ['month', t('dashboard.range.month')],
          ].map(([key, label]) => (
            <button key={key} onClick={() => setTimeRange(key as any)} style={styles.segmentButton(timeRange === key)}>{label}</button>
          ))}
          {timeRange === 'custom' && (
            <>
              <input type="date" value={startDate} onChange={event => setStartDate(event.target.value)} style={styles.input} />
              <span style={styles.muted}>{t('dashboard.to')}</span>
              <input type="date" value={endDate} onChange={event => setEndDate(event.target.value)} style={styles.input} />
            </>
          )}
          {timeRange === 'month' && (
            <input type="month" value={calendarMonth} onChange={event => setCalendarMonth(event.target.value)} style={styles.input} />
          )}
          {lastSyncedAt && <span style={{ ...styles.muted, whiteSpace: 'nowrap' }}>{t('dashboard.lastSync')} {lastSyncedAt.toLocaleTimeString('es-NI', { hour12: false })}</span>}
          <button
            onClick={() => refreshManagerData(true)}
            disabled={isRefreshing}
            style={{
              ...styles.segmentButton(false),
              background: isRefreshing ? '#94a3b8' : 'linear-gradient(135deg, #0f9488, #2aa7c8)',
              color: '#ffffff',
              cursor: isRefreshing ? 'not-allowed' : 'pointer',
            }}
          >
            {isRefreshing ? t('dashboard.refreshing') : t('dashboard.refresh')}
          </button>
        </div>
      </div>

      <div style={styles.scroll}>
        <div data-manager-kpi-strip="true" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(158px, 1fr))', gap: '0.8rem', marginBottom: '1rem' }}>
          {kpiCards.map(card => (
            <div key={card.key} data-kpi-card={card.key} style={{ ...styles.card, minHeight: 122, overflow: 'hidden', padding: '0.9rem' }}>
              <div style={{ display: 'flex', gap: '0.65rem', alignItems: 'center' }}>
                <div style={{
                  width: 38,
                  height: 38,
                  borderRadius: 999,
                  background: `radial-gradient(circle at 35% 30%, #ffffff 0%, ${card.soft} 35%, ${card.accent} 100%)`,
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 760,
                  fontSize: '0.82rem',
                  boxShadow: `0 10px 24px ${card.accent}33`,
                  flex: '0 0 auto',
                }}>
                  {card.mark}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: '#50687a', fontSize: '0.78rem', fontWeight: 650 }}>{card.label}</div>
                  <div style={{ fontSize: '1.08rem', fontWeight: 760, marginTop: '0.25rem', color: '#142b3d', whiteSpace: 'nowrap' }}>{card.value}</div>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '0.35rem', marginTop: '0.7rem' }}>
                <span style={{ ...styles.muted, fontSize: '0.74rem', lineHeight: 1.35 }}>{card.sub}</span>
                <span style={{
                  alignSelf: 'flex-start',
                  color: comparisonColor(card.comparison),
                  background: `${comparisonColor(card.comparison)}13`,
                  borderRadius: 999,
                  padding: '0.16rem 0.42rem',
                  fontSize: '0.68rem',
                  fontWeight: 650,
                  whiteSpace: 'nowrap',
                }}>
                  {comparisonText(card.comparison, t)}
                </span>
              </div>
            </div>
          ))}
        </div>

        <div data-sales-analysis="true" style={{ marginBottom: '1rem' }}>
          <div style={{ margin: '0 0 0.6rem' }}>
            <h2 style={{ ...styles.sectionTitle, fontSize: '1rem' }}>{t('dashboard.salesAnalysis')}</h2>
            <div style={{ ...styles.muted, marginTop: 4 }}>{t('dashboard.salesAnalysisSubtitle')}</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.3fr) minmax(340px, 0.7fr)', gap: '1rem', marginBottom: '1rem' }}>
          <div data-monthly-sales-calendar="true" style={{ ...styles.section, marginBottom: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
              <div>
                <h2 style={styles.sectionTitle}>{t('dashboard.calendar.title')}</h2>
                <div style={{ ...styles.muted, marginTop: 4 }}>
                  {monthlyCalendar?.month || calendarMonth} · {t('dashboard.calendar.total')} {money(monthlyCalendar?.totalRevenue || 0)} · {monthlyCalendar?.totalOrders || 0} {t('dashboard.unit.orders')}
                  {monthlyCalendar?.bestWeekday ? ` · ${t('dashboard.calendar.best')} ${getWeekdayLabel(monthlyCalendar.bestWeekday.weekday, t)}` : ''}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#6b7f8f', fontSize: '0.78rem' }}>
                <span>{t('dashboard.calendar.low')}</span>
                {[0, 20, 40, 60, 80].map(level => (
                  <span key={level} style={{ width: 18, height: 14, borderRadius: 3, background: getHeatBackground(level, true), border: '1px solid #d9e7ef' }} />
                ))}
                <span>{t('dashboard.calendar.high')}</span>
              </div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <div style={{ minWidth: 560 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6, marginBottom: 8 }}>
                {(monthlyCalendar?.weekdays || ['周一', '周二', '周三', '周四', '周五', '周六', '周日']).map(day => (
                  <div key={day} style={{ ...styles.muted, fontWeight: 650, textAlign: 'center' }}>{getWeekdayLabel(day, t)}</div>
                ))}
              </div>
              {(monthlyCalendar?.weeks || []).map((week, weekIndex) => (
                <div key={weekIndex} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6, marginBottom: 6 }}>
                  {week.days.map(day => (
                    <button
                      type="button"
                      key={day.date}
                      disabled={!day.inMonth}
                      onClick={() => handleCalendarDayClick(day.date)}
                      aria-label={`${day.date} ${money(day.revenue)} ${day.orderCount} ${t('dashboard.unit.orders')}`}
                      style={{
                        width: '100%',
                        minHeight: 72,
                        padding: '0.5rem',
                        borderRadius: '0.5rem',
                        border: day.inMonth ? '1px solid rgba(148, 191, 198, 0.42)' : '1px solid #f1f5f9',
                        background: getHeatBackground(day.intensity, day.inMonth),
                        color: day.intensity >= 75 ? '#053b3d' : '#294052',
                        opacity: day.inMonth ? 1 : 0.35,
                        boxShadow: day.inMonth && day.intensity > 0 ? 'inset 0 0 0 1px rgba(255,255,255,0.42)' : 'none',
                        cursor: day.inMonth ? 'pointer' : 'default',
                        fontFamily: 'inherit',
                        textAlign: 'left',
                      }}
                    >
                      <div style={{ fontWeight: 700, fontSize: '0.8125rem', textAlign: 'center' }}>{day.day}</div>
                      <div style={{ fontWeight: 720, marginTop: 6, fontSize: '0.76rem' }}>{money(day.revenue)}</div>
                      <div style={{ fontSize: '0.72rem', marginTop: 3, color: '#557083' }}>{day.orderCount} {t('dashboard.unit.orders')}</div>
                      {day.averageDeltaPercent !== null && (
                        <div style={{ fontSize: '0.7rem', color: day.averageDeltaPercent >= 0 ? '#0f9488' : '#c2410c' }}>
                          {day.averageDeltaPercent >= 0 ? '+' : ''}{day.averageDeltaPercent.toFixed(0)}%
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              ))}
              </div>
            </div>
          </div>

          <div data-sales-ranking-panel="true" style={{ ...styles.section, marginBottom: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
              <div>
                <h2 style={styles.sectionTitle}>{getRankingScopeLabel(rankingScope, beverageCategoryFilter, t)} {t('dashboard.ranking.title')}</h2>
                <div style={{ ...styles.muted, marginTop: 4 }}>{t('dashboard.ranking.sortedBy')} {rankMetricLabel}. {t('dashboard.ranking.beverageNote')}</div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {[
                  ['all', t('dashboard.scope.all')],
                  ['dishes', t('dashboard.scope.dishes')],
                  ['beverages', t('dashboard.scope.beveragesShort')],
                ].map(([key, label]) => (
                  <button key={key} onClick={() => setRankingScope(key as RankingScope)} style={styles.segmentButton(rankingScope === key)}>{label}</button>
                ))}
                <button onClick={() => setRankingSortBy('revenue')} style={styles.segmentButton(rankingSortBy === 'revenue')}>{t('dashboard.metric.amount')}</button>
                <button onClick={() => setRankingSortBy('quantity')} style={styles.segmentButton(rankingSortBy === 'quantity')}>{t('dashboard.metric.quantity')}</button>
                <select value={rankingOrderType} onChange={event => setRankingOrderType(event.target.value as DashboardOrderTypeFilter)} style={styles.select}>
                  <option value="all">{t('dashboard.channel.all')}</option>
                  <option value="dine_in">Mesa</option>
                  <option value="takeout">Barra</option>
                  <option value="delivery">Delivery</option>
                </select>
                <select value={rankingTopN} onChange={event => setRankingTopN(Number(event.target.value))} style={styles.select}>
                  <option value={10}>Top 10</option>
                  <option value={20}>Top 20</option>
                  <option value={50}>Top 50</option>
                </select>
                {rankingScope === 'beverages' && (
                  <select value={beverageCategoryFilter} onChange={event => setBeverageCategoryFilter(event.target.value as BeverageCategoryFilter)} style={styles.select}>
                    <option value="all">{t('dashboard.scope.allBeverages')}</option>
                    <option value="Cerveza">Cerveza</option>
                    <option value="Bebida">Bebida</option>
                    <option value="Jugo">Jugo</option>
                  </select>
                )}
              </div>
            </div>
            {focusedRankings.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8', background: '#f8fafc', borderRadius: '0.5rem' }}>{t('dashboard.noSales')}</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {focusedRankings.map((item, index) => {
                  const barWidth = maxRankingRevenue > 0 ? Math.max(4, (item.revenue / maxRankingRevenue) * 100) : 0;
                  return (
                    <div key={`${item.name}-${index}`} style={{ display: 'grid', gridTemplateColumns: '36px minmax(0, 1fr) auto', gap: '0.75rem', alignItems: 'center', padding: '0.74rem 0', borderBottom: '1px solid #edf4f6' }}>
                      <div style={{
                        width: 28,
                        height: 28,
                        borderRadius: 14,
                        background: index < 3 ? 'linear-gradient(135deg, #0f9488, #38bdf8)' : '#eef5f6',
                        color: index < 3 ? '#ffffff' : '#60778a',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 700,
                        fontSize: '0.75rem',
                        boxShadow: index < 3 ? '0 8px 16px rgba(15, 148, 136, 0.16)' : 'none',
                      }}>{index + 1}</div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 700, color: '#263d50', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</div>
                        <div style={{ ...styles.muted, marginTop: 2 }}>{item.category} · {t('dashboard.averagePrice')} {money(item.averagePrice)}</div>
                        <div style={{ height: 6, background: '#edf4f6', borderRadius: 3, marginTop: 8, overflow: 'hidden' }}>
                          <div style={{ width: `${barWidth}%`, height: '100%', background: 'linear-gradient(90deg, #0f9488, #38bdf8)', borderRadius: 3 }} />
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: 700, color: '#263d50' }}>{money(item.revenue)}</div>
                        <div style={styles.muted}>{item.quantity.toFixed(1)} {t('dashboard.unit.portions')} · {pct(item.revenueShare)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          </div>

        </div>

        <div style={{ marginBottom: '1rem' }}>
          <div style={{ margin: '0 0 0.6rem' }}>
            <h2 style={{ ...styles.sectionTitle, fontSize: '1rem' }}>{t('dashboard.comparison.title')}</h2>
            <div style={{ ...styles.muted, marginTop: 4 }}>{t('dashboard.comparison.subtitle')}</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1rem' }}>
            <div style={styles.section}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', gap: '0.5rem' }}>
                <div>
                  <h2 style={styles.sectionTitle}>{t('dashboard.comparison.salesChange')}</h2>
                  <div style={{ ...styles.muted, marginTop: 4 }}>{t('dashboard.comparison.observeBy')} {movementMetricLabel}</div>
                </div>
                <div style={{ display: 'flex', gap: '0.35rem' }}>
                  <button onClick={() => setMovementMetric('revenue')} style={styles.segmentButton(movementMetric === 'revenue')}>{t('dashboard.metric.amount')}</button>
                  <button onClick={() => setMovementMetric('quantity')} style={styles.segmentButton(movementMetric === 'quantity')}>{t('dashboard.metric.quantity')}</button>
                </div>
              </div>
              <div style={{ marginBottom: '1rem' }}>
                <div style={{ fontWeight: 700, color: '#0f9488', marginBottom: '0.25rem' }}>{t('dashboard.comparison.biggestIncrease')}</div>
                {rankingMovement.increased.length === 0 ? (
                  <div style={{ ...styles.muted, padding: '0.75rem 0' }}>{t('dashboard.comparison.noIncrease')}</div>
                ) : rankingMovement.increased.slice(0, 5).map((item, index) => renderMovementRow(item, index, 'up'))}
              </div>
              <div>
                <div style={{ fontWeight: 700, color: '#c2410c', marginBottom: '0.25rem' }}>{t('dashboard.comparison.biggestDecrease')}</div>
                {rankingMovement.decreased.length === 0 ? (
                  <div style={{ ...styles.muted, padding: '0.75rem 0' }}>{t('dashboard.comparison.noDecrease')}</div>
                ) : rankingMovement.decreased.slice(0, 5).map((item, index) => renderMovementRow(item, index, 'down'))}
              </div>
            </div>

            <div style={styles.section}>
              <div style={{ marginBottom: '0.75rem' }}>
                <h2 style={styles.sectionTitle}>{t('dashboard.comparison.expenseChange')}</h2>
                <div style={{ ...styles.muted, marginTop: 4 }}>{t('dashboard.comparison.expenseSubtitle')}</div>
              </div>
              <div style={{ marginBottom: '0.9rem' }}>
                <div style={{ fontWeight: 750, color: '#b45309', marginBottom: '0.25rem' }}>{t('dashboard.comparison.biggestIncrease')}</div>
                {expenseMovement.increased.length === 0 ? (
                  <div style={{ ...styles.muted, padding: '0.75rem 0' }}>{t('dashboard.comparison.noIncrease')}</div>
                ) : expenseMovement.increased.slice(0, 5).map((item, index) => renderExpenseMovementRow(item, index, 'up'))}
              </div>
              <div>
                <div style={{ fontWeight: 750, color: '#0f9488', marginBottom: '0.25rem' }}>{t('dashboard.comparison.biggestDecrease')}</div>
                {expenseMovement.decreased.length === 0 ? (
                  <div style={{ ...styles.muted, padding: '0.75rem 0' }}>{t('dashboard.comparison.noDecrease')}</div>
                ) : expenseMovement.decreased.slice(0, 5).map((item, index) => renderExpenseMovementRow(item, index, 'down'))}
              </div>
            </div>
          </div>
        </div>

        <div data-manager-expense-analytics="true" data-expense-analysis="true" style={{ marginBottom: '1rem' }}>
          <div style={{ margin: '0 0 0.6rem' }}>
            <h2 style={{ ...styles.sectionTitle, fontSize: '1rem' }}>{t('dashboard.expenseAnalysis')}</h2>
            <div style={{ ...styles.muted, marginTop: 4 }}>{t('dashboard.expenseAnalysisSubtitle')}</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(280px, 0.8fr)', gap: '1rem' }}>
          <div style={styles.section}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
              <div>
                <h2 style={styles.sectionTitle}>{t('dashboard.expenseRanking.title')}</h2>
                <div style={{ ...styles.muted, marginTop: 4 }}>{expenseScopeLabel} · {t('dashboard.ranking.sortedBy')} {expenseMetricLabel}. {t('dashboard.expenseRanking.note')}</div>
              </div>
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                {[
                  ['all', t('dashboard.scope.all')],
                  ['operating', t('dashboard.expenseScope.operatingShort')],
                  ['purchase', t('dashboard.expenseScope.purchaseShort')],
                ].map(([key, label]) => (
                  <button key={key} onClick={() => setExpenseRankingScope(key as ExpenseRankingScope)} style={styles.segmentButton(expenseRankingScope === key)}>{label}</button>
                ))}
                <button onClick={() => setExpenseRankingSortBy('amount')} style={styles.segmentButton(expenseRankingSortBy === 'amount')}>{t('dashboard.metric.amount')}</button>
                <button onClick={() => setExpenseRankingSortBy('count')} style={styles.segmentButton(expenseRankingSortBy === 'count')}>{t('dashboard.metric.records')}</button>
                <select value={expenseRankingTopN} onChange={event => setExpenseRankingTopN(Number(event.target.value))} style={styles.select}>
                  <option value={10}>Top 10</option>
                  <option value={20}>Top 20</option>
                  <option value={50}>Top 50</option>
                </select>
              </div>
            </div>
            {expenseRankings.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8', background: '#f8fafc', borderRadius: '0.5rem' }}>{t('dashboard.noExpenses')}</div>
            ) : (
              <div>
                {expenseRankings.map((item, index) => {
                  const barWidth = maxExpenseAmount > 0 ? Math.max(4, (item.amount / maxExpenseAmount) * 100) : 0;
                  const accent = item.type === 'purchase' ? '#b45309' : '#0f9488';
                  return (
                    <div key={item.key} style={{ display: 'grid', gridTemplateColumns: '34px minmax(0, 1fr) auto', gap: '0.7rem', alignItems: 'center', padding: '0.68rem 0', borderBottom: `1px solid ${colors.border}` }}>
                      <div style={{ width: 28, height: 28, borderRadius: 14, background: index < 3 ? 'linear-gradient(135deg, #f59e0b, #0f9488)' : colors.surfaceMuted, color: index < 3 ? '#ffffff' : colors.textSecondary, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 750, fontSize: '0.74rem' }}>{index + 1}</div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', gap: '0.45rem', alignItems: 'center', minWidth: 0 }}>
                          <span style={{ fontWeight: 750, color: colors.textPrimary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.label}</span>
                          <span style={{ flexShrink: 0, borderRadius: 999, background: item.type === 'purchase' ? '#fff7ed' : '#ecfdf5', color: accent, padding: '0.12rem 0.45rem', fontSize: '0.68rem', fontWeight: 750 }}>{item.type === 'purchase' ? t('dashboard.expenseScope.purchase') : t('dashboard.expenseScope.operating')}</span>
                        </div>
                        <div style={{ ...styles.muted, marginTop: 2 }}>{item.fullCategory} · {t('dashboard.averageAmount')} {money(item.averageAmount)}</div>
                        <div style={{ height: 7, background: colors.surfaceMuted, borderRadius: 999, marginTop: 8, overflow: 'hidden' }}>
                          <div style={{ width: `${barWidth}%`, height: '100%', background: `linear-gradient(90deg, ${accent}, #38bdf8)`, borderRadius: 999 }} />
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: 780, color: colors.textPrimary }}>{money(item.amount)}</div>
                        <div style={styles.muted}>{item.count} {t('dashboard.unit.records')} · {pct(item.amountShare)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div style={styles.section}>
            <h2 style={styles.sectionTitle}>{t('dashboard.topPurchases.title')}</h2>
            <div style={{ ...styles.muted, marginTop: 4 }}>{t('dashboard.topPurchases.subtitle')}</div>
            <div style={{ marginTop: '0.75rem' }}>
              {topPurchases.length === 0 ? <div style={styles.muted}>{t('dashboard.noPurchases')}</div> : topPurchases.map((item, index) => (
                <div key={item.name} style={{ display: 'grid', gridTemplateColumns: '30px minmax(0, 1fr) auto', gap: '0.65rem', alignItems: 'center', padding: '0.58rem 0', borderBottom: `1px solid ${colors.border}` }}>
                  <span style={{ fontWeight: 750, color: colors.textSecondary }}>{index + 1}</span>
                  <span style={{ fontWeight: 680, color: colors.textPrimary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}<span style={{ ...styles.muted, marginLeft: 6 }}>x {item.quantity}</span></span>
                  <span style={{ fontWeight: 750, color: colors.textPrimary }}>{money(item.amount)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        </div>

        {salesTrend.length > 0 && (
          <div style={styles.section}>
            <h2 style={styles.sectionTitle}>{t('dashboard.trend.title')}</h2>
            <div style={{ overflowX: 'auto', marginTop: '0.75rem' }}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>{t('dashboard.trend.date')}</th>
                    <th style={{ ...styles.th, textAlign: 'right' }}>{t('dashboard.kpi.revenue')}</th>
                    <th style={{ ...styles.th, textAlign: 'right' }}>{t('dashboard.kpi.orders')}</th>
                    <th style={{ ...styles.th, textAlign: 'right' }}>Mesa</th>
                    <th style={{ ...styles.th, textAlign: 'right' }}>Barra</th>
                    <th style={{ ...styles.th, textAlign: 'right' }}>Delivery</th>
                    <th style={{ ...styles.th, textAlign: 'right' }}>{t('dashboard.kpi.profit')}</th>
                  </tr>
                </thead>
                <tbody>
                  {salesTrend.map(day => (
                    <tr key={day.date}>
                      <td style={styles.td}>{day.date}</td>
                      <td style={{ ...styles.td, textAlign: 'right', fontWeight: 700 }}>{money(day.sales)}</td>
                      <td style={{ ...styles.td, textAlign: 'right' }}>{day.orders}</td>
                      <td style={{ ...styles.td, textAlign: 'right' }}>{money(day.dineInSales)}</td>
                      <td style={{ ...styles.td, textAlign: 'right' }}>{money(day.takeoutSales)}</td>
                      <td style={{ ...styles.td, textAlign: 'right' }}>{money(day.deliverySales)}</td>
                      <td style={{ ...styles.td, textAlign: 'right', color: day.profit >= 0 ? '#0f9488' : '#c2410c', fontWeight: 700 }}>{money(day.profit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div data-customer-analysis="true" style={{ marginBottom: '1rem' }}>
          <div style={{ margin: '0 0 0.6rem' }}>
            <h2 style={{ ...styles.sectionTitle, fontSize: '1rem' }}>{t('dashboard.customer.title')}</h2>
            <div style={{ ...styles.muted, marginTop: 4 }}>{t('dashboard.customer.subtitle')}</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem' }}>
          <div style={styles.section}>
            <h2 style={styles.sectionTitle}>{t('dashboard.customer.composition')}</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem', marginTop: '0.75rem' }}>
              <div style={{ background: '#eff6ff', borderRadius: '0.5rem', padding: '0.875rem' }}>
                <div style={{ ...styles.muted, color: '#1d4ed8' }}>{t('dashboard.customer.new')}</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 720, color: '#2aa7c8' }}>{customerProfile.newCustomers}</div>
                <div style={styles.muted}>{t('dashboard.customer.share')} {pct(customerProfile.newCustomerRate)}</div>
              </div>
              <div style={{ background: '#ecfdf5', borderRadius: '0.5rem', padding: '0.875rem' }}>
                <div style={{ ...styles.muted, color: '#0f9488' }}>{t('dashboard.customer.returning')}</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 720, color: '#0f9488' }}>{customerProfile.returningCustomers}</div>
                <div style={styles.muted}>{t('dashboard.customer.share')} {pct(100 - customerProfile.newCustomerRate)}</div>
              </div>
            </div>
            <div style={{ marginTop: '0.875rem', display: 'flex', justifyContent: 'space-between' }}>
              <span style={styles.muted}>{t('dashboard.customer.total')}</span>
              <strong>{customerProfile.totalCustomers}</strong>
            </div>
            <div style={{ marginTop: '0.5rem', display: 'flex', justifyContent: 'space-between' }}>
              <span style={styles.muted}>{t('dashboard.customer.averageFrequency')}</span>
              <strong>{customerProfile.avgOrderFrequency.toFixed(1)} {t('dashboard.unit.times')}</strong>
            </div>
          </div>

          <div style={styles.section}>
            <h2 style={styles.sectionTitle}>{t('dashboard.customer.peakHours')}</h2>
            <div style={{ marginTop: '0.75rem' }}>
              {customerProfile.peakHours.length === 0 ? <div style={styles.muted}>{t('dashboard.noData')}</div> : customerProfile.peakHours.map((slot, index) => (
                <div key={slot.hour} style={{ display: 'grid', gridTemplateColumns: '32px 1fr auto', gap: '0.75rem', alignItems: 'center', padding: '0.625rem 0', borderBottom: '1px solid #f1f5f9' }}>
                  <span style={{ fontWeight: 700, color: '#6b7f8f' }}>{index + 1}</span>
                  <span style={{ fontWeight: 650, color: '#263d50' }}>{String(slot.hour).padStart(2, '0')}:00 - {String(slot.hour + 1).padStart(2, '0')}:00<span style={{ ...styles.muted, marginLeft: 6 }}>{slot.orderCount} {t('dashboard.unit.orders')}</span></span>
                  <span style={{ fontWeight: 700, color: '#263d50' }}>{money(slot.revenue)}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={styles.section}>
            <h2 style={styles.sectionTitle}>{t('dashboard.customer.categoryPreference')}</h2>
            <div style={{ marginTop: '0.75rem' }}>
              {customerProfile.categoryPreference.length === 0 ? <div style={styles.muted}>{t('dashboard.noData')}</div> : customerProfile.categoryPreference.slice(0, 8).map(item => (
                <div key={item.category} style={{ marginBottom: '0.75rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem' }}>
                    <span style={{ fontWeight: 650, color: '#263d50' }}>{item.category === '其他' ? t('dashboard.other') : item.category}</span>
                    <span style={styles.muted}>{item.orderCount} {t('dashboard.unit.portions')} · {pct(item.percentage)}</span>
                  </div>
                  <div style={{ height: 6, background: '#edf4f6', borderRadius: 3, marginTop: 6, overflow: 'hidden' }}>
                    <div style={{ width: `${item.percentage}%`, height: '100%', background: 'linear-gradient(90deg, #0f9488, #38bdf8)' }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={styles.section}>
            <h2 style={styles.sectionTitle}>{t('dashboard.customer.vip')}</h2>
            <div style={{ marginTop: '0.75rem' }}>
              {customerProfile.topCustomers.length === 0 ? <div style={styles.muted}>{t('dashboard.noData')}</div> : customerProfile.topCustomers.map((customer, index) => (
                <div key={`${customer.phone || 'guest'}-${index}`} style={{ display: 'grid', gridTemplateColumns: '32px 1fr auto', gap: '0.75rem', alignItems: 'center', padding: '0.625rem 0', borderBottom: '1px solid #f1f5f9' }}>
                  <span style={{ fontWeight: 700, color: '#6b7f8f' }}>{index + 1}</span>
                  <div>
                    <div style={{ fontWeight: 650, color: '#263d50' }}>{customer.phone || t('dashboard.customer.walkIn')}</div>
                    <div style={styles.muted}>{customer.orderCount} {t('dashboard.unit.times')} · {t('dashboard.customer.favorite')} {customer.favoriteDish || '-'}</div>
                  </div>
                  <span style={{ fontWeight: 700, color: '#263d50' }}>{money(customer.totalSpent)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardModule;
