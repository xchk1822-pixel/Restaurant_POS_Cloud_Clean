import { smartAddDocument, smartUpdateDocument, smartGetDocuments } from '../services/smartSyncService';
import { COLLECTIONS } from '../firebase/config';
import type { MenuItem } from '../contexts/AppContext';

/**
 * 菜单管理服务
 * 支持连锁店每个分店独立的菜单和价格
 */

// ==================== 分店菜单管理 ====================

/**
 * 为分店创建菜单
 */
export const createStoreMenu = async (
  storeId: string,
  menuItem: Omit<MenuItem, 'id' | 'storeId'>
) => {
  return await smartAddDocument(COLLECTIONS.PRODUCTS, {
    ...menuItem,
    storeId, // 关联到具体分店
  });
};

/**
 * 获取分店的菜单（仅该分店的菜品）
 */
export const getStoreMenu = async (storeId: string) => {
  const allMenus = await smartGetDocuments(COLLECTIONS.PRODUCTS);
  
  // 只返回该分店的菜单
  return allMenus.filter(item => item.storeId === storeId);
};

/**
 * 更新分店菜单价格
 */
export const updateStoreMenuPrice = async (
  storeId: string,
  menuItemId: string,
  newPrice: number
) => {
  return await smartUpdateDocument(COLLECTIONS.PRODUCTS, menuItemId, {
    price: newPrice,
  });
};

/**
 * 批量更新分店菜单价格
 */
export const batchUpdatePrices = async (
  storeId: string,
  priceUpdates: { menuItemId: string; newPrice: number }[]
) => {
  const results = [];
  for (const update of priceUpdates) {
    const result = await updateStoreMenuPrice(storeId, update.menuItemId, update.newPrice);
    results.push(result);
  }
  return results;
};

/**
 * 设置分店菜单可用性
 */
export const setMenuAvailability = async (
  storeId: string,
  menuItemId: string,
  available: boolean
) => {
  return await smartUpdateDocument(COLLECTIONS.PRODUCTS, menuItemId, {
    available,
  });
};

// ==================== 辅助函数 ====================

/**
 * 检查菜品是否有自定义价格（已废弃，所有价格都是分店独立的）
 */
export const hasCustomPrice = (menuItem: MenuItem) => {
  return true; // 所有分店的价格都是独立的
};
