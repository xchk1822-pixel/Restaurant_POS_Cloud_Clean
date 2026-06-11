import React, { useState, useEffect } from 'react';
import { dataManager } from '../../services/dataManager';
import { smartGetDocuments } from '../../services/smartSyncService';
import { toTimestampMillis } from '../../utils/localTime';
import { getLocalDateString } from '../../utils/exchangeRate'; // 🔥 导入本地日期工具
import {
  getExpenseDateKey,
  getOrderCollectedAmount,
  getOrderFinancialDateKey,
  getOrderPaymentBreakdown,
  isPurchaseRelatedExpense,
  sumExpensesByKind,
} from '../../utils/financeMetrics';

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

interface SalesRanking {
  name: string;
  category: string;
  quantity: number;
  revenue: number;
}

interface DailyTrend {
  date: string;
  sales: number;
  orders: number;
  profit: number;
  dineInSales: number;
  takeoutSales: number;
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
  orders?: any[]; // 从父组件传入订单数据
}

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
      'pos_orders'
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

const DashboardModule: React.FC<DashboardModuleProps> = ({ orders: propOrders }) => {
  const [timeRange, setTimeRange] = useState<'today' | 'week' | 'month' | 'custom'>('today');
  const [startDate, setStartDate] = useState(getLocalDateString(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))); // 🔥 使用本地时间
  const [endDate, setEndDate] = useState(getLocalDateString()); // 🔥 使用本地时间

  // 🔄 使用统一数据管理服务
  const [orders, setOrders] = useState<any[]>(() => {
    return propOrders || dataManager.getData('orders');
  });
  const [dataVersion, setDataVersion] = useState(0);

  const [stats, setStats] = useState<TimeRangeStats>({
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
  });

  const [salesRankings, setSalesRankings] = useState<Record<string, SalesRanking[]>>({});
  const [salesTrend, setSalesTrend] = useState<DailyTrend[]>([]);

  // 🔥 支出分析数据
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
      const [cloudOrders, cloudExpenses, cloudPurchases] = await Promise.all([
        smartGetDocuments('pos_orders', true),
        smartGetDocuments('expenses', true),
        smartGetDocuments('purchase_orders', true),
      ]);

      await Promise.all([
        dataManager.saveData('orders', cloudOrders, { syncFirestore: false, notify: false }),
        dataManager.saveData('expenses', cloudExpenses, { syncFirestore: false, notify: false }),
        dataManager.saveData('purchases', cloudPurchases, { syncFirestore: false, notify: false }),
      ]);

      dataManager.clearCache();
      setOrders(cloudOrders);
      setDataVersion(version => version + 1);
      setLastSyncedAt(new Date());
    } catch (error) {
      console.error('\u5237\u65b0\u5e97\u957f\u6570\u636e\u5931\u8d25:', error);
      alert('\u5237\u65b0\u5e97\u957f\u6570\u636e\u5931\u8d25\uff0c\u8bf7\u68c0\u67e5\u7f51\u7edc\u540e\u91cd\u8bd5');
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    refreshManagerData();
  }, [refreshManagerData]);

  const loadDashboardData = React.useCallback(() => {
    try {
      // 计算时间范围
      let start: Date;
      let end: Date;
      const now = new Date();

      if (timeRange === 'today') {
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      } else if (timeRange === 'week') {
        start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        end = now;
      } else if (timeRange === 'month') {
        start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        end = now;
      } else {
        start = new Date(startDate);
        end = new Date(endDate);
        end.setDate(end.getDate() + 1);
      }

      const startStr = getLocalDateString(start); // 🔥 使用本地时间
      const endStr = getLocalDateString(end); // 🔥 使用本地时间
      const dashboardOrders = propOrders || orders || getStoreOrdersDirect();

      console.log('📊 加载数据概览:', { timeRange, startStr, endStr, 订单总数: dashboardOrders.length });

      // 🔄 使用统一数据管理服务的订单数据
      const filteredOrders = dashboardOrders.filter((order: any) => {
        const orderDateStr = getOrderFinancialDateKey(order);
        return orderDateStr >= startStr && orderDateStr < endStr;
      });

      console.log(`  - 筛选后订单数: ${filteredOrders.length}`);

      // 基础统计
      const totalSales = filteredOrders.reduce((sum: number, order: any) => sum + getOrderCollectedAmount(order), 0);
      const orderCount = filteredOrders.length;
      const cardPayment = filteredOrders.reduce((sum: number, order: any) => {
        if (order.paymentMethod === 'card') {
          // 纯刷卡：使用订单总额
          return sum + getOrderCollectedAmount(order);
        } else if (order.paymentMethod === 'mixed') {
          // 混合支付：使用刷卡部分
          return sum + getOrderPaymentBreakdown(order).card;
        }
        return sum;
      }, 0);

      const cashPayment = filteredOrders.reduce((sum: number, order: any) => {
        if (order.paymentMethod === 'cash') {
          // 纯现金：使用订单总额（不是实际收到的现金）
          return sum + getOrderCollectedAmount(order);
        } else if (order.paymentMethod === 'mixed') {
          // 混合支付：使用现金部分
          return sum + getOrderPaymentBreakdown(order).cash;
        }
        return sum;
      }, 0);

      // 验证：现金+刷卡应该等于总营业额
      const totalPayment = cashPayment + cardPayment;
      if (Math.abs(totalPayment - totalSales) > 0.01 && totalSales > 0) {
        console.warn('⚠️ 警告：现金+刷卡金额与总营业额不符', {
          totalSales,
          cashPayment,
          cardPayment,
          totalPayment,
          difference: totalPayment - totalSales
        });
      }

      // 堂食/打包/外卖分析
      const dineInOrders = filteredOrders.filter((o: any) => o.orderType === 'dine_in' || !o.orderType).length;
      const takeoutOrders = filteredOrders.filter((o: any) => o.orderType === 'takeout').length;
      const deliveryOrders = filteredOrders.filter((o: any) => o.orderType === 'delivery').length;

      const dineInRevenue = filteredOrders
        .filter((o: any) => o.orderType === 'dine_in' || !o.orderType)
        .reduce((sum: number, o: any) => sum + getOrderCollectedAmount(o), 0);
      const takeoutRevenue = filteredOrders
        .filter((o: any) => o.orderType === 'takeout')
        .reduce((sum: number, o: any) => sum + getOrderCollectedAmount(o), 0);
      const deliveryRevenue = filteredOrders
        .filter((o: any) => o.orderType === 'delivery')
        .reduce((sum: number, o: any) => sum + getOrderCollectedAmount(o), 0);

      // 🔄 使用统一数据管理服务读取开支和采购数据
      const expenses = dataManager.getData('expenses');
      console.log('  - 开支记录数:', expenses.length);

      const expenseAmount = sumExpensesByKind(expenses, startStr, endStr, 'operating');

      const purchases = dataManager.getData('purchases');
      console.log('  - 采购记录数:', purchases.length);

      const purchaseAmount = sumExpensesByKind(expenses, startStr, endStr, 'purchase');

      // 计算利润
      // 注意：这里的利润是简化计算，使用当天的采购总额作为成本
      // 更精确的计算需要追踪每个订单中商品的实际成本
      // 允许负数利润（例如：大量采购但销售较少时）
      const profit = totalSales - purchaseAmount - expenseAmount;

      // 销售排行 - 按实际商品分类动态统计
      const categorySales: Record<string, Record<string, SalesRanking>> = {};

      filteredOrders.forEach((order: any) => {
        if (order.items) {
          order.items.forEach((item: any) => {
            // 获取商品分类，如果没有则使用'其他'
            const category = item.category || '其他';

            // 初始化该分类的排行榜
            if (!categorySales[category]) {
              categorySales[category] = {};
            }

            const key = item.name;
            const existingItem = categorySales[category][key];

            categorySales[category][key] = {
              name: item.name,
              category: category,
              quantity: (existingItem?.quantity || 0) + (item.quantity || 1),
              revenue: (existingItem?.revenue || 0) + (item.price * (item.quantity || 1)),
            };
          });
        }
      });

      // 为每个分类生成Top 10排行
      const salesRankings: Record<string, SalesRanking[]> = {};
      Object.keys(categorySales).forEach(category => {
        salesRankings[category] = Object.values(categorySales[category])
          .sort((a, b) => b.revenue - a.revenue)
          .slice(0, 10);
      });

      // 销售趋势
      const trendMap: Record<string, DailyTrend> = {};
      for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
        const dateStr = getLocalDateString(d); // 🔥 使用本地时间
        trendMap[dateStr] = { date: dateStr, sales: 0, orders: 0, profit: 0, dineInSales: 0, takeoutSales: 0 };
      }

      filteredOrders.forEach((order: any) => {
        const orderDate = getOrderFinancialDateKey(order);
        const collectedAmount = getOrderCollectedAmount(order);
        if (trendMap[orderDate]) {
          trendMap[orderDate].sales += collectedAmount;
          trendMap[orderDate].orders += 1;
          if (order.orderType === 'takeout') {
            trendMap[orderDate].takeoutSales += collectedAmount;
          } else if (order.orderType === 'delivery') {
            trendMap[orderDate].takeoutSales += collectedAmount; // 外卖也计入takeoutSales
          } else {
            trendMap[orderDate].dineInSales += collectedAmount;
          }
        }
      });

      expenses.forEach((exp: any) => {
        const expenseDate = getExpenseDateKey(exp);
        if (trendMap[expenseDate]) {
          trendMap[expenseDate].profit -= exp.amount || 0;
        }
      });

      Object.keys(trendMap).forEach(date => {
        trendMap[date].profit += trendMap[date].sales;
      });

      const trendData = Object.values(trendMap).sort((a, b) => a.date.localeCompare(b.date));

      // 客户画像
      const customerStats = calculateCustomerProfile(filteredOrders);

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

      setSalesRankings(salesRankings);
      setSalesTrend(trendData);

      // 🔥 计算支出分类统计
      const expenseCategories: Record<string, number> = {};
      expenses.forEach((exp: any) => {
        const expenseDate = getExpenseDateKey(exp);
        if (!isPurchaseRelatedExpense(exp) && expenseDate >= startStr && expenseDate < endStr) {
          const category = exp.category || '其他';
          expenseCategories[category] = (expenseCategories[category] || 0) + (exp.amount || 0);
        }
      });
      const expenseByCategoryData = Object.entries(expenseCategories)
        .map(([category, amount]) => ({ category, amount }))
        .sort((a, b) => b.amount - a.amount);
      setExpenseByCategory(expenseByCategoryData);

      // 🔥 计算采购物品排行
      const purchaseItems: Record<string, { name: string; quantity: number; amount: number }> = {};
      purchases.forEach((purchase: any) => {
        const purchaseDate = purchase.date || purchase.createdAt;
        const purchaseDateStr = getRecordDateString(purchaseDate);
        if (purchaseDateStr && purchaseDateStr >= startStr && purchaseDateStr < endStr) {
          if (purchase.items && Array.isArray(purchase.items)) {
            purchase.items.forEach((item: any) => {
              const key = item.itemName || item.name || '未知';
              if (!purchaseItems[key]) {
                purchaseItems[key] = { name: key, quantity: 0, amount: 0 };
              }
              purchaseItems[key].quantity += item.quantity || 0;
              purchaseItems[key].amount += item.subtotal || 0;
            });
          }
        }
      });
      const topPurchasesData = Object.values(purchaseItems)
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 10);
      setTopPurchases(topPurchasesData);

      setCustomerProfile(customerStats);
    } catch (e) {
      console.error('加载数据失败:', e);
    } finally {
      setLoading(false);
    }
  }, [timeRange, startDate, endDate, propOrders, orders]);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData, dataVersion]);

  // 计算客户画像
  const calculateCustomerProfile = (orders: any[]): CustomerProfile => {
    const customerMap: Record<string, {
      orderCount: number;
      totalSpent: number;
      lastVisit: string;
      dishes: Record<string, number>;
    }> = {};

    orders.forEach((order: any) => {
      const phone = order.customerPhone || '散客';
      const orderDate = order.date || order.createdAt;

      if (!customerMap[phone]) {
        customerMap[phone] = {
          orderCount: 0,
          totalSpent: 0,
          lastVisit: orderDate,
          dishes: {},
        };
      }

      customerMap[phone].orderCount += 1;
      customerMap[phone].totalSpent += getOrderCollectedAmount(order);
      if (orderDate > customerMap[phone].lastVisit) {
        customerMap[phone].lastVisit = orderDate;
      }

      if (order.items) {
        order.items.forEach((item: any) => {
          const dishName = item.name;
          customerMap[phone].dishes[dishName] = (customerMap[phone].dishes[dishName] || 0) + 1;
        });
      }
    });

    const customers = Object.entries(customerMap);
    const totalCustomers = customers.length;
    const newCustomers = customers.filter(([_, data]) => data.orderCount === 1).length;
    const returningCustomers = customers.filter(([_, data]) => data.orderCount > 1).length;
    const newCustomerRate = totalCustomers > 0 ? (newCustomers / totalCustomers * 100) : 0;
    const avgOrderFrequency = totalCustomers > 0 ?
      customers.reduce((sum, [_, data]) => sum + data.orderCount, 0) / totalCustomers : 0;

    const topCustomers = customers
      .map(([phone, data]) => {
        const favoriteDish = Object.entries(data.dishes)
          .sort((a, b) => b[1] - a[1])[0]?.[0];

        return {
          phone: phone === '散客' ? undefined : phone,
          orderCount: data.orderCount,
          totalSpent: data.totalSpent,
          lastVisit: data.lastVisit,
          favoriteDish,
        };
      })
      .sort((a, b) => b.totalSpent - a.totalSpent)
      .slice(0, 10);

    const hourStats: Record<number, { orderCount: number; revenue: number }> = {};
    for (let i = 0; i < 24; i++) {
      hourStats[i] = { orderCount: 0, revenue: 0 };
    }

    orders.forEach((order: any) => {
      const orderTime = order.date || order.createdAt;
      try {
        const hour = new Date(orderTime).getHours();
        hourStats[hour].orderCount += 1;
        hourStats[hour].revenue += getOrderCollectedAmount(order);
      } catch (e) {}
    });

    const peakHours = Object.entries(hourStats)
      .map(([hour, data]) => ({
        hour: parseInt(hour),
        orderCount: data.orderCount,
        revenue: data.revenue,
      }))
      .filter(h => h.orderCount > 0)
      .sort((a, b) => b.orderCount - a.orderCount)
      .slice(0, 5);

    const categoryStats: Record<string, { orderCount: number; revenue: number }> = {};
    orders.forEach((order: any) => {
      if (order.items) {
        order.items.forEach((item: any) => {
          const category = item.category || '其他';
          if (!categoryStats[category]) {
            categoryStats[category] = { orderCount: 0, revenue: 0 };
          }
          categoryStats[category].orderCount += 1;
          categoryStats[category].revenue += item.price * (item.quantity || 1);
        });
      }
    });

    const totalCategoryOrders = Object.values(categoryStats).reduce((sum, c) => sum + c.orderCount, 0);
    const categoryPreference = Object.entries(categoryStats)
      .map(([category, data]) => ({
        category,
        orderCount: data.orderCount,
        revenue: data.revenue,
        percentage: totalCategoryOrders > 0 ? (data.orderCount / totalCategoryOrders * 100) : 0,
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
  };

  const styles = {
    container: {
      display: 'flex',
      flexDirection: 'column' as const,
      height: '100%',
      padding: '1.5rem',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    },
    header: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: '1.5rem',
      flexWrap: 'wrap' as const,
      gap: '1rem',
      flexShrink: 0 as const,
    },
    title: {
      fontSize: '2rem',
      fontWeight: 'bold',
      color: 'white',
      margin: 0,
      textShadow: '0 2px 4px rgba(0,0,0,0.1)',
    },
    controls: {
      display: 'flex',
      gap: '0.5rem',
      alignItems: 'center',
      flexWrap: 'wrap' as const,
      background: 'rgba(255,255,255,0.95)',
      padding: '0.5rem',
      borderRadius: '0.75rem',
      boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
    },
    timeBtn: (active: boolean) => ({
      padding: '0.6rem 1.2rem',
      background: active ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' : 'transparent',
      color: active ? 'white' : '#6b7280',
      border: 'none',
      borderRadius: '0.5rem',
      cursor: 'pointer',
      fontWeight: '600',
      fontSize: '0.875rem',
      transition: 'all 0.3s',
    }),
    input: {
      padding: '0.5rem',
      border: '1px solid #d1d5db',
      borderRadius: '0.375rem',
      fontSize: '0.875rem',
    },
    grid3: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
      gap: '1.5rem',
      marginBottom: '1.5rem',
    },
    grid2: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))',
      gap: '1.5rem',
      marginBottom: '1.5rem',
    },
    statCard: (bg: string) => ({
      background: 'white',
      borderRadius: '1rem',
      padding: '1.5rem',
      boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
      borderLeft: `5px solid ${bg}`,
      transition: 'transform 0.2s',
    }),
    statLabel: {
      fontSize: '0.875rem',
      color: '#6b7280',
      marginBottom: '0.5rem',
      fontWeight: '500',
    },
    statValue: (color: string) => ({
      fontSize: '1.75rem',
      fontWeight: 'bold',
      color: color,
      marginBottom: '0.25rem',
    }),
    statSub: {
      fontSize: '0.75rem',
      color: '#9ca3af',
    },
    card: {
      background: 'white',
      borderRadius: '1rem',
      padding: '1.5rem',
      boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
      marginBottom: '1.5rem',
    },
    cardTitle: {
      fontSize: '1.25rem',
      fontWeight: '700',
      color: '#1f2937',
      marginBottom: '1.25rem',
      display: 'flex',
      alignItems: 'center',
      gap: '0.5rem',
    },
    table: {
      width: '100%',
      borderCollapse: 'collapse' as const,
      fontSize: '0.875rem',
    },
    th: {
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      padding: '1rem',
      textAlign: 'left' as const,
      fontSize: '0.75rem',
      fontWeight: '600',
      color: 'white',
    },
    td: {
      padding: '0.875rem',
      borderBottom: '1px solid #f3f4f6',
    },
    rankingList: {
      listStyle: 'none',
      padding: 0,
      margin: 0,
    },
    rankingItem: (index: number) => ({
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '0.875rem',
      borderBottom: index < 9 ? '1px solid #f3f4f6' : 'none',
      borderRadius: '0.5rem',
      transition: 'background 0.2s',
    }),
    rankBadge: (index: number) => ({
      width: '28px',
      height: '28px',
      borderRadius: '50%',
      background: index === 0 ? 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)' :
                  index === 1 ? 'linear-gradient(135deg, #d1d5db 0%, #9ca3af 100%)' :
                  index === 2 ? 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)' : '#e5e7eb',
      color: index < 3 ? 'white' : '#6b7280',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: '0.75rem',
      fontWeight: 'bold',
      marginRight: '0.875rem',
      boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
    }),
    comparisonBox: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: '1rem',
      padding: '1rem',
      background: '#f9fafb',
      borderRadius: '0.75rem',
      marginBottom: '1rem',
    },
    progressBar: (percentage: number, color: string) => ({
      height: '10px',
      background: '#e5e7eb',
      borderRadius: '5px',
      overflow: 'hidden',
      marginTop: '0.5rem',
    }),
    progressFill: (percentage: number, color: string) => ({
      height: '100%',
      width: `${percentage}%`,
      background: color,
      borderRadius: '5px',
      transition: 'width 0.5s ease',
    }),
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem', color: 'white', fontSize: '1.25rem' }}>
        加载中...
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* 头部 */}
      <div style={styles.header}>
        <h1 style={styles.title}>📊 数据分析中心</h1>
        <div style={styles.controls}>
          <button onClick={() => setTimeRange('today')} style={styles.timeBtn(timeRange === 'today')}>今日</button>
          <button onClick={() => setTimeRange('week')} style={styles.timeBtn(timeRange === 'week')}>本周</button>
          <button onClick={() => setTimeRange('month')} style={styles.timeBtn(timeRange === 'month')}>本月</button>
          <button onClick={() => setTimeRange('custom')} style={styles.timeBtn(timeRange === 'custom')}>自定义</button>

          {timeRange === 'custom' && (
            <>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={styles.input} />
              <span style={{ color: '#6b7280' }}>至</span>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={styles.input} />
            </>
          )}

          {lastSyncedAt && (
            <span style={{ fontSize: '0.8rem', color: '#6b7280', whiteSpace: 'nowrap' }}>
              {'\u6700\u540e\u540c\u6b65 '} {lastSyncedAt.toLocaleTimeString('es-NI', { hour12: false })}
            </span>
          )}

          <button
            onClick={refreshManagerData}
            disabled={isRefreshing}
            style={{
              padding: '0.6rem 1.2rem',
              background: isRefreshing ? '#9ca3af' : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              color: 'white',
              border: 'none',
              borderRadius: '0.5rem',
              cursor: isRefreshing ? 'not-allowed' : 'pointer',
              fontWeight: '600',
            }}
          >
            {isRefreshing ? '\u540c\u6b65\u4e2d...' : '\u5237\u65b0\u4e91\u7aef\u6570\u636e'}
          </button>
        </div>
      </div>

      {/* 内容区 - 可滚动 */}
      <div style={{ flex: 1, overflowY: 'auto' }}>

      {/* 核心指标卡片 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem', marginBottom: '1.5rem' }}>
        <div style={styles.statCard('#3b82f6')}>
          <div style={styles.statLabel}>💰 总营业额</div>
          <div style={styles.statValue('#3b82f6')}>C$ {stats.totalSales.toFixed(2)}</div>
          <div style={styles.statSub}>{stats.orderCount} 笔订单</div>
        </div>

        <div style={styles.statCard('#10b981')}>
          <div style={styles.statLabel}>💵 现金收入</div>
          <div style={styles.statValue('#10b981')}>C$ {stats.cashPayment.toFixed(2)}</div>
          <div style={styles.statSub}>占比 {stats.totalSales > 0 ? ((stats.cashPayment / stats.totalSales) * 100).toFixed(1) : 0}%</div>
        </div>

        <div style={styles.statCard('#8b5cf6')}>
          <div style={styles.statLabel}>💳 刷卡收入</div>
          <div style={styles.statValue('#8b5cf6')}>C$ {stats.cardPayment.toFixed(2)}</div>
          <div style={styles.statSub}>占比 {stats.totalSales > 0 ? ((stats.cardPayment / stats.totalSales) * 100).toFixed(1) : 0}%</div>
        </div>

        <div style={styles.statCard('#f59e0b')}>
          <div style={styles.statLabel}>🍽️ 堂食订单</div>
          <div style={styles.statValue('#f59e0b')}>{stats.dineInOrders}</div>
          <div style={styles.statSub}>C$ {stats.dineInRevenue.toFixed(2)}</div>
        </div>

        <div style={styles.statCard('#06b6d4')}>
          <div style={styles.statLabel}>🥡 打包订单</div>
          <div style={styles.statValue('#06b6d4')}>{stats.takeoutOrders}</div>
          <div style={styles.statSub}>C$ {stats.takeoutRevenue.toFixed(2)}</div>
        </div>

        <div style={styles.statCard('#ec4899')}>
          <div style={styles.statLabel}>🚚 外卖配送</div>
          <div style={styles.statValue('#ec4899')}>{stats.deliveryOrders}</div>
          <div style={styles.statSub}>C$ {stats.deliveryRevenue.toFixed(2)}</div>
        </div>

        <div style={styles.statCard(stats.profit >= 0 ? '#10b981' : '#ef4444')}>
          <div style={styles.statLabel}>📊 净利润</div>
          <div style={styles.statValue(stats.profit >= 0 ? '#10b981' : '#ef4444')}>
            C$ {stats.profit.toFixed(2)}
          </div>
          <div style={styles.statSub}>利润率 {stats.totalSales > 0 ? ((stats.profit / stats.totalSales) * 100).toFixed(1) : 0}%</div>
        </div>
      </div>

      {/* 🔥 支出明细分析 */}
      {(expenseByCategory.length > 0 || topPurchases.length > 0) && (
        <div style={{ ...styles.card, marginBottom: '1.5rem' }}>
          <div style={styles.cardTitle}>💸 支出明细分析</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '1.5rem', marginTop: '1rem' }}>
            {/* 运营支出分类 */}
            {expenseByCategory.length > 0 && (
              <div>
                <h4 style={{ fontSize: '1rem', fontWeight: 'bold', marginBottom: '0.75rem', color: '#ef4444' }}>
                  📊 运营支出明细
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
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
                        C$ {item.amount.toFixed(2)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 采购物品排行 */}
            {topPurchases.length > 0 && (
              <div>
                <h4 style={{ fontSize: '1rem', fontWeight: 'bold', marginBottom: '0.75rem', color: '#f59e0b' }}>
                  🛒 采购物品 TOP 10
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
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
                          数量: {item.quantity}
                        </div>
                      </div>
                      <div style={{ fontWeight: 'bold', color: '#f59e0b' }}>
                        C$ {item.amount.toFixed(2)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 业务类型对比 */}
      <div style={styles.card}>
        <div style={styles.cardTitle}>📊 业务类型对比分析</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', padding: '1rem', background: '#f9fafb', borderRadius: '0.75rem', marginBottom: '1rem' }}>
          {/* 堂食 */}
          <div style={{ textAlign: 'center', padding: '1.5rem', background: 'white', borderRadius: '0.75rem', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🍽️</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#f59e0b', marginBottom: '0.5rem' }}>
              {stats.dineInOrders} 单
            </div>
            <div style={{ color: '#6b7280', marginBottom: '0.25rem', fontSize: '0.875rem' }}>堂食营业额</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#1f2937' }}>
              C$ {stats.dineInRevenue.toFixed(2)}
            </div>
            <div style={{ height: '8px', background: '#e5e7eb', borderRadius: '4px', overflow: 'hidden', marginTop: '0.75rem' }}>
              <div style={{
                height: '100%',
                width: `${stats.totalSales > 0 ? (stats.dineInRevenue / stats.totalSales * 100) : 0}%`,
                background: '#f59e0b',
                borderRadius: '4px',
                transition: 'width 0.5s ease',
              }} />
            </div>
            <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.25rem' }}>
              占比 {stats.totalSales > 0 ? ((stats.dineInRevenue / stats.totalSales) * 100).toFixed(1) : 0}%
            </div>
          </div>

          {/* 打包 */}
          <div style={{ textAlign: 'center', padding: '1.5rem', background: 'white', borderRadius: '0.75rem', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', borderLeft: '2px solid #e5e7eb', borderRight: '2px solid #e5e7eb' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🥡</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#06b6d4', marginBottom: '0.5rem' }}>
              {stats.takeoutOrders} 单
            </div>
            <div style={{ color: '#6b7280', marginBottom: '0.25rem', fontSize: '0.875rem' }}>打包营业额</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#1f2937' }}>
              C$ {stats.takeoutRevenue.toFixed(2)}
            </div>
            <div style={{ height: '8px', background: '#e5e7eb', borderRadius: '4px', overflow: 'hidden', marginTop: '0.75rem' }}>
              <div style={{
                height: '100%',
                width: `${stats.totalSales > 0 ? (stats.takeoutRevenue / stats.totalSales * 100) : 0}%`,
                background: '#06b6d4',
                borderRadius: '4px',
                transition: 'width 0.5s ease',
              }} />
            </div>
            <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.25rem' }}>
              占比 {stats.totalSales > 0 ? ((stats.takeoutRevenue / stats.totalSales) * 100).toFixed(1) : 0}%
            </div>
          </div>

          {/* 外卖配送 */}
          <div style={{ textAlign: 'center', padding: '1.5rem', background: 'white', borderRadius: '0.75rem', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🚚</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#ec4899', marginBottom: '0.5rem' }}>
              {stats.deliveryOrders} 单
            </div>
            <div style={{ color: '#6b7280', marginBottom: '0.25rem', fontSize: '0.875rem' }}>外卖配送营业额</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#1f2937' }}>
              C$ {stats.deliveryRevenue.toFixed(2)}
            </div>
            <div style={{ height: '8px', background: '#e5e7eb', borderRadius: '4px', overflow: 'hidden', marginTop: '0.75rem' }}>
              <div style={{
                height: '100%',
                width: `${stats.totalSales > 0 ? (stats.deliveryRevenue / stats.totalSales * 100) : 0}%`,
                background: '#ec4899',
                borderRadius: '4px',
                transition: 'width 0.5s ease',
              }} />
            </div>
            <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.25rem' }}>
              占比 {stats.totalSales > 0 ? ((stats.deliveryRevenue / stats.totalSales) * 100).toFixed(1) : 0}%
            </div>
          </div>
        </div>
      </div>

      {/* 销售排行 - 按商品分类动态显示 */}
      <div style={{ marginBottom: '1.5rem' }}>
        <h3 style={{ fontSize: '1.125rem', fontWeight: '600', color: '#1f2937', marginBottom: '1rem' }}>📊 销售排行榜</h3>

        {Object.keys(salesRankings).length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#9ca3af', backgroundColor: 'white', borderRadius: '0.5rem' }}>
            暂无销售数据
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '1rem' }}>
            {Object.entries(salesRankings).map(([category, rankings]) => (
              <div key={category} style={styles.card}>
                <div style={styles.cardTitle}>
                  🏆 {category} TOP 10
                </div>
                {rankings.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '2rem', color: '#9ca3af' }}>暂无数据</div>
                ) : (
                  <ul style={styles.rankingList}>
                    {rankings.map((item: SalesRanking, index: number) => (
                      <li key={index} style={styles.rankingItem(index)}>
                        <div style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
                          <span style={styles.rankBadge(index)}>{index + 1}</span>
                          <div>
                            <div style={{ fontWeight: '600', color: '#1f2937' }}>{item.name}</div>
                            <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>销量: {item.quantity}</div>
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontWeight: 'bold', color: '#3b82f6' }}>C$ {item.revenue.toFixed(2)}</div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 销售趋势 */}
      {salesTrend.length > 0 && (
        <div style={styles.card}>
          <div style={styles.cardTitle}>📈 销售趋势分析</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>日期</th>
                  <th style={{ ...styles.th, textAlign: 'right' }}>营业额</th>
                  <th style={{ ...styles.th, textAlign: 'right' }}>订单数</th>
                  <th style={{ ...styles.th, textAlign: 'right' }}>堂食</th>
                  <th style={{ ...styles.th, textAlign: 'right' }}>外卖</th>
                  <th style={{ ...styles.th, textAlign: 'right' }}>利润</th>
                  <th style={{ ...styles.th, textAlign: 'right' }}>利润率</th>
                </tr>
              </thead>
              <tbody>
                {salesTrend.map((day, index) => {
                  const profitMargin = day.sales > 0 ? (day.profit / day.sales * 100) : 0;
                  return (
                    <tr key={index}>
                      <td style={styles.td}>{day.date}</td>
                      <td style={{ ...styles.td, textAlign: 'right', fontWeight: '600' }}>C$ {day.sales.toFixed(2)}</td>
                      <td style={{ ...styles.td, textAlign: 'right' }}>{day.orders}</td>
                      <td style={{ ...styles.td, textAlign: 'right', color: '#f59e0b' }}>C$ {day.dineInSales.toFixed(2)}</td>
                      <td style={{ ...styles.td, textAlign: 'right', color: '#ef4444' }}>C$ {day.takeoutSales.toFixed(2)}</td>
                      <td style={{ ...styles.td, textAlign: 'right', fontWeight: 'bold', color: day.profit >= 0 ? '#10b981' : '#ef4444' }}>
                        C$ {day.profit.toFixed(2)}
                      </td>
                      <td style={{ ...styles.td, textAlign: 'right', fontWeight: '600', color: profitMargin >= 0 ? '#10b981' : '#ef4444' }}>
                        {profitMargin.toFixed(1)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 客户画像 */}
      <div style={styles.grid2}>
        <div style={styles.card}>
          <div style={styles.cardTitle}>👥 客户构成</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
            <div style={{ textAlign: 'center', padding: '1.5rem', background: 'linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%)', borderRadius: '0.75rem' }}>
              <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: '#3b82f6' }}>{customerProfile.newCustomers}</div>
              <div style={{ fontSize: '0.875rem', color: '#1e40af', marginTop: '0.5rem', fontWeight: '600' }}>新客户</div>
              <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>占比 {customerProfile.newCustomerRate.toFixed(1)}%</div>
            </div>
            <div style={{ textAlign: 'center', padding: '1.5rem', background: 'linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%)', borderRadius: '0.75rem' }}>
              <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: '#10b981' }}>{customerProfile.returningCustomers}</div>
              <div style={{ fontSize: '0.875rem', color: '#065f46', marginTop: '0.5rem', fontWeight: '600' }}>老客户</div>
              <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>占比 {(100 - customerProfile.newCustomerRate).toFixed(1)}%</div>
            </div>
          </div>
          <div style={{ borderTop: '2px solid #f3f4f6', paddingTop: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
              <span style={{ color: '#6b7280' }}>总客户数</span>
              <span style={{ fontWeight: '700', fontSize: '1.125rem' }}>{customerProfile.totalCustomers}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#6b7280' }}>平均消费频次</span>
              <span style={{ fontWeight: '700', fontSize: '1.125rem', color: '#8b5cf6' }}>{customerProfile.avgOrderFrequency.toFixed(1)} 次</span>
            </div>
          </div>
        </div>

        <div style={styles.card}>
          <div style={styles.cardTitle}>⏰ 营业高峰 TOP 5</div>
          {customerProfile.peakHours.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#9ca3af' }}>暂无数据</div>
          ) : (
            <ul style={styles.rankingList}>
              {customerProfile.peakHours.map((slot, index) => (
                <li key={index} style={styles.rankingItem(index)}>
                  <div style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
                    <span style={styles.rankBadge(index)}>{index + 1}</span>
                    <div>
                      <div style={{ fontWeight: '600', color: '#1f2937' }}>
                        {String(slot.hour).padStart(2, '0')}:00 - {String(slot.hour + 1).padStart(2, '0')}:00
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>{slot.orderCount} 笔订单</div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 'bold', color: '#f59e0b' }}>C$ {slot.revenue.toFixed(2)}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* 品类偏好 & VIP客户 */}
      <div style={styles.grid2}>
        <div style={styles.card}>
          <div style={styles.cardTitle}>🍽️ 品类偏好</div>
          {customerProfile.categoryPreference.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#9ca3af' }}>暂无数据</div>
          ) : (
            <div>
              {customerProfile.categoryPreference.map((cat, index) => (
                <div key={index} style={{ marginBottom: index < customerProfile.categoryPreference.length - 1 ? '1.25rem' : 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                    <span style={{ fontWeight: '600', color: '#1f2937' }}>{cat.category}</span>
                    <span style={{ color: '#6b7280', fontSize: '0.875rem' }}>{cat.orderCount}单 / {cat.percentage.toFixed(1)}%</span>
                  </div>
                  <div style={{ height: '10px', background: '#e5e7eb', borderRadius: '5px', overflow: 'hidden' }}>
                    <div style={styles.progressFill(cat.percentage, ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444'][index % 5])} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={styles.card}>
          <div style={styles.cardTitle}>⭐ VIP客户 TOP 10</div>
          {customerProfile.topCustomers.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#9ca3af' }}>暂无数据</div>
          ) : (
            <ul style={styles.rankingList}>
              {customerProfile.topCustomers.map((customer, index) => (
                <li key={index} style={styles.rankingItem(index)}>
                  <div style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
                    <span style={styles.rankBadge(index)}>{index + 1}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: '600', color: '#1f2937' }}>{customer.phone || '散客'}</div>
                      <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
                        {customer.orderCount}次 · 最爱: {customer.favoriteDish || '-'}
                      </div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 'bold', color: '#f59e0b' }}>C$ {customer.totalSpent.toFixed(2)}</div>
                    <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>{new Date(customer.lastVisit).toLocaleDateString('zh-CN')}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      </div>
    </div>
  );
};

export default DashboardModule;
