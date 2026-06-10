import React, { useState, useEffect } from 'react';
import { dataManager } from '../../services/dataManager';
import { toTimestampMillis } from '../../utils/localTime';
import { getLocalDateString } from '../../utils/exchangeRate'; // 🔥 导入本地日期工具

interface DailyReport {
  date: string;
  totalSales: number;
  orderCount: number;
  cashPayment: number;
  cardPayment: number;
  purchaseAmount: number;
  expenseAmount: number;
  profit: number;
  handoverAmount?: number;
  difference?: number;
}

interface FinancialReportsModuleProps {
  orders?: any[]; // 从父组件传入订单数据
}

const getRecordDateString = (value: any): string => {
  if (!value) return '';
  const timestamp = toTimestampMillis(value);
  return timestamp ? getLocalDateString(new Date(timestamp)) : '';
};

const isPurchaseRelatedExpense = (expense: any): boolean => {
  return expense?.relatedType === 'purchase' ||
    expense?.categoryId === 'supplier_payment' ||
    (typeof expense?.id === 'string' && expense.id.startsWith('purchase_'));
};

const FinancialReportsModule: React.FC<FinancialReportsModuleProps> = ({ orders: propOrders }) => {
  // 🔄 使用统一数据管理服务
  const [orders, setOrders] = useState<any[]>(() => {
    return propOrders || dataManager.getData('orders');
  });

  const [reportType, setReportType] = useState<'daily' | 'weekly' | 'monthly' | 'custom'>('daily');
  const [selectedDate, setSelectedDate] = useState(getLocalDateString()); // 🔥 使用本地时间
  const [startDate, setStartDate] = useState(getLocalDateString(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))); // 🔥 使用本地时间
  const [endDate, setEndDate] = useState(getLocalDateString()); // 🔥 使用本地时间
  const [dailyReports, setDailyReports] = useState<DailyReport[]>([]);
  const loading = false;
  const [dataVersion, setDataVersion] = useState(0);

  // 🔄 实时监听数据变化
  useEffect(() => {
    console.log('📊 财务报表 - 初始化数据监听');

    // 监听订单变化
    const unsubscribeOrders = dataManager.subscribe('orders', (newOrders) => {
      console.log('🔄 财务报表：订单数据已更新', newOrders.length, '条');
      setOrders(newOrders);
      setDataVersion(version => version + 1);
    });

    // 监听开支变化
    const unsubscribeExpenses = dataManager.subscribe('expenses', () => {
      console.log('🔄 财务报表：开支数据已更新');
      setDataVersion(version => version + 1);
    });

    // 监听采购变化
    const unsubscribePurchases = dataManager.subscribe('purchases', () => {
      console.log('🔄 财务报表：采购数据已更新');
      setDataVersion(version => version + 1);
    });

    const handleDataSynced = () => {
      dataManager.clearCache();
      setOrders(dataManager.getData('orders'));
      setDataVersion(version => version + 1);
    };
    window.addEventListener('dataSynced', handleDataSynced);

    // 组件卸载时取消订阅
    return () => {
      unsubscribeOrders();
      unsubscribeExpenses();
      unsubscribePurchases();
      window.removeEventListener('dataSynced', handleDataSynced);
    };
  }, []);

  // 生成日报表
  const generateDailyReport = React.useCallback((date: string): DailyReport => {
    console.log('📊 生成报表:', date, '订单数:', orders.length);

    const dayOrders = orders.filter((order: any) => {
      const orderDate = order.date || order.createdAt;
      if (!orderDate) return false;

      const orderDateStr = getRecordDateString(orderDate);

      return orderDateStr === date;
    });

    console.log(`  - ${date} 的订单数:`, dayOrders.length);

    const totalSales = dayOrders.reduce((sum: number, order: any) => sum + (order.totalAmount || 0), 0);
    const orderCount = dayOrders.length;

    // 🔄 正确计算现金和刷卡收入
    let cashPayment = 0;
    let cardPayment = 0;

    dayOrders.forEach((order: any) => {
      const totalAmount = order.totalAmount || 0;
      const paymentMethod = order.paymentMethod;
      const orderCashAmount = order.cashAmount;
      const orderCardAmount = order.cardAmount;

      if (paymentMethod === 'cash') {
        // 纯现金支付：使用订单总额（不是实际收到的现金）
        cashPayment += totalAmount;
      } else if (paymentMethod === 'card') {
        // 纯刷卡支付：使用订单总额
        cardPayment += totalAmount;
      } else if (paymentMethod === 'mixed') {
        // 混合支付：分别累加现金和刷卡部分
        cashPayment += (orderCashAmount !== undefined && orderCashAmount !== null) ? orderCashAmount : 0;
        cardPayment += (orderCardAmount !== undefined && orderCardAmount !== null) ? orderCardAmount : 0;
      }
    });

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

    // 🔄 使用统一数据管理服务读取采购和开支数据
    const purchases = dataManager.getData('purchases');
    console.log('  - 采购记录数:', purchases.length);

    const purchaseAmount = purchases.reduce((sum: number, purchase: any) => {
      const purchaseDate = getRecordDateString(purchase.orderDate || purchase.receivedDate || purchase.date || purchase.createdAt);
      if (purchaseDate === date) {
        return sum + (purchase.totalAmount || 0);
      }
      return sum;
    }, 0);

    // 读取开支数据
    const expenses = dataManager.getData('expenses');
    console.log('  - 开支记录数:', expenses.length);

    const expenseAmount = expenses.reduce((sum: number, exp: any) => {
      if (isPurchaseRelatedExpense(exp)) {
        return sum;
      }
      if (exp.date === date) {
        return sum + (exp.amount || 0);
      }
      return sum;
    }, 0);

    // 读取交班记录
    const savedHandovers = localStorage.getItem('rest_v6_final');
    const handovers = savedHandovers ? JSON.parse(savedHandovers) : [];
    const dayHandover = handovers.find((h: any) => h.t && h.t.startsWith(date));
    const handoverAmount = dayHandover ? parseFloat(dayHandover.rawG) : undefined;
    const difference = handoverAmount !== undefined ? handoverAmount - cashPayment : undefined;

    // 计算利润
    // 注意：这里的利润是简化计算，使用当天的采购总额作为成本
    // 更精确的计算需要追踪每个订单中商品的实际成本
    // 允许负数利润（例如：大量采购但销售较少时）
    const profit = totalSales - purchaseAmount - expenseAmount;


    return {
      date,
      totalSales,
      orderCount,
      cashPayment,
      cardPayment,
      purchaseAmount,
      expenseAmount,
      profit,
      handoverAmount,
      difference
    };
  }, [orders]);

  // 加载报表数据
  const loadReports = React.useCallback(() => {
    if (reportType === 'daily') {
      setDailyReports([generateDailyReport(selectedDate)]);
    } else if (reportType === 'weekly' || reportType === 'monthly' || reportType === 'custom') {
      const reports: DailyReport[] = [];
      const start = new Date(reportType === 'custom' ? startDate :
        reportType === 'weekly' ? Date.now() - 7 * 24 * 60 * 60 * 1000 :
        Date.now() - 30 * 24 * 60 * 60 * 1000);
      const end = new Date(reportType === 'custom' ? endDate : Date.now());

      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dateStr = getLocalDateString(d); // 🔥 使用本地时间
        reports.push(generateDailyReport(dateStr));
      }
      setDailyReports(reports);
    }
  }, [reportType, selectedDate, startDate, endDate, generateDailyReport]);

  useEffect(() => {
    loadReports();
  }, [loadReports, dataVersion]);

  // 调试信息：显示当前数据状态
  useEffect(() => {
    console.log('📊 财务报表 - 数据状态:', {
      订单总数: orders.length,
      采购记录: dataManager.getData('purchases').length,
      开支记录: dataManager.getData('expenses').length,
      localStorage订单: localStorage.getItem('pos_orders') ? JSON.parse(localStorage.getItem('pos_orders')!).length : 0
    });
  }, [orders]);

  // 计算汇总
  const summary = dailyReports.reduce((acc, report) => ({
    totalSales: acc.totalSales + report.totalSales,
    orderCount: acc.orderCount + report.orderCount,
    cashPayment: acc.cashPayment + report.cashPayment,
    cardPayment: acc.cardPayment + report.cardPayment,
    purchaseAmount: acc.purchaseAmount + report.purchaseAmount,
    expenseAmount: acc.expenseAmount + report.expenseAmount,
    profit: acc.profit + report.profit
  }), { totalSales: 0, orderCount: 0, cashPayment: 0, cardPayment: 0, purchaseAmount: 0, expenseAmount: 0, profit: 0 });

  const styles = {
    container: {
      display: 'flex',
      flexDirection: 'column' as const,
      height: '100%',
      padding: '1.5rem',
      background: '#f3f4f6',
    },
    header: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: '1.5rem',
      flexShrink: 0 as const,
    },
    title: {
      fontSize: '1.75rem',
      fontWeight: 'bold',
      color: '#1f2937',
      margin: 0,
    },
    controls: {
      display: 'flex',
      gap: '0.75rem',
      alignItems: 'center',
      flexWrap: 'wrap' as const,
    },
    btn: (bg: string, color: string) => ({
      padding: '0.5rem 1rem',
      background: bg,
      color: color,
      border: 'none',
      borderRadius: '0.375rem',
      cursor: 'pointer',
      fontWeight: '600',
      fontSize: '0.875rem',
    }),
    select: {
      padding: '0.5rem',
      border: '1px solid #d1d5db',
      borderRadius: '0.375rem',
      fontSize: '0.875rem',
    },
    input: {
      padding: '0.5rem',
      border: '1px solid #d1d5db',
      borderRadius: '0.375rem',
      fontSize: '0.875rem',
    },
    statsGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
      gap: '1rem',
      marginBottom: '1.5rem',
    },
    statCard: (bg: string, color: string) => ({
      background: 'white',
      borderRadius: '0.75rem',
      padding: '1.25rem',
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      borderLeft: `4px solid ${color}`,
    }),
    statLabel: {
      fontSize: '0.875rem',
      color: '#6b7280',
      marginBottom: '0.5rem',
    },
    statValue: (color: string) => ({
      fontSize: '1.5rem',
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
      borderRadius: '0.75rem',
      padding: '1.5rem',
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      marginBottom: '1.5rem',
    },
    cardTitle: {
      fontSize: '1.125rem',
      fontWeight: '600',
      color: '#1f2937',
      marginBottom: '1rem',
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
      background: '#f9fafb',
      padding: '0.75rem',
      textAlign: 'left' as const,
      fontSize: '0.75rem',
      fontWeight: '600',
      color: '#6b7280',
      borderBottom: '2px solid #e5e7eb',
    },
    td: {
      padding: '0.75rem',
      borderBottom: '1px solid #e5e7eb',
    },
    printBtn: {
      position: 'fixed' as const,
      bottom: '2rem',
      right: '2rem',
      padding: '1rem 2rem',
      background: '#3b82f6',
      color: 'white',
      border: 'none',
      borderRadius: '0.5rem',
      cursor: 'pointer',
      fontWeight: '600',
      fontSize: '1rem',
      boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
      zIndex: 1000,
    },
  };

  // 打印功能
  const handlePrint = () => {
    window.print();
  };

  return (
    <div style={styles.container}>
      {/* 头部 */}
      <div style={styles.header}>
        <h1 style={styles.title}>📈 财务报表</h1>
        <div style={styles.controls}>
          <select
            value={reportType}
            onChange={(e) => setReportType(e.target.value as any)}
            style={styles.select}
          >
            <option value="daily">日报表</option>
            <option value="weekly">周报表</option>
            <option value="monthly">月报表</option>
            <option value="custom">自定义</option>
          </select>

          {reportType === 'daily' && (
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              style={styles.input}
            />
          )}

          {reportType === 'custom' && (
            <>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                style={styles.input}
              />
              <span>至</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                style={styles.input}
              />
            </>
          )}

          <button onClick={loadReports} style={styles.btn('#3b82f6', 'white')}>
            🔄 刷新
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>
          加载中...
        </div>
      ) : (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {/* 统计卡片 */}
          <div style={styles.statsGrid}>
            <div style={styles.statCard('#3b82f6', '#3b82f6')}>
              <div style={styles.statLabel}>💰 总营业额</div>
              <div style={styles.statValue('#3b82f6')}>C$ {summary.totalSales.toFixed(2)}</div>
              <div style={styles.statSub}>{summary.orderCount} 笔订单</div>
            </div>

            <div style={styles.statCard('#10b981', '#10b981')}>
              <div style={styles.statLabel}>💵 现金收入</div>
              <div style={styles.statValue('#10b981')}>C$ {summary.cashPayment.toFixed(2)}</div>
              <div style={styles.statSub}>占比 {summary.totalSales > 0 ? ((summary.cashPayment / summary.totalSales) * 100).toFixed(1) : 0}%</div>
            </div>

            <div style={styles.statCard('#8b5cf6', '#8b5cf6')}>
              <div style={styles.statLabel}>💳 刷卡收入</div>
              <div style={styles.statValue('#8b5cf6')}>C$ {summary.cardPayment.toFixed(2)}</div>
              <div style={styles.statSub}>占比 {summary.totalSales > 0 ? ((summary.cardPayment / summary.totalSales) * 100).toFixed(1) : 0}%</div>
            </div>

            <div style={styles.statCard('#f59e0b', '#f59e0b')}>
              <div style={styles.statLabel}>📦 采购支出</div>
              <div style={styles.statValue('#f59e0b')}>C$ {summary.purchaseAmount.toFixed(2)}</div>
              <div style={styles.statSub}>库存补充</div>
            </div>

            <div style={styles.statCard('#ef4444', '#ef4444')}>
              <div style={styles.statLabel}>📝 日常开支</div>
              <div style={styles.statValue('#ef4444')}>C$ {summary.expenseAmount.toFixed(2)}</div>
              <div style={styles.statSub}>运营支出</div>
            </div>

            <div style={styles.statCard(summary.profit >= 0 ? '#10b981' : '#ef4444', summary.profit >= 0 ? '#10b981' : '#ef4444')}>
              <div style={styles.statLabel}>📊 净利润</div>
              <div style={styles.statValue(summary.profit >= 0 ? '#10b981' : '#ef4444')}>
                C$ {summary.profit.toFixed(2)}
              </div>
              <div style={styles.statSub}>利润率 {summary.totalSales > 0 ? ((summary.profit / summary.totalSales) * 100).toFixed(1) : 0}%</div>
            </div>
          </div>

          {/* 明细表格 */}
          <div style={styles.card}>
            <div style={styles.cardTitle}>📋 报表明细</div>
            {dailyReports.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem', color: '#9ca3af' }}>
                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📭</div>
                <div>暂无数据</div>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>日期</th>
                      <th style={{ ...styles.th, textAlign: 'right' }}>营业额</th>
                      <th style={{ ...styles.th, textAlign: 'right' }}>订单数</th>
                      <th style={{ ...styles.th, textAlign: 'right' }}>现金</th>
                      <th style={{ ...styles.th, textAlign: 'right' }}>刷卡</th>
                      <th style={{ ...styles.th, textAlign: 'right' }}>采购</th>
                      <th style={{ ...styles.th, textAlign: 'right' }}>开支</th>
                      <th style={{ ...styles.th, textAlign: 'right' }}>利润</th>
                      <th style={{ ...styles.th, textAlign: 'right' }}>实交</th>
                      <th style={{ ...styles.th, textAlign: 'right' }}>误差</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dailyReports.map((report, index) => (
                      <tr key={index}>
                        <td style={styles.td}>{report.date}</td>
                        <td style={{ ...styles.td, textAlign: 'right', fontWeight: '600' }}>
                          C$ {report.totalSales.toFixed(2)}
                        </td>
                        <td style={{ ...styles.td, textAlign: 'right' }}>{report.orderCount}</td>
                        <td style={{ ...styles.td, textAlign: 'right', color: '#10b981' }}>
                          C$ {report.cashPayment.toFixed(2)}
                        </td>
                        <td style={{ ...styles.td, textAlign: 'right', color: '#8b5cf6' }}>
                          C$ {report.cardPayment.toFixed(2)}
                        </td>
                        <td style={{ ...styles.td, textAlign: 'right', color: '#f59e0b' }}>
                          C$ {report.purchaseAmount.toFixed(2)}
                        </td>
                        <td style={{ ...styles.td, textAlign: 'right', color: '#ef4444' }}>
                          C$ {report.expenseAmount.toFixed(2)}
                        </td>
                        <td style={{
                          ...styles.td,
                          textAlign: 'right',
                          fontWeight: 'bold',
                          color: report.profit >= 0 ? '#10b981' : '#ef4444'
                        }}>
                          C$ {report.profit.toFixed(2)}
                        </td>
                        <td style={{ ...styles.td, textAlign: 'right' }}>
                          {report.handoverAmount !== undefined ? `C$ ${report.handoverAmount.toFixed(2)}` : '-'}
                        </td>
                        <td style={{
                          ...styles.td,
                          textAlign: 'right',
                          fontWeight: '600',
                          color: report.difference === 0 ? '#10b981' :
                                 report.difference! > 0 ? '#f59e0b' : '#ef4444'
                        }}>
                          {report.difference !== undefined ?
                            (report.difference > 0 ? '+' : '') + `C$ ${report.difference.toFixed(2)}` :
                            '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* 打印按钮 */}
          <button onClick={handlePrint} style={styles.printBtn}>
            🖨️ 打印报表
          </button>
        </div>
      )}

      {/* 打印样式 */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          ${styles.container}, ${styles.container} * {
            visibility: visible;
          }
          ${styles.container} {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            padding: 20mm;
            background: white;
          }
          button {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
};

export default FinancialReportsModule;
