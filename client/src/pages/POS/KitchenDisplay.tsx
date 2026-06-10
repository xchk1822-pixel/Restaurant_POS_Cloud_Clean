import React, { useState, useEffect } from 'react';
import { dataManager } from '../../services/dataManager';

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

const KitchenDisplay: React.FC = () => {
  const [filter, setFilter] = useState<'all' | 'pending' | 'preparing' | 'ready'>('all');
  const [sortBy, setSortBy] = useState<'time' | 'priority'>('time');

  // ✅ 使用 DataManager 获取订单数据
  const [orders, setOrders] = useState<KitchenOrder[]>(() => {
    const allOrders = dataManager.getData('orders');
    console.log('🍳 厨房模块初始化加载订单:', allOrders.length, '个');
    
    // 转换为厨房订单格式（只显示未完成的订单）
    return allOrders
      .filter(order => order.status !== 'completed' && order.status !== 'cancelled')
      .map(order => {
        // ✅ 过滤掉不需要厨房制作的物品（饮料、酒水等）
        const kitchenItems = (order.items || []).filter((item: any) => {
          const itemType = item.type || 'dish';
          // 只保留需要厨房制作的菜品
          return itemType === 'recipe' || itemType === 'dish';
        });
        
        // 如果订单中没有需要厨房制作的物品，返回 null
        if (kitchenItems.length === 0) {
          return null;
        }
        
        return {
          id: order.id,
          tableNumber: order.tableNumber || '',
          type: order.orderType || 'dine_in',
          items: kitchenItems.map((item: any) => ({
            id: item.id,
            name: item.name,
            quantity: item.quantity,
            price: item.price,
            status: item.sentToKitchen ? ('preparing' as const) : ('pending' as const),
            notes: item.notes
          })),
          total: order.totalAmount || 0,
          status: (order.status === 'confirmed' || order.status === 'preparing') ? ('preparing' as const) : ('pending' as const),
          createdAt: new Date(order.createdAt),
          priority: 'normal'
        };
      })
      .filter(order => order !== null) as KitchenOrder[]; // 过滤掉 null 值
  });
  
  // 🔄 实时监听 DataManager 订单变化
  useEffect(() => {
    const unsubscribe = dataManager.subscribe('orders', (allOrders) => {
      console.log('🍳 厨房模块收到订单更新:', allOrders.length, '个');
      
      // 转换为厨房订单格式
      const kitchenOrders: KitchenOrder[] = allOrders
        .filter(order => order.status !== 'completed' && order.status !== 'cancelled')
        .map(order => {
          // ✅ 过滤掉不需要厨房制作的物品（饮料、酒水等）
          const kitchenItems = (order.items || []).filter((item: any) => {
            const itemType = item.type || 'dish';
            // 只保留需要厨房制作的菜品
            return itemType === 'recipe' || itemType === 'dish';
          });
          
          // 如果订单中没有需要厨房制作的物品，返回 null
          if (kitchenItems.length === 0) {
            return null;
          }
          
          return {
            id: order.id,
            tableNumber: order.tableNumber || '',
            type: order.orderType || 'dine_in',
            items: kitchenItems.map((item: any) => ({
              id: item.id,
              name: item.name,
              quantity: item.quantity,
              price: item.price,
              status: item.sentToKitchen ? ('preparing' as const) : ('pending' as const),
              notes: item.notes
            })),
            total: order.totalAmount || 0,
            status: (order.status === 'confirmed' || order.status === 'preparing') ? ('preparing' as const) : ('pending' as const),
            createdAt: new Date(order.createdAt),
            priority: 'normal'
          };
        })
        .filter(order => order !== null) as KitchenOrder[]; // 过滤掉 null 值
      
      setOrders(kitchenOrders);
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
    setOrders(orders.map(order => {
      if (order.id === orderId) {
        const updatedItems = order.items.map(item =>
          item.id === itemId ? { ...item, status: newStatus } : item
        );

        // 根据所有items的状态更新订单状态
        let orderStatus: KitchenOrder['status'] = 'pending';
        if (updatedItems.every(item => item.status === 'ready')) {
          orderStatus = 'ready';
        } else if (updatedItems.some(item => item.status === 'preparing')) {
          orderStatus = 'preparing';
        }

        return { ...order, items: updatedItems, status: orderStatus };
      }
      return order;
    }));
  };

  // 标记订单完成
  const completeOrder = (orderId: string) => {
    setOrders(orders.filter(o => o.id !== orderId));
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
    <div style={{ height: 'calc(100vh - 8rem)', display: 'flex', flexDirection: 'column', padding: '1rem', gap: '1rem', backgroundColor: '#f9fafb' }}>
      {/* 顶部统计栏 */}
      <div style={{ backgroundColor: 'white', borderRadius: '0.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', padding: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: '1.5rem' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '1.8rem', fontWeight: 'bold', color: '#3b82f6' }}>{stats.total}</div>
              <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>总订单</div>
            </div>
            <div style={{ width: '1px', backgroundColor: '#e5e7eb' }} />
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '1.8rem', fontWeight: 'bold', color: '#f59e0b' }}>{stats.pending}</div>
              <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>待制作</div>
            </div>
            <div style={{ width: '1px', backgroundColor: '#e5e7eb' }} />
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '1.8rem', fontWeight: 'bold', color: '#3b82f6' }}>{stats.preparing}</div>
              <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>制作中</div>
            </div>
            <div style={{ width: '1px', backgroundColor: '#e5e7eb' }} />
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '1.8rem', fontWeight: 'bold', color: '#10b981' }}>{stats.ready}</div>
              <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>已完成</div>
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
                  borderRadius: '0.25rem',
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
                  borderRadius: '0.25rem',
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
                  borderRadius: '0.25rem',
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
                  borderRadius: '0.25rem',
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
                border: '1px solid #d1d5db',
                borderRadius: '0.25rem',
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
                  backgroundColor: 'white',
                  borderRadius: '0.5rem',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                  overflow: 'hidden',
                  border: order.priority === 'urgent' ? '3px solid #ef4444' : '2px solid #e5e7eb',
                  opacity: order.status === 'ready' ? 0.7 : 1
                }}
              >
                {/* 订单头部 */}
                <div style={{
                  padding: '0.75rem',
                  backgroundColor: order.status === 'pending' ? '#fef3c7' : (order.status === 'preparing' ? '#dbeafe' : '#d1fae5'),
                  borderBottom: '1px solid #e5e7eb'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#374151' }}>
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
                        <div style={{ fontWeight: '600', fontSize: '0.95rem', color: '#374151' }}>
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
