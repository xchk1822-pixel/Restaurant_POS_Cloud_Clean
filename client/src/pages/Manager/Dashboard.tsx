import React, { useEffect, useState } from 'react';
import { dataManager } from '../../services/dataManager';
import { smartGetDocuments } from '../../services/smartSyncService';
import { toTimestampMillis } from '../../utils/localTime';
import { getLocalDateString } from '../../utils/exchangeRate';
import {
  getExpenseDateKey,
  getOrderCollectedAmount,
  getOrderFinancialDateKey,
  getOrderPaymentBreakdown,
  isPurchaseRelatedExpense,
  sumExpensesByKind,
} from '../../utils/financeMetrics';
import {
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
  type MonthlySalesCalendar,
  type PeriodComparison,
  type RankingMovement,
  type RankingScope,
  type RankingSortBy,
  type SalesRanking as AnalyticsSalesRanking,
} from '../../utils/dashboardAnalytics';

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
  dineInRevenue: number;
  takeoutRevenue: number;
  deliveryRevenue: number;
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
  profit: PeriodComparison;
}

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
  dineInRevenue: 0,
  takeoutRevenue: 0,
  deliveryRevenue: 0,
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
  profit: buildPeriodComparison(0, 0),
};

const getRecordDateString = (value: any): string => {
  if (!value) return '';
  const timestamp = toTimestampMillis(value);
  return timestamp ? getLocalDateString(new Date(timestamp)) : '';
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

const comparisonText = (comparison: PeriodComparison): string => {
  if (comparison.direction === 'flat') return '与上期持平';
  const sign = comparison.value > 0 ? '+' : '';
  const percentText = comparison.percent === null ? '' : ` / ${sign}${comparison.percent.toFixed(1)}%`;
  return `${sign}${comparison.value.toFixed(2)}${percentText}`;
};

const comparisonColor = (comparison: PeriodComparison): string => {
  if (comparison.direction === 'up') return '#047857';
  if (comparison.direction === 'down') return '#b91c1c';
  return '#64748b';
};

const getOrderType = (order: any): DashboardOrderTypeFilter => order?.orderType || 'dine_in';

const getRankingScopeLabel = (scope: RankingScope, beverageCategory: BeverageCategoryFilter): string => {
  if (scope === 'dishes') return '菜品';
  if (scope === 'beverages') return beverageCategory === 'all' ? '酒水饮料' : beverageCategory;
  return '全部商品';
};

const getHeatBackground = (intensity: number, inMonth: boolean): string => {
  if (!inMonth) return '#f8fafc';
  if (intensity <= 0) return '#ffffff';
  if (intensity < 25) return '#ecfdf5';
  if (intensity < 50) return '#bbf7d0';
  if (intensity < 75) return '#86efac';
  return '#22c55e';
};

const DashboardModule: React.FC<DashboardModuleProps> = ({ orders: propOrders }) => {
  const [timeRange, setTimeRange] = useState<'today' | 'week' | 'month' | 'custom'>('today');
  const [startDate, setStartDate] = useState(getLocalDateString(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)));
  const [endDate, setEndDate] = useState(getLocalDateString());
  const [calendarMonth, setCalendarMonth] = useState(getLocalDateString().slice(0, 7));

  const [orders, setOrders] = useState<any[]>(() => propOrders || dataManager.getData('orders') || []);
  const [menuItems, setMenuItems] = useState<any[]>(() => dataManager.getData('menuItems') || []);
  const [inventoryItems, setInventoryItems] = useState<any[]>(() => dataManager.getData('inventory') || []);
  const [dataVersion, setDataVersion] = useState(0);

  const [rankingScope, setRankingScope] = useState<RankingScope>('all');
  const [rankingSortBy, setRankingSortBy] = useState<RankingSortBy>('revenue');
  const [rankingOrderType, setRankingOrderType] = useState<DashboardOrderTypeFilter>('all');
  const [rankingTopN, setRankingTopN] = useState<number>(10);
  const [beverageCategoryFilter, setBeverageCategoryFilter] = useState<BeverageCategoryFilter>('all');
  const [movementMetric, setMovementMetric] = useState<RankingSortBy>('revenue');

  const [stats, setStats] = useState<TimeRangeStats>(emptyStats);
  const [currentKpis, setCurrentKpis] = useState<DashboardKpis>(emptyKpis);
  const [comparisonStats, setComparisonStats] = useState<ComparisonStats>(emptyComparison);
  const [focusedRankings, setFocusedRankings] = useState<AnalyticsSalesRanking[]>([]);
  const [rankingMovement, setRankingMovement] = useState<{ increased: RankingMovement[]; decreased: RankingMovement[] }>({ increased: [], decreased: [] });
  const [monthlyCalendar, setMonthlyCalendar] = useState<MonthlySalesCalendar | null>(null);
  const [salesTrend, setSalesTrend] = useState<DailyTrend[]>([]);
  const [expenseByCategory, setExpenseByCategory] = useState<Array<{ category: string; amount: number }>>([]);
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

  const refreshManagerData = React.useCallback(async () => {
    setIsRefreshing(true);
    try {
      const [cloudOrders, cloudExpenses, cloudPurchases, cloudMenuItems, cloudInventoryItems] = await Promise.all([
        smartGetDocuments('pos_orders', true),
        smartGetDocuments('expenses', true),
        smartGetDocuments('purchase_orders', true),
        smartGetDocuments('menu_items', true),
        smartGetDocuments('inventory_items', true),
      ]);

      await Promise.all([
        dataManager.saveData('orders', cloudOrders, { syncFirestore: false, notify: false }),
        dataManager.saveData('expenses', cloudExpenses, { syncFirestore: false, notify: false }),
        dataManager.saveData('purchases', cloudPurchases, { syncFirestore: false, notify: false }),
        dataManager.saveData('menuItems', cloudMenuItems, { syncFirestore: false, notify: false }),
        dataManager.saveData('inventory', cloudInventoryItems, { syncFirestore: false, notify: false }),
      ]);

      dataManager.clearCache();
      setOrders(cloudOrders);
      setMenuItems(cloudMenuItems);
      setInventoryItems(cloudInventoryItems);
      setDataVersion(version => version + 1);
      setLastSyncedAt(new Date());
    } catch (error) {
      console.error('刷新店长数据失败:', error);
      alert('刷新店长数据失败，请检查网络后重试');
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    refreshManagerData();
  }, [refreshManagerData]);

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
      const range = normalizeDashboardRange(timeRange, startDate, endDate, new Date());
      const dashboardOrders = propOrders || orders || getStoreOrdersDirect();
      const filteredOrders = filterOrdersByRange(dashboardOrders, range.startDate, range.endDateExclusive);
      const previousOrders = filterOrdersByRange(dashboardOrders, range.previousStartDate, range.previousEndDateExclusive);
      const financialOrders = filteredOrders.filter((order: any) => getOrderCollectedAmount(order) > 0);
      const previousFinancialOrders = previousOrders.filter((order: any) => getOrderCollectedAmount(order) > 0);
      const expenses = dataManager.getData('expenses') || [];
      const purchases = dataManager.getData('purchases') || [];

      const expenseAmount = sumExpensesByKind(expenses, range.startDate, range.endDateExclusive, 'operating');
      const purchaseAmount = sumExpensesByKind(expenses, range.startDate, range.endDateExclusive, 'purchase');
      const previousExpenseAmount = sumExpensesByKind(expenses, range.previousStartDate, range.previousEndDateExclusive, 'operating');
      const previousPurchaseAmount = sumExpensesByKind(expenses, range.previousStartDate, range.previousEndDateExclusive, 'purchase');
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
      const profit = totalSales - purchaseAmount - expenseAmount;

      const dineInOrders = financialOrders.filter((order: any) => getOrderType(order) === 'dine_in').length;
      const takeoutOrders = financialOrders.filter((order: any) => getOrderType(order) === 'takeout').length;
      const deliveryOrders = financialOrders.filter((order: any) => getOrderType(order) === 'delivery').length;
      const dineInRevenue = financialOrders
        .filter((order: any) => getOrderType(order) === 'dine_in')
        .reduce((sum: number, order: any) => sum + getOrderCollectedAmount(order), 0);
      const takeoutRevenue = financialOrders
        .filter((order: any) => getOrderType(order) === 'takeout')
        .reduce((sum: number, order: any) => sum + getOrderCollectedAmount(order), 0);
      const deliveryRevenue = financialOrders
        .filter((order: any) => getOrderType(order) === 'delivery')
        .reduce((sum: number, order: any) => sum + getOrderCollectedAmount(order), 0);

      const currentKpiData = buildKpis(financialOrders, { purchaseAmount, expenseAmount });
      const previousKpiData = buildKpis(previousFinancialOrders, { purchaseAmount: previousPurchaseAmount, expenseAmount: previousExpenseAmount });
      const rankingFilters = {
        scope: rankingScope,
        sortBy: rankingSortBy,
        orderType: rankingOrderType,
        topN: rankingTopN,
        beverageCategory: beverageCategoryFilter,
      };
      const movementFilters = { ...rankingFilters, sortBy: movementMetric };

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
        if (trendMap[dateKey]) trendMap[dateKey].profit -= Number(expense.amount || 0);
      });
      Object.keys(trendMap).forEach(dateKey => {
        trendMap[dateKey].profit += trendMap[dateKey].sales;
      });

      const expenseCategories: Record<string, number> = {};
      expenses.forEach((expense: any) => {
        const expenseDate = getExpenseDateKey(expense);
        if (!isPurchaseRelatedExpense(expense) && expenseDate >= range.startDate && expenseDate < range.endDateExclusive) {
          const category = expense.categoryName || expense.category || '其他';
          expenseCategories[category] = (expenseCategories[category] || 0) + Number(expense.amount || 0);
        }
      });

      const purchaseItems: Record<string, { name: string; quantity: number; amount: number }> = {};
      purchases.forEach((purchase: any) => {
        const purchaseDate = getRecordDateString(purchase.date || purchase.createdAt);
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
        dineInRevenue,
        takeoutRevenue,
        deliveryRevenue,
      });
      setCurrentKpis(currentKpiData);
      setComparisonStats({
        totalSales: buildPeriodComparison(currentKpiData.totalSales, previousKpiData.totalSales),
        orderCount: buildPeriodComparison(currentKpiData.orderCount, previousKpiData.orderCount),
        averageTicket: buildPeriodComparison(currentKpiData.averageTicket, previousKpiData.averageTicket),
        cashPayment: buildPeriodComparison(currentKpiData.cashPayment, previousKpiData.cashPayment),
        cardPayment: buildPeriodComparison(currentKpiData.cardPayment, previousKpiData.cardPayment),
        profit: buildPeriodComparison(currentKpiData.profit, previousKpiData.profit),
      });
      setFocusedRankings(buildSalesRankings(financialOrders, menuItems, inventoryItems, rankingFilters));
      setRankingMovement(buildRankingComparison(financialOrders, previousFinancialOrders, menuItems, inventoryItems, movementFilters));
      setMonthlyCalendar(buildMonthlySalesCalendar(dashboardOrders, calendarMonth));
      setSalesTrend(Object.values(trendMap).sort((a, b) => a.date.localeCompare(b.date)));
      setExpenseByCategory(Object.entries(expenseCategories).map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount));
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
    menuItems,
    inventoryItems,
    rankingScope,
    rankingSortBy,
    rankingOrderType,
    rankingTopN,
    beverageCategoryFilter,
    calendarMonth,
    movementMetric,
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
      padding: '1rem',
      background: '#f3f4f6',
      color: '#111827',
    },
    header: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: '1rem',
      marginBottom: '1rem',
      flexWrap: 'wrap' as const,
      flexShrink: 0 as const,
    },
    title: {
      fontSize: '1.5rem',
      fontWeight: 800,
      margin: 0,
      color: '#111827',
      letterSpacing: 0,
    },
    subtitle: {
      marginTop: '0.25rem',
      color: '#64748b',
      fontSize: '0.875rem',
    },
    toolbar: {
      display: 'flex',
      alignItems: 'center',
      flexWrap: 'wrap' as const,
      gap: '0.5rem',
      background: '#ffffff',
      border: '1px solid #e5e7eb',
      borderRadius: '0.5rem',
      padding: '0.5rem',
      boxShadow: '0 1px 2px rgba(15,23,42,0.05)',
    },
    segmentButton: (active: boolean) => ({
      border: '1px solid transparent',
      background: active ? '#111827' : '#f8fafc',
      color: active ? '#ffffff' : '#334155',
      borderRadius: '0.375rem',
      padding: '0.5rem 0.75rem',
      fontSize: '0.8125rem',
      fontWeight: 700,
      cursor: 'pointer',
      whiteSpace: 'nowrap' as const,
    }),
    input: {
      height: '2.25rem',
      border: '1px solid #d1d5db',
      borderRadius: '0.375rem',
      padding: '0 0.5rem',
      fontSize: '0.8125rem',
      background: '#ffffff',
    },
    select: {
      height: '2.25rem',
      border: '1px solid #d1d5db',
      borderRadius: '0.375rem',
      padding: '0 0.5rem',
      fontSize: '0.8125rem',
      background: '#ffffff',
      color: '#111827',
    },
    scroll: {
      flex: 1,
      overflowY: 'auto' as const,
      paddingRight: '0.25rem',
    },
    card: {
      background: '#ffffff',
      border: '1px solid #e5e7eb',
      borderRadius: '0.5rem',
      padding: '1rem',
      boxShadow: '0 1px 3px rgba(15,23,42,0.06)',
    },
    section: {
      background: '#ffffff',
      border: '1px solid #e5e7eb',
      borderRadius: '0.5rem',
      padding: '1rem',
      boxShadow: '0 1px 3px rgba(15,23,42,0.06)',
      marginBottom: '1rem',
    },
    sectionTitle: {
      margin: 0,
      fontSize: '1rem',
      fontWeight: 800,
      color: '#111827',
    },
    muted: {
      color: '#64748b',
      fontSize: '0.8125rem',
    },
    table: {
      width: '100%',
      borderCollapse: 'collapse' as const,
      fontSize: '0.8125rem',
    },
    th: {
      textAlign: 'left' as const,
      padding: '0.625rem',
      color: '#475569',
      background: '#f8fafc',
      borderBottom: '1px solid #e5e7eb',
      fontWeight: 800,
    },
    td: {
      padding: '0.625rem',
      borderBottom: '1px solid #f1f5f9',
      color: '#334155',
    },
  };

  const kpiCards = [
    { label: '营业额', value: money(currentKpis.totalSales), sub: `${stats.orderCount} 笔订单`, comparison: comparisonStats.totalSales },
    { label: '订单数', value: String(currentKpis.orderCount), sub: `客单价 ${money(currentKpis.averageTicket)}`, comparison: comparisonStats.orderCount },
    { label: '现金收入', value: money(currentKpis.cashPayment), sub: `占比 ${stats.totalSales > 0 ? pct((stats.cashPayment / stats.totalSales) * 100) : '0.0%'}`, comparison: comparisonStats.cashPayment },
    { label: '刷卡收入', value: money(currentKpis.cardPayment), sub: `占比 ${stats.totalSales > 0 ? pct((stats.cardPayment / stats.totalSales) * 100) : '0.0%'}`, comparison: comparisonStats.cardPayment },
    { label: '盈亏', value: money(currentKpis.profit), sub: `采购 ${money(stats.purchaseAmount)} / 开支 ${money(stats.expenseAmount)}`, comparison: comparisonStats.profit },
  ];

  const maxRankingRevenue = Math.max(...focusedRankings.map(item => item.revenue), 0);
  const rankMetricLabel = rankingSortBy === 'revenue' ? '金额' : '销量';
  const movementMetricLabel = movementMetric === 'revenue' ? '金额' : '销量';

  const renderMovementRow = (item: RankingMovement, index: number, type: 'up' | 'down') => {
    const delta = movementMetric === 'revenue' ? item.revenueDelta : item.quantityDelta;
    const current = movementMetric === 'revenue' ? item.currentRevenue : item.currentQuantity;
    const previous = movementMetric === 'revenue' ? item.previousRevenue : item.previousQuantity;
    const percentValue = movementMetric === 'revenue' ? item.revenuePercent : item.quantityPercent;
    const color = type === 'up' ? '#047857' : '#b91c1c';
    const formattedDelta = movementMetric === 'revenue' ? money(delta) : delta.toFixed(1);
    const formattedCurrent = movementMetric === 'revenue' ? money(current) : current.toFixed(1);
    const formattedPrevious = movementMetric === 'revenue' ? money(previous) : previous.toFixed(1);

    return (
      <div key={`${item.name}-${index}`} style={{ display: 'grid', gridTemplateColumns: '32px 1fr auto', gap: '0.75rem', alignItems: 'center', padding: '0.625rem 0', borderBottom: '1px solid #f1f5f9' }}>
        <div style={{ width: 28, height: 28, borderRadius: 14, background: type === 'up' ? '#dcfce7' : '#fee2e2', color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.75rem' }}>{index + 1}</div>
        <div>
          <div style={{ fontWeight: 800, color: '#111827' }}>{item.name}</div>
          <div style={{ ...styles.muted, marginTop: 2 }}>{item.category} · 本期 {formattedCurrent} / 上期 {formattedPrevious}</div>
        </div>
        <div style={{ textAlign: 'right', color, fontWeight: 800 }}>
          {delta > 0 ? '+' : ''}{formattedDelta}
          <div style={{ fontSize: '0.75rem', fontWeight: 700 }}>{percentValue === null ? '新增' : `${percentValue > 0 ? '+' : ''}${percentValue.toFixed(1)}%`}</div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div style={{ padding: '3rem', textAlign: 'center', color: '#475569' }}>
        数据加载中...
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>数据概览</h1>
          <div style={styles.subtitle}>销售、排行、月历和经营对比</div>
        </div>
        <div style={styles.toolbar}>
          {[
            ['today', '今日'],
            ['week', '近7天'],
            ['month', '近30天'],
            ['custom', '自定义'],
          ].map(([key, label]) => (
            <button key={key} onClick={() => setTimeRange(key as any)} style={styles.segmentButton(timeRange === key)}>{label}</button>
          ))}
          {timeRange === 'custom' && (
            <>
              <input type="date" value={startDate} onChange={event => setStartDate(event.target.value)} style={styles.input} />
              <span style={styles.muted}>至</span>
              <input type="date" value={endDate} onChange={event => setEndDate(event.target.value)} style={styles.input} />
            </>
          )}
          <input type="month" value={calendarMonth} onChange={event => setCalendarMonth(event.target.value)} style={styles.input} />
          {lastSyncedAt && <span style={{ ...styles.muted, whiteSpace: 'nowrap' }}>最后同步 {lastSyncedAt.toLocaleTimeString('es-NI', { hour12: false })}</span>}
          <button
            onClick={refreshManagerData}
            disabled={isRefreshing}
            style={{
              ...styles.segmentButton(false),
              background: isRefreshing ? '#94a3b8' : '#0f766e',
              color: '#ffffff',
              cursor: isRefreshing ? 'not-allowed' : 'pointer',
            }}
          >
            {isRefreshing ? '刷新中...' : '刷新云端数据'}
          </button>
        </div>
      </div>

      <div style={styles.scroll}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
          {kpiCards.map(card => (
            <div key={card.label} style={styles.card}>
              <div style={styles.muted}>{card.label}</div>
              <div style={{ fontSize: '1.375rem', fontWeight: 900, marginTop: '0.375rem', color: '#111827' }}>{card.value}</div>
              <div style={{ ...styles.muted, marginTop: '0.25rem' }}>{card.sub}</div>
              <div style={{ marginTop: '0.75rem', color: comparisonColor(card.comparison), fontSize: '0.8125rem', fontWeight: 800 }}>
                {comparisonText(card.comparison)}
              </div>
            </div>
          ))}
        </div>

        <div style={styles.section}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
            <div>
              <h2 style={styles.sectionTitle}>月度销售日历</h2>
              <div style={{ ...styles.muted, marginTop: 4 }}>
                {monthlyCalendar?.month || calendarMonth} · 总额 {money(monthlyCalendar?.totalRevenue || 0)} · {monthlyCalendar?.totalOrders || 0} 单
                {monthlyCalendar?.bestWeekday ? ` · 最高 ${monthlyCalendar.bestWeekday.weekday}` : ''}
              </div>
            </div>
            <div style={styles.muted}>颜色越深表示当天销售额越高</div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <div style={{ minWidth: 760 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr) 110px', gap: 6, marginBottom: 6 }}>
                {(monthlyCalendar?.weekdays || ['周一', '周二', '周三', '周四', '周五', '周六', '周日']).map(day => (
                  <div key={day} style={{ ...styles.muted, fontWeight: 800, textAlign: 'center' }}>{day}</div>
                ))}
                <div style={{ ...styles.muted, fontWeight: 800, textAlign: 'center' }}>周合计</div>
              </div>
              {(monthlyCalendar?.weeks || []).map((week, weekIndex) => (
                <div key={weekIndex} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr) 110px', gap: 6, marginBottom: 6 }}>
                  {week.days.map(day => (
                    <div
                      key={day.date}
                      style={{
                        minHeight: 78,
                        padding: '0.5rem',
                        borderRadius: '0.5rem',
                        border: day.inMonth ? '1px solid #dbe4ea' : '1px solid #f1f5f9',
                        background: getHeatBackground(day.intensity, day.inMonth),
                        color: day.intensity >= 75 ? '#052e16' : '#111827',
                        opacity: day.inMonth ? 1 : 0.35,
                      }}
                    >
                      <div style={{ fontWeight: 900, fontSize: '0.8125rem' }}>{day.day}</div>
                      <div style={{ fontWeight: 800, marginTop: 6, fontSize: '0.8125rem' }}>{money(day.revenue)}</div>
                      <div style={{ fontSize: '0.72rem', marginTop: 3 }}>{day.orderCount} 单</div>
                      {day.averageDeltaPercent !== null && (
                        <div style={{ fontSize: '0.7rem', color: day.averageDeltaPercent >= 0 ? '#047857' : '#b91c1c' }}>
                          {day.averageDeltaPercent >= 0 ? '+' : ''}{day.averageDeltaPercent.toFixed(0)}%
                        </div>
                      )}
                    </div>
                  ))}
                  <div style={{ padding: '0.5rem', borderRadius: '0.5rem', background: '#0f172a', color: '#ffffff', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                    <div style={{ fontWeight: 900 }}>{money(week.weeklyRevenue)}</div>
                    <div style={{ fontSize: '0.75rem', marginTop: 4 }}>{week.weeklyOrders} 单</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.3fr) minmax(320px, 0.7fr)', gap: '1rem', marginBottom: '1rem' }}>
          <div style={styles.section}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
              <div>
                <h2 style={styles.sectionTitle}>{getRankingScopeLabel(rankingScope, beverageCategoryFilter)}销售排行</h2>
                <div style={{ ...styles.muted, marginTop: 4 }}>当前按{rankMetricLabel}排序，酒水会从库存分类补齐，不再漏掉饮料和啤酒</div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {[
                  ['all', '全部'],
                  ['dishes', '菜品'],
                  ['beverages', '酒水'],
                ].map(([key, label]) => (
                  <button key={key} onClick={() => setRankingScope(key as RankingScope)} style={styles.segmentButton(rankingScope === key)}>{label}</button>
                ))}
                <button onClick={() => setRankingSortBy('revenue')} style={styles.segmentButton(rankingSortBy === 'revenue')}>金额</button>
                <button onClick={() => setRankingSortBy('quantity')} style={styles.segmentButton(rankingSortBy === 'quantity')}>销量</button>
                <select value={rankingOrderType} onChange={event => setRankingOrderType(event.target.value as DashboardOrderTypeFilter)} style={styles.select}>
                  <option value="all">全部渠道</option>
                  <option value="dine_in">堂食</option>
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
                    <option value="all">全部酒水</option>
                    <option value="Cerveza">Cerveza</option>
                    <option value="Bebida">Bebida</option>
                    <option value="Jugo">Jugo</option>
                  </select>
                )}
              </div>
            </div>
            {focusedRankings.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8', background: '#f8fafc', borderRadius: '0.5rem' }}>暂无销售数据</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {focusedRankings.map((item, index) => {
                  const barWidth = maxRankingRevenue > 0 ? Math.max(4, (item.revenue / maxRankingRevenue) * 100) : 0;
                  return (
                    <div key={`${item.name}-${index}`} style={{ display: 'grid', gridTemplateColumns: '36px minmax(0, 1fr) 110px 110px 100px', gap: '0.75rem', alignItems: 'center', padding: '0.75rem 0', borderBottom: '1px solid #f1f5f9' }}>
                      <div style={{ width: 28, height: 28, borderRadius: 14, background: index < 3 ? '#111827' : '#e2e8f0', color: index < 3 ? '#ffffff' : '#475569', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '0.75rem' }}>{index + 1}</div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 900, color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</div>
                        <div style={{ ...styles.muted, marginTop: 2 }}>{item.category} · 均价 {money(item.averagePrice)}</div>
                        <div style={{ height: 6, background: '#e2e8f0', borderRadius: 3, marginTop: 8, overflow: 'hidden' }}>
                          <div style={{ width: `${barWidth}%`, height: '100%', background: '#0f766e', borderRadius: 3 }} />
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={styles.muted}>销量</div>
                        <div style={{ fontWeight: 900 }}>{item.quantity.toFixed(1)}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={styles.muted}>金额</div>
                        <div style={{ fontWeight: 900 }}>{money(item.revenue)}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={styles.muted}>占比</div>
                        <div style={{ fontWeight: 900 }}>{pct(item.revenueShare)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div style={styles.section}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', gap: '0.5rem' }}>
              <div>
                <h2 style={styles.sectionTitle}>本期对比上期</h2>
                <div style={{ ...styles.muted, marginTop: 4 }}>按{movementMetricLabel}观察增长和下降</div>
              </div>
              <div style={{ display: 'flex', gap: '0.35rem' }}>
                <button onClick={() => setMovementMetric('revenue')} style={styles.segmentButton(movementMetric === 'revenue')}>金额</button>
                <button onClick={() => setMovementMetric('quantity')} style={styles.segmentButton(movementMetric === 'quantity')}>销量</button>
              </div>
            </div>
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ fontWeight: 900, color: '#047857', marginBottom: '0.25rem' }}>增长最大</div>
              {rankingMovement.increased.length === 0 ? (
                <div style={{ ...styles.muted, padding: '0.75rem 0' }}>暂无增长项</div>
              ) : rankingMovement.increased.slice(0, 5).map((item, index) => renderMovementRow(item, index, 'up'))}
            </div>
            <div>
              <div style={{ fontWeight: 900, color: '#b91c1c', marginBottom: '0.25rem' }}>下降最大</div>
              {rankingMovement.decreased.length === 0 ? (
                <div style={{ ...styles.muted, padding: '0.75rem 0' }}>暂无下降项</div>
              ) : rankingMovement.decreased.slice(0, 5).map((item, index) => renderMovementRow(item, index, 'down'))}
            </div>
          </div>
        </div>

        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>业务类型分析</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', marginTop: '0.75rem' }}>
            {[
              { label: '堂食', orders: stats.dineInOrders, revenue: stats.dineInRevenue, color: '#0f766e' },
              { label: 'Barra', orders: stats.takeoutOrders, revenue: stats.takeoutRevenue, color: '#2563eb' },
              { label: 'Delivery', orders: stats.deliveryOrders, revenue: stats.deliveryRevenue, color: '#7c3aed' },
            ].map(item => (
              <div key={item.label} style={{ background: '#f8fafc', borderRadius: '0.5rem', padding: '0.875rem', border: '1px solid #e5e7eb' }}>
                <div style={{ ...styles.muted, fontWeight: 800 }}>{item.label}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', marginTop: '0.5rem' }}>
                  <div style={{ fontSize: '1.25rem', fontWeight: 900, color: item.color }}>{item.orders} 单</div>
                  <div style={{ fontWeight: 900 }}>{money(item.revenue)}</div>
                </div>
                <div style={{ height: 6, background: '#e2e8f0', borderRadius: 3, marginTop: '0.75rem', overflow: 'hidden' }}>
                  <div style={{ width: `${stats.totalSales > 0 ? (item.revenue / stats.totalSales) * 100 : 0}%`, height: '100%', background: item.color }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {(expenseByCategory.length > 0 || topPurchases.length > 0) && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
            <div style={styles.section}>
              <h2 style={styles.sectionTitle}>日常开支分类</h2>
              <div style={{ marginTop: '0.75rem' }}>
                {expenseByCategory.length === 0 ? <div style={styles.muted}>暂无开支</div> : expenseByCategory.map(item => (
                  <div key={item.category} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.625rem 0', borderBottom: '1px solid #f1f5f9' }}>
                    <span style={{ fontWeight: 800 }}>{item.category}</span>
                    <span style={{ color: '#b91c1c', fontWeight: 900 }}>{money(item.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={styles.section}>
              <h2 style={styles.sectionTitle}>采购物品 Top 10</h2>
              <div style={{ marginTop: '0.75rem' }}>
                {topPurchases.length === 0 ? <div style={styles.muted}>暂无采购</div> : topPurchases.map((item, index) => (
                  <div key={item.name} style={{ display: 'grid', gridTemplateColumns: '32px 1fr auto', gap: '0.75rem', alignItems: 'center', padding: '0.625rem 0', borderBottom: '1px solid #f1f5f9' }}>
                    <span style={{ fontWeight: 900, color: '#64748b' }}>{index + 1}</span>
                    <span style={{ fontWeight: 800 }}>{item.name}<span style={{ ...styles.muted, marginLeft: 6 }}>x {item.quantity}</span></span>
                    <span style={{ fontWeight: 900 }}>{money(item.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {salesTrend.length > 0 && (
          <div style={styles.section}>
            <h2 style={styles.sectionTitle}>销售趋势</h2>
            <div style={{ overflowX: 'auto', marginTop: '0.75rem' }}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>日期</th>
                    <th style={{ ...styles.th, textAlign: 'right' }}>营业额</th>
                    <th style={{ ...styles.th, textAlign: 'right' }}>订单</th>
                    <th style={{ ...styles.th, textAlign: 'right' }}>堂食</th>
                    <th style={{ ...styles.th, textAlign: 'right' }}>Barra</th>
                    <th style={{ ...styles.th, textAlign: 'right' }}>Delivery</th>
                    <th style={{ ...styles.th, textAlign: 'right' }}>盈亏</th>
                  </tr>
                </thead>
                <tbody>
                  {salesTrend.map(day => (
                    <tr key={day.date}>
                      <td style={styles.td}>{day.date}</td>
                      <td style={{ ...styles.td, textAlign: 'right', fontWeight: 900 }}>{money(day.sales)}</td>
                      <td style={{ ...styles.td, textAlign: 'right' }}>{day.orders}</td>
                      <td style={{ ...styles.td, textAlign: 'right' }}>{money(day.dineInSales)}</td>
                      <td style={{ ...styles.td, textAlign: 'right' }}>{money(day.takeoutSales)}</td>
                      <td style={{ ...styles.td, textAlign: 'right' }}>{money(day.deliverySales)}</td>
                      <td style={{ ...styles.td, textAlign: 'right', color: day.profit >= 0 ? '#047857' : '#b91c1c', fontWeight: 900 }}>{money(day.profit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem' }}>
          <div style={styles.section}>
            <h2 style={styles.sectionTitle}>客户构成</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem', marginTop: '0.75rem' }}>
              <div style={{ background: '#eff6ff', borderRadius: '0.5rem', padding: '0.875rem' }}>
                <div style={{ ...styles.muted, color: '#1d4ed8' }}>新客户</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#1d4ed8' }}>{customerProfile.newCustomers}</div>
                <div style={styles.muted}>占比 {pct(customerProfile.newCustomerRate)}</div>
              </div>
              <div style={{ background: '#ecfdf5', borderRadius: '0.5rem', padding: '0.875rem' }}>
                <div style={{ ...styles.muted, color: '#047857' }}>老客户</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#047857' }}>{customerProfile.returningCustomers}</div>
                <div style={styles.muted}>占比 {pct(100 - customerProfile.newCustomerRate)}</div>
              </div>
            </div>
            <div style={{ marginTop: '0.875rem', display: 'flex', justifyContent: 'space-between' }}>
              <span style={styles.muted}>总客户数</span>
              <strong>{customerProfile.totalCustomers}</strong>
            </div>
            <div style={{ marginTop: '0.5rem', display: 'flex', justifyContent: 'space-between' }}>
              <span style={styles.muted}>平均消费频次</span>
              <strong>{customerProfile.avgOrderFrequency.toFixed(1)} 次</strong>
            </div>
          </div>

          <div style={styles.section}>
            <h2 style={styles.sectionTitle}>营业高峰 Top 5</h2>
            <div style={{ marginTop: '0.75rem' }}>
              {customerProfile.peakHours.length === 0 ? <div style={styles.muted}>暂无数据</div> : customerProfile.peakHours.map((slot, index) => (
                <div key={slot.hour} style={{ display: 'grid', gridTemplateColumns: '32px 1fr auto', gap: '0.75rem', alignItems: 'center', padding: '0.625rem 0', borderBottom: '1px solid #f1f5f9' }}>
                  <span style={{ fontWeight: 900, color: '#64748b' }}>{index + 1}</span>
                  <span style={{ fontWeight: 800 }}>{String(slot.hour).padStart(2, '0')}:00 - {String(slot.hour + 1).padStart(2, '0')}:00<span style={{ ...styles.muted, marginLeft: 6 }}>{slot.orderCount} 单</span></span>
                  <span style={{ fontWeight: 900 }}>{money(slot.revenue)}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={styles.section}>
            <h2 style={styles.sectionTitle}>品类偏好</h2>
            <div style={{ marginTop: '0.75rem' }}>
              {customerProfile.categoryPreference.length === 0 ? <div style={styles.muted}>暂无数据</div> : customerProfile.categoryPreference.slice(0, 8).map(item => (
                <div key={item.category} style={{ marginBottom: '0.75rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem' }}>
                    <span style={{ fontWeight: 800 }}>{item.category}</span>
                    <span style={styles.muted}>{item.orderCount} 份 · {pct(item.percentage)}</span>
                  </div>
                  <div style={{ height: 6, background: '#e2e8f0', borderRadius: 3, marginTop: 6, overflow: 'hidden' }}>
                    <div style={{ width: `${item.percentage}%`, height: '100%', background: '#0f766e' }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={styles.section}>
            <h2 style={styles.sectionTitle}>VIP 客户 Top 10</h2>
            <div style={{ marginTop: '0.75rem' }}>
              {customerProfile.topCustomers.length === 0 ? <div style={styles.muted}>暂无数据</div> : customerProfile.topCustomers.map((customer, index) => (
                <div key={`${customer.phone || 'guest'}-${index}`} style={{ display: 'grid', gridTemplateColumns: '32px 1fr auto', gap: '0.75rem', alignItems: 'center', padding: '0.625rem 0', borderBottom: '1px solid #f1f5f9' }}>
                  <span style={{ fontWeight: 900, color: '#64748b' }}>{index + 1}</span>
                  <div>
                    <div style={{ fontWeight: 800 }}>{customer.phone || '散客'}</div>
                    <div style={styles.muted}>{customer.orderCount} 次 · 常点 {customer.favoriteDish || '-'}</div>
                  </div>
                  <span style={{ fontWeight: 900 }}>{money(customer.totalSpent)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardModule;
