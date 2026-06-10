import React, { useState } from 'react';

interface PaymentProps {
  total: number;
  onPaymentComplete: () => void;
  onCancel: () => void;
}

const Payment: React.FC<PaymentProps> = ({ total, onPaymentComplete, onCancel }) => {
  const [serviceFeePercent, setServiceFeePercent] = useState(0);
  const [payments, setPayments] = useState<Array<{
    id: string;
    method: 'cash' | 'card' | 'mixed';
    currency: 'NIO' | 'USD';
    amount: number;
  }>>([]);
  const [showAddPayment, setShowAddPayment] = useState(false);

  const exchangeRate = 36.5; // 1 USD = 36.5 NIO (尼加拉瓜科多巴)
  const serviceFee = total * (serviceFeePercent / 100);
  const finalTotal = total + serviceFee;

  const paidAmount = payments.reduce((sum, p) => {
    if (p.currency === 'USD') {
      return sum + (p.amount * exchangeRate);
    }
    return sum + p.amount;
  }, 0);

  const change = paidAmount - finalTotal;

  const addPayment = (method: string, currency: string, amount: number) => {
    const newPayment = {
      id: Date.now().toString(),
      method: method as 'cash' | 'card',
      currency: currency as 'NIO' | 'USD',
      amount
    };
    setPayments([...payments, newPayment]);
    setShowAddPayment(false);
  };

  const removePayment = (id: string) => {
    setPayments(payments.filter(p => p.id !== id));
  };

  const getMethodIcon = (method: string) => {
    switch (method) {
      case 'cash': return '💵';
      case 'card': return '💳';
      default: return '💰';
    }
  };

  const getMethodName = (method: string) => {
    switch (method) {
      case 'cash': return '现金';
      case 'card': return '刷卡';
      default: return method;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '0.75rem' }}>
      <h3 style={{ fontSize: '0.875rem', fontWeight: '600', color: '#374151', marginBottom: '0.75rem' }}>支付</h3>

      {/* 服务费选择 */}
      <div style={{ marginBottom: '1rem', padding: '0.75rem', backgroundColor: '#f9fafb', borderRadius: '0.375rem' }}>
        <label style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.5rem', display: 'block' }}>
          服务费 / Propina
        </label>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {[0, 5, 10, 15].map(percent => (
            <button
              key={percent}
              onClick={() => setServiceFeePercent(percent)}
              style={{
                flex: 1,
                padding: '0.375rem',
                borderRadius: '0.25rem',
                border: serviceFeePercent === percent ? '2px solid #3b82f6' : '1px solid #d1d5db',
                backgroundColor: serviceFeePercent === percent ? '#eff6ff' : 'white',
                color: serviceFeePercent === percent ? '#2563eb' : '#374151',
                fontSize: '0.75rem',
                fontWeight: '500',
                cursor: 'pointer'
              }}
            >
              {percent}%
            </button>
          ))}
        </div>
        {serviceFee > 0 && (
          <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: '#6b7280' }}>
            服务费: C${serviceFee.toFixed(2)}
          </div>
        )}
      </div>

      {/* 汇率信息 */}
      <div style={{
        marginBottom: '1rem',
        padding: '0.5rem 0.75rem',
        backgroundColor: '#fef3c7',
        borderRadius: '0.375rem',
        fontSize: '0.75rem',
        color: '#92400e'
      }}>
        💱 汇率: 1 USD = {exchangeRate} NIO
      </div>

      {/* 已添加的支付方式 */}
      {payments.length > 0 && (
        <div style={{ marginBottom: '1rem' }}>
          <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.5rem' }}>支付方式:</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {payments.map(payment => (
              <div
                key={payment.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '0.5rem',
                  backgroundColor: '#f9fafb',
                  borderRadius: '0.375rem',
                  border: '1px solid #e5e7eb'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span>{getMethodIcon(payment.method)}</span>
                  <div>
                    <div style={{ fontSize: '0.75rem', fontWeight: '500' }}>{getMethodName(payment.method)}</div>
                    <div style={{ fontSize: '0.625rem', color: '#6b7280' }}>
                      {payment.currency === 'USD' ? `$${payment.amount}` : `C$${payment.amount}`}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => removePayment(payment.id)}
                  style={{
                    padding: '0.25rem 0.5rem',
                    backgroundColor: '#fee2e2',
                    color: '#dc2626',
                    border: 'none',
                    borderRadius: '0.25rem',
                    fontSize: '0.75rem',
                    cursor: 'pointer'
                  }}
                >
                  删除
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 添加支付按钮 */}
      {!showAddPayment && paidAmount < finalTotal && (
        <button
          onClick={() => setShowAddPayment(true)}
          style={{
            width: '100%',
            padding: '0.75rem',
            backgroundColor: '#3b82f6',
            color: 'white',
            border: 'none',
            borderRadius: '0.375rem',
            fontWeight: '600',
            cursor: 'pointer',
            marginBottom: '1rem'
          }}
        >
          + 添加支付
        </button>
      )}

      {/* 添加支付表单 */}
      {showAddPayment && (
        <AddPaymentForm
          onAdd={addPayment}
          onCancel={() => setShowAddPayment(false)}
          remainingAmount={finalTotal - paidAmount}
          exchangeRate={exchangeRate}
        />
      )}

      {/* 总计和找零 */}
      <div style={{
        marginTop: 'auto',
        paddingTop: '0.75rem',
        borderTop: '2px solid #e5e7eb'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
          <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>应付总额</span>
          <span style={{ fontSize: '0.875rem', fontWeight: 'bold' }}>C${finalTotal.toFixed(2)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
          <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>已付金额</span>
          <span style={{ fontSize: '0.875rem', color: '#10b981' }}>C${paidAmount.toFixed(2)}</span>
        </div>
        {change >= 0 && (
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            padding: '0.5rem',
            backgroundColor: '#d1fae5',
            borderRadius: '0.375rem',
            marginBottom: '0.75rem'
          }}>
            <span style={{ fontSize: '0.875rem', fontWeight: '600', color: '#065f46' }}>找零</span>
            <span style={{ fontSize: '1rem', fontWeight: 'bold', color: '#065f46' }}>C${change.toFixed(2)}</span>
          </div>
        )}
        {change < 0 && (
          <div style={{
            padding: '0.5rem',
            backgroundColor: '#fee2e2',
            borderRadius: '0.375rem',
            marginBottom: '0.75rem',
            textAlign: 'center',
            fontSize: '0.75rem',
            color: '#991b1b'
          }}>
            还需支付: C${Math.abs(change).toFixed(2)}
          </div>
        )}

        {/* 操作按钮 */}
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={onCancel}
            style={{
              flex: 1,
              padding: '0.75rem',
              backgroundColor: '#f3f4f6',
              color: '#374151',
              border: 'none',
              borderRadius: '0.375rem',
              fontWeight: '600',
              cursor: 'pointer'
            }}
          >
            取消
          </button>
          <button
            onClick={onPaymentComplete}
            disabled={paidAmount < finalTotal}
            style={{
              flex: 2,
              padding: '0.75rem',
              backgroundColor: paidAmount >= finalTotal ? '#10b981' : '#d1d5db',
              color: 'white',
              border: 'none',
              borderRadius: '0.375rem',
              fontWeight: '600',
              cursor: paidAmount >= finalTotal ? 'pointer' : 'not-allowed'
            }}
          >
            完成支付
          </button>
        </div>
      </div>
    </div>
  );
};

// 添加支付表单子组件
const AddPaymentForm: React.FC<{
  onAdd: (method: string, currency: string, amount: number) => void;
  onCancel: () => void;
  remainingAmount: number;
  exchangeRate: number;
}> = ({ onAdd, onCancel, remainingAmount, exchangeRate }) => {
  const [method, setMethod] = useState('cash');
  const [currency, setCurrency] = useState('NIO');
  const [amount, setAmount] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (amount && parseFloat(amount) > 0) {
      onAdd(method, currency, parseFloat(amount));
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{
      marginBottom: '1rem',
      padding: '0.75rem',
      backgroundColor: '#f9fafb',
      borderRadius: '0.375rem',
      border: '1px solid #e5e7eb'
    }}>
      <div style={{ marginBottom: '0.5rem' }}>
        <label style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem', display: 'block' }}>支付方式</label>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            type="button"
            onClick={() => setMethod('cash')}
            style={{
              flex: 1,
              padding: '0.5rem',
              borderRadius: '0.25rem',
              border: method === 'cash' ? '2px solid #3b82f6' : '1px solid #d1d5db',
              backgroundColor: method === 'cash' ? '#eff6ff' : 'white',
              cursor: 'pointer',
              fontSize: '0.75rem'
            }}
          >
            💵 现金
          </button>
          <button
            type="button"
            onClick={() => setMethod('card')}
            style={{
              flex: 1,
              padding: '0.5rem',
              borderRadius: '0.25rem',
              border: method === 'card' ? '2px solid #3b82f6' : '1px solid #d1d5db',
              backgroundColor: method === 'card' ? '#eff6ff' : 'white',
              cursor: 'pointer',
              fontSize: '0.75rem'
            }}
          >
            💳 刷卡
          </button>
        </div>
      </div>

      <div style={{ marginBottom: '0.5rem' }}>
        <label style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem', display: 'block' }}>货币</label>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            type="button"
            onClick={() => setCurrency('NIO')}
            style={{
              flex: 1,
              padding: '0.5rem',
              borderRadius: '0.25rem',
              border: currency === 'NIO' ? '2px solid #3b82f6' : '1px solid #d1d5db',
              backgroundColor: currency === 'NIO' ? '#eff6ff' : 'white',
              cursor: 'pointer',
              fontSize: '0.75rem'
            }}
          >
            🇳🇮 C$ (NIO)
          </button>
          <button
            type="button"
            onClick={() => setCurrency('USD')}
            style={{
              flex: 1,
              padding: '0.5rem',
              borderRadius: '0.25rem',
              border: currency === 'USD' ? '2px solid #3b82f6' : '1px solid #d1d5db',
              backgroundColor: currency === 'USD' ? '#eff6ff' : 'white',
              cursor: 'pointer',
              fontSize: '0.75rem'
            }}
          >
            🇺🇸 $ (USD)
          </button>
        </div>
      </div>

      <div style={{ marginBottom: '0.75rem' }}>
        <label style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem', display: 'block' }}>
          金额 (还需: C${remainingAmount.toFixed(2)})
        </label>
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="输入金额"
          step="0.01"
          min="0"
          required
          style={{
            width: '100%',
            padding: '0.5rem',
            border: '1px solid #d1d5db',
            borderRadius: '0.25rem',
            fontSize: '0.875rem'
          }}
        />
      </div>

      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button
          type="button"
          onClick={onCancel}
          style={{
            flex: 1,
            padding: '0.5rem',
            backgroundColor: '#f3f4f6',
            border: 'none',
            borderRadius: '0.25rem',
            cursor: 'pointer',
            fontSize: '0.75rem'
          }}
        >
          取消
        </button>
        <button
          type="submit"
          style={{
            flex: 1,
            padding: '0.5rem',
            backgroundColor: '#3b82f6',
            color: 'white',
            border: 'none',
            borderRadius: '0.25rem',
            cursor: 'pointer',
            fontSize: '0.75rem',
            fontWeight: '600'
          }}
        >
          确认
        </button>
      </div>
    </form>
  );
};

export default Payment;
