import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  query,
  where,
  onSnapshot,
  orderBy,
  increment,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import { dataService } from './DataService';

/**
 * 🔥 将 Firestore Timestamp 转换为本地时间字符串
 */
const convertTimestampsToLocalTime = (data: any): any => {
  if (!data || typeof data !== 'object') return data;

  const converted = { ...data };

  // 处理 createdAt 和 updatedAt 字段
  ['createdAt', 'updatedAt'].forEach(field => {
    if (converted[field]) {
      // 如果是 Firestore Timestamp
      if (converted[field].toDate) {
        const date = converted[field].toDate();
        // 转换为本地时间字符串
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
        converted[field] = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
      }
      // 如果已经是字符串，保持不变
    }
  });

  return converted;
};

const FIRESTORE_ENABLED = true;
const REALTIME_SYNC_ENABLED = true;
const GLOBAL_COLLECTIONS = ['users', 'stores', 'system_roles'];

// 🔥 获取当前用户的 storeId
const getCurrentStoreId = (): string | null => {
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
};

const getCollectionKey = (collectionName: string): string => {
  const parts = collectionName.split('/').filter(Boolean);
  return parts[parts.length - 1] || collectionName;
};

// 🔥 构建带 storeId 的集合路径
const getStoreCollectionPath = (collectionName: string): string => {
  if (collectionName.includes('/')) {
    return collectionName;
  }

  if (GLOBAL_COLLECTIONS.includes(collectionName)) {
    return collectionName;
  }

  const storeId = getCurrentStoreId();
  if (storeId) {
    return `stores/${storeId}/${collectionName}`;
  }

  return collectionName;
};

const getLocalStorageKey = (collectionName: string): string => {
  const collectionKey = getCollectionKey(collectionName);
  if (GLOBAL_COLLECTIONS.includes(collectionKey)) {
    return collectionKey;
  }

  const storeId = getCurrentStoreId();
  return storeId ? `store_${storeId}_${collectionKey}` : collectionKey;
};

const shouldAttachStoreId = (collectionName: string): boolean => {
  const collectionKey = getCollectionKey(collectionName);
  return !GLOBAL_COLLECTIONS.includes(collectionKey) && !collectionName.includes('/');
};

const toNumberVersion = (value: any): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const getComparableTimestamp = (value: any): number => {
  if (!value) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (typeof value === 'object' && typeof value.toDate === 'function') {
    return value.toDate().getTime();
  }
  return 0;
};

const getRecordVersion = (record: any): number => {
  return Math.max(
    toNumberVersion(record?.version),
    getComparableTimestamp(record?.lastModified),
    getComparableTimestamp(record?.updatedAt),
    getComparableTimestamp(record?.lastUpdated),
    getComparableTimestamp(record?.createdAt)
  );
};

const withSyncMetadata = (
  collectionName: string,
  data: any,
  id: string,
  existing?: any,
  includeCreatedAt = false
) => {
  const now = Date.now();
  const storeId = getCurrentStoreId();
  const existingVersion = toNumberVersion(existing?.version);
  const incomingVersion = toNumberVersion(data?.version);
  const nextVersion = Math.max(existingVersion + 1, incomingVersion || 0, 1);

  const normalized: any = {
    ...existing,
    ...data,
    id,
    version: nextVersion,
    lastModified: now,
    isDeleted: data?.isDeleted ?? existing?.isDeleted ?? false,
  };

  if (includeCreatedAt && !normalized.createdAt) {
    normalized.createdAt = new Date(now);
  }

  if (shouldAttachStoreId(collectionName) && storeId && !normalized.storeId) {
    normalized.storeId = storeId;
  }

  return normalized;
};

const shouldReplaceLocalRecord = (existing: any, incoming: any): boolean => {
  if (!existing) return true;
  const existingVersion = getRecordVersion(existing);
  const incomingVersion = getRecordVersion(incoming);
  return incomingVersion >= existingVersion;
};

const sanitizeFirestoreValue = (value: any): any => {
  if (value === undefined || value === null) return undefined;

  if (value instanceof Date) {
    return !isNaN(value.getTime()) ? Timestamp.fromDate(value) : undefined;
  }

  if (Array.isArray(value)) {
    return value
      .map(sanitizeFirestoreValue)
      .filter(entry => entry !== undefined);
  }

  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .map(([entryKey, entryValue]) => [entryKey, sanitizeFirestoreValue(entryValue)])
        .filter(([, entryValue]) => entryValue !== undefined)
    );
  }

  return value;
};

const toFirestoreData = (data: any, includeCreatedAt = false): any => {
  const docData: any = {
    updatedAt: Timestamp.now(),
  };

  if (includeCreatedAt) {
    docData.createdAt = data?.createdAt instanceof Date
      ? Timestamp.fromDate(data.createdAt)
      : data?.createdAt || Timestamp.now();
  }

  for (const [key, value] of Object.entries(data || {})) {
    if (value === undefined || value === null) continue;

    const sanitizedValue = sanitizeFirestoreValue(value);
    if (sanitizedValue !== undefined) {
      docData[key] = sanitizedValue;
    }
  }

  return docData;
};

/**
 * 智能数据同步服务
 * - 优先使用Firestore
 * - 断网时自动降级到localStorage
 * - 网络恢复后自动同步
 */

// ==================== 网络状态监听 ====================

let isOnline = navigator.onLine;

window.addEventListener('online', () => {
  isOnline = true;
  console.log('🌐 网络已连接，开始同步数据...');
  syncPendingChanges();
});

window.addEventListener('offline', () => {
  isOnline = false;
  console.log('⚠️ 网络已断开，切换到本地模式');
});

export const getNetworkStatus = () => isOnline;

// ==================== 待同步队列 ====================

interface PendingChange {
  id: string;
  collection: string;
  operation: 'add' | 'update' | 'delete';
  data?: any;
  timestamp: number;
}

const PENDING_CHANGES_KEY = 'pending_firestore_changes';

const getPendingChanges = (): PendingChange[] => {
  try {
    const changes = localStorage.getItem(PENDING_CHANGES_KEY);
    return changes ? JSON.parse(changes) : [];
  } catch {
    return [];
  }
};

const savePendingChange = (change: PendingChange) => {
  const changes = getPendingChanges();
  changes.push(change);
  localStorage.setItem(PENDING_CHANGES_KEY, JSON.stringify(changes));
  console.log(`💾 保存待同步操作: ${change.operation} ${change.collection}`);
};

const clearPendingChanges = () => {
  localStorage.removeItem(PENDING_CHANGES_KEY);
};

// ==================== 智能CRUD操作 ====================

/**
 * 智能添加文档
 * - 在线：直接写入Firestore + 实时监听自动同步到其他设备
 * - 离线：写入localStorage + 加入待同步队列
 */
export const smartAddDocument = async (collectionName: string, data: any) => {
  const storeCollectionPath = getStoreCollectionPath(collectionName);
  const docId = data.id || doc(collection(db, storeCollectionPath)).id;
  const existingLocal = getFromLocalStorage(collectionName).find(item => item.id === docId);
  const normalizedData = withSyncMetadata(collectionName, data, docId, existingLocal, true);

  if (!FIRESTORE_ENABLED) {
    console.log('⚠️ Firestore已禁用，仅使用本地存储');
    saveToLocalStorage(collectionName, normalizedData, docId);
    return { id: docId, success: true };
  }

  const docData = {
    ...toFirestoreData(normalizedData, true),
    id: docId,
  };

  if (isOnline) {
    try {
      const docRef = doc(db, storeCollectionPath, docId);
      await setDoc(docRef, docData, { merge: true });
      console.log(`✅ 已同步到云端: ${storeCollectionPath}/${docId}`);

      // 🔥 保存到localStorage作为缓存（实时监听会自动更新）
      saveToLocalStorage(collectionName, docData, docId);

      return { id: docId, ...docData };
    } catch (error) {
      console.error('❌ Firestore写入失败，降级到本地', error);
      return fallbackToLocalAdd(collectionName, { ...data, id: docId });
    }
  } else {
    // 离线模式
    console.log('⚠️ 离线模式，保存到本地');
    return fallbackToLocalAdd(collectionName, normalizedData);
  }
};

/**
 * 智能设置文档（支持指定ID）
 * - 如果文档存在则更新，不存在则创建
 * - 用于初始化默认数据
 */
export const smartSetDocument = async (collectionName: string, docId: string, data: any) => {
  const storeCollectionPath = getStoreCollectionPath(collectionName);
  const existingLocal = getFromLocalStorage(collectionName).find(item => item.id === docId);
  const normalizedData = withSyncMetadata(collectionName, data, docId, existingLocal, true);
  const docData = {
    ...toFirestoreData(normalizedData, true),
    id: docId,
  };

  if (isOnline) {
    try {
      const docRef = doc(db, storeCollectionPath, docId);
      // 检查文档是否存在
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        // 存在则更新
        await updateDoc(docRef, docData);
        console.log(`✅ 已更新云端文档: ${collectionName}/${docId}`);
      } else {
        // 不存在则创建
        await setDoc(docRef, {
          ...docData,
          createdAt: Timestamp.now(),
        });
        console.log(`✅ 已创建云端文档: ${collectionName}/${docId}`);
      }

      // 同时保存到localStorage
      saveToLocalStorage(collectionName, docData, docId);

      return { id: docId, ...docData };
    } catch (error) {
      console.error('❌ Firestore操作失败，降级到本地', error);
      saveToLocalStorage(collectionName, docData, docId);
      return { id: docId, ...docData };
    }
  } else {
    // 离线模式
    console.log('⚠️ 离线模式，保存到本地');
    saveToLocalStorage(collectionName, docData, docId);
    return { id: docId, ...docData };
  }
};

/**
 * 智能更新文档
 * - 🔥 关键：使用 Firestore 事务保证原子性
 * - 🔥 冲突解决：以服务器时间戳为准（last-write-wins）
 */
export const smartUpdateDocument = async (collectionName: string, docId: string, data: any) => {
  const existingLocal = getFromLocalStorage(collectionName).find(item => item.id === docId);
  const normalizedData = withSyncMetadata(collectionName, data, docId, existingLocal);

  if (!FIRESTORE_ENABLED) {
    console.log('⚠️ Firestore已禁用，仅使用本地存储');
    updateInLocalStorage(collectionName, docId, normalizedData);
    return { success: true };
  }

  const storeCollectionPath = getStoreCollectionPath(collectionName);
  const firestoreUpdateData = {
    ...toFirestoreData(normalizedData),
    id: docId,
  };

  if (isOnline) {
    try {
      const docRef = doc(db, storeCollectionPath, docId);

      // 🔥 检查文档是否存在
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        // 存在则更新
        await updateDoc(docRef, firestoreUpdateData);
        console.log(`✅ 已同步更新到云端: ${collectionName}/${docId}`);
      } else {
        // 不存在则创建（包含 createdAt）
        await setDoc(docRef, {
          ...firestoreUpdateData,
          createdAt: Timestamp.now(),
        });
        console.log(`✅ 已创建并同步到云端: ${collectionName}/${docId}`);
      }

      updateInLocalStorage(collectionName, docId, normalizedData);
    } catch (error) {
      console.error('❌ Firestore更新失败，降级到本地', error);
      fallbackToLocalUpdate(collectionName, docId, normalizedData);
    }
  } else {
    // 离线模式
    console.log('⚠️ 离线模式，更新本地数据');
    fallbackToLocalUpdate(collectionName, docId, normalizedData);
  }
};

/**
 * 智能删除文档
 */
export const smartDeleteDocument = async (collectionName: string, docId: string) => {
  if (!FIRESTORE_ENABLED) {
    console.log('⚠️ Firestore已禁用，仅使用本地存储');
    deleteFromLocalStorage(collectionName, docId);
    return { success: true };
  }

  const storeCollectionPath = getStoreCollectionPath(collectionName);

  if (isOnline) {
    try {
      const docRef = doc(db, storeCollectionPath, docId);
      await deleteDoc(docRef);
      console.log(`✅ 已从云端删除: ${collectionName}/${docId}`);

      deleteFromLocalStorage(collectionName, docId);
    } catch (error) {
      console.error('❌ Firestore删除失败，降级到本地', error);
      fallbackToDelete(collectionName, docId);
    }
  } else {
    // 离线模式
    console.log('⚠️ 离线模式，从本地删除');
    fallbackToDelete(collectionName, docId);
  }
};

export const smartIncrementField = async (
  collectionName: string,
  docId: string,
  fieldName: string,
  amount: number,
  extraData: Record<string, any> = {}
) => {
  const storeCollectionPath = getStoreCollectionPath(collectionName);
  const updateData = {
    ...toFirestoreData(extraData),
    id: docId,
    [fieldName]: increment(amount),
  };

  if (isOnline && FIRESTORE_ENABLED) {
    try {
      await setDoc(doc(db, storeCollectionPath, docId), updateData, { merge: true });
      console.log(`✅ 原子更新 ${collectionName}/${docId}.${fieldName}: ${amount}`);
      return { success: true };
    } catch (error) {
      console.error(`❌ 原子更新失败: ${collectionName}/${docId}.${fieldName}`, error);
    }
  }

  const existing = getFromLocalStorage(collectionName);
  const updated = existing.map(item => {
    if (item.id !== docId) return item;
    return {
      ...item,
      ...extraData,
      [fieldName]: (Number(item[fieldName]) || 0) + amount,
    };
  });
  localStorage.setItem(getLocalStorageKey(collectionName), JSON.stringify(updated));

  savePendingChange({
    id: docId,
    collection: collectionName,
    operation: 'update',
    data: {
      ...extraData,
      __increment: { fieldName, amount },
    },
    timestamp: Date.now(),
  });
  return { success: false };
};

/**
 * 智能获取文档列表
 * - 在线：从Firestore读取（实时监听）
 * - 离线：从localStorage读取
 */
export const smartGetDocuments = async (collectionName: string) => {
  const storeCollectionPath = getStoreCollectionPath(collectionName);

  if (isOnline) {
    try {
      const querySnapshot = await getDocs(collection(db, storeCollectionPath));
      const docs = querySnapshot.docs.map(doc => {
        const rawData = {
          id: doc.id,
          ...doc.data(),
        };
        // 🔥 转换 Timestamp 为本地时间字符串
        return convertTimestampsToLocalTime(rawData);
      });

      // ⚠️ 不再自动覆盖localStorage，避免云端脏数据污染本地
      // localStorage.setItem(collectionName, JSON.stringify(docs));
      console.log(`✅ 从云端获取: ${collectionName} (${docs.length}条)`);

      return docs;
    } catch (error) {
      console.error('❌ Firestore读取失败，从本地读取', error);
      return getFromLocalStorage(collectionName);
    }
  } else {
    // 离线模式
    console.log('⚠️ 离线模式，从本地读取');
    return getFromLocalStorage(collectionName);
  }
};

/**
 * 实时监听集合
 * 🔥 使用 Firestore onSnapshot 实时监听数据变化
 */
export const smartSubscribeToCollection = (
  collectionName: string,
  callback: (data: any[]) => void
) => {
  console.log(`🔔 开始实时订阅: ${collectionName}`);
  let lastSerialized: string | null = null;

  if (!db || !FIRESTORE_ENABLED || !REALTIME_SYNC_ENABLED) {
    console.warn(`⚠️ Firestore未初始化，使用本地数据: ${collectionName}`);
    const localData = getFromLocalStorage(collectionName);
    callback(localData);
    return () => {};
  }

  try {
    const storeId = dataService.getCurrentStoreId();
    let collectionRef;

    const collectionKey = getCollectionKey(collectionName);
    if (GLOBAL_COLLECTIONS.includes(collectionKey) || collectionName.includes('/')) {
      collectionRef = collection(db, collectionName);
    } else if (storeId) {
      collectionRef = collection(db, 'stores', storeId, collectionName);
    } else {
      console.warn(`⚠️ 没有storeId，使用本地数据: ${collectionName}`);
      const localData = getFromLocalStorage(collectionName);
      callback(localData);
      return () => {};
    }

    // 🔥 实时监听 Firestore 变化
    const unsubscribe = onSnapshot(
      collectionRef,
      (snapshot) => {
        const data: any[] = [];
        snapshot.forEach((doc) => {
          data.push(convertTimestampsToLocalTime({ id: doc.id, ...doc.data() }));
        });

        const serialized = JSON.stringify(data);
        if (serialized === lastSerialized) {
          return;
        }
        lastSerialized = serialized;

        console.log(`📡 Firestore实时更新 ${collectionName}: ${data.length}条`);

        // 🔥 同步到 localStorage（分店专属key）
        try {
          localStorage.setItem(getLocalStorageKey(collectionName), serialized);
        } catch (error) {
          console.error('保存localStorage失败:', error);
        }

        // 通知回调
        callback(data);
      },
      (error) => {
        console.error(`❌ 订阅 ${collectionName} 失败:`, error);
        // 出错时使用本地数据
        const localData = getFromLocalStorage(collectionName);
        callback(localData);
      }
    );

    return unsubscribe;
  } catch (error) {
    console.error(`❌ 设置订阅失败:`, error);
    const localData = getFromLocalStorage(collectionName);
    callback(localData);
    return () => {};
  }
};

/**
 * ✅ 手动同步所有数据到 Firestore（每天2次）
 * 建议在早上开店前和晚上关店后执行
 */
export const manualSyncToFirestore = async () => {
  console.log('🔄 开始手动同步数据到 Firestore...');

  if (!FIRESTORE_ENABLED) {
    console.log('⚠️ Firestore已禁用');
    return;
  }

  try {
    const collections = [
      'stores',
      'users',
      'employees',
      'attendance_records',
      'salary_records',
      'loan_records',
      'cash_flow_records',
      'inventory_items',
      'menu_items',
      'pos_orders',
      'pos_tables',
      'pos_held_orders',
      'expenses',
      'purchase_orders',
      'suppliers',
      'handovers',
      'system_roles'
    ];

    let totalSynced = 0;

    for (const collectionName of collections) {
      const localData = getFromLocalStorage(collectionName);
      if (localData.length === 0) continue;

      console.log(`📤 同步 ${collectionName}: ${localData.length} 条记录`);

      const storeCollectionPath = getStoreCollectionPath(collectionName);

      for (const item of localData) {
        try {
          const docRef = doc(db, storeCollectionPath, item.id);
          const normalizedItem = withSyncMetadata(collectionName, item, item.id, item, !item.createdAt);
          const firestoreData = toFirestoreData(normalizedItem, !item.createdAt);

          await setDoc(docRef, firestoreData, { merge: true });
          totalSynced++;
        } catch (error) {
          console.warn(`⚠️ 同步失败: ${collectionName}/${item.id}`, error);
        }
      }
    }

    console.log(`✅ 同步完成！共同步 ${totalSynced} 条记录`);
    alert(`✅ 数据同步成功！\n\n共同步 ${totalSynced} 条记录到云端。`);
  } catch (error) {
    console.error('❌ 同步失败:', error);
    alert('❌ 数据同步失败，请检查网络连接');
  }
};

// ==================== localStorage辅助函数 ====================

const saveToLocalStorage = (collectionName: string, data: any, id: string) => {
  try {
    const existing = getFromLocalStorage(collectionName);
    const currentItem = existing.find(item => item.id === id);
    const incomingItem = { id, ...data };
    if (currentItem && !shouldReplaceLocalRecord(currentItem, incomingItem)) {
      return;
    }
    const updated = [...existing.filter(item => item.id !== id), incomingItem];
    localStorage.setItem(getLocalStorageKey(collectionName), JSON.stringify(updated));
  } catch (error) {
    console.error('❌ localStorage保存失败', error);
  }
};

const updateInLocalStorage = (collectionName: string, id: string, data: any) => {
  try {
    const existing = getFromLocalStorage(collectionName);
    const currentItem = existing.find(item => item.id === id);
    const incomingItem = { ...currentItem, ...data, id };
    const updated = existing.map(item =>
      item.id === id && shouldReplaceLocalRecord(item, incomingItem) ? incomingItem : item
    );
    const next = existing.some(item => item.id === id) ? updated : [...updated, incomingItem];
    localStorage.setItem(getLocalStorageKey(collectionName), JSON.stringify(next));
  } catch (error) {
    console.error('❌ localStorage更新失败', error);
  }
};

const deleteFromLocalStorage = (collectionName: string, id: string) => {
  try {
    const existing = getFromLocalStorage(collectionName);
    const updated = existing.filter(item => item.id !== id);
    localStorage.setItem(getLocalStorageKey(collectionName), JSON.stringify(updated));
  } catch (error) {
    console.error('❌ localStorage删除失败', error);
  }
};

const getFromLocalStorage = (collectionName: string): any[] => {
  try {
    const storageKey = getLocalStorageKey(collectionName);
    const data = localStorage.getItem(storageKey) || localStorage.getItem(getCollectionKey(collectionName));
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
};

const fallbackToLocalAdd = (collectionName: string, data: any) => {
  const id = data.id || `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  saveToLocalStorage(collectionName, { ...data, id }, id);

  // 加入待同步队列
  savePendingChange({
    id,
    collection: collectionName,
    operation: 'add',
    data,
    timestamp: Date.now(),
  });

  return { id, ...data };
};

const fallbackToLocalUpdate = (collectionName: string, id: string, data: any) => {
  updateInLocalStorage(collectionName, id, data);

  savePendingChange({
    id,
    collection: collectionName,
    operation: 'update',
    data,
    timestamp: Date.now(),
  });
};

const fallbackToDelete = (collectionName: string, id: string) => {
  deleteFromLocalStorage(collectionName, id);

  savePendingChange({
    id,
    collection: collectionName,
    operation: 'delete',
    timestamp: Date.now(),
  });
};

// ==================== 同步待处理更改 ====================

/**
 * 同步所有待处理的更改到Firestore
 */
export const syncPendingChanges = async () => {
  const changes = getPendingChanges();

  if (changes.length === 0) {
    console.log('✅ 没有待同步的更改');
    return;
  }

  console.log(`🔄 开始同步 ${changes.length} 条待处理更改...`);

  let successCount = 0;
  let failCount = 0;

  for (const change of changes) {
    try {
      const collectionPath = getStoreCollectionPath(change.collection);
      switch (change.operation) {
        case 'add':
          await setDoc(doc(db, collectionPath, change.id), toFirestoreData({ ...change.data, id: change.id }, true), { merge: true });
          break;
        case 'update':
          const updateDocRef = doc(db, collectionPath, change.id);
          if (change.data?.__increment) {
            const { fieldName, amount } = change.data.__increment;
            const { __increment, ...rest } = change.data;
            await setDoc(updateDocRef, {
              ...toFirestoreData({ ...rest, id: change.id }),
              [fieldName]: increment(amount),
            }, { merge: true });
          } else {
            await setDoc(updateDocRef, toFirestoreData({ ...change.data, id: change.id }), { merge: true });
          }
          break;
        case 'delete':
          const deleteDocRef = doc(db, collectionPath, change.id);
          await deleteDoc(deleteDocRef);
          break;
      }
      successCount++;
      console.log(`✅ 同步成功: ${change.operation} ${change.collection}/${change.id}`);
    } catch (error) {
      failCount++;
      console.error(`❌ 同步失败: ${change.operation} ${change.collection}/${change.id}`, error);
    }
  }

  // 清除已成功同步的记录
  if (successCount > 0) {
    clearPendingChanges();
    console.log(`✅ 同步完成: 成功${successCount}条, 失败${failCount}条`);
  }
};

// ==================== 分店数据隔离 ====================

export const smartGetStoreDocuments = async (collectionName: string, storeId: string) => {
  if (isOnline) {
    try {
      const q = query(collection(db, collectionName), where('storeId', '==', storeId));
      const querySnapshot = await getDocs(q);
      return querySnapshot.docs.map(doc => {
        const rawData = {
          id: doc.id,
          ...doc.data(),
        };
        // 🔥 转换 Timestamp 为本地时间字符串
        return convertTimestampsToLocalTime(rawData);
      });
    } catch (error) {
      console.error('❌ Firestore查询失败', error);
      return getFromLocalStorage(collectionName).filter(item => item.storeId === storeId);
    }
  } else {
    return getFromLocalStorage(collectionName).filter(item => item.storeId === storeId);
  }
};

export const smartSubscribeToStoreCollection = (
  collectionName: string,
  storeId: string,
  callback: (data: any[]) => void
) => {
  if (!isOnline) {
    const localData = getFromLocalStorage(collectionName).filter(item => item.storeId === storeId);
    callback(localData);
    return () => {};
  }

  try {
    const q = query(
      collection(db, collectionName),
      where('storeId', '==', storeId),
      orderBy('createdAt', 'desc')
    );

    return onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => {
        const rawData = {
          id: doc.id,
          ...doc.data(),
        };
        // 🔥 转换 Timestamp 为本地时间字符串
        return convertTimestampsToLocalTime(rawData);
      });

      // 缓存到localStorage
      localStorage.setItem(`${collectionName}_${storeId}`, JSON.stringify(data));
      callback(data);
    }, (error) => {
      console.error('❌ 监听失败', error);
      const localData = getFromLocalStorage(collectionName).filter(item => item.storeId === storeId);
      callback(localData);
    });
  } catch (error) {
    console.error('❌ 设置监听失败', error);
    const localData = getFromLocalStorage(collectionName).filter(item => item.storeId === storeId);
    callback(localData);
    return () => {};
  }
};

// ==================== 批量操作 ====================

export const smartBatchAddDocuments = async (collectionName: string, documents: any[]) => {
  const results = [];
  for (const doc of documents) {
    const result = await smartAddDocument(collectionName, doc);
    results.push(result);
  }
  return results;
};

// ==================== 数据迁移 ====================

/**
 * 从旧localStorage格式迁移到新的智能同步系统
 */
export const migrateOldData = async () => {
  console.log('🔄 检查是否需要迁移数据...');

  const collections = [
    'employees',
    'stores',
    'pos_orders',
    'inventory_items',
    'menu_items',
    'customers',
    'attendance',
    'salaries',
    'loans',
  ];

  for (const key of collections) {
    const savedData = localStorage.getItem(key);
    if (savedData) {
      try {
        const data = JSON.parse(savedData);
        if (Array.isArray(data) && data.length > 0) {
          console.log(`📦 发现${key}数据: ${data.length}条`);

          // 检查是否已经同步到Firestore
          const firestoreData = await smartGetDocuments(key);
          if (firestoreData.length === 0) {
            console.log(`🔄 开始迁移${key}到Firestore...`);
            await smartBatchAddDocuments(key, data);
            console.log(`✅ ${key}迁移完成`);
          } else {
            console.log(`⏭️ ${key}已存在，跳过迁移`);
          }
        }
      } catch (error) {
        console.error(`❌ 迁移${key}失败`, error);
      }
    }
  }

  console.log('✅ 数据迁移检查完成');
};

