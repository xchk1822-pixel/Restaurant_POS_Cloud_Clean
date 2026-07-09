import React, { useState, useEffect } from 'react';
import { dataManager } from '../../services/dataManager';
import { smartUpdateDocument } from '../../services/smartSyncService';
import { colors, font, radii, shadows } from '../../styles/uiTokens';

interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  price: number;
  status: 'pending' | 'preparing' | 'ready';
  notes?: string; // 备注，如：不要辣、少盐等
}

interface KitchenOrder {
  id: string;
  tableNumber: string;
  type: 'dine_in' | 'takeout' | 'delivery';
  items: OrderItem[];
  total: number;
  status: 'pending' | 'preparing' | 'ready';
  createdAt: Date;
  priority?: 'normal' | 'urgent'; // 优先级
}

const getKitchenItemStatus = (item: any): OrderItem['status'] => {
  if (item.kitchenStatus === 'ready' || item.kitchenStatus === 'preparing' || item.kitchenStatus === 'pending') {
    return item.kitchenStatus;
  }
  return item.sentToKitchen ? 'preparing' : 'pending';
};

const getKitchenOrderStatus = (items: OrderItem[], orderStatus?: string): KitchenOrder['status'] => {
  if (items.length > 0 && items.every(item => item.status === 'ready')) return 'ready';
  if (items.some(item => item.status === 'preparing') || orderStatus === 'confirmed' || orderStatus === 'preparing') return 'preparing';
  return 'pending';
};

const isTerminalPosOrder = (order: any): boolean => {
  if (!order) return false;
  return order.status === 'completed' || order.status === 'cancelled';
};

const serializeOrderForFirestore = (order: any) => ({
  ...order,
  createdAt: order.createdAt instanceof Date ? order.createdAt.toISOString() : order.createdAt,
  confirmedAt: order.confirmedAt instanceof Date ? order.confirmedAt.toISOString() : order.confirmedAt,
  preparingAt: order.preparingAt instanceof Date ? order.preparingAt.toISOString() : order.preparingAt,
  servedAt: order.servedAt instanceof Date ? order.servedAt.toISOString() : order.servedAt,
  completedAt: order.completedAt instanceof Date ? order.completedAt.toISOString() : order.completedAt,
  clearedAt: order.clearedAt instanceof Date ? order.clearedAt.toISOString() : order.clearedAt,
  lastPaidAt: order.lastPaidAt instanceof Date ? order.lastPaidAt.toISOString() : order.lastPaidAt,
});

const toKitchenOrders = (allOrders: any[]): KitchenOrder[] => {
  return allOrders
    .filter(order => order.status !== 'completed' && order.status !== 'cancelled' && order.status !== 'served')
    .map(order => {
      const kitchenItems = (order.items || []).filter((item: any) => {
        const itemType = item.type || 'dish';
        return itemType === 'recipe' || itemType === 'dish';
      });

      if (kitchenItems.length === 0) {
        return null;
      }

      const items = kitchenItems.map((item: any) => ({
        id: item.id,
        name: item.name,
        quantity: item.quantity,
        price: item.price,
        status: getKitchenItemStatus(item),
        notes: item.notes
      }));

      return {
        id: order.id,
        tableNumber: order.tableNumber || '',
        type: order.orderType || 'dine_in',
        items,
        total: order.totalAmount || 0,
        status: getKitchenOrderStatus(items, order.status),
        createdAt: new Date(order.createdAt),
        priority: 'normal'
      };
    })
    .filter(order => order !== null) as KitchenOrder[];
};

const KitchenDisplay: React.FC = () => {
  const [filter, setFilter] = useState<'all' | 'pending' | 'preparing' | 'ready'>('all');
  const [sortBy, setSortBy] = useState<'time' | 'priority'>('time');

  // ✅ 使用 DataManager 获取订单数据
  const [orders, setOrders] = useState<KitchenOrder[]>(() => {
    const allOrders = dataManager.getData('orders');
    return toKitchenOrders(allOrders);
  });
  
  // 🔄 实时监听 DataManager 订单变化
  useEffect(() => {
    const unsubscribe = dataManager.subscribe('orders', (allOrders) => {
      setOrders(toKitchenOrders(allOrders));
    });
    
    return () => unsubscribe();
  }, []);

  // 计算等待时间
  const getWaitTime = (createdAt: Date) => {
    const minutes = Math.floor((Date.now() - createdAt.getTime()) / 60000);
    if (minutes < 1) return '刚刚';
    if (minutes < 60) return `${minutes}分钟前`;
    const hours = Math.floor(minutes / 60);
    return `${hours}小时前`;
  };

  // 更新菜品状态
  const updateItemStatus = (orderId: string, itemId: string, newStatus: OrderItem['status']) => {
    const currentKitchenOrder = orders.find(order => order.id === orderId);
    if (!currentKitchenOrder) return;

    const updatedItems = currentKitchenOrder.items.map(item =>
      item.id === itemId ? { ...item, status: newStatus } : item
    );
    const updatedKitchenOrder: KitchenOrder = {
      ...currentKitchenOrder,
      items: updatedItems,
      status: getKitchenOrderStatus(updatedItems)
    };
    const nextKitchenOrders = orders.map(order => order.id === orderId ? updatedKitchenOrder : order);
    setOrders(nextKitchenOrders);

    const allOrders = dataManager.getData<any>('orders');
    const originalOrder = allOrders.find(order => order.id === orderId);
    if (!originalOrder) return;
    if (isTerminalPosOrder(originalOrder)) {
      console.warn('厨房忽略终态订单更新，避免回退 POS 状态:', orderId);
      return;
    }

    const kitchenStatusByItemId = new Map(
      updatedKitchenOrder.items.map(item => [item.id, item.status])
    );
    const updatedOrder = {
      ...originalOrder,
      status: newStatus === 'preparing' ? 'preparing' : originalOrder.status,
      items: (originalOrder.items || []).map((item: any) => (
        kitchenStatusByItemId.has(item.id)
          ? { ...item, kitchenStatus: kitchenStatusByItemId.get(item.id) }
          : item
      )),
      lastModified: Date.now(),
      updatedAt: new Date()
    };

    const nextAllOrders = allOrders.map(order => order.id === orderId ? updatedOrder : order);
    return dataManager.saveData('orders', nextAllOrders, { syncFirestore: false }).then(() =>
      smartUpdateDocument('pos_orders', updatedOrder.id, serializeOrderForFirestore(updatedOrder))
    ).catch(error => {
      console.error('厨房状态同步到 POS 失败:', updatedOrder.id, error);
    });
  };

  // 标记订单完成
  const completeOrder = (orderId: string) => {
    setOrders(orders.filter(o => o.id !== orderId));
    const allOrders = dataManager.getData<any>('orders');
    const originalOrder = allOrders.find(order => order.id === orderId);
    if (!originalOrder) return;
    if (isTerminalPosOrder(originalOrder)) {
      console.warn('厨房忽略终态订单出餐更新，避免回退 POS 状态:', orderId);
      return;
    }

    const servedAt = new Date();
    const nextServedStatus = 'served' as const;
    const updatedOrder = {
      ...originalOrder,
      status: nextServedStatus,
      servedAt,
      items: (originalOrder.items || []).map((item: any) => {
        const itemType = item.type || 'dish';
        return itemType === 'recipe' || itemType === 'dish'
          ? { ...item, kitchenStatus: 'ready' }
          : item;
      }),
      lastModified: Date.now(),
      updatedAt: new Date()
    };
    const nextAllOrders = allOrders.map(order => order.id === orderId ? updatedOrder : order);
    return dataManager.saveData('orders', nextAllOrders, { syncFirestore: false }).then(() =>
      smartUpdateDocument('pos_orders', updatedOrder.id, serializeOrderForFirestore(updatedOrder))
    ).catch(error => {
      console.error('厨房出餐完成同步到 POS 失败:', updatedOrder.id, error);
    });
  };

  // 过滤订单
  const filteredOrders = orders.filter(order => {
    if (filter === 'all') return true;
    return order.status === filter;
  });

  // 排序订单
  const sortedOrders = [...filteredOrders].sort((a, b) => {
    if (sortBy === 'priority') {
      // 优先显示紧急订单
      if (a.priority === 'urgent' && b.priority !== 'urgent') return -1;
      if (a.priority !== 'urgent' && b.priority === 'urgent') return 1;
    }
    // 按时间排序（旧的在前）
    return a.createdAt.getTime() - b.createdAt.getTime();
  });

  // 统计信息
  const stats = {
    total: orders.length,
    pending: orders.filter(o => o.status === 'pending').length,
    preparing: orders.filter(o => o.status === 'preparing').length,
    ready: orders.filter(o => o.status === 'ready').length,
  };

  return (
    <div style={{ height: 'calc(100vh - 8rem)', display: 'flex', flexDirection: 'column', padding: '1rem', gap: '1rem', backgroundColor: colors.page, fontFamily: font.family }}>
      {/* 顶部统计栏 */}
      <div style={{ backgroundColor: colors.surface, borderRadius: radii.lg, boxShadow: shadows.soft, border: `1px solid ${colors.border}`, padding: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: '1.5rem' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '1.8rem', fontWeight: '800', color: colors.blue }}>{stats.total}</div>
              <div style={{ fontSize: '0.8rem', color: colors.textSecondary }}>总订单</div>
            </div>
            <div style={{ width: '1px', backgroundColor: colors.border }} />
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '1.8rem', fontWeight: '800', color: colors.amber }}>{stats.pending}</div>
              <div style={{ fontSize: '0.8rem', color: colors.textSecondary }}>待制作</div>
            </div>
            <div style={{ width: '1px', backgroundColor: colors.border }} />
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '1.8rem', fontWeight: '800', color: colors.blue }}>{stats.preparing}</div>
              <div style={{ fontSize: '0.8rem', color: colors.textSecondary }}>制作中</div>
            </div>
            <div style={{ width: '1px', backgroundColor: colors.border }} />
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '1.8rem', fontWeight: '800', color: colors.success }}>{stats.ready}</div>
              <div style={{ fontSize: '0.8rem', color: colors.textSecondary }}>已完成</div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            {/* 筛选按钮 */}
            <div style={{ display: 'flex', gap: '0.4rem' }}>
              <button
                onClick={() => setFilter('all')}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: filter === 'all' ? '#3b82f6' : '#f3f4f6',
                  color: filter === 'all' ? 'white' : '#374151',
                  border: 'none',
                  borderRadius: radii.md,
                  fontWeight: '600',
                  cursor: 'pointer',
                  fontSize: '0.85rem'
                }}
              >
                全部
              </button>
              <button
                onClick={() => setFilter('pending')}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: filter === 'pending' ? '#f59e0b' : '#f3f4f6',
                  color: filter === 'pending' ? 'white' : '#374151',
                  border: 'none',
                  borderRadius: radii.md,
                  fontWeight: '600',
                  cursor: 'pointer',
                  fontSize: '0.85rem'
                }}
              >
                待制作
              </button>
              <button
                onClick={() => setFilter('preparing')}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: filter === 'preparing' ? '#3b82f6' : '#f3f4f6',
                  color: filter === 'preparing' ? 'white' : '#374151',
                  border: 'none',
                  borderRadius: radii.md,
                  fontWeight: '600',
                  cursor: 'pointer',
                  fontSize: '0.85rem'
                }}
              >
                制作中
              </button>
              <button
                onClick={() => setFilter('ready')}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: filter === 'ready' ? '#10b981' : '#f3f4f6',
                  color: filter === 'ready' ? 'white' : '#374151',
                  border: 'none',
                  borderRadius: radii.md,
                  fontWeight: '600',
                  cursor: 'pointer',
                  fontSize: '0.85rem'
                }}
              >
                已完成
              </button>
            </div>

            {/* 排序选项 */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'time' | 'priority')}
              style={{
                padding: '0.5rem',
                border: `1px solid ${colors.borderStrong}`,
                borderRadius: radii.md,
                fontSize: '0.85rem'
              }}
            >
              <option value="time">按时间排序</option>
              <option value="priority">按优先级排序</option>
            </select>
          </div>
        </div>
      </div>

      {/* 订单卡片网格 */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {sortedOrders.length === 0 ? (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            color: '#9ca3af',
            fontSize: '1.2rem'
          }}>
            🎉 没有订单，休息一下吧！
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))',
            gap: '1rem'
          }}>
            {sortedOrders.map(order => (
              <div
                key={order.id}
                style={{
                  backgroundColor: colors.surface,
                  borderRadius: radii.lg,
                  boxShadow: shadows.soft,
                  overflow: 'hidden',
                  border: order.priority === 'urgent' ? `3px solid ${colors.danger}` : `1px solid ${colors.border}`,
                  opacity: order.status === 'ready' ? 0.7 : 1
                }}
              >
                {/* 订单头部 */}
                <div style={{
                  padding: '0.75rem',
                  backgroundColor: order.status === 'pending' ? '#fef3c7' : (order.status === 'preparing' ? '#dbeafe' : '#d1fae5'),
                  borderBottom: `1px solid ${colors.border}`
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontSize: '1.2rem', fontWeight: '800', color: colors.textPrimary }}>
                        {order.type === 'dine_in' ? '🍽️' : (order.type === 'takeout' ? '🥡' : '🚚')}
                        {' '}{order.tableNumber}号桌
                      </span>
                      {order.priority === 'urgent' && (
                        <span style={{
                          padding: '0.2rem 0.5rem',
                          backgroundColor: '#ef4444',
                          color: 'white',
                          borderRadius: '0.25rem',
                          fontSize: '0.75rem',
                          fontWeight: 'bold',
                          animation: 'pulse 2s infinite'
                        }}>
                          🔥 加急
                        </span>
                      )}
                    </div>
                    <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                      {getWaitTime(order.createdAt)}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{
                      padding: '0.25rem 0.5rem',
                      backgroundColor: 'white',
                      borderRadius: '0.25rem',
                      fontSize: '0.75rem',
                      fontWeight: '600'
                    }}>
                      {order.status === 'pending' ? '⏳ 待制作' : (order.status === 'preparing' ? '👨‍🍳 制作中' : '✅ 已完成')}
                    </span>
                    {order.status === 'ready' && (
                      <button
                        onClick={() => completeOrder(order.id)}
                        style={{
                          padding: '0.35rem 0.75rem',
                          backgroundColor: '#10b981',
                          color: 'white',
                          border: 'none',
                          borderRadius: '0.25rem',
                          fontWeight: '600',
                          cursor: 'pointer',
                          fontSize: '0.8rem'
                        }}
                      >
                        ✓ 出餐完成
                      </button>
                    )}
                  </div>
                </div>

                {/* 菜品列表 */}
                <div style={{ padding: '0.75rem' }}>
                  {order.items.map(item => (
                    <div
                      key={item.id}
                      style={{
                        padding: '0.6rem',
                        marginBottom: '0.5rem',
                        backgroundColor: item.status === 'pending' ? '#fef3c7' : (item.status === 'preparing' ? '#dbeafe' : '#d1fae5'),
                        borderRadius: '0.375rem',
                        border: '1px solid #e5e7eb'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                      <div style={{ fontWeight: '750', fontSize: '0.95rem', color: colors.textPrimary }}>
                          {item.name} × {item.quantity}
                        </div>
                        <div style={{ display: 'flex', gap: '0.35rem' }}>
                          {item.status === 'pending' && (
                            <button
                              onClick={() => updateItemStatus(order.id, item.id, 'preparing')}
                              style={{
                                padding: '0.25rem 0.5rem',
                                backgroundColor: '#3b82f6',
                                color: 'white',
                                border: 'none',
                                borderRadius: '0.25rem',
                                fontSize: '0.75rem',
                                fontWeight: '600',
                                cursor: 'pointer'
                              }}
                            >
                              开始制作
                            </button>
                          )}
                          {item.status === 'preparing' && (
                            <button
                              onClick={() => updateItemStatus(order.id, item.id, 'ready')}
                              style={{
                                padding: '0.25rem 0.5rem',
                                backgroundColor: '#10b981',
                                color: 'white',
                                border: 'none',
                                borderRadius: '0.25rem',
                                fontSize: '0.75rem',
                                fontWeight: '600',
                                cursor: 'pointer'
                              }}
                            >
                              完成
                            </button>
                          )}
                        </div>
                      </div>
                      {item.notes && (
                        <div style={{
                          fontSize: '0.8rem',
                          color: '#dc2626',
                          fontWeight: '600',
                          marginTop: '0.25rem'
                        }}>
                          ⚠️ {item.notes}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* CSS动画 */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }
      `}</style>
    </div>
  );
};

export default KitchenDisplay;
