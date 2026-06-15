import React, { useState } from 'react';

interface OrderItem {
  id: string;
  menuItemId: string;
  name: string;
  quantity: number;
  price: number;
  subtotal: number;
  type?: 'recipe' | 'direct'; // 与POS保持一致
  stockItemId?: string;
  sentToKitchen: boolean;
  sentQuantity: number; // 已发送到厨房的数量
}

interface SplitBill {
  id: string;
  customerName: string;
  items: OrderItem[];
  subtotal: number;
  paidAmount: number;
  paymentStatus: 'unpaid' | 'paid';
}

interface SplitBillModalProps {
  items: OrderItem[];
  onClose: () => void;
  onConfirm: (splitBills: SplitBill[]) => void;
  initialSplitBills?: SplitBill[]; // 初始拆分账单数据
}

const SplitBillModal: React.FC<SplitBillModalProps> = ({ items, onClose, onConfirm, initialSplitBills }) => {
  console.log('SplitBillModal 渲染，商品数:', items.length);
  
  const [splitCount, setSplitCount] = useState(2); // 默认拆分成2份
  const [splitBills, setSplitBills] = useState<SplitBill[]>(() => {
    // 如果有初始数据，使用初始数据
    if (initialSplitBills && initialSplitBills.length > 0) {
      console.log('使用已保存的拆分账单数据');
      return initialSplitBills;
    }
    
    // 否则初始化账单，所有商品在第1份
    return [
      {
        id: 'bill-1',
        customerName: '顾客 A',
        items: [...items],
        subtotal: items.reduce((sum, item) => sum + item.subtotal, 0),
        paidAmount: 0,
        paymentStatus: 'unpaid' as const
      },
      ...Array.from({ length: 1 }, (_, i) => ({
        id: `bill-${i + 2}`,
        customerName: `顾客 ${String.fromCharCode(66 + i)}`,
        items: [],
        subtotal: 0,
        paidAmount: 0,
        paymentStatus: 'unpaid' as const
      }))
    ];
  });

  // 移动商品到指定账单
  const moveItemToBill = (itemId: string, targetBillIndex: number) => {
    setSplitBills(prevBills => {
      const newBills = prevBills.map(bill => ({
        ...bill,
        items: [...bill.items]
      }));

      // 找到商品当前所在的账单
      let currentItem: OrderItem | null = null;

      newBills.forEach((bill) => {
        const itemIndex = bill.items.findIndex(item => item.id === itemId);
        if (itemIndex !== -1) {
          currentItem = bill.items[itemIndex];
          bill.items.splice(itemIndex, 1);
          bill.subtotal = bill.items.reduce((sum, item) => sum + item.subtotal, 0);
        }
      });

      // 添加到目标账单
      if (currentItem) {
        newBills[targetBillIndex].items.push(currentItem);
        newBills[targetBillIndex].subtotal = newBills[targetBillIndex].items.reduce(
          (sum, item) => sum + item.subtotal,
          0
        );
      }

      return newBills;
    });
  };

  // 平均分配商品
  const distributeEvenly = () => {
    const allItems = [...items];
    const newBills: SplitBill[] = Array.from({ length: splitCount }, (_, i) => ({
      id: `bill-${i + 1}`,
      customerName: `顾客 ${String.fromCharCode(65 + i)}`,
      items: [],
      subtotal: 0,
      paidAmount: 0,
      paymentStatus: 'unpaid'
    }));

    // 轮流分配商品
    allItems.forEach((item, index) => {
      const billIndex = index % splitCount;
      newBills[billIndex].items.push({ ...item });
    });

    // 计算每个账单的小计
    newBills.forEach(bill => {
      bill.subtotal = bill.items.reduce((sum, item) => sum + item.subtotal, 0);
    });

    setSplitBills(newBills);
  };

  // 更改拆分份数
  const handleSplitCountChange = (count: number) => {
    setSplitCount(count);
    
    // 重新初始化账单
    const newBills: SplitBill[] = Array.from({ length: count }, (_, i) => {
      const existingBill = splitBills[i];
      return existingBill || {
        id: `bill-${i + 1}`,
        customerName: `顾客 ${String.fromCharCode(65 + i)}`,
        items: [],
        subtotal: 0,
        paidAmount: 0,
        paymentStatus: 'unpaid'
      };
    });

    setSplitBills(newBills);
  };

  // 修改顾客名称
  const updateCustomerName = (billIndex: number, name: string) => {
    setSplitBills(prev => {
      const newBills = [...prev];
      newBills[billIndex] = { ...newBills[billIndex], customerName: name };
      return newBills;
    });
  };

  const totalAmount = splitBills.reduce((sum, bill) => sum + bill.subtotal, 0);
  
  // 获取未分配的商品
  const unassignedItems = items.filter(item => {
    return !splitBills.some(bill => bill.items.some(billItem => billItem.id === item.id));
  });

  return (
    <div 
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999
      }}
      onClick={(e) => {
        // 点击背景关闭
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div style={{
        backgroundColor: 'white',
        borderRadius: '0.75rem',
        width: '90%',
        maxWidth: '1200px',
        maxHeight: '90vh',
        overflow: 'auto',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
      }}>
        {/* 标题栏 */}
        <div style={{
          padding: '1.5rem',
          borderBottom: '2px solid #e5e7eb',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: '#f9fafb'
        }}>
          <h2 style={{ margin: 0, fontSize: '1.5rem', color: '#1f2937' }}>
            🔀 账单拆分
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '1.5rem',
              cursor: 'pointer',
              color: '#6b7280'
            }}
          >
            ✕
          </button>
        </div>

        {/* 内容区 */}
        <div style={{ padding: '1.5rem' }}>
          {/* 控制栏 */}
          <div style={{
            display: 'flex',
            gap: '1rem',
            marginBottom: '1.5rem',
            alignItems: 'center',
            flexWrap: 'wrap'
          }}>
            <div>
              <label style={{ fontSize: '0.9rem', color: '#6b7280', marginRight: '0.5rem' }}>
                拆分份数：
              </label>
              <select
                value={splitCount}
                onChange={(e) => handleSplitCountChange(parseInt(e.target.value))}
                style={{
                  padding: '0.5rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.375rem',
                  fontSize: '0.9rem'
                }}
              >
                {[2, 3, 4, 5, 6].map(n => (
                  <option key={n} value={n}>{n} 份</option>
                ))}
              </select>
            </div>

            <button
              onClick={distributeEvenly}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '0.375rem',
                cursor: 'pointer',
                fontSize: '0.9rem',
                fontWeight: '600'
              }}
            >
              ⚖️ 平均分配
            </button>

            <div style={{ marginLeft: 'auto', fontSize: '1.1rem', fontWeight: 'bold', color: '#1f2937' }}>
              总计：C${totalAmount.toFixed(2)}
            </div>
          </div>

          {/* 待分配商品区域 */}
          {unassignedItems.length > 0 && (
            <div style={{
              marginBottom: '1.5rem',
              padding: '1rem',
              backgroundColor: '#fef3c7',
              border: '2px dashed #f59e0b',
              borderRadius: '0.5rem'
            }}>
              <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '1rem', color: '#92400e' }}>
                📦 待分配商品 ({unassignedItems.length})
              </h4>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                {unassignedItems.map(item => (
                  <div
                    key={item.id}
                    style={{
                      padding: '0.5rem 0.75rem',
                      backgroundColor: 'white',
                      border: '1px solid #f59e0b',
                      borderRadius: '0.375rem',
                      fontSize: '0.85rem',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.25rem'
                    }}
                  >
                    <div style={{ fontWeight: '600', color: '#1f2937' }}>
                      {item.name} x{item.quantity}
                    </div>
                    <div style={{ color: '#2563eb', fontWeight: '600' }}>
                      C${item.subtotal.toFixed(2)}
                    </div>
                    
                    {/* 快速分配到某个账单 */}
                    <select
                      value=""
                      onChange={(e) => {
                        if (e.target.value) {
                          moveItemToBill(item.id, parseInt(e.target.value));
                        }
                      }}
                      style={{
                        padding: '0.25rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.25rem',
                        fontSize: '0.75rem',
                        marginTop: '0.25rem'
                      }}
                    >
                      <option value="">分配到...</option>
                      {splitBills.map((bill, idx) => (
                        <option key={idx} value={idx}>
                          {bill.customerName}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 账单卡片网格 */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${splitCount}, 1fr)`,
            gap: '1rem',
            marginBottom: '1.5rem'
          }}>
            {splitBills.map((bill, billIndex) => (
              <div
                key={bill.id}
                style={{
                  border: '2px solid #e5e7eb',
                  borderRadius: '0.5rem',
                  padding: '1rem',
                  backgroundColor: bill.items.length > 0 ? '#f9fafb' : 'white',
                  minHeight: '300px'
                }}
              >
                {/* 账单标题 */}
                <div style={{ marginBottom: '1rem' }}>
                  <input
                    type="text"
                    value={bill.customerName}
                    onChange={(e) => updateCustomerName(billIndex, e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '0.375rem',
                      fontSize: '1rem',
                      fontWeight: '600',
                      textAlign: 'center',
                      marginBottom: '0.5rem'
                    }}
                  />
                  <div style={{
                    fontSize: '1.25rem',
                    fontWeight: 'bold',
                    color: '#2563eb',
                    textAlign: 'center'
                  }}>
                    C${bill.subtotal.toFixed(2)}
                  </div>
                </div>

                {/* 商品列表 */}
                <div style={{ minHeight: '150px' }}>
                  {bill.items.length === 0 ? (
                    <div style={{
                      textAlign: 'center',
                      color: '#9ca3af',
                      padding: '2rem 0',
                      fontSize: '0.9rem'
                    }}>
                      拖拽商品到此处
                    </div>
                  ) : (
                    bill.items.map(item => (
                      <div
                        key={item.id}
                        style={{
                          padding: '0.5rem',
                          marginBottom: '0.5rem',
                          backgroundColor: 'white',
                          border: '1px solid #e5e7eb',
                          borderRadius: '0.375rem',
                          fontSize: '0.85rem'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                          <span style={{ fontWeight: '600' }}>{item.name}</span>
                          <span style={{ color: '#6b7280' }}>x{item.quantity}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ color: '#2563eb', fontWeight: '600' }}>
                            C${item.subtotal.toFixed(2)}
                          </span>
                          
                          {/* 移动到其它账单的下拉框 */}
                          <select
                            value=""
                            onChange={(e) => {
                              if (e.target.value) {
                                moveItemToBill(item.id, parseInt(e.target.value));
                              }
                            }}
                            style={{
                              padding: '0.25rem',
                              border: '1px solid #d1d5db',
                              borderRadius: '0.25rem',
                              fontSize: '0.75rem'
                            }}
                          >
                            <option value="">移动到...</option>
                            {splitBills.map((_, idx) => 
                              idx !== billIndex ? (
                                <option key={idx} value={idx}>
                                  {splitBills[idx].customerName}
                                </option>
                              ) : null
                            )}
                          </select>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* 操作按钮 */}
          <div style={{
            display: 'flex',
            gap: '1rem',
            justifyContent: 'flex-end',
            borderTop: '2px solid #e5e7eb',
            paddingTop: '1rem'
          }}>
            <button
              onClick={onClose}
              style={{
                padding: '0.75rem 1.5rem',
                backgroundColor: '#6b7280',
                color: 'white',
                border: 'none',
                borderRadius: '0.375rem',
                cursor: 'pointer',
                fontSize: '0.95rem',
                fontWeight: '600'
              }}
            >
              取消
            </button>
            <button
              onClick={() => onConfirm(splitBills)}
              disabled={splitBills.some(bill => bill.items.length === 0)}
              style={{
                padding: '0.75rem 1.5rem',
                backgroundColor: splitBills.some(bill => bill.items.length === 0) ? '#d1d5db' : '#10b981',
                color: 'white',
                border: 'none',
                borderRadius: '0.375rem',
                cursor: splitBills.some(bill => bill.items.length === 0) ? 'not-allowed' : 'pointer',
                fontSize: '0.95rem',
                fontWeight: '600'
              }}
            >
              ✓ 确认拆分
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SplitBillModal;
