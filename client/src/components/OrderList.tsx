import React from 'react';

interface OrderItem {
  id: string;
  tableNumber: string;
  orderType: 'dine_in' | 'takeout' | 'delivery';
  items: Array<{ name: string; quantity: number; price: number }>;
  totalAmount: number;
  status: 'pending' | 'preparing' | 'ready' | 'completed';
  createdAt: Date;
}

interface OrderListProps {
  orders: OrderItem[];
  selectedOrderId: string | null;
  onOrderSelect: (orderId: string) => void;
}

const OrderList: React.FC<OrderListProps> = ({ orders, selectedOrderId, onOrderSelect }) => {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return '#fbbf24';
      case 'preparing': return '#60a5fa';
      case 'ready': return '#34d399';
      case 'completed': return '#9ca3af';
      default: return '#6b7280';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'pending': return '待处理';
      case 'preparing': return '制作中';
      case 'ready': return '已完成';
      case 'completed': return '已结账';
      default: return status;
    }
  };

  const getOrderTypeText = (type: string) => {
    switch (type) {
      case 'dine_in': return '堂食';
      case 'takeout': return '打包';
      case 'delivery': return '外卖';
      default: return type;
    }
  };

  // 按订单类型分组
  const groupedOrders = {
    dine_in: orders.filter(o => o.orderType === 'dine_in'),
    takeout: orders.filter(o => o.orderType === 'takeout'),
    delivery: orders.filter(o => o.orderType === 'delivery')
  };

  const OrderCard = ({ order }: { order: OrderItem }) => (
    <div
      onClick={() => onOrderSelect(order.id)}
      style={{
        padding: '0.75rem',
        marginBottom: '0.5rem',
        backgroundColor: selectedOrderId === order.id ? '#eff6ff' : 'white',
        border: selectedOrderId === order.id ? '2px solid #3b82f6' : '1px solid #e5e7eb',
        borderRadius: '0.375rem',
        cursor: 'pointer',
        transition: 'all 0.2s'
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontWeight: 'bold', fontSize: '0.875rem' }}>桌{order.tableNumber}</span>
          <span style={{
            fontSize: '0.75rem',
            padding: '0.125rem 0.5rem',
            backgroundColor: '#f3f4f6',
            borderRadius: '0.25rem'
          }}>
            {getOrderTypeText(order.orderType)}
          </span>
        </div>
        <div style={{
          fontSize: '0.75rem',
          padding: '0.125rem 0.5rem',
          backgroundColor: getStatusColor(order.status),
          color: 'white',
          borderRadius: '0.25rem'
        }}>
          {getStatusText(order.status)}
        </div>
      </div>
      
      <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.5rem' }}>
        {order.items.length} 项商品
      </div>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
          {order.createdAt.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
        </span>
        <span style={{ fontWeight: 'bold', color: '#2563eb' }}>
          C${(order.totalAmount || 0).toFixed(2)}
        </span>
      </div>
    </div>
  );

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '0.5rem' }}>
      {/* 堂食订单 */}
      <div style={{ marginBottom: '1rem' }}>
        <h3 style={{ fontSize: '0.875rem', fontWeight: '600', color: '#374151', marginBottom: '0.5rem', padding: '0 0.5rem' }}>
          🍽️ 堂食 ({groupedOrders.dine_in.length})
        </h3>
        {groupedOrders.dine_in.map(order => (
          <OrderCard key={order.id} order={order} />
        ))}
        {groupedOrders.dine_in.length === 0 && (
          <p style={{ fontSize: '0.75rem', color: '#9ca3af', textAlign: 'center', padding: '1rem' }}>暂无订单</p>
        )}
      </div>

      {/* 打包订单 */}
      <div style={{ marginBottom: '1rem' }}>
        <h3 style={{ fontSize: '0.875rem', fontWeight: '600', color: '#374151', marginBottom: '0.5rem', padding: '0 0.5rem' }}>
          📦 打包 ({groupedOrders.takeout.length})
        </h3>
        {groupedOrders.takeout.map(order => (
          <OrderCard key={order.id} order={order} />
        ))}
        {groupedOrders.takeout.length === 0 && (
          <p style={{ fontSize: '0.75rem', color: '#9ca3af', textAlign: 'center', padding: '1rem' }}>暂无订单</p>
        )}
      </div>

      {/* 外卖订单 */}
      <div>
        <h3 style={{ fontSize: '0.875rem', fontWeight: '600', color: '#374151', marginBottom: '0.5rem', padding: '0 0.5rem' }}>
          🚚 外卖 ({groupedOrders.delivery.length})
        </h3>
        {groupedOrders.delivery.map(order => (
          <OrderCard key={order.id} order={order} />
        ))}
        {groupedOrders.delivery.length === 0 && (
          <p style={{ fontSize: '0.75rem', color: '#9ca3af', textAlign: 'center', padding: '1rem' }}>暂无订单</p>
        )}
      </div>
    </div>
  );
};

export default OrderList;
