import { isPurchaseRelatedExpense } from './financeMetrics';

const toNumber = (value: any): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toTimestamp = (value: any): number => {
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

const getRecordVersion = (record: any): number => Math.max(
  toNumber(record?.version),
  toTimestamp(record?.lastModified),
  toTimestamp(record?.updatedAt),
  toTimestamp(record?.lastUpdated),
  toTimestamp(record?.createdAt)
);

export const dedupeOwnerRecordsById = <T extends { id?: string; isDeleted?: boolean }>(records: T[]): T[] => {
  const byId = new Map<string, T>();

  records.forEach(record => {
    if (!record?.id || record.isDeleted) return;
    const id = String(record.id);
    const existing = byId.get(id);
    if (!existing || getRecordVersion(record) >= getRecordVersion(existing)) {
      byId.set(id, record);
    }
  });

  return Array.from(byId.values());
};

export const sumOwnerExpenseByKind = (expenses: any[], kind: 'purchase' | 'operating'): number => {
  return expenses
    .filter(expense => !expense?.isDeleted)
    .filter(expense => kind === 'purchase' ? isPurchaseRelatedExpense(expense) : !isPurchaseRelatedExpense(expense))
    .reduce((sum, expense) => sum + toNumber(expense?.amount), 0);
};

export const sumOwnerSupplierDebt = (purchases: any[]): number => {
  return purchases
    .filter(purchase => !purchase?.isDeleted)
    .reduce((sum, purchase) => {
      const total = toNumber(purchase?.totalAmount || purchase?.amount);
      const paid = toNumber(purchase?.paidAmount);
      return sum + Math.max(total - paid, 0);
    }, 0);
};
