/**
 * 统一数据访问层
 * - 所有数据操作都通过此服务
 * - localStorage是主存储，Firestore是云端备份
 * - 防止空数组覆盖现有数据
 */

import { getLocalDateTime, getLocalDateString } from '../utils/localTime';
import { smartAddDocument, smartGetDocuments } from './smartSyncService';
import { db } from '../firebase';
import { writeBatch, doc } from 'firebase/firestore';

class DataService {
  // 🔥 备份模式相关
  private backupMode: boolean = false;
  private backupInterval: number = 5 * 60 * 1000; // 默认5分钟

  /**
   * 设置备份模式
   * @param enabled 是否启用备份模式
   * @param interval 备份间隔（毫秒），默认5分钟
   */
  setBackupMode(enabled: boolean, interval?: number) {
    this.backupMode = enabled;
    if (interval) {
      this.backupInterval = interval;
    }
    console.log(`📡 备份模式: ${enabled ? '启用' : '禁用'}, 间隔: ${this.backupInterval}ms`);
  }

  /**
   * 获取当前备份间隔
   */
  getBackupInterval(): number {
    return this.backupInterval;
  }

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
   * 🔥 数据迁移：将全局数据复制到当前用户的分店专属路径
   * 解决店长账号看不到数据的问题
   */
  migrateGlobalDataToStore(): void {
    const storeId = this.getCurrentStoreId();
    if (!storeId) {
      console.log('⚠️ 没有 storeId，跳过迁移');
      return;
    }

    if (Date.now() > 0) {
      console.log('Skip automatic global-to-store migration to protect store-isolated data:', storeId);
      return;
    }

    const collections = [
      'inventory_items',
      'inventory_categories',
      'menu_items',
      'pos_orders',
      'expenses',
      'purchase_orders',
      'suppliers',
      'employees'
    ];

    let migratedCount = 0;

    collections.forEach(collection => {
      // 检查全局数据是否存在
      const globalData = localStorage.getItem(collection);
      if (!globalData) {
        console.log(`⚠️ 全局 ${collection} 不存在，跳过`);
        return;
      }

      const globalItems = JSON.parse(globalData);

      // 检查分店专属数据是否已存在
      const storeKey = `store_${storeId}_${collection}`;
      const storeData = localStorage.getItem(storeKey);

      if (storeData) {
        const storeItems = JSON.parse(storeData);

        // 🔥 如果全局数据比分店数据多，覆盖分店数据
        if (globalItems.length > storeItems.length) {
          localStorage.setItem(storeKey, globalData);
          migratedCount++;
          console.log(`✅ 已更新 ${collection}：全局(${globalItems.length}) > 分店(${storeItems.length})`);
        } else {
          console.log(`✅ 分店 ${collection} 数据完整(${storeItems.length})，跳过`);
        }
        return;
      }

      // 分店数据不存在，直接复制
      localStorage.setItem(storeKey, globalData);
      migratedCount++;
      console.log(`✅ 已迁移 ${collection} 到分店 ${storeId} (${globalItems.length} 条)`);
    });

    if (migratedCount > 0) {
      console.log(`🎉 数据迁移完成，共迁移/更新 ${migratedCount} 个集合`);
    }
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

      // 🔥 异步同步到 Firestore（根据备份模式决定策略）
      // 🔥 默认禁用 Firestore 自动同步，只在手动备份时启用
      if (this.backupMode) {
        this.syncToFirestore(collectionName, dataWithTimestamp);
      }
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
   * 异步同步到 Firestore
   */
  // 🔥 防抖定时器
  private syncTimers: Map<string, NodeJS.Timeout> = new Map();

  // 🔥 全局同步队列（确保顺序执行）
  private syncQueue: Array<{collectionName: string, data: any}> = [];
  private isProcessingQueue: boolean = false;

  private async syncToFirestore(collectionName: string, data: any) {
    const storeId = this.getCurrentStoreId();
    if (!storeId) {
      return;
    }

    // 🔥 根据备份模式决定同步策略
    if (this.backupMode) {
      // 备份模式：使用防抖定时器
      const timerKey = `${storeId}_${collectionName}`;

      // 清除之前的定时器
      if (this.syncTimers.has(timerKey)) {
        clearTimeout(this.syncTimers.get(timerKey));
      }

      // 设置新的定时器
      const timer = setTimeout(() => {
        this.syncQueue.push({ collectionName, data });
        console.log(`📥 ${collectionName} 已加入同步队列，当前队列长度: ${this.syncQueue.length}`);
        this.processSyncQueue();
      }, this.backupInterval);

      this.syncTimers.set(timerKey, timer);
    } else {
      // 正常模式：立即加入同步队列
      this.syncQueue.push({ collectionName, data });
      console.log(`📥 ${collectionName} 已加入同步队列，当前队列长度: ${this.syncQueue.length}`);
      this.processSyncQueue();
    }
  }

  /**
   * 🔥 清理对象中的 undefined 字段（Firestore 不允许 undefined）
   */
  private cleanUndefinedFields(obj: any): any {
    if (obj === null || obj === undefined) return null;
    if (typeof obj !== 'object') return obj;

    if (Array.isArray(obj)) {
      return obj.map(item => this.cleanUndefinedFields(item));
    }

    const cleaned: any = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        const value = obj[key];
        if (value === undefined) {
          // 将 undefined 转换为 null
          cleaned[key] = null;
        } else if (typeof value === 'object' && value !== null) {
          // 递归清理嵌套对象
          cleaned[key] = this.cleanUndefinedFields(value);
        } else {
          cleaned[key] = value;
        }
      }
    }
    return cleaned;
  }

  /**
   * 🔥 处理同步队列（确保顺序执行，避免并发）
   */
  private async processSyncQueue() {
    if (this.isProcessingQueue || this.syncQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;

    while (this.syncQueue.length > 0) {
      const { collectionName, data } = this.syncQueue.shift()!;

      try {
        const storeId = this.getCurrentStoreId();
        const firestorePath = `stores/${storeId}/${collectionName}`;

        // 使用 batch 批量写入
        const writeBatchObj = writeBatch(db);

        for (const item of data) {
          // 🔥 为 fridge_inventory 生成复合 ID
          let docId = item.id;
          if (!docId && collectionName === 'fridge_inventory') {
            docId = `${item.fridgeId}-${item.itemId}`;
          }

          if (!docId) {
            console.warn(`⚠️ ${collectionName} 中的记录缺少 ID，跳过同步`, item);
            continue;
          }

          const docRef = doc(db, firestorePath, docId);
          // 🔥 清理 undefined 字段后再写入
          const cleanedItem = this.cleanUndefinedFields(item);
          writeBatchObj.set(docRef, cleanedItem, { merge: true });
        }

        await writeBatchObj.commit();
        console.log(`✅ 已同步 ${collectionName} (${data.length}条)`);

        // 🔥 每个batch之间等待2秒，避免队列堆积
        if (this.syncQueue.length > 0) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      } catch (error) {
        console.error(`❌ 同步 ${collectionName} 失败:`, error);
        // 如果失败，等待5秒后继续
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }

    this.isProcessingQueue = false;
  }

  /**
   * 从 Firestore 恢复数据（用于新设备或数据丢失）
   */
  async restoreFromFirestore() {
    const storeId = this.getCurrentStoreId();
    if (!storeId) {
      alert('请先登录分店账号');
      return false;
    }

    const collections = [
      'inventory_items',
      'menu_items',
      'pos_orders',
      'expenses',
      'purchase_orders',
      'suppliers',
      'employees'
    ];

    let restoredCount = 0;

    for (const col of collections) {
      try {
        const firestorePath = `stores/${storeId}/${col}`;
        const cloudData = await smartGetDocuments(firestorePath);

        if (cloudData && cloudData.length > 0) {
          const key = `store_${storeId}_${col}`;
          localStorage.setItem(key, JSON.stringify(cloudData));
          console.log(`✅ 已恢复 ${col}: ${cloudData.length} 条`);
          restoredCount += cloudData.length;
        }
      } catch (error) {
        console.error(`❌ 恢复 ${col} 失败:`, error);
      }
    }

    if (restoredCount > 0) {
      alert(`✅ 数据恢复完成！共恢复 ${restoredCount} 条记录`);
      window.location.reload();
      return true;
    } else {
      alert('⚠️ Firestore中没有找到数据');
      return false;
    }
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

  /**
   * 🔥 手动同步所有数据到 Firestore（用户主动触发）
   */
  async syncToFirestoreNow(): Promise<void> {
    const storeId = this.getCurrentStoreId();
    if (!storeId) {
      alert('请先登录分店账号');
      return;
    }

    const collections = [
      'inventory_items',
      'menu_items',
      'pos_orders',
      'expenses',
      'purchase_orders',
      'employees',
      'employee_deletions'
    ];

    let syncedCount = 0;
    let failedCount = 0;

    console.log('🔄 开始手动同步到 Firestore...');

    for (const collection of collections) {
      try {
        const localData = this.getData(collection);
        if (localData.length === 0) {
          console.log(`⚠️ ${collection} 本地为空，跳过`);
          continue;
        }

        // 使用 batch 批量写入
        const firestorePath = `stores/${storeId}/${collection}`;
        const writeBatchObj = writeBatch(db);

        for (const item of localData) {
          const docRef = doc(db, firestorePath, item.id);
          writeBatchObj.set(docRef, item, { merge: true });
        }

        await writeBatchObj.commit();
        console.log(`✅ 已同步 ${collection}: ${localData.length} 条`);
        syncedCount++;
      } catch (error) {
        console.error(`❌ 同步 ${collection} 失败:`, error);
        failedCount++;
      }
    }

    console.log(`🎉 手动同步完成：成功 ${syncedCount} 个，失败 ${failedCount} 个`);
    alert(`同步完成！\n成功: ${syncedCount} 个集合\n失败: ${failedCount} 个集合`);
  }
}

// 导出单例
export const dataService = new DataService();
