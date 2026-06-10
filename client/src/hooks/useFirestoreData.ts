import { useState, useEffect } from 'react';
import { smartSubscribeToCollection, smartSubscribeToStoreCollection, smartGetDocuments } from '../services/smartSyncService';
import { COLLECTIONS } from '../firebase/config';

/**
 * 通用数据Hook - 支持实时同步
 * @param collectionName 集合名称
 * @param storeId 分店ID（可选，用于数据隔离）
 */
export const useFirestoreData = <T>(collectionName: string, storeId?: string) => {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    const loadData = async () => {
      try {
        setLoading(true);
        
        if (storeId) {
          // 监听指定分店的数据
          unsubscribe = smartSubscribeToStoreCollection(collectionName, storeId, (snapshot) => {
            setData(snapshot as T[]);
            setLoading(false);
          });
        } else {
          // 监听所有数据
          unsubscribe = smartSubscribeToCollection(collectionName, (snapshot) => {
            setData(snapshot as T[]);
            setLoading(false);
          });
        }
      } catch (err) {
        console.error(`加载数据失败: ${collectionName}`, err);
        setError(err instanceof Error ? err.message : '未知错误');
        setLoading(false);
        
        // 降级：从localStorage读取
        const saved = localStorage.getItem(collectionName);
        if (saved) {
          setData(JSON.parse(saved));
        }
      }
    };

    loadData();

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [collectionName, storeId]);

  return { data, loading, error };
};

/**
 * 分店数据Hook
 */
export const useStores = () => {
  return useFirestoreData(COLLECTIONS.STORES);
};

/**
 * 员工数据Hook
 */
export const useEmployees = (storeId?: string) => {
  return useFirestoreData(COLLECTIONS.EMPLOYEES, storeId);
};

/**
 * 订单数据Hook
 */
export const useOrders = (storeId?: string) => {
  return useFirestoreData(COLLECTIONS.ORDERS, storeId);
};

/**
 * 库存数据Hook
 */
export const useInventory = (storeId?: string) => {
  return useFirestoreData(COLLECTIONS.INVENTORY, storeId);
};

/**
 * 考勤数据Hook
 */
export const useAttendance = (storeId?: string) => {
  return useFirestoreData(COLLECTIONS.ATTENDANCE, storeId);
};

/**
 * 薪资数据Hook
 */
export const useSalaries = (storeId?: string) => {
  return useFirestoreData(COLLECTIONS.SALARIES, storeId);
};

/**
 * 借款数据Hook
 */
export const useLoans = (storeId?: string) => {
  return useFirestoreData(COLLECTIONS.LOANS, storeId);
};

/**
 * 客户数据Hook
 */
export const useCustomers = (storeId?: string) => {
  return useFirestoreData(COLLECTIONS.CUSTOMERS, storeId);
};
