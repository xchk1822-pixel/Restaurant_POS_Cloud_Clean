/**
 * 分店数据隔离工具
 * 确保各分店数据独立，互不干扰
 */

import { useAuth } from '../contexts/AuthContext';

/**
 * 生成分店专属的 storage key
 * @param baseKey 基础键名（如 'orders', 'inventory'）
 * @param storeId 分店ID
 * @returns 分店专属的键名
 */
export const getStoreScopedKey = (baseKey: string, storeId?: string): string => {
  if (!storeId) {
    // 超级管理员使用全局 key
    return baseKey;
  }
  return `${baseKey}_${storeId}`;
};

/**
 * 分店数据管理器 Hook
 * 自动根据当前用户的分店ID进行数据隔离
 */
export const useStoreData = () => {
  const { user } = useAuth();
  const storeId = user?.storeId;

  /**
   * 获取分店数据
   */
  const getData = <T,>(baseKey: string, defaultValue: T): T => {
    try {
      const key = getStoreScopedKey(baseKey, storeId);
      const saved = localStorage.getItem(key);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (error) {
      console.error(`读取数据失败 [${baseKey}]:`, error);
    }
    return defaultValue;
  };

  /**
   * 保存分店数据
   */
  const setData = <T,>(baseKey: string, data: T): void => {
    try {
      const key = getStoreScopedKey(baseKey, storeId);
      localStorage.setItem(key, JSON.stringify(data));
    } catch (error) {
      console.error(`保存数据失败 [${baseKey}]:`, error);
    }
  };

  /**
   * 删除分店数据
   */
  const removeData = (baseKey: string): void => {
    try {
      const key = getStoreScopedKey(baseKey, storeId);
      localStorage.removeItem(key);
    } catch (error) {
      console.error(`删除数据失败 [${baseKey}]:`, error);
    }
  };

  /**
   * 清除当前分店所有数据（慎用！）
   */
  const clearAllStoreData = (): void => {
    if (!storeId) {
      console.warn('⚠️ 超级管理员不能清除所有数据');
      return;
    }

    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.endsWith(`_${storeId}`)) {
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach(key => localStorage.removeItem(key));
    console.log(`✅ 已清除分店 ${storeId} 的所有数据`);
  };

  return {
    storeId,
    getData,
    setData,
    removeData,
    clearAllStoreData,
  };
};

/**
 * 初始化分店默认数据
 * 首次使用时调用
 */
export const initStoreDefaults = (storeId: string) => {
  const defaults = {
    // 桌台数据
    [`tables_${storeId}`]: JSON.stringify([
      { id: `table_1_${storeId}`, number: '1', x: 50, y: 50, width: 80, height: 80, status: 'available', capacity: 4 },
      { id: `table_2_${storeId}`, number: '2', x: 150, y: 50, width: 80, height: 80, status: 'available', capacity: 4 },
      { id: `table_3_${storeId}`, number: '3', x: 250, y: 50, width: 80, height: 80, status: 'available', capacity: 6 },
      { id: `table_4_${storeId}`, number: '4', x: 50, y: 150, width: 80, height: 80, status: 'available', capacity: 4 },
      { id: `table_5_${storeId}`, number: '5', x: 150, y: 150, width: 80, height: 80, status: 'available', capacity: 4 },
      { id: `table_6_${storeId}`, number: '6', x: 250, y: 150, width: 80, height: 80, status: 'available', capacity: 8 },
    ]),
    
    // 订单数据
    [`orders_${storeId}`]: JSON.stringify([]),
    
    // 库存数据（可以根据需要初始化）
    [`inventory_${storeId}`]: JSON.stringify([]),
  };

  // 只在不存在时初始化
  Object.entries(defaults).forEach(([key, value]) => {
    if (!localStorage.getItem(key)) {
      localStorage.setItem(key, value);
    }
  });

  console.log(`✅ 分店 ${storeId} 默认数据初始化完成`);
};
