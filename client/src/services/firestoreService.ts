/**
 * Firestore 数据服务层
 * 统一管理所有 Firestore 操作
 */

import { 
  collection, 
  doc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  getDoc, 
  getDocs, 
  query, 
  where,
  orderBy,
  onSnapshot,
  Timestamp 
} from 'firebase/firestore';
import { db } from '../firebase';
import { COLLECTIONS } from '../firebase/config';

// ==================== 通用 CRUD 操作 ====================

/**
 * 添加文档
 */
export const addDocument = async (collectionName: string, data: any) => {
  try {
    const docRef = await addDoc(collection(db, collectionName), {
      ...data,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
    console.log(`✅ 添加成功: ${collectionName}/${docRef.id}`);
    return { id: docRef.id, ...data };
  } catch (error) {
    console.error(`❌ 添加失败: ${collectionName}`, error);
    throw error;
  }
};

/**
 * 更新文档
 */
export const updateDocument = async (collectionName: string, docId: string, data: any) => {
  try {
    const docRef = doc(db, collectionName, docId);
    await updateDoc(docRef, {
      ...data,
      updatedAt: Timestamp.now(),
    });
    console.log(`✅ 更新成功: ${collectionName}/${docId}`);
  } catch (error) {
    console.error(`❌ 更新失败: ${collectionName}/${docId}`, error);
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
    console.log(`✅ 删除成功: ${collectionName}/${docId}`);
  } catch (error) {
    console.error(`❌ 删除失败: ${collectionName}/${docId}`, error);
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
      return { id: docSnap.id, ...docSnap.data() };
    } else {
      return null;
    }
  } catch (error) {
    console.error(`❌ 获取失败: ${collectionName}/${docId}`, error);
    throw error;
  }
};

/**
 * 获取集合所有文档
 */
export const getDocuments = async (collectionName: string) => {
  try {
    const querySnapshot = await getDocs(collection(db, collectionName));
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));
  } catch (error) {
    console.error(`❌ 获取列表失败: ${collectionName}`, error);
    throw error;
  }
};

/**
 * 条件查询
 */
export const queryDocuments = async (
  collectionName: string, 
  field: string, 
  operator: '==' | '>' | '<' | '>=' | '<=', 
  value: any
) => {
  try {
    const q = query(collection(db, collectionName), where(field, operator, value));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));
  } catch (error) {
    console.error(`❌ 查询失败: ${collectionName}`, error);
    throw error;
  }
};

/**
 * 实时监听集合
 */
export const subscribeToCollection = (
  collectionName: string,
  callback: (data: any[]) => void
) => {
  const q = query(collection(db, collectionName), orderBy('createdAt', 'desc'));
  
  const unsubscribe = onSnapshot(q, (snapshot) => {
    const data = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));
    callback(data);
  }, (error) => {
    console.error(`❌ 监听失败: ${collectionName}`, error);
  });
  
  return unsubscribe;
};

// ==================== 分店相关操作 ====================

/**
 * 获取分店的所有用户
 */
export const getStoreUsers = async (storeId: string) => {
  return queryDocuments('users', 'storeId', '==', storeId);
};

/**
 * 获取分店的所有订单
 */
export const getStoreOrders = async (storeId: string) => {
  return queryDocuments('orders', 'storeId', '==', storeId);
};

/**
 * 获取分店的所有库存
 */
export const getStoreInventory = async (storeId: string) => {
  return queryDocuments('inventory', 'storeId', '==', storeId);
};

// ==================== 数据迁移工具 ====================

/**
 * 从 localStorage 迁移数据到 Firestore
 */
export const migrateFromLocalStorage = async () => {
  console.log('🔄 开始迁移数据到 Firestore...');
  
  // 🔥 首先检查是否有超级管理员，如果没有则创建默认的
  const existingUsers = await getDocuments('users');
  const hasSuperAdmin = existingUsers.some((u: any) => u.role === 'super_admin');
  
  if (!hasSuperAdmin) {
    console.log('👑 创建默认超级管理员...');
    await addDocument('users', {
      username: 'admin',
      password: 'admin123',
      name: '系统管理员',
      role: 'super_admin',
      storeId: null,
      storeName: null,
      status: 'active',
      createdAt: new Date().toISOString(),
    });
    console.log('✅ 默认超级管理员创建成功 (admin / admin123)');
  }
  
  const collections = [
    { key: 'stores', collection: 'stores' },
    { key: 'users', collection: 'users' },
    { key: 'pos_orders', collection: 'orders' },
    { key: 'app_inventory_items', collection: 'inventory' },
    { key: 'restaurant_menu_items', collection: 'menuItems' },
  ];
  
  for (const { key, collection } of collections) {
    try {
      const savedData = localStorage.getItem(key);
      if (savedData) {
        const data = JSON.parse(savedData);
        if (Array.isArray(data) && data.length > 0) {
          console.log(`📦 迁移 ${key}: ${data.length} 条记录`);
          
          // 检查是否已存在
          const existing = await getDocuments(collection);
          if (existing.length === 0) {
            // 批量添加
            for (const item of data) {
              await addDocument(collection, item);
            }
            console.log(`✅ ${key} 迁移完成`);
          } else {
            console.log(`⏭️ ${key} 已存在，跳过`);
          }
        }
      }
    } catch (error) {
      console.error(`❌ 迁移 ${key} 失败`, error);
    }
  }
  
  console.log('✅ 数据迁移完成');
};
