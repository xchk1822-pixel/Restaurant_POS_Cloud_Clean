import React from 'react';

interface OrderItem {
  id: string;
  menuItemId: string;
  name: string;
  quantity: number;
  price: number;
  subtotal: number;
}

interface OrderDetailsProps {
  items: OrderItem[];
  onRemoveItem: (itemId: string) => void;
  onUpdateQuantity: (itemId: string, quantity: number) => void;
}

const OrderDetails: React.FC<OrderDetailsProps> = ({ items, onRemoveItem, onUpdateQuantity }) => {
  const total = items.reduce((sum, item) => sum + item.subtotal, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '0.75rem', borderBottom: '1px solid #e5e7eb' }}>
        <h3 style={{ fontSize: '0.875rem', fontWeight: '600', color: '#374151' }}>订单详情</h3>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '0.75rem' }}>
        {items.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: '#9ca3af' }}>
            <p>暂无商品</p>
            <p style={{ fontSize: '0.75rem', marginTop: '0.5rem' }}>请从左侧添加菜品</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {items.map(item => (
              <div
                key={item.id}
                style={{
                  padding: '0.75rem',
                  backgroundColor: '#f9fafb',
                  borderRadius: '0.375rem',
                  border: '1px solid #e5e7eb'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '0.5rem' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: '600', fontSize: '0.875rem' }}>{item.name}</div>
                    <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>C${item.price} / 份</div>
                  </div>
                  <button
                    onClick={() => onRemoveItem(item.id)}
                    style={{
                      width: '24px',
                      height: '24px',
                      borderRadius: '50%',
                      border: 'none',
                      backgroundColor: '#fee2e2',
                      color: '#dc2626',
                      cursor: 'pointer',
                      fontSize: '1rem',
                      lineHeight: '1'
                    }}
                  >
                    ×
                  </button>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <button
                      onClick={() => onUpdateQuantity(item.id, Math.max(1, item.quantity - 1))}
                      style={{
                        width: '28px',
                        height: '28px',
                        borderRadius: '0.25rem',
                        border: '1px solid #d1d5db',
                        backgroundColor: 'white',
                        cursor: 'pointer',
                        fontSize: '1rem'
                      }}
                    >
                      -
                    </button>
                    <span style={{ fontWeight: '600', minWidth: '2rem', textAlign: 'center' }}>{item.quantity}</span>
                    <button
                      onClick={() => onUpdateQuantity(item.id, item.quantity + 1)}
                      style={{
                        width: '28px',
                        height: '28px',
                        borderRadius: '0.25rem',
                        border: '1px solid #d1d5db',
                        backgroundColor: 'white',
                        cursor: 'pointer',
                        fontSize: '1rem'
                      }}
                    >
                      +
                    </button>
                  </div>
                  <div style={{ fontWeight: 'bold', color: '#2563eb' }}>
                    C${item.subtotal.toFixed(2)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 总计 */}
      {items.length > 0 && (
        <div style={{
          padding: '0.75rem',
          borderTop: '2px solid #e5e7eb',
          backgroundColor: '#f9fafb'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>小计</span>
            <span style={{ fontSize: '0.875rem' }}>C${total.toFixed(2)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>税费 (15%)</span>
            <span style={{ fontSize: '0.875rem' }}>C${(total * 0.15).toFixed(2)}</span>
          </div>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            paddingTop: '0.5rem',
            borderTop: '1px solid #e5e7eb'
          }}>
            <span style={{ fontSize: '1rem', fontWeight: 'bold' }}>总计</span>
            <span style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#2563eb' }}>
              C${(total * 1.15).toFixed(2)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default OrderDetails;
