import React, { useState, useEffect } from 'react';
import { dataManager } from '../../services/dataManager';
import { smartGetDocuments } from '../../services/smartSyncService';
import { formatNicaraguaDate, formatNicaraguaDateTime, formatNicaraguaTime, toTimestampMillis } from '../../utils/localTime';
import { getLocalDateString } from '../../utils/exchangeRate'; // 🔥 导入本地日期工具

const OrderHistoryPage: React.FC = () => {
  const getOrderTimestamp = (order: any): number => {
    const value = order.createdAt || order.date || order.orderDate || order.completedAt || order.updatedAt;
    return getTimestampFromValue(value);
  };

  const getTimestampFromValue = (value: any): number => {
    return toTimestampMillis(value);
  };

  const getOrderDateKey = (order: any): string => {
    const timestamp = getOrderTimestamp(order);
    return timestamp ? getLocalDateString(new Date(timestamp)) : '';
  };

  const getOrderDisplayDate = (order: any): string => {
    const timestamp = getOrderTimestamp(order);
    return timestamp ? formatNicaraguaDate(timestamp) : '未知日期';
  };

  // ✅ 使用 DataManager 获取订单数据
  const [allOrders, setAllOrders] = useState<any[]>(() => dataManager.getData('orders'));
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);

  const refreshOrderHistoryData = React.useCallback(async () => {
    setIsRefreshing(true);
    try {
      const cloudOrders = await smartGetDocuments('pos_orders', true);
      await dataManager.saveData('orders', cloudOrders, { syncFirestore: false, notify: false });
      dataManager.clearCache('orders');
      setAllOrders(cloudOrders);
      setLastSyncedAt(new Date());
    } catch (error) {
      console.error('\u5237\u65b0\u5386\u53f2\u8ba2\u5355\u5931\u8d25:', error);
      alert('\u5237\u65b0\u5386\u53f2\u8ba2\u5355\u5931\u8d25\uff0c\u8bf7\u68c0\u67e5\u7f51\u7edc\u540e\u91cd\u8bd5');
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    refreshOrderHistoryData();
  }, [refreshOrderHistoryData]);

  const calculateStageDurations = (order: any) => {
    const durations: any = {};
    const createdAt = getTimestampFromValue(order.createdAt);
    const servedAt = getTimestampFromValue(order.servedAt);
    const completedAt = getTimestampFromValue(order.completedAt);
    
    if (createdAt && servedAt) {
      const prepTime = Math.floor((servedAt - createdAt) / 60000);
      durations.prepTime = prepTime;
    }
    
    if (servedAt && completedAt) {
      const payTime = Math.floor((completedAt - servedAt) / 60000);
      durations.payTime = payTime;
    }
    
    if (createdAt && completedAt) {
      const totalTime = Math.floor((completedAt - createdAt) / 60000);
      durations.totalTime = totalTime;
    }
    
    return durations;
  };
  
  // 格式化时间显示
  const formatTime = (dateStr: string) => {
    const timestamp = getTimestampFromValue(dateStr);
    if (!timestamp) return '--:--';
    return formatNicaraguaTime(timestamp);
  };
  
  // 订单搜索和过滤状态
  const [searchKeyword, setSearchKeyword] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterOrderType, setFilterOrderType] = useState<string>('all');
  const [filterDate, setFilterDate] = useState<string>('today');
  const [startDate, setStartDate] = useState<string>(() => getLocalDateString());
  const [endDate, setEndDate] = useState<string>(() => getLocalDateString());
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  
  // 处理日期范围选择
  const handleDateRangeChange = (range: string) => {
    setFilterDate(range);
    if (range === 'custom') {
      // 自定义范围时不自动设置日期
    } else {
      const today = new Date();
      let start = new Date();
      
      switch (range) {
        case 'today':
          start = today;
          break;
        case 'yesterday':
          start = new Date(today);
          start.setDate(today.getDate() - 1);
          break;
        case 'week':
          start = new Date(today);
          start.setDate(today.getDate() - 7);
          break;
        case 'month':
          start = new Date(today);
          start.setMonth(today.getMonth() - 1);
          break;
      }
      
      setStartDate(getLocalDateString(start)); // 🔥 使用本地时间
      setEndDate(getLocalDateString(today)); // 🔥 使用本地时间
    }
  };
  
  // 过滤订单
  const filteredOrders = allOrders.filter((order: any) => {
    // 关键词搜索（订单号、桌台号）
    if (searchKeyword) {
      const keyword = searchKeyword.toLowerCase();
      const matchOrderNumber = order.orderNumber?.toLowerCase().includes(keyword);
      const matchTableNumber = order.tableNumber?.toLowerCase().includes(keyword);
      if (!matchOrderNumber && !matchTableNumber) {
        return false;
      }
    }
    
    // 状态过滤
    if (filterStatus !== 'all' && order.status !== filterStatus) {
      return false;
    }
    
    // 订单类型过滤
    if (filterOrderType !== 'all') {
      const orderType = order.orderType || 'dine_in';
      if (orderType !== filterOrderType) {
        return false;
      }
    }
    
    // 日期过滤
    if (startDate && endDate) {
      const orderDateKey = getOrderDateKey(order);
      if (!orderDateKey) return false;
      const orderDate = new Date(orderDateKey);
      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999); // 包含当天全天
      
      if (orderDate < start || orderDate > end) {
        return false;
      }
    }
    
    return true;
  });
  
  // 按日期分组订单
  const sortedOrders = [...filteredOrders].sort((a, b) => getOrderTimestamp(b) - getOrderTimestamp(a));

  const groupedOrders = sortedOrders.reduce((groups: any, order: any) => {
    const date = getOrderDisplayDate(order);
    if (!groups[date]) {
      groups[date] = [];
    }
    groups[date].push(order);
    return groups;
  }, {});
  
  // 查看订单详情
  const handleViewOrderDetail = (order: any) => {
    setSelectedOrder(order);
    setShowDetailModal(true);
  };
  
  // 导出订单数据
  const handleExportOrders = () => {
    const csvContent = "data:text/csv;charset=utf-8," 
      + "订单号,桌台号,状态,总金额,创建时间\n"
      + sortedOrders.map((order: any) => 
          `${order.orderNumber},${order.tableNumber},${order.status},${order.totalAmount},${formatNicaraguaDateTime(getOrderTimestamp(order))}`
        ).join("\n");
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `orders_${getLocalDateString()}.csv`); // 🔥 使用本地时间
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // 打印订单列表
  const handlePrintOrders = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('请允许弹出窗口以进行打印');
      return;
    }

    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>历史订单 - ${new Date().toLocaleDateString('zh-CN')}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; }
          h1 { text-align: center; color: #1f2937; margin-bottom: 10px; }
          .info { text-align: center; color: #6b7280; margin-bottom: 20px; font-size: 14px; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th { background: #f9fafb; padding: 10px; text-align: left; font-size: 12px; font-weight: 600; color: #6b7280; border-bottom: 2px solid #e5e7eb; }
          td { padding: 10px; border-bottom: 1px solid #e5e7eb; font-size: 13px; }
          .date-header { background: #f9fafb; font-weight: 600; color: #6b7280; font-size: 12px; }
          .total { text-align: right; margin-top: 20px; font-size: 16px; font-weight: bold; color: #dc2626; }
          @media print {
            body { padding: 10px; }
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <h1>📜 历史订单</h1>
        <div class="info">
          打印时间: ${formatNicaraguaDateTime(new Date())} | 
          共 ${filteredOrders.length} 个订单 | 
          总金额: C$ ${filteredOrders.reduce((sum: number, order: any) => sum + (order.totalAmount || 0), 0).toFixed(2)}
        </div>
        <table>
          <thead>
            <tr>
              <th>订单号</th>
              <th>桌台</th>
              <th>类型</th>
              <th>状态</th>
              <th style="text-align: right;">金额</th>
              <th style="text-align: center;">商品数</th>
              <th>创建时间</th>
            </tr>
          </thead>
          <tbody>
            ${Object.entries(groupedOrders).map(([date, orders]: [string, any]) => `
              <tr class="date-header">
                <td colspan="7">${date} - 共 ${orders.length} 个订单</td>
              </tr>
              ${orders.map((order: any) => {
                const orderType = order.orderType || 'dine_in';
                const typeLabels: any = { 'dine_in': '堂食', 'takeout': '打包', 'delivery': '外卖' };
                const statusLabels: any = { completed: '已完成', cancelled: '已取消', draft: '草稿', confirmed: '已确认', preparing: '制作中', served: '已上菜' };
                return `
                  <tr>
                    <td>${order.orderNumber || order.id}</td>
                    <td>${order.tableNumber}</td>
                    <td>${typeLabels[orderType] || orderType}</td>
                    <td>${statusLabels[order.status] || order.status}</td>
                    <td style="text-align: right;">C$ ${(order.totalAmount || 0).toFixed(2)}</td>
                    <td style="text-align: center;">${order.items?.length || 0}</td>
                    <td>${formatNicaraguaDateTime(getOrderTimestamp(order))}</td>
                  </tr>
                `;
              }).join('')}
            `).join('')}
          </tbody>
        </table>
        <div class="total">
          总计: C$ ${filteredOrders.reduce((sum: number, order: any) => sum + (order.totalAmount || 0), 0).toFixed(2)}
        </div>
        <div class="no-print" style="text-align: center; margin-top: 30px;">
          <button onclick="window.print()" style="padding: 10px 20px; background: #3b82f6; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 14px;">
            🖨️ 点击打印
          </button>
        </div>
      </body>
      </html>
    `;

    printWindow.document.write(printContent);
    printWindow.document.close();
  };

  const styles = {
    container: {
      display: 'flex',
      flexDirection: 'column' as const,
      height: '100%',
      padding: '1.5rem',
      background: '#f5f7fa',
    },
    header: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: '1rem',
      flexShrink: 0 as const,
    },
    title: {
      fontSize: '1.5rem',
      fontWeight: 'bold',
      color: '#1f2937',
      margin: 0,
    },
    statsCard: {
      background: 'white',
      borderRadius: '0.5rem',
      padding: '1rem',
      marginBottom: '1rem',
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
      gap: '1rem',
      flexShrink: 0 as const,
    },
    statItem: {
      textAlign: 'center' as const,
      padding: '0.75rem',
      borderRadius: '0.5rem',
    },
    toolbar: {
      display: 'flex',
      gap: '0.5rem',
      marginBottom: '1rem',
      flexWrap: 'wrap' as const,
      flexShrink: 0 as const,
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
    card: {
      background: 'white',
      borderRadius: '0.5rem',
      padding: '1.5rem',
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      flex: 1,
      display: 'flex',
      flexDirection: 'column' as const,
      overflow: 'hidden',
    },
    tableScroll: {
      flex: 1,
      overflowY: 'auto' as const,
      marginTop: '1rem',
    },
    table: {
      width: '100%',
      borderCollapse: 'collapse' as const,
    },
    th: {
      background: '#f9fafb',
      padding: '0.75rem',
      textAlign: 'left' as const,
      fontSize: '0.75rem',
      fontWeight: '600',
      color: '#6b7280',
      borderBottom: '2px solid #e5e7eb',
      position: 'sticky' as const,
      top: 0,
      zIndex: 10,
    },
    td: {
      padding: '0.75rem',
      borderBottom: '1px solid #e5e7eb',
      fontSize: '0.875rem',
    },
    statusTag: (status: string) => {
      const colors: any = {
        completed: { bg: '#d1fae5', color: '#065f46' },
        cancelled: { bg: '#fee2e2', color: '#991b1b' },
        draft: { bg: '#fef3c7', color: '#92400e' },
        confirmed: { bg: '#dbeafe', color: '#1e40af' },
        preparing: { bg: '#e0e7ff', color: '#3730a3' },
        served: { bg: '#fce7f3', color: '#9d174d' },
      };
      const style = colors[status] || { bg: '#f3f4f6', color: '#374151' };
      return {
        display: 'inline-block',
        padding: '0.25rem 0.5rem',
        borderRadius: '9999px',
        fontSize: '0.75rem',
        fontWeight: '600',
        background: style.bg,
        color: style.color,
      };
    },
    orderTypeTag: (type: string) => {
      const types: any = {
        'dine-in': { icon: '🍽️', label: '堂食', bg: '#dbeafe', color: '#1e40af' },
        'takeout': { icon: '🥡', label: '外卖', bg: '#fef3c7', color: '#92400e' },
        'delivery': { icon: '🚚', label: '配送', bg: '#d1fae5', color: '#065f46' },
      };
      const style = types[type] || { icon: '📋', label: type, bg: '#f3f4f6', color: '#374151' };
      return {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.25rem',
        padding: '0.25rem 0.5rem',
        borderRadius: '9999px',
        fontSize: '0.75rem',
        fontWeight: '600',
        background: style.bg,
        color: style.color,
      };
    },
    modal: {
      position: 'fixed' as const,
      inset: 0,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 50,
    },
    modalContent: {
      background: 'white',
      borderRadius: '0.5rem',
      maxWidth: '32rem',
      width: '100%',
      maxHeight: '80vh',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column' as const,
      margin: '1rem',
    },
    modalHeader: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '1rem 1.5rem',
      borderBottom: '1px solid #e5e7eb',
      flexShrink: 0 as const,
    },
    modalBody: {
      padding: '1.5rem',
      overflowY: 'auto' as const,
      flex: 1,
    },
  };
  
  return (
    <div style={styles.container}>
      {/* 头部 */}
      <div style={styles.header}>
        <h1 style={styles.title}>📜 历史订单</h1>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {lastSyncedAt && (
            <span style={{ fontSize: '0.8rem', color: '#6b7280', whiteSpace: 'nowrap' }}>
              {'\u6700\u540e\u540c\u6b65 '} {lastSyncedAt.toLocaleTimeString('es-NI', { hour12: false })}
            </span>
          )}
          <button
            onClick={refreshOrderHistoryData}
            disabled={isRefreshing}
            style={{
              ...styles.btn(isRefreshing ? '#9ca3af' : '#6366f1', 'white'),
              cursor: isRefreshing ? 'not-allowed' : 'pointer',
            }}
          >
            {isRefreshing ? '\u540c\u6b65\u4e2d...' : '\u5237\u65b0\u4e91\u7aef\u6570\u636e'}
          </button>
          <button
            onClick={handlePrintOrders}
            style={styles.btn('#3b82f6', 'white')}
          >
            🖨️ 打印订单
          </button>
          <button
            onClick={handleExportOrders}
            style={styles.btn('#10b981', 'white')}
          >
            📥 导出Excel
          </button>
        </div>
      </div>

      {/* 统计卡片 */}
      <div style={styles.statsCard}>
        <div style={{ ...styles.statItem, background: '#dbeafe' }}>
          <div style={{ fontSize: '0.75rem', color: '#1e40af' }}>总订单数</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#1e40af' }}>
            {filteredOrders.length}
          </div>
        </div>
        <div style={{ ...styles.statItem, background: '#fef3c7' }}>
          <div style={{ fontSize: '0.75rem', color: '#92400e' }}>筛选后总计</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#92400e' }}>
            C$ {filteredOrders.reduce((sum: number, order: any) => sum + (order.totalAmount || 0), 0).toFixed(2)}
          </div>
        </div>
        <div style={{ ...styles.statItem, background: '#fce7f3' }}>
          <div style={{ fontSize: '0.75rem', color: '#9d174d' }}>今日订单</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#9d174d' }}>
            {allOrders.filter((o: any) => {
              const today = new Date().toDateString();
              const timestamp = getOrderTimestamp(o);
              return timestamp > 0 && new Date(timestamp).toDateString() === today;
            }).length}
          </div>
        </div>
      </div>

      {/* 筛选工具栏 */}
      <div style={styles.toolbar}>
        <input
          type="text"
          placeholder="🔍 搜索订单号或桌台号..."
          value={searchKeyword}
          onChange={(e) => setSearchKeyword(e.target.value)}
          style={{ ...styles.input, flex: 1, minWidth: '200px' }}
        />
        <select
          value={filterOrderType}
          onChange={(e) => setFilterOrderType(e.target.value)}
          style={styles.select}
        >
          <option value="all">📋 全部类型</option>
          <option value="dine_in">🍽️ 堂食</option>
          <option value="takeout">🥡 打包</option>
          <option value="delivery">🚚 外卖</option>
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          style={styles.select}
        >
          <option value="all">✅ 全部状态</option>
          <option value="completed">已完成</option>
          <option value="cancelled">已取消</option>
          <option value="draft">草稿</option>
          <option value="confirmed">已确认</option>
          <option value="preparing">制作中</option>
          <option value="served">已上菜</option>
        </select>
        <select
          value={filterDate}
          onChange={(e) => handleDateRangeChange(e.target.value)}
          style={styles.select}
        >
          <option value="today">📅 今天</option>
          <option value="yesterday">昨天</option>
          <option value="week">最近7天</option>
          <option value="month">最近30天</option>
          <option value="custom">自定义范围</option>
        </select>
      </div>

      {/* 自定义日期范围 */}
      {filterDate === 'custom' && (
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexShrink: 0 }}>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            style={styles.input}
          />
          <span style={{ lineHeight: '2rem' }}>至</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            style={styles.input}
          />
        </div>
      )}

      {/* 订单列表 */}
      <div style={styles.card}>
        {Object.keys(groupedOrders).length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#9ca3af' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📭</div>
            <div>暂无订单数据</div>
          </div>
        ) : (
          <div style={styles.tableScroll}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={{ ...styles.th, width: '120px' }}>订单号</th>
                  <th style={{ ...styles.th, width: '80px' }}>桌台</th>
                  <th style={{ ...styles.th, width: '90px' }}>类型</th>
                  <th style={{ ...styles.th, width: '90px' }}>状态</th>
                  <th style={{ ...styles.th, width: '100px', textAlign: 'right' }}>金额</th>
                  <th style={{ ...styles.th, width: '80px', textAlign: 'center' }}>商品数</th>
                  <th style={{ ...styles.th, width: '130px' }}>时间记录</th>
                  <th style={{ ...styles.th, width: '100px', textAlign: 'center' }}>总耗时</th>
                  <th style={{ ...styles.th, width: '90px', textAlign: 'center' }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(groupedOrders).map(([date, orders]: [string, any]) => (
                  <React.Fragment key={date}>
                    {/* 日期标题行 */}
                    <tr>
                      <td colSpan={9} style={{
                        ...styles.td,
                        background: '#f9fafb',
                        fontWeight: '600',
                        color: '#6b7280',
                        fontSize: '0.8rem',
                      }}>
                        {date} - 共 {orders.length} 个订单
                      </td>
                    </tr>
                    {/* 订单行 */}
                    {orders.map((order: any) => (
                      <tr
                        key={order.id}
                        style={{ cursor: 'pointer' }}
                        onClick={() => handleViewOrderDetail(order)}
                        onMouseEnter={(e) => {
                          (e.currentTarget as HTMLElement).style.background = '#f9fafb';
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLElement).style.background = '';
                        }}
                      >
                        <td style={{ ...styles.td, width: '150px', fontWeight: '600' }}>
                          {order.orderNumber || order.id}
                        </td>
                        <td style={{ ...styles.td, width: '100px' }}>{order.tableNumber}</td>
                        <td style={{ ...styles.td, width: '100px' }}>
                          <span style={styles.orderTypeTag(order.orderType || 'dine_in')}>
                            {(() => {
                              const type = order.orderType || 'dine_in';
                              const types: any = {
                                'dine_in': '🍽️ 堂食',
                                'takeout': '🥡 打包',
                                'delivery': '🚚 外卖',
                              };
                              return types[type] || '📋 ' + type;
                            })()}
                          </span>
                        </td>
                        <td style={{ ...styles.td, width: '100px' }}>
                          <span style={styles.statusTag(order.status)}>
                            {order.status === 'completed' ? '已完成' :
                             order.status === 'cancelled' ? '已取消' :
                             order.status === 'draft' ? '草稿' :
                             order.status === 'confirmed' ? '已确认' :
                             order.status === 'preparing' ? '制作中' :
                             order.status === 'served' ? '已上菜' : order.status}
                          </span>
                        </td>
                        <td style={{ ...styles.td, width: '120px', fontWeight: 'bold', color: '#dc2626', textAlign: 'right' }}>
                          C$ {(order.totalAmount || 0).toFixed(2)}
                        </td>
                        <td style={{ ...styles.td, width: '100px', textAlign: 'center' }}>
                          {order.items?.length || 0}
                        </td>
                        <td style={styles.td}>
                          {formatNicaraguaDateTime(getOrderTimestamp(order))}
                        </td>
                        <td style={{ ...styles.td, width: '130px', fontSize: '0.8rem' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                              <span style={{ color: '#6b7280', fontSize: '0.7rem' }}>下单</span>
                              <span style={{ fontWeight: 'bold', fontFamily: 'monospace', color: '#d97706' }}>
                                {formatTime(order.createdAt)}
                              </span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                              <span style={{ color: '#6b7280', fontSize: '0.7rem' }}>交付</span>
                              <span style={{ fontWeight: 'bold', fontFamily: 'monospace', color: order.servedAt ? '#059669' : '#d1d5db' }}>
                                {formatTime(order.servedAt)}
                              </span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                              <span style={{ color: '#6b7280', fontSize: '0.7rem' }}>完成</span>
                              <span style={{ fontWeight: 'bold', fontFamily: 'monospace', color: order.completedAt ? '#2563eb' : '#d1d5db' }}>
                                {formatTime(order.completedAt)}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td style={{ ...styles.td, width: '100px', textAlign: 'center', fontWeight: 'bold', fontSize: '0.9rem' }}>
                          {(() => {
                            const durations = calculateStageDurations(order);
                            if (durations.totalTime) {
                              const color = durations.totalTime <= 15 ? '#10b981' : durations.totalTime <= 30 ? '#f59e0b' : '#ef4444';
                              const hours = Math.floor(durations.totalTime / 60);
                              const mins = durations.totalTime % 60;
                              const timeStr = hours > 0 ? `${hours}:${mins.toString().padStart(2, '0')}` : `${durations.totalTime}:00`;
                              return <span style={{ color, fontFamily: 'monospace' }}>{timeStr}</span>;
                            }
                            return <span style={{ color: '#9ca3af' }}>--:--</span>;
                          })()}
                        </td>
                        <td style={{ ...styles.td, width: '100px', textAlign: 'center' }}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleViewOrderDetail(order);
                            }}
                            style={{
                              padding: '0.25rem 0.5rem',
                              background: '#3b82f6',
                              color: 'white',
                              border: 'none',
                              borderRadius: '0.25rem',
                              cursor: 'pointer',
                              fontSize: '0.75rem',
                            }}
                          >
                            查看详情
                          </button>
                        </td>
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      
      {/* 订单详情模态框 */}
      {showDetailModal && selectedOrder && (
        <div style={styles.modal} onClick={() => setShowDetailModal(false)}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: '600' }}>📋 订单详情</h3>
              <button
                onClick={() => setShowDetailModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '1.5rem',
                  cursor: 'pointer',
                  color: '#6b7280',
                }}
              >
                ×
              </button>
            </div>
            
            <div style={styles.modalBody}>
              {/* 订单基本信息 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
                <div>
                  <span style={{ color: '#6b7280', fontSize: '0.875rem' }}>订单号:</span>
                  <div style={{ fontWeight: '600', marginTop: '0.25rem' }}>{selectedOrder.orderNumber || selectedOrder.id}</div>
                </div>
                <div>
                  <span style={{ color: '#6b7280', fontSize: '0.875rem' }}>桌台号:</span>
                  <div style={{ fontWeight: '600', marginTop: '0.25rem' }}>{selectedOrder.tableNumber}</div>
                </div>
                <div>
                  <span style={{ color: '#6b7280', fontSize: '0.875rem' }}>状态:</span>
                  <div style={{ marginTop: '0.25rem' }}>
                    <span style={styles.statusTag(selectedOrder.status)}>
                      {selectedOrder.status === 'completed' ? '已完成' :
                       selectedOrder.status === 'cancelled' ? '已取消' :
                       selectedOrder.status === 'draft' ? '草稿' :
                       selectedOrder.status === 'confirmed' ? '已确认' :
                       selectedOrder.status === 'preparing' ? '制作中' :
                       selectedOrder.status === 'served' ? '已上菜' : selectedOrder.status}
                    </span>
                  </div>
                </div>
                <div>
                  <span style={{ color: '#6b7280', fontSize: '0.875rem' }}>创建时间:</span>
                  <div style={{ fontWeight: '600', marginTop: '0.25rem' }}>
                    {formatNicaraguaDateTime(getOrderTimestamp(selectedOrder))}
                  </div>
                </div>
              </div>
              
              {/* ✅ 时间记录 */}
              <div style={{ 
                background: '#f9fafb', 
                borderRadius: '0.5rem', 
                padding: '1rem', 
                marginBottom: '1.5rem' 
              }}>
                <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.9rem', fontWeight: '600', color: '#374151' }}>⏱️ 时间记录</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
                  <div>
                    <span style={{ color: '#6b7280', fontSize: '0.8rem' }}>📝 下单时间</span>
                    <div style={{ 
                      fontWeight: 'bold', 
                      fontFamily: 'monospace', 
                      fontSize: '1.1rem', 
                      color: '#d97706',
                      marginTop: '0.25rem'
                    }}>
                      {formatTime(selectedOrder.createdAt)}
                    </div>
                  </div>
                  <div>
                    <span style={{ color: '#6b7280', fontSize: '0.8rem' }}>✅ 交付时间</span>
                    <div style={{ 
                      fontWeight: 'bold', 
                      fontFamily: 'monospace', 
                      fontSize: '1.1rem', 
                      color: selectedOrder.servedAt ? '#059669' : '#d1d5db',
                      marginTop: '0.25rem'
                    }}>
                      {selectedOrder.servedAt 
                        ? formatTime(selectedOrder.servedAt)
                        : '--:--'
                      }
                    </div>
                  </div>
                  <div>
                    <span style={{ color: '#6b7280', fontSize: '0.8rem' }}>💰 完成时间</span>
                    <div style={{ 
                      fontWeight: 'bold', 
                      fontFamily: 'monospace', 
                      fontSize: '1.1rem', 
                      color: selectedOrder.completedAt ? '#2563eb' : '#d1d5db',
                      marginTop: '0.25rem'
                    }}>
                      {selectedOrder.completedAt 
                        ? formatTime(selectedOrder.completedAt)
                        : '--:--'
                      }
                    </div>
                  </div>
                </div>
                
                {/* 耗时统计 */}
                <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #e5e7eb' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
                    <div>
                      <span style={{ color: '#6b7280', fontSize: '0.8rem' }}>准备耗时</span>
                      <div style={{ fontWeight: 'bold', fontSize: '1rem', color: '#059669', marginTop: '0.25rem' }}>
                        {(() => {
                          const durations = calculateStageDurations(selectedOrder);
                          return durations.prepTime ? `${durations.prepTime}分钟` : '--';
                        })()}
                      </div>
                    </div>
                    <div>
                      <span style={{ color: '#6b7280', fontSize: '0.8rem' }}>支付耗时</span>
                      <div style={{ fontWeight: 'bold', fontSize: '1rem', color: '#2563eb', marginTop: '0.25rem' }}>
                        {(() => {
                          const durations = calculateStageDurations(selectedOrder);
                          return durations.payTime ? `${durations.payTime}分钟` : '--';
                        })()}
                      </div>
                    </div>
                    <div>
                      <span style={{ color: '#6b7280', fontSize: '0.8rem' }}>总耗时</span>
                      <div style={{ 
                        fontWeight: 'bold', 
                        fontSize: '1rem', 
                        marginTop: '0.25rem',
                        color: (() => {
                          const durations = calculateStageDurations(selectedOrder);
                          if (durations.totalTime) {
                            return durations.totalTime <= 15 ? '#10b981' : durations.totalTime <= 30 ? '#f59e0b' : '#ef4444';
                          }
                          return '#d1d5db';
                        })()
                      }}>
                        {(() => {
                          const durations = calculateStageDurations(selectedOrder);
                          if (durations.totalTime) {
                            const hours = Math.floor(durations.totalTime / 60);
                            const mins = durations.totalTime % 60;
                            return hours > 0 ? `${hours}:${mins.toString().padStart(2, '0')}` : `${durations.totalTime}:00`;
                          }
                          return '--:--';
                        })()}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* 订单商品列表 */}
              <div style={{ marginBottom: '1.5rem' }}>
                <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '1rem', fontWeight: '600' }}>商品明细</h4>
                <div style={{ border: '1px solid #e5e7eb', borderRadius: '0.5rem', overflow: 'hidden' }}>
                  <table style={{ width: '100%' }}>
                    <thead style={{ background: '#f9fafb' }}>
                      <tr>
                        <th style={{ padding: '0.75rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: '600', color: '#6b7280' }}>商品名称</th>
                        <th style={{ padding: '0.75rem', textAlign: 'center', fontSize: '0.75rem', fontWeight: '600', color: '#6b7280' }}>数量</th>
                        <th style={{ padding: '0.75rem', textAlign: 'right', fontSize: '0.75rem', fontWeight: '600', color: '#6b7280' }}>单价</th>
                        <th style={{ padding: '0.75rem', textAlign: 'right', fontSize: '0.75rem', fontWeight: '600', color: '#6b7280' }}>小计</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedOrder.items?.map((item: any, index: number) => (
                        <tr key={index} style={{ borderTop: '1px solid #e5e7eb' }}>
                          <td style={{ padding: '0.75rem', fontSize: '0.875rem' }}>{item.name}</td>
                          <td style={{ padding: '0.75rem', textAlign: 'center', fontSize: '0.875rem' }}>{item.quantity}</td>
                          <td style={{ padding: '0.75rem', textAlign: 'right', fontSize: '0.875rem' }}>C$ {item.price.toFixed(2)}</td>
                          <td style={{ padding: '0.75rem', textAlign: 'right', fontSize: '0.875rem', fontWeight: '600' }}>C$ {item.subtotal.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              
              {/* 金额信息 */}
              <div style={{ borderTop: '2px solid #e5e7eb', paddingTop: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '1.125rem', fontWeight: '600' }}>总计:</span>
                  <span style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#dc2626' }}>
                    C$ {(selectedOrder.totalAmount || 0).toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OrderHistoryPage;
