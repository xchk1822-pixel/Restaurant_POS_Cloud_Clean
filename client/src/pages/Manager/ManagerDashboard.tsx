import React, { useState } from 'react';
import { dataManager } from '../../services/dataManager';
import { getLocalDateString } from '../../utils/exchangeRate'; // 🔥 导入本地日期工具
import ShiftHandoverModule from './ShiftHandover';
import ExpenseRecordsModule from './ExpenseRecords';
import FinancialReportsModule from './FinancialReports';
import DashboardModule from './Dashboard';

const ManagerDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'handover' | 'expenseRecords' | 'orderHistory' | 'financialReports'>('dashboard');
  
  // ✅ 使用 DataManager 获取订单数据
  const [allOrders] = useState<any[]>(() => dataManager.getData('orders'));
  
  const [searchKeyword, setSearchKeyword] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterDate, setFilterDate] = useState<string>('today');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
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
    
    // 日期过滤
    if (startDate && endDate) {
      const orderDate = new Date(order.createdAt);
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
  const groupedOrders = filteredOrders.reduce((groups: any, order: any) => {
    const date = new Date(order.createdAt).toLocaleDateString('zh-CN');
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
      + filteredOrders.map((order: any) => 
          `${order.orderNumber},${order.tableNumber},${order.status},${order.totalAmount},${new Date(order.createdAt).toLocaleString('zh-CN')}`
        ).join("\n");
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `orders_${getLocalDateString()}.csv`); // 🔥 使用本地时间
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
  
  return (
    <div style={{ padding: '1rem' }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '1rem' }}>👔 店长管理</h1>
      
      {/* 主标签页 */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', borderBottom: '2px solid #e5e7eb' }}>
        <button
          onClick={() => setActiveTab('dashboard')}
          style={{
            padding: '0.75rem 1.5rem',
            backgroundColor: activeTab === 'dashboard' ? '#3b82f6' : 'transparent',
            color: activeTab === 'dashboard' ? 'white' : '#6b7280',
            border: 'none',
            borderBottom: activeTab === 'dashboard' ? '3px solid #3b82f6' : '3px solid transparent',
            fontWeight: '600',
            cursor: 'pointer',
            marginBottom: '-2px'
          }}
        >
          🏠 数据概览
        </button>
        <button
          onClick={() => setActiveTab('handover')}
          style={{
            padding: '0.75rem 1.5rem',
            backgroundColor: activeTab === 'handover' ? '#3b82f6' : 'transparent',
            color: activeTab === 'handover' ? 'white' : '#6b7280',
            border: 'none',
            borderBottom: activeTab === 'handover' ? '3px solid #3b82f6' : '3px solid transparent',
            fontWeight: '600',
            cursor: 'pointer',
            marginBottom: '-2px'
          }}
        >
          📋 交班对账
        </button>
        <button
          onClick={() => setActiveTab('expenseRecords')}
          style={{
            padding: '0.75rem 1.5rem',
            backgroundColor: activeTab === 'expenseRecords' ? '#3b82f6' : 'transparent',
            color: activeTab === 'expenseRecords' ? 'white' : '#6b7280',
            border: 'none',
            borderBottom: activeTab === 'expenseRecords' ? '3px solid #3b82f6' : '3px solid transparent',
            fontWeight: '600',
            cursor: 'pointer',
            marginBottom: '-2px'
          }}
        >
          📝 开支记录
        </button>
        <button
          onClick={() => setActiveTab('orderHistory')}
          style={{
            padding: '0.75rem 1.5rem',
            backgroundColor: activeTab === 'orderHistory' ? '#3b82f6' : 'transparent',
            color: activeTab === 'orderHistory' ? 'white' : '#6b7280',
            border: 'none',
            borderBottom: activeTab === 'orderHistory' ? '3px solid #3b82f6' : '3px solid transparent',
            fontWeight: '600',
            cursor: 'pointer',
            marginBottom: '-2px'
          }}
        >
          📜 历史订单
        </button>
        <button
          onClick={() => setActiveTab('financialReports')}
          style={{
            padding: '0.75rem 1.5rem',
            backgroundColor: activeTab === 'financialReports' ? '#3b82f6' : 'transparent',
            color: activeTab === 'financialReports' ? 'white' : '#6b7280',
            border: 'none',
            borderBottom: activeTab === 'financialReports' ? '3px solid #3b82f6' : '3px solid transparent',
            fontWeight: '600',
            cursor: 'pointer',
            marginBottom: '-2px'
          }}
        >
          📊 财务报表
        </button>
      </div>
      
      {/* 数据概览 */}
      {activeTab === 'dashboard' && (
        <DashboardModule orders={allOrders} />
      )}
      
      {/* 交班对账 */}
      {activeTab === 'handover' && (
        <ShiftHandoverModule />
      )}
      
      {/* 开支记录 */}
      {activeTab === 'expenseRecords' && (
        <ExpenseRecordsModule />
      )}
      
      {/* 历史订单 */}
      {activeTab === 'orderHistory' && (
        <div style={{ backgroundColor: 'white', borderRadius: '0.5rem', padding: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: '600', margin: '0 0 1rem 0' }}>📜 历史订单</h2>
          
          {/* 搜索和过滤区域 */}
          <div style={{ marginBottom: '1rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
              {/* 关键词搜索 */}
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }}>🔍</span>
                <input
                  type="text"
                  placeholder="搜索订单号或桌台号..."
                  value={searchKeyword}
                  onChange={(e) => setSearchKeyword(e.target.value)}
                  style={{ width: '100%', paddingLeft: '2.5rem', paddingRight: '1rem', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '0.5rem' }}
                />
              </div>
              
              {/* 状态过滤 */}
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                style={{ padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '0.5rem' }}
              >
                <option value="all">全部状态</option>
                <option value="completed">已完成</option>
                <option value="cancelled">已取消</option>
                <option value="draft">草稿</option>
                <option value="confirmed">已确认</option>
                <option value="preparing">制作中</option>
                <option value="served">已上菜</option>
              </select>
              
              {/* 日期范围 */}
              <select
                value={filterDate}
                onChange={(e) => handleDateRangeChange(e.target.value)}
                style={{ padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '0.5rem' }}
              >
                <option value="today">今天</option>
                <option value="yesterday">昨天</option>
                <option value="week">最近7天</option>
                <option value="month">最近30天</option>
                <option value="custom">自定义范围</option>
              </select>
              
              {/* 导出按钮 */}
              <button
                onClick={handleExportOrders}
                style={{ padding: '0.5rem 1rem', backgroundColor: '#16a34a', color: 'white', border: 'none', borderRadius: '0.5rem', cursor: 'pointer', fontWeight: '600' }}
              >
                📥 导出Excel
              </button>
            </div>
            
            {/* 自定义日期范围 */}
            {filterDate === 'custom' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1rem' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: '500', color: '#374151' }}>开始日期</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '0.5rem' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: '500', color: '#374151' }}>结束日期</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '0.5rem' }}
                  />
                </div>
              </div>
            )}
            
            {/* 统计信息 */}
            <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #e5e7eb' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', color: '#4b5563' }}>
                <span>共找到 {filteredOrders.length} 个订单</span>
                <span>总金额: ¥{filteredOrders.reduce((sum: number, order: any) => sum + (order.totalAmount || 0), 0).toFixed(2)}</span>
              </div>
            </div>
          </div>
          
          {/* 订单列表 */}
          <div style={{ overflowX: 'auto' }}>
            {Object.keys(groupedOrders).length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>
                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📜</div>
                <p>暂无订单数据</p>
              </div>
            ) : (
              <div>
                {Object.entries(groupedOrders).map(([date, orders]: [string, any]) => (
                  <div key={date} style={{ marginBottom: '1.5rem' }}>
                    {/* 日期标题 */}
                    <div style={{ backgroundColor: '#f9fafb', padding: '0.5rem 1rem', fontSize: '0.875rem', fontWeight: '500', color: '#4b5563', borderRadius: '0.25rem', marginBottom: '0.5rem' }}>
                      {date} - 共 {orders.length} 个订单
                    </div>
                    
                    {/* 订单列表 */}
                    <div style={{ border: '1px solid #e5e7eb', borderRadius: '0.5rem', overflow: 'hidden' }}>
                      {orders.map((order: any, index: number) => (
                        <div
                          key={order.id}
                          onClick={() => handleViewOrderDetail(order)}
                          style={{ 
                            padding: '1rem', 
                            borderBottom: index < orders.length - 1 ? '1px solid #e5e7eb' : 'none',
                            cursor: 'pointer',
                            transition: 'background-color 0.2s'
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f9fafb'}
                          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'white'}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ flex: 1 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.25rem' }}>
                                <span style={{ fontWeight: '500', color: '#1f2937' }}>
                                  {order.orderNumber || order.id}
                                </span>
                                <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                                  {order.tableNumber}
                                </span>
                                <span style={{
                                  padding: '0.25rem 0.5rem',
                                  fontSize: '0.75rem',
                                  borderRadius: '9999px',
                                  backgroundColor: order.status === 'completed' ? '#d1fae5' : order.status === 'cancelled' ? '#fee2e2' : '#fef3c7',
                                  color: order.status === 'completed' ? '#065f46' : order.status === 'cancelled' ? '#991b1b' : '#92400e',
                                  fontWeight: '600'
                                }}>
                                  {order.status === 'completed' ? '已完成' :
                                   order.status === 'cancelled' ? '已取消' :
                                   order.status === 'draft' ? '草稿' :
                                   order.status === 'confirmed' ? '已确认' :
                                   order.status === 'preparing' ? '制作中' :
                                   order.status === 'served' ? '已上菜' : order.status}
                                </span>
                              </div>
                              
                              <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                                {new Date(order.createdAt).toLocaleTimeString('zh-CN')}
                              </div>
                            </div>
                            
                            <div style={{ textAlign: 'right' }}>
                              <div style={{ fontSize: '1.125rem', fontWeight: '600', color: '#1f2937' }}>
                                ¥{(order.totalAmount || 0).toFixed(2)}
                              </div>
                              <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                                {order.items?.length || 0} 个商品
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* 财务报表 */}
      {activeTab === 'financialReports' && (
        <FinancialReportsModule orders={allOrders} />
      )}
      
      {/* 订单详情模态框 */}
      {showDetailModal && selectedOrder && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div style={{ backgroundColor: 'white', borderRadius: '0.5rem', maxWidth: '42rem', width: '100%', maxHeight: '80vh', overflowY: 'auto', margin: '1rem' }}>
            <div style={{ position: 'sticky', top: 0, backgroundColor: 'white', borderBottom: '1px solid #e5e7eb', padding: '1rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ fontSize: '1.125rem', fontWeight: '600', color: '#1f2937', margin: 0 }}>订单详情</h3>
              <button
                onClick={() => setShowDetailModal(false)}
                style={{ padding: '0.5rem', cursor: 'pointer', border: 'none', background: 'transparent' }}
              >
                ✕
              </button>
            </div>
            
            <div style={{ padding: '1.5rem' }}>
              {/* 订单基本信息 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem', fontSize: '0.875rem' }}>
                <div>
                  <span style={{ color: '#6b7280' }}>订单号:</span>
                  <span style={{ marginLeft: '0.5rem', fontWeight: '500' }}>{selectedOrder.orderNumber || selectedOrder.id}</span>
                </div>
                <div>
                  <span style={{ color: '#6b7280' }}>桌台号:</span>
                  <span style={{ marginLeft: '0.5rem', fontWeight: '500' }}>{selectedOrder.tableNumber}</span>
                </div>
                <div>
                  <span style={{ color: '#6b7280' }}>状态:</span>
                  <span style={{
                    marginLeft: '0.5rem',
                    padding: '0.25rem 0.5rem',
                    fontSize: '0.75rem',
                    borderRadius: '9999px',
                    backgroundColor: selectedOrder.status === 'completed' ? '#d1fae5' : selectedOrder.status === 'cancelled' ? '#fee2e2' : '#fef3c7',
                    color: selectedOrder.status === 'completed' ? '#065f46' : selectedOrder.status === 'cancelled' ? '#991b1b' : '#92400e',
                    fontWeight: '600'
                  }}>
                    {selectedOrder.status === 'completed' ? '已完成' :
                     selectedOrder.status === 'cancelled' ? '已取消' :
                     selectedOrder.status === 'draft' ? '草稿' :
                     selectedOrder.status === 'confirmed' ? '已确认' :
                     selectedOrder.status === 'preparing' ? '制作中' :
                     selectedOrder.status === 'served' ? '已上菜' : selectedOrder.status}
                  </span>
                </div>
                <div>
                  <span style={{ color: '#6b7280' }}>创建时间:</span>
                  <span style={{ marginLeft: '0.5rem' }}>{new Date(selectedOrder.createdAt).toLocaleString('zh-CN')}</span>
                </div>
              </div>
              
              {/* 订单商品列表 */}
              <div style={{ marginBottom: '1rem' }}>
                <h4 style={{ fontWeight: '500', color: '#1f2937', marginBottom: '0.5rem' }}>商品明细</h4>
                <div style={{ border: '1px solid #e5e7eb', borderRadius: '0.5rem', overflow: 'hidden' }}>
                  <table style={{ width: '100%', fontSize: '0.875rem' }}>
                    <thead style={{ backgroundColor: '#f9fafb' }}>
                      <tr>
                        <th style={{ padding: '0.5rem 1rem', textAlign: 'left' }}>商品名称</th>
                        <th style={{ padding: '0.5rem 1rem', textAlign: 'center' }}>数量</th>
                        <th style={{ padding: '0.5rem 1rem', textAlign: 'right' }}>单价</th>
                        <th style={{ padding: '0.5rem 1rem', textAlign: 'right' }}>小计</th>
                      </tr>
                    </thead>
                    <tbody style={{ borderTop: '1px solid #e5e7eb' }}>
                      {selectedOrder.items?.map((item: any, index: number) => (
                        <tr key={index} style={{ borderBottom: index < (selectedOrder.items?.length || 0) - 1 ? '1px solid #e5e7eb' : 'none' }}>
                          <td style={{ padding: '0.5rem 1rem' }}>{item.name}</td>
                          <td style={{ padding: '0.5rem 1rem', textAlign: 'center' }}>{item.quantity}</td>
                          <td style={{ padding: '0.5rem 1rem', textAlign: 'right' }}>¥{item.price.toFixed(2)}</td>
                          <td style={{ padding: '0.5rem 1rem', textAlign: 'right' }}>¥{item.subtotal.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              
              {/* 金额信息 */}
              <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '1.125rem', fontWeight: '600' }}>
                  <span>总计:</span>
                  <span style={{ color: '#2563eb' }}>¥{(selectedOrder.totalAmount || 0).toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ManagerDashboard;
