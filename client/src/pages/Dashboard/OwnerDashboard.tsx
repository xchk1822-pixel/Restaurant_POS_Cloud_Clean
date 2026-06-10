import React, { useState, useEffect, useCallback } from 'react';
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts';
import { smartGetDocuments } from '../../services/smartSyncService';
import { getLocalDateTimeString } from '../../utils/exchangeRate';
import { getLocalDateString, toTimestampMillis } from '../../utils/localTime';

interface StoreStats {
  id: string;
  name: string;
  todaySales: number;
  orderCount: number;
  avgTicket: number;
  growthRate: number;
  profit: number;
}

interface Alert {
  type: 'warning' | 'danger';
  store: string;
  message: string;
  timestamp: string;
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

const OwnerDashboard: React.FC = () => {
  const [timeRange, setTimeRange] = useState<'today' | 'week' | 'month'>('today');
  const [selectedStoreId, setSelectedStoreId] = useState<string>('');
  
  // 🔥 真实数据状态
  const [stores, setStores] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [purchases, setPurchases] = useState<any[]>([]);
  const [inventory, setInventory] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  
  // 核心KPI
  const [kpiData, setKpiData] = useState({
    totalSales: 0,
    totalOrders: 0,
    avgTicket: 0,
    growthRate: 0,
    totalProfit: 0,
    totalExpenses: 0,
    totalPurchases: 0,
  });

  // 分店统计
  const [storeStats, setStoreStats] = useState<StoreStats[]>([]);

  // 警报列表
  const [alerts, setAlerts] = useState<Alert[]>([]);

  // 支付渠道
  const [paymentChannels, setPaymentChannels] = useState<any[]>([]);

  // 费用构成
  const [costStructure, setCostStructure] = useState<any[]>([]);

  // 🔥 支出分类统计
  const [expenseByCategory, setExpenseByCategory] = useState<any[]>([]);
  
  // 🔥 采购物品排行
  const [topPurchases, setTopPurchases] = useState<any[]>([]);

  // 销售趋势
  const [salesTrend, setSalesTrend] = useState<any[]>([]);

  // 加载所有分店数据：一次性读取，避免老板仪表板常驻大量 Firestore 监听
  useEffect(() => {
    console.log('老板仪表板开始一次性加载数据...');
    let cancelled = false;

    const loadAllData = async () => {
      try {
        const loadedStores = await smartGetDocuments('stores');
        if (cancelled) return;
        setStores(loadedStores);

        if (loadedStores.length === 0) {
          setOrders([]);
          setExpenses([]);
          setPurchases([]);
          setInventory([]);
          setEmployees([]);
          return;
        }

        const collectionNames = ['pos_orders', 'expenses', 'purchase_orders', 'inventory_items', 'employees'] as const;
        const buckets: Record<typeof collectionNames[number], any[]> = {
          pos_orders: [],
          expenses: [],
          purchase_orders: [],
          inventory_items: [],
          employees: [],
        };

        for (const store of loadedStores) {
          for (const collectionName of collectionNames) {
            try {
              const data = await smartGetDocuments(`stores/${store.id}/${collectionName}`);
              buckets[collectionName].push(...data.map(item => ({
                ...item,
                storeId: store.id,
                storeName: store.name,
              })));
            } catch (error) {
              console.error(`老板仪表板读取 ${store.name}/${collectionName} 失败:`, error);
            }
          }
        }

        if (cancelled) return;
        setOrders(buckets.pos_orders);
        setExpenses(buckets.expenses);
        setPurchases(buckets.purchase_orders);
        setInventory(buckets.inventory_items);
        setEmployees(buckets.employees);
      } catch (error) {
        console.error('老板仪表板加载数据失败:', error);
      }
    };

    loadAllData();
    return () => {
      cancelled = true;
    };
  }, []);
  /**
   * 计算所有核心指标
   */
  const calculateAllMetrics = useCallback(() => {
    const filteredOrders = filterOrdersByTime(orders, timeRange);
    
    // 1. 核心 KPI
    calculateKPI(filteredOrders);
    
    // 2. 分店统计
    calculateStoreStats(stores, filteredOrders);
    
    // 3. 支付渠道分析
    calculatePaymentChannels(filteredOrders);
    
    // 4. 费用构成
    calculateCostStructure();
    
    // 5. 生成警报
    generateAlerts();
    
    // 6. 销售趋势
    calculateSalesTrend();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, expenses, purchases, inventory, employees, stores, timeRange]);

  // 🔥 当数据变化时重新计算所有指标
  useEffect(() => {
    console.log('📊 看板数据状态:', {
      stores: stores.length,
      orders: orders.length,
      expenses: expenses.length,
      purchases: purchases.length
    });
    
    if (stores.length > 0) {
      console.log('🔄 重新计算看板指标...');
      calculateAllMetrics();
    } else {
      console.warn('⚠️ 没有分店数据，请先到系统设置中创建分店');
    }
  }, [calculateAllMetrics]);

  const calculateKPI = (filteredOrders: any[]) => {
    const totalSales = filteredOrders.reduce((sum, order) => {
      return sum + (order.totalAmount || order.total || 0);
    }, 0);
    
    const totalOrders = filteredOrders.length;
    const avgTicket = totalOrders > 0 ? totalSales / totalOrders : 0;
    
    // 计算总支出和采购
    const totalPurchases = purchases.reduce((sum, p) => sum + (p.totalAmount || 0), 0);
    const totalExpenses = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
    const totalProfit = totalSales - totalPurchases - totalExpenses;
    
    // 计算环比增长
    const previousPeriodOrders = getPreviousPeriodOrders(timeRange);
    const previousSales = previousPeriodOrders.reduce((sum, order) => {
      return sum + (order.totalAmount || order.total || 0);
    }, 0);
    
    const growthRate = previousSales > 0 ? ((totalSales - previousSales) / previousSales) * 100 : 0;
    
    setKpiData({ 
      totalSales, 
      totalOrders, 
      avgTicket, 
      growthRate,
      totalProfit,
      totalExpenses,
      totalPurchases
    });
  };

  const calculateStoreStats = (storeList: any[], orderList: any[]) => {
    const stats = storeList.map(store => {
      const storeOrders = orderList.filter(o => o.storeId === store.id);
      const totalSales = storeOrders.reduce((sum, o) => sum + (o.totalAmount || o.total || 0), 0);
      const orderCount = storeOrders.length;
      const avgTicket = orderCount > 0 ? totalSales / orderCount : 0;
      
      // 计算增长率（对比上一周期）
      const previousOrders = getPreviousPeriodOrders(timeRange).filter(o => o.storeId === store.id);
      const previousSales = previousOrders.reduce((sum, o) => sum + (o.totalAmount || o.total || 0), 0);
      const growthRate = previousSales > 0 ? ((totalSales - previousSales) / previousSales) * 100 : 0;
      
      // 计算利润：销售额 - 该分店开支
      const storeExpenses = expenses.filter(e => e.storeId === store.id);
      const totalExpenses = storeExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);
      const profit = totalSales - totalExpenses;
      
      return {
        id: store.id,
        name: store.name,
        todaySales: totalSales,
        orderCount,
        avgTicket,
        growthRate,
        profit,
      };
    });
    
    stats.sort((a, b) => b.todaySales - a.todaySales);
    setStoreStats(stats);
  };

  const handleStoreClick = (storeId: string) => {
    setSelectedStoreId(prev => prev === storeId ? '' : storeId);
  };

  const calculatePaymentChannels = (orderList: any[]) => {
    const channels: Record<string, number> = {};
    
    orderList.forEach(order => {
      const method = order.paymentMethod || 'cash';
      const amount = order.totalAmount || order.total || 0;
      
      const methodName = method === 'cash' ? '现金' : 
                        method === 'card' ? '刷卡' : 
                        method === 'wechat' ? '微信' : 
                        method === 'alipay' ? '支付宝' : '其他';
      
      channels[methodName] = (channels[methodName] || 0) + amount;
    });
    
    const totalAmount = Object.values(channels).reduce((sum, val) => sum + val, 0);
    const result = Object.entries(channels).map(([name, amount]) => ({
      name,
      amount,
      percentage: totalAmount > 0 ? Math.round((amount / totalAmount) * 100) : 0,
    }));
    
    setPaymentChannels(result);
  };

  const calculateCostStructure = () => {
    const totalPurchases = purchases.reduce((sum, p) => sum + (p.totalAmount || 0), 0);
    const totalExpenses = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
    const total = totalPurchases + totalExpenses;
    
    const structure = [
      { category: '采购成本', amount: totalPurchases, percentage: total > 0 ? Math.round((totalPurchases / total) * 100) : 0 },
      { category: '运营支出', amount: totalExpenses, percentage: total > 0 ? Math.round((totalExpenses / total) * 100) : 0 },
    ];
    
    setCostStructure(structure);
    
    // 🔥 计算支出分类统计
    calculateExpenseByCategory();
    
    // 🔥 计算采购物品排行
    calculateTopPurchases();
  };

  const calculateExpenseByCategory = () => {
    const categories: Record<string, number> = {};
    
    expenses.forEach(expense => {
      const category = expense.category || '其他';
      const amount = expense.amount || 0;
      categories[category] = (categories[category] || 0) + amount;
    });
    
    const result = Object.entries(categories)
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount);
    
    setExpenseByCategory(result);
  };

  const calculateTopPurchases = () => {
    const items: Record<string, { name: string; quantity: number; amount: number }> = {};
    
    purchases.forEach(order => {
      if (order.items && Array.isArray(order.items)) {
        order.items.forEach((item: any) => {
          const key = item.itemName || item.name || '未知';
          if (!items[key]) {
            items[key] = { name: key, quantity: 0, amount: 0 };
          }
          items[key].quantity += item.quantity || 0;
          items[key].amount += item.subtotal || 0;
        });
      }
    });
    
    const result = Object.values(items)
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 10); // 前10名
    
    setTopPurchases(result);
  };

  const generateAlerts = () => {
    const newAlerts: Alert[] = [];
    
    // 检查库存预警
    inventory.forEach((item: any) => {
      if (item.currentStock <= item.minStock) {
        newAlerts.push({
          type: 'warning',
          store: item.storeName || '总仓',
          message: `${item.name} 库存不足（${item.currentStock}${item.unit}）`,
          timestamp: getLocalDateTimeString(),
        });
      }
    });
    
    // 检查低销售额店铺
    storeStats.forEach(store => {
      if (store.todaySales < 1000 && store.orderCount > 0) {
        newAlerts.push({
          type: 'danger',
          store: store.name,
          message: `${store.name} 今日销售额偏低（¥${store.todaySales.toFixed(2)}）`,
          timestamp: getLocalDateTimeString(),
        });
      }
    });
    
    setAlerts(newAlerts);
  };

  const calculateSalesTrend = () => {
    const trend: Record<string, number> = {};
    
    orders.forEach(order => {
      const timestamp = toTimestampMillis(order.createdAt || order.timestamp || order.lastModified);
      if (!timestamp) return;
      const dateStr = getLocalDateString(new Date(timestamp)).slice(5);
      const amount = order.totalAmount || order.total || 0;
      
      trend[dateStr] = (trend[dateStr] || 0) + amount;
    });
    
    const result = Object.entries(trend)
      .slice(-7) // 最近7天
      .map(([date, amount]) => ({ date, amount }));
    
    setSalesTrend(result);
  };

  const filterOrdersByTime = (orderList: any[], range: string) => {
    const now = new Date();
    let startDate: Date;
    
    switch (range) {
      case 'today':
        startDate = new Date(`${getLocalDateString()}T00:00:00-06:00`);
        break;
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(`${getLocalDateString()}T00:00:00-06:00`);
    }
    
    return orderList.filter((order: any) => {
      const timestamp = toTimestampMillis(order.createdAt || order.timestamp || order.lastModified);
      return Boolean(timestamp && timestamp >= startDate.getTime());
    });
  };

  const getPreviousPeriodOrders = (range: string) => {
    const now = new Date();
    let startDate: Date;
    let endDate: Date;
    
    switch (range) {
      case 'today':
        endDate = new Date(`${getLocalDateString()}T00:00:00-06:00`);
        startDate = new Date(endDate.getTime() - 24 * 60 * 60 * 1000);
        break;
      case 'week':
        startDate = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
        endDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        startDate = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
        endDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        endDate = new Date(`${getLocalDateString()}T00:00:00-06:00`);
        startDate = new Date(endDate.getTime() - 24 * 60 * 60 * 1000);
    }
    
    return orders.filter((order: any) => {
      const timestamp = toTimestampMillis(order.createdAt || order.timestamp || order.lastModified);
      return Boolean(timestamp && timestamp >= startDate.getTime() && timestamp < endDate.getTime());
    });
  };

  return (
    <div style={{ padding: '2rem', backgroundColor: '#f3f4f6', minHeight: '100vh' }}>
      {/* 标题 */}
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 'bold', color: '#1f2937', margin: 0 }}>
          👑 老板全局仪表板
        </h1>
        <p style={{ color: '#6b7280', marginTop: '0.5rem' }}>
          实时监控系统运营状况 · 数据来源：Firebase Firestore
        </p>
      </div>

      {/* 时间范围选择 */}
      <div style={{ marginBottom: '2rem', display: 'flex', gap: '0.5rem' }}>
        {(['today', 'week', 'month'] as const).map(range => (
          <button
            key={range}
            onClick={() => setTimeRange(range)}
            style={{
              padding: '0.6rem 1.2rem',
              backgroundColor: timeRange === range ? '#3b82f6' : 'white',
              color: timeRange === range ? 'white' : '#374151',
              border: '1px solid #d1d5db',
              borderRadius: '0.375rem',
              fontWeight: '600',
              cursor: 'pointer'
            }}
          >
            {range === 'today' ? '今日' : range === 'week' ? '本周' : '本月'}
          </button>
        ))}
      </div>

      {/* 核心KPI卡片 */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
        gap: '1.5rem',
        marginBottom: '2rem'
      }}>
        <KPICard
          title="总销售额"
          value={`¥${kpiData.totalSales.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`}
          icon="💰"
          color="#3b82f6"
          trend={kpiData.growthRate}
        />
        <KPICard
          title="订单数量"
          value={kpiData.totalOrders.toString()}
          icon="📦"
          color="#10b981"
        />
        <KPICard
          title="平均客单价"
          value={`¥${kpiData.avgTicket.toFixed(2)}`}
          icon="🎫"
          color="#f59e0b"
        />
        <KPICard
          title="总利润"
          value={`¥${kpiData.totalProfit.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`}
          icon="📈"
          color={kpiData.totalProfit >= 0 ? '#10b981' : '#ef4444'}
        />
      </div>

      {/* 分店业绩卡片 */}
      {storeStats.length > 0 && (
        <div style={{ marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '1rem', color: '#1f2937' }}>
            🏪 各分店实时数据（点击查看详情）
          </h2>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: '1.5rem'
          }}>
            {storeStats.map((store, index) => (
              <div
                key={store.id}
                onClick={() => handleStoreClick(store.id)}
                style={{
                  backgroundColor: 'white',
                  borderRadius: '0.75rem',
                  padding: '1.5rem',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  border: selectedStoreId === store.id ? '2px solid #3b82f6' : '2px solid transparent',
                  position: 'relative',
                  overflow: 'hidden'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-4px)';
                  e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.12)';
                  e.currentTarget.style.borderColor = '#3b82f6';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)';
                  e.currentTarget.style.borderColor = selectedStoreId === store.id ? '#3b82f6' : 'transparent';
                }}
              >
                {/* 排名徽章 */}
                <div style={{
                  position: 'absolute',
                  top: '1rem',
                  right: '1rem',
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  backgroundColor: index < 3 ? ['#fbbf24', '#9ca3af', '#cd7f32'][index] : '#e5e7eb',
                  color: index < 3 ? 'white' : '#6b7280',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 'bold',
                  fontSize: '0.9rem'
                }}>
                  #{index + 1}
                </div>

                {/* 分店名称 */}
                <div style={{ marginBottom: '1.25rem', paddingRight: '2.5rem' }}>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#1f2937', margin: 0 }}>
                    {store.name}
                  </h3>
                  <div style={{ fontSize: '0.85rem', color: '#6b7280', marginTop: '0.25rem' }}>
                    点击查看详情 →
                  </div>
                </div>

                {/* 核心指标 */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>今日销售额</div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#3b82f6' }}>
                      ¥{store.todaySales.toLocaleString('zh-CN', { minimumFractionDigits: 0 })}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>订单数</div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#1f2937' }}>
                      {store.orderCount}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>客单价</div>
                    <div style={{ fontSize: '1rem', fontWeight: '600', color: '#6b7280' }}>
                      ¥{store.avgTicket.toFixed(0)}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>增长率</div>
                    <div style={{ 
                      fontSize: '1rem', 
                      fontWeight: '600', 
                      color: store.growthRate >= 0 ? '#10b981' : '#ef4444' 
                    }}>
                      {store.growthRate >= 0 ? '↑' : '↓'} {Math.abs(store.growthRate).toFixed(1)}%
                    </div>
                  </div>
                </div>

                {/* 利润指示条 */}
                <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #f3f4f6' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.85rem', color: '#6b7280' }}>预估利润</span>
                    <span style={{ 
                      fontSize: '1.1rem', 
                      fontWeight: 'bold',
                      color: store.profit >= 0 ? '#10b981' : '#ef4444'
                    }}>
                      ¥{store.profit.toLocaleString('zh-CN', { minimumFractionDigits: 0 })}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 图表区域 */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))',
        gap: '1.5rem',
        marginBottom: '2rem'
      }}>
        {/* 销售趋势 */}
        {salesTrend.length > 0 && (
          <div style={{
            backgroundColor: 'white',
            borderRadius: '0.5rem',
            padding: '1.5rem',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
          }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 'bold', marginBottom: '1rem' }}>
              📊 销售趋势
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={salesTrend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Line type="monotone" dataKey="amount" stroke="#3b82f6" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* 支付渠道 */}
        {paymentChannels.length > 0 && (
          <div style={{
            backgroundColor: 'white',
            borderRadius: '0.5rem',
            padding: '1.5rem',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
          }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 'bold', marginBottom: '1rem' }}>
              💳 支付渠道分布
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={paymentChannels}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="amount"
                >
                  {paymentChannels.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: any, name: any, props: any) => {
                  const percentage = props?.payload?.percentage || 0;
                  return [`¥${(value || 0).toLocaleString()} (${percentage}%)`, name];
                }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* 费用构成 */}
      {costStructure.length > 0 && (
        <div style={{
          backgroundColor: 'white',
          borderRadius: '0.5rem',
          padding: '1.5rem',
          marginBottom: '2rem',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
        }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 'bold', marginBottom: '1rem' }}>
            💸 费用构成总览
          </h3>
          <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
            {costStructure.map((item, index) => (
              <div key={index} style={{ flex: 1, minWidth: '200px' }}>
                <div style={{ fontSize: '0.9rem', color: '#6b7280', marginBottom: '0.5rem' }}>
                  {item.category}
                </div>
                <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#374151' }}>
                  ¥{item.amount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                </div>
                <div style={{ fontSize: '0.85rem', color: '#9ca3af', marginTop: '0.25rem' }}>
                  占比 {item.percentage}%
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 🔥 支出明细分析 */}
      {(expenseByCategory.length > 0 || topPurchases.length > 0) && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))',
          gap: '1.5rem',
          marginBottom: '2rem'
        }}>
          {/* 运营支出分类 */}
          {expenseByCategory.length > 0 && (
            <div style={{
              backgroundColor: 'white',
              borderRadius: '0.5rem',
              padding: '1.5rem',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
            }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 'bold', marginBottom: '1rem', color: '#ef4444' }}>
                📊 运营支出明细
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {expenseByCategory.map((item, index) => (
                  <div key={index} style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '0.75rem',
                    backgroundColor: '#f9fafb',
                    borderRadius: '0.375rem'
                  }}>
                    <div style={{ fontWeight: '600', color: '#374151' }}>
                      {item.category}
                    </div>
                    <div style={{ fontWeight: 'bold', color: '#ef4444' }}>
                      ¥{item.amount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 采购物品排行 */}
          {topPurchases.length > 0 && (
            <div style={{
              backgroundColor: 'white',
              borderRadius: '0.5rem',
              padding: '1.5rem',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
            }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 'bold', marginBottom: '1rem', color: '#f59e0b' }}>
                🛒 采购物品 TOP 10
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {topPurchases.map((item, index) => (
                  <div key={index} style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '0.75rem',
                    backgroundColor: '#f9fafb',
                    borderRadius: '0.375rem'
                  }}>
                    <div>
                      <div style={{ fontWeight: '600', color: '#374151' }}>
                        #{index + 1} {item.name}
                      </div>
                      <div style={{ fontSize: '0.8rem', color: '#9ca3af', marginTop: '0.25rem' }}>
                        数量: {item.quantity.toLocaleString()}
                      </div>
                    </div>
                    <div style={{ fontWeight: 'bold', color: '#f59e0b' }}>
                      ¥{item.amount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 警报列表 */}
      {alerts.length > 0 && (
        <div style={{
          backgroundColor: 'white',
          borderRadius: '0.5rem',
          padding: '1.5rem',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
        }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 'bold', marginBottom: '1rem', color: '#dc2626' }}>
            ⚠️ 系统警报 ({alerts.length})
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {alerts.map((alert, index) => (
              <div
                key={index}
                style={{
                  padding: '1rem',
                  backgroundColor: alert.type === 'danger' ? '#fee2e2' : '#fef3c7',
                  borderRadius: '0.375rem',
                  border: `1px solid ${alert.type === 'danger' ? '#fecaca' : '#fde68a'}`
                }}
              >
                <div style={{ fontWeight: '600', color: alert.type === 'danger' ? '#dc2626' : '#92400e' }}>
                  {alert.store}
                </div>
                <div style={{ fontSize: '0.9rem', color: '#374151', marginTop: '0.25rem' }}>
                  {alert.message}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 空状态提示 */}
      {orders.length === 0 && stores.length === 0 && (
        <div style={{
          textAlign: 'center',
          padding: '4rem',
          color: '#9ca3af'
        }}>
          <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>📊</div>
          <p style={{ fontSize: '1.1rem' }}>暂无数据</p>
          <p style={{ fontSize: '0.9rem', marginTop: '0.5rem' }}>
            请确保已创建分店并产生订单数据
          </p>
        </div>
      )}
    </div>
  );
};

// KPI卡片组件
const KPICard: React.FC<{
  title: string;
  value: string;
  icon: string;
  color: string;
  trend?: number;
}> = ({ title, value, icon, color, trend }) => (
  <div style={{
    backgroundColor: 'white',
    borderRadius: '0.5rem',
    padding: '1.5rem',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
    borderLeft: `4px solid ${color}`
  }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
      <div>
        <div style={{ fontSize: '0.85rem', color: '#6b7280', marginBottom: '0.5rem' }}>
          {title}
        </div>
        <div style={{ fontSize: '1.8rem', fontWeight: 'bold', color: '#1f2937' }}>
          {value}
        </div>
        {trend !== undefined && (
          <div style={{
            fontSize: '0.85rem',
            marginTop: '0.5rem',
            color: trend >= 0 ? '#10b981' : '#ef4444',
            fontWeight: '600'
          }}>
            {trend >= 0 ? '↑' : '↓'} {Math.abs(trend).toFixed(1)}% 环比
          </div>
        )}
      </div>
      <div style={{ fontSize: '2.5rem' }}>{icon}</div>
    </div>
  </div>
);

export default OwnerDashboard;
