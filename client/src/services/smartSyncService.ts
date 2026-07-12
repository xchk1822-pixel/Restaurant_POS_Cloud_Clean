import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  getDocsFromServer,
  query,
  where,
  onSnapshot,
  orderBy,
  limit,
  increment,
  arrayUnion,
  Timestamp,
  runTransaction,
} from 'firebase/firestore';
import { db } from '../firebase';
import { dataService } from './DataService';

/**
 */
const convertTimestampsToLocalTime = (data: any): any => {
  if (!data || typeof data !== 'object') return data;

  const converted = { ...data };

  ['createdAt', 'updatedAt'].forEach(field => {
    if (converted[field]) {
      if (converted[field].toDate) {
        const date = converted[field].toDate();
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
        converted[field] = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
      }
    }
  });

  return converted;
};

const FIRESTORE_ENABLED = true;
const REALTIME_SYNC_ENABLED = true;
const GLOBAL_COLLECTIONS = ['users', 'stores', 'system_roles'];
const WEAK_NETWORK_TIMEOUT_MS = 4500;
const FRIDGE_TRANSFER_TIMEOUT_MS = 15000;
const SYNC_CONFLICTS_KEY = 'local_pending_sync_conflicts';

class WeakNetworkTimeoutError extends Error {
  constructor(label: string) {
    super(`weak-network-timeout:${label}`);
    this.name = 'WeakNetworkTimeoutError';
  }
}

const withWeakNetworkTimeout = async <T,>(
  operation: () => Promise<T>,
  label: string,
  timeoutMs = WEAK_NETWORK_TIMEOUT_MS
): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      operation(),
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => reject(new WeakNetworkTimeoutError(label)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
};

const isWeakNetworkTimeout = (error: any): boolean => {
  return error instanceof WeakNetworkTimeoutError || error?.name === 'WeakNetworkTimeoutError';
};

const isExpectedOfflineReadError = (error: any): boolean => {
  const message = String(error?.message || error || '');
  return isWeakNetworkTimeout(error)
    || error?.code === 'unavailable'
    || message.includes('Failed to get documents from server')
    || message.includes('Could not reach Cloud Firestore backend');
};

type SmartWriteResult = {
  success: boolean;
  cloudSynced?: boolean;
  pending?: boolean;
  offline?: boolean;
  localOnly?: boolean;
  weakNetworkFallback?: boolean;
  skipped?: boolean;
  error?: any;
};

const getCurrentStoreId = (): string | null => {
  try {
    const userStr = localStorage.getItem('current_user');
    if (userStr) {
      const user = JSON.parse(userStr);
      return user.storeId || null;
    }
  } catch (error) {
    console.error('Smart sync operation failed:', error);
  }
  return null;
};

const getCurrentOperatorName = (): string => {
  try {
    const userStr = localStorage.getItem('current_user');
    if (!userStr) return '系统操作';
    const user = JSON.parse(userStr);
    return user.name || user.username || user.displayName || '系统操作';
  } catch {
    return '系统操作';
  }
};

const getCollectionKey = (collectionName: string): string => {
  const parts = collectionName.split('/').filter(Boolean);
  return parts[parts.length - 1] || collectionName;
};

const getStoreIdFromExplicitPath = (collectionName: string): string | null => {
  const parts = collectionName.split('/').filter(Boolean);
  return parts[0] === 'stores' && parts[1] && parts.length >= 3 ? parts[1] : null;
};

const requiresStoreScope = (collectionName: string): boolean => {
  const collectionKey = getCollectionKey(collectionName);
  return !GLOBAL_COLLECTIONS.includes(collectionKey) && !collectionName.includes('/');
};

const getStoreCollectionPath = (collectionName: string): string | null => {
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

  if (requiresStoreScope(collectionName)) {
    console.warn(`Missing storeId; blocked store-scoped Firestore access: ${collectionName}`);
    return null;
  }

  return collectionName;
};

// Local cache keys must stay store-scoped for business collections.
const getLocalStorageKey = (collectionName: string): string | null => {
  const collectionKey = getCollectionKey(collectionName);
  const explicitStoreId = getStoreIdFromExplicitPath(collectionName);
  if (explicitStoreId) {
    return `store_${explicitStoreId}_${collectionKey}`;
  }

  if (GLOBAL_COLLECTIONS.includes(collectionKey)) {
    return collectionKey;
  }

  const storeId = getCurrentStoreId();
  if (storeId) {
    return `store_${storeId}_${collectionKey}`;
  }

  if (requiresStoreScope(collectionName)) {
    console.warn(`Missing storeId; blocked store-scoped local cache access: ${collectionName}`);
    return null;
  }

  return collectionKey;
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

const normalizePosOrderLifecycle = (record: any): any => {
  if (!record || typeof record !== 'object') return record;
  if (record.status === 'cancelled') return record;
  const hasCompletionSignal = record.status === 'completed' || Boolean(record.completedAt || record.clearedAt);
  if (!hasCompletionSignal) return record;

  const totalAmount = Number(record.totalAmount) || 0;
  const recordedPaymentAmount = Math.max(
    Number(record.paidAmount) || 0,
    Number(record.settledAmount) || 0,
    (Number(record.cashAmount) || 0) + (Number(record.cardAmount) || 0)
  );
  const paymentLooksComplete = totalAmount > 0 && recordedPaymentAmount >= totalAmount - 0.001;
  const normalizedPaidAmount = paymentLooksComplete ? Math.min(recordedPaymentAmount, totalAmount) : recordedPaymentAmount;

  return {
    ...record,
    status: 'completed',
    paymentStatus: paymentLooksComplete ? 'paid' : record.paymentStatus,
    paidAmount: normalizedPaidAmount,
    settledAmount: normalizedPaidAmount,
  };
};

const normalizeRecordForCollection = (collectionName: string, record: any): any => {
  return getCollectionKey(collectionName) === 'pos_orders'
    ? normalizePosOrderLifecycle(record)
    : record;
};

const isTerminalPosOrderRecord = (record: any): boolean => {
  if (!record || typeof record !== 'object') return false;
  return record.status === 'completed'
    || record.status === 'cancelled'
    || Boolean(record.completedAt || record.clearedAt);
};

const getPosOrderStatusRank = (status?: string): number => {
  switch (status) {
    case 'cancelled':
    case 'completed': return 5;
    case 'paid': return 4;
    case 'served': return 3;
    case 'preparing': return 2;
    case 'confirmed': return 1;
    case 'draft':
    default: return 0;
  }
};

const getPosPaymentRank = (paymentStatus?: string): number => {
  switch (paymentStatus) {
    case 'paid': return 3;
    case 'partial': return 2;
    case 'refunded': return 1;
    case 'unpaid':
    default: return 0;
  }
};

const isPosOrderLifecycleRegression = (current: any, incoming: any): boolean => {
  if (!current || !incoming) return false;
  if (current.stockDeducted && !incoming.stockDeducted) return true;
  if (current.completedAt && !incoming.completedAt) return true;
  if (current.clearedAt && !incoming.clearedAt) return true;

  const currentStatusRank = getPosOrderStatusRank(current.status);
  const incomingStatusRank = getPosOrderStatusRank(incoming.status);
  if (currentStatusRank > incomingStatusRank) return true;

  return getPosPaymentRank(current.paymentStatus) > getPosPaymentRank(incoming.paymentStatus);
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

  return normalizeRecordForCollection(collectionName, normalized);
};

const shouldReplaceLocalRecord = (existing: any, incoming: any): boolean => {
  if (!existing) return true;
  const existingVersion = getRecordVersion(existing);
  const incomingVersion = getRecordVersion(incoming);
  return incomingVersion >= existingVersion;
};

const excludeDeletedRecords = (records: any[]): any[] => {
  return records.filter(record => !record?.isDeleted);
};

const getPendingPosOrderSyncIds = (): Set<string> => {
  try {
    const storeId = getCurrentStoreId();
    const storageKey = storeId ? `store_${storeId}_pos_pending_order_sync` : 'pos_pending_order_sync';
    const stored = localStorage.getItem(storageKey);
    return stored ? new Set(JSON.parse(stored)) : new Set();
  } catch {
    return new Set();
  }
};

const replaceLocalPosOrdersForDatePrefix = (datePrefix: string, cloudOrders: any[]) => {
  const localStorageKey = getLocalStorageKey('pos_orders');
  if (!localStorageKey) return;

  const pendingOrderIds = getPendingPosOrderSyncIds();
  const localOrders = getFromLocalStorage('pos_orders');
  const retainedOrders = localOrders.filter(order => {
    if (pendingOrderIds.has(String(order?.id || ''))) return true;
    return !String(order?.orderNumber || '').startsWith(datePrefix);
  });
  localStorage.setItem(localStorageKey, JSON.stringify([...retainedOrders, ...cloudOrders]));
};

const CLOUD_AUTHORITATIVE_SUBSCRIPTIONS = new Set(['pos_tables']);

const isCloudAuthoritativeSubscription = (collectionName: string): boolean => {
  return CLOUD_AUTHORITATIVE_SUBSCRIPTIONS.has(getCollectionKey(collectionName));
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
 */


let isOnline = navigator.onLine;

window.addEventListener('online', () => {
  isOnline = true;
  syncPendingChanges();
});

window.addEventListener('offline', () => {
  isOnline = false;
});

export const getNetworkStatus = () => isOnline;


interface PendingChange {
  id: string;
  collection: string;
  operation: 'add' | 'update' | 'delete';
  data?: any;
  timestamp: number;
}

const PENDING_CHANGES_KEY = 'pending_firestore_changes';

const coalescePendingChanges = (changes: PendingChange[]): PendingChange[] => {
  const result: PendingChange[] = [];
  const posOrderUpdateIndex = new Map<string, number>();

  changes.forEach(change => {
    if (change.collection === 'pos_orders' && change.operation === 'update') {
      const existingIndex = posOrderUpdateIndex.get(change.id);
      if (existingIndex !== undefined) {
        result[existingIndex] = change;
        return;
      }
      posOrderUpdateIndex.set(change.id, result.length);
    }

    result.push(change);
  });

  return result;
};

const getPendingChanges = (): PendingChange[] => {
  try {
    const changes = localStorage.getItem(PENDING_CHANGES_KEY);
    const parsed = changes ? JSON.parse(changes) : [];
    if (!Array.isArray(parsed)) return [];

    const coalesced = coalescePendingChanges(parsed);
    if (coalesced.length !== parsed.length) {
      localStorage.setItem(PENDING_CHANGES_KEY, JSON.stringify(coalesced));
    }
    return coalesced;
  } catch {
    return [];
  }
};

const savePendingChange = (change: PendingChange) => {
  const changes = coalescePendingChanges([...getPendingChanges(), change]);
  localStorage.setItem(PENDING_CHANGES_KEY, JSON.stringify(changes));
};

const clearPendingChanges = () => {
  localStorage.removeItem(PENDING_CHANGES_KEY);
};

const setPendingChanges = (changes: PendingChange[]) => {
  if (changes.length === 0) {
    clearPendingChanges();
    return;
  }
  localStorage.setItem(PENDING_CHANGES_KEY, JSON.stringify(changes));
};

let pendingSyncRetryTimer: ReturnType<typeof setTimeout> | null = null;

const schedulePendingSyncRetry = (delayMs = 3000) => {
  if (pendingSyncRetryTimer || !FIRESTORE_ENABLED) return;

  pendingSyncRetryTimer = setTimeout(() => {
    pendingSyncRetryTimer = null;
    if (!isOnline || getPendingChanges().length === 0) return;

    syncPendingChanges()
      .catch(error => {
        console.error('Pending sync retry failed:', error);
      })
      .finally(() => {
        if (getPendingChanges().length > 0) {
          schedulePendingSyncRetry(10000);
        }
      });
  }, delayMs);
};

const getSyncConflictsKey = () => {
  const storeId = getCurrentStoreId();
  return storeId ? `${storeId}_${SYNC_CONFLICTS_KEY}` : SYNC_CONFLICTS_KEY;
};

const saveSyncConflict = (conflict: Record<string, any>) => {
  try {
    const storageKey = getSyncConflictsKey();
    const existing = localStorage.getItem(storageKey);
    const conflicts = existing ? JSON.parse(existing) : [];
    conflicts.push({
      ...conflict,
      id: conflict.id || `conflict_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      detectedAt: Date.now(),
    });
    localStorage.setItem(storageKey, JSON.stringify(conflicts));
  } catch (error) {
    console.error('Smart sync operation failed:', error);
  }
};

const applyIncrementToLocalStorage = (
  collectionName: string,
  docId: string,
  fieldName: string,
  amount: number,
  extraData: Record<string, any>
) => {
  const existing = getFromLocalStorage(collectionName);
  const existingIndex = existing.findIndex(item => item.id === docId);
  const nextRecord = existingIndex >= 0
    ? {
      ...existing[existingIndex],
      ...extraData,
      [fieldName]: (Number(existing[existingIndex]?.[fieldName]) || 0) + amount,
    }
    : {
      id: docId,
      ...extraData,
      [fieldName]: amount,
    };
  const updated = existingIndex >= 0
    ? existing.map((item, index) => index === existingIndex ? nextRecord : item)
    : [...existing, nextRecord];
  const localStorageKey = getLocalStorageKey(collectionName);
  if (!localStorageKey) {
    return false;
  }
  localStorage.setItem(localStorageKey, JSON.stringify(updated));
  return true;
};

const applyIdempotentIncrement = async (
  collectionPath: string,
  docId: string,
  fieldName: string,
  amount: number,
  extraData: Record<string, any>,
  operationId: string
) => {
  return runTransaction(db, async transaction => {
    const docRef = doc(db, collectionPath, docId);
    const snapshot = await transaction.get(docRef);
    const currentData = snapshot.exists() ? snapshot.data() : {};
    const appliedOperationIds = Array.isArray(currentData.appliedIncrementOperationIds)
      ? currentData.appliedIncrementOperationIds
      : [];

    if (appliedOperationIds.includes(operationId)) {
      return { success: true, duplicate: true, operationId };
    }

    transaction.set(docRef, {
      ...toFirestoreData(extraData),
      id: docId,
      [fieldName]: increment(amount),
      appliedIncrementOperationIds: arrayUnion(operationId),
    }, { merge: true });

    return { success: true, operationId };
  });
};

const formatOrderNumberDateParts = (date: Date) => {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const year = date.getFullYear();
  return {
    datePrefix: `${month}${day}`,
    dayKey: `${year}-${month}-${day}`,
  };
};

const generateLocalDailyOrderNumber = (datePrefix: string, dayKey: string) => {
  const storeId = getCurrentStoreId() || 'no_store';
  const counterKey = `pos_local_order_counter_${storeId}_${dayKey}`;
  const rawCurrentSequence = Number(localStorage.getItem(counterKey) || '0');
  const currentSequence = Number.isFinite(rawCurrentSequence) ? rawCurrentSequence : 0;
  const localMaxSequence = getMaxLocalOrderSequence(datePrefix);
  const nextSequence = Math.max(currentSequence, localMaxSequence) + 1;
  localStorage.setItem(counterKey, String(nextSequence));
  return `${datePrefix}${String(nextSequence).padStart(3, '0')}`;
};

const getMaxLocalOrderSequence = (datePrefix: string): number => {
  try {
    const localStorageKey = getLocalStorageKey('pos_orders');
    if (!localStorageKey) return 0;
    const rawOrders = localStorage.getItem(localStorageKey);
    const orders = rawOrders ? JSON.parse(rawOrders) : [];
    if (!Array.isArray(orders)) return 0;

    return orders.reduce((maxSequence, order) => {
      const orderNumber = String(order?.orderNumber || '');
      if (!orderNumber.startsWith(datePrefix)) return maxSequence;
      const sequence = Number(orderNumber.slice(datePrefix.length));
      return Number.isFinite(sequence) ? Math.max(maxSequence, sequence) : maxSequence;
    }, 0);
  } catch (error) {
    console.error('Smart sync operation failed:', error);
    return 0;
  }
};

export const smartGenerateDailyOrderNumber = async (date = new Date()) => {
  const { datePrefix, dayKey } = formatOrderNumberDateParts(date);
  const counterCollectionPath = getStoreCollectionPath('order_counters');
  const localMaxSequence = getMaxLocalOrderSequence(datePrefix);

  if (!counterCollectionPath || !FIRESTORE_ENABLED || !isOnline) {
    return generateLocalDailyOrderNumber(datePrefix, dayKey);
  }

  try {
    const nextSequence = await withWeakNetworkTimeout(
      () => runTransaction(db, async transaction => {
        const counterRef = doc(db, counterCollectionPath, dayKey);
        const snapshot = await transaction.get(counterRef);
        const currentData = snapshot.exists() ? snapshot.data() : {};
        const rawCurrentSequence = Number(currentData.sequence || 0);
        const currentSequence = Number.isFinite(rawCurrentSequence) ? rawCurrentSequence : 0;
        const nextSequence = Math.max(currentSequence, localMaxSequence) + 1;

        transaction.set(counterRef, {
          id: dayKey,
          date: dayKey,
          sequence: nextSequence,
          lastModified: Date.now(),
          updatedAt: new Date().toISOString(),
        }, { merge: true });

        return nextSequence;
      }),
      `order-counter:${dayKey}`
    );

    isOnline = true;
    return `${datePrefix}${String(nextSequence).padStart(3, '0')}`;
  } catch (error) {
    console.warn('Order number cloud counter unavailable, using local daily counter:', error);
    return generateLocalDailyOrderNumber(datePrefix, dayKey);
  }
};


/**
 */
export const smartAddDocument = async (collectionName: string, data: any) => {
  const storeCollectionPath = getStoreCollectionPath(collectionName);
  const docId = data.id || (storeCollectionPath ? doc(collection(db, storeCollectionPath)).id : `blocked_${Date.now()}`);
  if (!storeCollectionPath) {
    return { id: docId, success: false, error: 'missing-store-id' };
  }
  const existingLocal = getFromLocalStorage(collectionName).find(item => item.id === docId);
  const normalizedData = withSyncMetadata(collectionName, data, docId, existingLocal, true);

  if (!FIRESTORE_ENABLED) {
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

      saveToLocalStorage(collectionName, docData, docId);

      return { id: docId, ...docData };
    } catch (error) {
      console.error('Firestore add failed, falling back to local:', error);
      return fallbackToLocalAdd(collectionName, { ...data, id: docId });
    }
  } else {
    return fallbackToLocalAdd(collectionName, normalizedData);
  }
};

/**
 */
export const smartSetDocument = async (collectionName: string, docId: string, data: any) => {
  const storeCollectionPath = getStoreCollectionPath(collectionName);
  if (!storeCollectionPath) {
    return { id: docId, success: false, error: 'missing-store-id' };
  }
  const existingLocal = getFromLocalStorage(collectionName).find(item => item.id === docId);
  const normalizedData = withSyncMetadata(collectionName, data, docId, existingLocal, true);
  const docData = {
    ...toFirestoreData(normalizedData, true),
    id: docId,
  };

  if (isOnline) {
    try {
      const docRef = doc(db, storeCollectionPath, docId);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        await updateDoc(docRef, docData);
      } else {
        await setDoc(docRef, {
          ...docData,
          createdAt: Timestamp.now(),
        });
      }

      saveToLocalStorage(collectionName, docData, docId);

      return { id: docId, ...docData };
    } catch (error) {
      console.error('Firestore update failed, falling back to local:', error);
      saveToLocalStorage(collectionName, docData, docId);
      return { id: docId, ...docData };
    }
  } else {
    saveToLocalStorage(collectionName, docData, docId);
    return { id: docId, ...docData };
  }
};

/**
 */
export const smartUpdateDocument = async (
  collectionName: string,
  docId: string,
  data: any
): Promise<SmartWriteResult> => {
  const existingLocal = getFromLocalStorage(collectionName).find(item => item.id === docId);
  const collectionKey = getCollectionKey(collectionName);
  const dataForWrite = collectionKey === 'pos_orders' && isPosOrderLifecycleRegression(existingLocal, data)
    ? existingLocal
    : data;
  const normalizedData = withSyncMetadata(collectionName, dataForWrite, docId, existingLocal);

  if (!FIRESTORE_ENABLED) {
    updateInLocalStorage(collectionName, docId, normalizedData);
    return { success: true, localOnly: true };
  }

  const storeCollectionPath = getStoreCollectionPath(collectionName);
  if (!storeCollectionPath) {
    return { success: false, error: 'missing-store-id' };
  }
  const firestoreUpdateData = {
    ...toFirestoreData(normalizedData),
    id: docId,
  };

  if (isOnline) {
      try {
        const docRef = doc(db, storeCollectionPath, docId);
        if (collectionKey === 'pos_orders') {
          const result = await withWeakNetworkTimeout(
            () => runTransaction(db, async transaction => {
              const snapshot = await transaction.get(docRef);
              const remoteData = snapshot.exists()
                ? normalizeRecordForCollection(collectionName, { id: docId, ...snapshot.data() })
                : null;

              if (remoteData && isPosOrderLifecycleRegression(remoteData, normalizedData)) {
                return { skipped: true, remoteData };
              }

              transaction.set(docRef, firestoreUpdateData, { merge: true });
              return { skipped: false };
            }),
            `update:${collectionName}/${docId}`
          );

          if (result?.skipped && result.remoteData) {
            updateInLocalStorage(collectionName, docId, normalizeRecordForCollection(collectionName, result.remoteData));
            return { success: true, cloudSynced: true, skipped: true };
          }
        } else {
          await withWeakNetworkTimeout(
            () => setDoc(docRef, firestoreUpdateData, { merge: true }),
            `update:${collectionName}/${docId}`
          );
        }

      updateInLocalStorage(collectionName, docId, normalizedData);
      return { success: true, cloudSynced: true };
    } catch (error) {
      if (!isWeakNetworkTimeout(error)) {
        console.error('Firestore update failed, falling back to local:', error);
      }
      fallbackToLocalUpdate(collectionName, docId, normalizedData);
      return {
        success: false,
        pending: true,
        weakNetworkFallback: isWeakNetworkTimeout(error),
        error,
      };
    }
  } else {
    fallbackToLocalUpdate(collectionName, docId, normalizedData);
    return { success: true, pending: true, offline: true };
  }
};

/**
 */
export const smartDeleteDocument = async (collectionName: string, docId: string) => {
  if (!FIRESTORE_ENABLED) {
    deleteFromLocalStorage(collectionName, docId);
    return { success: true };
  }

  const storeCollectionPath = getStoreCollectionPath(collectionName);
  if (!storeCollectionPath) {
    return { success: false, error: 'missing-store-id' };
  }

  if (isOnline) {
    try {
      const docRef = doc(db, storeCollectionPath, docId);
      await deleteDoc(docRef);

      deleteFromLocalStorage(collectionName, docId);
    } catch (error) {
      console.error('Firestore delete failed, falling back to local:', error);
      fallbackToDelete(collectionName, docId);
    }
  } else {
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
  if (!storeCollectionPath) {
    return { success: false, error: 'missing-store-id' };
  }
  const operationId = extraData.syncOperationId || `increment-${collectionName}-${docId}-${fieldName}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const { syncOperationId, ...incrementExtraData } = extraData;

  if (isOnline && FIRESTORE_ENABLED) {
    try {
      await withWeakNetworkTimeout(
        () => applyIdempotentIncrement(storeCollectionPath, docId, fieldName, amount, incrementExtraData, operationId),
        `increment:${collectionName}/${docId}.${fieldName}`
      );
      applyIncrementToLocalStorage(collectionName, docId, fieldName, amount, incrementExtraData);
      return { success: true, operationId };
    } catch (error) {
      if (!isWeakNetworkTimeout(error)) {
        console.error(`Inventory increment failed: ${collectionName}/${docId}.${fieldName}`, error);
      }
    }
  }

  if (!applyIncrementToLocalStorage(collectionName, docId, fieldName, amount, incrementExtraData)) {
    return { success: false, error: 'missing-store-id' };
  }

  savePendingChange({
    id: docId,
    collection: collectionName,
    operation: 'update',
    data: {
      ...incrementExtraData,
      __increment: { fieldName, amount, operationId },
    },
    timestamp: Date.now(),
  });
  return { success: false, weakNetworkFallback: true, operationId };
};

export const getStableStockDeductionOperationId = (orderId: string) => `stock-${orderId}`;

type FridgeTransferDirection = 'warehouse_to_fridge' | 'fridge_to_warehouse';

const formatManaguaDate = (timestamp: number) => {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Managua',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(timestamp));
};

export const smartTransferFridgeStock = async ({
  itemId,
  itemName,
  unit,
  fridgeId,
  fridgeName,
  quantity,
  direction,
  sortOrder,
  operationId = `transfer-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  allowPendingFallback = true,
}: {
  itemId: string;
  itemName?: string;
  unit?: string;
  fridgeId: string;
  fridgeName?: string;
  quantity: number;
  direction: FridgeTransferDirection;
  sortOrder?: number;
  operationId?: string;
  allowPendingFallback?: boolean;
}) => {
  const storeId = getCurrentStoreId();
  if (!storeId) {
    return { success: false, error: 'missing-store-id' };
  }
  if (!FIRESTORE_ENABLED) {
    return { success: false, error: 'firestore-disabled', operationId };
  }
  if (!itemId || !fridgeId || !Number.isFinite(quantity) || quantity <= 0) {
    return { success: false, error: 'invalid-transfer-request', operationId };
  }

  const now = Date.now();
  const basePath = `stores/${storeId}`;
  const fridgeInventoryId = `${fridgeId}-${itemId}`;
  const transferRecordId = operationId;

  const buildFridgeTransferStockRecords = ({
    transferRecord,
    beforeWarehouseStock,
    afterWarehouseStock,
    beforeFridgeStock,
    afterFridgeStock,
    pendingCloudSync = false,
  }: {
    transferRecord: any;
    beforeWarehouseStock: number;
    afterWarehouseStock: number;
    beforeFridgeStock: number;
    afterFridgeStock: number;
    pendingCloudSync?: boolean;
  }) => {
    const directionText = direction === 'warehouse_to_fridge' ? '仓库调拨到冰箱' : '冰箱退回仓库';
    const warehouseSignedQuantity = direction === 'warehouse_to_fridge' ? -quantity : quantity;
    const fridgeSignedQuantity = direction === 'warehouse_to_fridge' ? quantity : -quantity;
    const commonRecord = {
      operationId,
      storeId,
      itemId,
      itemName: transferRecord.itemName,
      unit: transferRecord.unit,
      type: 'transfer',
      quantity,
      direction,
      reason: directionText,
      source: 'fridge_transfer',
      sourceId: operationId,
      fridgeId,
      fridgeName: transferRecord.fridgeName,
      date: transferRecord.date,
      createdAtMs: transferRecord.createdAtMs,
      lastModified: transferRecord.createdAtMs,
      operator: getCurrentOperatorName(),
      ...(pendingCloudSync ? { pendingCloudSync: true } : {}),
    };

    return [
      {
        ...commonRecord,
        id: `${operationId}-warehouse`,
        locationType: 'warehouse',
        signedQuantity: warehouseSignedQuantity,
        beforeStock: beforeWarehouseStock,
        afterStock: afterWarehouseStock,
      },
      {
        ...commonRecord,
        id: `${operationId}-fridge`,
        locationType: 'fridge',
        signedQuantity: fridgeSignedQuantity,
        beforeStock: beforeFridgeStock,
        afterStock: afterFridgeStock,
      },
    ];
  };

  const fallbackToPendingFridgeTransfer = () => {
    const inventoryRecords = getFromLocalStorage('inventory_items');
    const fridgeRecords = getFromLocalStorage('fridge_inventory');
    const inventoryData = inventoryRecords.find(record => record.id === itemId) || {};
    const fridgeData = fridgeRecords.find(record => record.id === fridgeInventoryId) || {};
    const warehouseStock = Number(inventoryData.currentStock) || 0;
    const fridgeStock = Number(fridgeData.quantity) || 0;

    if (direction === 'warehouse_to_fridge' && warehouseStock < quantity) {
      return { success: false, error: 'insufficient-warehouse-stock', operationId };
    }
    if (direction === 'fridge_to_warehouse' && fridgeStock < quantity) {
      return { success: false, error: 'insufficient-fridge-stock', operationId };
    }

    const afterWarehouseStock = direction === 'warehouse_to_fridge'
      ? warehouseStock - quantity
      : warehouseStock + quantity;
    const afterFridgeStock = direction === 'warehouse_to_fridge'
      ? fridgeStock + quantity
      : fridgeStock - quantity;
    const transferRecord = {
      id: transferRecordId,
      operationId,
      storeId,
      itemId,
      itemName: itemName || inventoryData.name || fridgeData.itemName || '',
      unit: unit || inventoryData.unit || fridgeData.unit || '',
      fridgeId,
      fridgeName: fridgeName || fridgeData.fridgeName || '',
      direction,
      quantity,
      beforeWarehouseStock: warehouseStock,
      afterWarehouseStock,
      beforeFridgeStock: fridgeStock,
      afterFridgeStock,
      createdAtMs: now,
      date: formatManaguaDate(now),
      source: 'fridge_stocktake_transfer_pending',
      pendingCloudSync: true,
    };
    const stockRecords = buildFridgeTransferStockRecords({
      transferRecord,
      beforeWarehouseStock: warehouseStock,
      afterWarehouseStock,
      beforeFridgeStock: fridgeStock,
      afterFridgeStock,
      pendingCloudSync: true,
    });

    updateInLocalStorage('inventory_items', itemId, {
      currentStock: afterWarehouseStock,
      lastModified: now,
      lastUpdated: new Date(now),
      pendingCloudSync: true,
    });
    updateInLocalStorage('fridge_inventory', fridgeInventoryId, {
      id: fridgeInventoryId,
      fridgeId,
      itemId,
      itemName: transferRecord.itemName,
      unit: transferRecord.unit,
      quantity: afterFridgeStock,
      sortOrder,
      lastModified: now,
      pendingCloudSync: true,
    });
    saveToLocalStorage('stock_transfer_records', transferRecord, transferRecordId);
    stockRecords.forEach(record => saveToLocalStorage('inventory_stock_records', record, record.id));
    savePendingChange({
      id: operationId,
      collection: 'stock_transfer_records',
      operation: 'update',
      data: {
        ...transferRecord,
        __fridgeTransfer: {
          itemId,
          itemName: transferRecord.itemName,
          unit: transferRecord.unit,
          fridgeId,
          fridgeName: transferRecord.fridgeName,
          quantity,
          direction,
          sortOrder,
        },
      },
      timestamp: now,
    });
    schedulePendingSyncRetry();

    return {
      success: true,
      pending: true,
      operationId,
      warehouseStock: afterWarehouseStock,
      fridgeStock: afterFridgeStock,
      record: transferRecord,
    };
  };

  try {
    const result = await withWeakNetworkTimeout(() => runTransaction(db, async transaction => {
      const inventoryRef = doc(db, `${basePath}/inventory_items`, itemId);
      const fridgeRef = doc(db, `${basePath}/fridge_inventory`, fridgeInventoryId);
      const transferRef = doc(db, `${basePath}/stock_transfer_records`, operationId);
      const warehouseStockRecordRef = doc(db, `${basePath}/inventory_stock_records`, `${operationId}-warehouse`);
      const fridgeStockRecordRef = doc(db, `${basePath}/inventory_stock_records`, `${operationId}-fridge`);

      const [inventorySnapshot, fridgeSnapshot, transferSnapshot] = await Promise.all([
        transaction.get(inventoryRef),
        transaction.get(fridgeRef),
        transaction.get(transferRef),
      ]);

      if (transferSnapshot.exists()) {
        const existingRecord = transferSnapshot.data();
        return {
          success: true,
          duplicate: true,
          operationId,
          warehouseStock: Number(existingRecord.afterWarehouseStock ?? existingRecord.warehouseStock ?? 0),
          fridgeStock: Number(existingRecord.afterFridgeStock ?? existingRecord.fridgeStock ?? 0),
          record: convertTimestampsToLocalTime({ id: transferRecordId, ...existingRecord }),
        };
      }

      const inventoryData = inventorySnapshot.exists() ? inventorySnapshot.data() : {};
      const fridgeData = fridgeSnapshot.exists() ? fridgeSnapshot.data() : {};
      const warehouseStock = Number(inventoryData.currentStock) || 0;
      const fridgeStock = Number(fridgeData.quantity) || 0;

      if (direction === 'warehouse_to_fridge' && warehouseStock < quantity) {
        throw new Error(`insufficient-warehouse-stock:${warehouseStock}`);
      }
      if (direction === 'fridge_to_warehouse' && fridgeStock < quantity) {
        throw new Error(`insufficient-fridge-stock:${fridgeStock}`);
      }

      const afterWarehouseStock = direction === 'warehouse_to_fridge'
        ? warehouseStock - quantity
        : warehouseStock + quantity;
      const afterFridgeStock = direction === 'warehouse_to_fridge'
        ? fridgeStock + quantity
        : fridgeStock - quantity;

      const transferRecord = {
        id: transferRecordId,
        operationId,
        storeId,
        itemId,
        itemName: itemName || inventoryData.name || fridgeData.itemName || '',
        unit: unit || inventoryData.unit || fridgeData.unit || '',
        fridgeId,
        fridgeName: fridgeName || fridgeData.fridgeName || '',
        direction,
        quantity,
        beforeWarehouseStock: warehouseStock,
        afterWarehouseStock,
        beforeFridgeStock: fridgeStock,
        afterFridgeStock,
        createdAtMs: now,
        date: formatManaguaDate(now),
        source: 'fridge_stocktake_transfer',
      };
      const stockRecords = buildFridgeTransferStockRecords({
        transferRecord,
        beforeWarehouseStock: warehouseStock,
        afterWarehouseStock,
        beforeFridgeStock: fridgeStock,
        afterFridgeStock,
      });

      transaction.set(inventoryRef, toFirestoreData({
        id: itemId,
        currentStock: afterWarehouseStock,
        lastModified: now,
        lastUpdated: new Date(now),
      }), { merge: true });
      transaction.set(fridgeRef, toFirestoreData({
        id: fridgeInventoryId,
        fridgeId,
        itemId,
        itemName: transferRecord.itemName,
        unit: transferRecord.unit,
        quantity: afterFridgeStock,
        sortOrder,
        lastModified: now,
      }, !fridgeSnapshot.exists()), { merge: true });
      transaction.set(transferRef, toFirestoreData(transferRecord, true), { merge: false });
      transaction.set(warehouseStockRecordRef, toFirestoreData(stockRecords[0], true), { merge: false });
      transaction.set(fridgeStockRecordRef, toFirestoreData(stockRecords[1], true), { merge: false });

      return {
        success: true,
        operationId,
        warehouseStock: afterWarehouseStock,
        fridgeStock: afterFridgeStock,
        record: transferRecord,
        stockRecords,
      };
    }), `fridge-transfer:${fridgeId}/${itemId}`, FRIDGE_TRANSFER_TIMEOUT_MS);

    isOnline = true;

    updateInLocalStorage('inventory_items', itemId, {
      currentStock: result.warehouseStock,
      lastModified: now,
      lastUpdated: new Date(now),
    });
    updateInLocalStorage('fridge_inventory', fridgeInventoryId, {
      id: fridgeInventoryId,
      fridgeId,
      itemId,
      itemName,
      unit,
      quantity: result.fridgeStock,
      sortOrder,
      lastModified: now,
    });
    saveToLocalStorage('stock_transfer_records', result.record, transferRecordId);
    result.stockRecords?.forEach((record: any) => saveToLocalStorage('inventory_stock_records', record, record.id));

    return result;
  } catch (error: any) {
    const message = String(error?.message || error || '');
    if (message.includes('insufficient-warehouse-stock')) {
      return { success: false, error: 'insufficient-warehouse-stock', operationId };
    }
    if (message.includes('insufficient-fridge-stock')) {
      return { success: false, error: 'insufficient-fridge-stock', operationId };
    }
    if (message.includes('permission-denied') || error?.code === 'permission-denied') {
      return { success: false, error: 'permission-denied', operationId };
    }
    if (isWeakNetworkTimeout(error)) {
      if (allowPendingFallback) {
        return fallbackToPendingFridgeTransfer();
      }
      return { success: false, error: 'fridge-transfer-unconfirmed', operationId };
    }
    return { success: false, error, operationId };
  }
};

export const smartClaimOrderStockDeduction = async (
  collectionName: string,
  docId: string,
  claimData: Record<string, any> = {}
) => {
  const storeCollectionPath = getStoreCollectionPath(collectionName);
  if (!storeCollectionPath) {
    return { success: false, error: 'missing-store-id' };
  }

  const now = Date.now();
  const operationId = claimData.stockDeductionOperationId || getStableStockDeductionOperationId(docId);

  if (!isOnline || !FIRESTORE_ENABLED) {
    return {
      success: true,
      claimed: true,
      offline: true,
      operationId,
    };
  }

  try {
    return await withWeakNetworkTimeout(() => runTransaction(db, async transaction => {
      const docRef = doc(db, storeCollectionPath, docId);
      const snapshot = await transaction.get(docRef);
      const currentData = snapshot.exists() ? snapshot.data() : {};

      if (currentData.stockDeducted) {
        return {
          success: true,
          alreadyDeducted: true,
          operationId: currentData.stockDeductionOperationId || operationId,
          data: convertTimestampsToLocalTime({ id: docId, ...currentData }),
        };
      }

      const claimedAt = Number(currentData.stockDeductionClaimedAt || 0);
      const currentOperationId = currentData.stockDeductionOperationId;
      const isSameOperation = Boolean(currentOperationId && currentOperationId === operationId);
      const claimIsFresh = Boolean(
        currentData.stockDeductionInProgress &&
        !isSameOperation &&
        claimedAt &&
        now - claimedAt < 120000
      );
      if (claimIsFresh) {
        return {
          success: false,
          inProgress: true,
          operationId: currentData.stockDeductionOperationId || operationId,
          data: convertTimestampsToLocalTime({ id: docId, ...currentData }),
        };
      }

      transaction.set(docRef, {
        ...toFirestoreData({
          ...claimData,
          id: docId,
          stockDeductionInProgress: true,
          stockDeductionClaimedAt: now,
          stockDeductionOperationId: operationId,
          lastModified: now,
        }),
        id: docId,
      }, { merge: true });

      return {
        success: true,
        claimed: true,
        operationId,
      };
    }), `claim-stock:${collectionName}/${docId}`);
  } catch (error) {
    if (isWeakNetworkTimeout(error)) {
      return {
        success: true,
        claimed: true,
        offline: true,
        weakNetworkFallback: true,
        operationId,
      };
    }
    console.error('Smart sync operation failed:', error);
    return {
      success: false,
      error,
    };
  }
};

export const smartHasOrderStockRecords = async (orderId: string, orderNumber?: string): Promise<boolean> => {
  const storeCollectionPath = getStoreCollectionPath('inventory_stock_records');
  if (!storeCollectionPath || (!orderId && !orderNumber)) {
    return false;
  }

  const hasLocalStockRows = () => excludeDeletedRecords(getFromLocalStorage('inventory_stock_records')).some(record =>
    (orderId && record?.orderId === orderId) ||
    (orderNumber && record?.orderNumber === orderNumber)
  );

  if (!isOnline || !FIRESTORE_ENABLED) {
    return hasLocalStockRows();
  }

  try {
    if (orderId) {
      const byOrderId = await withWeakNetworkTimeout(
        () => getDocs(query(collection(db, storeCollectionPath), where('orderId', '==', orderId), limit(1))),
        `stock-ledger-order:${orderId}`
      );
      if (!byOrderId.empty) return true;
    }

    if (orderNumber) {
      const byOrderNumber = await withWeakNetworkTimeout(
        () => getDocs(query(collection(db, storeCollectionPath), where('orderNumber', '==', orderNumber), limit(1))),
        `stock-ledger-number:${orderNumber}`
      );
      if (!byOrderNumber.empty) return true;
    }
  } catch (error) {
    if (!isExpectedOfflineReadError(error)) {
      console.error('Smart sync operation failed:', error);
    }
    return hasLocalStockRows();
  }

  return hasLocalStockRows();
};

/**
 */
export const smartGetDocuments = async (collectionName: string, forceServer = false) => {
  const storeCollectionPath = getStoreCollectionPath(collectionName);
  if (!storeCollectionPath) {
    return [];
  }

  if (isOnline) {
    try {
      const collectionRef = collection(db, storeCollectionPath);
      const querySnapshot = forceServer
        ? await withWeakNetworkTimeout(() => getDocsFromServer(collectionRef), `read:${collectionName}`)
        : await getDocs(collectionRef);
      const docs = querySnapshot.docs.map(doc => {
        const rawData = {
          id: doc.id,
          ...doc.data(),
        };
        return normalizeRecordForCollection(collectionName, convertTimestampsToLocalTime(rawData));
      });

      // localStorage.setItem(collectionName, JSON.stringify(docs));

      return excludeDeletedRecords(docs);
    } catch (error) {
      if (!isExpectedOfflineReadError(error)) {
        console.error('Firestore read failed, reading local cache:', error);
      }
      return excludeDeletedRecords(getFromLocalStorage(collectionName));
    }
  } else {
    return excludeDeletedRecords(getFromLocalStorage(collectionName));
  }
};

export const smartGetDocumentsWhereEqual = async (
  collectionName: string,
  fieldName: string,
  fieldValue: any,
  forceServer = false,
  localFallbackCollectionName = collectionName
) => {
  const storeCollectionPath = getStoreCollectionPath(collectionName);
  if (!storeCollectionPath) {
    return [];
  }

  const localFallback = () => excludeDeletedRecords(getFromLocalStorage(localFallbackCollectionName))
    .filter(record => record?.[fieldName] === fieldValue);

  if (isOnline) {
    try {
      const queryRef = query(collection(db, storeCollectionPath), where(fieldName, '==', fieldValue));
      const querySnapshot = forceServer
        ? await withWeakNetworkTimeout(() => getDocsFromServer(queryRef), `read:${collectionName}:${fieldName}`)
        : await getDocs(queryRef);
      const docs = querySnapshot.docs.map(doc => normalizeRecordForCollection(
        collectionName,
        convertTimestampsToLocalTime({ id: doc.id, ...doc.data() })
      ));

      return excludeDeletedRecords(docs);
    } catch (error) {
      if (!isExpectedOfflineReadError(error)) {
        console.error('Firestore filtered read failed, reading local cache:', error);
      }
      return localFallback();
    }
  }

  return localFallback();
};

/**
 */
export const smartSubscribeToCollection = (
  collectionName: string,
  callback: (data: any[]) => void
) => {
  let lastSerialized: string | null = null;

  if (!db || !FIRESTORE_ENABLED || !REALTIME_SYNC_ENABLED) {
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
      const localData = getFromLocalStorage(collectionName);
      callback(localData);
      return () => {};
    }

    const unsubscribe = onSnapshot(
      collectionRef,
      (snapshot) => {
        const data: any[] = [];
        snapshot.forEach((doc) => {
          data.push(normalizeRecordForCollection(collectionName, convertTimestampsToLocalTime({ id: doc.id, ...doc.data() })));
        });

        const serialized = JSON.stringify(data);
        if (serialized === lastSerialized) {
          return;
        }
        lastSerialized = serialized;


        if (isCloudAuthoritativeSubscription(collectionName)) {
          const activeData = excludeDeletedRecords(data);
          const localStorageKey = getLocalStorageKey(collectionName);
          if (localStorageKey) {
            localStorage.setItem(localStorageKey, JSON.stringify(activeData));
          }
          callback(activeData);
          return;
        }

        try {
          const localData = getFromLocalStorage(collectionName);
          const merged = new Map<string, any>();

          localData.forEach(item => {
            if (item?.id) {
              merged.set(String(item.id), item);
            }
          });

          data.forEach(cloudItem => {
            if (!cloudItem?.id) return;
            const id = String(cloudItem.id);
            const localItem = merged.get(id);
            if (!localItem || shouldReplaceLocalRecord(localItem, cloudItem)) {
              merged.set(id, cloudItem);
            }
          });

          const mergedData = Array.from(merged.values());
          const localStorageKey = getLocalStorageKey(collectionName);
          if (localStorageKey) {
            localStorage.setItem(localStorageKey, JSON.stringify(mergedData));
          }
          callback(mergedData);
          return;
        } catch (error) {
          console.error('Smart sync operation failed:', error);
        }

        callback(data);
      },
      (error) => {
        console.error('Subscription failed:', error);
        const localData = getFromLocalStorage(collectionName);
        callback(localData);
      }
    );

    return unsubscribe;
  } catch (error) {
    console.error('Subscription setup failed:', error);
    const localData = getFromLocalStorage(collectionName);
    callback(localData);
    return () => {};
  }
};

export const smartSubscribeToPosOrdersByDatePrefix = (
  datePrefix: string,
  callback: (data: any[]) => void
) => {
  let lastSerialized: string | null = null;
  let fallbackRequested = false;

  const filterLocalOrders = () => {
    return excludeDeletedRecords(getFromLocalStorage('pos_orders')).filter(order =>
      String(order?.orderNumber || '').startsWith(datePrefix)
    );
  };

  if (!db || !FIRESTORE_ENABLED || !REALTIME_SYNC_ENABLED) {
    callback(filterLocalOrders());
    return () => {};
  }

  try {
    const storeId = dataService.getCurrentStoreId();
    if (!storeId) {
      callback(filterLocalOrders());
      return () => {};
    }

    const collectionRef = collection(db, 'stores', storeId, 'pos_orders');
    const orderQuery = query(
      collectionRef,
      where('orderNumber', '>=', datePrefix),
      where('orderNumber', '<=', `${datePrefix}\uf8ff`),
      orderBy('orderNumber', 'asc')
    );

    const loadRecentPosOrdersFallback = async () => {
      if (fallbackRequested) return;
      fallbackRequested = true;
      try {
        const recentQuery = query(collectionRef, orderBy('orderNumber', 'desc'), limit(80));
        const snapshot = await getDocsFromServer(recentQuery);
        const recentData: any[] = [];
        snapshot.forEach((doc: any) => {
          recentData.push(normalizeRecordForCollection('pos_orders', convertTimestampsToLocalTime({ id: doc.id, ...doc.data() })));
        });
        const activeRecent = excludeDeletedRecords(recentData);
        if (activeRecent.length === 0) return;

        const latestPrefix = String(activeRecent[0]?.orderNumber || '').slice(0, 4);
        const fallbackData = activeRecent
          .filter(order => String(order?.orderNumber || '').startsWith(latestPrefix))
          .reverse();
        if (fallbackData.length === 0) return;

        replaceLocalPosOrdersForDatePrefix(latestPrefix, fallbackData);
        callback(fallbackData);
      } catch (error) {
        console.warn('POS recent order fallback failed:', error);
      }
    };

    let cancelled = false;
    const applyOrderSnapshot = (snapshot: any) => {
      if (cancelled) return;
      const data: any[] = [];
      snapshot.forEach((doc: any) => {
        data.push(normalizeRecordForCollection('pos_orders', convertTimestampsToLocalTime({ id: doc.id, ...doc.data() })));
      });

      const activeData = excludeDeletedRecords(data);
      const serialized = JSON.stringify(activeData);
      if (activeData.length > 0) {
        replaceLocalPosOrdersForDatePrefix(datePrefix, activeData);
      } else {
        console.warn('POS current-day order snapshot is empty; keeping local orders to avoid clearing an active terminal.');
        loadRecentPosOrdersFallback();
      }
      if (serialized === lastSerialized) {
        callback(activeData);
        return;
      }
      lastSerialized = serialized;
      callback(activeData);
    };

    getDocsFromServer(orderQuery)
      .then(applyOrderSnapshot)
      .catch(error => {
        console.warn('POS current-day server refresh failed, keeping realtime/local fallback:', error);
      });

    const unsubscribe = onSnapshot(
      orderQuery,
      (snapshot) => {
        if (snapshot.metadata.fromCache && navigator.onLine) {
          return;
        }
        applyOrderSnapshot(snapshot);
      },
      (error) => {
        console.error('POS current-day order subscription failed:', error);
        callback(filterLocalOrders());
      }
    );
    return () => {
      cancelled = true;
      unsubscribe();
    };
  } catch (error) {
    console.error('POS current-day order subscription setup failed:', error);
    callback(filterLocalOrders());
    return () => {};
  }
};


const saveToLocalStorage = (collectionName: string, data: any, id: string) => {
  try {
    const existing = getFromLocalStorage(collectionName);
    const currentItem = existing.find(item => item.id === id);
    const incomingItem = normalizeRecordForCollection(collectionName, { id, ...data });
    if (currentItem && !shouldReplaceLocalRecord(currentItem, incomingItem)) {
      return;
    }
    const updated = [...existing.filter(item => item.id !== id), incomingItem];
    const localStorageKey = getLocalStorageKey(collectionName);
    if (!localStorageKey) return;
    localStorage.setItem(localStorageKey, JSON.stringify(updated));
  } catch (error) {
    console.error('localStorage save failed:', error);
  }
};

const updateInLocalStorage = (collectionName: string, id: string, data: any) => {
  try {
    const existing = getFromLocalStorage(collectionName);
    const currentItem = existing.find(item => item.id === id);
    const incomingItem = normalizeRecordForCollection(collectionName, { ...currentItem, ...data, id });
    const updated = existing.map(item =>
      item.id === id && shouldReplaceLocalRecord(item, incomingItem) ? incomingItem : item
    );
    const next = existing.some(item => item.id === id) ? updated : [...updated, incomingItem];
    const localStorageKey = getLocalStorageKey(collectionName);
    if (!localStorageKey) return;
    localStorage.setItem(localStorageKey, JSON.stringify(next));
  } catch (error) {
    console.error('localStorage update failed:', error);
  }
};

const deleteFromLocalStorage = (collectionName: string, id: string) => {
  try {
    const existing = getFromLocalStorage(collectionName);
    const updated = existing.filter(item => item.id !== id);
    const localStorageKey = getLocalStorageKey(collectionName);
    if (!localStorageKey) return;
    localStorage.setItem(localStorageKey, JSON.stringify(updated));
  } catch (error) {
    console.error('localStorage write failed:', error);
  }
};

const getFromLocalStorage = (collectionName: string): any[] => {
  try {
    const storageKey = getLocalStorageKey(collectionName);
    if (!storageKey) return [];
    const data = localStorage.getItem(storageKey);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
};

const fallbackToLocalAdd = (collectionName: string, data: any) => {
  const id = data.id || `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  saveToLocalStorage(collectionName, { ...data, id }, id);

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
  schedulePendingSyncRetry();
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

const syncPendingPosOrderUpdate = async (change: PendingChange, collectionPath: string) => {
  let conflictToSave: Record<string, any> | null = null;
  let skippedBecauseRemoteIsTerminal = false;

  const result = await runTransaction(db, async transaction => {
    const updateDocRef = doc(db, collectionPath, change.id);
    const snapshot = await transaction.get(updateDocRef);
    const remoteData = snapshot.exists() ? snapshot.data() : {};
    const localData = change.data || {};
    const localTerminal = isTerminalPosOrderRecord(localData);
    const remoteTerminal = isTerminalPosOrderRecord(remoteData);

    if (remoteTerminal && !localTerminal) {
      skippedBecauseRemoteIsTerminal = true;
      return { success: true, skipped: true, reason: 'remote-terminal-order' };
    }

    const localOperationId = localData.stockDeductionOperationId;
    const remoteOperationId = remoteData.stockDeductionOperationId;
    const hasStockConflict = Boolean(
      remoteData.stockDeducted &&
      localData.stockDeducted &&
      remoteOperationId &&
      localOperationId &&
      remoteOperationId !== localOperationId
    );

    if (hasStockConflict) {
      conflictToSave = {
        collection: change.collection,
        docId: change.id,
        type: 'stock-deduction-operation-mismatch',
        localOperationId,
        remoteOperationId,
      };
      transaction.set(updateDocRef, {
        syncConflict: true,
        syncConflictType: 'stock-deduction-operation-mismatch',
        syncConflictAt: Date.now(),
        localPendingStockDeductionOperationId: localOperationId,
        remoteStockDeductionOperationId: remoteOperationId,
      }, { merge: true });
      return { success: false, conflict: true };
    }

    transaction.set(updateDocRef, toFirestoreData(normalizeRecordForCollection(change.collection, { ...localData, id: change.id })), { merge: true });
    return { success: true };
  });

  if (skippedBecauseRemoteIsTerminal) {
    return result;
  }

  if (conflictToSave) {
    saveSyncConflict({
      ...(conflictToSave as Record<string, any>),
      id: `pos_order_${change.id}_${Date.now()}`,
    });
  }

  return result;
};

const getOrderIdFromStockDeductionIncrementId = (operationId: string): string | null => {
  const match = String(operationId || '').match(/^stock-(order-\d+-[a-z0-9]+)/i);
  return match?.[1] || null;
};

const shouldSkipPendingStockIncrement = async (
  change: PendingChange,
  collectionPath: string,
  operationId: string
): Promise<boolean> => {
  const collectionKey = getCollectionKey(change.collection);
  if (collectionKey !== 'inventory_items' && collectionKey !== 'fridge_inventory') {
    return false;
  }

  const orderId = getOrderIdFromStockDeductionIncrementId(operationId);
  if (!orderId) {
    return false;
  }

  const posOrdersPath = getStoreCollectionPath('pos_orders');
  if (posOrdersPath) {
    const orderSnapshot = await getDoc(doc(db, posOrdersPath, orderId));
    const remoteOrder = orderSnapshot.exists() ? orderSnapshot.data() : null;
    if (remoteOrder && remoteOrder.stockDeducted) {
      return true;
    }
  }

  const targetSnapshot = await getDoc(doc(db, collectionPath, change.id));
  const targetData = targetSnapshot.exists() ? targetSnapshot.data() : {};
  const appliedOperationIds = Array.isArray(targetData.appliedIncrementOperationIds)
    ? targetData.appliedIncrementOperationIds
    : [];
  return appliedOperationIds.some(appliedId =>
    appliedId !== operationId &&
    getOrderIdFromStockDeductionIncrementId(appliedId) === orderId
  );
};


/**
 */
export const syncPendingChanges = async () => {
  const changes = getPendingChanges();

  if (changes.length === 0) {
    return;
  }

  let successCount = 0;
  const failedChanges: PendingChange[] = [];

  for (const change of changes) {
      try {
        const collectionPath = getStoreCollectionPath(change.collection);
        if (!collectionPath) {
          failedChanges.push(change);
          continue;
        }
        switch (change.operation) {
        case 'add':
          await setDoc(doc(db, collectionPath, change.id), toFirestoreData({ ...change.data, id: change.id }, true), { merge: true });
          break;
        case 'update':
          if (change.data?.__fridgeTransfer) {
            const result = await smartTransferFridgeStock({
              ...change.data.__fridgeTransfer,
              operationId: change.id,
              allowPendingFallback: false,
            });
            if (!result.success) {
              throw new Error(`pending-fridge-transfer-failed:${change.id}:${String((result as any).error || 'unknown')}`);
            }
          } else if (change.collection === 'pos_orders') {
            await syncPendingPosOrderUpdate(change, collectionPath);
          } else if (change.data?.__increment) {
            const { fieldName, amount } = change.data.__increment;
            const operationId = change.data.__increment.operationId || `pending-${change.collection}-${change.id}-${change.timestamp}`;
            const { __increment, ...rest } = change.data;
            if (await shouldSkipPendingStockIncrement(change, collectionPath, operationId)) {
              break;
            }
            await applyIdempotentIncrement(collectionPath, change.id, fieldName, amount, rest, operationId);
          } else {
            const updateDocRef = doc(db, collectionPath, change.id);
            await setDoc(updateDocRef, toFirestoreData({ ...change.data, id: change.id }), { merge: true });
          }
          break;
        case 'delete':
          const deleteDocRef = doc(db, collectionPath, change.id);
          await deleteDoc(deleteDocRef);
          break;
      }
      successCount++;
    } catch (error) {
      failedChanges.push(change);
      console.error('Smart sync operation failed:', error);
    }
  }

  if (successCount > 0) {
    setPendingChanges(failedChanges);
  }
};


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
        return convertTimestampsToLocalTime(rawData);
      });
    } catch (error) {
      console.error('Firestore store query failed:', error);
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
        return convertTimestampsToLocalTime(rawData);
      });

      localStorage.setItem(`_$storeId`, JSON.stringify(data));
      callback(data);
    }, (error) => {
      console.error('Store subscription failed:', error);
      const localData = getFromLocalStorage(collectionName).filter(item => item.storeId === storeId);
      callback(localData);
    });
  } catch (error) {
    console.error('Store data query failed:', error);
    const localData = getFromLocalStorage(collectionName).filter(item => item.storeId === storeId);
    callback(localData);
    return () => {};
  }
};
