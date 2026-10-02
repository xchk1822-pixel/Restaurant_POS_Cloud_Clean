import { doc, runTransaction } from 'firebase/firestore';
import { db } from '../firebase';
import { dataService } from './DataService';
import {
  smartGetDocument,
  smartGetDocuments,
  smartSetDocument,
  smartUpdateDocument,
} from './smartSyncService';
import {
  ACTIVE_PROMOTION_SETTINGS_ID,
  CustomerPromotionSettings,
  CustomerPromotionReward,
  getDefaultPromotionSettings,
  normalizePromotionSettings,
  getPromotionRewardAmount,
  getPromotionRewardLabel,
  getPromotionRedemptionDiscount,
  getPromotionRedemptionError,
  getRewardStatusForOrder,
  PromotionOrderLike,
  PromotionRedemptionOrderLike,
  selectLatestPromotionSettings,
  selectPlannedPromotionPrize,
} from '../utils/customerPromotion';
import { normalizeCustomerPhone } from '../utils/customerRecords';

interface PromotionClaimResult {
  reward: CustomerPromotionReward;
  duplicate: boolean;
  pendingSync: boolean;
}

export interface PromotionRedemptionResult {
  reward: CustomerPromotionReward;
  order: PromotionRedemptionOrderLike;
  duplicate: boolean;
  pendingSync: boolean;
}

export interface PromotionCustomerRecord {
  id: string;
  name: string;
  phone: string;
  phoneKey?: string;
  [key: string]: unknown;
}

interface PromotionCustomerBindingResult {
  customer: PromotionCustomerRecord;
  order: PromotionOrderLike;
  pendingSync: boolean;
}

const cacheReward = (reward: CustomerPromotionReward) => {
  const key = dataService.getStoreKey('customer_rewards');
  let records: CustomerPromotionReward[] = [];
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || '[]');
    records = Array.isArray(parsed) ? parsed : [];
  } catch {
    records = [];
  }
  localStorage.setItem(key, JSON.stringify([
    ...records.filter(item => item.id !== reward.id),
    reward,
  ]));
};

const isBusinessError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error || '');
  return [
    'promotion-duplicate',
    'promotion-daily-limit',
    'promotion-invalid-order',
    'promotion-customer-mismatch',
    'promotion-prize-over-order',
    'reward-not-available',
    'invalid-redemption-order',
    'redemption-customer-mismatch',
    'redemption-source-order',
    'order-already-has-reward',
    'redemption-order-paid',
    'redemption-order-too-small',
  ].includes(message);
};

const cacheCollectionRecord = (collectionName: string, record: Record<string, unknown>) => {
  const key = dataService.getStoreKey(collectionName);
  let records: Record<string, unknown>[] = [];
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || '[]');
    records = Array.isArray(parsed) ? parsed : [];
  } catch {
    records = [];
  }
  localStorage.setItem(key, JSON.stringify([
    ...records.filter(item => item.id !== record.id),
    record,
  ]));
};

const shouldUseOfflineFallback = (error: any): boolean => {
  if (!navigator.onLine) return true;
  const code = String(error?.code || '');
  if (code.includes('permission-denied') || code.includes('unauthenticated')) return false;
  return !isBusinessError(error);
};

const getStableSelectionValue = (value: string): number => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967296;
};

export const getPromotionTerminalId = (storeId: string): string => {
  const key = `customer_promotion_terminal_${storeId}`;
  const existing = localStorage.getItem(key);
  if (existing) return existing;
  const generated = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  ).replace(/[^a-z0-9]/gi, '').slice(-10).toUpperCase();
  localStorage.setItem(key, generated);
  return generated;
};

export const loadCustomerPromotionSettings = async (
  dateKey: string,
  forceServer = true
): Promise<CustomerPromotionSettings> => {
  const activeSettings = await smartGetDocument(
    'customer_promotion_settings',
    ACTIVE_PROMOTION_SETTINGS_ID,
    forceServer
  );
  if (activeSettings) return normalizePromotionSettings(activeSettings, dateKey);

  const legacyRows = await smartGetDocuments('customer_promotion_settings', forceServer);
  const legacySettings = selectLatestPromotionSettings(legacyRows as CustomerPromotionSettings[]);
  if (!legacySettings) return getDefaultPromotionSettings(dateKey);

  const migratedSettings = normalizePromotionSettings(legacySettings, dateKey);
  await smartSetDocument(
    'customer_promotion_settings',
    ACTIVE_PROMOTION_SETTINGS_ID,
    migratedSettings
  );
  return migratedSettings;
};

export const bindPromotionOrderCustomer = async (
  order: PromotionOrderLike,
  customer: PromotionCustomerRecord,
  operator: string
): Promise<PromotionCustomerBindingResult> => {
  const storeId = dataService.getCurrentStoreId();
  if (!storeId) throw new Error('promotion-missing-store');

  const phoneKey = normalizeCustomerPhone(customer.phoneKey || customer.phone);
  if (!phoneKey || !customer.id || !customer.name.trim()) throw new Error('promotion-invalid-customer');

  let authoritativeOrder: PromotionOrderLike = order;
  if (navigator.onLine) {
    try {
      const cloudOrder = await smartGetDocument('pos_orders', order.id, true);
      if (cloudOrder) authoritativeOrder = { ...order, ...cloudOrder } as PromotionOrderLike;
    } catch {
      // The local-first write below remains available when the cloud cannot be reached.
    }
  }

  if (authoritativeOrder.status === 'draft' || authoritativeOrder.status === 'cancelled') {
    throw new Error('promotion-invalid-order');
  }
  if (authoritativeOrder.customerId && authoritativeOrder.customerId !== customer.id) {
    throw new Error('promotion-order-already-bound');
  }

  const linkedAt = new Date().toISOString();
  const customerForWrite: PromotionCustomerRecord = {
    ...customer,
    name: customer.name.trim(),
    phone: customer.phone.trim(),
    phoneKey,
    storeId,
    updatedAt: linkedAt,
  };
  const orderForWrite: PromotionOrderLike = {
    ...authoritativeOrder,
    customerId: customerForWrite.id,
    customerName: customerForWrite.name,
    customerPhoneKey: phoneKey,
    customerLinkedAt: linkedAt,
    customerLinkedBy: operator,
    customerLinkSource: 'promotion',
  } as PromotionOrderLike;

  const customerWrite = await smartSetDocument('customers', customerForWrite.id, customerForWrite);
  if (!customerWrite.success && !customerWrite.pending) throw new Error('promotion-local-save-failed');

  const orderWrite = await smartUpdateDocument('pos_orders', order.id, orderForWrite);
  if (!orderWrite.success && !orderWrite.pending) throw new Error('promotion-local-save-failed');

  return {
    customer: customerForWrite,
    order: (orderWrite.remoteData || orderForWrite) as PromotionOrderLike,
    pendingSync: Boolean(customerWrite.pending || orderWrite.pending),
  };
};

export const claimCustomerPromotionReward = async (
  proposedReward: CustomerPromotionReward,
  order: PromotionOrderLike
): Promise<PromotionClaimResult> => {
  const storeId = dataService.getCurrentStoreId();
  if (!storeId) throw new Error('promotion-missing-store');

  const reward: CustomerPromotionReward = {
    ...proposedReward,
    storeId,
    pendingSync: false,
  };

  if (navigator.onLine) {
    try {
      const result = await runTransaction(db, async transaction => {
        const rewardRef = doc(db, `stores/${storeId}/customer_rewards`, reward.id);
        const orderRef = doc(db, `stores/${storeId}/pos_orders`, order.id);
        const customerRef = doc(db, `stores/${storeId}/customers`, reward.customerId);
        const settingsRef = doc(db, `stores/${storeId}/customer_promotion_settings`, ACTIVE_PROMOTION_SETTINGS_ID);
        const legacySettingsRef = doc(db, `stores/${storeId}/customer_promotion_settings`, reward.dateKey);
        const [rewardSnapshot, orderSnapshot, customerSnapshot, settingsSnapshot, legacySettingsSnapshot] = await Promise.all([
          transaction.get(rewardRef),
          transaction.get(orderRef),
          transaction.get(customerRef),
          transaction.get(settingsRef),
          transaction.get(legacySettingsRef),
        ]);

        if (rewardSnapshot.exists()) {
          return {
            reward: rewardSnapshot.data() as CustomerPromotionReward,
            duplicate: true,
          };
        }
        if (!orderSnapshot.exists() || !customerSnapshot.exists()) throw new Error('promotion-invalid-order');

        const cloudOrder = orderSnapshot.data() as PromotionOrderLike;
        if (!cloudOrder.customerId || cloudOrder.customerId !== reward.customerId) {
          throw new Error('promotion-customer-mismatch');
        }
        if (cloudOrder.status === 'draft' || cloudOrder.status === 'cancelled') {
          throw new Error('promotion-invalid-order');
        }
        const cloudOrderAmount = Number(cloudOrder.totalAmount || 0);
        const authoritativeSettings = normalizePromotionSettings(
          settingsSnapshot.exists()
            ? settingsSnapshot.data()
            : legacySettingsSnapshot.exists()
              ? legacySettingsSnapshot.data()
              : getDefaultPromotionSettings(reward.dateKey),
          reward.dateKey
        );
        if (cloudOrderAmount < Number(authoritativeSettings.minimumOrderAmount || 0)) {
          throw new Error('promotion-invalid-order');
        }
        const counterRefs = authoritativeSettings.prizes.map(prize => (
          doc(db, `stores/${storeId}/customer_promotion_counters`, `${reward.dateKey}_${prize.id}`)
        ));
        const counterSnapshots = await Promise.all(counterRefs.map(counterRef => transaction.get(counterRef)));
        const usedCounts = Object.fromEntries(authoritativeSettings.prizes.map((prize, index) => {
          const snapshot = counterSnapshots[index];
          return [prize.id, snapshot?.exists() ? Number(snapshot.data().count || 0) : 0];
        }));
        const authoritativePrize = selectPlannedPromotionPrize(
          authoritativeSettings,
          cloudOrderAmount,
          usedCounts,
          getStableSelectionValue(`${storeId}:${reward.dateKey}:${reward.orderId}:${reward.code}:${authoritativeSettings.updatedAt || ''}`)
        );
        if (!authoritativePrize) throw new Error('promotion-daily-limit');
        const authoritativeAmount = getPromotionRewardAmount(authoritativePrize, cloudOrderAmount);
        const authoritativeLabel = getPromotionRewardLabel(authoritativePrize);
        if (cloudOrderAmount <= 0) throw new Error('promotion-prize-over-order');

        const prizeIndex = authoritativeSettings.prizes.findIndex(prize => prize.id === authoritativePrize.id);
        const counterRef = counterRefs[prizeIndex];
        const currentCount = Number(usedCounts[authoritativePrize.id] || 0);

        const verifiedReward: CustomerPromotionReward = {
          ...reward,
          customerName: String(customerSnapshot.data().name || reward.customerName),
          orderNumber: String(cloudOrder.orderNumber || reward.orderNumber),
          orderAmount: cloudOrderAmount,
          prizeId: authoritativePrize.id,
          prizeType: authoritativePrize.type,
          rewardAmount: authoritativeAmount,
          rewardLabel: authoritativeLabel,
          ...(authoritativePrize.menuItemId ? { menuItemId: authoritativePrize.menuItemId } : {}),
          status: getRewardStatusForOrder(cloudOrder.status),
        };

        transaction.set(rewardRef, verifiedReward);
        transaction.set(counterRef, {
          id: `${reward.dateKey}_${reward.prizeId}`,
          dateKey: reward.dateKey,
          prizeId: reward.prizeId,
          count: currentCount + 1,
          updatedAt: reward.drawnAt,
          storeId,
        }, { merge: true });
        return { reward: verifiedReward, duplicate: false };
      });

      cacheReward(result.reward);
      return { ...result, pendingSync: false };
    } catch (error) {
      if (!shouldUseOfflineFallback(error)) throw error;
    }
  }

  const offlineReward = { ...reward, pendingSync: true };
  const writeResult = await smartSetDocument('customer_rewards', reward.id, offlineReward, { localFirst: true });
  if (!writeResult.success) throw new Error('promotion-local-save-failed');
  return { reward: offlineReward, duplicate: false, pendingSync: true };
};

export const redeemCustomerPromotionReward = async (
  reward: CustomerPromotionReward,
  targetOrder: PromotionRedemptionOrderLike,
  operator: string,
  rewardItem?: Record<string, unknown>
): Promise<PromotionRedemptionResult> => {
  const storeId = dataService.getCurrentStoreId();
  if (!storeId) throw new Error('promotion-missing-store');

  const buildRedemption = (
    authoritativeReward: CustomerPromotionReward,
    authoritativeOrder: PromotionRedemptionOrderLike
  ) => {
    const redeemedAt = new Date().toISOString();
    const discount = getPromotionRedemptionDiscount(authoritativeReward, authoritativeOrder);
    const existingItems = Array.isArray(authoritativeOrder.items) ? authoritativeOrder.items : [];
    const shouldAddRewardItem = Boolean(
      rewardItem &&
      (authoritativeReward.prizeType === 'dish' || authoritativeReward.prizeType === 'gift') &&
      !existingItems.some(item => item.promotionRewardId === authoritativeReward.id)
    );
    const updatedReward: CustomerPromotionReward = {
      ...authoritativeReward,
      status: 'redeemed',
      pendingSync: false,
      redeemedAt,
      redeemedOrderId: authoritativeOrder.id,
      redeemedOrderNumber: authoritativeOrder.orderNumber || authoritativeOrder.id,
      redeemedBy: operator,
    };
    const updatedOrder: PromotionRedemptionOrderLike = {
      ...authoritativeOrder,
      ...(shouldAddRewardItem ? { items: [...existingItems, rewardItem!] } : {}),
      totalAmount: Number((Number(authoritativeOrder.totalAmount || 0) - discount).toFixed(2)),
      promotionOriginalTotalAmount: Number(
        authoritativeOrder.promotionOriginalTotalAmount || authoritativeOrder.totalAmount || 0
      ),
      promotionRewardId: authoritativeReward.id,
      promotionRewardCode: authoritativeReward.code,
      promotionRewardLabel: authoritativeReward.rewardLabel,
      promotionRewardType: authoritativeReward.prizeType,
      promotionRewardAmount: authoritativeReward.rewardAmount,
      promotionDiscount: discount,
      promotionRedeemedAt: redeemedAt,
      promotionRedeemedBy: operator,
      lastModified: Date.now(),
    } as PromotionRedemptionOrderLike;
    return { updatedReward, updatedOrder };
  };

  if (navigator.onLine) {
    try {
      const result = await runTransaction(db, async transaction => {
        const rewardRef = doc(db, `stores/${storeId}/customer_rewards`, reward.id);
        const orderRef = doc(db, `stores/${storeId}/pos_orders`, targetOrder.id);
        const [rewardSnapshot, orderSnapshot] = await Promise.all([
          transaction.get(rewardRef),
          transaction.get(orderRef),
        ]);
        if (!rewardSnapshot.exists() || !orderSnapshot.exists()) throw new Error('invalid-redemption-order');

        const cloudReward = rewardSnapshot.data() as CustomerPromotionReward;
        const cloudOrder = { id: orderSnapshot.id, ...orderSnapshot.data() } as PromotionRedemptionOrderLike;
        if (
          cloudReward.status === 'redeemed' &&
          cloudReward.redeemedOrderId === cloudOrder.id &&
          cloudOrder.promotionRewardId === cloudReward.id
        ) {
          return { reward: cloudReward, order: cloudOrder, duplicate: true };
        }
        const validationError = getPromotionRedemptionError(cloudReward, cloudOrder);
        if (validationError) throw new Error(validationError);

        const { updatedReward, updatedOrder } = buildRedemption(cloudReward, cloudOrder);
        transaction.set(rewardRef, updatedReward, { merge: true });
        transaction.set(orderRef, updatedOrder, { merge: true });
        return { reward: updatedReward, order: updatedOrder, duplicate: false };
      });

      cacheReward(result.reward);
      cacheCollectionRecord('pos_orders', result.order as unknown as Record<string, unknown>);
      return { ...result, pendingSync: false };
    } catch (error) {
      if (!shouldUseOfflineFallback(error)) throw error;
    }
  }

  const validationError = getPromotionRedemptionError(reward, targetOrder);
  if (validationError) throw new Error(validationError);
  const { updatedReward, updatedOrder } = buildRedemption(reward, targetOrder);
  updatedReward.pendingSync = true;

  const orderWrite = await smartUpdateDocument('pos_orders', targetOrder.id, updatedOrder, { localFirst: true });
  if (!orderWrite.success && !orderWrite.pending) throw new Error('promotion-local-save-failed');
  const rewardWrite = await smartUpdateDocument('customer_rewards', reward.id, updatedReward, { localFirst: true });
  if (!rewardWrite.success && !rewardWrite.pending) throw new Error('promotion-local-save-failed');

  return {
    reward: updatedReward,
    order: (orderWrite.remoteData || updatedOrder) as PromotionRedemptionOrderLike,
    duplicate: false,
    pendingSync: true,
  };
};
