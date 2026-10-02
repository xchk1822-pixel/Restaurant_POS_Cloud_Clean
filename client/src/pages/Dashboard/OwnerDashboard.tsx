import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  smartGetDocuments,
  smartGetDocumentsByDateRange,
  smartGetDocumentsWhereEqual,
  smartGetPosOrdersByActivityDateRange,
} from '../../services/smartSyncService';
import {
  buildOwnerExpenseEvidenceRows,
  buildOwnerLowStockRisks,
  dedupeOwnerRecordsById,
  dedupeOwnerRecordsByStoreAndId,
  summarizeOwnerOrderTypes,
  sumOwnerExpenseByKind,
  sumOwnerSupplierDebt,
} from '../../utils/ownerDashboardData';
import { filterActiveEmployees } from '../../utils/employeeRecords';
import { getOrderCollectedAmount, getOrderFinancialDateKey, getOrderPaymentBreakdown } from '../../utils/financeMetrics';
import { getLocalDateString, toTimestampMillis } from '../../utils/localTime';
import {
  buildRankingComparison,
  buildExpenseRankings,
  buildSalesRankings,
  filterOrdersByRange,
  normalizeDashboardRange,
  type BeverageCategoryFilter,
  type DashboardOrderTypeFilter,
  type RankingScope,
  type RankingSortBy,
} from '../../utils/dashboardAnalytics';
import { colors, font, radii, shadows } from '../../styles/uiTokens';

interface StoreStats {
  id: string;
  name: string;
  sales: number;
  orders: number;
  expenses: number;
  purchases: number;
  profit: number;
  avgTicket: number;
}

interface OwnerCache {
  stores: any[];
  orders: any[];
  expenses: any[];
  purchases: any[];
  inventory: any[];
  fridgeInventory: any[];
  suppliers: any[];
  menuItems: any[];
  expenseCategories: any[];
  employees: any[];
  employeeDeletions: any[];
  syncedAt: string | null;
}

type TimeRange = 'today' | 'month' | 'custom';

const CACHE_KEY = 'owner_dashboard_cache_v1';
const CHART_COLORS = [colors.blue, colors.success, colors.amber, colors.danger, '#7c3aed'];
let ownerDashboardMemoryCache: OwnerCache | null = null;

const money = (value: number) =>
  `C$ ${value.toLocaleString('es-NI', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const number = (value: number) => value.toLocaleString('es-NI');
const percent = (value: number) => `${Number(value || 0).toFixed(1)}%`;

const getOrderAmount = (order: any): number => getOrderCollectedAmount(order);

const getRecordDateKey = (record: any): string => {
  const value = record?.date || record?.orderDate || record?.receivedDate || record?.createdAt || record?.updatedAt || record?.lastModified;
  if (typeof value === 'string') {
    const matchedDate = value.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
    if (matchedDate) return matchedDate;
  }
  const timestamp = toTimestampMillis(value);
  return timestamp ? getLocalDateString(new Date(timestamp)) : '';
};

const getPreviousDateKey = (dateKey: string): string => {
  const date = new Date(`${dateKey}T12:00:00`);
  date.setDate(date.getDate() - 1);
  return getLocalDateString(date);
};

const getCachedData = (): OwnerCache => {
  const fallback: OwnerCache = {
    stores: [],
    orders: [],
    expenses: [],
    purchases: [],
    inventory: [],
    fridgeInventory: [],
    suppliers: [],
    menuItems: [],
    expenseCategories: [],
    employees: [],
    employeeDeletions: [],
    syncedAt: null,
  };

  if (ownerDashboardMemoryCache) return ownerDashboardMemoryCache;

  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) return { ...fallback, ...JSON.parse(raw) };
  } catch (error) {
    console.error('读取老板仪表板缓存失败:', error);
  }

  return fallback;
};

const OwnerDashboard: React.FC = () => {
  const cached = useMemo(() => getCachedData(), []);
  const [timeRange, setTimeRange] = useState<TimeRange>('today');
  const [customStartDate, setCustomStartDate] = useState(() => getLocalDateString());
  const [customEndDate, setCustomEndDate] = useState(() => getLocalDateString());
  const [selectedStoreId, setSelectedStoreId] = useState<string>('all');
  const [stores, setStores] = useState<any[]>(dedupeOwnerRecordsById(cached.stores));
  const [orders, setOrders] = useState<any[]>(dedupeOwnerRecordsByStoreAndId(cached.orders));
  const [expenses, setExpenses] = useState<any[]>(dedupeOwnerRecordsByStoreAndId(cached.expenses));
  const [purchases, setPurchases] = useState<any[]>(dedupeOwnerRecordsByStoreAndId(cached.purchases));
  const [inventory, setInventory] = useState<any[]>(dedupeOwnerRecordsByStoreAndId(cached.inventory));
  const [fridgeInventory, setFridgeInventory] = useState<any[]>(dedupeOwnerRecordsByStoreAndId(cached.fridgeInventory));
  const [suppliers, setSuppliers] = useState<any[]>(dedupeOwnerRecordsByStoreAndId(cached.suppliers));
  const [menuItems, setMenuItems] = useState<any[]>(dedupeOwnerRecordsByStoreAndId(cached.menuItems));
  const [expenseCategories, setExpenseCategories] = useState<any[]>(dedupeOwnerRecordsByStoreAndId(cached.expenseCategories || []));
  const [employees, setEmployees] = useState<any[]>(dedupeOwnerRecordsByStoreAndId(cached.employees));
  const [employeeDeletions, setEmployeeDeletions] = useState<any[]>(
    dedupeOwnerRecordsByStoreAndId(cached.employeeDeletions || [])
  );
  const [rankingScope, setRankingScope] = useState<RankingScope>('all');
  const [rankingSortBy, setRankingSortBy] = useState<RankingSortBy>('revenue');
  const [rankingOrderType, setRankingOrderType] = useState<DashboardOrderTypeFilter>('all');
  const [rankingTopN, setRankingTopN] = useState(10);
  const [beverageCategoryFilter, setBeverageCategoryFilter] = useState<BeverageCategoryFilter>('all');
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(
    cached.syncedAt ? new Date(cached.syncedAt) : null
  );
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [selectedEvidence, setSelectedEvidence] = useState<any | null>(null);
  const todayDateKey = getLocalDateString();
  const rankingRange = useMemo(
    () => normalizeDashboardRange(
      timeRange,
      customStartDate,
      customEndDate,
      new Date(),
      timeRange === 'month' ? todayDateKey.slice(0, 7) : undefined
    ),
    [customEndDate, customStartDate, timeRange, todayDateKey]
  );
  const staticDataLoadedRef = useRef(Boolean(cached.syncedAt));
  const staticDataRef = useRef({
    inventory: dedupeOwnerRecordsByStoreAndId(cached.inventory),
    fridgeInventory: dedupeOwnerRecordsByStoreAndId(cached.fridgeInventory),
    suppliers: dedupeOwnerRecordsByStoreAndId(cached.suppliers),
    menuItems: dedupeOwnerRecordsByStoreAndId(cached.menuItems),
    expenseCategories: dedupeOwnerRecordsByStoreAndId(cached.expenseCategories || []),
    employees: dedupeOwnerRecordsByStoreAndId(cached.employees),
    employeeDeletions: dedupeOwnerRecordsByStoreAndId(cached.employeeDeletions || []),
  });

  const refreshOwnerData = useCallback(async (options?: { forceStatic?: boolean }) => {
    const applyOwnerDashboardCache = (nextCache: OwnerCache) => {
      setStores(nextCache.stores);
      setOrders(nextCache.orders);
      setExpenses(nextCache.expenses);
      setPurchases(nextCache.purchases);
      setInventory(nextCache.inventory);
      setFridgeInventory(nextCache.fridgeInventory);
      setSuppliers(nextCache.suppliers);
      setMenuItems(nextCache.menuItems);
      setExpenseCategories(nextCache.expenseCategories);
      setEmployees(nextCache.employees);
      setEmployeeDeletions(nextCache.employeeDeletions);
      setLastSyncedAt(nextCache.syncedAt ? new Date(nextCache.syncedAt) : null);
    };

    setIsRefreshing(true);
    setLoadError('');

    try {
      const loadedStores = await smartGetDocuments('stores', true);
      const activeStores = dedupeOwnerRecordsById(loadedStores);
      const rangeStartDate = [rankingRange.startDate, rankingRange.previousStartDate].sort()[0];
      const rangeEndDate = getPreviousDateKey(
        [rankingRange.endDateExclusive, rankingRange.previousEndDateExclusive].sort().reverse()[0]
      );
      const shouldRefreshStatic = Boolean(options?.forceStatic) || !staticDataLoadedRef.current;
      const staticCollectionNames = ['inventory_items', 'fridge_inventory', 'suppliers', 'menu_items', 'expense_categories', 'employees', 'employee_deletions'] as const;
      const rangeBuckets = {
        pos_orders: [] as any[],
        expenses: [] as any[],
        purchase_orders: [] as any[],
      };
      const staticBuckets: Record<typeof staticCollectionNames[number], any[]> = {
        inventory_items: shouldRefreshStatic ? [] : [...staticDataRef.current.inventory],
        fridge_inventory: shouldRefreshStatic ? [] : [...staticDataRef.current.fridgeInventory],
        suppliers: shouldRefreshStatic ? [] : [...staticDataRef.current.suppliers],
        menu_items: shouldRefreshStatic ? [] : [...staticDataRef.current.menuItems],
        expense_categories: shouldRefreshStatic ? [] : [...staticDataRef.current.expenseCategories],
        employees: shouldRefreshStatic ? [] : [...staticDataRef.current.employees],
        employee_deletions: shouldRefreshStatic ? [] : [...staticDataRef.current.employeeDeletions],
      };

      for (const store of activeStores) {
        const [storeOrders, storeExpenses, storePurchases, storeCreditPurchases] = await Promise.all([
          smartGetPosOrdersByActivityDateRange(rangeStartDate, rangeEndDate, true, store.id, ['lastPaidAt'], false),
          smartGetDocumentsByDateRange(`stores/${store.id}/expenses`, 'date', rangeStartDate, rangeEndDate, true),
          smartGetDocumentsByDateRange(`stores/${store.id}/purchase_orders`, 'orderDate', rangeStartDate, rangeEndDate, true),
          smartGetDocumentsWhereEqual(
            `stores/${store.id}/purchase_orders`,
            'paymentType',
            'credit',
            true
          ),
        ]);
        rangeBuckets.pos_orders.push(...storeOrders.map(record => ({
          ...record,
          storeId: store.id,
          storeName: store.name,
        })));
        rangeBuckets.expenses.push(...storeExpenses.map(record => ({
          ...record,
          storeId: store.id,
          storeName: store.name,
        })));
        rangeBuckets.purchase_orders.push(...[...storePurchases, ...storeCreditPurchases].map(record => ({
          ...record,
          storeId: store.id,
          storeName: store.name,
        })));

        if (!shouldRefreshStatic) continue;
        await Promise.all(staticCollectionNames.map(async collectionName => {
          try {
            const records = await smartGetDocuments(`stores/${store.id}/${collectionName}`, true);
            staticBuckets[collectionName].push(...records.map(record => ({
              ...record,
              storeId: store.id,
              storeName: store.name,
            })));
          } catch (error) {
            console.error(`读取分店数据失败: ${store.name}/${collectionName}`, error);
          }
        }));
      }

      const syncedAt = new Date();
      const nextCache: OwnerCache = {
        stores: activeStores,
        orders: dedupeOwnerRecordsByStoreAndId(rangeBuckets.pos_orders),
        expenses: dedupeOwnerRecordsByStoreAndId(rangeBuckets.expenses),
        purchases: dedupeOwnerRecordsByStoreAndId(rangeBuckets.purchase_orders),
        inventory: dedupeOwnerRecordsByStoreAndId(staticBuckets.inventory_items),
        fridgeInventory: dedupeOwnerRecordsByStoreAndId(staticBuckets.fridge_inventory),
        suppliers: dedupeOwnerRecordsByStoreAndId(staticBuckets.suppliers),
        menuItems: dedupeOwnerRecordsByStoreAndId(staticBuckets.menu_items),
        expenseCategories: dedupeOwnerRecordsByStoreAndId(staticBuckets.expense_categories),
        employees: dedupeOwnerRecordsByStoreAndId(staticBuckets.employees),
        employeeDeletions: dedupeOwnerRecordsByStoreAndId(staticBuckets.employee_deletions),
        syncedAt: syncedAt.toISOString(),
      };

      staticDataRef.current = {
        inventory: nextCache.inventory,
        fridgeInventory: nextCache.fridgeInventory,
        suppliers: nextCache.suppliers,
        menuItems: nextCache.menuItems,
        expenseCategories: nextCache.expenseCategories,
        employees: nextCache.employees,
        employeeDeletions: nextCache.employeeDeletions,
      };
      staticDataLoadedRef.current = true;
      ownerDashboardMemoryCache = nextCache;
      applyOwnerDashboardCache(nextCache);

      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(nextCache));
      } catch (error) {
        const lightweightCache = { ...nextCache, orders: [], expenses: [], purchases: [] };
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify(lightweightCache));
        } catch (compactError) {
          console.warn('Owner dashboard lightweight cache write failed; keeping in-memory data visible:', compactError);
        }
      }
    } catch (error) {
      console.error('刷新老板仪表板失败:', error);
      setLoadError('刷新老板仪表板失败，请检查网络后重试');
    } finally {
      setIsRefreshing(false);
    }
  }, [rankingRange]);

  useEffect(() => {
    refreshOwnerData();
  }, [refreshOwnerData]);

  const selectedStore = stores.find(store => store.id === selectedStoreId);
  const selectedStoreName = selectedStoreId === 'all'
    ? '全部分店'
    : selectedStore?.name || selectedStore?.storeName || selectedStoreId;

  const rangeOrders = useMemo(() => {
    return filterOrdersByRange(orders, rankingRange.startDate, rankingRange.endDateExclusive);
  }, [orders, rankingRange]);

  const rangeExpenses = useMemo(() => {
    return expenses.filter(expense => {
      const dateKey = getRecordDateKey(expense);
      return dateKey >= rankingRange.startDate && dateKey < rankingRange.endDateExclusive;
    });
  }, [expenses, rankingRange]);

  const rangePurchases = useMemo(() => {
    return purchases.filter(purchase => {
      const dateKey = getRecordDateKey(purchase);
      return dateKey >= rankingRange.startDate && dateKey < rankingRange.endDateExclusive;
    });
  }, [purchases, rankingRange]);

  const scopedOrders = useMemo(() => {
    const source = selectedStoreId === 'all'
      ? rangeOrders
      : rangeOrders.filter(order => order.storeId === selectedStoreId);
    return source.filter(order => getOrderAmount(order) > 0);
  }, [rangeOrders, selectedStoreId]);

  const filteredExpenses = useMemo(() => {
    return selectedStoreId === 'all'
      ? rangeExpenses
      : rangeExpenses.filter(expense => expense.storeId === selectedStoreId);
  }, [rangeExpenses, selectedStoreId]);

  const filteredPurchases = useMemo(() => {
    return selectedStoreId === 'all'
      ? rangePurchases
      : rangePurchases.filter(purchase => purchase.storeId === selectedStoreId);
  }, [rangePurchases, selectedStoreId]);

  const scopedPurchases = useMemo(() => {
    return selectedStoreId === 'all'
      ? purchases
      : purchases.filter(purchase => purchase.storeId === selectedStoreId);
  }, [purchases, selectedStoreId]);

  const scopedInventory = useMemo(() => {
    return selectedStoreId === 'all'
      ? inventory
      : inventory.filter(item => item.storeId === selectedStoreId);
  }, [inventory, selectedStoreId]);

  const lowStockRisks = useMemo(() => {
    const riskStores = selectedStoreId === 'all'
      ? stores
      : stores.filter(store => store.id === selectedStoreId);
    return buildOwnerLowStockRisks(riskStores, inventory, fridgeInventory, suppliers, purchases);
  }, [fridgeInventory, inventory, purchases, selectedStoreId, stores, suppliers]);
  const lowStockEstimatedAmount = lowStockRisks.reduce((sum, item) => sum + item.estimatedAmount, 0);

  const scopedMenuItems = useMemo(() => {
    return selectedStoreId === 'all'
      ? menuItems
      : menuItems.filter(item => item.storeId === selectedStoreId);
  }, [menuItems, selectedStoreId]);

  const scopedExpenseCategories = useMemo(() => {
    return selectedStoreId === 'all'
      ? expenseCategories
      : expenseCategories.filter(category => category.storeId === selectedStoreId);
  }, [expenseCategories, selectedStoreId]);

  const scopedEmployees = useMemo(() => {
    const selectedEmployees = selectedStoreId === 'all'
      ? employees
      : employees.filter(employee => employee.storeId === selectedStoreId);
    const scopedEmployeeDeletions = selectedStoreId === 'all'
      ? employeeDeletions
      : employeeDeletions.filter(record => record.storeId === selectedStoreId);
    return filterActiveEmployees(selectedEmployees, scopedEmployeeDeletions);
  }, [employeeDeletions, employees, selectedStoreId]);

  const totalSales = scopedOrders.reduce((sum, order) => sum + getOrderAmount(order), 0);
  const totalOrders = scopedOrders.length;
  const totalExpenses = sumOwnerExpenseByKind(filteredExpenses, 'operating');
  const totalPurchases = sumOwnerExpenseByKind(filteredExpenses, 'purchase');
  const totalSupplierDebt = sumOwnerSupplierDebt(scopedPurchases);
  const totalProfit = totalSales - totalExpenses - totalPurchases;
  const avgTicket = totalOrders > 0 ? totalSales / totalOrders : 0;
  const orderTypeSummary = useMemo(() => summarizeOwnerOrderTypes(scopedOrders), [scopedOrders]);
  const paymentTotals = scopedOrders.reduce((sum, order) => {
    const breakdown = getOrderPaymentBreakdown(order);
    return {
      cash: sum.cash + breakdown.cash,
      card: sum.card + breakdown.card,
    };
  }, { cash: 0, card: 0 });

  const evidenceRows = useMemo(
    () => buildOwnerExpenseEvidenceRows(filteredExpenses, filteredPurchases).slice(0, 12),
    [filteredExpenses, filteredPurchases]
  );

  const storeStats = useMemo<StoreStats[]>(() => {
    return stores
      .map(store => {
        const storeOrders = rangeOrders.filter(order => order.storeId === store.id && getOrderAmount(order) > 0);
        const storeExpenses = rangeExpenses.filter(expense => expense.storeId === store.id);
        const sales = storeOrders.reduce((sum, order) => sum + getOrderAmount(order), 0);
        const expenseAmount = sumOwnerExpenseByKind(storeExpenses, 'operating');
        const purchaseAmount = sumOwnerExpenseByKind(storeExpenses, 'purchase');

        return {
          id: store.id,
          name: store.name || store.storeName || store.id,
          sales,
          orders: storeOrders.length,
          expenses: expenseAmount,
          purchases: purchaseAmount,
          profit: sales - expenseAmount - purchaseAmount,
          avgTicket: storeOrders.length ? sales / storeOrders.length : 0,
        };
      })
      .sort((a, b) => b.sales - a.sales);
  }, [rangeExpenses, rangeOrders, stores]);

  const selectedStoreStats = storeStats.find(store => store.id === selectedStoreId);

  const paymentChannels = useMemo(() => {
    const channels: Record<string, number> = {};
    scopedOrders.forEach(order => {
      const breakdown = getOrderPaymentBreakdown(order);
      if (breakdown.cash > 0) channels['现金'] = (channels['现金'] || 0) + breakdown.cash;
      if (breakdown.card > 0) channels['刷卡'] = (channels['刷卡'] || 0) + breakdown.card;
      if (breakdown.cash <= 0 && breakdown.card <= 0) {
        channels['其他'] = (channels['其他'] || 0) + getOrderAmount(order);
      }
    });
    return Object.entries(channels).map(([name, value]) => ({ name, value }));
  }, [scopedOrders]);

  const salesTrend = useMemo(() => {
    const trend: Record<string, number> = {};
    scopedOrders.forEach(order => {
      const dateKey = getOrderFinancialDateKey(order);
      if (!dateKey) return;
      const key = dateKey.slice(5);
      trend[key] = (trend[key] || 0) + getOrderAmount(order);
    });
    return Object.entries(trend)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-7)
      .map(([date, amount]) => ({ date, amount }));
  }, [scopedOrders]);

  const rankingOrders = useMemo(
    () => selectedStoreId === 'all' ? orders : orders.filter(order => order.storeId === selectedStoreId),
    [orders, selectedStoreId]
  );
  const currentRankingOrders = useMemo(
    () => filterOrdersByRange(rankingOrders, rankingRange.startDate, rankingRange.endDateExclusive),
    [rankingOrders, rankingRange]
  );
  const previousRankingOrders = useMemo(
    () => filterOrdersByRange(rankingOrders, rankingRange.previousStartDate, rankingRange.previousEndDateExclusive),
    [rankingOrders, rankingRange]
  );
  const rankingFilters = useMemo(() => ({
    scope: rankingScope,
    sortBy: rankingSortBy,
    orderType: rankingOrderType,
    topN: rankingTopN,
    beverageCategory: beverageCategoryFilter,
  }), [beverageCategoryFilter, rankingOrderType, rankingScope, rankingSortBy, rankingTopN]);
  const salesRankings = useMemo(
    () => buildSalesRankings(currentRankingOrders, scopedMenuItems, scopedInventory, rankingFilters),
    [currentRankingOrders, rankingFilters, scopedInventory, scopedMenuItems]
  );
  const rankingMovement = useMemo(
    () => buildRankingComparison(currentRankingOrders, previousRankingOrders, scopedMenuItems, scopedInventory, rankingFilters),
    [currentRankingOrders, previousRankingOrders, rankingFilters, scopedInventory, scopedMenuItems]
  );
  const maxRankingMetric = Math.max(...salesRankings.map(item => rankingSortBy === 'quantity' ? item.quantity : item.revenue), 0);

  const expenseRankings = useMemo(
    () => buildExpenseRankings(filteredExpenses, scopedExpenseCategories, filteredPurchases, {
      scope: 'all',
      sortBy: 'amount',
      topN: 8,
    }),
    [filteredExpenses, filteredPurchases, scopedExpenseCategories]
  );
  const maxExpenseRankingAmount = Math.max(...expenseRankings.map(item => item.amount), 0);

  return (
    <div className="owner-page">
      <style>{`
        .owner-page {
          min-height: 100vh;
          background: ${colors.page};
          padding: 18px;
          color: ${colors.textPrimary};
          font-family: ${font.family};
        }
        .owner-shell {
          max-width: 1280px;
          margin: 0 auto;
        }
        .owner-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
          margin-bottom: 16px;
        }
        .owner-title {
          margin: 0;
          font-size: 28px;
          line-height: 1.2;
          font-weight: 760;
          letter-spacing: 0;
        }
        .owner-subtitle {
          margin: 6px 0 0;
          color: ${colors.textSecondary};
          font-size: 14px;
        }
        .owner-actions {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 10px;
          flex-wrap: wrap;
        }
        .owner-select {
          min-width: 170px;
          border: 1px solid ${colors.border};
          border-radius: ${radii.md};
          padding: 10px 12px;
          background: ${colors.surface};
          color: ${colors.textPrimary};
          font-weight: 700;
        }
        .owner-sync-time {
          color: ${colors.textSecondary};
          font-size: ${font.caption};
          white-space: nowrap;
          background: ${colors.surface};
          border: 1px solid ${colors.border};
          border-radius: ${radii.pill};
          padding: 8px 12px;
        }
        .owner-refresh {
          border: 1px solid ${colors.blue};
          border-radius: ${radii.md};
          padding: 10px 14px;
          background: ${colors.blue};
          color: white;
          font-weight: 700;
          cursor: pointer;
          box-shadow: 0 10px 22px rgba(37, 99, 235, 0.18);
        }
        .owner-refresh:disabled {
          background: ${colors.textMuted};
          border-color: ${colors.textMuted};
          box-shadow: none;
          cursor: not-allowed;
        }
        .owner-tabs {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 8px;
          margin-bottom: 14px;
        }
        .owner-tab {
          border: 1px solid ${colors.border};
          border-radius: ${radii.md};
          padding: 10px;
          background: ${colors.surface};
          color: ${colors.textSecondary};
          font-weight: 700;
          cursor: pointer;
        }
        .owner-tab.active {
          background: ${colors.blue};
          border-color: ${colors.blue};
          color: white;
          box-shadow: 0 10px 22px rgba(37, 99, 235, 0.18);
        }
        .scope-line {
          margin: -2px 0 14px;
          color: ${colors.textSecondary};
          font-size: 13px;
        }
        .owner-date-range {
          display: flex;
          justify-content: flex-end;
          gap: 10px;
          margin: -4px 0 14px;
        }
        .owner-date-field {
          display: flex;
          align-items: center;
          gap: 7px;
          color: ${colors.textSecondary};
          font-size: 13px;
          font-weight: 650;
        }
        .owner-date-input {
          border: 1px solid ${colors.border};
          border-radius: ${radii.md};
          padding: 8px 10px;
          background: ${colors.surface};
          color: ${colors.textPrimary};
          font: inherit;
        }
        .metric-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 12px;
          margin-bottom: 16px;
        }
        .metric-card, .panel, .store-card {
          background: ${colors.surface};
          border: 1px solid ${colors.border};
          border-radius: ${radii.lg};
          box-shadow: ${shadows.soft};
        }
        .metric-card {
          padding: 14px;
          border-top: 3px solid ${colors.blue};
        }
        .metric-label {
          color: ${colors.textSecondary};
          font-size: ${font.caption};
          margin-bottom: 8px;
          font-weight: 650;
        }
        .metric-value {
          font-size: 23px;
          line-height: 1.1;
          font-weight: 760;
          word-break: break-word;
          color: ${colors.textPrimary};
        }
        .metric-note {
          color: ${colors.textMuted};
          font-size: 12px;
          margin-top: 6px;
        }
        .order-type-split {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 6px;
          margin-top: 8px;
        }
        .order-type-chip {
          border: 1px solid ${colors.border};
          border-radius: ${radii.sm};
          padding: 6px 5px;
          background: #f8fafc;
          text-align: center;
          color: ${colors.textSecondary};
          line-height: 1.15;
        }
        .order-type-chip strong {
          display: block;
          margin-top: 3px;
          color: ${colors.textPrimary};
          font-size: 14px;
        }
        .content-grid {
          display: grid;
          grid-template-columns: minmax(0, 1.25fr) minmax(320px, 0.75fr);
          gap: 14px;
        }
        .panel {
          padding: 14px;
          margin-bottom: 14px;
          min-width: 0;
        }
        .panel-title {
          margin: 0 0 12px;
          font-size: 17px;
          font-weight: 760;
          color: ${colors.textPrimary};
        }
        .store-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
        }
        .store-card {
          padding: 13px;
          text-align: left;
          cursor: pointer;
          transition: border-color 0.15s, box-shadow 0.15s;
        }
        .store-card.selected {
          border-color: ${colors.blue};
          box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.15);
        }
        .store-name {
          font-weight: 760;
          margin-bottom: 10px;
          color: ${colors.textPrimary};
        }
        .store-row {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          color: ${colors.textSecondary};
          font-size: 13px;
          margin-top: 6px;
        }
        .store-row strong {
          color: ${colors.textPrimary};
        }
        .chart-box {
          height: 260px;
          width: 100%;
          min-width: 0;
        }
        .list-row, .evidence-row {
          display: flex;
          justify-content: space-between;
          gap: 10px;
          padding: 10px 0;
          border-top: 1px solid ${colors.border};
          font-size: 14px;
        }
        .list-row:first-of-type, .evidence-row:first-of-type {
          border-top: 0;
        }
        .evidence-main {
          min-width: 0;
        }
        .evidence-title {
          display: block;
          font-weight: 700;
          color: ${colors.textPrimary};
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .evidence-meta {
          display: block;
          margin-top: 3px;
          color: ${colors.textMuted};
          font-size: 12px;
        }
        .evidence-button {
          border: 1px solid ${colors.blue};
          border-radius: ${radii.sm};
          background: #eff6ff;
          color: ${colors.blue};
          padding: 7px 10px;
          font-weight: 700;
          cursor: pointer;
          white-space: nowrap;
        }
        .ranking-head {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          align-items: flex-start;
          flex-wrap: wrap;
          margin-bottom: 12px;
        }
        .ranking-controls {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        .ranking-button, .ranking-select {
          border: 1px solid ${colors.border};
          border-radius: ${radii.md};
          background: ${colors.surface};
          color: ${colors.textSecondary};
          padding: 8px 10px;
          font-weight: 700;
          cursor: pointer;
        }
        .ranking-button.active {
          border-color: ${colors.blue};
          background: #eff6ff;
          color: ${colors.blue};
        }
        .ranking-row {
          display: grid;
          grid-template-columns: 34px minmax(0, 1fr) auto;
          gap: 10px;
          align-items: center;
          padding: 10px 0;
          border-top: 1px solid ${colors.border};
        }
        .ranking-badge {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 800;
          background: #eef2ff;
          color: ${colors.blue};
        }
        .ranking-row:nth-of-type(-n + 3) .ranking-badge {
          background: linear-gradient(135deg, ${colors.blue}, ${colors.teal});
          color: white;
        }
        .ranking-name {
          font-weight: 760;
          color: ${colors.textPrimary};
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .ranking-meta {
          margin-top: 3px;
          color: ${colors.textMuted};
          font-size: 12px;
        }
        .ranking-bar {
          height: 6px;
          margin-top: 8px;
          border-radius: 999px;
          overflow: hidden;
          background: #e2e8f0;
        }
        .ranking-bar-fill {
          height: 100%;
          border-radius: inherit;
          background: linear-gradient(90deg, ${colors.blue}, ${colors.teal});
        }
        .ranking-value {
          text-align: right;
          white-space: nowrap;
        }
        .movement-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
          margin-top: 12px;
        }
        .movement-box {
          border: 1px solid ${colors.border};
          border-radius: ${radii.md};
          padding: 10px;
          background: #f8fafc;
        }
        .movement-title {
          font-weight: 760;
          margin-bottom: 6px;
          color: ${colors.textPrimary};
        }
        .movement-row {
          display: flex;
          justify-content: space-between;
          gap: 8px;
          padding: 5px 0;
          color: ${colors.textSecondary};
          font-size: 13px;
        }
        .risk-summary {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 8px;
          margin-bottom: 8px;
        }
        .risk-summary-box {
          border: 1px solid ${colors.border};
          border-radius: ${radii.md};
          padding: 10px;
          background: ${colors.surfaceMuted};
        }
        .risk-summary-box strong {
          display: block;
          margin-top: 4px;
          color: ${colors.textPrimary};
          font-size: 17px;
        }
        .risk-stock {
          color: ${colors.danger};
          font-weight: 760;
          white-space: nowrap;
        }
        .error-box {
          padding: 10px 12px;
          border: 1px solid #fecaca;
          background: #fef2f2;
          color: #991b1b;
          border-radius: ${radii.md};
          margin-bottom: 14px;
        }
        .empty-box {
          padding: 36px 12px;
          text-align: center;
          color: ${colors.textSecondary};
        }
        .evidence-modal-backdrop {
          position: fixed;
          inset: 0;
          z-index: 1000;
          background: rgba(15, 23, 42, 0.55);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 18px;
        }
        .evidence-modal {
          width: min(920px, 100%);
          max-height: 92vh;
          overflow: auto;
          background: white;
          border-radius: ${radii.lg};
          box-shadow: 0 30px 80px rgba(15, 23, 42, 0.35);
          padding: 16px;
        }
        .evidence-modal-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 12px;
          margin-bottom: 12px;
        }
        .evidence-modal img {
          width: 100%;
          max-height: 72vh;
          object-fit: contain;
          border: 1px solid ${colors.border};
          border-radius: ${radii.md};
          background: #f8fafc;
        }
        @media (max-width: 860px) {
          .owner-page {
            padding: 12px;
          }
          .owner-header {
            display: block;
          }
          .owner-actions {
            margin-top: 12px;
            justify-content: flex-start;
          }
          .owner-title {
            font-size: 23px;
          }
          .metric-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
          .content-grid {
            display: block;
          }
          .content-grid > section {
            display: flex;
            flex-direction: column;
          }
          .ranking-panel {
            order: -1;
          }
          .store-grid {
            grid-template-columns: 1fr;
          }
          .chart-box {
            height: 220px;
          }
          .movement-grid {
            grid-template-columns: 1fr;
          }
        }
        @media (max-width: 520px) {
          .owner-page {
            padding: 10px;
          }
          .owner-actions {
            display: grid;
            grid-template-columns: 1fr;
            width: 100%;
          }
          .owner-refresh,
          .owner-sync-time,
          .owner-select {
            width: 100%;
            text-align: center;
          }
          .metric-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
          .owner-tabs {
            grid-template-columns: 1fr;
          }
          .owner-date-range {
            display: grid;
            grid-template-columns: 1fr;
          }
          .owner-date-field {
            justify-content: space-between;
          }
          .owner-date-input {
            min-width: 0;
          }
          .metric-value {
            font-size: 21px;
          }
        }
      `}</style>

      <div className="owner-shell">
        <header className="owner-header">
          <div>
            <h1 className="owner-title">老板全局仪表板</h1>
            <p className="owner-subtitle">所有分店数据概览，低频手动刷新，适合手机快速查看。</p>
          </div>
          <div className="owner-actions">
            <select
              className="owner-select"
              value={selectedStoreId}
              onChange={event => setSelectedStoreId(event.target.value)}
              aria-label="选择分店"
            >
              <option value="all">全部分店</option>
              {stores.map(store => (
                <option key={store.id} value={store.id}>
                  {store.name || store.storeName || store.id}
                </option>
              ))}
            </select>
            {lastSyncedAt && (
              <span className="owner-sync-time">
                最后同步 {lastSyncedAt.toLocaleTimeString('es-NI', { hour12: false })}
              </span>
            )}
            <button className="owner-refresh" onClick={() => refreshOwnerData({ forceStatic: true })} disabled={isRefreshing}>
              {isRefreshing ? '刷新中...' : '刷新云端数据'}
            </button>
          </div>
        </header>

        <div className="owner-tabs">
          {(['today', 'month', 'custom'] as const).map(range => (
            <button
              key={range}
              className={`owner-tab ${timeRange === range ? 'active' : ''}`}
              onClick={() => setTimeRange(range)}
            >
              {range === 'today' ? '今天' : range === 'month' ? '当月' : '日期筛选'}
            </button>
          ))}
        </div>

        {timeRange === 'custom' && (
          <div className="owner-date-range">
            <label className="owner-date-field">
              <span>开始日期</span>
              <input
                className="owner-date-input"
                type="date"
                value={customStartDate}
                max={customEndDate}
                onChange={event => setCustomStartDate(event.target.value)}
              />
            </label>
            <label className="owner-date-field">
              <span>结束日期</span>
              <input
                className="owner-date-input"
                type="date"
                value={customEndDate}
                min={customStartDate}
                max={todayDateKey}
                onChange={event => setCustomEndDate(event.target.value)}
              />
            </label>
          </div>
        )}

        <div className="scope-line">当前范围：{selectedStoreName} · {rankingRange.label}</div>
        {loadError && <div className="error-box">{loadError}</div>}

        <section className="metric-grid">
          <MetricCard label="营业额" value={money(totalSales)} note={`${number(totalOrders)} 单，客单 ${money(avgTicket)}`} />
          <MetricCard
            label="订单"
            value={number(totalOrders)}
            note={(
              <div className="order-type-split">
                <span className="order-type-chip">Mesa<strong>{number(orderTypeSummary.mesa)}</strong></span>
                <span className="order-type-chip">Barra<strong>{number(orderTypeSummary.barra)}</strong></span>
                <span className="order-type-chip">Delivery<strong>{number(orderTypeSummary.delivery)}</strong></span>
              </div>
            )}
          />
          <MetricCard label="现金收入" value={money(paymentTotals.cash)} note="按订单实收现金" />
          <MetricCard label="刷卡收入" value={money(paymentTotals.card)} note="按订单实收刷卡" />
          <MetricCard label="日常开支" value={money(totalExpenses)} note="不含采购货款" />
          <MetricCard label="采购开支" value={money(totalPurchases)} note="已付款采购/还款" />
          <MetricCard label="盈亏" value={money(totalProfit)} note="营业额 - 开支" />
          <MetricCard label="供应商货款" value={money(totalSupplierDebt)} note="当前剩余欠款" />
        </section>

        <main className="content-grid">
          <section>
            <div className="panel">
              <h2 className="panel-title">分店表现</h2>
              {storeStats.length === 0 ? (
                <div className="empty-box">暂无分店数据，点击刷新云端数据后查看。</div>
              ) : (
                <div className="store-grid">
                  {storeStats.map(store => (
                    <button
                      key={store.id}
                      className={`store-card ${selectedStoreId === store.id ? 'selected' : ''}`}
                      onClick={() => setSelectedStoreId(store.id)}
                    >
                      <div className="store-name">{store.name}</div>
                      <div className="store-row"><span>营业额</span><strong>{money(store.sales)}</strong></div>
                      <div className="store-row"><span>订单</span><strong>{number(store.orders)}</strong></div>
                      <div className="store-row"><span>采购</span><strong>{money(store.purchases)}</strong></div>
                      <div className="store-row"><span>盈亏</span><strong>{money(store.profit)}</strong></div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {selectedStoreStats && (
              <div className="panel">
                <h2 className="panel-title">{selectedStoreStats.name} 详细数据</h2>
                <div className="list-row"><span>营业额</span><strong>{money(selectedStoreStats.sales)}</strong></div>
                <div className="list-row"><span>订单数</span><strong>{number(selectedStoreStats.orders)}</strong></div>
                <div className="list-row"><span>采购开支</span><strong>{money(selectedStoreStats.purchases)}</strong></div>
                <div className="list-row"><span>日常开支</span><strong>{money(selectedStoreStats.expenses)}</strong></div>
                <div className="list-row"><span>盈亏</span><strong>{money(selectedStoreStats.profit)}</strong></div>
              </div>
            )}

            <div className="panel">
              <h2 className="panel-title">销售趋势</h2>
              {salesTrend.length === 0 ? (
                <div className="empty-box">暂无销售趋势数据。</div>
              ) : (
                <div className="chart-box">
                  <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} initialDimension={{ width: 640, height: 260 }}>
                    <LineChart data={salesTrend}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis width={54} />
                      <Tooltip formatter={(value: any) => money(Number(value || 0))} />
                      <Line type="monotone" dataKey="amount" stroke={colors.blue} strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            <div className="panel ranking-panel">
              <div className="ranking-head">
                <div>
                  <h2 className="panel-title">销售商品排行</h2>
                  <div className="metric-note">
                    跟随当前分店和时间范围，复用店长数据概览排行逻辑。
                  </div>
                </div>
                <div className="ranking-controls">
                  {[
                    ['all', '全部商品'],
                    ['dishes', '菜品'],
                    ['beverages', '酒水'],
                  ].map(([value, label]) => (
                    <button
                      key={value}
                      className={`ranking-button ${rankingScope === value ? 'active' : ''}`}
                      onClick={() => setRankingScope(value as RankingScope)}
                    >
                      {label}
                    </button>
                  ))}
                  <button
                    className={`ranking-button ${rankingSortBy === 'revenue' ? 'active' : ''}`}
                    onClick={() => setRankingSortBy('revenue')}
                  >
                    金额
                  </button>
                  <button
                    className={`ranking-button ${rankingSortBy === 'quantity' ? 'active' : ''}`}
                    onClick={() => setRankingSortBy('quantity')}
                  >
                    销量
                  </button>
                  <select
                    className="ranking-select"
                    value={rankingOrderType}
                    onChange={event => setRankingOrderType(event.target.value as DashboardOrderTypeFilter)}
                  >
                    <option value="all">全部渠道</option>
                    <option value="dine_in">堂食</option>
                    <option value="takeout">Barra</option>
                    <option value="delivery">Delivery</option>
                  </select>
                  <select
                    className="ranking-select"
                    value={rankingTopN}
                    onChange={event => setRankingTopN(Number(event.target.value))}
                  >
                    <option value={10}>Top 10</option>
                    <option value={20}>Top 20</option>
                    <option value={50}>Top 50</option>
                  </select>
                  {rankingScope === 'beverages' && (
                    <select
                      className="ranking-select"
                      value={beverageCategoryFilter}
                      onChange={event => setBeverageCategoryFilter(event.target.value as BeverageCategoryFilter)}
                    >
                      <option value="all">全部酒水</option>
                      <option value="Cerveza">Cerveza</option>
                      <option value="Bebida">Bebida</option>
                      <option value="Jugo">Jugo</option>
                    </select>
                  )}
                </div>
              </div>

              {salesRankings.length === 0 ? (
                <div className="empty-box">当前范围暂无商品销售数据。</div>
              ) : (
                <>
                  {salesRankings.map((item, index) => {
                    const metric = rankingSortBy === 'quantity' ? item.quantity : item.revenue;
                    const barWidth = maxRankingMetric > 0 ? Math.max(4, (metric / maxRankingMetric) * 100) : 0;
                    return (
                      <div key={`${item.name}-${index}`} className="ranking-row">
                        <div className="ranking-badge">{index + 1}</div>
                        <div>
                          <div className="ranking-name">{item.name}</div>
                          <div className="ranking-meta">
                            {item.category} · 均价 {money(item.averagePrice)}
                          </div>
                          <div className="ranking-bar">
                            <div className="ranking-bar-fill" style={{ width: `${barWidth}%` }} />
                          </div>
                        </div>
                        <div className="ranking-value">
                          <strong>{money(item.revenue)}</strong>
                          <div className="ranking-meta">
                            {item.quantity.toFixed(1)} 份 · {percent(item.revenueShare)}
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  <div className="movement-grid">
                    <div className="movement-box">
                      <div className="movement-title">较上期增长</div>
                      {rankingMovement.increased.length === 0 ? (
                        <div className="metric-note">暂无增长商品</div>
                      ) : rankingMovement.increased.slice(0, 3).map(item => {
                        const delta = rankingSortBy === 'quantity' ? item.quantityDelta : item.revenueDelta;
                        return (
                          <div key={`up-${item.name}`} className="movement-row">
                            <span>{item.name}</span>
                            <strong>+{rankingSortBy === 'quantity' ? delta.toFixed(1) : money(delta)}</strong>
                          </div>
                        );
                      })}
                    </div>
                    <div className="movement-box">
                      <div className="movement-title">较上期下降</div>
                      {rankingMovement.decreased.length === 0 ? (
                        <div className="metric-note">暂无下降商品</div>
                      ) : rankingMovement.decreased.slice(0, 3).map(item => {
                        const delta = rankingSortBy === 'quantity' ? item.quantityDelta : item.revenueDelta;
                        return (
                          <div key={`down-${item.name}`} className="movement-row">
                            <span>{item.name}</span>
                            <strong>{rankingSortBy === 'quantity' ? delta.toFixed(1) : money(delta)}</strong>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </div>
          </section>

          <aside>
            <div className="panel">
              <h2 className="panel-title">支付方式</h2>
              {paymentChannels.length === 0 ? (
                <div className="empty-box">暂无支付数据。</div>
              ) : (
                <div className="chart-box">
                  <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} initialDimension={{ width: 320, height: 260 }}>
                    <PieChart>
                      <Pie data={paymentChannels} dataKey="value" nameKey="name" innerRadius={48} outerRadius={82}>
                        {paymentChannels.map((_, index) => (
                          <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: any) => money(Number(value || 0))} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
              {paymentChannels.map(channel => (
                <div key={channel.name} className="list-row">
                  <span>{channel.name}</span>
                  <strong>{money(channel.value)}</strong>
                </div>
              ))}
            </div>

            <div className="panel">
              <h2 className="panel-title">成本汇总</h2>
              <div className="list-row"><span>已付采购支出</span><strong>{money(totalPurchases)}</strong></div>
              <div className="list-row"><span>日常开支</span><strong>{money(totalExpenses)}</strong></div>
              <div className="list-row"><span>供应商货款</span><strong>{money(totalSupplierDebt)}</strong></div>
              <div className="list-row"><span>库存物品</span><strong>{number(scopedInventory.length)}</strong></div>
              <div className="list-row"><span>员工</span><strong>{number(scopedEmployees.length)}</strong></div>
            </div>

            <div className="panel owner-expense-ranking-panel">
              <h2 className="panel-title">开支排行</h2>
              <div className="metric-note">按当前分店和时间范围统计，包含采购付款与日常开支。</div>
              {expenseRankings.length === 0 ? (
                <div className="empty-box">当前范围暂无开支数据。</div>
              ) : expenseRankings.map((item, index) => {
                const barWidth = maxExpenseRankingAmount > 0 ? Math.max(4, (item.amount / maxExpenseRankingAmount) * 100) : 0;
                return (
                  <div key={item.key} className="ranking-row expense-ranking-row">
                    <div className="ranking-badge">{index + 1}</div>
                    <div>
                      <div className="ranking-name">{item.label}</div>
                      <div className="ranking-meta">
                        {item.typeLabel} · {item.fullCategory}
                      </div>
                      <div className="ranking-bar">
                        <div className="ranking-bar-fill" style={{ width: `${barWidth}%` }} />
                      </div>
                    </div>
                    <div className="ranking-value">
                      <strong>{money(item.amount)}</strong>
                      <div className="ranking-meta">
                        {number(item.count)} 笔 · {percent(item.amountShare)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="panel owner-low-stock-panel">
              <h2 className="panel-title">低库存风险</h2>
              <div className="risk-summary">
                <div className="risk-summary-box">
                  <span className="metric-note">待补货物品</span>
                  <strong>{number(lowStockRisks.length)} 种</strong>
                </div>
                <div className="risk-summary-box">
                  <span className="metric-note">预计补货金额</span>
                  <strong>{money(lowStockEstimatedAmount)}</strong>
                </div>
              </div>
              {lowStockRisks.length === 0 ? (
                <div className="empty-box">当前范围未发现低库存风险。</div>
              ) : lowStockRisks.slice(0, 8).map(item => (
                <div key={`${item.storeId}:${item.itemId}`} className="list-row">
                  <span>
                    <strong>{item.itemName}</strong>
                    <span className="evidence-meta">
                      {selectedStoreId === 'all' ? `${item.storeName} · ` : ''}{item.supplierName}
                    </span>
                  </span>
                  <span className="risk-stock">
                    {item.currentStock.toLocaleString()} / {item.minStock.toLocaleString()} {item.unit}
                  </span>
                </div>
              ))}
              {lowStockRisks.length > 8 && (
                <div className="metric-note">另有 {number(lowStockRisks.length - 8)} 种低库存物品</div>
              )}
            </div>

            <div className="panel">
              <h2 className="panel-title">开支/采购发票</h2>
              {evidenceRows.length === 0 ? (
                <div className="empty-box">当前范围暂无可查看票据。</div>
              ) : evidenceRows.map(row => (
                <div key={row.id} className="evidence-row">
                  <span className="evidence-main">
                    <span className="evidence-title">{row.title}</span>
                    <span className="evidence-meta">
                      {row.storeName} · {row.kind === 'purchase' ? '采购' : '开支'} · {row.date || '无日期'} · {money(row.amount)}
                    </span>
                  </span>
                  <button className="evidence-button" onClick={() => setSelectedEvidence(row)}>
                    查看
                  </button>
                </div>
              ))}
            </div>

          </aside>
        </main>
      </div>

      {selectedEvidence && (
        <div className="evidence-modal-backdrop" onClick={() => setSelectedEvidence(null)}>
          <div className="evidence-modal" onClick={event => event.stopPropagation()}>
            <div className="evidence-modal-header">
              <div>
                <h2 className="panel-title">{selectedEvidence.title}</h2>
                <div className="metric-note">
                  {selectedEvidence.storeName} · {selectedEvidence.kind === 'purchase' ? '采购发票' : '开支票据'} · {money(selectedEvidence.amount)}
                </div>
              </div>
              <button className="evidence-button" onClick={() => setSelectedEvidence(null)}>关闭</button>
            </div>
            <img src={selectedEvidence.image} alt="开支或采购凭证" />
          </div>
        </div>
      )}
    </div>
  );
};

const MetricCard: React.FC<{ label: string; value: string; note: React.ReactNode }> = ({ label, value, note }) => (
  <div className="metric-card">
    <div className="metric-label">{label}</div>
    <div className="metric-value">{value}</div>
    <div className="metric-note">{note}</div>
  </div>
);

export default OwnerDashboard;
