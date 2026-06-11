export interface ScopedPointsTransaction {
  id: string;
  customerId: string;
  type: 'earn' | 'redeem' | 'adjust';
  points: number;
  description: string;
  createdAt: string;
}

const POINTS_TRANSACTIONS_KEY = 'points_transactions';

const getCurrentStoreId = (): string | null => {
  try {
    const userStr = localStorage.getItem('current_user');
    const user = userStr ? JSON.parse(userStr) : null;
    return user?.storeId || null;
  } catch {
    return null;
  }
};

export const getScopedPointsTransactionsKey = (): string => {
  const storeId = getCurrentStoreId();
  return storeId ? `store_${storeId}_${POINTS_TRANSACTIONS_KEY}` : POINTS_TRANSACTIONS_KEY;
};

export const loadScopedPointsTransactions = (): ScopedPointsTransaction[] => {
  const scopedKey = getScopedPointsTransactionsKey();
  const saved = localStorage.getItem(scopedKey);
  if (!saved) return [];

  try {
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const saveScopedPointsTransactions = (records: ScopedPointsTransaction[]): void => {
  const scopedKey = getScopedPointsTransactionsKey();
  localStorage.setItem(scopedKey, JSON.stringify(records));

  if (scopedKey !== POINTS_TRANSACTIONS_KEY) {
    localStorage.removeItem(POINTS_TRANSACTIONS_KEY);
  }
};
