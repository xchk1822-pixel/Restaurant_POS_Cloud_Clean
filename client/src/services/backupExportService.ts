import { collection, getDocs, getDocsFromServer, QuerySnapshot, DocumentData } from 'firebase/firestore';
import { db } from '../firebase';
import { User } from '../contexts/AuthContext';

const GLOBAL_COLLECTIONS = ['stores', 'users', 'system_roles', 'exchange_rate'];

const STORE_COLLECTIONS = [
  'employees',
  'employee_deletions',
  'attendance_records',
  'salary_records',
  'loan_records',
  'cash_flow_records',
  'inventory_items',
  'inventory_categories',
  'menu_items',
  'pos_orders',
  'pos_tables',
  'pos_held_orders',
  'expenses',
  'expense_categories',
  'purchase_orders',
  'suppliers',
  'supplier_payments',
  'handovers',
  'fridges',
  'fridge_inventory',
  'customers',
  'points_transactions',
  'exchange_rate',
  'pos_cancel_records',
];

export interface CollectionBackupResult {
  path: string;
  count: number;
  records: any[];
  error?: string;
}

export interface StoreBackupResult {
  storeId: string;
  collections: Record<string, CollectionBackupResult>;
}

export interface BackupExport {
  metadata: {
    schemaVersion: 1;
    exportedAt: string;
    timezone: string;
    projectId: string;
    exportedBy: {
      id: string;
      username: string;
      role: string;
      storeId?: string;
    };
  };
  global: Record<string, CollectionBackupResult>;
  stores: Record<string, StoreBackupResult>;
  localCache: Record<string, any>;
  summary: {
    globalCollections: number;
    storeCount: number;
    storeCollections: number;
    totalRecords: number;
    errorCount: number;
  };
}

const serializeFirestoreValue = (value: any): any => {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(serializeFirestoreValue);

  const output: Record<string, any> = {};
  Object.entries(value).forEach(([key, entry]) => {
    output[key] = serializeFirestoreValue(entry);
  });
  return output;
};

const readCollection = async (path: string): Promise<CollectionBackupResult> => {
  try {
    const ref = collection(db, path);
    let snapshot: QuerySnapshot<DocumentData>;
    try {
      snapshot = await getDocsFromServer(ref);
    } catch {
      snapshot = await getDocs(ref);
    }

    const records = snapshot.docs.map(item => ({
      id: item.id,
      ...serializeFirestoreValue(item.data()),
    }));

    return { path, count: records.length, records };
  } catch (error: any) {
    return {
      path,
      count: 0,
      records: [],
      error: error?.message || String(error),
    };
  }
};

const getRestaurantLocalCache = (): Record<string, any> => {
  const allowedPrefixes = [
    'store_',
    'global_',
    'system_roles',
    'stores',
    'users',
    'current_store',
    'pending_',
    'offline_',
  ];

  const cache: Record<string, any> = {};
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (!key || !allowedPrefixes.some(prefix => key.startsWith(prefix))) continue;
    try {
      cache[key] = JSON.parse(localStorage.getItem(key) || 'null');
    } catch {
      cache[key] = localStorage.getItem(key);
    }
  }
  return cache;
};

const getStoreIdsForBackup = (user: User, stores: CollectionBackupResult): string[] => {
  if (user.role !== 'super_admin') {
    return user.storeId ? [user.storeId] : [];
  }

  const ids = stores.records
    .map((store: any) => store.id || store.storeId)
    .filter((storeId: any): storeId is string => typeof storeId === 'string' && storeId.length > 0);

  return Array.from(new Set(ids));
};

export const createFirestoreBackup = async (user: User): Promise<BackupExport> => {
  const globalResults: Record<string, CollectionBackupResult> = {};
  for (const collectionName of GLOBAL_COLLECTIONS) {
    globalResults[collectionName] = await readCollection(collectionName);
  }

  const storeIds = getStoreIdsForBackup(user, globalResults.stores);
  const storeResults: Record<string, StoreBackupResult> = {};

  for (const storeId of storeIds) {
    const collections: Record<string, CollectionBackupResult> = {};
    for (const collectionName of STORE_COLLECTIONS) {
      const path = `stores/${storeId}/${collectionName}`;
      collections[collectionName] = await readCollection(path);
    }
    storeResults[storeId] = { storeId, collections };
  }

  const allResults = [
    ...Object.values(globalResults),
    ...Object.values(storeResults).flatMap(store => Object.values(store.collections)),
  ];

  return {
    metadata: {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Managua',
      projectId: 'restaurant-pos-1b420',
      exportedBy: {
        id: user.id,
        username: user.username,
        role: user.role,
        storeId: user.storeId,
      },
    },
    global: globalResults,
    stores: storeResults,
    localCache: getRestaurantLocalCache(),
    summary: {
      globalCollections: Object.keys(globalResults).length,
      storeCount: Object.keys(storeResults).length,
      storeCollections: Object.values(storeResults).reduce((sum, store) => sum + Object.keys(store.collections).length, 0),
      totalRecords: allResults.reduce((sum, result) => sum + result.count, 0),
      errorCount: allResults.filter(result => result.error).length,
    },
  };
};

export const downloadBackupFile = (backup: BackupExport) => {
  const date = new Date();
  const timestamp = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
    String(date.getHours()).padStart(2, '0'),
    String(date.getMinutes()).padStart(2, '0'),
  ].join('');
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `restaurant-pos-backup-${timestamp}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};
