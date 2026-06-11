/**
 * 统一数据访问层
 * - 所有数据操作都通过此服务
 * - localStorage是主存储，Firestore是云端备份
 * - 防止空数组覆盖现有数据
 */

import { getLocalDateTime, getLocalDateString } from '../utils/localTime';
import { smartAddDocument } from './smartSyncService';

class DataService {
  /**
   * 获取当前用户的storeId
   */
  getCurrentStoreId(): string | null {
    try {
      const userStr = localStorage.getItem('current_user');
      if (userStr) {
        const user = JSON.parse(userStr);
        return user.storeId || null;
      }
    } catch (error) {
      console.error('❌ 获取 storeId 失败:', error);
    }
    return null;
  }

  /**
   * 构建localStorage的key
   * - 如果有storeId，使用分店专属key：store_{storeId}_{collection}
   * - 否则使用全局key：{collection}
   */
  getStoreKey(collectionName: string): string {
    const storeId = this.getCurrentStoreId();
    if (storeId) {
      return `store_${storeId}_${collectionName}`;
    }
    return collectionName;
  }

  /**
   * 读取数据（从localStorage）
   * 🔥 智能查找：全局集合直接读全局key，分店集合先读分店key
   */
  getData(collectionName: string): any[] {
    try {
      // 🔥 全局集合（stores、users）直接从全局key读取
      if (collectionName === 'stores' || collectionName === 'users') {
        const globalData = localStorage.getItem(collectionName);
        if (globalData) {
          const parsed = JSON.parse(globalData);
          console.log(`📂 从全局路径读取 ${collectionName} (${parsed.length}条)`);
          return parsed;
        }
        return [];
      }

      // 🔥 分店集合：只从分店专属key读取
      const storeId = this.getCurrentStoreId();

      if (storeId) {
        const storeKey = `store_${storeId}_${collectionName}`;
        const storeData = localStorage.getItem(storeKey);
        if (storeData) {
          const parsed = JSON.parse(storeData);
          console.log(`📂 从分店专属路径读取 ${collectionName}:`, storeKey, `(${parsed.length}条)`);
          return parsed;
        }
      }

      // 没有storeId或分店key中没有数据，返回空数组
      console.log(`⚠️ 分店 ${collectionName} 数据为空`);
      return [];
    } catch (error) {
      console.error(`❌ 读取 ${collectionName} 失败:`, error);
      return [];
    }
  }
  /**
   * 保存数据（立即写入localStorage + 异步同步Firestore）
   * 🔥 防止空数组覆盖现有数据
   * 🔥 自动添加 updatedAt 时间戳
   */
  saveData(collectionName: string, data: any[]) {
    // 🔥 防止空数组覆盖
    if (!data || data.length === 0) {
      console.warn(`⚠️ 尝试保存空的 ${collectionName}，跳过`);
      return;
    }

    try {
      const storeId = this.getCurrentStoreId();

      // 🔥 为每条数据添加 updatedAt 时间戳
      const now = new Date().toISOString();
      const dataWithTimestamp = data.map(item => ({
        ...item,
        updatedAt: now
      }));

      // 🔥 判断是否为全局集合
      const globalCollections = ['users', 'stores', 'system_roles'];
      const isGlobalCollection = globalCollections.includes(collectionName);

      if (isGlobalCollection) {
        // 全局集合：只保存到全局key
        localStorage.setItem(collectionName, JSON.stringify(dataWithTimestamp));
        console.log(`💾 已保存全局 ${collectionName}: ${dataWithTimestamp.length} 条`);
      } else {
        // 分店专属集合：只保存到分店key
        if (storeId) {
          const storeKey = `store_${storeId}_${collectionName}`;
          localStorage.setItem(storeKey, JSON.stringify(dataWithTimestamp));
          console.log(`💾 已保存分店 ${collectionName}: ${dataWithTimestamp.length} 条`);
        } else {
          console.warn(`⚠️ 没有 storeId，无法保存分店数据: ${collectionName}`);
        }
      }

      // 云端写入由各业务模块通过 smartSetDocument/smartUpdateDocument 显式执行。
      // 这里仅维护当前分店的本地缓存，避免旧缓存批量覆盖 Firestore。
    } catch (error) {
      console.error(`❌ 保存 ${collectionName} 失败:`, error);
    }
  }

  /**
   * 添加单条数据
   */
  addItem(collectionName: string, item: any) {
    const items = this.getData(collectionName);

    // 添加时间戳
    const newItem = {
      ...item,
      createdAt: item.createdAt || getLocalDateTime(),
      updatedAt: getLocalDateTime(),
    };

    items.push(newItem);
    this.saveData(collectionName, items);

    return newItem;
  }

  /**
   * 更新单条数据
   */
  updateItem(collectionName: string, itemId: string, updates: any) {
    const items = this.getData(collectionName);
    const index = items.findIndex((i: any) => i.id === itemId);

    if (index !== -1) {
      items[index] = {
        ...items[index],
        ...updates,
        updatedAt: getLocalDateTime(),
      };
      this.saveData(collectionName, items);
      return items[index];
    }

    console.warn(`⚠️ 未找到 ${collectionName}/${itemId}`);
    return null;
  }

  /**
   * 删除单条数据
   */
  deleteItem(collectionName: string, itemId: string) {
    const items = this.getData(collectionName);
    const filtered = items.filter((i: any) => i.id !== itemId);
    this.saveData(collectionName, filtered);
  }

  /**
   * 生成分店财务汇总（每天关店时调用）
   */
  async generateFinancialSummary() {
    const storeId = this.getCurrentStoreId();
    if (!storeId) return null;

    const orders = this.getData('pos_orders');
    const expenses = this.getData('expenses');

    const today = getLocalDateString();
    const todayOrders = orders.filter((o: any) => o.createdAt?.startsWith(today));
    const todayExpenses = expenses.filter((e: any) => e.date?.startsWith(today));

    const totalRevenue = todayOrders.reduce((sum: number, o: any) => sum + (o.totalAmount || 0), 0);
    const totalExpenses = todayExpenses.reduce((sum: number, e: any) => sum + (e.amount || 0), 0);

    const summary = {
      id: `summary_${today}`,
      date: today,
      storeId,
      totalRevenue,
      totalExpenses,
      netProfit: totalRevenue - totalExpenses,
      orderCount: todayOrders.length,
      generatedAt: getLocalDateTime()
    };

    // 保存到 Firestore（老板可查看）
    try {
      await smartAddDocument(`stores/${storeId}/financial_summary`, summary);
      console.log('✅ 财务汇总已生成并上传');
    } catch (error) {
      console.error('❌ 财务汇总上传失败', error);
    }

    return summary;
  }

  /**
   * 🔥 从 Firestore 同步分店数据到 localStorage
   * 登录时调用，确保多设备数据一致
   */
  async syncStoreData(storeId: string): Promise<void> {
    console.log(`🔄 开始从 Firestore 同步分店 ${storeId} 的数据...`);

    // 🔥 第一步：同步全局数据（users、stores）
    await this.syncGlobalData();

    // 🔥 第二步：同步分店专属数据
    const collections = [
      'inventory_items',
      'menu_items',
      'pos_orders',
      'expenses',
      'purchase_orders',
      'employees',
      'employee_deletions',
      'fridges',
      'fridge_inventory',
      'suppliers',
      'attendance_records',
      'loan_records',
      'salary_records',
      'handovers',
      'customers',
      'expense_categories',
      'points_transactions',
      'exchange_rate',
      'pos_cancel_records',
      'pos_held_orders',
      'pos_tables'
    ];

    let syncedCount = 0;

    for (const collection of collections) {
      try {
        // 🔥 直接读取分店专属集合，不使用smartGetDocuments（避免路径重复）
        const { db } = await import('../firebase');
        const { collection: firestoreCollection, getDocs } = await import('firebase/firestore');
        const firestorePath = `stores/${storeId}/${collection}`;
        const querySnapshot = await getDocs(firestoreCollection(db, firestorePath));

        const cloudData = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
        }));

        if (cloudData && cloudData.length > 0) {
          // 🔥 比较本地数据和云端数据，保留最新的
          const localKey = `store_${storeId}_${collection}`;
          const localDataStr = localStorage.getItem(localKey);
          let finalData = cloudData;

          if (localDataStr) {
            try {
              const localData = JSON.parse(localDataStr);

              // 如果本地数据有 updatedAt，且比云端新，则保留本地数据
              if (localData.length > 0 && (localData[0] as any).updatedAt && (cloudData[0] as any).updatedAt) {
                const localTime = new Date((localData[0] as any).updatedAt).getTime();
                const cloudTime = new Date((cloudData[0] as any).updatedAt).getTime();

                if (localTime > cloudTime) {
                  console.log(`⚠️ 本地 ${collection} 数据更新，保留本地数据`);
                  finalData = localData;
                } else {
                  console.log(`✅ 云端 ${collection} 数据更新，使用云端数据`);
                }
              } else {
                // 没有时间戳，直接使用云端数据
                console.log(`✅ 已同步 ${collection}: ${cloudData.length} 条`);
              }
            } catch (e) {
              console.warn(`⚠️ 解析本地 ${collection} 数据失败，使用云端数据`, e);
            }
          }

          // 保存到分店专属 localStorage key，避免多分店数据互相污染。
          localStorage.setItem(localKey, JSON.stringify(finalData));
          console.log(`✅ 最终保存 ${collection}: ${finalData.length} 条`);
          syncedCount++;
        } else {
          console.log(`⚠️ ${collection} 在云端为空`);
        }
      } catch (error) {
        console.error(`❌ 同步 ${collection} 失败:`, error);
      }
    }

    console.log(`🎉 同步完成，共 ${syncedCount} 个集合`);

    // 触发自定义事件，通知 AppContext 更新
    window.dispatchEvent(new Event('dataSynced'));
  }

  /**
   * 🔥 同步全局数据（users、stores、system_roles）
   */
  private async syncGlobalData(): Promise<void> {
    console.log('🔄 开始同步全局数据...');

    const globalCollections = ['users', 'stores', 'system_roles'];

    for (const collectionName of globalCollections) {
      try {
        // 🔥 直接读取全局集合，不使用getStoreCollectionPath
        const { db } = await import('../firebase');
        const { collection, getDocs } = await import('firebase/firestore');
        const querySnapshot = await getDocs(collection(db, collectionName));

        const cloudData = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
        }));

        if (cloudData && cloudData.length > 0) {
          // 保存到 localStorage
          localStorage.setItem(collectionName, JSON.stringify(cloudData));
          console.log(`✅ 已同步全局 ${collectionName}: ${cloudData.length} 条`);
        } else {
          console.log(`⚠️ 全局 ${collectionName} 在云端为空`);
        }
      } catch (error) {
        console.error(`❌ 同步全局 ${collectionName} 失败:`, error);
      }
    }
  }

  /**
   * 🔥 为 admin 账号同步全局数据（公开方法）
   */
  async syncGlobalDataForAdmin(): Promise<void> {
    await this.syncGlobalData();

    // 触发自定义事件，通知 AppContext 更新
    window.dispatchEvent(new Event('dataSynced'));
  }

}

// 导出单例
export const dataService = new DataService();
