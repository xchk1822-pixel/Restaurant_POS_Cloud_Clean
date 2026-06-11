import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { smartGetDocuments } from '../../services/smartSyncService';
import { dedupeOwnerRecordsById } from '../../utils/ownerDashboardData';
import { getLocalDateString, toTimestampMillis } from '../../utils/localTime';

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
  employees: any[];
  syncedAt: string | null;
}

type TimeRange = 'today' | 'week' | 'month';

const CACHE_KEY = 'owner_dashboard_cache_v1';
const COLORS = ['#2563eb', '#16a34a', '#f59e0b', '#dc2626', '#7c3aed'];

const money = (value: number) =>
  `C$ ${value.toLocaleString('es-NI', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const number = (value: number) => value.toLocaleString('es-NI');

const getOrderAmount = (order: any): number => Number(order.totalAmount || order.total || 0);

const getRecordTime = (record: any): number =>
  toTimestampMillis(record.createdAt || record.orderDate || record.date || record.updatedAt || record.lastModified);

const getRangeStart = (range: TimeRange): number => {
  const now = new Date();
  if (range === 'today') {
    return new Date(`${getLocalDateString()}T00:00:00-06:00`).getTime();
  }
  const days = range === 'week' ? 7 : 30;
  return now.getTime() - days * 24 * 60 * 60 * 1000;
};

const getCachedData = (): OwnerCache => {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (error) {
    console.error('读取老板后台缓存失败:', error);
  }

  return {
    stores: [],
    orders: [],
    expenses: [],
    purchases: [],
    inventory: [],
    employees: [],
    syncedAt: null,
  };
};

const OwnerDashboard: React.FC = () => {
  const cached = useMemo(() => getCachedData(), []);
  const [timeRange, setTimeRange] = useState<TimeRange>('today');
  const [selectedStoreId, setSelectedStoreId] = useState<string>('');
  const [stores, setStores] = useState<any[]>(dedupeOwnerRecordsById(cached.stores));
  const [orders, setOrders] = useState<any[]>(cached.orders);
  const [expenses, setExpenses] = useState<any[]>(cached.expenses);
  const [purchases, setPurchases] = useState<any[]>(cached.purchases);
  const [inventory, setInventory] = useState<any[]>(cached.inventory);
  const [employees, setEmployees] = useState<any[]>(cached.employees);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(
    cached.syncedAt ? new Date(cached.syncedAt) : null
  );
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState('');

  const refreshOwnerData = useCallback(async () => {
    setIsRefreshing(true);
    setLoadError('');

    try {
      const loadedStores = await smartGetDocuments('stores', true);
      const collectionNames = ['pos_orders', 'expenses', 'purchase_orders', 'inventory_items', 'employees'] as const;
      const buckets: Record<typeof collectionNames[number], any[]> = {
        pos_orders: [],
        expenses: [],
        purchase_orders: [],
        inventory_items: [],
        employees: [],
      };

      for (const store of loadedStores) {
        await Promise.all(collectionNames.map(async collectionName => {
          try {
            const records = await smartGetDocuments(`stores/${store.id}/${collectionName}`, true);
            buckets[collectionName].push(...records.map(record => ({
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
      const activeStores = dedupeOwnerRecordsById(loadedStores);
      const nextCache: OwnerCache = {
        stores: activeStores,
        orders: buckets.pos_orders,
        expenses: buckets.expenses,
        purchases: buckets.purchase_orders,
        inventory: buckets.inventory_items,
        employees: buckets.employees,
        syncedAt: syncedAt.toISOString(),
      };

      localStorage.setItem(CACHE_KEY, JSON.stringify(nextCache));
      setStores(nextCache.stores);
      setOrders(nextCache.orders);
      setExpenses(nextCache.expenses);
      setPurchases(nextCache.purchases);
      setInventory(nextCache.inventory);
      setEmployees(nextCache.employees);
      setLastSyncedAt(syncedAt);
    } catch (error) {
      console.error('刷新老板后台失败:', error);
      setLoadError('刷新老板后台失败，请检查网络后重试');
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    refreshOwnerData();
  }, [refreshOwnerData]);

  const filteredOrders = useMemo(() => {
    const start = getRangeStart(timeRange);
    return orders.filter(order => {
      const timestamp = getRecordTime(order);
      return timestamp && timestamp >= start;
    });
  }, [orders, timeRange]);

  const filteredExpenses = useMemo(() => {
    const start = getRangeStart(timeRange);
    return expenses.filter(expense => {
      const timestamp = getRecordTime(expense);
      return timestamp && timestamp >= start;
    });
  }, [expenses, timeRange]);

  const filteredPurchases = useMemo(() => {
    const start = getRangeStart(timeRange);
    return purchases.filter(purchase => {
      const timestamp = getRecordTime(purchase);
      return timestamp && timestamp >= start;
    });
  }, [purchases, timeRange]);

  const totalSales = filteredOrders.reduce((sum, order) => sum + getOrderAmount(order), 0);
  const totalOrders = filteredOrders.length;
  const totalExpenses = filteredExpenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  const totalPurchases = filteredPurchases.reduce((sum, purchase) => sum + Number(purchase.totalAmount || 0), 0);
  const totalProfit = totalSales - totalExpenses - totalPurchases;
  const avgTicket = totalOrders > 0 ? totalSales / totalOrders : 0;

  const storeStats = useMemo<StoreStats[]>(() => {
    return stores
      .map(store => {
        const storeOrders = filteredOrders.filter(order => order.storeId === store.id);
        const storeExpenses = filteredExpenses.filter(expense => expense.storeId === store.id);
        const storePurchases = filteredPurchases.filter(purchase => purchase.storeId === store.id);
        const sales = storeOrders.reduce((sum, order) => sum + getOrderAmount(order), 0);
        const expenseAmount = storeExpenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
        const purchaseAmount = storePurchases.reduce((sum, purchase) => sum + Number(purchase.totalAmount || 0), 0);

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
  }, [filteredExpenses, filteredOrders, filteredPurchases, stores]);

  const paymentChannels = useMemo(() => {
    const channels: Record<string, number> = {};
    filteredOrders.forEach(order => {
      const method = order.paymentMethod || 'cash';
      const label = method === 'cash' ? '现金' : method === 'card' ? '刷卡' : method === 'mixed' ? '混合' : '其他';
      channels[label] = (channels[label] || 0) + getOrderAmount(order);
    });
    return Object.entries(channels).map(([name, value]) => ({ name, value }));
  }, [filteredOrders]);

  const salesTrend = useMemo(() => {
    const trend: Record<string, number> = {};
    filteredOrders.forEach(order => {
      const timestamp = getRecordTime(order);
      if (!timestamp) return;
      const key = getLocalDateString(new Date(timestamp)).slice(5);
      trend[key] = (trend[key] || 0) + getOrderAmount(order);
    });
    return Object.entries(trend)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-7)
      .map(([date, amount]) => ({ date, amount }));
  }, [filteredOrders]);

  const alerts = useMemo(() => {
    const lowStock = inventory
      .filter(item => Number(item.currentStock || item.totalStock || 0) <= Number(item.minStock || 0))
      .slice(0, 6)
      .map(item => ({
        title: item.storeName || '分店',
        message: `${item.name || '物品'} 库存不足`,
      }));

    const inactiveStores = storeStats
      .filter(store => store.orders === 0)
      .slice(0, 4)
      .map(store => ({
        title: store.name,
        message: '当前筛选时间内暂无订单',
      }));

    return [...lowStock, ...inactiveStores];
  }, [inventory, storeStats]);

  const selectedStore = storeStats.find(store => store.id === selectedStoreId);

  return (
    <div className="owner-page">
      <style>{`
        .owner-page {
          min-height: 100vh;
          background: #f4f6f8;
          padding: 18px;
          color: #111827;
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
          font-weight: 800;
        }
        .owner-subtitle {
          margin: 6px 0 0;
          color: #6b7280;
          font-size: 14px;
        }
        .owner-actions {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 10px;
          flex-wrap: wrap;
        }
        .owner-sync-time {
          color: #6b7280;
          font-size: 13px;
          white-space: nowrap;
        }
        .owner-refresh {
          border: 0;
          border-radius: 8px;
          padding: 10px 14px;
          background: #2563eb;
          color: white;
          font-weight: 700;
          cursor: pointer;
        }
        .owner-refresh:disabled {
          background: #9ca3af;
          cursor: not-allowed;
        }
        .owner-tabs {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 8px;
          margin-bottom: 14px;
        }
        .owner-tab {
          border: 1px solid #d1d5db;
          border-radius: 8px;
          padding: 10px;
          background: white;
          color: #374151;
          font-weight: 700;
          cursor: pointer;
        }
        .owner-tab.active {
          background: #111827;
          border-color: #111827;
          color: white;
        }
        .metric-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 12px;
          margin-bottom: 16px;
        }
        .metric-card, .panel, .store-card {
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          box-shadow: 0 1px 2px rgba(15, 23, 42, 0.05);
        }
        .metric-card {
          padding: 14px;
        }
        .metric-label {
          color: #6b7280;
          font-size: 13px;
          margin-bottom: 8px;
        }
        .metric-value {
          font-size: 24px;
          line-height: 1.1;
          font-weight: 800;
          word-break: break-word;
        }
        .metric-note {
          color: #6b7280;
          font-size: 12px;
          margin-top: 6px;
        }
        .content-grid {
          display: grid;
          grid-template-columns: minmax(0, 1.25fr) minmax(320px, 0.75fr);
          gap: 14px;
        }
        .panel {
          padding: 14px;
          margin-bottom: 14px;
        }
        .panel-title {
          margin: 0 0 12px;
          font-size: 17px;
          font-weight: 800;
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
          border-color: #2563eb;
          box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.15);
        }
        .store-name {
          font-weight: 800;
          margin-bottom: 10px;
        }
        .store-row {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          color: #4b5563;
          font-size: 13px;
          margin-top: 6px;
        }
        .store-row strong {
          color: #111827;
        }
        .chart-box {
          height: 260px;
        }
        .list-row {
          display: flex;
          justify-content: space-between;
          gap: 10px;
          padding: 10px 0;
          border-top: 1px solid #f3f4f6;
          font-size: 14px;
        }
        .list-row:first-of-type {
          border-top: 0;
        }
        .alert-row {
          padding: 10px;
          border-radius: 8px;
          background: #fff7ed;
          border: 1px solid #fed7aa;
          margin-top: 8px;
        }
        .alert-row strong {
          display: block;
          color: #9a3412;
          margin-bottom: 3px;
        }
        .error-box {
          padding: 10px 12px;
          border: 1px solid #fecaca;
          background: #fef2f2;
          color: #991b1b;
          border-radius: 8px;
          margin-bottom: 14px;
        }
        .empty-box {
          padding: 36px 12px;
          text-align: center;
          color: #6b7280;
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
          .store-grid {
            grid-template-columns: 1fr;
          }
          .chart-box {
            height: 220px;
          }
        }
        @media (max-width: 420px) {
          .metric-grid {
            grid-template-columns: 1fr;
          }
          .owner-tabs {
            grid-template-columns: 1fr;
          }
          .metric-value {
            font-size: 21px;
          }
        }
      `}</style>

      <div className="owner-shell">
        <header className="owner-header">
          <div>
            <h1 className="owner-title">老板全局后台</h1>
            <p className="owner-subtitle">多分店汇总查看，低频手动同步，适合手机快速巡店。</p>
          </div>
          <div className="owner-actions">
            {lastSyncedAt && (
              <span className="owner-sync-time">
                最后同步 {lastSyncedAt.toLocaleTimeString('es-NI', { hour12: false })}
              </span>
            )}
            <button className="owner-refresh" onClick={refreshOwnerData} disabled={isRefreshing}>
              {isRefreshing ? '同步中...' : '刷新云端数据'}
            </button>
          </div>
        </header>

        <div className="owner-tabs">
          {(['today', 'week', 'month'] as const).map(range => (
            <button
              key={range}
              className={`owner-tab ${timeRange === range ? 'active' : ''}`}
              onClick={() => setTimeRange(range)}
            >
              {range === 'today' ? '今天' : range === 'week' ? '近7天' : '近30天'}
            </button>
          ))}
        </div>

        {loadError && <div className="error-box">{loadError}</div>}

        <section className="metric-grid">
          <MetricCard label="营业额" value={money(totalSales)} note={`${number(totalOrders)} 笔订单`} />
          <MetricCard label="净利润估算" value={money(totalProfit)} note={`采购 ${money(totalPurchases)}`} />
          <MetricCard label="平均客单价" value={money(avgTicket)} note="按当前筛选时间计算" />
          <MetricCard label="分店/员工" value={`${stores.length} / ${employees.length}`} note="云端分店与员工汇总" />
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
                      onClick={() => setSelectedStoreId(prev => prev === store.id ? '' : store.id)}
                    >
                      <div className="store-name">{store.name}</div>
                      <div className="store-row"><span>营业额</span><strong>{money(store.sales)}</strong></div>
                      <div className="store-row"><span>订单</span><strong>{number(store.orders)}</strong></div>
                      <div className="store-row"><span>客单价</span><strong>{money(store.avgTicket)}</strong></div>
                      <div className="store-row"><span>利润估算</span><strong>{money(store.profit)}</strong></div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {selectedStore && (
              <div className="panel">
                <h2 className="panel-title">{selectedStore.name} 明细</h2>
                <div className="list-row"><span>营业额</span><strong>{money(selectedStore.sales)}</strong></div>
                <div className="list-row"><span>订单数</span><strong>{number(selectedStore.orders)}</strong></div>
                <div className="list-row"><span>采购支出</span><strong>{money(selectedStore.purchases)}</strong></div>
                <div className="list-row"><span>日常开支</span><strong>{money(selectedStore.expenses)}</strong></div>
                <div className="list-row"><span>利润估算</span><strong>{money(selectedStore.profit)}</strong></div>
              </div>
            )}

            <div className="panel">
              <h2 className="panel-title">销售趋势</h2>
              {salesTrend.length === 0 ? (
                <div className="empty-box">暂无销售趋势数据。</div>
              ) : (
                <div className="chart-box">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={salesTrend}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis width={54} />
                      <Tooltip formatter={(value: any) => money(Number(value || 0))} />
                      <Line type="monotone" dataKey="amount" stroke="#2563eb" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
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
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={paymentChannels} dataKey="value" nameKey="name" innerRadius={48} outerRadius={82}>
                        {paymentChannels.map((_, index) => (
                          <Cell key={index} fill={COLORS[index % COLORS.length]} />
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
              <div className="list-row"><span>采购支出</span><strong>{money(totalPurchases)}</strong></div>
              <div className="list-row"><span>日常开支</span><strong>{money(totalExpenses)}</strong></div>
              <div className="list-row"><span>库存物品</span><strong>{number(inventory.length)}</strong></div>
            </div>

            <div className="panel">
              <h2 className="panel-title">提醒</h2>
              {alerts.length === 0 ? (
                <div className="empty-box">当前没有需要处理的提醒。</div>
              ) : alerts.map((alert, index) => (
                <div key={index} className="alert-row">
                  <strong>{alert.title}</strong>
                  <span>{alert.message}</span>
                </div>
              ))}
            </div>
          </aside>
        </main>
      </div>
    </div>
  );
};

const MetricCard: React.FC<{ label: string; value: string; note: string }> = ({ label, value, note }) => (
  <div className="metric-card">
    <div className="metric-label">{label}</div>
    <div className="metric-value">{value}</div>
    <div className="metric-note">{note}</div>
  </div>
);

export default OwnerDashboard;
