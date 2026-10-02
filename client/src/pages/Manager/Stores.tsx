import React, { useCallback, useEffect, useState } from 'react';
import { getLocalDateString } from '../../utils/localTime';
import { smartDeleteDocument, smartGetDocuments, smartSetDocument } from '../../services/smartSyncService';
import { createFirebaseUser } from '../../services/FirebaseAuthService';
import { colors, font, radii, shadows } from '../../styles/uiTokens';
import type { PrinterRole, PrinterTransport, StorePrinterConfig } from '../../utils/receiptPrinter';

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
  receiptName?: string;
  receiptSubtitle?: string;
  receiptAddress?: string;
  receiptPhone?: string;
  receiptFooter?: string;
  receiptPaperWidthMm?: 80 | 58;
  cashierPrintEnabled?: boolean;
  kitchenPrintEnabled?: boolean;
  receiptCutEnabled?: boolean;
  kitchenCutEnabled?: boolean;
  receiptFeedLines?: number;
  kitchenFeedLines?: number;
  printers?: StorePrinterConfig[];
}

const createStorePrinter = (): StorePrinterConfig => ({
  id: `printer-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  name: '新打印机',
  role: 'kitchen',
  transport: 'network',
  host: '',
  port: 9100,
  widthMm: 80,
  enabled: true,
  cut: true,
  feedLines: 8,
  printAllCategories: false,
  categories: [],
});

const isPrivatePrinterIp = (value: string): boolean => {
  const parts = String(value || '').trim().split('.').map(Number);
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  return parts[0] === 10 ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168);
};

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

const findDuplicateStoreDocumentIds = (records: any[], keeper: Store, previousStore?: Store | null): string[] => {
  const keepId = String(keeper.id || '');
  const keys = new Set([
    getStoreDedupeKey(keeper),
    previousStore ? getStoreDedupeKey(previousStore) : '',
  ].filter(Boolean));

  return records
    .filter(record => record?.id && String(record.id) !== keepId)
    .filter(record => keys.has(getStoreDedupeKey(record)))
    .map(record => String(record.id));
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
  role: 'multi_store_manager' | 'store_manager' | 'cashier' | 'waiter' | 'chef';
  storeId: string;
  storeName: string;
  storeIds?: string[];
  assignedStores?: Array<{ id: string; name: string }>;
  email?: string;
  createdAt: string;
  status: 'active' | 'inactive';
}

const StoresModule: React.FC = () => {
  const [stores, setStores] = useState<Store[]>(() => dedupeStores(getLocalRecords('stores')));
  const [users, setUsers] = useState<User[]>(() => dedupeUsers(getLocalRecords('users')));
  const [cloudStoreRecords, setCloudStoreRecords] = useState<any[]>([]);
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
  const [showManagerManagement, setShowManagerManagement] = useState(false);
  const [userModalScope, setUserModalScope] = useState<'store' | 'manager'>('store');
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [userForm, setUserForm] = useState({
    username: '', password: '', name: '',
    role: 'cashier' as 'multi_store_manager' | 'store_manager' | 'cashier' | 'waiter' | 'chef',
    assignedStoreIds: [] as string[],
    defaultStoreId: '',
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
  };

  const toCloudUser = (user: User): User => {
    const { password, ...safeUser } = user;
    return safeUser as User;
  };

  const persistUsers = async (nextUsers: User[]) => {
    const normalizedUsers = (dedupeUsers(nextUsers) as User[]).map(toCloudUser);
    setUsers(normalizedUsers);
    saveLocalRecords('users', normalizedUsers);
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
      storeIds: user.storeIds,
      assignedStores: user.assignedStores,
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
      setCloudStoreRecords(cloudStores);
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
      receiptName: newStore.receiptName || '',
      receiptSubtitle: newStore.receiptSubtitle || '',
      receiptAddress: newStore.receiptAddress || newStore.address || '',
      receiptPhone: newStore.receiptPhone || newStore.phone || '',
      receiptFooter: newStore.receiptFooter || '',
      receiptPaperWidthMm: 80,
      cashierPrintEnabled: true,
      kitchenPrintEnabled: true,
      receiptCutEnabled: true,
      kitchenCutEnabled: true,
      receiptFeedLines: 8,
      kitchenFeedLines: 8,
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
        await smartSetDocument('stores', store.id, store);
        await Promise.all(createdUsers.map(user => smartSetDocument('users', user.id, toCloudUser(user))));
        await persistStores(updatedStores);
        await persistUsers([...users, ...createdUsers]);
      } else {
        await smartSetDocument('stores', store.id, store);
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

    const affectedManagers = users.filter(user =>
      user.role === 'multi_store_manager' &&
      Array.from(new Set([...(user.storeIds || []), user.storeId].filter(Boolean))).includes(storeId)
    );
    const managersWithoutAnotherStore = affectedManagers.filter(user =>
      Array.from(new Set([...(user.storeIds || []), user.storeId].filter(Boolean))).filter(id => id !== storeId).length === 0
    );
    if (managersWithoutAnotherStore.length > 0) {
      alert(`请先为经理 ${managersWithoutAnotherStore.map(user => user.name || user.username).join('、')} 指定其他分店，再删除此分店。`);
      return;
    }

    const removedUsers = users.filter(u => u.role !== 'multi_store_manager' && u.storeId === storeId);
    const updatedStores = stores.filter(s => s.id !== storeId);
    const managerUpdates = affectedManagers.map(manager => {
      const storeIds = Array.from(new Set([...(manager.storeIds || []), manager.storeId].filter(Boolean))).filter(id => id !== storeId);
      const assignedStores = updatedStores
        .filter(store => storeIds.includes(store.id))
        .map(store => ({ id: store.id, name: store.name }));
      const defaultStore = updatedStores.find(store => store.id === manager.storeId) || assignedStores[0];
      return {
        ...manager,
        storeId: defaultStore.id,
        storeName: defaultStore.name,
        storeIds,
        assignedStores,
      };
    });
    const managerUpdateMap = new Map(managerUpdates.map(manager => [manager.id, manager]));
    const updatedUsers = users
      .filter(user => !removedUsers.some(removed => removed.id === user.id))
      .map(user => managerUpdateMap.get(user.id) || user);

    await Promise.all([
      smartDeleteDocument('stores', storeId),
      ...removedUsers.map(user => smartDeleteDocument('users', user.id)),
      ...managerUpdates.map(manager => smartSetDocument('users', manager.id, toCloudUser(manager))),
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
    setEditingStore({ ...store, printers: Array.isArray(store.printers) ? store.printers : [] });
    setShowEditStore(true);
  };

  const updateEditingPrinter = (printerId: string, changes: Partial<StorePrinterConfig>) => {
    setEditingStore(current => current ? {
      ...current,
      printers: (current.printers || []).map(printer =>
        printer.id === printerId ? { ...printer, ...changes } : printer
      ),
    } : current);
  };

  const removeEditingPrinter = (printerId: string) => {
    setEditingStore(current => current ? {
      ...current,
      printers: (current.printers || []).filter(printer => printer.id !== printerId),
    } : current);
  };

  const handleSaveStore = async () => {
    if (!editingStore) return;
    const invalidPrinter = (editingStore.printers || []).find(printer =>
      printer.enabled && (
        (printer.transport === 'network' && !isPrivatePrinterIp(printer.host || '')) ||
        (printer.transport === 'windows' && !String(printer.printerName || '').trim())
      )
    );
    if (invalidPrinter) {
      alert(`打印机“${invalidPrinter.name}”配置不完整：网络打印机必须填写局域网 IP，Windows 打印机必须填写系统打印机名称。`);
      return;
    }
    const duplicateVisibleStore = stores.find(store =>
      store.id !== editingStore.id &&
      String(store.code || '').trim().toLowerCase() === String(editingStore.code || '').trim().toLowerCase()
    );
    if (duplicateVisibleStore) {
      alert('\u5206\u5e97\u4ee3\u7801\u5df2\u5b58\u5728\uff0c\u8bf7\u66f4\u6362\u540e\u518d\u4fdd\u5b58');
      return;
    }

    const previousStore = stores.find(store => store.id === editingStore.id);
    const duplicateStoreIds = findDuplicateStoreDocumentIds(cloudStoreRecords, editingStore, previousStore);
    const updated = dedupeStores(stores.map(s => s.id === editingStore.id ? editingStore : s));
    await Promise.all([
      smartSetDocument('stores', editingStore.id, editingStore),
      ...duplicateStoreIds.map(id => smartDeleteDocument('stores', id)),
    ]);
    setStores(updated);
    saveLocalRecords('stores', updated);
    setCloudStoreRecords(prev => dedupeStores([
      ...prev.filter(record => !duplicateStoreIds.includes(String(record.id))),
      editingStore,
    ]));
    setShowEditStore(false);
    setEditingStore(null);
    alert('✅ 分店信息已更新');
  };

  // 添加用户
  const handleAddUser = () => {
    setUserModalScope('store');
    setEditingUser(null);
    setUserForm({ username: '', password: '', name: '', role: 'cashier', assignedStoreIds: selectedStore ? [selectedStore] : [], defaultStoreId: selectedStore });
    setShowUserModal(true);
  };

  const handleAddManager = () => {
    setUserModalScope('manager');
    setEditingUser(null);
    setUserForm({ username: '', password: '', name: '', role: 'multi_store_manager', assignedStoreIds: [], defaultStoreId: '' });
    setShowUserModal(true);
  };

  // 编辑用户
  const handleEditUser = (user: User) => {
    const isManager = user.role === 'multi_store_manager';
    setUserModalScope(isManager ? 'manager' : 'store');
    setEditingUser(user);
    setUserForm({
      username: user.username,
      password: user.password || '',
      name: user.name,
      role: user.role,
      assignedStoreIds: user.role === 'multi_store_manager'
        ? Array.from(new Set([...(user.storeIds || []), user.storeId].filter(Boolean)))
        : [user.storeId],
      defaultStoreId: user.storeId,
    });
    setShowUserModal(true);
  };

  const handleSaveUser = async () => {
    const isManager = userModalScope === 'manager';
    if (!userForm.username || (!editingUser && !userForm.password)) {
      alert('请填写完整信息');
      return;
    }

    if (!isManager && !selectedStore) {
      alert('请先选择分店');
      return;
    }

    const store = stores.find(s => s.id === selectedStore);
    if (!isManager && !store) return;

    const assignedStoreIds = isManager
      ? Array.from(new Set(userForm.assignedStoreIds.filter(id => stores.some(item => item.id === id))))
      : [selectedStore];
    if (isManager && assignedStoreIds.length === 0) {
      alert('经理账号至少需要指定一家分店');
      return;
    }
    const assignedStores = stores
      .filter(item => assignedStoreIds.includes(item.id))
      .map(item => ({ id: item.id, name: item.name }));
    const primaryStoreId = isManager && assignedStoreIds.includes(userForm.defaultStoreId)
      ? userForm.defaultStoreId
      : assignedStoreIds[0];
    const primaryStore = stores.find(item => item.id === primaryStoreId);
    if (!primaryStore) return;
    const effectiveRole = isManager ? 'multi_store_manager' : userForm.role;

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
      const updatedUser: User = {
        ...editingUser,
        username: editingUser.username,
        password: undefined,
        name: userForm.name,
        role: effectiveRole,
        storeId: isManager ? primaryStore.id : selectedStore,
        storeName: isManager ? primaryStore.name : store!.name,
      };
      if (isManager) {
        updatedUser.storeIds = assignedStoreIds;
        updatedUser.assignedStores = assignedStores;
      }
      if (!isManager) {
        delete updatedUser.storeIds;
        delete updatedUser.assignedStores;
      }
      const updated = users.map(u => u.id === editingUser.id ? updatedUser : u);
      await smartSetDocument('users', updatedUser.id, toCloudUser(updatedUser));
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
        role: effectiveRole,
        storeId: selectedStore,
        storeName: store?.name || primaryStore.name,
        ...(isManager ? {
          storeId: primaryStore.id,
          storeName: primaryStore.name,
          storeIds: assignedStoreIds,
          assignedStores,
        } : {}),
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
      await smartSetDocument('users', authUser.id, toCloudUser(authUser));
      setUsers(updated);
      await persistUsers(updated);
      alert('✅ 账号已创建');
    }

    setShowUserModal(false);
    setEditingUser(null);
  };

  const selectedStoreData = stores.find(s => s.id === selectedStore);
  const managerUsers = users.filter(u => u.role === 'multi_store_manager');
  const storeUsers = users.filter(u => u.role !== 'multi_store_manager' && u.storeId === selectedStore);

  const styles = {
    container: { 
      display: 'flex', 
      flexDirection: 'column' as const, 
      height: '100%',
      padding: '1.1rem 1.25rem',
      background: colors.page,
      color: colors.textPrimary,
      fontFamily: font.family,
    },
    header: { 
      display: 'flex', 
      justifyContent: 'space-between', 
      alignItems: 'flex-start', 
      marginBottom: '1rem',
      flexShrink: 0 as const,
      gap: '1rem',
      flexWrap: 'wrap' as const,
    },
    title: { 
      fontSize: font.title, 
      fontWeight: 720, 
      color: colors.textPrimary,
      margin: 0,
      letterSpacing: 0,
    },
    subtitle: {
      color: colors.textSecondary,
      marginTop: '0.5rem',
      fontSize: font.body,
    },
    btn: (color: string) => ({ 
      padding: '0.58rem 0.95rem', 
      backgroundColor: color, 
      color: 'white', 
      border: `1px solid ${color}`, 
      borderRadius: radii.md, 
      cursor: 'pointer', 
      fontWeight: 700,
      fontSize: font.caption,
      boxShadow: color === colors.blue ? '0 10px 22px rgba(37, 99, 235, 0.18)' : 'none',
    }),
    contentWrapper: {
      display: 'flex',
      gap: '1rem',
      flex: 1,
      overflow: 'hidden',
    },
    storesPanel: {
      width: '350px',
      flexShrink: 0 as const,
      display: 'flex',
      flexDirection: 'column' as const,
      background: colors.surface,
      borderRadius: radii.lg,
      boxShadow: shadows.soft,
      border: `1px solid ${colors.border}`,
      overflow: 'hidden',
    },
    storesHeader: {
      padding: '1rem 1.5rem',
      borderBottom: `1px solid ${colors.border}`,
      fontWeight: 720,
      fontSize: font.section,
      flexShrink: 0 as const,
    },
    storesList: {
      flex: 1,
      overflowY: 'auto' as const,
      padding: '1rem',
    },
    storeCard: (isSelected: boolean) => ({ 
      background: isSelected ? colors.blueSoft : colors.surface, 
      borderRadius: radii.md, 
      padding: '1rem', 
      cursor: 'pointer', 
      border: isSelected ? `2px solid ${colors.blue}` : `1px solid ${colors.border}`,
      transition: 'all 0.2s',
      marginBottom: '0.75rem',
    }),
    detailPanel: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column' as const,
      background: colors.surface, 
      borderRadius: radii.lg, 
      boxShadow: shadows.soft,
      border: `1px solid ${colors.border}`,
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
      backgroundColor: active ? colors.blue : colors.surfaceMuted, 
      color: active ? 'white' : colors.textSecondary, 
      border: active ? `1px solid ${colors.blue}` : `1px solid ${colors.border}`, 
      borderRadius: radii.md, 
      cursor: 'pointer', 
      fontWeight: 700,
      fontSize: font.caption,
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
      borderBottom: `1px solid ${colors.border}`, 
      fontWeight: 720,
      position: 'sticky' as const,
      top: 0,
      backgroundColor: colors.surfaceMuted,
      zIndex: 1,
      color: colors.textSecondary,
      fontSize: font.caption,
    },
    td: { 
      padding: '0.75rem', 
      borderBottom: `1px solid ${colors.border}`,
      color: colors.textPrimary,
    },
    modal: { 
      position: 'fixed' as const, 
      top: 0, 
      left: 0, 
      right: 0, 
      bottom: 0, 
      backgroundColor: 'rgba(15, 23, 42, 0.38)', 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center', 
      zIndex: 1000,
    },
    modalContent: { 
      background: colors.surface, 
      borderRadius: radii.lg, 
      padding: '2rem', 
      maxWidth: '800px', 
      width: '90%', 
      maxHeight: '80vh', 
      overflowY: 'auto' as const,
      boxShadow: shadows.lift,
      border: `1px solid ${colors.border}`,
    },
    formGroup: { 
      marginBottom: '1rem',
    },
    label: { 
      display: 'block', 
      fontWeight: 700, 
      marginBottom: '0.5rem', 
      color: colors.textPrimary,
      fontSize: font.caption,
    },
    input: { 
      width: '100%', 
      padding: '0.58rem 0.75rem', 
      border: `1px solid ${colors.border}`, 
      borderRadius: radii.md, 
      fontSize: font.body,
      color: colors.textPrimary,
      background: colors.surface,
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
      color: completed ? colors.success : active ? colors.blue : colors.textMuted, 
      fontWeight: 700,
    }),
    infoGrid: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: '1rem',
    },
    infoItem: {
      padding: '0.75rem',
      backgroundColor: colors.surfaceMuted,
      borderRadius: radii.md,
      border: `1px solid ${colors.border}`,
    },
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>🏪 分店管理</h1>
          <p style={styles.subtitle}>管理所有分店及其账号</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {lastSyncedAt && (
            <span style={{ fontSize: font.caption, color: colors.textSecondary, whiteSpace: 'nowrap', padding: '0.45rem 0.7rem', background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: radii.pill }}>
              {'\u6700\u540e\u540c\u6b65 '} {lastSyncedAt.toLocaleTimeString('es-NI', { hour12: false })}
            </span>
          )}
          <button
            onClick={refreshStoresData}
            disabled={isRefreshing}
            style={{
              ...styles.btn(isRefreshing ? colors.textMuted : colors.blue),
              cursor: isRefreshing ? 'not-allowed' : 'pointer',
            }}
          >
            {isRefreshing ? '\u540c\u6b65\u4e2d...' : '\u5237\u65b0\u4e91\u7aef\u6570\u636e'}
          </button>
          <button onClick={() => setShowManagerManagement(true)} style={styles.btn(colors.teal)}>
            经理管理 ({managerUsers.length})
          </button>
          <button onClick={() => setShowCreateWizard(true)} style={styles.btn(colors.blue)}>➕ 创建分店</button>
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
                <div style={{ color: colors.textSecondary, fontSize: font.caption, lineHeight: '1.6' }}>
                  <div>代码: {store.code}</div>
                  <div>地址: {store.address || '未设置'}</div>
                  <div>电话: {store.phone || '未设置'}</div>
                  <div style={{ marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: `1px solid ${colors.border}` }}>
                    账号数: {users.filter(u => u.role !== 'multi_store_manager' && u.storeId === store.id).length}
                  </div>
                </div>
              </div>
            ))}
            {stores.length === 0 && (
              <div style={{ textAlign: 'center', padding: '2rem', color: colors.textMuted }}>
                暂无分店，点击右上角创建
              </div>
            )}
          </div>
        </div>

        {/* 右侧详情面板 */}
        {selectedStoreData ? (
          <div style={styles.detailPanel}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.5rem', borderBottom: `1px solid ${colors.border}` }}>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', margin: 0 }}>{selectedStoreData.name}</h2>
              <button onClick={() => handleDeleteStore(selectedStore)} style={styles.btn(colors.danger)}>🗑️ 删除分店</button>
            </div>

            <div style={{ ...styles.tabs, padding: '1rem 1.5rem 0', borderBottom: `1px solid ${colors.border}` }}>
              <button onClick={() => setActiveTab('info')} style={styles.tab(activeTab === 'info')}>📋 基本信息</button>
              <button onClick={() => setActiveTab('users')} style={styles.tab(activeTab === 'users')}>👥 账号管理 ({storeUsers.length})</button>
            </div>

            <div style={styles.contentArea}>
              {activeTab === 'info' && (
                <div style={{ padding: '1.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
                    <button onClick={() => handleEditStore(selectedStoreData)} style={styles.btn(colors.blue)}>
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
                    <div style={{ color: colors.textSecondary }}>管理该分店的所有账号</div>
                    <button onClick={handleAddUser} style={styles.btn(colors.success)}>
                      ➕ 添加账号
                    </button>
                  </div>
                  {storeUsers.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '2rem', color: colors.textSecondary }}>暂无账号，点击上方按钮添加</div>
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
                              {user.role === 'multi_store_manager' && 'MG 经理'}
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
          <div style={{ ...styles.modalContent, maxWidth: '1100px', maxHeight: '90vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
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
              <div style={{ ...styles.formGroup, gridColumn: '1 / -1', borderTop: `1px solid ${colors.border}`, paddingTop: '1rem', marginTop: '0.25rem' }}>
                <label style={styles.label}>小票抬头名称</label>
                <input
                  type="text"
                  value={editingStore.receiptName || ''}
                  onChange={(e) => setEditingStore({ ...editingStore, receiptName: e.target.value })}
                  placeholder="例如 REST ANO NUEVO CHINO"
                  style={styles.input}
                />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>小票副标题</label>
                <input
                  type="text"
                  value={editingStore.receiptSubtitle || ''}
                  onChange={(e) => setEditingStore({ ...editingStore, receiptSubtitle: e.target.value })}
                  placeholder="例如 COMIDA CHINA BLUEFIELDS"
                  style={styles.input}
                />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>小票电话</label>
                <input
                  type="text"
                  value={editingStore.receiptPhone || ''}
                  onChange={(e) => setEditingStore({ ...editingStore, receiptPhone: e.target.value })}
                  placeholder="例如 Tigo 7542 4688 Claro 5830 1539"
                  style={styles.input}
                />
              </div>
              <div style={{ ...styles.formGroup, gridColumn: '1 / -1' }}>
                <label style={styles.label}>小票地址</label>
                <input
                  type="text"
                  value={editingStore.receiptAddress || ''}
                  onChange={(e) => setEditingStore({ ...editingStore, receiptAddress: e.target.value })}
                  placeholder="为空时使用分店地址"
                  style={styles.input}
                />
              </div>
              <div style={{ ...styles.formGroup, gridColumn: '1 / -1' }}>
                <label style={styles.label}>小票底部文字</label>
                <input
                  type="text"
                  value={editingStore.receiptFooter || ''}
                  onChange={(e) => setEditingStore({ ...editingStore, receiptFooter: e.target.value })}
                  placeholder="例如 bluefields 或欢迎语"
                  style={styles.input}
                />
              </div>
              <div style={{ ...styles.formGroup, gridColumn: '1 / -1', borderTop: `1px solid ${colors.border}`, paddingTop: '1rem', marginTop: '0.25rem' }}>
                <label style={styles.label}>打印配置</label>
                <span style={{ color: colors.textSecondary, fontSize: font.caption }}>打印机名称由每家分店电脑的本地打印桥配置，云端只保存本分店的纸张和动作设置。</span>
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>小票纸宽</label>
                <select
                  value={editingStore.receiptPaperWidthMm || 80}
                  onChange={(e) => setEditingStore({ ...editingStore, receiptPaperWidthMm: Number(e.target.value) === 58 ? 58 : 80 })}
                  style={styles.input}
                >
                  <option value={80}>80 mm</option>
                  <option value={58}>58 mm</option>
                </select>
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>收银走纸行数</label>
                <input type="number" min={1} max={20} value={editingStore.receiptFeedLines ?? 8} onChange={(e) => setEditingStore({ ...editingStore, receiptFeedLines: Number(e.target.value) })} style={styles.input} />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>厨房走纸行数</label>
                <input type="number" min={1} max={20} value={editingStore.kitchenFeedLines ?? 8} onChange={(e) => setEditingStore({ ...editingStore, kitchenFeedLines: Number(e.target.value) })} style={styles.input} />
              </div>
              <div style={{ ...styles.formGroup, gap: '0.65rem' }}>
                <label style={styles.label}>打印动作</label>
                <label><input type="checkbox" checked={editingStore.cashierPrintEnabled !== false} onChange={(e) => setEditingStore({ ...editingStore, cashierPrintEnabled: e.target.checked })} /> 启用收银打印</label>
                <label><input type="checkbox" checked={editingStore.kitchenPrintEnabled !== false} onChange={(e) => setEditingStore({ ...editingStore, kitchenPrintEnabled: e.target.checked })} /> 启用厨房打印</label>
                <label><input type="checkbox" checked={editingStore.receiptCutEnabled !== false} onChange={(e) => setEditingStore({ ...editingStore, receiptCutEnabled: e.target.checked })} /> 收银自动切纸</label>
                <label><input type="checkbox" checked={editingStore.kitchenCutEnabled !== false} onChange={(e) => setEditingStore({ ...editingStore, kitchenCutEnabled: e.target.checked })} /> 厨房自动切纸</label>
              </div>
              <div style={{ gridColumn: '1 / -1', borderTop: `1px solid ${colors.border}`, paddingTop: '1rem', marginTop: '0.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', marginBottom: '0.85rem' }}>
                  <div>
                    <div style={{ fontWeight: 700, color: colors.textPrimary }}>分店打印机与出单路由</div>
                    <div style={{ color: colors.textSecondary, fontSize: font.caption, marginTop: '0.25rem' }}>
                      每家分店独立配置，可添加任意数量打印机。网络打印机默认端口为 9100；厨房分类名称需与菜品管理中的分类完全一致。
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditingStore({ ...editingStore, printers: [...(editingStore.printers || []), createStorePrinter()] })}
                    style={styles.btn(colors.teal)}
                  >
                    + 添加打印机
                  </button>
                </div>
                {(editingStore.printers || []).length === 0 ? (
                  <div style={{ padding: '1rem', border: `1px dashed ${colors.borderStrong}`, borderRadius: radii.md, color: colors.textSecondary, background: colors.surfaceMuted }}>
                    尚未配置网络打印机，系统继续使用原来的本机打印桥角色配置。
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '0.85rem' }}>
                    {(editingStore.printers || []).map((printer, index) => (
                      <div key={printer.id} style={{ border: `1px solid ${colors.border}`, borderRadius: radii.md, padding: '0.9rem', background: colors.surfaceMuted }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                          <strong>打印机 {index + 1}</strong>
                          <button type="button" onClick={() => removeEditingPrinter(printer.id)} style={{ ...styles.btn('#b91c1c'), padding: '0.38rem 0.65rem' }}>删除</button>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem' }}>
                          <div style={styles.formGroup}>
                            <label style={styles.label}>名称</label>
                            <input value={printer.name} onChange={(e) => updateEditingPrinter(printer.id, { name: e.target.value })} style={styles.input} />
                          </div>
                          <div style={styles.formGroup}>
                            <label style={styles.label}>用途</label>
                            <select value={printer.role} onChange={(e) => updateEditingPrinter(printer.id, { role: e.target.value as PrinterRole })} style={styles.input}>
                              <option value="cashier">收银小票</option>
                              <option value="kitchen">厨房出单</option>
                              <option value="bar">酒水出单</option>
                              <option value="report">报表打印</option>
                            </select>
                          </div>
                          <div style={styles.formGroup}>
                            <label style={styles.label}>连接方式</label>
                            <select value={printer.transport} onChange={(e) => updateEditingPrinter(printer.id, { transport: e.target.value as PrinterTransport })} style={styles.input}>
                              <option value="network">局域网 IP</option>
                              <option value="windows">Windows 打印机</option>
                            </select>
                          </div>
                          {printer.transport === 'network' ? (
                            <>
                              <div style={styles.formGroup}>
                                <label style={styles.label}>打印机 IP</label>
                                <input value={printer.host || ''} onChange={(e) => updateEditingPrinter(printer.id, { host: e.target.value.trim() })} placeholder="192.168.1.250" style={styles.input} />
                              </div>
                              <div style={styles.formGroup}>
                                <label style={styles.label}>端口</label>
                                <input type="number" min={1} max={65535} value={printer.port || 9100} onChange={(e) => updateEditingPrinter(printer.id, { port: Number(e.target.value) || 9100 })} style={styles.input} />
                              </div>
                            </>
                          ) : (
                            <div style={{ ...styles.formGroup, gridColumn: 'span 2' }}>
                              <label style={styles.label}>Windows 打印机名称</label>
                              <input value={printer.printerName || ''} onChange={(e) => updateEditingPrinter(printer.id, { printerName: e.target.value })} placeholder="例如 FACTURAS" style={styles.input} />
                            </div>
                          )}
                          <div style={styles.formGroup}>
                            <label style={styles.label}>纸宽</label>
                            <select value={printer.widthMm} onChange={(e) => updateEditingPrinter(printer.id, { widthMm: Number(e.target.value) === 58 ? 58 : 80 })} style={styles.input}>
                              <option value={80}>80 mm</option>
                              <option value={58}>58 mm</option>
                            </select>
                          </div>
                          <div style={styles.formGroup}>
                            <label style={styles.label}>走纸行数</label>
                            <input type="number" min={1} max={20} value={printer.feedLines} onChange={(e) => updateEditingPrinter(printer.id, { feedLines: Number(e.target.value) || 8 })} style={styles.input} />
                          </div>
                          {(printer.role === 'kitchen' || printer.role === 'bar') && (
                            <div style={{ ...styles.formGroup, gridColumn: '1 / -1' }}>
                              <label style={styles.label}>菜品分类（用逗号分隔）</label>
                              <input
                                key={`${printer.id}-${(printer.categories || []).join('|')}`}
                                defaultValue={(printer.categories || []).join(', ')}
                                onBlur={(e) => updateEditingPrinter(printer.id, { categories: e.target.value.split(/[,，]/).map(value => value.trim()).filter(Boolean) })}
                                disabled={printer.printAllCategories}
                                placeholder="例如 Comida China, Sopas"
                                style={styles.input}
                              />
                            </div>
                          )}
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.9rem', marginTop: '0.75rem' }}>
                          <label><input type="checkbox" checked={printer.enabled} onChange={(e) => updateEditingPrinter(printer.id, { enabled: e.target.checked })} /> 启用</label>
                          <label><input type="checkbox" checked={printer.cut} onChange={(e) => updateEditingPrinter(printer.id, { cut: e.target.checked })} /> 自动切纸</label>
                          {(printer.role === 'kitchen' || printer.role === 'bar') && (
                            <label><input type="checkbox" checked={printer.printAllCategories === true} onChange={(e) => updateEditingPrinter(printer.id, { printAllCategories: e.target.checked })} /> 打印全部菜品</label>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
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

      {showManagerManagement && (
        <div style={styles.modal} onClick={() => setShowManagerManagement(false)}>
          <div style={{ ...styles.modalContent, maxWidth: '980px' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', marginBottom: '1.25rem' }}>
              <div>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>经理管理</h2>
                <p style={{ margin: '0.35rem 0 0', color: colors.textSecondary }}>经理账号独立于分店创建，只能访问已授权的分店。</p>
              </div>
              <button onClick={handleAddManager} style={styles.btn(colors.success)}>添加经理</button>
            </div>

            {managerUsers.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2.5rem', color: colors.textSecondary, background: colors.surfaceMuted, borderRadius: radii.md }}>
                暂无经理账号
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>姓名</th>
                      <th style={styles.th}>用户名</th>
                      <th style={styles.th}>管理分店</th>
                      <th style={styles.th}>默认分店</th>
                      <th style={styles.th}>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {managerUsers.map(manager => (
                      <tr key={manager.id}>
                        <td style={styles.td}>{manager.name}</td>
                        <td style={styles.td}>{manager.username}</td>
                        <td style={styles.td}>
                          {(manager.assignedStores || stores.filter(store => manager.storeIds?.includes(store.id)))
                            .map(store => store.name)
                            .join('、') || '未分配'}
                        </td>
                        <td style={styles.td}>{manager.storeName || stores.find(store => store.id === manager.storeId)?.name || '-'}</td>
                        <td style={styles.td}>
                          <button onClick={() => handleEditUser(manager)} style={{ ...styles.btn(colors.blue), marginRight: '0.5rem', padding: '0.5rem 1rem' }}>编辑</button>
                          <button onClick={() => handleDeleteUser(manager.id)} style={{ ...styles.btn(colors.danger), padding: '0.5rem 1rem' }}>删除</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
              <button onClick={() => setShowManagerManagement(false)} style={styles.btn(colors.textSecondary)}>关闭</button>
            </div>
          </div>
        </div>
      )}

      {/* 添加/编辑用户模态框 */}
      {showUserModal && (
        <div style={styles.modal} onClick={() => setShowUserModal(false)}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '1.5rem' }}>
              {userModalScope === 'manager'
                ? (editingUser ? '编辑经理' : '添加经理')
                : (editingUser ? '✏️ 编辑账号' : '➕ 添加新账号')}
            </h2>
            <div style={styles.grid2}>
              <div style={styles.formGroup}>
                <label style={styles.label}>姓名</label>
                <input type="text" value={userForm.name} onChange={(e) => setUserForm({ ...userForm, name: e.target.value })} style={styles.input} />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>角色</label>
                {userModalScope === 'manager' ? (
                  <input type="text" value="经理（多门店）" readOnly style={{ ...styles.input, background: colors.surfaceMuted }} />
                ) : (
                  <select value={userForm.role} onChange={(e) => setUserForm({ ...userForm, role: e.target.value as any })} style={styles.input}>
                    <option value="store_manager">🏢 店长</option>
                    <option value="cashier">💰 收银员</option>
                    <option value="waiter">🍽️ 服务生</option>
                    <option value="chef">👨‍🍳 厨师</option>
                  </select>
                )}
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>用户名</label>
                <input type="text" value={userForm.username} onChange={(e) => setUserForm({ ...userForm, username: e.target.value })} style={styles.input} />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>密码</label>
                <input type="password" value={userForm.password} onChange={(e) => setUserForm({ ...userForm, password: e.target.value })} style={styles.input} />
              </div>
              {userModalScope === 'manager' && (
                <div style={{ ...styles.formGroup, gridColumn: '1 / -1' }}>
                  <label style={styles.label}>管理分店（可选择多家）</label>
                  <details>
                    <summary style={{ ...styles.input, cursor: 'pointer', listStyle: 'none' }}>
                      {userForm.assignedStoreIds.length > 0
                        ? stores
                            .filter(storeOption => userForm.assignedStoreIds.includes(storeOption.id))
                            .map(storeOption => storeOption.name)
                            .join('、')
                        : '请选择分店'}
                    </summary>
                    <div style={{ display: 'grid', gap: '0.65rem', marginTop: '0.35rem', padding: '0.85rem', border: `1px solid ${colors.border}`, borderRadius: radii.md, background: colors.surface, boxShadow: shadows.soft, maxHeight: '240px', overflowY: 'auto' }}>
                      {stores.length === 0 ? (
                        <span style={{ color: colors.textMuted }}>暂无分店数据，请先刷新云端数据</span>
                      ) : stores.map(storeOption => (
                        <label key={storeOption.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={userForm.assignedStoreIds.includes(storeOption.id)}
                            onChange={(event) => setUserForm(current => {
                              const assignedStoreIds = event.target.checked
                                ? Array.from(new Set([...current.assignedStoreIds, storeOption.id]))
                                : current.assignedStoreIds.filter(id => id !== storeOption.id);
                              return {
                                ...current,
                                assignedStoreIds,
                                defaultStoreId: assignedStoreIds.includes(current.defaultStoreId)
                                  ? current.defaultStoreId
                                  : (assignedStoreIds[0] || ''),
                              };
                            })}
                          />
                          <span>{storeOption.name}</span>
                        </label>
                      ))}
                    </div>
                  </details>
                </div>
              )}
              {userModalScope === 'manager' && (
                <div style={{ ...styles.formGroup, gridColumn: '1 / -1' }}>
                  <label style={styles.label}>默认进入分店</label>
                  <select
                    value={userForm.defaultStoreId}
                    onChange={(event) => setUserForm({ ...userForm, defaultStoreId: event.target.value })}
                    style={styles.input}
                    disabled={userForm.assignedStoreIds.length === 0}
                  >
                    <option value="">请选择默认分店</option>
                    {stores
                      .filter(storeOption => userForm.assignedStoreIds.includes(storeOption.id))
                      .map(storeOption => <option key={storeOption.id} value={storeOption.id}>{storeOption.name}</option>)}
                  </select>
                </div>
              )}
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
