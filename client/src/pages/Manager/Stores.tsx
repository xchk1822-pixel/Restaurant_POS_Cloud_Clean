import React, { useCallback, useEffect, useState } from 'react';
import { getLocalDateString } from '../../utils/localTime';
import { smartDeleteDocument, smartGetDocuments, smartSetDocument } from '../../services/smartSyncService';
import { createFirebaseUser } from '../../services/FirebaseAuthService';

interface Store {
  id: string;
  name: string;
  code: string;
  address: string;
  phone: string;
  status: 'active' | 'inactive';
  openDate: string;
  currency: string;
  taxRate: number;
  businessHours: string;
}

const getStoreDedupeKey = (store: any): string => {
  const code = String(store?.code || '').trim().toLowerCase();
  return code ? `code:${code}` : `id:${String(store?.id || '').trim()}`;
};

const getLocalRecords = (key: string): any[] => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

const saveLocalRecords = (key: string, records: any[]) => {
  localStorage.setItem(key, JSON.stringify(records));
};

const dedupeStores = (records: any[]): Store[] => {
  const map = new Map<string, any>();
  records.forEach(record => {
    if (!record?.id) return;
    const key = getStoreDedupeKey(record);
    const existing = map.get(key);
    const currentTime = Date.parse(record?.updatedAt || record?.lastModified || record?.createdAt || record?.openDate || '') || 0;
    const existingTime = Date.parse(existing?.updatedAt || existing?.lastModified || existing?.createdAt || existing?.openDate || '') || 0;
    if (!existing || currentTime >= existingTime) map.set(key, record);
  });
  return Array.from(map.values()) as Store[];
};

const dedupeUsers = (records: any[]): any[] => {
  const map = new Map<string, any>();
  records.forEach(record => {
    const username = String(record?.username || '').trim().toLowerCase();
    if (!username) return;
    const existing = map.get(username);
    const currentTime = Date.parse(record?.updatedAt || record?.createdAt || '') || 0;
    const existingTime = Date.parse(existing?.updatedAt || existing?.createdAt || '') || 0;
    if (!existing || currentTime >= existingTime) map.set(username, record);
  });
  return Array.from(map.values());
};

interface User {
  id: string;
  username: string;
  password?: string;
  name: string;
  role: 'store_manager' | 'cashier' | 'waiter' | 'chef';
  storeId: string;
  storeName: string;
  email?: string;
  createdAt: string;
  status: 'active' | 'inactive';
}

const StoresModule: React.FC = () => {
  const [stores, setStores] = useState<Store[]>(() => dedupeStores(getLocalRecords('stores')));
  const [users, setUsers] = useState<User[]>(() => dedupeUsers(getLocalRecords('users')));
  const [selectedStore, setSelectedStore] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'info' | 'users'>('info');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  
  // 创建分店向导
  const [showCreateWizard, setShowCreateWizard] = useState(false);
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3>(1);
  const [newStore, setNewStore] = useState<Partial<Store>>({
    name: '', code: '', address: '', phone: '', status: 'active',
    openDate: getLocalDateString(), // 🔥 使用本地时间
    currency: 'C$',
    taxRate: 0, businessHours: '09:00-22:00',
  });
  const [newAccounts, setNewAccounts] = useState({
    manager: { username: '', password: '', name: '' },
    cashier: { username: '', password: '', name: '' },
    waiter: { username: '', password: '', name: '' },
    chef: { username: '', password: '', name: '' },
  });
  
  // 编辑分店
  const [showEditStore, setShowEditStore] = useState(false);
  const [editingStore, setEditingStore] = useState<Store | null>(null);
  
  // 添加/编辑用户
  const [showUserModal, setShowUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [userForm, setUserForm] = useState({
    username: '', password: '', name: '',
    role: 'cashier' as 'store_manager' | 'cashier' | 'waiter' | 'chef',
  });

  const usernameExists = (username: string, exceptUserId?: string) => {
    const normalized = username.trim().toLowerCase();
    return users.some(user =>
      user.id !== exceptUserId &&
      String(user.username || '').trim().toLowerCase() === normalized
    );
  };

  const persistStores = async (nextStores: Store[]) => {
    const normalizedStores = dedupeStores(nextStores);
    setStores(normalizedStores);
    saveLocalRecords('stores', normalizedStores);
    await Promise.all(normalizedStores.map(store => smartSetDocument('stores', store.id, store)));
  };

  const toCloudUser = (user: User): User => {
    const { password, ...safeUser } = user;
    return safeUser as User;
  };

  const persistUsers = async (nextUsers: User[]) => {
    const normalizedUsers = (dedupeUsers(nextUsers) as User[]).map(toCloudUser);
    setUsers(normalizedUsers);
    saveLocalRecords('users', normalizedUsers);
    await Promise.all(normalizedUsers.map(user => smartSetDocument('users', user.id, user)));
  };

  const createAuthBackedUser = async (user: User): Promise<User> => {
    if (!user.password) {
      throw new Error(`账号 ${user.username} 缺少初始密码`);
    }

    const created = await createFirebaseUser(user.username, user.password, {
      username: user.username,
      name: user.name,
      role: user.role,
      storeId: user.storeId,
      storeName: user.storeName,
      email: `${user.username}@restaurant.local`,
    });

    return {
      ...user,
      id: created.id,
      email: created.email,
      password: undefined,
    };
  };

  const refreshStoresData = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const [cloudStores, cloudUsers] = await Promise.all([
        smartGetDocuments('stores', true),
        smartGetDocuments('users', true),
      ]);
      const normalizedUsers = (dedupeUsers(cloudUsers) as User[]).map(toCloudUser);
      const normalizedStores = dedupeStores(cloudStores);
      setStores(normalizedStores);
      setUsers(normalizedUsers);
      saveLocalRecords('stores', normalizedStores);
      saveLocalRecords('users', normalizedUsers);
      setLastSyncedAt(new Date());
    } catch (error) {
      console.error('\u5237\u65b0\u5206\u5e97\u548c\u8d26\u53f7\u5931\u8d25:', error);
      alert('\u5237\u65b0\u5206\u5e97\u548c\u8d26\u53f7\u5931\u8d25\uff0c\u8bf7\u68c0\u67e5\u7f51\u7edc\u540e\u91cd\u8bd5');
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    refreshStoresData();
  }, [refreshStoresData]);

  const handleCompleteCreate = async () => {
    if (!newStore.name || !newStore.code) {
      alert('请填写分店名称和代码');
      return;
    }

    const storeId = `store_${Date.now()}`;
    const store: Store = {
      id: storeId,
      name: newStore.name!,
      code: newStore.code!,
      address: newStore.address || '',
      phone: newStore.phone || '',
      status: newStore.status || 'active',
      openDate: newStore.openDate || getLocalDateString(), // 🔥 使用本地时间
      currency: newStore.currency || 'C$',
      taxRate: newStore.taxRate || 0,
      businessHours: newStore.businessHours || '09:00-22:00',
    };

    const wizardUsernames = [
      newAccounts.manager.username,
      newAccounts.cashier.username,
      newAccounts.waiter.username,
      newAccounts.chef.username,
    ].map(value => value.trim().toLowerCase()).filter(Boolean);
    if (new Set(wizardUsernames).size !== wizardUsernames.length) {
      alert('\u540c\u4e00\u6b21\u521b\u5efa\u4e2d\u5b58\u5728\u91cd\u590d\u8d26\u53f7\uff0c\u8bf7\u4fee\u6539\u540e\u518d\u4fdd\u5b58');
      return;
    }
    const existingUsername = wizardUsernames.find(username => usernameExists(username));
    if (existingUsername) {
      alert(`账号 ${existingUsername} 已存在，请更换用户名`);
      return;
    }

    const updatedStores = [...stores, store];

    const newUsers: User[] = [];
    if (newAccounts.manager.username && newAccounts.manager.password) {
      if (usernameExists(newAccounts.manager.username)) {
        alert(`账号 ${newAccounts.manager.username} 已存在，请更换用户名`);
        return;
      }
      newUsers.push({
        id: `user_${Date.now()}_m`,
        username: newAccounts.manager.username,
        password: newAccounts.manager.password,
        name: newAccounts.manager.name || '店长',
        role: 'store_manager',
        storeId,
        storeName: store.name,
        createdAt: getLocalDateString(), // 🔥 使用本地时间
        status: 'active',
      });
    }
    if (newAccounts.cashier.username && newAccounts.cashier.password) {
      if (usernameExists(newAccounts.cashier.username)) {
        alert(`账号 ${newAccounts.cashier.username} 已存在，请更换用户名`);
        return;
      }
      newUsers.push({
        id: `user_${Date.now()}_c`,
        username: newAccounts.cashier.username,
        password: newAccounts.cashier.password,
        name: newAccounts.cashier.name || '收银员',
        role: 'cashier',
        storeId,
        storeName: store.name,
        createdAt: getLocalDateString(), // 🔥 使用本地时间
        status: 'active',
      });
    }
    if (newAccounts.chef.username && newAccounts.chef.password) {
      if (usernameExists(newAccounts.chef.username)) {
        alert(`账号 ${newAccounts.chef.username} 已存在，请更换用户名`);
        return;
      }
      newUsers.push({
        id: `user_${Date.now()}_ch`,
        username: newAccounts.chef.username,
        password: newAccounts.chef.password,
        name: newAccounts.chef.name || '厨师',
        role: 'chef',
        storeId,
        storeName: store.name,
        createdAt: getLocalDateString(), // 🔥 使用本地时间
        status: 'active',
      });
    }
    if (newAccounts.waiter.username && newAccounts.waiter.password) {
      if (usernameExists(newAccounts.waiter.username)) {
        alert(`账号 ${newAccounts.waiter.username} 已存在，请更换用户名`);
        return;
      }
      newUsers.push({
        id: `user_${Date.now()}_w`,
        username: newAccounts.waiter.username,
        password: newAccounts.waiter.password,
        name: newAccounts.waiter.name || '服务生',
        role: 'waiter',
        storeId,
        storeName: store.name,
        createdAt: getLocalDateString(), // 🔥 使用本地时间
        status: 'active',
      });
    }

    try {
      if (newUsers.length > 0) {
        const createdUsers: User[] = [];
        for (const newUser of newUsers) {
          createdUsers.push(await createAuthBackedUser(newUser));
        }
        await persistStores(updatedStores);
        await persistUsers([...users, ...createdUsers]);
      } else {
        await persistStores(updatedStores);
      }
    } catch (error: any) {
      console.error('创建分店账号失败:', error);
      alert(error?.message || '创建分店账号失败，请检查网络后重试');
      return;
    }

    alert('✅ 分店及账号创建成功！');
    setShowCreateWizard(false);
    resetWizard();
    setSelectedStore(storeId);
  };

  const resetWizard = () => {
    setWizardStep(1);
    setNewStore({
      name: '', code: '', address: '', phone: '', status: 'active',
      openDate: getLocalDateString(), // 🔥 使用本地时间
      currency: 'C$', taxRate: 0, businessHours: '09:00-22:00',
    });
    setNewAccounts({
      manager: { username: '', password: '', name: '' },
      cashier: { username: '', password: '', name: '' },
      waiter: { username: '', password: '', name: '' },
      chef: { username: '', password: '', name: '' },
    });
  };

  const handleDeleteStore = async (storeId: string) => {
    if (!window.confirm('\u786e\u5b9a\u8981\u5220\u9664\u6b64\u5206\u5e97\u5417\uff1f')) return;

    const removedUsers = users.filter(u => u.storeId === storeId);
    const updatedStores = stores.filter(s => s.id !== storeId);
    const updatedUsers = users.filter(u => u.storeId !== storeId);

    await Promise.all([
      smartDeleteDocument('stores', storeId),
      ...removedUsers.map(user => smartDeleteDocument('users', user.id)),
    ]);
    await persistStores(updatedStores);
    await persistUsers(updatedUsers);

    if (selectedStore === storeId) setSelectedStore('');
  };

  const handleDeleteUser = async (userId: string) => {
    if (!window.confirm('\u786e\u5b9a\u8981\u5220\u9664\u6b64\u8d26\u53f7\u5417\uff1f')) return;
    const updated = users.filter(u => u.id !== userId);
    await smartDeleteDocument('users', userId);
    await persistUsers(updated);
  };

  const handleResetPassword = async () => {
    alert('密码现在由 Firebase Auth 管理。为了避免本地密码和云端登录密码不一致，后台重置密码需要后续接入安全管理接口。');
  };

  // 编辑分店
  const handleEditStore = (store: Store) => {
    setEditingStore(store);
    setShowEditStore(true);
  };

  const handleSaveStore = async () => {
    if (!editingStore) return;
    const updated = dedupeStores(stores.map(s => s.id === editingStore.id ? editingStore : s));
    setStores(updated);
    saveLocalRecords('stores', updated);
    await smartSetDocument('stores', editingStore.id, editingStore);
    setShowEditStore(false);
    setEditingStore(null);
    alert('✅ 分店信息已更新');
  };

  // 添加用户
  const handleAddUser = () => {
    setEditingUser(null);
    setUserForm({ username: '', password: '', name: '', role: 'cashier' });
    setShowUserModal(true);
  };

  // 编辑用户
  const handleEditUser = (user: User) => {
    setEditingUser(user);
    setUserForm({
      username: user.username,
      password: user.password || '',
      name: user.name,
      role: user.role,
    });
    setShowUserModal(true);
  };

  const handleSaveUser = async () => {
    if (!userForm.username || !selectedStore || (!editingUser && !userForm.password)) {
      alert('请填写完整信息');
      return;
    }

    const store = stores.find(s => s.id === selectedStore);
    if (!store) return;

    if (usernameExists(userForm.username, editingUser?.id)) {
      alert(`账号 ${userForm.username} 已存在，请更换用户名`);
      return;
    }

    if (editingUser) {
      if (userForm.username.trim().toLowerCase() !== editingUser.username.trim().toLowerCase()) {
        alert('用户名对应 Firebase Auth 登录账号，暂不支持直接修改用户名；如需更换，请新建账号。');
        return;
      }
      // 编辑现有用户
      const updatedUser = {
        ...editingUser,
        username: editingUser.username,
        password: undefined,
        name: userForm.name,
        role: userForm.role,
      };
      const updated = users.map(u => u.id === editingUser.id ? updatedUser : u);
      setUsers(updated);
    await persistUsers(updated);
      alert('✅ 账号已更新');
    } else {
      // 添加新用户
      const newUser: User = {
        id: `pending_${Date.now()}`,
        username: userForm.username,
        password: userForm.password,
        name: userForm.name,
        role: userForm.role,
        storeId: selectedStore,
        storeName: store.name,
        createdAt: getLocalDateString(), // 🔥 使用本地时间
        status: 'active',
      };
      let authUser: User;
      try {
        authUser = await createAuthBackedUser(newUser);
      } catch (error: any) {
        console.error('创建账号失败:', error);
        alert(error?.message || '创建账号失败，请检查网络后重试');
        return;
      }
      const updated = [...users, authUser];
      setUsers(updated);
    await persistUsers(updated);
      alert('✅ 账号已创建');
    }

    setShowUserModal(false);
    setEditingUser(null);
  };

  const selectedStoreData = stores.find(s => s.id === selectedStore);
  const storeUsers = users.filter(u => u.storeId === selectedStore);

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
    subtitle: {
      color: '#6b7280',
      marginTop: '0.5rem',
      fontSize: '0.875rem',
    },
    btn: (color: string) => ({ 
      padding: '0.5rem 1rem', 
      backgroundColor: color, 
      color: 'white', 
      border: 'none', 
      borderRadius: '0.5rem', 
      cursor: 'pointer', 
      fontWeight: '600',
      fontSize: '0.875rem',
    }),
    contentWrapper: {
      display: 'flex',
      gap: '1.5rem',
      flex: 1,
      overflow: 'hidden',
    },
    storesPanel: {
      width: '350px',
      flexShrink: 0 as const,
      display: 'flex',
      flexDirection: 'column' as const,
      background: 'white',
      borderRadius: '0.75rem',
      boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
      overflow: 'hidden',
    },
    storesHeader: {
      padding: '1rem 1.5rem',
      borderBottom: '1px solid #e5e7eb',
      fontWeight: '600',
      fontSize: '1rem',
      flexShrink: 0 as const,
    },
    storesList: {
      flex: 1,
      overflowY: 'auto' as const,
      padding: '1rem',
    },
    storeCard: (isSelected: boolean) => ({ 
      background: isSelected ? '#eff6ff' : 'white', 
      borderRadius: '0.5rem', 
      padding: '1rem', 
      cursor: 'pointer', 
      border: isSelected ? '2px solid #3b82f6' : '1px solid #e5e7eb',
      transition: 'all 0.2s',
      marginBottom: '0.75rem',
    }),
    detailPanel: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column' as const,
      background: 'white', 
      borderRadius: '0.75rem', 
      boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
      overflow: 'hidden',
    },
    tabs: { 
      display: 'flex', 
      gap: '0.5rem', 
      marginBottom: '1.5rem',
      flexShrink: 0 as const,
    },
    tab: (active: boolean) => ({ 
      padding: '0.75rem 1.5rem', 
      backgroundColor: active ? '#3b82f6' : 'white', 
      color: active ? 'white' : '#6b7280', 
      border: 'none', 
      borderRadius: '0.5rem', 
      cursor: 'pointer', 
      fontWeight: '600',
      fontSize: '0.875rem',
      transition: 'all 0.2s',
    }),
    contentArea: {
      flex: 1,
      overflowY: 'auto' as const,
    },
    table: { 
      width: '100%', 
      borderCollapse: 'collapse' as const, 
    },
    th: { 
      textAlign: 'left' as const, 
      padding: '0.75rem', 
      borderBottom: '2px solid #e5e7eb', 
      fontWeight: '600',
      position: 'sticky' as const,
      top: 0,
      backgroundColor: 'white',
      zIndex: 1,
    },
    td: { 
      padding: '0.75rem', 
      borderBottom: '1px solid #e5e7eb',
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
      background: 'white', 
      borderRadius: '1rem', 
      padding: '2rem', 
      maxWidth: '800px', 
      width: '90%', 
      maxHeight: '80vh', 
      overflowY: 'auto' as const,
    },
    formGroup: { 
      marginBottom: '1rem',
    },
    label: { 
      display: 'block', 
      fontWeight: '600', 
      marginBottom: '0.5rem', 
      color: '#374151',
      fontSize: '0.875rem',
    },
    input: { 
      width: '100%', 
      padding: '0.5rem 0.75rem', 
      border: '1px solid #d1d5db', 
      borderRadius: '0.375rem', 
      fontSize: '0.9rem',
    },
    grid2: { 
      display: 'grid', 
      gridTemplateColumns: '1fr 1fr', 
      gap: '1rem',
    },
    stepIndicator: { 
      display: 'flex', 
      justifyContent: 'center', 
      gap: '2rem', 
      marginBottom: '2rem',
    },
    step: (active: boolean, completed: boolean) => ({ 
      display: 'flex', 
      alignItems: 'center', 
      gap: '0.5rem', 
      color: completed ? '#10b981' : active ? '#3b82f6' : '#9ca3af', 
      fontWeight: '600',
    }),
    infoGrid: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: '1rem',
    },
    infoItem: {
      padding: '0.75rem',
      backgroundColor: '#f9fafb',
      borderRadius: '0.5rem',
    },
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>🏪 分店管理</h1>
          <p style={{ color: '#6b7280', marginTop: '0.5rem' }}>管理所有分店及其账号</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {lastSyncedAt && (
            <span style={{ fontSize: '0.8rem', color: '#6b7280', whiteSpace: 'nowrap' }}>
              {'\u6700\u540e\u540c\u6b65 '} {lastSyncedAt.toLocaleTimeString('es-NI', { hour12: false })}
            </span>
          )}
          <button
            onClick={refreshStoresData}
            disabled={isRefreshing}
            style={{
              ...styles.btn(isRefreshing ? '#9ca3af' : '#6366f1'),
              cursor: isRefreshing ? 'not-allowed' : 'pointer',
            }}
          >
            {isRefreshing ? '\u540c\u6b65\u4e2d...' : '\u5237\u65b0\u4e91\u7aef\u6570\u636e'}
          </button>
          <button onClick={() => setShowCreateWizard(true)} style={styles.btn('#3b82f6')}>➕ 创建分店</button>
        </div>
      </div>

      <div style={styles.contentWrapper}>
        {/* 左侧分店列表 */}
        <div style={styles.storesPanel}>
          <div style={styles.storesHeader}>🏪 分店列表 ({stores.length})</div>
          <div style={styles.storesList}>
            {stores.map(store => (
              <div 
                key={store.id} 
                style={styles.storeCard(selectedStore === store.id)} 
                onClick={() => { setSelectedStore(store.id); setActiveTab('info'); }}
              >
                <h3 style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '0.5rem' }}>{store.name}</h3>
                <div style={{ color: '#6b7280', fontSize: '0.875rem', lineHeight: '1.6' }}>
                  <div>代码: {store.code}</div>
                  <div>地址: {store.address || '未设置'}</div>
                  <div>电话: {store.phone || '未设置'}</div>
                  <div style={{ marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid #e5e7eb' }}>
                    账号数: {users.filter(u => u.storeId === store.id).length}
                  </div>
                </div>
              </div>
            ))}
            {stores.length === 0 && (
              <div style={{ textAlign: 'center', padding: '2rem', color: '#9ca3af' }}>
                暂无分店，点击右上角创建
              </div>
            )}
          </div>
        </div>

        {/* 右侧详情面板 */}
        {selectedStoreData ? (
          <div style={styles.detailPanel}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.5rem', borderBottom: '1px solid #e5e7eb' }}>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', margin: 0 }}>{selectedStoreData.name}</h2>
              <button onClick={() => handleDeleteStore(selectedStore)} style={styles.btn('#ef4444')}>🗑️ 删除分店</button>
            </div>

            <div style={{ ...styles.tabs, padding: '1rem 1.5rem 0', borderBottom: '1px solid #e5e7eb' }}>
              <button onClick={() => setActiveTab('info')} style={styles.tab(activeTab === 'info')}>📋 基本信息</button>
              <button onClick={() => setActiveTab('users')} style={styles.tab(activeTab === 'users')}>👥 账号管理 ({storeUsers.length})</button>
            </div>

            <div style={styles.contentArea}>
              {activeTab === 'info' && (
                <div style={{ padding: '1.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
                    <button onClick={() => handleEditStore(selectedStoreData)} style={styles.btn('#3b82f6')}>
                      ✏️ 编辑分店信息
                    </button>
                  </div>
                  <div style={styles.infoGrid}>
                    <div style={styles.infoItem}><strong>分店代码:</strong> {selectedStoreData.code}</div>
                    <div style={styles.infoItem}><strong>地址:</strong> {selectedStoreData.address || '未设置'}</div>
                    <div style={styles.infoItem}><strong>电话:</strong> {selectedStoreData.phone || '未设置'}</div>
                    <div style={styles.infoItem}><strong>货币:</strong> {selectedStoreData.currency}</div>
                    <div style={styles.infoItem}><strong>税率:</strong> {selectedStoreData.taxRate}%</div>
                    <div style={styles.infoItem}><strong>营业时间:</strong> {selectedStoreData.businessHours}</div>
                    <div style={styles.infoItem}><strong>开业日期:</strong> {selectedStoreData.openDate}</div>
                    <div style={styles.infoItem}><strong>状态:</strong> {selectedStoreData.status === 'active' ? '✅ 营业中' : '❌ 已停业'}</div>
                  </div>
                </div>
              )}

              {activeTab === 'users' && (
                <div style={{ padding: '1.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <div style={{ color: '#6b7280' }}>管理该分店的所有账号</div>
                    <button onClick={handleAddUser} style={styles.btn('#10b981')}>
                      ➕ 添加账号
                    </button>
                  </div>
                  {storeUsers.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>暂无账号，点击上方按钮添加</div>
                  ) : (
                    <table style={styles.table}>
                      <thead>
                        <tr>
                          <th style={styles.th}>姓名</th>
                          <th style={styles.th}>用户名</th>
                          <th style={styles.th}>角色</th>
                          <th style={styles.th}>操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {storeUsers.map(user => (
                          <tr key={user.id}>
                            <td style={styles.td}>{user.name}</td>
                            <td style={styles.td}>{user.username}</td>
                            <td style={styles.td}>
                              {user.role === 'store_manager' && '🏢 店长'}
                              {user.role === 'cashier' && '💰 收银员'}
                              {user.role === 'waiter' && '🍽️ 服务生'}
                              {user.role === 'chef' && '👨‍🍳 厨师'}
                            </td>
                            <td style={styles.td}>
                              <button onClick={() => handleEditUser(user)} style={{ ...styles.btn('#3b82f6'), marginRight: '0.5rem', padding: '0.5rem 1rem' }}>✏️ 编辑</button>
                              <button onClick={handleResetPassword} style={{ ...styles.btn('#f59e0b'), marginRight: '0.5rem', padding: '0.5rem 1rem' }}>🔑 重置密码</button>
                              <button onClick={() => handleDeleteUser(user.id)} style={{ ...styles.btn('#ef4444'), padding: '0.5rem 1rem' }}>🗑️ 删除</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div style={{ ...styles.detailPanel, alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ textAlign: 'center', color: '#9ca3af' }}>
              <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>👈</div>
              <div style={{ fontSize: '1.25rem', fontWeight: '600' }}>请选择一个分店查看详情</div>
            </div>
          </div>
        )}
      </div>

      {showCreateWizard && (
        <div style={styles.modal} onClick={() => { setShowCreateWizard(false); resetWizard(); }}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '1.5rem' }}>创建新分店</h2>

            <div style={styles.stepIndicator}>
              <div style={styles.step(wizardStep >= 1, wizardStep > 1)}>{wizardStep > 1 ? '✓' : '1'} 分店信息</div>
              <div style={styles.step(wizardStep >= 2, wizardStep > 2)}>{wizardStep > 2 ? '✓' : '2'} 创建账号</div>
              <div style={styles.step(wizardStep >= 3, false)}>3 完成</div>
            </div>

            {wizardStep === 1 && (
              <div>
                <div style={styles.grid2}>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>分店名称 *</label>
                    <input type="text" value={newStore.name} onChange={(e) => setNewStore({ ...newStore, name: e.target.value })} style={styles.input} />
                  </div>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>分店代码 *</label>
                    <input type="text" value={newStore.code} onChange={(e) => setNewStore({ ...newStore, code: e.target.value })} style={styles.input} />
                  </div>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>地址</label>
                    <input type="text" value={newStore.address} onChange={(e) => setNewStore({ ...newStore, address: e.target.value })} style={styles.input} />
                  </div>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>电话</label>
                    <input type="text" value={newStore.phone} onChange={(e) => setNewStore({ ...newStore, phone: e.target.value })} style={styles.input} />
                  </div>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>货币单位</label>
                    <input type="text" value={newStore.currency} onChange={(e) => setNewStore({ ...newStore, currency: e.target.value })} style={styles.input} />
                  </div>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>税率 (%)</label>
                    <input type="number" value={newStore.taxRate} onChange={(e) => setNewStore({ ...newStore, taxRate: parseFloat(e.target.value) || 0 })} style={styles.input} />
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '2rem' }}>
                  <button onClick={() => setShowCreateWizard(false)} style={styles.btn('#6b7280')}>取消</button>
                  <button onClick={() => setWizardStep(2)} style={styles.btn('#3b82f6')}>下一步 →</button>
                </div>
              </div>
            )}

            {wizardStep === 2 && (
              <div>
                <div style={{ backgroundColor: '#eff6ff', padding: '1rem', borderRadius: '0.5rem', marginBottom: '1.5rem' }}>
                  <strong>💡 提示：</strong>至少创建一个店长账号
                </div>
                <h3 style={{ fontWeight: '600', marginBottom: '1rem' }}>🏢 店长账号（必填）</h3>
                <div style={styles.grid2}>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>姓名</label>
                    <input type="text" value={newAccounts.manager.name} onChange={(e) => setNewAccounts({ ...newAccounts, manager: { ...newAccounts.manager, name: e.target.value } })} style={styles.input} />
                  </div>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>用户名 *</label>
                    <input type="text" value={newAccounts.manager.username} onChange={(e) => setNewAccounts({ ...newAccounts, manager: { ...newAccounts.manager, username: e.target.value } })} style={styles.input} />
                  </div>
                  <div style={{ ...styles.formGroup, gridColumn: '1 / -1' }}>
                    <label style={styles.label}>密码 *</label>
                    <input type="password" value={newAccounts.manager.password} onChange={(e) => setNewAccounts({ ...newAccounts, manager: { ...newAccounts.manager, password: e.target.value } })} style={styles.input} />
                  </div>
                </div>

                <h3 style={{ fontWeight: '600', marginBottom: '1rem', marginTop: '1.5rem' }}>💰 收银员账号（可选）</h3>
                <div style={styles.grid2}>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>姓名</label>
                    <input type="text" value={newAccounts.cashier.name} onChange={(e) => setNewAccounts({ ...newAccounts, cashier: { ...newAccounts.cashier, name: e.target.value } })} style={styles.input} />
                  </div>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>用户名</label>
                    <input type="text" value={newAccounts.cashier.username} onChange={(e) => setNewAccounts({ ...newAccounts, cashier: { ...newAccounts.cashier, username: e.target.value } })} style={styles.input} />
                  </div>
                  <div style={{ ...styles.formGroup, gridColumn: '1 / -1' }}>
                    <label style={styles.label}>密码</label>
                    <input type="password" value={newAccounts.cashier.password} onChange={(e) => setNewAccounts({ ...newAccounts, cashier: { ...newAccounts.cashier, password: e.target.value } })} style={styles.input} />
                  </div>
                </div>

                <h3 style={{ fontWeight: '600', marginBottom: '1rem', marginTop: '1.5rem' }}>👨‍🍳 厨师账号（可选）</h3>
                <div style={styles.grid2}>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>姓名</label>
                    <input type="text" value={newAccounts.chef.name} onChange={(e) => setNewAccounts({ ...newAccounts, chef: { ...newAccounts.chef, name: e.target.value } })} style={styles.input} />
                  </div>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>用户名</label>
                    <input type="text" value={newAccounts.chef.username} onChange={(e) => setNewAccounts({ ...newAccounts, chef: { ...newAccounts.chef, username: e.target.value } })} style={styles.input} />
                  </div>
                  <div style={{ ...styles.formGroup, gridColumn: '1 / -1' }}>
                    <label style={styles.label}>密码</label>
                    <input type="password" value={newAccounts.chef.password} onChange={(e) => setNewAccounts({ ...newAccounts, chef: { ...newAccounts.chef, password: e.target.value } })} style={styles.input} />
                  </div>
                </div>

                <h3 style={{ fontWeight: '600', marginBottom: '1rem', marginTop: '1.5rem' }}>🍽️ 服务生账号（可选）</h3>
                <div style={styles.grid2}>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>姓名</label>
                    <input type="text" value={newAccounts.waiter.name} onChange={(e) => setNewAccounts({ ...newAccounts, waiter: { ...newAccounts.waiter, name: e.target.value } })} style={styles.input} />
                  </div>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>用户名</label>
                    <input type="text" value={newAccounts.waiter.username} onChange={(e) => setNewAccounts({ ...newAccounts, waiter: { ...newAccounts.waiter, username: e.target.value } })} style={styles.input} />
                  </div>
                  <div style={{ ...styles.formGroup, gridColumn: '1 / -1' }}>
                    <label style={styles.label}>密码</label>
                    <input type="password" value={newAccounts.waiter.password} onChange={(e) => setNewAccounts({ ...newAccounts, waiter: { ...newAccounts.waiter, password: e.target.value } })} style={styles.input} />
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', marginTop: '2rem' }}>
                  <button onClick={() => setWizardStep(1)} style={styles.btn('#6b7280')}>← 上一步</button>
                  <button onClick={() => setWizardStep(3)} style={styles.btn('#3b82f6')}>下一步 →</button>
                </div>
              </div>
            )}

            {wizardStep === 3 && (
              <div>
                <div style={{ backgroundColor: '#f0fdf4', padding: '1.5rem', borderRadius: '0.5rem', marginBottom: '1.5rem' }}>
                  <h3 style={{ fontWeight: '600', marginBottom: '1rem' }}>📋 确认信息</h3>
                  <div style={{ lineHeight: '2' }}>
                    <div><strong>分店名称:</strong> {newStore.name}</div>
                    <div><strong>分店代码:</strong> {newStore.code}</div>
                    <div><strong>地址:</strong> {newStore.address}</div>
                    <div><strong>电话:</strong> {newStore.phone}</div>
                    <div style={{ marginTop: '1rem' }}><strong>将创建的账号:</strong></div>
                    {newAccounts.manager.username && <div>• 店长: {newAccounts.manager.name} ({newAccounts.manager.username})</div>}
                    {newAccounts.cashier.username && <div>• 收银员: {newAccounts.cashier.name} ({newAccounts.cashier.username})</div>}
                    {newAccounts.waiter.username && <div>• 服务生: {newAccounts.waiter.name} ({newAccounts.waiter.username})</div>}
                    {newAccounts.chef.username && <div>• 厨师: {newAccounts.chef.name} ({newAccounts.chef.username})</div>}
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
                  <button onClick={() => setWizardStep(2)} style={styles.btn('#6b7280')}>← 上一步</button>
                  <button onClick={handleCompleteCreate} style={styles.btn('#10b981')}>✅ 确认创建</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 编辑分店模态框 */}
      {showEditStore && editingStore && (
        <div style={styles.modal} onClick={() => setShowEditStore(false)}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '1.5rem' }}>✏️ 编辑分店信息</h2>
            <div style={styles.grid2}>
              <div style={styles.formGroup}>
                <label style={styles.label}>分店名称</label>
                <input type="text" value={editingStore.name} onChange={(e) => setEditingStore({ ...editingStore, name: e.target.value })} style={styles.input} />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>分店代码</label>
                <input type="text" value={editingStore.code} onChange={(e) => setEditingStore({ ...editingStore, code: e.target.value })} style={styles.input} />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>地址</label>
                <input type="text" value={editingStore.address} onChange={(e) => setEditingStore({ ...editingStore, address: e.target.value })} style={styles.input} />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>电话</label>
                <input type="text" value={editingStore.phone} onChange={(e) => setEditingStore({ ...editingStore, phone: e.target.value })} style={styles.input} />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>货币单位</label>
                <input type="text" value={editingStore.currency} onChange={(e) => setEditingStore({ ...editingStore, currency: e.target.value })} style={styles.input} />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>税率 (%)</label>
                <input type="number" value={editingStore.taxRate} onChange={(e) => setEditingStore({ ...editingStore, taxRate: parseFloat(e.target.value) || 0 })} style={styles.input} />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>营业时间</label>
                <input type="text" value={editingStore.businessHours} onChange={(e) => setEditingStore({ ...editingStore, businessHours: e.target.value })} style={styles.input} />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>状态</label>
                <select value={editingStore.status} onChange={(e) => setEditingStore({ ...editingStore, status: e.target.value as 'active' | 'inactive' })} style={styles.input}>
                  <option value="active">营业中</option>
                  <option value="inactive">已停业</option>
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '2rem' }}>
              <button onClick={() => setShowEditStore(false)} style={styles.btn('#6b7280')}>取消</button>
              <button onClick={handleSaveStore} style={styles.btn('#3b82f6')}>💾 保存</button>
            </div>
          </div>
        </div>
      )}

      {/* 添加/编辑用户模态框 */}
      {showUserModal && (
        <div style={styles.modal} onClick={() => setShowUserModal(false)}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '1.5rem' }}>
              {editingUser ? '✏️ 编辑账号' : '➕ 添加新账号'}
            </h2>
            <div style={styles.grid2}>
              <div style={styles.formGroup}>
                <label style={styles.label}>姓名</label>
                <input type="text" value={userForm.name} onChange={(e) => setUserForm({ ...userForm, name: e.target.value })} style={styles.input} />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>角色</label>
                <select value={userForm.role} onChange={(e) => setUserForm({ ...userForm, role: e.target.value as any })} style={styles.input}>
                  <option value="store_manager">🏢 店长</option>
                  <option value="cashier">💰 收银员</option>
                  <option value="waiter">🍽️ 服务生</option>
                  <option value="chef">👨‍🍳 厨师</option>
                </select>
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>用户名</label>
                <input type="text" value={userForm.username} onChange={(e) => setUserForm({ ...userForm, username: e.target.value })} style={styles.input} />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>密码</label>
                <input type="password" value={userForm.password} onChange={(e) => setUserForm({ ...userForm, password: e.target.value })} style={styles.input} />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '2rem' }}>
              <button onClick={() => setShowUserModal(false)} style={styles.btn('#6b7280')}>取消</button>
              <button onClick={handleSaveUser} style={styles.btn('#3b82f6')}>💾 保存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StoresModule;
