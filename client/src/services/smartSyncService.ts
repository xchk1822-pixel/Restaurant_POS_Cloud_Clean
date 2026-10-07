import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocFromServer,
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
import {
  buildProvisionalOrderNumber,
  hasTerminalStatusConflict,
  isProvisionalOrderNumber,
} from '../utils/posLifecycle';
import { toLocalDateKey } from '../utils/localTime';
import { type StockDeductionPlan } from '../utils/stockDeduction';
import {
  normalizePurchaseOrderDateFields,
  normalizePurchaseStockRecordDateFields,
} from '../utils/purchaseDates';
import {
  compactPurchaseExpenseCache,
  getPendingExpenseIds,
} from '../utils/purchaseLocalCache';

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
const PURCHASE_IMMEDIATE_SYNC_TIMEOUT_MS = 12000;
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
  id?: string;
  data?: any;
  operationId?: string;
  duplicate?: boolean;
  cloudSynced?: boolean;
  pending?: boolean;
  offline?: boolean;
  localOnly?: boolean;
  weakNetworkFallback?: boolean;
  skipped?: boolean;
  remoteData?: any;
  error?: any;
  localFirst?: boolean;
};

type SmartWriteOptions = {
  localFirst?: boolean;
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
  if (hasTerminalStatusConflict(current, incoming)) return true;
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

const getPendingPosOrderSyncIds = (storeIdOverride?: string): Set<string> => {
  try {
    const storeId = storeIdOverride || getCurrentStoreId();
    const storageKey = storeId ? `store_${storeId}_pos_pending_order_sync` : 'pos_pending_order_sync';
    const stored = localStorage.getItem(storageKey);
    return stored ? new Set(JSON.parse(stored)) : new Set();
  } catch {
    return new Set();
  }
};

const replaceLocalPosOrdersForDatePrefix = (datePrefix: string, cloudOrders: any[], storeIdOverride?: string) => {
  const collectionName = storeIdOverride ? `stores/${storeIdOverride}/pos_orders` : 'pos_orders';
  const localStorageKey = getLocalStorageKey(collectionName);
  if (!localStorageKey) return;

  const pendingOrderIds = getPendingPosOrderSyncIds(storeIdOverride);
  const localOrders = getFromLocalStorage(collectionName);
  const retainedOrders = localOrders.filter(order => {
    if (pendingOrderIds.has(String(order?.id || ''))) return true;
    return !String(order?.orderNumber || '').startsWith(datePrefix);
  });
  try {
    localStorage.setItem(localStorageKey, JSON.stringify([...retainedOrders, ...cloudOrders]));
  } catch (error) {
    if (isQuotaExceededError(error)) {
      const currentDayRecovery = new Map<string, any>();
      cloudOrders.forEach(order => currentDayRecovery.set(String(order?.id || order?.orderNumber || ''), order));
      localOrders
        .filter(order => pendingOrderIds.has(String(order?.id || '')))
        .forEach(order => currentDayRecovery.set(String(order?.id || order?.orderNumber || ''), order));
      try {
        localStorage.setItem(localStorageKey, JSON.stringify(Array.from(currentDayRecovery.values())));
      } catch (recoveryError) {
        console.warn('POS current-day recovery cache write failed; cloud data will still be displayed:', recoveryError);
      }
      return;
    }
    console.warn('POS current-day local cache write failed; cloud data will still be displayed:', error);
  }
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

  if (
    typeof value === 'object' &&
    typeof value.seconds === 'number' &&
    typeof value.nanoseconds === 'number'
  ) {
    return new Timestamp(value.seconds, value.nanoseconds);
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
  storeId?: string | null;
  status?: 'pending' | 'conflict';
  lastAttemptAt?: number;
  error?: string;
}

const PENDING_CHANGES_KEY = 'pending_firestore_changes';

const getPendingChangesStorageKey = () => {
  const storeId = getCurrentStoreId();
  return storeId ? `store_${storeId}_${PENDING_CHANGES_KEY}` : PENDING_CHANGES_KEY;
};

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
    const storageKey = getPendingChangesStorageKey();
    const changes = localStorage.getItem(storageKey);
    const parsed = changes ? JSON.parse(changes) : [];
    if (!Array.isArray(parsed)) return [];

    const coalesced = coalescePendingChanges(parsed);
    if (coalesced.length !== parsed.length) {
      localStorage.setItem(storageKey, JSON.stringify(coalesced));
    }
    return coalesced;
  } catch {
    return [];
  }
};

const savePendingChange = (change: PendingChange) => {
  const changes = coalescePendingChanges([...getPendingChanges(), {
    ...change,
    storeId: change.storeId ?? getCurrentStoreId(),
    status: change.status || 'pending',
  }]);
  localStorage.setItem(getPendingChangesStorageKey(), JSON.stringify(changes));
};

const clearPendingChanges = () => {
  localStorage.removeItem(getPendingChangesStorageKey());
  localStorage.removeItem(PENDING_CHANGES_KEY);
};

const setPendingChanges = (changes: PendingChange[]) => {
  if (changes.length === 0) {
    clearPendingChanges();
    return;
  }
  localStorage.setItem(getPendingChangesStorageKey(), JSON.stringify(changes));
};

export const getPendingSyncStatus = () => {
  const pendingChanges = getPendingChanges();
  let conflicts: any[] = [];
  try {
    const stored = localStorage.getItem(getSyncConflictsKey());
    conflicts = stored ? JSON.parse(stored) : [];
  } catch {
    conflicts = [];
  }

  return {
    pendingCount: pendingChanges.length,
    conflictCount: Array.isArray(conflicts) ? conflicts.length : 0,
    pendingChanges,
    conflicts: Array.isArray(conflicts) ? conflicts : [],
  };
};

const LOCAL_COLLECTION_CACHE_LIMITS: Record<string, number> = {
  inventory_stock_records: 800,
};

const isQuotaExceededError = (error: any): boolean => (
  error?.name === 'QuotaExceededError' ||
  error?.code === 22 ||
  String(error?.message || '').includes('exceeded the quota')
);

const compactCollectionForLocalCache = (collectionName: string, rows: any[]) => {
  const collectionKey = getCollectionKey(collectionName);
  const limit = LOCAL_COLLECTION_CACHE_LIMITS[collectionKey];
  if (!limit || rows.length <= limit) return rows;

  return [...rows]
    .sort((a, b) => getRecordVersion(b) - getRecordVersion(a))
    .slice(0, limit);
};

const setCollectionLocalCache = (collectionName: string, rows: any[]) => {
  const localStorageKey = getLocalStorageKey(collectionName);
  if (!localStorageKey) return;

  try {
    localStorage.setItem(localStorageKey, JSON.stringify(rows));
  } catch (error) {
    if (!isQuotaExceededError(error)) {
      console.error('localStorage save failed:', error);
      return;
    }

    const compactedRows = compactCollectionForLocalCache(collectionName, rows);
    if (compactedRows.length === rows.length) {
      console.warn('Local cache quota exceeded; skipped cache write:', collectionName);
      return;
    }

    try {
      localStorage.setItem(localStorageKey, JSON.stringify(compactedRows));
      console.warn('Local cache quota exceeded; compacted local cache:', collectionName, `${compactedRows.length}/${rows.length}`);
    } catch {
      localStorage.removeItem(localStorageKey);
      console.warn('Local cache quota exceeded; cleared local cache:', collectionName);
    }
  }
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
    return null;
  }
  localStorage.setItem(localStorageKey, JSON.stringify(updated));
  return nextRecord;
};

const queueIncrementLocally = (
  collectionName: string,
  docId: string,
  fieldName: string,
  amount: number,
  extraData: Record<string, any>,
  operationId: string
) => {
  const existingRecord = getFromLocalStorage(collectionName).find(item => item.id === docId);
  const appliedOperationIds = Array.isArray(existingRecord?.appliedIncrementOperationIds)
    ? existingRecord.appliedIncrementOperationIds
    : [];
  if (appliedOperationIds.includes(operationId)) {
    return { success: true, pending: true, localFirst: true, duplicate: true, operationId, data: existingRecord };
  }

  const localRecord = applyIncrementToLocalStorage(collectionName, docId, fieldName, amount, {
    ...extraData,
    appliedIncrementOperationIds: [...appliedOperationIds, operationId],
  });
  if (!localRecord) {
    return { success: false, error: 'missing-store-id' };
  }

  savePendingChange({
    id: docId,
    collection: collectionName,
    operation: 'update',
    data: {
      ...extraData,
      __increment: { fieldName, amount, operationId },
    },
    timestamp: Date.now(),
  });
  schedulePendingSyncRetry();
  return { success: true, pending: true, localFirst: true, operationId, data: localRecord };
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
    const currentRecord = { id: docId, ...currentData };

    if (appliedOperationIds.includes(operationId)) {
      return { success: true, duplicate: true, operationId, data: currentRecord };
    }

    const nextRecord = {
      ...currentRecord,
      ...extraData,
      [fieldName]: (Number(currentData[fieldName]) || 0) + amount,
      appliedIncrementOperationIds: [...appliedOperationIds, operationId],
    };

    transaction.set(docRef, {
      ...toFirestoreData(extraData),
      id: docId,
      [fieldName]: increment(amount),
      appliedIncrementOperationIds: arrayUnion(operationId),
    }, { merge: true });

    return { success: true, operationId, data: nextRecord };
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

const getOfflineTerminalId = (storeId: string): string => {
  const storageKey = `pos_offline_terminal_id_${storeId}`;
  const existing = localStorage.getItem(storageKey);
  if (existing) return existing;

  const generated = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  ).replace(/[^a-z0-9]/gi, '').slice(-8).toUpperCase();
  localStorage.setItem(storageKey, generated);
  return generated;
};

const generateLocalDailyOrderNumber = (datePrefix: string, dayKey: string) => {
  const storeId = getCurrentStoreId() || 'no_store';
  const counterKey = `pos_offline_order_counter_${storeId}_${dayKey}`;
  const rawCurrentSequence = Number(localStorage.getItem(counterKey) || '0');
  const currentSequence = Number.isFinite(rawCurrentSequence) ? rawCurrentSequence : 0;
  const nextSequence = currentSequence + 1;
  localStorage.setItem(counterKey, String(nextSequence));
  return buildProvisionalOrderNumber(datePrefix, getOfflineTerminalId(storeId), nextSequence);
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

const resolvePosOrderNumberForCloudTransaction = async (
  transaction: any,
  localData: any,
  remoteData: any
): Promise<any> => {
  const localOrderNumber = String(localData?.orderNumber || '');
  if (!isProvisionalOrderNumber(localOrderNumber)) return localData;

  const remoteOrderNumber = String(remoteData?.orderNumber || '');
  if (remoteOrderNumber && !isProvisionalOrderNumber(remoteOrderNumber)) {
    return {
      ...localData,
      orderNumber: remoteOrderNumber,
      offlineOrderNumber: localData.offlineOrderNumber || localOrderNumber,
    };
  }

  const createdDateKey = getRecordDateKey(localData?.createdAt) || formatLocalDateKey(new Date());
  const orderDate = new Date(`${createdDateKey}T12:00:00`);
  const { datePrefix, dayKey } = formatOrderNumberDateParts(orderDate);
  const counterCollectionPath = getStoreCollectionPath('order_counters');
  if (!counterCollectionPath) return localData;

  const counterRef = doc(db, counterCollectionPath, dayKey);
  const counterSnapshot = await transaction.get(counterRef);
  const counterData = counterSnapshot.exists() ? counterSnapshot.data() : {};
  const rawCurrentSequence = Number(counterData.sequence || 0);
  const currentSequence = Number.isFinite(rawCurrentSequence) ? rawCurrentSequence : 0;
  const nextSequence = Math.max(currentSequence, getMaxLocalOrderSequence(datePrefix)) + 1;
  const officialOrderNumber = `${datePrefix}${String(nextSequence).padStart(3, '0')}`;

  transaction.set(counterRef, {
    id: dayKey,
    date: dayKey,
    sequence: nextSequence,
    lastModified: Date.now(),
    updatedAt: new Date().toISOString(),
  }, { merge: true });

  return {
    ...localData,
    orderNumber: officialOrderNumber,
    offlineOrderNumber: localOrderNumber,
    orderNumberAssignedAt: new Date().toISOString(),
  };
};


/**
 */
export const smartAddDocument = async (collectionName: string, data: any, options: SmartWriteOptions = {}) => {
  const storeCollectionPath = getStoreCollectionPath(collectionName);
  const docId = data.id || (storeCollectionPath ? doc(collection(db, storeCollectionPath)).id : `blocked_${Date.now()}`);
  if (!storeCollectionPath) {
    return { id: docId, success: false, error: 'missing-store-id' };
  }
  const existingLocal = getFromLocalStorage(collectionName).find(item => item.id === docId);
  const normalizedData = withSyncMetadata(collectionName, data, docId, existingLocal, true);
  const docData = {
    ...toFirestoreData(normalizedData, true),
    id: docId,
  };

  if (options.localFirst) {
    const queuedResult = fallbackToLocalAdd(collectionName, docData);
    return { ...queuedResult, success: true, localFirst: true };
  }

  if (!FIRESTORE_ENABLED) {
    saveToLocalStorage(collectionName, normalizedData, docId);
    return { id: docId, success: true };
  }

  if (isOnline) {
    try {
      const docRef = doc(db, storeCollectionPath, docId);
      await withWeakNetworkTimeout(
        () => setDoc(docRef, docData, { merge: true }),
        `add:${collectionName}/${docId}`
      );

      saveToLocalStorage(collectionName, docData, docId);

      return { id: docId, ...docData, success: true, cloudSynced: true };
    } catch (error) {
      if (!isWeakNetworkTimeout(error)) {
        console.error('Firestore add failed, falling back to local:', error);
      }
      return fallbackToLocalAdd(collectionName, docData);
    }
  } else {
    return fallbackToLocalAdd(collectionName, docData);
  }
};

/**
 */
export const smartSetDocument = async (collectionName: string, docId: string, data: any, options: SmartWriteOptions = {}) => {
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

  if (options.localFirst) {
    fallbackToLocalSet(collectionName, docId, docData);
    return { id: docId, ...docData, success: true, pending: true, localFirst: true };
  }

  if (isOnline) {
    try {
      const docRef = doc(db, storeCollectionPath, docId);
      await withWeakNetworkTimeout(async () => {
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          await updateDoc(docRef, docData);
        } else {
          await setDoc(docRef, {
            ...docData,
            createdAt: Timestamp.now(),
          });
        }
      }, `set:${collectionName}/${docId}`);

      saveToLocalStorage(collectionName, docData, docId);

      return { id: docId, ...docData, success: true, cloudSynced: true };
    } catch (error) {
      if (!isWeakNetworkTimeout(error)) {
        console.error('Firestore set failed, falling back to local:', error);
      }
      fallbackToLocalSet(collectionName, docId, docData);
      return { id: docId, ...docData, success: false, pending: true, weakNetworkFallback: isWeakNetworkTimeout(error) };
    }
  } else {
    fallbackToLocalSet(collectionName, docId, docData);
    return { id: docId, ...docData, success: true, pending: true, offline: true };
  }
};

/**
 */
export const smartUpdateDocument = async (
  collectionName: string,
  docId: string,
  data: any,
  options: SmartWriteOptions = {}
): Promise<SmartWriteResult> => {
  const existingLocal = getFromLocalStorage(collectionName).find(item => item.id === docId);
  const collectionKey = getCollectionKey(collectionName);
  const dataForWrite = collectionKey === 'pos_orders' && isPosOrderLifecycleRegression(existingLocal, data)
    ? existingLocal
    : data;
  const normalizedData = withSyncMetadata(collectionName, dataForWrite, docId, existingLocal);

  if (options.localFirst) {
    fallbackToLocalUpdate(collectionName, docId, normalizedData);
    return { success: true, pending: true, localFirst: true };
  }

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

              if (remoteData?.isDeleted) {
                return { skipped: true, remoteData };
              }

              if (remoteData && isPosOrderLifecycleRegression(remoteData, normalizedData)) {
                return { skipped: true, remoteData };
              }

              const resolvedData = await resolvePosOrderNumberForCloudTransaction(transaction, normalizedData, remoteData);
              transaction.set(docRef, toFirestoreData({ ...resolvedData, id: docId }), { merge: true });
              return {
                skipped: false,
                remoteData: normalizeRecordForCollection(collectionName, { ...resolvedData, id: docId }),
              };
            }),
            `update:${collectionName}/${docId}`
          );

          if (result?.remoteData) {
            updateInLocalStorage(collectionName, docId, normalizeRecordForCollection(collectionName, result.remoteData));
            return { success: true, cloudSynced: true, skipped: result.skipped, remoteData: result.remoteData };
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
      await withWeakNetworkTimeout(
        () => deleteDoc(docRef),
        `delete:${collectionName}/${docId}`
      );

      deleteFromLocalStorage(collectionName, docId);
    } catch (error) {
      if (!isWeakNetworkTimeout(error)) {
        console.error('Firestore delete failed, falling back to local:', error);
      }
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
  extraData: Record<string, any> = {},
  options: SmartWriteOptions = {}
): Promise<SmartWriteResult> => {
  const storeCollectionPath = getStoreCollectionPath(collectionName);
  if (!storeCollectionPath) {
    return { success: false, error: 'missing-store-id' };
  }
  const operationId = extraData.syncOperationId || `increment-${collectionName}-${docId}-${fieldName}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const { syncOperationId, ...incrementExtraData } = extraData;

  if (options.localFirst) {
    return queueIncrementLocally(collectionName, docId, fieldName, amount, incrementExtraData, operationId);
  }

  if (isOnline && FIRESTORE_ENABLED) {
    try {
      const incrementResult = await withWeakNetworkTimeout(
        () => applyIdempotentIncrement(storeCollectionPath, docId, fieldName, amount, incrementExtraData, operationId),
        `increment:${collectionName}/${docId}.${fieldName}`
      );
      updateInLocalStorage(collectionName, docId, incrementResult.data);
      return { success: true, operationId, duplicate: incrementResult.duplicate, data: incrementResult.data };
    } catch (error) {
      if (!isWeakNetworkTimeout(error)) {
        console.error(`Inventory increment failed: ${collectionName}/${docId}.${fieldName}`, error);
      }
    }
  }

  return queueIncrementLocally(collectionName, docId, fieldName, amount, incrementExtraData, operationId);
};

interface PurchaseInventoryIncrement {
  itemId: string;
  quantity: number;
  operationId: string;
  lastModified: number;
  lastUpdated: any;
}

interface PurchaseLocalBatchInput {
  order: any;
  inventoryIncrements: PurchaseInventoryIncrement[];
  stockRecords: any[];
  expense?: any | null;
  supplierUpdate?: any | null;
}

const upsertLocalRows = (rows: any[], records: any[]) => {
  const incomingIds = new Set(records.map(record => record.id));
  return [...rows.filter(record => !incomingIds.has(record.id)), ...records];
};

const writeLocalStorageTransaction = (entries: Array<{ key: string; value: string }>) => {
  const previousValues = new Map(entries.map(entry => [entry.key, localStorage.getItem(entry.key)]));
  const writtenKeys: string[] = [];

  try {
    entries.forEach(entry => {
      localStorage.setItem(entry.key, entry.value);
      writtenKeys.push(entry.key);
    });
  } catch (error) {
    [...writtenKeys].reverse().forEach(key => {
      localStorage.removeItem(key);
      const previousValue = previousValues.get(key);
      if (previousValue !== null && previousValue !== undefined) {
        localStorage.setItem(key, previousValue);
      }
    });
    throw error;
  }
};

const keepRequiredRecentRows = (rows: any[], requiredIds: Set<string>, limit: number) => {
  const requiredRows = rows.filter(row => requiredIds.has(row.id));
  const recentRows = rows
    .filter(row => !requiredIds.has(row.id))
    .sort((a, b) => getRecordVersion(b) - getRecordVersion(a))
    .slice(0, Math.max(0, limit - requiredRows.length));
  return [...requiredRows, ...recentRows];
};

/**
 * Saves one purchase as one idempotent batch. Online submissions commit to
 * Firestore first; local durability is required only for offline/cloud fallback.
 */
export const smartSavePurchaseLocally = async ({
  order,
  inventoryIncrements,
  stockRecords,
  expense = null,
  supplierUpdate = null,
}: PurchaseLocalBatchInput): Promise<SmartWriteResult & { inventoryRecords?: any[] }> => {
  const storeId = getCurrentStoreId();
  if (!storeId) return { success: false, error: 'missing-store-id' };

  const operationId = `purchase-batch-${order.id}`;
  const purchaseKey = getLocalStorageKey('purchase_orders');
  const inventoryKey = getLocalStorageKey('inventory_items');
  const stockRecordKey = getLocalStorageKey('inventory_stock_records');
  const expenseCacheKey = getLocalStorageKey('expenses');
  const expenseKey = expense ? expenseCacheKey : null;
  const supplierKey = supplierUpdate ? getLocalStorageKey('suppliers') : null;
  if (!purchaseKey || !inventoryKey || !stockRecordKey) {
    return { success: false, error: 'missing-store-id' };
  }

  const purchaseRows = upsertLocalRows(getFromLocalStorage('purchase_orders'), [order]);
  let inventoryRows = [...getFromLocalStorage('inventory_items')];
  const inventoryRecords: any[] = [];

  inventoryIncrements.forEach(change => {
    const index = inventoryRows.findIndex(record => record.id === change.itemId);
    const current = index >= 0 ? inventoryRows[index] : { id: change.itemId };
    const appliedIds = Array.isArray(current.appliedIncrementOperationIds)
      ? current.appliedIncrementOperationIds
      : [];
    const alreadyApplied = appliedIds.includes(change.operationId);
    const nextRecord = {
      ...current,
      currentStock: (Number(current.currentStock) || 0) + (alreadyApplied ? 0 : change.quantity),
      lastModified: change.lastModified,
      lastUpdated: change.lastUpdated,
      appliedIncrementOperationIds: alreadyApplied ? appliedIds : [...appliedIds, change.operationId],
    };
    inventoryRows = index >= 0
      ? inventoryRows.map((record, rowIndex) => rowIndex === index ? nextRecord : record)
      : [...inventoryRows, nextRecord];
    inventoryRecords.push(nextRecord);
  });

  let stockRows = upsertLocalRows(getFromLocalStorage('inventory_stock_records'), stockRecords);
  let expenseRows = expense
    ? upsertLocalRows(getFromLocalStorage('expenses'), [expense])
    : null;
  const supplierRows = supplierUpdate
    ? upsertLocalRows(getFromLocalStorage('suppliers'), [supplierUpdate])
    : null;
  const pendingChange: PendingChange = {
    id: operationId,
    collection: 'purchase_orders',
    operation: 'update',
    data: {
      __purchaseBatch: {
        operationId,
        order,
        inventoryIncrements,
        stockRecords,
        expense,
        supplierUpdate,
      },
    },
    timestamp: Date.now(),
    storeId,
    status: 'pending',
  };
  const existingPendingRows = getPendingChanges().filter(change => change.id !== operationId);
  const pendingRows = coalescePendingChanges([
    ...existingPendingRows,
    pendingChange,
  ]);

  let directCloudError: any = null;
  const shouldTryCloudFirst = FIRESTORE_ENABLED && navigator.onLine;
  if (shouldTryCloudFirst) {
    try {
      await withWeakNetworkTimeout(
        () => syncPendingPurchaseBatch(pendingChange),
        `purchase-batch:${pendingChange.id}`,
        PURCHASE_IMMEDIATE_SYNC_TIMEOUT_MS
      );
      isOnline = true;

      // Cloud is authoritative for an online purchase. A full browser cache
      // must never turn a confirmed cloud transaction into a submit failure.
      try {
        const confirmedExpenseRows = expenseRows
          ? compactPurchaseExpenseCache(expenseRows, new Set(), 80)
          : null;
        writeLocalStorageTransaction([
          { key: getPendingChangesStorageKey(), value: JSON.stringify(existingPendingRows) },
          { key: purchaseKey, value: JSON.stringify(keepRequiredRecentRows(purchaseRows, new Set([order.id]), 30)) },
          { key: inventoryKey, value: JSON.stringify(inventoryRows) },
          { key: stockRecordKey, value: JSON.stringify(keepRequiredRecentRows(stockRows, new Set(stockRecords.map(record => record.id)), 120)) },
          ...(expenseKey && confirmedExpenseRows ? [{ key: expenseKey, value: JSON.stringify(confirmedExpenseRows) }] : []),
          ...(supplierKey && supplierRows ? [{ key: supplierKey, value: JSON.stringify(supplierRows) }] : []),
        ]);
      } catch (cacheError) {
        console.warn('Purchase cloud save succeeded; local cache update skipped:', cacheError);
      }

      return { success: true, cloudSynced: true, operationId, inventoryRecords };
    } catch (error) {
      directCloudError = error;
    }
  }

  if (expenseKey && expenseRows) {
    expenseRows = compactPurchaseExpenseCache(
      expenseRows,
      getPendingExpenseIds(pendingRows, expense?.id),
      80
    );
    // Replacing cloud-reloadable receipt payloads with compact rows releases
    // space before the new purchase transaction writes its pending batch.
    try {
      localStorage.setItem(expenseKey, JSON.stringify(expenseRows));
    } catch (error) {
      if (!isQuotaExceededError(error)) throw error;
    }
  }

  const buildEntries = (nextPurchaseRows: any[], nextStockRows: any[]) => [
    { key: getPendingChangesStorageKey(), value: JSON.stringify(pendingRows) },
    { key: purchaseKey, value: JSON.stringify(nextPurchaseRows) },
    { key: inventoryKey, value: JSON.stringify(inventoryRows) },
    { key: stockRecordKey, value: JSON.stringify(nextStockRows) },
    ...(expenseKey && expenseRows ? [{ key: expenseKey, value: JSON.stringify(expenseRows) }] : []),
    ...(supplierKey && supplierRows ? [{ key: supplierKey, value: JSON.stringify(supplierRows) }] : []),
  ];

  try {
    writeLocalStorageTransaction(buildEntries(purchaseRows, stockRows));
  } catch (error) {
    if (!isQuotaExceededError(error)) throw error;

    // Historical rows are cloud-reloadable. Keep the new purchase and recent
    // records so a full browser cache cannot block current restaurant work.
    if (expenseCacheKey) {
      const currentExpenseRows = expenseRows || getFromLocalStorage('expenses');
      const requiredExpenseIds = getPendingExpenseIds(pendingRows, expense?.id);
      const compactedExpenseRows = compactPurchaseExpenseCache(
        currentExpenseRows,
        requiredExpenseIds,
        80
      );
      localStorage.setItem(expenseCacheKey, JSON.stringify(compactedExpenseRows));
      if (expenseRows) expenseRows = compactedExpenseRows;
    }

    const compactPurchases = keepRequiredRecentRows(purchaseRows, new Set([order.id]), 30);
    stockRows = keepRequiredRecentRows(stockRows, new Set(stockRecords.map(record => record.id)), 120);
    writeLocalStorageTransaction(buildEntries(compactPurchases, stockRows));
  }

  if (directCloudError) {
    schedulePendingSyncRetry(3000);
    return {
      success: true,
      pending: true,
      weakNetworkFallback: isWeakNetworkTimeout(directCloudError),
      error: directCloudError,
      localFirst: true,
      operationId,
      inventoryRecords,
    };
  }

  const cloudResult = await syncPurchaseBatchImmediately(pendingChange);
  if (!cloudResult.cloudSynced) {
    schedulePendingSyncRetry(cloudResult.offline ? 0 : 3000);
  }
  return { ...cloudResult, operationId, inventoryRecords };
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

export const smartPrepareStockDeductionPlan = async (
  orderId: string,
  operationId: string,
  createPlan: () => Promise<StockDeductionPlan>
): Promise<StockDeductionPlan> => {
  const collectionPath = getStoreCollectionPath('pos_orders');
  if (!collectionPath) throw new Error('missing-store-id');
  const cachedOrder = getFromLocalStorage(collectionPath).find(record => record.id === orderId);
  const pendingOrder = getPendingChanges().find(change =>
    change.collection === collectionPath && change.id === orderId && change.data?.stockDeductionPlan
  );
  const localPlan = pendingOrder?.data.stockDeductionPlan || cachedOrder?.stockDeductionPlan;
  const checkPlan = (plan: any) => {
    if (plan.operationId !== operationId) throw new Error('stock-plan-operation-conflict');
    return plan as StockDeductionPlan;
  };
  let candidate = localPlan;
  const getCandidate = async () => {
    if (!candidate) candidate = { ...await createPlan(), operationId };
    return checkPlan(candidate);
  };
  if (isOnline && FIRESTORE_ENABLED) {
    try {
      const plan = await withWeakNetworkTimeout(() => runTransaction(db, async transaction => {
        const orderRef = doc(db, collectionPath, orderId);
        const snapshot = await transaction.get(orderRef);
        const order = snapshot.data();
        if (!order || order.isDeleted) throw new Error('stock-plan-order-missing');
        if (order.stockDeductionPlan) return checkPlan(order.stockDeductionPlan);
        const nextPlan = await getCandidate();
        transaction.set(orderRef, { stockDeductionPlan: nextPlan }, { merge: true });
        return nextPlan;
      }), `stock-plan:${orderId}`);
      try { updateInLocalStorage(collectionPath, orderId, { stockDeductionPlan: plan }); }
      catch (error) { console.warn('Stock plan cache unavailable; cloud plan retained:', error); }
      return plan;
    } catch (error: any) {
      if (!isWeakNetworkTimeout(error) && error?.code !== 'unavailable') throw error;
    }
  }
  const plan = await getCandidate();
  fallbackToLocalUpdate(collectionPath, orderId, { stockDeductionPlan: plan, lastModified: Date.now() });
  return plan;
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
      const claimIsFresh = Boolean(
        currentData.stockDeductionInProgress &&
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

      return mergeCloudRangeWithPendingLocal(collectionName, docs, () => true);
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

export const smartGetDocument = async (
  collectionName: string,
  docId: string,
  forceServer = false
) => {
  const storeCollectionPath = getStoreCollectionPath(collectionName);
  if (!storeCollectionPath || !docId) return null;

  const localFallback = () => excludeDeletedRecords(getFromLocalStorage(collectionName))
    .find(record => String(record?.id || '') === String(docId)) || null;

  if (!isOnline) return localFallback();

  try {
    const documentRef = doc(db, storeCollectionPath, docId);
    const snapshot = forceServer
      ? await withWeakNetworkTimeout(() => getDocFromServer(documentRef), `read:${collectionName}:${docId}`)
      : await getDoc(documentRef);
    if (!snapshot.exists()) return null;

    return normalizeRecordForCollection(
      collectionName,
      convertTimestampsToLocalTime({ id: snapshot.id, ...snapshot.data() })
    );
  } catch (error) {
    if (!isExpectedOfflineReadError(error)) {
      console.error('Firestore document read failed, reading local cache:', error);
    }
    return localFallback();
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

export const smartRestoreOrderStockFromLedger = async ({
  orderId,
  orderNumber,
  deductionOperationId = getStableStockDeductionOperationId(orderId),
  restoreOperationId = `deleted-order-restore-${orderId}`,
}: {
  orderId: string;
  orderNumber?: string;
  deductionOperationId?: string;
  restoreOperationId?: string;
}) => {
  const originalRecords = await smartGetDocumentsWhereEqual(
    'inventory_stock_records',
    'sourceId',
    deductionOperationId,
    true
  );
  const saleRecords = originalRecords.filter(record => (
    record?.source === 'pos_sale' && Number(record?.signedQuantity) < 0
  ));
  if (saleRecords.length === 0) {
    return { success: false, error: 'missing-stock-deduction-ledger', restoreOperationId };
  }

  const now = Date.now();
  const restoredRecords: any[] = [];
  for (const originalRecord of saleRecords) {
    const restoreQuantity = Math.abs(Number(originalRecord.signedQuantity) || Number(originalRecord.quantity) || 0);
    if (restoreQuantity <= 0) continue;

    const isFridge = originalRecord.locationType === 'fridge';
    const targetCollection = isFridge ? 'fridge_inventory' : 'inventory_items';
    const targetId = isFridge
      ? `${originalRecord.fridgeId}-${originalRecord.itemId}`
      : originalRecord.itemId;
    const targetField = isFridge ? 'quantity' : 'currentStock';
    if (!targetId || (isFridge && !originalRecord.fridgeId)) {
      return { success: false, error: 'invalid-stock-deduction-ledger', restoreOperationId };
    }

    const incrementResult: any = await smartIncrementField(
      targetCollection,
      targetId,
      targetField,
      restoreQuantity,
      {
        lastModified: now,
        lastUpdated: new Date(now),
        syncOperationId: `${restoreOperationId}-${originalRecord.id}`,
      }
    );
    if (incrementResult?.error) {
      return { success: false, error: incrementResult.error, restoreOperationId };
    }

    const afterStock = incrementResult?.data
      ? Number(incrementResult.data[targetField] || 0)
      : Number(originalRecord.beforeStock || 0);
    const restoreRecord = {
      id: `${restoreOperationId}-${originalRecord.id}`,
      itemId: originalRecord.itemId,
      itemName: originalRecord.itemName,
      type: 'in',
      quantity: restoreQuantity,
      signedQuantity: restoreQuantity,
      reason: 'deleted order stock restore',
      source: 'deleted_order_restore',
      sourceId: restoreOperationId,
      restoredSourceId: deductionOperationId,
      reversalOf: originalRecord.id,
      orderId,
      orderNumber: orderNumber || originalRecord.orderNumber,
      orderType: originalRecord.orderType,
      locationType: originalRecord.locationType,
      fridgeId: originalRecord.fridgeId,
      fridgeName: originalRecord.fridgeName,
      beforeStock: afterStock - restoreQuantity,
      afterStock,
      unit: originalRecord.unit || '',
      date: new Date(now),
      createdAt: new Date(now),
      createdAtMs: now,
      lastModified: now,
      operator: getCurrentOperatorName(),
    };
    const ledgerResult: any = await smartAddDocument('inventory_stock_records', restoreRecord);
    if (ledgerResult?.error) {
      return { success: false, error: ledgerResult.error, restoreOperationId };
    }
    restoredRecords.push(restoreRecord);
  }

  return { success: true, restoreOperationId, restoredRecords };
};

const isDateKey = (value: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(value);

const formatLocalDateKey = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const addDaysToDateKey = (dateKey: string, days: number): string => {
  const date = new Date(`${dateKey}T12:00:00`);
  date.setDate(date.getDate() + days);
  return formatLocalDateKey(date);
};

const getRecordDateKey = (value: any): string => toLocalDateKey(value);

const normalizeQueryRows = (collectionName: string, snapshot: any): any[] => snapshot.docs.map((snapshotDoc: any) => (
  normalizeRecordForCollection(
    collectionName,
    convertTimestampsToLocalTime({ id: snapshotDoc.id, ...snapshotDoc.data() })
  )
));

const mergeUniqueRows = (rows: any[][]): any[] => {
  const merged = new Map<string, any>();
  rows.flat().forEach(row => {
    if (!row?.id) return;
    const existing = merged.get(String(row.id));
    if (!existing || shouldReplaceLocalRecord(existing, row)) {
      merged.set(String(row.id), row);
    }
  });
  return excludeDeletedRecords(Array.from(merged.values()));
};

const mergeCloudRangeWithPendingLocal = (
  collectionName: string,
  cloudRows: any[],
  localMatches: (record: any) => boolean
): any[] => {
  const pendingChanges = getPendingChanges().filter(change => change.collection === collectionName);
  if (pendingChanges.length === 0) return excludeDeletedRecords(cloudRows);

  const pendingDeletes = new Set(
    pendingChanges.filter(change => change.operation === 'delete').map(change => String(change.id))
  );
  const pendingWriteIds = new Set(
    pendingChanges.filter(change => change.operation !== 'delete').map(change => String(change.id))
  );
  const pendingLocalRows = getFromLocalStorage(collectionName).filter(record => (
    pendingWriteIds.has(String(record?.id || '')) && localMatches(record)
  ));
  return mergeUniqueRows([
    cloudRows.filter(record => !pendingDeletes.has(String(record?.id || ''))),
    pendingLocalRows,
  ]);
};

export const smartGetDocumentsByDateRange = async (
  collectionName: string,
  fieldName: string,
  startDate: string,
  endDate: string,
  forceServer = false,
  fieldType: 'date-string' | 'timestamp' | 'number-timestamp' = 'date-string'
) => {
  const storeCollectionPath = getStoreCollectionPath(collectionName);
  if (!storeCollectionPath || !isDateKey(startDate) || !isDateKey(endDate) || startDate > endDate) {
    return [];
  }

  const localFallback = () => excludeDeletedRecords(getFromLocalStorage(collectionName)).filter(record => {
    const dateKey = getRecordDateKey(record?.[fieldName]);
    return dateKey >= startDate && dateKey <= endDate;
  });

  try {
    const collectionRef = collection(db, storeCollectionPath);
    const nextDate = addDaysToDateKey(endDate, 1);
    const rangeQueries = fieldType === 'timestamp'
      ? [
          query(
            collectionRef,
            where(fieldName, '>=', Timestamp.fromDate(new Date(`${startDate}T00:00:00`))),
            where(fieldName, '<', Timestamp.fromDate(new Date(`${nextDate}T00:00:00`)))
          ),
          query(
            collectionRef,
            where(fieldName, '>=', new Date(`${startDate}T00:00:00-06:00`).toISOString()),
            where(fieldName, '<', new Date(`${nextDate}T00:00:00-06:00`).toISOString())
          ),
        ]
      : [fieldType === 'number-timestamp'
        ? query(
            collectionRef,
            where(fieldName, '>=', new Date(`${startDate}T00:00:00-06:00`).getTime()),
            where(fieldName, '<', new Date(`${nextDate}T00:00:00-06:00`).getTime())
          )
        : query(
            collectionRef,
            where(fieldName, '>=', startDate),
            where(fieldName, '<=', `${endDate}\uf8ff`)
          )];
    const snapshotResults = await Promise.allSettled(rangeQueries.map(rangeQuery => (
      forceServer && isOnline ? getDocsFromServer(rangeQuery) : getDocs(rangeQuery)
    )));
    const snapshots = snapshotResults.flatMap(result => (
      result.status === 'fulfilled' ? [result.value] : []
    ));
    if (snapshots.length === 0) {
      const failedResult = snapshotResults.find(result => result.status === 'rejected');
      throw failedResult && failedResult.status === 'rejected'
        ? failedResult.reason
        : new Error('Firestore date-range read failed');
    }
    const cloudRows = mergeUniqueRows(
      snapshots.map(snapshot => normalizeQueryRows(collectionName, snapshot))
    );
    return mergeCloudRangeWithPendingLocal(
      collectionName,
      cloudRows,
      record => {
        const dateKey = getRecordDateKey(record?.[fieldName]);
        return dateKey >= startDate && dateKey <= endDate;
      }
    );
  } catch (error) {
    if (!isExpectedOfflineReadError(error)) {
      console.error('Firestore date-range read failed, reading local cache:', error);
    }
    return localFallback();
  }
};

const getOrderCreatedDateKey = (order: any): string => getRecordDateKey(
  order?.createdAt || order?.date || order?.orderDate
);

const isOrderCreatedInRange = (order: any, startDate: string, endDate: string): boolean => {
  const dateKey = getOrderCreatedDateKey(order);
  if (dateKey) return dateKey >= startDate && dateKey <= endDate;
  const orderPrefix = String(order?.orderNumber || '').slice(0, 4);
  return orderPrefix >= startDate.slice(5).replace('-', '') && orderPrefix <= endDate.slice(5).replace('-', '');
};

const getPosOrdersByOrderNumberRange = async (
  collectionRef: any,
  collectionName: string,
  startDate: string,
  endDate: string,
  forceServer: boolean
): Promise<any[]> => {
  const sameYear = startDate.slice(0, 4) === endDate.slice(0, 4);
  if (!sameYear) {
    const dates: string[] = [];
    for (let dateKey = startDate; dateKey <= endDate; dateKey = addDaysToDateKey(dateKey, 1)) dates.push(dateKey);
    const dailyRows = await Promise.all(dates.map(async dateKey => {
      const prefix = dateKey.slice(5).replace('-', '');
      const rangeQuery = query(
        collectionRef,
        where('orderNumber', '>=', prefix),
        where('orderNumber', '<=', `${prefix}\uf8ff`)
      );
      const snapshot = forceServer
        ? await getDocsFromServer(rangeQuery)
        : await getDocs(rangeQuery);
      return normalizeQueryRows(collectionName, snapshot);
    }));
    return mergeUniqueRows(dailyRows).filter(order => isOrderCreatedInRange(order, startDate, endDate));
  }

  const startPrefix = startDate.slice(5).replace('-', '');
  const endPrefix = endDate.slice(5).replace('-', '');
  const rangeQuery = query(
    collectionRef,
    where('orderNumber', '>=', startPrefix),
    where('orderNumber', '<=', `${endPrefix}\uf8ff`)
  );
  const snapshot = forceServer
    ? await getDocsFromServer(rangeQuery)
    : await getDocs(rangeQuery);
  return excludeDeletedRecords(normalizeQueryRows(collectionName, snapshot))
    .filter(order => isOrderCreatedInRange(order, startDate, endDate));
};

export const smartGetPosOrdersByCreatedDateRange = async (
  startDate: string,
  endDate: string,
  forceServer = false
) => {
  const collectionName = 'pos_orders';
  const storeCollectionPath = getStoreCollectionPath(collectionName);
  if (!storeCollectionPath || !isDateKey(startDate) || !isDateKey(endDate) || startDate > endDate) return [];

  const localFallback = () => excludeDeletedRecords(getFromLocalStorage(collectionName))
    .filter(order => isOrderCreatedInRange(order, startDate, endDate));
  try {
    const cloudRows = await getPosOrdersByOrderNumberRange(
      collection(db, storeCollectionPath),
      collectionName,
      startDate,
      endDate,
      forceServer && isOnline
    );
    return mergeCloudRangeWithPendingLocal(
      collectionName,
      cloudRows,
      order => isOrderCreatedInRange(order, startDate, endDate)
    );
  } catch (error) {
    if (!isExpectedOfflineReadError(error)) {
      console.error('Firestore POS order range read failed, reading local cache:', error);
    }
    return localFallback();
  }
};

export const smartGetPosOrdersByActivityDateRange = async (
  startDate: string,
  endDate: string,
  forceServer = false,
  storeIdOverride?: string,
  activityFieldsOverride?: string[],
  includeCreatedRecords = true
) => {
  const collectionName = storeIdOverride ? `stores/${storeIdOverride}/pos_orders` : 'pos_orders';
  const storeCollectionPath = getStoreCollectionPath(collectionName);
  if (!storeCollectionPath || !isDateKey(startDate) || !isDateKey(endDate) || startDate > endDate) return [];

  const activityFields = activityFieldsOverride?.length
    ? activityFieldsOverride
    : ['lastPaidAt', 'cancelledAt'];
  const isLocalActivityInRange = (order: any) => {
    if (includeCreatedRecords && isOrderCreatedInRange(order, startDate, endDate)) return true;
    return activityFields.some(fieldName => {
      const dateKey = getRecordDateKey(order?.[fieldName]);
      return dateKey >= startDate && dateKey <= endDate;
    });
  };
  const localFallback = () => excludeDeletedRecords(getFromLocalStorage(collectionName)).filter(isLocalActivityInRange);
  try {
    const collectionRef = collection(db, storeCollectionPath);
    const createdRowsPromise = includeCreatedRecords
      ? getPosOrdersByOrderNumberRange(
          collectionRef,
          collectionName,
          startDate,
          endDate,
          forceServer && isOnline
        )
      : Promise.resolve([] as any[]);
    const nextDate = addDaysToDateKey(endDate, 1);
    const timestampStart = Timestamp.fromDate(new Date(`${startDate}T00:00:00`));
    const timestampEnd = Timestamp.fromDate(new Date(`${nextDate}T00:00:00`));
    const stringStart = new Date(`${addDaysToDateKey(startDate, -1)}T00:00:00`).toISOString();
    const stringEnd = new Date(`${addDaysToDateKey(endDate, 2)}T00:00:00`).toISOString();
    const activityRowsPromises = activityFields.flatMap(fieldName => [
      query(collectionRef, where(fieldName, '>=', timestampStart), where(fieldName, '<', timestampEnd)),
      query(collectionRef, where(fieldName, '>=', stringStart), where(fieldName, '<', stringEnd)),
    ]).map(async rangeQuery => {
      const snapshot = forceServer && isOnline
        ? await getDocsFromServer(rangeQuery)
        : await getDocs(rangeQuery);
      return normalizeQueryRows(collectionName, snapshot);
    });
    const createdRows = await createdRowsPromise;
    const settledActivityRows = await Promise.allSettled(activityRowsPromises);
    const activityRows = settledActivityRows.flatMap(result =>
      result.status === 'fulfilled' ? result.value : []
    );
    const rows = mergeUniqueRows([createdRows, ...activityRows])
      .filter(isLocalActivityInRange);
    return mergeCloudRangeWithPendingLocal(collectionName, rows, isLocalActivityInRange);
  } catch (error) {
    if (!isExpectedOfflineReadError(error)) {
      console.error('Firestore POS activity range read failed, reading local cache:', error);
    }
    return localFallback();
  }
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
          setCollectionLocalCache(collectionName, activeData);
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
          setCollectionLocalCache(collectionName, mergedData);
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

type PosOrderSubscriptionCallback = (data: any[]) => void;

export interface PosReservationSubscriptionMetadata {
  authoritative: boolean;
  deletedOrderIds: string[];
}

interface SharedPosOrderSubscription {
  callbacks: Set<PosOrderSubscriptionCallback>;
  latestData: any[] | null;
  unsubscribe: () => void;
  active: boolean;
  fallbackRequested: boolean;
}

const sharedPosOrderSubscriptions = new Map<string, SharedPosOrderSubscription>();

export const smartSubscribeToPosOrdersByDatePrefix = (
  datePrefix: string,
  callback: (data: any[]) => void
) => {
  const storeId = dataService.getCurrentStoreId();
  const collectionName = storeId ? `stores/${storeId}/pos_orders` : 'pos_orders';
  const subscriptionKey = storeId ? `${storeId}:${datePrefix}` : '';
  const filterLocalOrders = () => excludeDeletedRecords(getFromLocalStorage(collectionName)).filter(order =>
    String(order?.orderNumber || '').startsWith(datePrefix)
  );

  try {
    if (!db || !FIRESTORE_ENABLED || !REALTIME_SYNC_ENABLED) {
      callback(filterLocalOrders());
      return () => {};
    }

    if (!storeId) {
      callback(filterLocalOrders());
      return () => {};
    }

    const existingSubscription = sharedPosOrderSubscriptions.get(subscriptionKey);
    if (existingSubscription) {
      existingSubscription.callbacks.add(callback);
      callback(existingSubscription.latestData ?? filterLocalOrders());
      return () => {
        existingSubscription.callbacks.delete(callback);
        if (existingSubscription.callbacks.size === 0) {
          existingSubscription.active = false;
          existingSubscription.unsubscribe();
          sharedPosOrderSubscriptions.delete(subscriptionKey);
        }
      };
    }

    const collectionRef = collection(db, 'stores', storeId, 'pos_orders');
    const orderQuery = query(
      collectionRef,
      where('orderNumber', '>=', datePrefix),
      where('orderNumber', '<=', `${datePrefix}\uf8ff`),
      orderBy('orderNumber', 'asc')
    );
    const subscription: SharedPosOrderSubscription = {
      callbacks: new Set([callback]),
      latestData: null,
      unsubscribe: () => {},
      active: true,
      fallbackRequested: false,
    };
    sharedPosOrderSubscriptions.set(subscriptionKey, subscription);
    const notifySubscribers = (data: any[]) => {
      if (!subscription.active) return;
      subscription.latestData = data;
      subscription.callbacks.forEach(subscriber => subscriber(data));
    };

    const loadRecentPosOrdersFallback = async () => {
      if (subscription.fallbackRequested) return;
      subscription.fallbackRequested = true;
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

        replaceLocalPosOrdersForDatePrefix(latestPrefix, fallbackData, storeId);
        notifySubscribers(fallbackData);
      } catch (error) {
        console.warn('POS recent order fallback failed:', error);
      }
    };

    let lastSerialized: string | null = null;
    const applyOrderSnapshot = (snapshot: any) => {
      if (!subscription.active) return;
      const data: any[] = [];
      snapshot.forEach((doc: any) => {
        data.push(normalizeRecordForCollection('pos_orders', convertTimestampsToLocalTime({ id: doc.id, ...doc.data() })));
      });

      const activeData = excludeDeletedRecords(data);
      const serialized = JSON.stringify(activeData);
      if (activeData.length > 0) {
        replaceLocalPosOrdersForDatePrefix(datePrefix, activeData, storeId);
      } else {
        console.warn('POS current-day order snapshot is empty; keeping local orders to avoid clearing an active terminal.');
        restoreLocalOrders();
        loadRecentPosOrdersFallback();
        return;
      }
      if (serialized === lastSerialized) {
        return;
      }
      lastSerialized = serialized;
      notifySubscribers(activeData);
    };

    const restoreLocalOrders = () => {
      const localOrders = filterLocalOrders();
      if (localOrders.length > 0) {
        notifySubscribers(localOrders);
      }
      return localOrders;
    };

    const restoredLocalOrders = restoreLocalOrders();
    let receivedServerSnapshot = false;
    let bootstrapTimer: ReturnType<typeof setTimeout> | null = null;

    const unsubscribeSnapshot = onSnapshot(
      orderQuery,
      (snapshot) => {
        if (snapshot.metadata.fromCache && navigator.onLine) {
          return;
        }
        receivedServerSnapshot = true;
        if (bootstrapTimer) {
          clearTimeout(bootstrapTimer);
          bootstrapTimer = null;
        }
        applyOrderSnapshot(snapshot);
      },
      (error) => {
        console.error('POS current-day order subscription failed:', error);
        restoreLocalOrders();
        loadRecentPosOrdersFallback();
      }
    );
    subscription.unsubscribe = () => {
      if (bootstrapTimer) clearTimeout(bootstrapTimer);
      unsubscribeSnapshot();
    };
    bootstrapTimer = setTimeout(() => {
      if (!subscription.active || receivedServerSnapshot) return;
      getDocsFromServer(orderQuery)
        .then(applyOrderSnapshot)
        .catch(error => {
          console.warn('POS current-day server bootstrap failed:', error);
          restoreLocalOrders();
          loadRecentPosOrdersFallback();
        });
    }, restoredLocalOrders.length > 0 ? 1800 : 1200);
    return () => {
      subscription.callbacks.delete(callback);
      if (subscription.callbacks.size === 0) {
        subscription.active = false;
        subscription.unsubscribe();
        sharedPosOrderSubscriptions.delete(subscriptionKey);
      }
    };
  } catch (error) {
    const failedSubscription = subscriptionKey ? sharedPosOrderSubscriptions.get(subscriptionKey) : null;
    if (failedSubscription) {
      failedSubscription.active = false;
      failedSubscription.unsubscribe();
      sharedPosOrderSubscriptions.delete(subscriptionKey);
    }
    console.error('POS current-day order subscription setup failed:', error);
    callback(filterLocalOrders());
    return () => {};
  }
};

export const smartSubscribeToPosReservations = (
  callback: (data: any[], metadata?: PosReservationSubscriptionMetadata) => void,
  closedDate: string = toLocalDateKey(new Date())
) => {
  const storeId = dataService.getCurrentStoreId();
  const collectionName = storeId ? `stores/${storeId}/pos_orders` : 'pos_orders';
  const targetClosedDate = /^\d{4}-\d{2}-\d{2}$/.test(closedDate)
    ? closedDate
    : toLocalDateKey(new Date());
  const filterLocalReservations = () => excludeDeletedRecords(getFromLocalStorage(collectionName))
    .filter(order => order?.orderType === 'reservation')
    .filter(order => order?.reservationOpen !== false || order?.reservationClosedDate === targetClosedDate);

  if (!db || !FIRESTORE_ENABLED || !REALTIME_SYNC_ENABLED || !storeId) {
    callback(filterLocalReservations());
    return () => {};
  }

  try {
    const collectionRef = collection(db, 'stores', storeId, 'pos_orders');
    const openQuery = query(collectionRef, where('reservationOpen', '==', true));
    const closedDateQuery = query(collectionRef, where('reservationClosedDate', '==', targetClosedDate));
    const openRows = new Map<string, any>();
    const closedRows = new Map<string, any>();
    let openLoaded = false;
    let closedLoaded = false;
    let lastSerialized: string | null = null;

    const notify = () => {
      const rowsById = new Map<string, any>();
      openRows.forEach((row, id) => rowsById.set(id, row));
      closedRows.forEach((row, id) => rowsById.set(id, row));
      const rows = Array.from(rowsById.values());
      const activeRows = excludeDeletedRecords(rows);
      const deletedOrderIds = rows
        .filter(order => order?.isDeleted)
        .map(order => String(order?.id || ''))
        .filter(Boolean);
      const serialized = JSON.stringify(activeRows);
      if (serialized === lastSerialized && deletedOrderIds.length === 0) return;
      lastSerialized = serialized;
      callback(activeRows, {
        authoritative: openLoaded && closedLoaded,
        deletedOrderIds,
      });
    };

    const applySnapshot = (target: Map<string, any>, snapshot: any) => {
      target.clear();
      snapshot.forEach((snapshotDoc: any) => {
        const row = normalizeRecordForCollection(
          'pos_orders',
          convertTimestampsToLocalTime({ id: snapshotDoc.id, ...snapshotDoc.data() })
        );
        target.set(row.id, row);
      });
    };

    callback(filterLocalReservations());
    const unsubscribeOpen = onSnapshot(
      openQuery,
      snapshot => {
        if (snapshot.metadata.fromCache && navigator.onLine) return;
        applySnapshot(openRows, snapshot);
        openLoaded = true;
        notify();
      },
      error => {
        console.error('POS open reservation subscription failed:', error);
        callback(filterLocalReservations());
      }
    );
    const unsubscribeClosed = onSnapshot(
      closedDateQuery,
      snapshot => {
        if (snapshot.metadata.fromCache && navigator.onLine) return;
        applySnapshot(closedRows, snapshot);
        closedLoaded = true;
        notify();
      },
      error => {
        console.error('POS closed reservation subscription failed:', error);
        callback(filterLocalReservations());
      }
    );

    return () => {
      unsubscribeOpen();
      unsubscribeClosed();
    };
  } catch (error) {
    console.error('POS reservation subscription setup failed:', error);
    callback(filterLocalReservations());
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
    setCollectionLocalCache(collectionName, updated);
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
    setCollectionLocalCache(collectionName, next);
  } catch (error) {
    console.error('localStorage update failed:', error);
  }
};

const deleteFromLocalStorage = (collectionName: string, id: string) => {
  try {
    const existing = getFromLocalStorage(collectionName);
    const updated = existing.filter(item => item.id !== id);
    setCollectionLocalCache(collectionName, updated);
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

  schedulePendingSyncRetry();
  return { id, ...data, success: false, pending: true, offline: !isOnline };
};

const fallbackToLocalSet = (collectionName: string, id: string, data: any) => {
  saveToLocalStorage(collectionName, { ...data, id }, id);

  savePendingChange({
    id,
    collection: collectionName,
    operation: 'update',
    data,
    timestamp: Date.now(),
  });
  schedulePendingSyncRetry();
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
  schedulePendingSyncRetry();
};

const hasPendingRemoteConflict = (collectionName: string, docId: string, localData: any, remoteData: any): boolean => {
  if (!remoteData || collectionName === 'pos_orders') return false;
  const remoteVersion = getRecordVersion(remoteData);
  const localVersion = getRecordVersion(localData);
  return remoteVersion > localVersion;
};

const syncPendingPosOrderUpdate = async (change: PendingChange, collectionPath: string) => {
  let conflictToSave: Record<string, any> | null = null;
  let skippedBecauseRemoteIsTerminal = false;

  const result = await runTransaction(db, async transaction => {
    const updateDocRef = doc(db, collectionPath, change.id);
    const snapshot = await transaction.get(updateDocRef);
    const remoteData = snapshot.exists() ? snapshot.data() : {};
    const localData = change.data || {};

    if (remoteData?.isDeleted) {
      return {
        success: true,
        skipped: true,
        reason: 'remote-deleted-order',
        remoteData: normalizeRecordForCollection(change.collection, { id: change.id, ...remoteData }),
      };
    }

    const localTerminal = isTerminalPosOrderRecord(localData);
    const remoteTerminal = isTerminalPosOrderRecord(remoteData);

    if (hasTerminalStatusConflict(remoteData, localData)) {
      skippedBecauseRemoteIsTerminal = true;
      return {
        success: true,
        skipped: true,
        reason: 'remote-terminal-order-conflict',
        remoteData: normalizeRecordForCollection(change.collection, { id: change.id, ...remoteData }),
      };
    }

    if (remoteTerminal && !localTerminal) {
      skippedBecauseRemoteIsTerminal = true;
      return {
        success: true,
        skipped: true,
        reason: 'remote-terminal-order',
        remoteData: normalizeRecordForCollection(change.collection, { id: change.id, ...remoteData }),
      };
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

    const resolvedData = await resolvePosOrderNumberForCloudTransaction(transaction, localData, remoteData);
    const normalizedResolvedData = normalizeRecordForCollection(change.collection, { ...resolvedData, id: change.id });
    transaction.set(updateDocRef, toFirestoreData(normalizedResolvedData), { merge: true });
    return { success: true, remoteData: normalizedResolvedData };
  });

  if (result?.remoteData) {
    updateInLocalStorage(change.collection, change.id, result.remoteData);
  }

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

const syncPendingGenericUpdate = async (change: PendingChange, collectionPath: string) => {
  const updateDocRef = doc(db, collectionPath, change.id);
  const snapshot = await getDoc(updateDocRef);
  const remoteData = snapshot.exists() ? { id: change.id, ...snapshot.data() } : null;
  const localData = { ...change.data, id: change.id };

  if (hasPendingRemoteConflict(change.collection, change.id, localData, remoteData)) {
    saveSyncConflict({
      collection: change.collection,
      docId: change.id,
      type: 'remote-newer-than-local-pending-write',
      localVersion: getRecordVersion(localData),
      remoteVersion: getRecordVersion(remoteData),
    });
    return { success: false, conflict: true };
  }

  await setDoc(updateDocRef, toFirestoreData(localData), { merge: true });
  return { success: true };
};

const syncPendingPurchaseBatch = async (change: PendingChange) => {
  const batch = change.data?.__purchaseBatch;
  const storeId = change.storeId || getCurrentStoreId();
  if (!batch || !storeId) throw new Error('invalid-purchase-batch');

  const orderForFirestore = normalizePurchaseOrderDateFields(batch.order);
  const stockRecordsForFirestore = batch.stockRecords.map(normalizePurchaseStockRecordDateFields);
  const orderRef = doc(db, `stores/${storeId}/purchase_orders`, batch.order.id);
  const inventoryRefs = batch.inventoryIncrements.map((item: PurchaseInventoryIncrement) => (
    doc(db, `stores/${storeId}/inventory_items`, item.itemId)
  ));

  return runTransaction(db, async transaction => {
    const [orderSnapshot, ...inventorySnapshots] = await Promise.all([
      transaction.get(orderRef),
      ...inventoryRefs.map((inventoryRef: any) => transaction.get(inventoryRef)),
    ]);
    const remoteOrder = orderSnapshot.exists() ? orderSnapshot.data() : {};
    if (remoteOrder.purchaseBatchOperationId === batch.operationId) {
      transaction.set(orderRef, toFirestoreData({
        orderDate: orderForFirestore.orderDate,
        receivedDate: orderForFirestore.receivedDate,
      }), { merge: true });
      return { success: true, duplicate: true };
    }

    transaction.set(orderRef, toFirestoreData({
      ...orderForFirestore,
      id: batch.order.id,
      purchaseBatchOperationId: batch.operationId,
    }, true), { merge: true });

    batch.inventoryIncrements.forEach((item: PurchaseInventoryIncrement, index: number) => {
      const currentData = inventorySnapshots[index]?.exists() ? inventorySnapshots[index].data() : {};
      const appliedIds = Array.isArray(currentData.appliedIncrementOperationIds)
        ? currentData.appliedIncrementOperationIds
        : [];
      if (appliedIds.includes(item.operationId)) return;

      transaction.set(inventoryRefs[index], {
        id: item.itemId,
        currentStock: increment(item.quantity),
        lastModified: item.lastModified,
        lastUpdated: toFirestoreData({ value: item.lastUpdated }).value,
        appliedIncrementOperationIds: arrayUnion(item.operationId),
      }, { merge: true });
    });

    stockRecordsForFirestore.forEach((record: any) => {
      const recordRef = doc(db, `stores/${storeId}/inventory_stock_records`, record.id);
      transaction.set(recordRef, toFirestoreData({ ...record, id: record.id }, true), { merge: true });
    });
    if (batch.expense) {
      const expenseRef = doc(db, `stores/${storeId}/expenses`, batch.expense.id);
      transaction.set(expenseRef, toFirestoreData({ ...batch.expense, id: batch.expense.id }, true), { merge: true });
    }
    if (batch.supplierUpdate) {
      const supplierRef = doc(db, `stores/${storeId}/suppliers`, batch.supplierUpdate.id);
      transaction.set(supplierRef, toFirestoreData({
        balance: batch.supplierUpdate.balance,
        lastUpdated: batch.supplierUpdate.lastUpdated,
        lastModified: batch.supplierUpdate.lastModified,
      }), { merge: true });
    }

    return { success: true };
  });
};

async function syncPurchaseBatchImmediately(change: PendingChange): Promise<SmartWriteResult> {
  if (!FIRESTORE_ENABLED || !isOnline) {
    return { success: true, pending: true, offline: true, localFirst: true };
  }

  try {
    await withWeakNetworkTimeout(
      () => syncPendingPurchaseBatch(change),
      `purchase-batch:${change.id}`,
      PURCHASE_IMMEDIATE_SYNC_TIMEOUT_MS
    );
    setPendingChanges(getPendingChanges().filter(pendingChange => pendingChange.id !== change.id));
    isOnline = true;
    return { success: true, cloudSynced: true, localFirst: true };
  } catch (error) {
    return {
      success: true,
      pending: true,
      weakNetworkFallback: isWeakNetworkTimeout(error),
      error,
      localFirst: true,
    };
  }
}


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
          if (change.data?.__purchaseBatch) {
            await syncPendingPurchaseBatch(change);
          } else if (change.data?.__fridgeTransfer) {
            const result = await smartTransferFridgeStock({
              ...change.data.__fridgeTransfer,
              operationId: change.id,
              allowPendingFallback: false,
            });
            if (!result.success) {
              throw new Error(`pending-fridge-transfer-failed:${change.id}:${String((result as any).error || 'unknown')}`);
            }
          } else if (change.collection === 'pos_orders') {
            const result = await syncPendingPosOrderUpdate(change, collectionPath);
            if (result?.success === false) {
              failedChanges.push({
                ...change,
                status: 'conflict',
                lastAttemptAt: Date.now(),
                error: String(result?.reason || 'pos-order-conflict'),
              });
              continue;
            }
          } else if (change.data?.__increment) {
            const { fieldName, amount } = change.data.__increment;
            const operationId = change.data.__increment.operationId || `pending-${change.collection}-${change.id}-${change.timestamp}`;
            const { __increment, ...rest } = change.data;
            if (await shouldSkipPendingStockIncrement(change, collectionPath, operationId)) {
              break;
            }
            await applyIdempotentIncrement(collectionPath, change.id, fieldName, amount, rest, operationId);
          } else {
            const result = await syncPendingGenericUpdate(change, collectionPath);
            if (result.conflict) {
              failedChanges.push({
                ...change,
                status: 'conflict',
                lastAttemptAt: Date.now(),
                error: 'remote-newer-than-local-pending-write',
              });
              continue;
            }
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
  const collectionKey = getCollectionKey(collectionName);
  const storeCollectionPath = `stores/${storeId}/${collectionKey}`;
  if (isOnline) {
    try {
      const querySnapshot = await getDocs(collection(db, storeCollectionPath));
      const data = querySnapshot.docs.map(doc => {
        const rawData = {
          id: doc.id,
          ...doc.data(),
        };
        return convertTimestampsToLocalTime(rawData);
      });
      setCollectionLocalCache(storeCollectionPath, data);
      return data;
    } catch (error) {
      console.error('Firestore store query failed:', error);
      return getFromLocalStorage(storeCollectionPath);
    }
  } else {
    return getFromLocalStorage(storeCollectionPath);
  }
};

export const smartSubscribeToStoreCollection = (
  collectionName: string,
  storeId: string,
  callback: (data: any[]) => void
) => {
  const collectionKey = getCollectionKey(collectionName);
  const storeCollectionPath = `stores/${storeId}/${collectionKey}`;
  if (!isOnline) {
    const localData = getFromLocalStorage(storeCollectionPath);
    callback(localData);
    return () => {};
  }

  try {
    const q = query(
      collection(db, storeCollectionPath),
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

      setCollectionLocalCache(storeCollectionPath, data);
      callback(data);
    }, (error) => {
      console.error('Store subscription failed:', error);
      const localData = getFromLocalStorage(storeCollectionPath);
      callback(localData);
    });
  } catch (error) {
    console.error('Store data query failed:', error);
    const localData = getFromLocalStorage(storeCollectionPath);
    callback(localData);
    return () => {};
  }
};
