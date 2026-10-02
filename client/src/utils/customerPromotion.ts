import { toLocalDateKey } from './localTime';

export type PromotionPrizeType = 'fixed' | 'dish' | 'gift' | 'full_order';
export type PromotionRewardStatus = 'pending' | 'available' | 'redeemed' | 'void';

export const ACTIVE_PROMOTION_SETTINGS_ID = 'active';

export interface CustomerPromotionPrize {
  id: string;
  type: PromotionPrizeType;
  amount: number;
  label?: string;
  menuItemId?: string;
  probability: number;
  active: boolean;
  color: string;
}

export interface CustomerPromotionSettings {
  id: string;
  dateKey: string;
  minimumOrderAmount: number;
  expectedDailyDraws: number;
  prizes: CustomerPromotionPrize[];
  updatedAt?: string;
  updatedBy?: string;
}

export interface PromotionOrderLike {
  id: string;
  orderNumber?: string;
  customerId?: string;
  customerName?: string;
  totalAmount: number;
  status: string;
  createdAt: unknown;
}

export interface CustomerPromotionReward {
  id: string;
  storeId?: string;
  customerId: string;
  customerName: string;
  orderId: string;
  orderNumber: string;
  orderAmount: number;
  prizeId: string;
  prizeType: PromotionPrizeType;
  rewardAmount: number;
  rewardLabel: string;
  menuItemId?: string;
  status: PromotionRewardStatus;
  dateKey: string;
  code: string;
  drawnAt: string;
  drawnBy: string;
  terminalId: string;
  pendingSync?: boolean;
  availableAt?: string;
  voidedAt?: string;
  redeemedAt?: string;
  redeemedOrderId?: string;
  redeemedOrderNumber?: string;
  redeemedBy?: string;
}

export interface PromotionRedemptionOrderLike extends PromotionOrderLike {
  items?: Array<Record<string, unknown>>;
  paymentStatus?: string;
  paidAmount?: number;
  settledAmount?: number;
  promotionRewardId?: string;
  promotionOriginalTotalAmount?: number;
  promotionDiscount?: number;
}

const DEFAULT_PRIZES: CustomerPromotionPrize[] = [
  { id: 'fixed_10', type: 'fixed', amount: 10, probability: 35, active: true, color: '#be2530' },
  { id: 'fixed_20', type: 'fixed', amount: 20, probability: 28, active: true, color: '#0f8179' },
  { id: 'fixed_50', type: 'fixed', amount: 50, probability: 20, active: true, color: '#e4a521' },
  { id: 'fixed_100', type: 'fixed', amount: 100, probability: 10, active: true, color: '#2666c7' },
  { id: 'fixed_200', type: 'fixed', amount: 200, probability: 5, active: true, color: '#7c2d8f' },
  { id: 'full_order', type: 'full_order', amount: 0, probability: 2, active: true, color: '#15885a' },
];

export const getDefaultPromotionSettings = (dateKey: string): CustomerPromotionSettings => ({
  id: ACTIVE_PROMOTION_SETTINGS_ID,
  dateKey,
  minimumOrderAmount: 0,
  expectedDailyDraws: 60,
  prizes: DEFAULT_PRIZES.map(prize => ({ ...prize })),
});

export const normalizePromotionSettings = (
  settings: Partial<CustomerPromotionSettings> | undefined,
  dateKey: string
): CustomerPromotionSettings => ({
  ...getDefaultPromotionSettings(dateKey),
  ...settings,
  id: ACTIVE_PROMOTION_SETTINGS_ID,
  dateKey,
  expectedDailyDraws: Math.max(1, Math.round(Number(settings?.expectedDailyDraws || 60))),
  prizes: Array.isArray(settings?.prizes)
    ? settings!.prizes!.map(prize => {
      const {
        minSpend: _legacyMinSpend,
        dailyLimit: _legacyDailyLimit,
        ...normalizedPrize
      } = prize as CustomerPromotionPrize & { minSpend?: number; dailyLimit?: number };
      return normalizedPrize;
    })
    : getDefaultPromotionSettings(dateKey).prizes,
});

export const selectLatestPromotionSettings = (
  rows: Partial<CustomerPromotionSettings>[]
): Partial<CustomerPromotionSettings> | undefined => [...rows]
  .filter(row => row && row.id !== ACTIVE_PROMOTION_SETTINGS_ID)
  .sort((left, right) => {
    const leftUpdatedAt = Date.parse(String(left.updatedAt || '')) || 0;
    const rightUpdatedAt = Date.parse(String(right.updatedAt || '')) || 0;
    if (leftUpdatedAt !== rightUpdatedAt) return rightUpdatedAt - leftUpdatedAt;
    const leftKey = String(left.dateKey || left.id || '');
    const rightKey = String(right.dateKey || right.id || '');
    return rightKey.localeCompare(leftKey);
  })[0];

export const buildPromotionRewardId = (orderId: string): string => (
  `promo_${String(orderId || '').replace(/[^a-zA-Z0-9_-]/g, '_')}`
);

export const isPromotionOrderCandidate = (
  order: PromotionOrderLike,
  dateKey: string,
  minimumOrderAmount = 0
): boolean => {
  if (!order?.id || Number(order.totalAmount) <= 0) return false;
  if (Number(order.totalAmount) < Math.max(0, Number(minimumOrderAmount || 0))) return false;
  if (order.status === 'draft' || order.status === 'cancelled') return false;
  return toLocalDateKey(order.createdAt) === dateKey;
};

export const isPromotionOrderEligible = (
  order: PromotionOrderLike,
  dateKey: string,
  rewards: CustomerPromotionReward[] = [],
  minimumOrderAmount = 0
): boolean => {
  if (!order.customerId || !isPromotionOrderCandidate(order, dateKey, minimumOrderAmount)) return false;
  return !rewards.some(reward => reward.orderId === order.id);
};

export const getRewardStatusForOrder = (status: string): PromotionRewardStatus => {
  if (status === 'cancelled') return 'void';
  if (status === 'completed') return 'available';
  return 'pending';
};

export const getEligiblePromotionPrizes = (
  settings: CustomerPromotionSettings,
  orderAmount: number,
  rewards: CustomerPromotionReward[]
): CustomerPromotionPrize[] => {
  const plan = getPromotionPrizePlan(settings);
  return settings.prizes.filter(prize => {
  if (
    !prize.active || prize.probability <= 0 ||
    orderAmount < Number(settings.minimumOrderAmount || 0)
  ) return false;
  if (prize.type === 'fixed' && prize.amount > orderAmount) return false;
  const usedToday = rewards.filter(reward => (
    reward.dateKey === settings.dateKey &&
    reward.prizeId === prize.id &&
    reward.status !== 'void'
  )).length;
    return usedToday < Math.max(0, Number(plan[prize.id] || 0));
  });
};

export const selectWeightedPromotionPrize = (
  prizes: CustomerPromotionPrize[],
  randomValue: number
): CustomerPromotionPrize | null => {
  const total = prizes.reduce((sum, prize) => sum + Math.max(0, prize.probability), 0);
  if (total <= 0 || prizes.length === 0) return null;
  let cursor = Math.min(Math.max(randomValue, 0), 0.999999999) * total;
  for (const prize of prizes) {
    cursor -= Math.max(0, prize.probability);
    if (cursor < 0) return prize;
  }
  return prizes[prizes.length - 1];
};

export function getPromotionPrizePlan(
  settings: CustomerPromotionSettings
): Record<string, number> {
  const expected = Math.max(1, Math.round(Number(settings.expectedDailyDraws || 60)));
  const active = settings.prizes.filter(prize => (
    prize.active && Number(prize.probability || 0) > 0
  ));
  const plan = Object.fromEntries(settings.prizes.map(prize => [prize.id, 0]));
  if (active.length === 0 || expected < active.length) return plan;

  active.forEach(prize => { plan[prize.id] = 1; });
  for (let assigned = active.length; assigned < expected; assigned += 1) {
    const next = active.reduce((best, prize) => {
      const target = expected * Number(prize.probability || 0) / 100;
      const bestTarget = expected * Number(best.probability || 0) / 100;
      const deficit = target - plan[prize.id];
      const bestDeficit = bestTarget - plan[best.id];
      return deficit > bestDeficit || (deficit === bestDeficit && prize.id < best.id) ? prize : best;
    });
    plan[next.id] += 1;
  }
  return plan;
}

export const selectPlannedPromotionPrize = (
  settings: CustomerPromotionSettings,
  orderAmount: number,
  usedCounts: Record<string, number>,
  randomValue: number
): CustomerPromotionPrize | null => {
  const plan = getPromotionPrizePlan(settings);
  const eligible = settings.prizes.filter(prize => {
    if (!prize.active || prize.probability <= 0) return false;
    if (prize.type === 'fixed' && prize.amount > orderAmount) return false;
    return Number(usedCounts[prize.id] || 0) < Number(plan[prize.id] || 0);
  });
  const remaining = eligible.map(prize => ({
    prize,
    slots: Math.max(0, Number(plan[prize.id] || 0) - Number(usedCounts[prize.id] || 0)),
  }));
  const total = remaining.reduce((sum, item) => sum + item.slots, 0);
  if (total <= 0) return null;
  let cursor = Math.min(Math.max(randomValue, 0), 0.999999999) * total;
  for (const item of remaining) {
    cursor -= item.slots;
    if (cursor < 0) return item.prize;
  }
  return remaining[remaining.length - 1].prize;
};

export const getPromotionRewardAmount = (
  prize: CustomerPromotionPrize,
  orderAmount: number
): number => {
  if (prize.type === 'dish' || prize.type === 'gift') return 0;
  return Number((prize.type === 'full_order' ? orderAmount : Math.min(prize.amount, orderAmount)).toFixed(2));
};

export const getPromotionRewardLabel = (prize: CustomerPromotionPrize): string => {
  if (prize.type === 'fixed') return `C$${Number(prize.amount || 0).toFixed(2)}`;
  if (prize.type === 'full_order') return 'Consumo completo';
  return String(prize.label || '').trim();
};

const hashSeed = (value: string): number => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const seededShuffle = <T,>(items: T[], seed: string): T[] => {
  const result = [...items];
  let state = hashSeed(seed) || 1;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
};

const separateDuplicatePrizes = (items: CustomerPromotionPrize[]): CustomerPromotionPrize[] => {
  const remaining = [...items];
  const result: CustomerPromotionPrize[] = [];
  while (remaining.length > 0) {
    const previousId = result[result.length - 1]?.id;
    const nextIndex = Math.max(0, remaining.findIndex(prize => prize.id !== previousId));
    result.push(remaining.splice(nextIndex, 1)[0]);
  }
  return result;
};

export const arrangePromotionPrizes = (
  prizes: CustomerPromotionPrize[],
  seed: string
): CustomerPromotionPrize[] => {
  const visualPrizes = prizes.length > 1
    ? prizes.flatMap(prize => [{ ...prize }, { ...prize }])
    : prizes;
  const monetary = seededShuffle(
    visualPrizes.filter(prize => prize.type === 'fixed' || prize.type === 'full_order'),
    `${seed}:money`
  );
  const other = seededShuffle(
    visualPrizes.filter(prize => prize.type === 'dish' || prize.type === 'gift'),
    `${seed}:other`
  );
  if (monetary.length === 0 || other.length === 0) {
    return separateDuplicatePrizes(seededShuffle(visualPrizes, seed));
  }

  const result: CustomerPromotionPrize[] = [];
  let takeMoney = hashSeed(seed) % 2 === 0;
  while (monetary.length > 0 || other.length > 0) {
    const source = takeMoney ? monetary : other;
    const fallback = takeMoney ? other : monetary;
    result.push((source.length > 0 ? source : fallback).shift()!);
    takeMoney = !takeMoney;
  }
  return separateDuplicatePrizes(result);
};

export const reconcilePromotionReward = (
  reward: CustomerPromotionReward,
  order?: PromotionOrderLike
): CustomerPromotionReward => {
  if (!order || reward.status === 'redeemed') return reward;
  const nextStatus = getRewardStatusForOrder(order.status);
  if (nextStatus === reward.status) return reward;
  const now = new Date().toISOString();
  return {
    ...reward,
    status: nextStatus,
    availableAt: nextStatus === 'available' ? reward.availableAt || now : reward.availableAt,
    voidedAt: nextStatus === 'void' ? reward.voidedAt || now : reward.voidedAt,
  };
};

export const getCustomerPromotionBalance = (
  rewards: CustomerPromotionReward[],
  customerId: string
): number => rewards
  .filter(reward => reward.customerId === customerId && reward.status === 'available')
  .reduce((sum, reward) => sum + Number(reward.rewardAmount || 0), 0);

export const getPromotionRedemptionError = (
  reward: CustomerPromotionReward,
  order: PromotionRedemptionOrderLike
): string | null => {
  if (reward.status !== 'available') return 'reward-not-available';
  if (!order?.id || order.status === 'draft' || order.status === 'completed' || order.status === 'cancelled') {
    return 'invalid-redemption-order';
  }
  if (!order.customerId || order.customerId !== reward.customerId) return 'redemption-customer-mismatch';
  if (order.id === reward.orderId) return 'redemption-source-order';
  if (order.promotionRewardId && order.promotionRewardId !== reward.id) return 'order-already-has-reward';
  if (
    order.paymentStatus === 'paid' ||
    Number(order.paidAmount || 0) > 0 ||
    Number(order.settledAmount || 0) > 0
  ) {
    return 'redemption-order-paid';
  }
  if (
    (reward.prizeType === 'fixed' || reward.prizeType === 'full_order') &&
    Number(order.totalAmount || 0) < Number(reward.rewardAmount || 0)
  ) {
    return 'redemption-order-too-small';
  }
  return null;
};

export const getPromotionRedemptionDiscount = (
  reward: CustomerPromotionReward,
  order: PromotionRedemptionOrderLike
): number => {
  if (reward.prizeType === 'dish' || reward.prizeType === 'gift') return 0;
  return Number(Math.min(
    Number(reward.rewardAmount || 0),
    Math.max(0, Number(order.totalAmount || 0))
  ).toFixed(2));
};

export const validatePromotionSettings = (settings: CustomerPromotionSettings): string | null => {
  const active = settings.prizes.filter(prize => prize.active);
  if (active.length === 0) return 'no-active-prizes';
  if (new Set(settings.prizes.map(prize => prize.id)).size !== settings.prizes.length) return 'invalid-value';
  const expected = Math.round(Number(settings.expectedDailyDraws || 0));
  if (Number(settings.minimumOrderAmount || 0) < 0 || expected < active.length || active.some(prize => (
    prize.probability <= 0 ||
    (prize.type === 'fixed' && prize.amount <= 0) ||
    (prize.type === 'dish' && (!prize.menuItemId || !prize.label?.trim())) ||
    (prize.type === 'gift' && !prize.label?.trim())
  ))) {
    return 'invalid-value';
  }
  const probability = active.reduce((sum, prize) => sum + Number(prize.probability || 0), 0);
  return Math.abs(probability - 100) < 0.001 ? null : 'probability-total';
};
