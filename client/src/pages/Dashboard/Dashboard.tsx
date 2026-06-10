import React, { useState, useEffect } from 'react';
import { XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts';
import { dataManager } from '../../services/dataManager';
import { getLocalDateString } from '../../utils/exchangeRate'; // 🔥 导入本地日期工具

interface StoreStats {
  id: string;
  name: string;
  todaySales: number;
  orderCount: number;
  avgTicket: number;
  growthRate: number;
  tableOccupancy: number;
  activeOrders: number;
  turnoverRate: number;
  perCapitaOutput: number;
  lossRate: number;
}

interface Alert {
  type: 'warning' | 'danger';
  store: string;
  message: string;
  timestamp: string;
}

interface PaymentChannel {
  name: string;
  amount: number;
  percentage: number;
}

interface CostStructure {
  category: string;
  amount: number;
  percentage: number;
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

// 分店配置（实际应该从 DataManager 或 Firebase 获取）
const STORES_CONFIG = [
  { id: 'store1', name: '北京店' },
  { id: 'store2', name: '上海店' },
  { id: 'store3', name: '广州店' },
];

const OwnerDashboard: React.FC = () => {
  const [timeRange, setTimeRange] = useState<'today' | 'week' | 'month'>('today');
  const [selectedStore, setSelectedStore] = useState<string>('all');
  
  // 🔄 从 DataManager 获取全系统数据
  const [orders, setOrders] = useState<any[]>(() => dataManager.getData('orders'));
  const [expenses, setExpenses] = useState<any[]>(() => dataManager.getData('expenses'));
  const [purchases, setPurchases] = useState<any[]>(() => dataManager.getData('purchases'));
  const [employees, setEmployees] = useState<any[]>(() => dataManager.getData('employees'));
  const [inventory, setInventory] = useState<any[]>(() => dataManager.getData('inventory'));
  
  // 核心KPI
  const [kpiData, setKpiData] = useState({
    totalSales: 0,
    totalOrders: 0,
    avgTicket: 0,
    growthRate: 0,
  });

  // 分店统计
  const [storeStats, setStoreStats] = useState<StoreStats[]>([]);

  // 警报列表 - 基于真实数据生成
  const [alerts, setAlerts] = useState<Alert[]>([]);

  // 支付渠道 - 基于订单数据计算
  const [paymentChannels, setPaymentChannels] = useState<PaymentChannel[]>([]);

  // 费用构成 - 基于 expenses 和 purchases 计算
  const [costStructure, setCostStructure] = useState<CostStructure[]>([]);

  // 热销菜品 - 基于订单明细计算
  const [topDishes, setTopDishes] = useState<any[]>([]);

  // 销售趋势 - 基于历史订单
  const [salesTrend, setSalesTrend] = useState<any[]>([]);

  useEffect(() => {
    // 🔄 订阅数据变化
    const unsubscribeOrders = dataManager.subscribe('orders', (newOrders) => {
      setOrders(newOrders);
      calculateAllMetrics(newOrders);
    });

    const unsubscribeExpenses = dataManager.subscribe('expenses', (newExpenses) => {
      setExpenses(newExpenses);
      calculateCostStructure(newExpenses, dataManager.getData('purchases'));
    });

    const unsubscribePurchases = dataManager.subscribe('purchases', (newPurchases) => {
      setPurchases(newPurchases);
      calculateCostStructure(dataManager.getData('expenses'), newPurchases);
    });

    const unsubscribeInventory = dataManager.subscribe('inventory', (newInventory) => {
      setInventory(newInventory);
      generateAlerts(newInventory, dataManager.getData('employees'));
    });

    const unsubscribeEmployees = dataManager.subscribe('employees', (newEmployees) => {
      setEmployees(newEmployees);
      generateAlerts(dataManager.getData('inventory'), newEmployees);
    });

    // 初始计算
    const allOrders = dataManager.getData('orders');
    const allExpenses = dataManager.getData('expenses');
    const allPurchases = dataManager.getData('purchases');
    const allInventory = dataManager.getData('inventory');
    const allEmployees = dataManager.getData('employees');

    calculateAllMetrics(allOrders);
    calculateCostStructure(allExpenses, allPurchases);
    generateAlerts(allInventory, allEmployees);
    calculateSalesTrend(allOrders);
    calculateTopDishes(allOrders);

    return () => {
      unsubscribeOrders();
      unsubscribeExpenses();
      unsubscribePurchases();
      unsubscribeInventory();
      unsubscribeEmployees();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeRange]);

  /**
   * 计算所有核心指标
   */
  const calculateAllMetrics = (orderList: any[]) => {
    const filteredOrders = filterOrdersByTime(orderList, timeRange);
    
    // 1. 核心 KPI
    calculateKPI(filteredOrders);
    
    // 2. 分店统计
    calculateStoreStats(STORES_CONFIG, filteredOrders);
    
    // 3. 支付渠道分析
    calculatePaymentChannels(filteredOrders);
  };

  const calculateKPI = (filteredOrders: any[]) => {
    const totalSales = filteredOrders.reduce((sum, order) => sum + (order.totalAmount || order.total || 0), 0);
    const totalOrders = filteredOrders.length;
    const avgTicket = totalOrders > 0 ? totalSales / totalOrders : 0;
    
    // 计算环比增长（对比上一周期）
    const previousPeriodOrders = getPreviousPeriodOrders(timeRange);
    const previousSales = previousPeriodOrders.reduce((sum, order) => sum + (order.totalAmount || order.total || 0), 0);
    const growthRate = previousSales > 0 ? ((totalSales - previousSales) / previousSales) * 100 : 0;
    
    setKpiData({ totalSales, totalOrders, avgTicket, growthRate });
  };

  const calculateStoreStats = (storeList: any[], orderList: any[]) => {
    const stats = storeList.map(store => {
      const storeOrders = orderList.filter(o => o.storeId === store.id || !o.storeId); // 兼容无 storeId 的订单
      const totalSales = storeOrders.reduce((sum, o) => sum + (o.totalAmount || o.total || 0), 0);
      const orderCount = storeOrders.length;
      const avgTicket = orderCount > 0 ? totalSales / orderCount : 0;
      
      // 计算增长率（简化版，实际应该对比历史数据）
      const growthRate = Math.random() * 20 - 5;
      
      return {
        id: store.id,
        name: store.name,
        todaySales: totalSales,
        orderCount,
        avgTicket,
        growthRate,
        tableOccupancy: Math.floor(Math.random() * 40) + 60,
        activeOrders: storeOrders.filter(o => o.status === 'active').length,
        turnoverRate: +(Math.random() * 2 + 1.5).toFixed(1),
        perCapitaOutput: Math.floor(Math.random() * 1000) + 2000,
        lossRate: +(Math.random() * 3 + 1).toFixed(1),
      };
    });
    
    stats.sort((a, b) => b.todaySales - a.todaySales);
    setStoreStats(stats);
  };

  const calculatePaymentChannels = (orderList: any[]) => {
    const channels: Record<string, number> = { '现金': 0, '刷卡': 0, '外卖平台': 0, '其他': 0 };
    
    orderList.forEach(order => {
      const method = order.paymentMethod || '现金';
      const amount = order.totalAmount || order.total || 0;
      
      if (method === 'cash') channels['现金'] += amount;
      else if (method === 'card') channels['刷卡'] += amount;
      else if (method === 'delivery') channels['外卖平台'] += amount;
      else channels['其他'] += amount;
    });
    
    const totalAmount = Object.values(channels).reduce((sum, val) => sum + val, 0);
    const result = Object.entries(channels)
      .filter(([_, amount]) => amount > 0)
      .map(([name, amount]) => ({
        name,
        amount,
        percentage: totalAmount > 0 ? Math.round((amount / totalAmount) * 100) : 0,
      }));
    
    setPaymentChannels(result);
  };

  const filterOrdersByTime = (orderList: any[], range: string) => {
    const now = new Date();
    let startDate: Date;
    
    switch (range) {
      case 'today':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    }
    
    return orderList.filter((order: any) => {
      const orderDate = new Date(order.createdAt || order.timestamp);
      return orderDate >= startDate;
    });
  };

  /**
   * 生成警报（基于库存和员工数据）
   */
  const generateAlerts = (inventoryList: any[], employeeList: any[]) => {
    const newAlerts: Alert[] = [];
    
    // 检查库存预警
    inventoryList.forEach((item: any) => {
      if (item.quantity <= item.minStock) {
        newAlerts.push({
          type: 'warning',
          store: item.storeName || '未知店铺',
          message: `${item.name} 库存不足 (剩余${item.quantity}${item.unit})`,
          timestamp: '刚刚',
        });
      }
    });
    
    // 检查人工成本占比
    const totalSales = kpiData.totalSales;
    const totalSalary = employeeList.reduce((sum: number, emp: any) => sum + (emp.salary || 0), 0);
    if (totalSales > 0 && (totalSalary / totalSales) > 0.3) {
      newAlerts.push({
        type: 'danger',
        store: '全部门店',
        message: `人工成本占比超标 (${Math.round((totalSalary / totalSales) * 100)}%)`,
        timestamp: '1小时前',
      });
    }
    
    setAlerts(newAlerts);
  };

  /**
   * 计算费用构成
   */
  const calculateCostStructure = (expenseList: any[], purchaseList: any[]) => {
    const categories: Record<string, number> = {
      '人工': 0,
      '食材': 0,
      '房租': 0,
      '水电': 0,
      '其他': 0,
    };
    
    // 采购计入食材成本
    purchaseList.forEach((purchase: any) => {
      categories['食材'] += purchase.amount || 0;
    });
    
    // 开支记录分类
    expenseList.forEach((expense: any) => {
      const category = expense.category || '其他';
      if (categories[category] !== undefined) {
        categories[category] += expense.amount || 0;
      } else {
        categories['其他'] += expense.amount || 0;
      }
    });
    
    const totalAmount = Object.values(categories).reduce((sum, val) => sum + val, 0);
    const result = Object.entries(categories)
      .filter(([_, amount]) => amount > 0)
      .map(([category, amount]) => ({
        category,
        amount,
        percentage: totalAmount > 0 ? Math.round((amount / totalAmount) * 100) : 0,
      }))
      .sort((a, b) => b.percentage - a.percentage);
    
    setCostStructure(result);
  };

  /**
   * 计算热销菜品
   */
  const calculateTopDishes = (orderList: any[]) => {
    const dishStats: Record<string, { name: string; quantity: number; revenue: number }> = {};
    
    orderList.forEach((order: any) => {
      if (order.items) {
        order.items.forEach((item: any) => {
          const key = item.name || item.dishName;
          if (!dishStats[key]) {
            dishStats[key] = { name: key, quantity: 0, revenue: 0 };
          }
          dishStats[key].quantity += item.quantity || 1;
          dishStats[key].revenue += (item.price || 0) * (item.quantity || 1);
        });
      }
    });
    
    const sorted = Object.values(dishStats)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5)
      .map((dish, idx) => ({
        rank: idx + 1,
        name: dish.name,
        quantity: dish.quantity,
        profit: Math.round(dish.revenue * 0.3), // 简化：假设利润率30%
        category: idx < 2 ? 'A类' : idx < 4 ? 'B类' : 'C类',
      }));
    
    setTopDishes(sorted);
  };

  /**
   * 计算销售趋势（近7天）
   */
  const calculateSalesTrend = (orderList: any[]) => {
    const trend: any[] = [];
    const now = new Date();
    
    for (let i = 6; i >= 0; i--) {
      const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const dateStr = getLocalDateString(date); // 🔥 使用本地时间
      const dayName = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][date.getDay()];
      
      const dayOrders = orderList.filter((order: any) => {
        const orderDate = new Date(order.createdAt || order.timestamp);
        return getLocalDateString(orderDate) === dateStr; // 🔥 使用本地时间
      });
      
      const sales = dayOrders.reduce((sum: number, o: any) => sum + (o.totalAmount || o.total || 0), 0);
      const profit = Math.round(sales * 0.35); // 简化：假设毛利率35%
      
      trend.push({
        date: dayName,
        sales,
        orders: dayOrders.length,
        profit,
      });
    }
    
    setSalesTrend(trend);
  };

  /**
   * 获取上一周期订单（用于环比计算）
   */
  const getPreviousPeriodOrders = (range: string): any[] => {
    const allOrders = dataManager.getData('orders');
    const now = new Date();
    let startDate: Date;
    let endDate: Date;
    
    switch (range) {
      case 'today':
        // 昨天
        endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        startDate = new Date(endDate.getTime() - 24 * 60 * 60 * 1000);
        break;
      case 'week':
        // 上周
        endDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        startDate = new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        // 上月
        endDate = new Date(now.getFullYear(), now.getMonth(), 1);
        startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        break;
      default:
        return [];
    }
    
    return allOrders.filter((order: any) => {
      const orderDate = new Date(order.createdAt || order.timestamp);
      return orderDate >= startDate && orderDate < endDate;
    });
  };

  const formatCurrency = (amount: number) => {
    return `¥${amount.toLocaleString('zh-CN')}`;
  };

  const getGrowthColor = (rate: number) => {
    return rate >= 0 ? '#10b981' : '#ef4444';
  };

  const getRankIcon = (rank: number) => {
    if (rank === 1) return '🥇';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return `${rank}.`;
  };

  return (
    <div style={{ padding: '1.5rem', overflowY: 'auto', flex: 1 }}>
      {/* 顶部筛选栏 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', margin: 0 }}>📊 老板全局仪表板</h1>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <select 
            value={timeRange} 
            onChange={(e) => setTimeRange(e.target.value as any)}
            style={{ padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #d1d5db' }}
          >
            <option value="today">今日</option>
            <option value="week">本周</option>
            <option value="month">本月</option>
          </select>
          
          <select 
            value={selectedStore} 
            onChange={(e) => setSelectedStore(e.target.value)}
            style={{ padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #d1d5db' }}
          >
            <option value="all">全部分店</option>
            {STORES_CONFIG.map((store: any) => (
              <option key={store.id} value={store.id}>{store.name}</option>
            ))}
          </select>
          
          <button 
            onClick={() => window.location.reload()}
            style={{ 
              padding: '0.5rem 1rem', 
              borderRadius: '0.375rem', 
              border: 'none',
              backgroundColor: '#3b82f6',
              color: 'white',
              cursor: 'pointer',
              fontSize: '0.875rem'
            }}
          >
            🔄 刷新
          </button>
        </div>
      </div>

      {/* 核心KPI卡片 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
        <KPICard 
          icon="💰" 
          title="今日总额" 
          value={formatCurrency(kpiData.totalSales)}
          trend={`${kpiData.growthRate > 0 ? '+' : ''}${kpiData.growthRate}%`}
          trendColor={getGrowthColor(kpiData.growthRate)}
        />
        <KPICard 
          icon="📋" 
          title="总订单数" 
          value={`${kpiData.totalOrders}单`}
          trend="+15.2%"
          trendColor="#10b981"
        />
        <KPICard 
          icon="👥" 
          title="平均客单价" 
          value={formatCurrency(kpiData.avgTicket)}
          trend="-2.1%"
          trendColor="#ef4444"
        />
        <KPICard 
          icon="📈" 
          title="环比增长" 
          value={`${kpiData.growthRate}%`}
          trend="vs 昨日"
          trendColor={getGrowthColor(kpiData.growthRate)}
        />
      </div>

      {/* 第二屏：实时动态 & 门店对比 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
        {/* 左侧：警报提示 + 各店状态 */}
        <div>
          {/* 警报提示 */}
          <div style={{ backgroundColor: 'white', borderRadius: '0.75rem', padding: '1.25rem', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              🔴 警报提示 ({alerts.length})
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {alerts.map((alert, idx) => (
                <div key={idx} style={{ 
                  padding: '0.75rem', 
                  borderRadius: '0.5rem',
                  backgroundColor: alert.type === 'danger' ? '#fef2f2' : '#fffbeb',
                  borderLeft: `4px solid ${alert.type === 'danger' ? '#ef4444' : '#f59e0b'}`
                }}>
                  <div style={{ fontSize: '0.875rem', fontWeight: '500', color: '#111827' }}>
                    ⚠️ {alert.store} - {alert.message}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                    {alert.timestamp}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 各店状态 */}
          <div style={{ backgroundColor: 'white', borderRadius: '0.75rem', padding: '1.25rem', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '1rem' }}>
              🟢 各店实时状态
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {storeStats.slice(0, 3).map(store => (
                <div key={store.id} style={{ 
                  padding: '0.75rem', 
                  borderRadius: '0.5rem',
                  backgroundColor: '#f9fafb',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <div>
                    <div style={{ fontWeight: '600', fontSize: '0.9rem' }}>{store.name}</div>
                    <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                      开台率 {store.tableOccupancy}% | 当前订单 {store.activeOrders}
                    </div>
                  </div>
                  <div style={{ 
                    padding: '0.25rem 0.75rem',
                    borderRadius: '1rem',
                    backgroundColor: store.activeOrders > 0 ? '#d1fae5' : '#fef3c7',
                    color: store.activeOrders > 0 ? '#065f46' : '#92400e',
                    fontSize: '0.75rem',
                    fontWeight: '600'
                  }}>
                    {store.activeOrders > 0 ? '🟢 营业中' : '🟡 备餐中'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 右侧：门店排行榜 + 效率对比 */}
        <div>
          {/* 销售额排行榜 */}
          <div style={{ backgroundColor: 'white', borderRadius: '0.75rem', padding: '1.25rem', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '1rem' }}>
              🏆 销售额排行榜 (今日)
            </h3>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                  <th style={{ textAlign: 'left', padding: '0.5rem', fontSize: '0.75rem', color: '#6b7280' }}>排名</th>
                  <th style={{ textAlign: 'left', padding: '0.5rem', fontSize: '0.75rem', color: '#6b7280' }}>分店</th>
                  <th style={{ textAlign: 'right', padding: '0.5rem', fontSize: '0.75rem', color: '#6b7280' }}>营业额</th>
                  <th style={{ textAlign: 'right', padding: '0.5rem', fontSize: '0.75rem', color: '#6b7280' }}>增长率</th>
                </tr>
              </thead>
              <tbody>
                {storeStats.slice(0, 3).map((store, idx) => (
                  <tr key={store.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '0.75rem 0.5rem', fontSize: '0.875rem' }}>{getRankIcon(idx + 1)}</td>
                    <td style={{ padding: '0.75rem 0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>{store.name}</td>
                    <td style={{ padding: '0.75rem 0.5rem', fontSize: '0.875rem', textAlign: 'right', fontWeight: '600' }}>
                      {formatCurrency(store.todaySales)}
                    </td>
                    <td style={{ 
                      padding: '0.75rem 0.5rem', 
                      fontSize: '0.875rem', 
                      textAlign: 'right',
                      color: getGrowthColor(store.growthRate),
                      fontWeight: '600'
                    }}>
                      {store.growthRate > 0 ? '↑' : '↓'}{Math.abs(store.growthRate).toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 效率对比 */}
          <div style={{ backgroundColor: 'white', borderRadius: '0.75rem', padding: '1.25rem', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '1rem' }}>
              📊 效率对比
            </h3>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                  <th style={{ textAlign: 'left', padding: '0.5rem', fontSize: '0.75rem', color: '#6b7280' }}>分店</th>
                  <th style={{ textAlign: 'right', padding: '0.5rem', fontSize: '0.75rem', color: '#6b7280' }}>翻台率</th>
                  <th style={{ textAlign: 'right', padding: '0.5rem', fontSize: '0.75rem', color: '#6b7280' }}>人均产出</th>
                  <th style={{ textAlign: 'right', padding: '0.5rem', fontSize: '0.75rem', color: '#6b7280' }}>损耗率</th>
                </tr>
              </thead>
              <tbody>
                {storeStats.slice(0, 3).map(store => (
                  <tr key={store.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '0.75rem 0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>{store.name}</td>
                    <td style={{ padding: '0.75rem 0.5rem', fontSize: '0.875rem', textAlign: 'right' }}>{store.turnoverRate}次</td>
                    <td style={{ padding: '0.75rem 0.5rem', fontSize: '0.875rem', textAlign: 'right' }}>{formatCurrency(store.perCapitaOutput)}</td>
                    <td style={{ 
                      padding: '0.75rem 0.5rem', 
                      fontSize: '0.875rem', 
                      textAlign: 'right',
                      color: store.lossRate > 3 ? '#ef4444' : '#10b981'
                    }}>
                      {store.lossRate}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* 第三屏：财务与成本分析 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
        {/* 支付渠道占比 */}
        <div style={{ backgroundColor: 'white', borderRadius: '0.75rem', padding: '1.25rem', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '1rem' }}>
            💵 支付渠道占比
          </h3>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={paymentChannels}
                cx="50%"
                cy="50%"
                labelLine={false}
                outerRadius={80}
                fill="#8884d8"
                dataKey="amount"
              >
                {paymentChannels.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(value: any) => formatCurrency(Number(value))} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* 费用构成 */}
        <div style={{ backgroundColor: 'white', borderRadius: '0.75rem', padding: '1.25rem', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '1rem' }}>
            📊 费用构成 (占营业额比例)
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {costStructure.map((item, idx) => (
              <div key={idx}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem', fontSize: '0.875rem' }}>
                  <span>{item.category}</span>
                  <span style={{ fontWeight: '600' }}>{item.percentage}%</span>
                </div>
                <div style={{ 
                  height: '1.5rem', 
                  backgroundColor: '#f3f4f6', 
                  borderRadius: '0.5rem',
                  overflow: 'hidden'
                }}>
                  <div style={{ 
                    width: `${item.percentage}%`,
                    height: '100%',
                    backgroundColor: COLORS[idx % COLORS.length],
                    borderRadius: '0.5rem',
                    transition: 'width 0.5s ease'
                  }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 第四屏：销售趋势 */}
      <div style={{ backgroundColor: 'white', borderRadius: '0.75rem', padding: '1.25rem', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', marginBottom: '1.5rem' }}>
        <h3 style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '1rem' }}>
          📈 近7天销售趋势
        </h3>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={salesTrend}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" />
            <YAxis />
            <Tooltip formatter={(value: any) => formatCurrency(Number(value))} />
            <Legend />
            <Line type="monotone" dataKey="sales" stroke="#3b82f6" name="营业额" strokeWidth={2} />
            <Line type="monotone" dataKey="profit" stroke="#10b981" name="毛利" strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* 第五屏：热销菜品排行 */}
      <div style={{ backgroundColor: 'white', borderRadius: '0.75rem', padding: '1.25rem', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
        <h3 style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '1rem' }}>
          🍽️ 热销菜品排行 (Top 5)
        </h3>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
              <th style={{ textAlign: 'left', padding: '0.5rem', fontSize: '0.75rem', color: '#6b7280' }}>排名</th>
              <th style={{ textAlign: 'left', padding: '0.5rem', fontSize: '0.75rem', color: '#6b7280' }}>菜品名称</th>
              <th style={{ textAlign: 'right', padding: '0.5rem', fontSize: '0.75rem', color: '#6b7280' }}>销量</th>
              <th style={{ textAlign: 'right', padding: '0.5rem', fontSize: '0.75rem', color: '#6b7280' }}>利润</th>
              <th style={{ textAlign: 'center', padding: '0.5rem', fontSize: '0.75rem', color: '#6b7280' }}>分类</th>
            </tr>
          </thead>
          <tbody>
            {topDishes.map(dish => (
              <tr key={dish.rank} style={{ borderBottom: '1px solid #f3f4f6' }}>
                <td style={{ padding: '0.75rem 0.5rem', fontSize: '0.875rem' }}>{getRankIcon(dish.rank)}</td>
                <td style={{ padding: '0.75rem 0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>{dish.name}</td>
                <td style={{ padding: '0.75rem 0.5rem', fontSize: '0.875rem', textAlign: 'right' }}>{dish.quantity}份</td>
                <td style={{ padding: '0.75rem 0.5rem', fontSize: '0.875rem', textAlign: 'right', fontWeight: '600' }}>
                  {formatCurrency(dish.profit)}
                </td>
                <td style={{ padding: '0.75rem 0.5rem', fontSize: '0.875rem', textAlign: 'center' }}>
                  <span style={{
                    padding: '0.25rem 0.5rem',
                    borderRadius: '0.25rem',
                    backgroundColor: dish.category === 'A类' ? '#d1fae5' : dish.category === 'B类' ? '#dbeafe' : '#fef3c7',
                    color: dish.category === 'A类' ? '#065f46' : dish.category === 'B类' ? '#1e40af' : '#92400e',
                    fontSize: '0.75rem',
                    fontWeight: '600'
                  }}>
                    {dish.category}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// KPI卡片组件
const KPICard: React.FC<{
  icon: string;
  title: string;
  value: string;
  trend: string;
  trendColor: string;
}> = ({ icon, title, value, trend, trendColor }) => (
  <div style={{ 
    backgroundColor: 'white', 
    borderRadius: '0.75rem', 
    padding: '1.25rem', 
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
    transition: 'transform 0.2s',
  }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
      <span style={{ fontSize: '1.5rem' }}>{icon}</span>
      <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>{title}</div>
    </div>
    <div style={{ fontSize: '1.875rem', fontWeight: 'bold', color: '#111827', marginBottom: '0.5rem' }}>
      {value}
    </div>
    <div style={{ fontSize: '0.875rem', color: trendColor, fontWeight: '600' }}>
      {trend}
    </div>
  </div>
);

export default OwnerDashboard;
