/**
 * 统一数据管理服务
 * 确保全系统数据一致性、互联一致性、存储一致性
 */

import { smartUpdateDocument } from './smartSyncService';

// 数据类型定义
export interface DataStore {
  orders: any[];
  customers: any[];
  expenses: any[];
  purchases: any[];
  handovers: any[];
  employees: any[];
  menuItems: any[];
  inventory: any[];
}

const DATA_STORE_KEYS = [
  'orders',
  'customers',
  'expenses',
  'purchases',
  'handovers',
  'employees',
  'menuItems',
  'inventory',
] as const;

// localStorage 键名常量。这里必须和各业务模块实际写入的 key 保持一致。
export const STORAGE_KEYS = {
  ORDERS: 'pos_orders',
  CUSTOMERS: 'customers',
  EXPENSES: 'expense_records',
  PURCHASES: 'purchase_orders',
  HANDOVERS: 'rest_v6_final',
  EMPLOYEES: 'employees',
  MENU_ITEMS: 'menu_items',
  INVENTORY: 'inventory_items',
} as const;

const STORAGE_KEY_BY_DATA_KEY: Record<keyof DataStore, string> = {
  orders: 'pos_orders',
  customers: 'customers',
  expenses: 'expense_records',
  purchases: 'purchase_orders',
  handovers: 'rest_v6_final',
  employees: 'employees',
  menuItems: 'menu_items',
  inventory: 'inventory_items',
};

const FALLBACK_STORAGE_KEYS: Partial<Record<keyof DataStore, string[]>> = {
  customers: ['pos_customers'],
  expenses: ['expenses'],
  purchases: ['purchase_records'],
  inventory: ['inventory'],
};

const getCurrentStoreId = (): string | null => {
  try {
    const userStr = localStorage.getItem('current_user');
    if (!userStr) return null;
    const user = JSON.parse(userStr);
    return user.storeId || null;
  } catch {
    return null;
  }
};

const getStorageKey = (key: keyof DataStore): string | null => {
  const baseKey = STORAGE_KEY_BY_DATA_KEY[key];
  const storeId = getCurrentStoreId();

  if (!storeId) {
    return null;
  }

  return `store_${storeId}_${baseKey}`;
};

class DataManager {
  private static instance: DataManager;
  private listeners: Map<string, Set<(data: any) => void>> = new Map();
  private cache: Partial<DataStore> = {};
  private cacheStoreId: string | null = getCurrentStoreId();

  private constructor() {
    this.initializeCache();
  }

  static getInstance(): DataManager {
    if (!DataManager.instance) {
      DataManager.instance = new DataManager();
    }
    return DataManager.instance;
  }

  /**
   * 初始化缓存，从 localStorage 加载所有数据
   */
  private initializeCache() {
    this.cacheStoreId = getCurrentStoreId();
    DATA_STORE_KEYS.forEach((key) => {
      try {
        this.cache[key] = this.readStorage(key);
      } catch (error) {
        console.error(`加载 ${key} 失败:`, error);
        this.cache[key] = [];
      }
    });
  }

  private ensureStoreCache() {
    const currentStoreId = getCurrentStoreId();
    if (currentStoreId !== this.cacheStoreId) {
      this.cache = {};
      this.initializeCache();
    }
  }

  private readStorage(key: keyof DataStore): any[] {
    const primaryKey = getStorageKey(key);
    const storeId = getCurrentStoreId();
    if (!primaryKey || !storeId) {
      return [];
    }

    const storageKeys = storeId
      ? [primaryKey]
      : [
          primaryKey,
          STORAGE_KEY_BY_DATA_KEY[key],
          ...(FALLBACK_STORAGE_KEYS[key] || []),
        ];

    for (const storageKey of storageKeys) {
      const data = localStorage.getItem(storageKey);
      if (data) {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed)) {
          if (!storeId && storageKey !== primaryKey) {
            localStorage.setItem(primaryKey, JSON.stringify(parsed));
          }
          return parsed;
        }
      }
    }

    return [];
  }

  /**
   * 获取数据（优先从缓存，缓存不存在则从 localStorage 读取）
   */
  getData<T = any>(key: keyof DataStore): T[] {
    this.ensureStoreCache();

    // 如果缓存中有数据，直接返回
    if (this.cache[key]) {
      return this.cache[key] as T[];
    }

    // 否则从 localStorage 读取
    try {
      const parsed = this.readStorage(key);
      this.cache[key] = parsed;
      return parsed as T[];
    } catch (error) {
      console.error(`读取 ${key} 失败:`, error);
      return [];
    }
  }

  /**
   * 保存数据（同时更新缓存、localStorage、Firestore 和通知监听者）
   */
  async saveData(
    key: keyof DataStore,
    data: any[],
    options: { syncFirestore?: boolean; notify?: boolean; persistLocal?: boolean } = {}
  ): Promise<void> {
    this.ensureStoreCache();

    const { syncFirestore = true, notify = true, persistLocal = true } = options;
    const storageKey = getStorageKey(key);
    if (!storageKey) {
      throw new Error(`Missing storeId; refusing to save store-scoped data: ${String(key)}`);
    }

    try {
      const serializedData = JSON.stringify(data);
      const cachedData = this.cache[key];
      const serializedCache = cachedData ? JSON.stringify(cachedData) : null;
      const storedData = localStorage.getItem(storageKey);

      if (serializedCache === serializedData && storedData === serializedData) {
        return;
      }

      // 1. 更新缓存
      this.cache[key] = data;

      if (persistLocal) {
        localStorage.setItem(storageKey, serializedData);
      }

      // 3. 🔥 同步到 Firestore
      const firestoreCollectionMap: Record<string, string> = {
        'orders': 'pos_orders',
        'customers': 'customers',
        'expenses': 'expenses',
        'purchases': 'purchase_orders',
        'handovers': 'handovers',
        'employees': 'employees',
        'menuItems': 'menu_items',
      };

      const collectionName = firestoreCollectionMap[key];
      if (syncFirestore && collectionName) {
        const syncTasks = data.filter(item => item.id).map(async (item) => {
          try {
            await smartUpdateDocument(collectionName, item.id, item);
          } catch (error) {
            console.error(`❌ 同步 ${key} 到 Firestore 失败:`, error);
            throw error;
          }
        });
        await Promise.all(syncTasks);
      }

      // 4. 触发自定义事件（供其他模块监听）
      if (!notify) return;

      const event = new CustomEvent(`${key}Updated`, { detail: data });
      window.dispatchEvent(event);

      // 5. 通知内部监听者
      this.notifyListeners(key, data);
    } catch (error) {
      console.error(`保存 ${key} 失败:`, error);
      throw error;
    }
  }

  /**
   * 添加单条数据
   */
  addData(key: keyof DataStore, item: any): void {
    const currentData = this.getData(key);
    const newData = [...currentData, item];
    this.saveData(key, newData);
  }

  /**
   * 更新单条数据
   */
  updateData(key: keyof DataStore, id: string, updates: Partial<any>): void {
    const currentData = this.getData(key);
    const newData = currentData.map((item: any) =>
      item.id === id ? { ...item, ...updates } : item
    );
    this.saveData(key, newData);
  }

  /**
   * 删除单条数据
   */
  deleteData(key: keyof DataStore, id: string): void {
    const currentData = this.getData(key);
    const newData = currentData.filter((item: any) => item.id !== id);
    this.saveData(key, newData);
  }

  /**
   * 批量更新数据
   */
  batchUpdate(key: keyof DataStore, updates: Array<{ id: string; data: Partial<any> }>): void {
    const currentData = this.getData(key);
    const newData = currentData.map((item: any) => {
      const update = updates.find(u => u.id === item.id);
      return update ? { ...item, ...update.data } : item;
    });
    this.saveData(key, newData);
  }

  /**
   * 注册数据变化监听器
   */
  subscribe(key: keyof DataStore, callback: (data: any[]) => void): () => void {
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set());
    }
    this.listeners.get(key)!.add(callback);

    // 返回取消订阅函数
    return () => {
      this.listeners.get(key)?.delete(callback);
    };
  }

  /**
   * 通知监听者
   */
  private notifyListeners(key: keyof DataStore, data: any[]): void {
    const keyListeners = this.listeners.get(key);
    if (keyListeners) {
      keyListeners.forEach(callback => callback(data));
    }
  }

  /**
   * 清除缓存（强制从 localStorage 重新加载）
   */
  clearCache(key?: keyof DataStore): void {
    this.cacheStoreId = getCurrentStoreId();
    if (key) {
      delete this.cache[key];
    } else {
      this.cache = {};
      this.initializeCache();
    }
  }

  /**
   * 获取数据统计信息
   */
  getStats(): Record<string, number> {
    const stats: Record<string, number> = {};
    DATA_STORE_KEYS.forEach(key => {
      stats[key] = this.getData(key).length;
    });
    return stats;
  }

  /**
   * 导出数据（用于备份或迁移）
   */
  exportAll(): DataStore {
    const exportData: Partial<DataStore> = {};
    DATA_STORE_KEYS.forEach(key => {
      exportData[key] = this.getData(key);
    });
    return exportData as DataStore;
  }

  /**
   * 导入数据（用于恢复或迁移）
   */
  importAll(data: Partial<DataStore>): void {
    Object.entries(data).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        this.saveData(key as keyof DataStore, value);
      }
    });
  }

  /**
   * 清空所有数据（危险操作，需要确认）
   */
  clearAll(confirmText: string = '确定要清空所有数据吗？此操作不可恢复！'): boolean {
    if (window.confirm(confirmText)) {
      DATA_STORE_KEYS.forEach(key => {
        const scopedKey = getStorageKey(key);
        if (scopedKey) {
          localStorage.removeItem(scopedKey);
        }
        localStorage.removeItem(STORAGE_KEY_BY_DATA_KEY[key]);
        (FALLBACK_STORAGE_KEYS[key] || []).forEach(storageKey => localStorage.removeItem(storageKey));
      });
      this.cache = {};
      console.warn('⚠️ 所有数据已清空');
      return true;
    }
    return false;
  }
}

// 导出单例实例
export const dataManager = DataManager.getInstance();

// 导出便捷方法
export const useData = <T = any>(key: keyof DataStore) => {
  return {
    getData: () => dataManager.getData<T>(key),
    saveData: (data: T[]) => dataManager.saveData(key, data),
    addData: (item: T) => dataManager.addData(key, item),
    updateData: (id: string, updates: Partial<T>) => dataManager.updateData(key, id, updates),
    deleteData: (id: string) => dataManager.deleteData(key, id),
    subscribe: (callback: (data: T[]) => void) => dataManager.subscribe(key, callback),
  };
};
