import React, { useState, useEffect } from 'react';
import { dataManager } from '../../services/dataManager';
import { getPointsExchangeRate } from '../../utils/exchangeRate';
import { smartDeleteDocument, smartGetDocuments, smartSetDocument } from '../../services/smartSyncService';

interface Customer {
  id: string;
  name: string;
  phone: string;
  points: number;
  totalSpent: number;
  visitCount: number;
  createdAt: string;
  lastVisitAt?: string;
  notes?: string;
  level?: 'bronze' | 'silver' | 'gold' | 'platinum'; // 会员等级
  socialAccounts?: {  // 社交账号
    whatsapp?: string;
    facebook?: string;
    instagram?: string;
    telegram?: string;
  };
}

interface PointsTransaction {
  id: string;
  customerId: string;
  type: 'earn' | 'redeem' | 'adjust'; // 获得/兑换/调整
  points: number;
  description: string;
  createdAt: string;
}

const getScopedStorageKey = (collectionName: string): string => {
  try {
    const userStr = localStorage.getItem('current_user');
    const user = userStr ? JSON.parse(userStr) : null;
    return user?.storeId ? `store_${user.storeId}_${collectionName}` : collectionName;
  } catch {
    return collectionName;
  }
};

const loadLocalPointsTransactions = (): PointsTransaction[] => {
  const scopedKey = getScopedStorageKey('points_transactions');
  const saved = localStorage.getItem(scopedKey) || localStorage.getItem('points_transactions');
  if (!saved) return [];
  try {
    return JSON.parse(saved);
  } catch {
    return [];
  }
};

const saveLocalPointsTransactions = (records: PointsTransaction[]) => {
  localStorage.setItem(getScopedStorageKey('points_transactions'), JSON.stringify(records));
  localStorage.setItem('points_transactions', JSON.stringify(records));
};

const CustomersModule: React.FC = () => {
  const [customers, setCustomers] = useState<Customer[]>(() => dataManager.getData('customers'));
  const [transactions, setTransactions] = useState<PointsTransaction[]>(() => loadLocalPointsTransactions());
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'points' | 'totalSpent' | 'visitCount' | 'lastVisit'>('lastVisit');
  
  // 模态框状态
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showPointsModal, setShowPointsModal] = useState(false);
  const [showRedeemModal, setShowRedeemModal] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  
  // 表单状态
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    notes: '',
    whatsapp: '',
    facebook: '',
    instagram: '',
    telegram: ''
  });
  const [pointsAmount, setPointsAmount] = useState<number>(0);
  const [redeemAmount, setRedeemAmount] = useState<number>(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  
  // 使用全局积分兑换率
  const pointsExchangeRate = getPointsExchangeRate();

  // 🔄 实时监听客户数据变化
  const refreshCustomerData = React.useCallback(async () => {
    setIsRefreshing(true);
    try {
      const [cloudCustomers, cloudTransactions] = await Promise.all([
        smartGetDocuments('customers', true),
        smartGetDocuments('points_transactions', true),
      ]);

      await dataManager.saveData('customers', cloudCustomers, { syncFirestore: false, notify: false });
      dataManager.clearCache('customers');
      setCustomers(cloudCustomers);
      setTransactions(cloudTransactions as PointsTransaction[]);
      saveLocalPointsTransactions(cloudTransactions as PointsTransaction[]);
      setLastSyncedAt(new Date());
    } catch (error) {
      console.error('\u5237\u65b0\u5ba2\u6237\u6570\u636e\u5931\u8d25:', error);
      alert('\u5237\u65b0\u5ba2\u6237\u6570\u636e\u5931\u8d25\uff0c\u8bf7\u68c0\u67e5\u7f51\u7edc\u540e\u91cd\u8bd5');
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    refreshCustomerData();
  }, [refreshCustomerData]);

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
          const aTime = a.lastVisitAt ? new Date(a.lastVisitAt).getTime() : 0;
          const bTime = b.lastVisitAt ? new Date(b.lastVisitAt).getTime() : 0;
          return bTime - aTime;
        default:
          return 0;
      }
    });

  // 统计信息
  const stats = {
    totalCustomers: customers.length,
    totalPoints: customers.reduce((sum, c) => sum + c.points, 0),
    totalSpent: customers.reduce((sum, c) => sum + c.totalSpent, 0),
    totalVisits: customers.reduce((sum, c) => sum + c.visitCount, 0),
  };

  // 获取会员等级
  const getCustomerLevel = (points: number): Customer['level'] => {
    if (points >= 10000) return 'platinum';
    if (points >= 5000) return 'gold';
    if (points >= 2000) return 'silver';
    return 'bronze';
  };

  // 等级配置
  const levelConfig = {
    bronze: { label: '青铜', color: '#cd7f32', bg: '#fef3c7' },
    silver: { label: '白银', color: '#c0c0c0', bg: '#f3f4f6' },
    gold: { label: '黄金', color: '#ffd700', bg: '#fef9c3' },
    platinum: { label: '铂金', color: '#e5e4e2', bg: '#dbeafe' },
  };

  // 添加客户
  const handleAddCustomer = async () => {
    if (!formData.name.trim()) {
      alert('请输入客户姓名');
      return;
    }

    const newCustomer: Customer = {
      id: `CUST-${Date.now()}`,
      name: formData.name.trim(),
      phone: formData.phone.trim(),
      points: 0,
      totalSpent: 0,
      visitCount: 0,
      createdAt: new Date().toISOString(),
      notes: formData.notes.trim(),
      level: 'bronze',
      socialAccounts: {
        whatsapp: formData.whatsapp.trim() || undefined,
        facebook: formData.facebook.trim() || undefined,
        instagram: formData.instagram.trim() || undefined,
        telegram: formData.telegram.trim() || undefined
      }
    };

    const nextCustomers = [...customers, newCustomer];
    setCustomers(nextCustomers);
    await dataManager.saveData('customers', nextCustomers, { syncFirestore: false, notify: false });
    await smartSetDocument('customers', newCustomer.id, newCustomer);
    setShowAddModal(false);
    setFormData({ name: '', phone: '', notes: '', whatsapp: '', facebook: '', instagram: '', telegram: '' });
    alert('✅ 客户添加成功！');
  };

  // 编辑客户
  const handleEditCustomer = (customer: Customer) => {
    setSelectedCustomer(customer);
    setFormData({
      name: customer.name,
      phone: customer.phone,
      notes: customer.notes || '',
      whatsapp: customer.socialAccounts?.whatsapp || '',
      facebook: customer.socialAccounts?.facebook || '',
      instagram: customer.socialAccounts?.instagram || '',
      telegram: customer.socialAccounts?.telegram || ''
    });
    setShowEditModal(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedCustomer) return;

    const updatedCustomer = {
      ...selectedCustomer,
      name: formData.name.trim(),
      phone: formData.phone.trim(),
      notes: formData.notes.trim(),
      socialAccounts: {
        whatsapp: formData.whatsapp.trim() || undefined,
        facebook: formData.facebook.trim() || undefined,
        instagram: formData.instagram.trim() || undefined,
        telegram: formData.telegram.trim() || undefined
      }
    };

    const nextCustomers = customers.map(customer =>
      customer.id === selectedCustomer.id ? updatedCustomer : customer
    );
    setCustomers(nextCustomers);
    await dataManager.saveData('customers', nextCustomers, { syncFirestore: false, notify: false });
    await smartSetDocument('customers', updatedCustomer.id, updatedCustomer);
    setShowEditModal(false);
    setSelectedCustomer(null);
    setFormData({ name: '', phone: '', notes: '', whatsapp: '', facebook: '', instagram: '', telegram: '' });
    alert('✅ 客户信息已更新！');
  };

  // 删除客户
  const handleDeleteCustomer = async (customerId: string) => {
    if (!window.confirm('确定要删除这个客户吗？此操作不可恢复！')) return;

    const nextCustomers = customers.filter(customer => customer.id !== customerId);
    setCustomers(nextCustomers);
    await smartDeleteDocument('customers', customerId);
    await dataManager.saveData('customers', nextCustomers, { syncFirestore: false, notify: false });
    alert('✅ 客户已删除');
  };

  // 积分管理
  const handleManagePoints = (customer: Customer) => {
    setSelectedCustomer(customer);
    setPointsAmount(0);
    setShowPointsModal(true);
  };

  const handleAddPoints = async () => {
    if (!selectedCustomer || pointsAmount <= 0) {
      alert('请输入有效的积分数量');
      return;
    }

    const updatedCustomer = {
      ...selectedCustomer,
      points: selectedCustomer.points + pointsAmount
    };

    const nextCustomers = customers.map(customer =>
      customer.id === selectedCustomer.id ? updatedCustomer : customer
    );
    setCustomers(nextCustomers);
    await dataManager.saveData('customers', nextCustomers, { syncFirestore: false, notify: false });
    await smartSetDocument('customers', updatedCustomer.id, updatedCustomer);

    // 记录交易
    const transaction: PointsTransaction = {
      id: `TXN-${Date.now()}`,
      customerId: selectedCustomer.id,
      type: 'adjust',
      points: pointsAmount,
      description: `手动调整积分 +${pointsAmount}`,
      createdAt: new Date().toISOString()
    };

    const updatedTransactions = [...transactions, transaction];
    setTransactions(updatedTransactions);
    saveLocalPointsTransactions(updatedTransactions);
    await smartSetDocument('points_transactions', transaction.id, transaction);

    setShowPointsModal(false);
    setSelectedCustomer(null);
    setPointsAmount(0);
    alert(`✅ 已成功添加 ${pointsAmount} 积分`);
  };

  // 积分兑换
  const handleRedeemPoints = (customer: Customer) => {
    setSelectedCustomer(customer);
    setRedeemAmount(0);
    setShowRedeemModal(true);
  };

  const handleConfirmRedeem = async () => {
    if (!selectedCustomer || redeemAmount <= 0) {
      alert('请输入有效的兑换积分');
      return;
    }

    if (redeemAmount > selectedCustomer.points) {
      alert('积分不足！');
      return;
    }

    const cashValue = redeemAmount / pointsExchangeRate;
    const updatedCustomer = {
      ...selectedCustomer,
      points: selectedCustomer.points - redeemAmount
    };

    const nextCustomers = customers.map(customer =>
      customer.id === selectedCustomer.id ? updatedCustomer : customer
    );
    setCustomers(nextCustomers);
    await dataManager.saveData('customers', nextCustomers, { syncFirestore: false, notify: false });
    await smartSetDocument('customers', updatedCustomer.id, updatedCustomer);

    // 记录交易
    const transaction: PointsTransaction = {
      id: `TXN-${Date.now()}`,
      customerId: selectedCustomer.id,
      type: 'redeem',
      points: -redeemAmount,
      description: `兑换现金 C$ ${cashValue.toFixed(2)} (${redeemAmount} 积分)`,
      createdAt: new Date().toISOString()
    };

    const updatedTransactions = [...transactions, transaction];
    setTransactions(updatedTransactions);
    saveLocalPointsTransactions(updatedTransactions);
    await smartSetDocument('points_transactions', transaction.id, transaction);

    setShowRedeemModal(false);
    setSelectedCustomer(null);
    setRedeemAmount(0);
    alert(`✅ 成功兑换 C$ ${cashValue.toFixed(2)}`);
  };

  // 重置积分
  const handleResetPoints = async (customerId: string) => {
    if (!window.confirm('确定要重置这个客户的积分吗？')) return;

    const nextCustomers = customers.map(customer =>
      customer.id === customerId ? { ...customer, points: 0 } : customer
    );
    const updatedCustomer = nextCustomers.find(customer => customer.id === customerId);
    setCustomers(nextCustomers);
    await dataManager.saveData('customers', nextCustomers, { syncFirestore: false, notify: false });
    if (updatedCustomer) {
      await smartSetDocument('customers', updatedCustomer.id, updatedCustomer);
    }
    alert('✅ 积分已重置为 0');
  };

  // 样式
  const styles = {
    container: {
      display: 'flex',
      flexDirection: 'column' as const,
      height: '100%',
      padding: '1.5rem',
      background: '#f3f4f6',
    },
    header: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: '1.5rem',
      flexShrink: 0 as const,
    },
    title: {
      fontSize: '1.75rem',
      fontWeight: 'bold',
      color: '#1f2937',
      margin: 0,
    },
    btn: (color: string, textColor: string) => ({
      padding: '0.5rem 1rem',
      backgroundColor: color,
      color: textColor,
      border: 'none',
      borderRadius: '0.5rem',
      cursor: 'pointer',
      fontWeight: '600',
      fontSize: '0.875rem',
      transition: 'all 0.2s',
    }),
    statsGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
      gap: '1rem',
      marginBottom: '1.5rem',
      flexShrink: 0 as const,
    },
    statCard: (color: string) => ({
      backgroundColor: 'white',
      borderRadius: '0.5rem',
      padding: '1rem',
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      borderLeft: `4px solid ${color}`,
    }),
    statLabel: {
      fontSize: '0.875rem',
      color: '#6b7280',
      marginBottom: '0.5rem',
    },
    statValue: (color: string) => ({
      fontSize: '1.5rem',
      fontWeight: 'bold',
      color: color,
    }),
    toolbar: {
      backgroundColor: 'white',
      borderRadius: '0.5rem',
      padding: '1rem',
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      marginBottom: '1rem',
      display: 'flex',
      gap: '1rem',
      alignItems: 'center',
      flexShrink: 0 as const,
    },
    input: {
      flex: 1,
      padding: '0.5rem',
      border: '1px solid #d1d5db',
      borderRadius: '0.25rem',
      fontSize: '0.9rem',
    },
    select: {
      padding: '0.5rem',
      border: '1px solid #d1d5db',
      borderRadius: '0.25rem',
      fontSize: '0.9rem',
    },
    tableContainer: {
      flex: 1,
      backgroundColor: 'white',
      borderRadius: '0.5rem',
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column' as const,
    },
    tableScroll: {
      flex: 1,
      overflowY: 'auto' as const,
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
    modal: {
      position: 'fixed' as const,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
    },
    modalContent: {
      backgroundColor: 'white',
      borderRadius: '0.5rem',
      padding: '1.5rem',
      maxWidth: '500px',
      width: '90%',
      maxHeight: '80vh',
      overflowY: 'auto' as const,
    },
    formGroup: {
      marginBottom: '1rem',
    },
    label: {
      display: 'block',
      marginBottom: '0.5rem',
      fontWeight: '600',
      fontSize: '0.875rem',
      color: '#374151',
    },
    formInput: {
      width: '100%',
      padding: '0.5rem',
      border: '1px solid #d1d5db',
      borderRadius: '0.25rem',
      fontSize: '0.9rem',
    },
    textarea: {
      width: '100%',
      padding: '0.5rem',
      border: '1px solid #d1d5db',
      borderRadius: '0.25rem',
      fontSize: '0.9rem',
      resize: 'vertical' as const,
    },
  };

  return (
    <div style={styles.container}>
      {/* 头部 */}
      <div style={styles.header}>
        <h1 style={styles.title}>👥 客户管理</h1>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {lastSyncedAt && (
            <span style={{ fontSize: '0.8rem', color: '#6b7280', whiteSpace: 'nowrap' }}>
              {'\u6700\u540e\u540c\u6b65 '} {lastSyncedAt.toLocaleTimeString('es-NI', { hour12: false })}
            </span>
          )}
          <button
            onClick={refreshCustomerData}
            disabled={isRefreshing}
            style={{
              ...styles.btn(isRefreshing ? '#9ca3af' : '#6366f1', 'white'),
              cursor: isRefreshing ? 'not-allowed' : 'pointer',
            }}
          >
            {isRefreshing ? '\u540c\u6b65\u4e2d...' : '\u5237\u65b0\u4e91\u7aef\u6570\u636e'}
          </button>
                  <button onClick={() => setShowAddModal(true)} style={styles.btn('#3b82f6', 'white')}>
          ➕ 添加客户
        </button>
        </div>
      </div>

      {/* 统计卡片 */}
      <div style={styles.statsGrid}>
        <div style={styles.statCard('#3b82f6')}>
          <div style={styles.statLabel}>总客户数</div>
          <div style={styles.statValue('#3b82f6')}>{stats.totalCustomers}</div>
        </div>
        <div style={styles.statCard('#f59e0b')}>
          <div style={styles.statLabel}>总积分</div>
          <div style={styles.statValue('#f59e0b')}>{stats.totalPoints.toLocaleString()}</div>
        </div>
        <div style={styles.statCard('#10b981')}>
          <div style={styles.statLabel}>总消费</div>
          <div style={styles.statValue('#10b981')}>C$ {stats.totalSpent.toFixed(2)}</div>
        </div>
        <div style={styles.statCard('#8b5cf6')}>
          <div style={styles.statLabel}>总消费次数</div>
          <div style={styles.statValue('#8b5cf6')}>{stats.totalVisits.toLocaleString()}</div>
        </div>
      </div>

      {/* 工具栏 */}
      <div style={styles.toolbar}>
        <input
          type="text"
          placeholder="搜索客户姓名或电话..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={styles.input}
        />
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as any)}
          style={styles.select}
        >
          <option value="lastVisit">最近访问</option>
          <option value="name">姓名</option>
          <option value="points">积分</option>
          <option value="totalSpent">消费金额</option>
          <option value="visitCount">消费次数</option>
        </select>
      </div>

      {/* 客户列表 */}
      <div style={styles.tableContainer}>
        {filteredCustomers.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#9ca3af' }}>
            {customers.length === 0 ? '暂无客户数据，请添加客户' : '没有找到匹配的客户'}
          </div>
        ) : (
          <div style={styles.tableScroll}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>姓名</th>
                  <th style={styles.th}>电话</th>
                  <th style={{ ...styles.th, textAlign: 'center' }}>等级</th>
                  <th style={{ ...styles.th, textAlign: 'right' }}>积分</th>
                  <th style={{ ...styles.th, textAlign: 'right' }}>总消费</th>
                  <th style={{ ...styles.th, textAlign: 'right' }}>次数</th>
                  <th style={styles.th}>最后访问</th>
                  <th style={{ ...styles.th, textAlign: 'center' }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {filteredCustomers.map(customer => {
                  const level = getCustomerLevel(customer.points);
                  const levelInfo = levelConfig[level!];
                  
                  return (
                    <tr key={customer.id}>
                      <td style={styles.td}>
                        <div style={{ fontWeight: '600' }}>{customer.name}</div>
                        {customer.notes && (
                          <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                            📝 {customer.notes}
                          </div>
                        )}
                        {/* 社交账号图标 */}
                        {customer.socialAccounts && (
                          <div style={{ display: 'flex', gap: '0.25rem', marginTop: '0.25rem' }}>
                            {customer.socialAccounts.whatsapp && (
                              <span title={`WhatsApp: ${customer.socialAccounts.whatsapp}`} style={{ fontSize: '0.875rem', cursor: 'pointer' }}>
                                💬
                              </span>
                            )}
                            {customer.socialAccounts.facebook && (
                              <span title={`Facebook: ${customer.socialAccounts.facebook}`} style={{ fontSize: '0.875rem', cursor: 'pointer' }}>
                                👥
                              </span>
                            )}
                            {customer.socialAccounts.instagram && (
                              <span title={`Instagram: ${customer.socialAccounts.instagram}`} style={{ fontSize: '0.875rem', cursor: 'pointer' }}>
                                📷
                              </span>
                            )}
                            {customer.socialAccounts.telegram && (
                              <span title={`Telegram: ${customer.socialAccounts.telegram}`} style={{ fontSize: '0.875rem', cursor: 'pointer' }}>
                                ✈️
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td style={{ ...styles.td, color: '#6b7280' }}>{customer.phone || '-'}</td>
                      <td style={{ ...styles.td, textAlign: 'center' }}>
                        <span style={{
                          display: 'inline-block',
                          padding: '0.25rem 0.5rem',
                          borderRadius: '9999px',
                          fontSize: '0.75rem',
                          fontWeight: '600',
                          background: levelInfo.bg,
                          color: levelInfo.color,
                        }}>
                          {levelInfo.label}
                        </span>
                      </td>
                      <td style={{ ...styles.td, textAlign: 'right' }}>
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
                      <td style={{ ...styles.td, textAlign: 'right', fontWeight: '600', color: '#10b981' }}>
                        C$ {customer.totalSpent.toFixed(2)}
                      </td>
                      <td style={{ ...styles.td, textAlign: 'right', color: '#6b7280' }}>
                        {customer.visitCount}
                      </td>
                      <td style={{ ...styles.td, fontSize: '0.875rem', color: '#6b7280' }}>
                        {customer.lastVisitAt ? new Date(customer.lastVisitAt).toLocaleDateString('zh-CN') : '-'}
                      </td>
                      <td style={{ ...styles.td, textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: '0.25rem', justifyContent: 'center', flexWrap: 'wrap' as const }}>
                          <button
                            onClick={() => handleEditCustomer(customer)}
                            style={styles.btn('#3b82f6', 'white')}
                            title="编辑"
                          >
                            ✏️
                          </button>
                          <button
                            onClick={() => handleManagePoints(customer)}
                            style={styles.btn('#f59e0b', 'white')}
                            title="管理积分"
                          >
                            ⭐
                          </button>
                          <button
                            onClick={() => handleRedeemPoints(customer)}
                            style={styles.btn('#10b981', 'white')}
                            title="积分兑换"
                          >
                            💰
                          </button>
                          <button
                            onClick={() => handleResetPoints(customer.id)}
                            style={styles.btn('#ef4444', 'white')}
                            title="重置积分"
                          >
                            🔄
                          </button>
                          <button
                            onClick={() => handleDeleteCustomer(customer.id)}
                            style={styles.btn('#dc2626', 'white')}
                            title="删除"
                          >
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 添加客户模态框 */}
      {showAddModal && (
        <div style={styles.modal}>
          <div style={styles.modalContent}>
            <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.25rem', fontWeight: 'bold' }}>
              ➕ 添加客户
            </h3>
            
            <div style={styles.formGroup}>
              <label style={styles.label}>姓名 *</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="请输入客户姓名"
                style={styles.formInput}
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>电话</label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="请输入电话号码"
                style={styles.formInput}
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>备注</label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="添加备注信息..."
                rows={3}
                style={styles.textarea}
              />
            </div>

            <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '1rem', marginTop: '0.5rem' }}>
              <div style={{ fontSize: '0.875rem', fontWeight: '600', color: '#374151', marginBottom: '0.75rem' }}>
                📱 社交账号（选填）
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ ...styles.label, fontSize: '0.75rem' }}>WhatsApp</label>
                  <input
                    type="text"
                    value={formData.whatsapp}
                    onChange={(e) => setFormData({ ...formData, whatsapp: e.target.value })}
                    placeholder="WhatsApp 号码"
                    style={styles.formInput}
                  />
                </div>
                
                <div>
                  <label style={{ ...styles.label, fontSize: '0.75rem' }}>Facebook</label>
                  <input
                    type="text"
                    value={formData.facebook}
                    onChange={(e) => setFormData({ ...formData, facebook: e.target.value })}
                    placeholder="Facebook 账号"
                    style={styles.formInput}
                  />
                </div>
                
                <div>
                  <label style={{ ...styles.label, fontSize: '0.75rem' }}>Instagram</label>
                  <input
                    type="text"
                    value={formData.instagram}
                    onChange={(e) => setFormData({ ...formData, instagram: e.target.value })}
                    placeholder="Instagram 账号"
                    style={styles.formInput}
                  />
                </div>
                
                <div>
                  <label style={{ ...styles.label, fontSize: '0.75rem' }}>Telegram</label>
                  <input
                    type="text"
                    value={formData.telegram}
                    onChange={(e) => setFormData({ ...formData, telegram: e.target.value })}
                    placeholder="Telegram 账号"
                    style={styles.formInput}
                  />
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setFormData({ name: '', phone: '', notes: '', whatsapp: '', facebook: '', instagram: '', telegram: '' });
                }}
                style={styles.btn('#f3f4f6', '#374151')}
              >
                取消
              </button>
              <button
                onClick={handleAddCustomer}
                style={styles.btn('#10b981', 'white')}
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 编辑客户模态框 */}
      {showEditModal && selectedCustomer && (
        <div style={styles.modal}>
          <div style={styles.modalContent}>
            <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.25rem', fontWeight: 'bold' }}>
              ✏️ 编辑客户
            </h3>
            
            <div style={styles.formGroup}>
              <label style={styles.label}>姓名 *</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                style={styles.formInput}
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>电话</label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                style={styles.formInput}
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>备注</label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={3}
                style={styles.textarea}
              />
            </div>

            <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '1rem', marginTop: '0.5rem' }}>
              <div style={{ fontSize: '0.875rem', fontWeight: '600', color: '#374151', marginBottom: '0.75rem' }}>
                📱 社交账号（选填）
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ ...styles.label, fontSize: '0.75rem' }}>WhatsApp</label>
                  <input
                    type="text"
                    value={formData.whatsapp}
                    onChange={(e) => setFormData({ ...formData, whatsapp: e.target.value })}
                    placeholder="WhatsApp 号码"
                    style={styles.formInput}
                  />
                </div>
                
                <div>
                  <label style={{ ...styles.label, fontSize: '0.75rem' }}>Facebook</label>
                  <input
                    type="text"
                    value={formData.facebook}
                    onChange={(e) => setFormData({ ...formData, facebook: e.target.value })}
                    placeholder="Facebook 账号"
                    style={styles.formInput}
                  />
                </div>
                
                <div>
                  <label style={{ ...styles.label, fontSize: '0.75rem' }}>Instagram</label>
                  <input
                    type="text"
                    value={formData.instagram}
                    onChange={(e) => setFormData({ ...formData, instagram: e.target.value })}
                    placeholder="Instagram 账号"
                    style={styles.formInput}
                  />
                </div>
                
                <div>
                  <label style={{ ...styles.label, fontSize: '0.75rem' }}>Telegram</label>
                  <input
                    type="text"
                    value={formData.telegram}
                    onChange={(e) => setFormData({ ...formData, telegram: e.target.value })}
                    placeholder="Telegram 账号"
                    style={styles.formInput}
                  />
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setShowEditModal(false);
                  setSelectedCustomer(null);
                  setFormData({ name: '', phone: '', notes: '', whatsapp: '', facebook: '', instagram: '', telegram: '' });
                }}
                style={styles.btn('#f3f4f6', '#374151')}
              >
                取消
              </button>
              <button
                onClick={handleSaveEdit}
                style={styles.btn('#10b981', 'white')}
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 积分管理模态框 */}
      {showPointsModal && selectedCustomer && (
        <div style={styles.modal}>
          <div style={styles.modalContent}>
            <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.25rem', fontWeight: 'bold' }}>
              ⭐ 积分管理
            </h3>
            
            <div style={{ marginBottom: '1rem', padding: '1rem', backgroundColor: '#f9fafb', borderRadius: '0.5rem' }}>
              <div style={{ marginBottom: '0.5rem' }}>
                <strong>客户：</strong>{selectedCustomer.name}
              </div>
              <div>
                <strong>当前积分：</strong>
                <span style={{ color: '#f59e0b', fontWeight: 'bold', fontSize: '1.25rem' }}>
                  {selectedCustomer.points.toLocaleString()}
                </span>
              </div>
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>增加积分</label>
              <input
                type="number"
                value={pointsAmount}
                onChange={(e) => setPointsAmount(parseInt(e.target.value) || 0)}
                placeholder="输入要增加的积分数量"
                min="0"
                style={styles.formInput}
              />
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setShowPointsModal(false);
                  setSelectedCustomer(null);
                  setPointsAmount(0);
                }}
                style={styles.btn('#f3f4f6', '#374151')}
              >
                取消
              </button>
              <button
                onClick={handleAddPoints}
                style={styles.btn('#f59e0b', 'white')}
              >
                确认添加
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 积分兑换模态框 */}
      {showRedeemModal && selectedCustomer && (
        <div style={styles.modal}>
          <div style={styles.modalContent}>
            <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.25rem', fontWeight: 'bold' }}>
              💰 积分兑换
            </h3>
            
            <div style={{ marginBottom: '1rem', padding: '1rem', backgroundColor: '#f9fafb', borderRadius: '0.5rem' }}>
              <div style={{ marginBottom: '0.5rem' }}>
                <strong>客户：</strong>{selectedCustomer.name}
              </div>
              <div style={{ marginBottom: '0.5rem' }}>
                <strong>可用积分：</strong>
                <span style={{ color: '#f59e0b', fontWeight: 'bold' }}>
                  {selectedCustomer.points.toLocaleString()}
                </span>
              </div>
              <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                兑换比例：{pointsExchangeRate} 积分 = C$ 1.00
              </div>
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>兑换积分</label>
              <input
                type="number"
                value={redeemAmount}
                onChange={(e) => setRedeemAmount(parseInt(e.target.value) || 0)}
                placeholder="输入要兑换的积分数量"
                min="0"
                max={selectedCustomer.points}
                style={styles.formInput}
              />
            </div>

            {redeemAmount > 0 && (
              <div style={{ marginBottom: '1rem', padding: '0.75rem', backgroundColor: '#d1fae5', borderRadius: '0.5rem', textAlign: 'center' }}>
                <div style={{ fontSize: '0.875rem', color: '#065f46' }}>可兑换金额</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#10b981' }}>
                  C$ {(redeemAmount / pointsExchangeRate).toFixed(2)}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setShowRedeemModal(false);
                  setSelectedCustomer(null);
                  setRedeemAmount(0);
                }}
                style={styles.btn('#f3f4f6', '#374151')}
              >
                取消
              </button>
              <button
                onClick={handleConfirmRedeem}
                style={styles.btn('#10b981', 'white')}
              >
                确认兑换
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomersModule;
