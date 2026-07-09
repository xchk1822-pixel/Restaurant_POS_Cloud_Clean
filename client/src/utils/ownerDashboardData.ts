import { getOrderCollectedAmount, isPurchaseRelatedExpense } from './financeMetrics';

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

export const dedupeOwnerRecordsByStoreAndId = <T extends { id?: string; storeId?: string; isDeleted?: boolean }>(records: T[]): T[] => {
  const byStoreAndId = new Map<string, T>();

  records.forEach(record => {
    if (!record?.id || record.isDeleted) return;
    const key = `${record.storeId || 'global'}:${record.id}`;
    const existing = byStoreAndId.get(key);
    if (!existing || getRecordVersion(record) >= getRecordVersion(existing)) {
      byStoreAndId.set(key, record);
    }
  });

  return Array.from(byStoreAndId.values());
};

const getRecordDate = (record: any): string => {
  const value = record?.date || record?.orderDate || record?.receivedDate || record?.createdAt || record?.updatedAt || '';
  if (typeof value === 'string') return value.slice(0, 10);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (value && typeof value.toDate === 'function') return value.toDate().toISOString().slice(0, 10);
  return '';
};

const getEvidenceImage = (record: any): string => {
  return String(record?.receipt || record?.receiptImage || record?.invoiceImage || record?.imageUrl || '').trim();
};

export interface OwnerExpenseEvidenceRow {
  id: string;
  kind: 'operating' | 'purchase';
  storeId?: string;
  storeName: string;
  date: string;
  title: string;
  amount: number;
  image: string;
}

export const buildOwnerExpenseEvidenceRows = (
  expenses: any[],
  purchases: any[]
): OwnerExpenseEvidenceRow[] => {
  const expenseRows = (expenses || [])
    .filter(expense => !expense?.isDeleted)
    .map(expense => ({
      id: `expense:${expense.id}`,
      kind: 'operating' as const,
      storeId: expense.storeId,
      storeName: expense.storeName || '分店',
      date: getRecordDate(expense),
      title: String(expense.description || expense.categoryName || expense.category || '日常开支'),
      amount: toNumber(expense.amount),
      image: getEvidenceImage(expense),
    }))
    .filter(row => Boolean(row.image));

  const purchaseRows = (purchases || [])
    .filter(purchase => !purchase?.isDeleted)
    .map(purchase => {
      const supplierName = String(purchase.supplierName || '采购单').trim();
      const orderNumber = String(purchase.orderNumber || purchase.invoiceNumber || '').trim();
      return {
        id: `purchase:${purchase.id}`,
        kind: 'purchase' as const,
        storeId: purchase.storeId,
        storeName: purchase.storeName || '分店',
        date: getRecordDate(purchase),
        title: `${supplierName}${orderNumber ? ` - ${orderNumber}` : ''}`,
        amount: toNumber(purchase.totalAmount || purchase.amount),
        image: getEvidenceImage(purchase),
      };
    })
    .filter(row => Boolean(row.image));

  return [...expenseRows, ...purchaseRows].sort((a, b) => b.date.localeCompare(a.date));
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

export interface OwnerOrderTypeSummary {
  mesa: number;
  barra: number;
  delivery: number;
}

export const summarizeOwnerOrderTypes = (orders: any[]): OwnerOrderTypeSummary => {
  return (Array.isArray(orders) ? orders : []).reduce<OwnerOrderTypeSummary>((summary, order) => {
    if (!order?.id || order.isDeleted || getOrderCollectedAmount(order) <= 0) return summary;

    const orderType = order.orderType || 'dine_in';
    if (orderType === 'delivery') {
      summary.delivery += 1;
    } else if (orderType === 'takeout') {
      summary.barra += 1;
    } else {
      summary.mesa += 1;
    }

    return summary;
  }, { mesa: 0, barra: 0, delivery: 0 });
};
