import React, { useState, useEffect } from 'react';
import { getPointsExchangeRate } from '../../utils/exchangeRate';
import { dataService } from '../../services/DataService';
import { smartGetDocuments } from '../../services/smartSyncService';

interface Customer {
  id: string;
  name: string;
  phone: string;
  points: number;
  totalSpent: number;
  visitCount: number;
  createdAt: Date;
  lastVisitAt?: Date;
  notes?: string;
}

const Customers: React.FC = () => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'points' | 'totalSpent' | 'visitCount' | 'lastVisit'>('lastVisit');
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [editNotes, setEditNotes] = useState('');
  
  // 使用全局积分兑换率
  const pointsExchangeRate = getPointsExchangeRate();

  // 🔥 从 Firestore 和 localStorage 加载顾客数据
  useEffect(() => {
    const loadCustomers = async () => {
      try {
        // 先从 Firestore 加载
        const cloudCustomers = await dataService.getData('customers');
        if (cloudCustomers && cloudCustomers.length > 0) {
          console.log('✅ 从 Firestore 加载客户数据:', cloudCustomers.length, '个');
          setCustomers(cloudCustomers);
          return;
        }
        
        // 如果 Firestore 没有，从 localStorage 加载
        const saved = localStorage.getItem('pos_customers');
        if (saved) {
          const parsed = JSON.parse(saved);
          const customersWithDates = parsed.map((c: any) => ({
            ...c,
            createdAt: new Date(c.createdAt),
            lastVisitAt: c.lastVisitAt ? new Date(c.lastVisitAt) : undefined
          }));
          console.log('✅ 从 localStorage 加载客户数据:', customersWithDates.length, '个');
          setCustomers(customersWithDates);
        }
      } catch (e) {
        console.error('Failed to load customers:', e);
      }
    };
    
    loadCustomers();
  }, []);

  // ✅ 自动保存顾客数据到 localStorage 和 Firestore
  useEffect(() => {
    try {
      // 保存到 localStorage
      localStorage.setItem('pos_customers', JSON.stringify(customers));
      
      // 🔥 同步到 Firestore
      dataService.saveData('customers', customers);
      
      console.log('💾 顾客数据已保存并同步，共', customers.length, '个顾客');
    } catch (error) {
      console.error('保存顾客数据失败:', error);
    }
  }, [customers]);

  // 过滤和排序顾客
  const filteredCustomers = customers
    .filter(c => 
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.phone.includes(searchTerm)
    )
    .sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'points':
          return b.points - a.points;
        case 'totalSpent':
          return b.totalSpent - a.totalSpent;
        case 'visitCount':
          return b.visitCount - a.visitCount;
        case 'lastVisit':
          const aTime = a.lastVisitAt ? a.lastVisitAt.getTime() : 0;
          const bTime = b.lastVisitAt ? b.lastVisitAt.getTime() : 0;
          return bTime - aTime;
        default:
          return 0;
      }
    });

  const handleEditCustomer = (customer: Customer) => {
    setEditingCustomer(customer);
    setEditNotes(customer.notes || '');
    setShowEditModal(true);
  };

  const handleSaveNotes = () => {
    if (!editingCustomer) return;

    const updatedCustomers = customers.map(c => 
      c.id === editingCustomer.id ? { ...c, notes: editNotes } : c
    );
    setCustomers(updatedCustomers);
    localStorage.setItem('pos_customers', JSON.stringify(updatedCustomers));
    setShowEditModal(false);
    setEditingCustomer(null);
    setEditNotes('');
  };

  const handleDeleteCustomer = (customerId: string) => {
    if (!window.confirm('确定要删除这个顾客吗？')) return;

    const updatedCustomers = customers.filter(c => c.id !== customerId);
    setCustomers(updatedCustomers);
    localStorage.setItem('pos_customers', JSON.stringify(updatedCustomers));
  };

  const handleResetPoints = (customerId: string) => {
    if (!window.confirm('确定要重置这个顾客的积分吗？')) return;

    const updatedCustomers = customers.map(c => 
      c.id === customerId ? { ...c, points: 0 } : c
    );
    setCustomers(updatedCustomers);
    localStorage.setItem('pos_customers', JSON.stringify(updatedCustomers));
  };

  return (
    <div style={{ padding: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', margin: 0 }}>👥 客户管理</h1>
      </div>
      
      {/* 统计卡片 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        <div style={{ backgroundColor: 'white', borderRadius: '0.5rem', padding: '1rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem' }}>总顾客数</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#3b82f6' }}>{customers.length}</div>
        </div>
        <div style={{ backgroundColor: 'white', borderRadius: '0.5rem', padding: '1rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem' }}>总积分</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#f59e0b' }}>
            {customers.reduce((sum, c) => sum + c.points, 0).toLocaleString()}
          </div>
        </div>
        <div style={{ backgroundColor: 'white', borderRadius: '0.5rem', padding: '1rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem' }}>总消费</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#10b981' }}>
            C${customers.reduce((sum, c) => sum + c.totalSpent, 0).toFixed(2)}
          </div>
        </div>
        <div style={{ backgroundColor: 'white', borderRadius: '0.5rem', padding: '1rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem' }}>总消费次数</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#8b5cf6' }}>
            {customers.reduce((sum, c) => sum + c.visitCount, 0).toLocaleString()}
          </div>
        </div>
      </div>

      {/* 搜索和筛选 */}
      <div style={{ backgroundColor: 'white', borderRadius: '0.5rem', padding: '1rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <input
            type="text"
            placeholder="搜索顾客姓名或电话..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              flex: 1,
              padding: '0.5rem',
              border: '1px solid #d1d5db',
              borderRadius: '0.25rem',
              fontSize: '0.9rem'
            }}
          />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            style={{
              padding: '0.5rem',
              border: '1px solid #d1d5db',
              borderRadius: '0.25rem',
              fontSize: '0.9rem'
            }}
          >
            <option value="lastVisit">最近访问</option>
            <option value="name">姓名</option>
            <option value="points">积分</option>
            <option value="totalSpent">消费金额</option>
            <option value="visitCount">消费次数</option>
          </select>
        </div>
      </div>

      {/* 顾客列表 */}
      <div style={{ backgroundColor: 'white', borderRadius: '0.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
        {filteredCustomers.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#9ca3af' }}>
            {customers.length === 0 ? '暂无顾客数据，请在 POS 系统中添加顾客' : '没有找到匹配的顾客'}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                  <th style={{ padding: '0.75rem', textAlign: 'left', fontSize: '0.875rem', fontWeight: '600', color: '#374151' }}>姓名</th>
                  <th style={{ padding: '0.75rem', textAlign: 'left', fontSize: '0.875rem', fontWeight: '600', color: '#374151' }}>电话</th>
                  <th style={{ padding: '0.75rem', textAlign: 'right', fontSize: '0.875rem', fontWeight: '600', color: '#374151' }}>积分</th>
                  <th style={{ padding: '0.75rem', textAlign: 'right', fontSize: '0.875rem', fontWeight: '600', color: '#374151' }}>总消费</th>
                  <th style={{ padding: '0.75rem', textAlign: 'right', fontSize: '0.875rem', fontWeight: '600', color: '#374151' }}>次数</th>
                  <th style={{ padding: '0.75rem', textAlign: 'left', fontSize: '0.875rem', fontWeight: '600', color: '#374151' }}>最后访问</th>
                  <th style={{ padding: '0.75rem', textAlign: 'center', fontSize: '0.875rem', fontWeight: '600', color: '#374151' }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {filteredCustomers.map(customer => (
                  <tr key={customer.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                    <td style={{ padding: '0.75rem' }}>
                      <div style={{ fontWeight: '600' }}>{customer.name}</div>
                      {customer.notes && (
                        <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                          📝 {customer.notes}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '0.75rem', color: '#6b7280' }}>{customer.phone || '-'}</td>
                    <td style={{ padding: '0.75rem', textAlign: 'right' }}>
                      <span style={{ 
                        backgroundColor: '#fef3c7', 
                        color: '#92400e', 
                        padding: '0.25rem 0.5rem', 
                        borderRadius: '0.25rem',
                        fontWeight: '600',
                        fontSize: '0.875rem'
                      }}>
                        ⭐ {customer.points.toLocaleString()}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: '600', color: '#10b981' }}>
                      C${customer.totalSpent.toFixed(2)}
                    </td>
                    <td style={{ padding: '0.75rem', textAlign: 'right', color: '#6b7280' }}>
                      {customer.visitCount}
                    </td>
                    <td style={{ padding: '0.75rem', fontSize: '0.875rem', color: '#6b7280' }}>
                      {customer.lastVisitAt ? customer.lastVisitAt.toLocaleDateString('zh-CN') : '-'}
                    </td>
                    <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                        <button
                          onClick={() => handleEditCustomer(customer)}
                          style={{
                            padding: '0.25rem 0.5rem',
                            backgroundColor: '#3b82f6',
                            color: 'white',
                            border: 'none',
                            borderRadius: '0.25rem',
                            cursor: 'pointer',
                            fontSize: '0.75rem'
                          }}
                        >
                          编辑
                        </button>
                        <button
                          onClick={() => handleResetPoints(customer.id)}
                          style={{
                            padding: '0.25rem 0.5rem',
                            backgroundColor: '#f59e0b',
                            color: 'white',
                            border: 'none',
                            borderRadius: '0.25rem',
                            cursor: 'pointer',
                            fontSize: '0.75rem'
                          }}
                        >
                          重置积分
                        </button>
                        <button
                          onClick={() => handleDeleteCustomer(customer.id)}
                          style={{
                            padding: '0.25rem 0.5rem',
                            backgroundColor: '#ef4444',
                            color: 'white',
                            border: 'none',
                            borderRadius: '0.25rem',
                            cursor: 'pointer',
                            fontSize: '0.75rem'
                          }}
                        >
                          删除
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 编辑备注模态框 */}
      {showEditModal && editingCustomer && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '0.5rem',
            padding: '1.5rem',
            maxWidth: '500px',
            width: '90%'
          }}>
            <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.25rem', fontWeight: 'bold' }}>
              编辑顾客信息
            </h3>
            
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ marginBottom: '0.5rem', fontWeight: '600' }}>姓名</div>
              <div style={{ padding: '0.5rem', backgroundColor: '#f3f4f6', borderRadius: '0.25rem' }}>
                {editingCustomer.name}
              </div>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <div style={{ marginBottom: '0.5rem', fontWeight: '600' }}>电话</div>
              <div style={{ padding: '0.5rem', backgroundColor: '#f3f4f6', borderRadius: '0.25rem' }}>
                {editingCustomer.phone || '-'}
              </div>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>备注</label>
              <textarea
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                placeholder="添加备注信息..."
                rows={4}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.25rem',
                  fontSize: '0.9rem',
                  resize: 'vertical'
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setShowEditModal(false);
                  setEditingCustomer(null);
                  setEditNotes('');
                }}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: '#f3f4f6',
                  color: '#374151',
                  border: 'none',
                  borderRadius: '0.25rem',
                  cursor: 'pointer'
                }}
              >
                取消
              </button>
              <button
                onClick={handleSaveNotes}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: '#10b981',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.25rem',
                  cursor: 'pointer',
                  fontWeight: '600'
                }}
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Customers;
