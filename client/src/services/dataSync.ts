/**
 * 全局数据同步服务
 * 统一管理Firebase和localStorage的数据同步
 */

import { db } from '../firebase';
import { 
  collection, 
  doc, 
  getDocs, 
  getDoc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where,
  onSnapshot,
  WriteBatch,
  writeBatch,
  setDoc,
} from 'firebase/firestore';
import { COLLECTIONS } from '../firebase/config';

// ==================== 通用CRUD操作 ====================

/**
 * 获取集合中的所有文档
 */
export const getAllDocuments = async (collectionName: string, storeId?: string) => {
  try {
    let q = query(collection(db, collectionName));
    
    // 如果指定了storeId，添加过滤条件
    if (storeId) {
      q = query(collection(db, collectionName), where('storeId', '==', storeId));
    }
    
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));
  } catch (error) {
    console.error(`获取${collectionName}失败:`, error);
    throw error;
  }
};

/**
 * 获取单个文档
 */
export const getDocument = async (collectionName: string, docId: string) => {
  try {
    const docRef = doc(db, collectionName, docId);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      return {
        id: docSnap.id,
        ...docSnap.data(),
      };
    }
    return null;
  } catch (error) {
    console.error(`获取文档失败:`, error);
    throw error;
  }
};

/**
 * 添加文档
 */
export const addDocument = async (collectionName: string, data: any) => {
  try {
    const docRef = await addDoc(collection(db, collectionName), {
      ...data,
      createdAt: new Date().toISOString(),
    });
    return docRef.id;
  } catch (error) {
    console.error(`添加文档失败:`, error);
    throw error;
  }
};

/**
 * 更新文档（如果不存在则创建）
 */
export const updateDocument = async (collectionName: string, docId: string, data: any) => {
  try {
    const docRef = doc(db, collectionName, docId);
    // 使用 setDoc with merge，无论文档是否存在都能成功
    await setDoc(docRef, {
      ...data,
      updatedAt: new Date().toISOString(),
    }, { merge: true });
  } catch (error) {
    console.error(`更新文档失败:`, error);
    throw error;
  }
};

/**
 * 删除文档
 */
export const deleteDocument = async (collectionName: string, docId: string) => {
  try {
    const docRef = doc(db, collectionName, docId);
    await deleteDoc(docRef);
  } catch (error) {
    console.error(`删除文档失败:`, error);
    throw error;
  }
};

/**
 * 批量写入
 */
export const batchWrite = async (operations: Array<{
  type: 'set' | 'update' | 'delete';
  collection: string;
  docId?: string;
  data?: any;
}>) => {
  try {
    const batch = writeBatch(db);
    
    operations.forEach(op => {
      const docRef = op.docId 
        ? doc(db, op.collection, op.docId)
        : doc(collection(db, op.collection));
      
      if (op.type === 'set') {
        batch.set(docRef, { ...op.data, createdAt: new Date().toISOString() });
      } else if (op.type === 'update') {
        batch.update(docRef, { ...op.data, updatedAt: new Date().toISOString() });
      } else if (op.type === 'delete') {
        batch.delete(docRef);
      }
    });
    
    await batch.commit();
  } catch (error) {
    console.error('批量写入失败:', error);
    throw error;
  }
};

// ==================== 实时监听 ====================

/**
 * 监听集合变化
 */
export const subscribeToCollection = (
  collectionName: string,
  callback: (data: any[]) => void,
  storeId?: string
) => {
  let q = query(collection(db, collectionName));
  
  if (storeId) {
    q = query(collection(db, collectionName), where('storeId', '==', storeId));
  }
  
  const unsubscribe = onSnapshot(q, (snapshot) => {
    const data = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));
    callback(data);
  });
  
  return unsubscribe;
};

// ==================== 离线同步策略 ====================

/**
 * 保存到本地并同步到云端
 */
export const saveWithSync = async (
  collectionName: string,
  data: any,
  docId?: string
) => {
  // 1. 先保存到localStorage（离线可用）
  const localKey = `local_${collectionName}`;
  const localData = JSON.parse(localStorage.getItem(localKey) || '[]');
  
  if (docId) {
    // 更新
    const index = localData.findIndex((item: any) => item.id === docId);
    if (index !== -1) {
      localData[index] = { ...data, id: docId };
    }
  } else {
    // 新增
    const newId = `${collectionName}_${Date.now()}`;
    localData.push({ ...data, id: newId });
  }
  
  localStorage.setItem(localKey, JSON.stringify(localData));
  
  // 2. 尝试同步到Firebase
  try {
    if (docId) {
      await updateDocument(collectionName, docId, data);
    } else {
      await addDocument(collectionName, data);
    }
    
    // 同步成功，标记为已同步
    const syncKey = `sync_${collectionName}`;
    localStorage.setItem(syncKey, 'true');
  } catch (error) {
    console.warn('云端同步失败，数据已保存到本地', error);
    // 标记待同步
    const pendingKey = `pending_sync_${collectionName}`;
    const pending = JSON.parse(localStorage.getItem(pendingKey) || '[]');
    pending.push({ collection: collectionName, data, docId, timestamp: Date.now() });
    localStorage.setItem(pendingKey, JSON.stringify(pending));
  }
};

/**
 * 从本地或云端加载数据（优先云端）
 */
export const loadData = async (collectionName: string, storeId?: string) => {
  try {
    // 尝试从云端加载
    const cloudData = await getAllDocuments(collectionName, storeId);
    
    // 保存到本地缓存
    localStorage.setItem(`local_${collectionName}`, JSON.stringify(cloudData));
    
    return cloudData;
  } catch (error) {
    console.warn('云端加载失败，使用本地数据', error);
    
    // 从本地加载
    const localData = JSON.parse(localStorage.getItem(`local_${collectionName}`) || '[]');
    return localData;
  }
};

/**
 * 同步待上传的数据
 */
export const syncPendingData = async () => {
  const collections = Object.values(COLLECTIONS);
  
  for (const collectionName of collections) {
    const pendingKey = `pending_sync_${collectionName}`;
    const pending = JSON.parse(localStorage.getItem(pendingKey) || '[]');
    
    if (pending.length === 0) continue;
    
    console.log(`同步 ${collectionName} 的 ${pending.length} 条待上传数据...`);
    
    for (const item of pending) {
      try {
        if (item.docId) {
          await updateDocument(item.collection, item.docId, item.data);
        } else {
          await addDocument(item.collection, item.data);
        }
      } catch (error) {
        console.error(`同步失败:`, error);
        break;
      }
    }
    
    // 清空已同步的数据
    localStorage.removeItem(pendingKey);
  }
  
  console.log('✅ 所有待同步数据已处理');
};

// ==================== 便捷函数 ====================

// 分店相关
export const storeService = {
  getAll: (storeId?: string) => getAllDocuments(COLLECTIONS.STORES, storeId),
  getById: (id: string) => getDocument(COLLECTIONS.STORES, id),
  create: (data: any) => addDocument(COLLECTIONS.STORES, data),
  update: (id: string, data: any) => updateDocument(COLLECTIONS.STORES, id, data),
  delete: (id: string) => deleteDocument(COLLECTIONS.STORES, id),
};

// 用户相关
export const userService = {
  getAll: (storeId?: string) => getAllDocuments(COLLECTIONS.USERS, storeId),
  getById: (id: string) => getDocument(COLLECTIONS.USERS, id),
  create: (data: any) => addDocument(COLLECTIONS.USERS, data),
  update: (id: string, data: any) => updateDocument(COLLECTIONS.USERS, id, data),
  delete: (id: string) => deleteDocument(COLLECTIONS.USERS, id),
  findByUsername: async (username: string) => {
    const users = await getAllDocuments(COLLECTIONS.USERS);
    return users.find((u: any) => u.username === username);
  },
};

// 订单相关
export const orderService = {
  getAll: (storeId?: string) => getAllDocuments(COLLECTIONS.ORDERS, storeId),
  getById: (id: string) => getDocument(COLLECTIONS.ORDERS, id),
  create: (data: any) => addDocument(COLLECTIONS.ORDERS, data),
  update: (id: string, data: any) => updateDocument(COLLECTIONS.ORDERS, id, data),
  delete: (id: string) => deleteDocument(COLLECTIONS.ORDERS, id),
  subscribe: (callback: (data: any[]) => void, storeId?: string) => 
    subscribeToCollection(COLLECTIONS.ORDERS, callback, storeId),
};

// 库存相关
export const inventoryService = {
  getAll: (storeId?: string) => getAllDocuments(COLLECTIONS.INVENTORY, storeId),
  getById: (id: string) => getDocument(COLLECTIONS.INVENTORY, id),
  create: (data: any) => addDocument(COLLECTIONS.INVENTORY, data),
  update: (id: string, data: any) => updateDocument(COLLECTIONS.INVENTORY, id, data),
  delete: (id: string) => deleteDocument(COLLECTIONS.INVENTORY, id),
};

// 客户相关
export const customerService = {
  getAll: () => getAllDocuments(COLLECTIONS.CUSTOMERS),
  getById: (id: string) => getDocument(COLLECTIONS.CUSTOMERS, id),
  create: (data: any) => addDocument(COLLECTIONS.CUSTOMERS, data),
  update: (id: string, data: any) => updateDocument(COLLECTIONS.CUSTOMERS, id, data),
  delete: (id: string) => deleteDocument(COLLECTIONS.CUSTOMERS, id),
};

// 菜品相关
export const productService = {
  getAll: (storeId?: string) => getAllDocuments(COLLECTIONS.PRODUCTS, storeId),
  getById: (id: string) => getDocument(COLLECTIONS.PRODUCTS, id),
  create: (data: any) => addDocument(COLLECTIONS.PRODUCTS, data),
  update: (id: string, data: any) => updateDocument(COLLECTIONS.PRODUCTS, id, data),
  delete: (id: string) => deleteDocument(COLLECTIONS.PRODUCTS, id),
};
