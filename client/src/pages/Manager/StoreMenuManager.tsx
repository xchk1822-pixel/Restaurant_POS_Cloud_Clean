import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { dataService } from '../../services/DataService';
import { getStoreMenu, createStoreMenu, updateStoreMenuPrice, setMenuAvailability } from '../../services/menuManagementService';
import { getDocuments } from '../../services/firestoreService';
import { COLLECTIONS } from '../../firebase/config';

interface MenuItem {
  id: string;
  name: string;
  nameEs?: string;
  price: number;
  category: string;
  image?: string;
  type?: 'dish' | 'beverage' | 'alcohol';
  available?: boolean;
  storeId?: string;
  isTemplate?: boolean;
  basePrice?: number;
  templateId?: string;
  stockItemId?: string;
  ingredients?: any[];
}

interface Store {
  id: string;
  name: string;
  code: string;
}

const StoreMenuManager: React.FC = () => {
  const { user } = useAuth();
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedStore, setSelectedStore] = useState<string>('');
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [showPriceEdit, setShowPriceEdit] = useState<string | null>(null);
  const [newPrice, setNewPrice] = useState<number>(0);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newMenuItem, setNewMenuItem] = useState({
    name: '',
    nameEs: '',
    price: 0,
    category: '主菜',
    type: 'recipe' as 'recipe' | 'direct',
    available: true,
  });

  useEffect(() => {
    loadStores();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selectedStore) {
      loadStoreMenu(selectedStore);
    }
  }, [selectedStore]);

  // ✅ 自动保存分店菜单到 DataService（会自动同步到 Firestore）
  useEffect(() => {
    if (selectedStore && menuItems.length > 0) {
      dataService.saveData('menu_items', menuItems);
      console.log('💾 分店菜单已保存:', selectedStore, '共', menuItems.length, '个菜品');
    }
  }, [menuItems]);

  const loadStores = async () => {
    const storesData = await getDocuments('stores');
    setStores(storesData as Store[]);
    
    // 默认选择第一个分店
    if (storesData.length > 0 && !selectedStore) {
      setSelectedStore((storesData[0] as Store).id);
    }
  };

  const loadStoreMenu = async (storeId: string) => {
    setLoading(true);
    try {
      // ✅ 先从 localStorage 加载
      const key = `store_menu_${storeId}`;
      const localData = localStorage.getItem(key);
      if (localData) {
        const parsed = JSON.parse(localData);
        console.log('📂 从 localStorage 加载分店菜单:', storeId, '共', parsed.length, '个菜品');
        setMenuItems(parsed);
      }
      
      // 🔥 然后从 Firestore 加载最新数据
      const menu = await getStoreMenu(storeId);
      if (menu.length > 0) {
        setMenuItems(menu);
        console.log('☁️ 从 Firestore 加载分店菜单:', storeId, '共', menu.length, '个菜品');
      }
    } catch (error) {
      console.error('加载菜单失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePrice = async (menuItemId: string) => {
    if (!selectedStore || newPrice <= 0) return;
    
    try {
      await updateStoreMenuPrice(selectedStore, menuItemId, newPrice);
      setShowPriceEdit(null);
      await loadStoreMenu(selectedStore);
      alert('✅ 价格已更新');
    } catch (error) {
      console.error('更新失败:', error);
      alert('❌ 更新失败');
    }
  };

  const handleToggleAvailability = async (menuItemId: string, currentAvailable: boolean) => {
    if (!selectedStore) return;
    
    try {
      await setMenuAvailability(selectedStore, menuItemId, !currentAvailable);
      await loadStoreMenu(selectedStore);
    } catch (error) {
      console.error('更新失败:', error);
    }
  };

  const handleCreateMenuItem = async () => {
    if (!selectedStore || !newMenuItem.name || newMenuItem.price <= 0) {
      alert('⚠️ 请填写完整信息');
      return;
    }

    try {
      await createStoreMenu(selectedStore, {
        name: newMenuItem.name,
        nameEs: newMenuItem.nameEs,
        price: newMenuItem.price,
        category: newMenuItem.category,
        type: newMenuItem.type,
        available: newMenuItem.available,
      });

      setShowAddForm(false);
      setNewMenuItem({
        name: '',
        nameEs: '',
        price: 0,
        category: '主菜',
        type: 'recipe',
        available: true,
      });
      await loadStoreMenu(selectedStore);
      alert('✅ 菜品创建成功');
    } catch (error) {
      console.error('创建失败:', error);
      alert('❌ 创建失败');
    }
  };

  const styles = {
    container: {
      padding: '2rem',
      maxWidth: '1400px',
      margin: '0 auto',
    },
    header: {
      marginBottom: '2rem',
    },
    title: {
      fontSize: '1.875rem',
      fontWeight: 'bold',
      marginBottom: '0.5rem',
    },
    subtitle: {
      color: '#6b7280',
    },
    controls: {
      display: 'flex',
      gap: '1rem',
      marginBottom: '2rem',
      alignItems: 'center',
    },
    select: {
      padding: '0.5rem 1rem',
      border: '1px solid #d1d5db',
      borderRadius: '0.375rem',
      fontSize: '1rem',
      minWidth: '200px',
    },
    stats: {
      display: 'flex',
      gap: '1rem',
      marginBottom: '2rem',
    },
    statCard: {
      flex: 1,
      background: 'white',
      padding: '1.5rem',
      borderRadius: '0.5rem',
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
    },
    statNumber: {
      fontSize: '2rem',
      fontWeight: 'bold',
      color: '#1f2937',
    },
    statLabel: {
      fontSize: '0.875rem',
      color: '#6b7280',
      marginTop: '0.25rem',
    },
    section: {
      background: 'white',
      borderRadius: '0.5rem',
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      padding: '1.5rem',
      marginBottom: '1.5rem',
    },
    sectionTitle: {
      fontSize: '1.25rem',
      fontWeight: '600',
      marginBottom: '1rem',
    },
    templateGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
      gap: '1rem',
    },
    templateCard: {
      padding: '1rem',
      border: '2px dashed #d1d5db',
      borderRadius: '0.5rem',
      cursor: 'pointer',
      transition: 'all 0.2s',
    },
    menuTable: {
      width: '100%',
      borderCollapse: 'collapse' as const,
    },
    th: {
      textAlign: 'left' as const,
      padding: '0.75rem',
      borderBottom: '2px solid #e5e7eb',
      fontWeight: '600',
      color: '#374151',
    },
    td: {
      padding: '0.75rem',
      borderBottom: '1px solid #e5e7eb',
    },
    badge: (available: boolean) => ({
      display: 'inline-block',
      padding: '0.25rem 0.75rem',
      borderRadius: '9999px',
      fontSize: '0.75rem',
      fontWeight: '600',
      backgroundColor: available ? '#d1fae5' : '#fee2e2',
      color: available ? '#065f46' : '#991b1b',
    }),
    button: {
      padding: '0.5rem 1rem',
      backgroundColor: '#3b82f6',
      color: 'white',
      border: 'none',
      borderRadius: '0.375rem',
      cursor: 'pointer',
      fontSize: '0.875rem',
    },
    input: {
      padding: '0.5rem',
      border: '1px solid #d1d5db',
      borderRadius: '0.375rem',
      width: '100px',
    },
  };

  if (!user || user.role !== 'super_admin') {
    return (
      <div style={styles.container}>
        <div style={{ textAlign: 'center', padding: '4rem', color: '#6b7280' }}>
          🔒 仅超级管理员可以管理菜单
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>🍽️ 分店菜单管理</h1>
        <p style={styles.subtitle}>为每个分店设置独立的菜单和价格</p>
      </div>

      {/* 分店选择 */}
      <div style={styles.controls}>
        <label style={{ fontWeight: '600' }}>选择分店：</label>
        <select 
          value={selectedStore} 
          onChange={(e) => setSelectedStore(e.target.value)}
          style={styles.select}
        >
          <option value="">请选择分店</option>
          {stores.map(store => (
            <option key={store.id} value={store.id}>
              {store.name} ({store.code})
            </option>
          ))}
        </select>
      </div>

      {selectedStore && (
        <>
          {/* 统计信息 */}
          <div style={styles.stats}>
            <div style={styles.statCard}>
              <div style={styles.statNumber}>{menuItems.length}</div>
              <div style={styles.statLabel}>菜品总数</div>
            </div>
            <div style={styles.statCard}>
              <div style={styles.statNumber}>
                {menuItems.filter(item => item.available !== false).length}
              </div>
              <div style={styles.statLabel}>在售菜品</div>
            </div>
            <div style={styles.statCard}>
              <div style={styles.statNumber}>
                {Array.from(new Set(menuItems.map(item => item.category))).length}
              </div>
              <div style={styles.statLabel}>分类数量</div>
            </div>
          </div>

          {/* 操作按钮 */}
          <div style={{ marginBottom: '1.5rem' }}>
            <button 
              onClick={() => setShowAddForm(!showAddForm)}
              style={{
                padding: '0.75rem 1.5rem',
                backgroundColor: showAddForm ? '#ef4444' : '#10b981',
                color: 'white',
                border: 'none',
                borderRadius: '0.5rem',
                cursor: 'pointer',
                fontWeight: '600',
                fontSize: '1rem',
              }}
            >
              {showAddForm ? '❌ 取消' : '➕ 创建新菜品'}
            </button>
          </div>

          {/* 创建菜品表单 */}
          {showAddForm && (
            <div style={styles.section}>
              <h2 style={styles.sectionTitle}>➕ 创建新菜品</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem', marginBottom: '1rem' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>菜品名称 *</label>
                  <input
                    type="text"
                    value={newMenuItem.name}
                    onChange={(e) => setNewMenuItem({ ...newMenuItem, name: e.target.value })}
                    placeholder="例如：宫保鸡丁"
                    style={{ ...styles.input, width: '100%' }}
                  />
                </div>
                
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>西班牙语名称</label>
                  <input
                    type="text"
                    value={newMenuItem.nameEs}
                    onChange={(e) => setNewMenuItem({ ...newMenuItem, nameEs: e.target.value })}
                    placeholder="例如：Pollo Kung Pao"
                    style={{ ...styles.input, width: '100%' }}
                  />
                </div>
                
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>价格 (C$) *</label>
                  <input
                    type="number"
                    value={newMenuItem.price || ''}
                    onChange={(e) => setNewMenuItem({ ...newMenuItem, price: parseFloat(e.target.value) || 0 })}
                    placeholder="0"
                    style={{ ...styles.input, width: '100%' }}
                  />
                </div>
                
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>分类</label>
                  <select
                    value={newMenuItem.category}
                    onChange={(e) => setNewMenuItem({ ...newMenuItem, category: e.target.value })}
                    style={{ ...styles.select, width: '100%' }}
                  >
                    <option value="主菜">主菜</option>
                    <option value="小吃">小吃</option>
                    <option value="汤类">汤类</option>
                    <option value="主食">主食</option>
                    <option value="甜点">甜点</option>
                    <option value="饮料">饮料</option>
                    <option value="酒水">酒水</option>
                  </select>
                </div>
                
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>类型</label>
                  <select
                    value={newMenuItem.type}
                    onChange={(e) => setNewMenuItem({ ...newMenuItem, type: e.target.value as any })}
                    style={{ ...styles.select, width: '100%' }}
                  >
                    <option value="recipe">📝 需要配方（按配方扣原料）</option>
                    <option value="direct">📦 直接扣库存（成品销售）</option>
                  </select>
                </div>
                
                <div style={{ display: 'flex', alignItems: 'center', paddingTop: '1.5rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={newMenuItem.available}
                      onChange={(e) => setNewMenuItem({ ...newMenuItem, available: e.target.checked })}
                      style={{ marginRight: '0.5rem', width: '18px', height: '18px' }}
                    />
                    <span>立即上架销售</span>
                  </label>
                </div>
              </div>
              
              <button 
                onClick={handleCreateMenuItem}
                style={{
                  padding: '0.75rem 2rem',
                  backgroundColor: '#3b82f6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.5rem',
                  cursor: 'pointer',
                  fontWeight: '600',
                  fontSize: '1rem',
                }}
              >
                💾 保存菜品
              </button>
            </div>
          )}

          {/* 分店菜单列表 */}
          <div style={styles.section}>
            <h2 style={styles.sectionTitle}>🏪 当前分店菜单</h2>
            
            {loading ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
                加载中...
              </div>
            ) : menuItems.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: '#9ca3af' }}>
                暂无菜品，请从上方模板添加
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={styles.menuTable}>
                  <thead>
                    <tr>
                      <th style={styles.th}>菜品名称</th>
                      <th style={styles.th}>分类</th>
                      <th style={styles.th}>类型</th>
                      <th style={styles.th}>价格</th>
                      <th style={styles.th}>状态</th>
                      <th style={styles.th}>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {menuItems.map(item => (
                      <tr key={item.id}>
                        <td style={styles.td}>
                          <div style={{ fontWeight: '600' }}>{item.name}</div>
                          <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>{item.nameEs}</div>
                        </td>
                        <td style={styles.td}>{item.category}</td>
                        <td style={styles.td}>
                          {item.type === 'dish' && '🍽️ 菜品'}
                          {item.type === 'beverage' && '🥤 饮料'}
                          {item.type === 'alcohol' && '🍺 酒水'}
                        </td>
                        <td style={styles.td}>
                          {showPriceEdit === item.id ? (
                            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                              <input
                                type="number"
                                value={newPrice}
                                onChange={(e) => setNewPrice(parseFloat(e.target.value))}
                                style={styles.input}
                                autoFocus
                              />
                              <button 
                                onClick={() => handleUpdatePrice(item.id)}
                                style={{ ...styles.button, backgroundColor: '#10b981' }}
                              >
                                保存
                              </button>
                              <button 
                                onClick={() => setShowPriceEdit(null)}
                                style={{ ...styles.button, backgroundColor: '#6b7280' }}
                              >
                                取消
                              </button>
                            </div>
                          ) : (
                            <div style={{ fontWeight: '600', color: '#2563eb' }}>
                              C${item.price}
                            </div>
                          )}
                        </td>
                        <td style={styles.td}>
                          <span style={styles.badge(item.available !== false)}>
                            {item.available !== false ? '✅ 在售' : '❌ 停售'}
                          </span>
                        </td>
                        <td style={styles.td}>
                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button 
                              onClick={() => {
                                setNewPrice(item.price);
                                setShowPriceEdit(item.id);
                              }}
                              style={{ ...styles.button, backgroundColor: '#f59e0b' }}
                            >
                              💰 改价
                            </button>
                            <button 
                              onClick={() => handleToggleAvailability(item.id, item.available !== false)}
                              style={{ 
                                ...styles.button, 
                                backgroundColor: item.available !== false ? '#ef4444' : '#10b981' 
                              }}
                            >
                              {item.available !== false ? '🚫 停售' : '✅ 上架'}
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
        </>
      )}
    </div>
  );
};

export default StoreMenuManager;
