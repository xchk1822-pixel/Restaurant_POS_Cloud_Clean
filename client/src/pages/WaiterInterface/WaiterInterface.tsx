import React, { useState, useEffect, useRef } from 'react';
import { useAppContext } from '../../contexts/AppContext';
import TableLayout from '../../components/TableLayout';
import MenuSelection from '../../components/MenuSelection';
import { dataService } from '../../services/DataService';
import { smartSubscribeToCollection, smartUpdateDocument } from '../../services/smartSyncService';

interface Table {
  id: string;
  number: string;
  x: number;
  y: number;
  width: number;
  height: number;
  status: 'available' | 'occupied' | 'reserved' | 'needs_cleaning';
  capacity: number;
  currentOrderId?: string;
  lastModified?: number;
}

interface MenuItem {
  id: string;
  name: string;
  nameEs?: string;
  price: number;
  category: string;
  available?: boolean;
  type?: 'recipe' | 'direct';
}

interface OrderItem {
  id: string;
  menuItemId: string;
  name: string;
  quantity: number;
  price: number;
  subtotal: number;
  type?: 'recipe' | 'direct';
  stockItemId?: string;
  sentToKitchen: boolean;
  sentQuantity: number;
}

interface Order {
  id: string;
  orderNumber?: string;
  tableId: string;
  tableNumber: string;
  orderType: 'dine_in' | 'takeout' | 'delivery';
  customerId?: string;
  customerName?: string;
  items: OrderItem[];
  status: 'draft' | 'confirmed' | 'preparing' | 'served' | 'completed' | 'cancelled';
  createdAt: Date;
  confirmedAt?: Date;
  completedAt?: Date;
  clearedAt?: Date;
  totalAmount: number;
  paidAmount: number;
  paymentStatus: 'unpaid' | 'partial' | 'paid';
  lastPaidAt?: Date;
  settledAmount: number;
  updatedAt?: Date;
  lastModified?: number;
}

const serializeOrderForFirestore = (order: Order) => ({
  ...order,
  createdAt: order.createdAt instanceof Date ? order.createdAt.toISOString() : order.createdAt,
  confirmedAt: order.confirmedAt instanceof Date ? order.confirmedAt.toISOString() : order.confirmedAt,
  completedAt: order.completedAt instanceof Date ? order.completedAt.toISOString() : order.completedAt,
  clearedAt: order.clearedAt instanceof Date ? order.clearedAt.toISOString() : order.clearedAt,
  lastPaidAt: order.lastPaidAt instanceof Date ? order.lastPaidAt.toISOString() : order.lastPaidAt,
  updatedAt: order.updatedAt instanceof Date ? order.updatedAt.toISOString() : order.updatedAt,
  lastModified: order.lastModified || Date.now(),
});

const WaiterInterface: React.FC = () => {
  const { menuItems: contextMenuItems, orders: appOrders, setOrders: setAppOrders } = useAppContext();
  const publishedTablesSignatureRef = useRef<string>('');
  const localTablesSignatureRef = useRef<string>('');
  const skipInitialTablePublishRef = useRef(true);

  const getTablesSignature = (tableList: Table[]) => {
    return JSON.stringify([...tableList]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map(table => ({
        id: table.id,
        number: table.number,
        x: table.x,
        y: table.y,
        width: table.width,
        height: table.height,
        status: table.status,
        capacity: table.capacity,
        currentOrderId: table.currentOrderId || '',
        lastModified: table.lastModified || 0,
      })));
  };

  const dedupeTables = (tableList: Table[]) => {
    const byNumber = new Map<string, Table>();
    tableList.forEach(table => {
      const key = String(table.number);
      const existing = byNumber.get(key);
      if (!existing || (table.lastModified || 0) >= (existing.lastModified || 0)) {
        byNumber.set(key, table);
      }
    });
    return Array.from(byNumber.values()).sort((a, b) => Number(a.number) - Number(b.number));
  };
  
  // 本地状态管理 - 桌台
  const [tables, setTables] = useState<Table[]>(() => {
    try {
      const saved = localStorage.getItem('pos_tables');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (error) {
      console.error('加载桌台数据失败:', error);
    }
    
    // 默认桌台数据
    return [
      { id: 'table_1', number: '1', x: 50, y: 50, width: 80, height: 80, status: 'available', capacity: 4 },
      { id: 'table_2', number: '2', x: 150, y: 50, width: 80, height: 80, status: 'available', capacity: 4 },
      { id: 'table_3', number: '3', x: 250, y: 50, width: 80, height: 80, status: 'available', capacity: 6 },
      { id: 'table_4', number: '4', x: 50, y: 150, width: 80, height: 80, status: 'available', capacity: 4 },
      { id: 'table_5', number: '5', x: 150, y: 150, width: 80, height: 80, status: 'available', capacity: 4 },
      { id: 'table_6', number: '6', x: 250, y: 150, width: 80, height: 80, status: 'available', capacity: 8 },
    ];
  });
  
  // 使用 AppContext 中的订单数据（实时同步）
  const orders = appOrders;
  const menuItems = contextMenuItems;
  
  // 状态管理
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [currentItems, setCurrentItems] = useState<OrderItem[]>([]);
  const [viewMode, setViewMode] = useState<'tables' | 'order'>('tables');
  const [notification, setNotification] = useState<string>('');

  useEffect(() => {
    const unsubscribe = smartSubscribeToCollection('pos_tables', (cloudTables) => {
      if (!cloudTables || cloudTables.length === 0) return;
      const nextTables = dedupeTables(cloudTables as Table[]);
      const nextSignature = getTablesSignature(nextTables);
      localStorage.setItem(dataService.getStoreKey('pos_tables'), JSON.stringify(nextTables));
      if (nextSignature === localTablesSignatureRef.current) return;
      localTablesSignatureRef.current = nextSignature;
      publishedTablesSignatureRef.current = nextSignature;
      setTables(nextTables);
    });

    return () => unsubscribe();
  }, []);

  // 🔥 保存到 localStorage 并同步到 Firestore
  useEffect(() => {
    const normalizedTables = dedupeTables(tables);
    const signature = getTablesSignature(normalizedTables);
    localTablesSignatureRef.current = signature;
    localStorage.setItem(dataService.getStoreKey('pos_tables'), JSON.stringify(normalizedTables));
    if (skipInitialTablePublishRef.current) {
      skipInitialTablePublishRef.current = false;
      publishedTablesSignatureRef.current = signature;
      return;
    }
    if (signature === publishedTablesSignatureRef.current) {
      return;
    }
    publishedTablesSignatureRef.current = signature;
    
    // 同步到 Firestore
    try {
      normalizedTables.forEach(table => {
        smartUpdateDocument('pos_tables', table.id, table).catch(error => {
          console.error('同步服务生桌台到 Firestore 失败:', table.id, error);
        });
      });
    } catch (error) {
      console.error('同步桌台数据失败:', error);
    }
  }, [tables]);
  
  // 更新桌台状态
  const updateTable = (tableId: string, updates: Partial<Table>) => {
    setTables(prev => prev.map(t => t.id === tableId ? { ...t, ...updates, lastModified: Date.now() } : t));
  };
  
  // 创建订单
  const createOrder = (orderData: Partial<Order>) => {
    const newOrder: Order = {
      id: `order-${Date.now()}`,
      orderNumber: `ORD-${Date.now().toString().slice(-6)}`,
      tableId: orderData.tableId || '',
      tableNumber: orderData.tableNumber || '',
      orderType: orderData.orderType || 'dine_in',
      items: orderData.items || [],
      status: orderData.status || 'confirmed',
      createdAt: new Date(),
      totalAmount: (orderData.items || []).reduce((sum, item) => sum + item.subtotal, 0),
      paidAmount: 0,
      paymentStatus: 'unpaid',
      settledAmount: 0,
      lastModified: Date.now(),
      ...orderData
    } as Order;
    
    setAppOrders(prev => [...prev, newOrder]);
    smartUpdateDocument('pos_orders', newOrder.id, serializeOrderForFirestore(newOrder)).catch(error => {
      console.error('服务生订单同步到 POS 失败:', newOrder.id, error);
    });
    return newOrder;
  };
  
  // 更新订单
  const updateOrder = (orderId: string, updates: Partial<Order>) => {
    setAppOrders(prev => prev.map(o => o.id === orderId ? { ...o, ...updates } : o));
  };

  // 获取当前桌台的订单
  const currentOrder = selectedTableId 
    ? orders.find(o => o.tableId === selectedTableId && o.status !== 'completed' && o.status !== 'cancelled')
    : null;

  // 加载已有订单的商品
  useEffect(() => {
    if (currentOrder) {
      const formattedItems: OrderItem[] = currentOrder.items.map((item: any, index: number) => ({
        id: item.id || `item-${index}`,
        menuItemId: item.menuItemId || '',
        name: item.name,
        quantity: item.quantity,
        price: item.price,
        subtotal: item.subtotal || item.quantity * item.price,
        type: item.type || 'recipe',
        stockItemId: item.stockItemId,
        sentToKitchen: item.sentToKitchen || false,
        sentQuantity: item.sentQuantity || 0
      }));
      setCurrentItems(formattedItems);
    } else {
      setCurrentItems([]);
    }
  }, [currentOrder]);

  // 显示通知
  const showNotification = (message: string) => {
    setNotification(message);
    setTimeout(() => setNotification(''), 3000);
  };

  // 选择桌台
  const handleTableSelect = (tableId: string) => {
    setSelectedTableId(tableId);
    setViewMode('order');
  };

  // 添加菜品到订单
  const handleAddItem = (menuItem: MenuItem) => {
    const existingItem = currentItems.find(item => item.menuItemId === menuItem.id);
    
    if (existingItem) {
      // 增加数量
      setCurrentItems(currentItems.map(item =>
        item.menuItemId === menuItem.id
          ? {
              ...item,
              quantity: item.quantity + 1,
              subtotal: (item.quantity + 1) * item.price
            }
          : item
      ));
    } else {
      // 新增商品
      const newItem: OrderItem = {
        id: `item-${Date.now()}-${Math.random()}`,
        menuItemId: menuItem.id,
        name: menuItem.name,
        quantity: 1,
        price: menuItem.price,
        subtotal: menuItem.price,
        type: menuItem.type || 'recipe',
        sentToKitchen: false,
        sentQuantity: 0
      };
      setCurrentItems([...currentItems, newItem]);
    }
  };

  // 移除菜品
  const handleRemoveItem = (itemId: string) => {
    setCurrentItems(currentItems.filter(item => item.id !== itemId));
  };

  // 更新数量
  const handleUpdateQuantity = (itemId: string, quantity: number) => {
    if (quantity <= 0) {
      handleRemoveItem(itemId);
      return;
    }
    
    setCurrentItems(currentItems.map(item =>
      item.id === itemId
        ? { ...item, quantity, subtotal: quantity * item.price }
        : item
    ));
  };

  // 发送到厨房
  const handleSendToKitchen = () => {
    if (!selectedTableId) {
      showNotification('❌ 请先选择桌台');
      return;
    }

    if (currentItems.length === 0) {
      showNotification('❌ 请先添加菜品');
      return;
    }

    // 检查是否有需要发送的菜品
    const itemsToSend = currentItems.filter(item => !item.sentToKitchen || item.quantity > item.sentQuantity);
    
    if (itemsToSend.length === 0) {
      showNotification('⚠️ 所有菜品已发送到厨房');
      return;
    }

    // 更新商品状态
    const updatedItems = currentItems.map(item => {
      if (!item.sentToKitchen || item.quantity > item.sentQuantity) {
        return {
          ...item,
          sentToKitchen: true,
          sentQuantity: item.quantity
        };
      }
      return item;
    });

    setCurrentItems(updatedItems);

    // 创建或更新订单
    if (currentOrder) {
      // 更新现有订单（加菜）
      const updatedOrder: Order = {
        ...currentOrder,
        items: updatedItems,
        totalAmount: updatedItems.reduce((sum, item) => sum + item.subtotal, 0),
        updatedAt: new Date(),
        lastModified: Date.now(),
      };
      updateOrder(updatedOrder.id, updatedOrder);
      smartUpdateDocument('pos_orders', updatedOrder.id, serializeOrderForFirestore(updatedOrder)).catch(error => {
        console.error('服务生加菜同步到 POS 失败:', updatedOrder.id, error);
      });
      showNotification(`✅ 已发送 ${itemsToSend.length} 个菜品到厨房（加菜）`);
    } else {
      // 创建新订单
      const table = tables.find(t => t.id === selectedTableId);
      const newOrder = createOrder({
        tableId: selectedTableId,
        tableNumber: table?.number || '',
        items: updatedItems,
        status: 'confirmed',
        orderType: 'dine_in'
      });
      
      // 更新桌台状态为占用
      if (table) {
        updateTable(selectedTableId, { status: 'occupied', currentOrderId: newOrder.id });
      }
      
      showNotification(`✅ 订单已发送到厨房`);
    }
  };

  // 返回桌台视图
  const handleBackToTables = () => {
    setSelectedTableId(null);
    setCurrentItems([]);
    setViewMode('tables');
  };

  // 计算总金额
  const totalAmount = currentItems.reduce((sum, item) => sum + item.subtotal, 0);

  // 渲染桌台视图
  const renderTablesView = () => (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '1rem', borderBottom: '1px solid #e5e7eb', backgroundColor: 'white' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', margin: 0 }}>🍽️ 服务生 - 桌台管理</h2>
        <p style={{ color: '#6b7280', marginTop: '0.5rem', fontSize: '0.875rem' }}>
          点击桌台开始点餐，右键可合并/拆分桌台
        </p>
      </div>
      
      <div style={{ flex: 1, padding: '1rem', overflow: 'hidden' }}>
        <TableLayout
          tables={tables}
          selectedTableId={selectedTableId}
          onTableSelect={handleTableSelect}
          onTablesUpdate={(updatedTables) => {
            setTables(updatedTables);
          }}
        />
      </div>
    </div>
  );

  // 渲染点餐视图
  const renderOrderView = () => {
    const table = tables.find(t => t.id === selectedTableId);
    
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        {/* 顶部栏 */}
        <div style={{ 
          padding: '1rem', 
          borderBottom: '1px solid #e5e7eb', 
          backgroundColor: 'white',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <button 
              onClick={handleBackToTables}
              style={{
                marginRight: '1rem',
                padding: '0.5rem 1rem',
                backgroundColor: '#f3f4f6',
                border: 'none',
                borderRadius: '0.375rem',
                cursor: 'pointer',
                fontSize: '0.875rem'
              }}
            >
              ← 返回桌台
            </button>
            <span style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>
              📋 桌台 {table?.number} - 点餐
            </span>
            {currentOrder && (
              <span style={{ 
                marginLeft: '1rem',
                padding: '0.25rem 0.75rem',
                backgroundColor: '#dbeafe',
                color: '#1e40af',
                borderRadius: '9999px',
                fontSize: '0.75rem',
                fontWeight: '600'
              }}>
                已有订单（加菜模式）
              </span>
            )}
          </div>
          
          <button
            onClick={handleSendToKitchen}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: '#10b981',
              color: 'white',
              border: 'none',
              borderRadius: '0.375rem',
              fontWeight: '600',
              cursor: 'pointer',
              fontSize: '1rem'
            }}
          >
            🍳 发送到厨房
          </button>
        </div>

        {/* 主要内容区 */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* 左侧：菜单选择 */}
          <div style={{ flex: 1, borderRight: '1px solid #e5e7eb', overflow: 'hidden' }}>
            <MenuSelection
              items={currentItems}
              onAddItem={handleAddItem}
              onRemoveItem={handleRemoveItem}
              onUpdateQuantity={handleUpdateQuantity}
            />
          </div>

          {/* 右侧：订单详情 */}
          <div style={{ width: '350px', display: 'flex', flexDirection: 'column', backgroundColor: 'white' }}>
            <div style={{ padding: '1rem', borderBottom: '1px solid #e5e7eb', fontWeight: '600' }}>
              🛒 当前订单
            </div>
            
            {/* 商品列表 */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '0.5rem' }}>
              {currentItems.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: '#9ca3af' }}>
                  暂无商品<br/>
                  <span style={{ fontSize: '0.875rem' }}>请从左侧菜单添加</span>
                </div>
              ) : (
                currentItems.map(item => (
                  <div
                    key={item.id}
                    style={{
                      padding: '0.75rem',
                      marginBottom: '0.5rem',
                      backgroundColor: item.sentToKitchen ? '#f0fdf4' : '#fef3c7',
                      border: '1px solid',
                      borderColor: item.sentToKitchen ? '#86efac' : '#fde68a',
                      borderRadius: '0.375rem'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                      <div style={{ fontWeight: '600', fontSize: '0.875rem' }}>{item.name}</div>
                      <button
                        onClick={() => handleRemoveItem(item.id)}
                        style={{
                          padding: '0.25rem 0.5rem',
                          backgroundColor: '#fee2e2',
                          color: '#dc2626',
                          border: 'none',
                          borderRadius: '0.25rem',
                          cursor: 'pointer',
                          fontSize: '0.75rem'
                        }}
                      >
                        ✕
                      </button>
                    </div>
                    
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <button
                        onClick={() => handleUpdateQuantity(item.id, item.quantity - 1)}
                        style={{
                          width: '28px',
                          height: '28px',
                          backgroundColor: '#f3f4f6',
                          border: '1px solid #d1d5db',
                          borderRadius: '0.25rem',
                          cursor: 'pointer',
                          fontSize: '1rem'
                        }}
                      >
                        -
                      </button>
                      <span style={{ minWidth: '30px', textAlign: 'center', fontWeight: '600' }}>
                        {item.quantity}
                      </span>
                      <button
                        onClick={() => handleUpdateQuantity(item.id, item.quantity + 1)}
                        style={{
                          width: '28px',
                          height: '28px',
                          backgroundColor: '#f3f4f6',
                          border: '1px solid #d1d5db',
                          borderRadius: '0.25rem',
                          cursor: 'pointer',
                          fontSize: '1rem'
                        }}
                      >
                        +
                      </button>
                      <span style={{ marginLeft: 'auto', fontWeight: 'bold', color: '#2563eb' }}>
                        C${item.subtotal.toFixed(2)}
                      </span>
                    </div>
                    
                    {item.sentToKitchen && (
                      <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: '#16a34a' }}>
                        ✓ 已发送厨房
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* 底部汇总 */}
            <div style={{ borderTop: '2px solid #e5e7eb', padding: '1rem', backgroundColor: '#f9fafb' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <span style={{ color: '#6b7280' }}>商品数量:</span>
                <span style={{ fontWeight: '600' }}>{currentItems.reduce((sum, item) => sum + item.quantity, 0)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.25rem', fontWeight: 'bold' }}>
                <span>总计:</span>
                <span style={{ color: '#dc2626' }}>C${totalAmount.toFixed(2)}</span>
              </div>
              <div style={{ marginTop: '0.75rem', fontSize: '0.75rem', color: '#6b7280' }}>
                💡 提示: 结账请在收银端进行
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* 通知提示 */}
      {notification && (
        <div style={{
          position: 'fixed',
          top: '1rem',
          right: '1rem',
          padding: '1rem 1.5rem',
          backgroundColor: notification.includes('✅') ? '#10b981' : '#ef4444',
          color: 'white',
          borderRadius: '0.5rem',
          boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
          zIndex: 1000,
          animation: 'slideIn 0.3s ease-out'
        }}>
          {notification}
        </div>
      )}

      {/* 主内容 */}
      {viewMode === 'tables' ? renderTablesView() : renderOrderView()}
    </div>
  );
};

export default WaiterInterface;
