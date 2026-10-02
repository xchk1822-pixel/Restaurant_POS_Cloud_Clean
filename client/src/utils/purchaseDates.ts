import { getLocalDateString } from './exchangeRate';

const parseDateTime = (value: any): number => {
  if (!value) return 0;
  if (typeof value?.toDate === 'function') return value.toDate().getTime() || 0;
  if (typeof value?.seconds === 'number') return value.seconds * 1000;
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
};

export const revivePurchaseDate = (value: any): any => {
  if (!value || value instanceof Date || typeof value?.toDate === 'function') return value;
  if (typeof value?.seconds === 'number') return value;
  if (typeof value !== 'string') return value;

  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : value;
};

export const normalizePurchaseOrderDateFields = <T extends Record<string, any>>(order: T): T => ({
  ...order,
  orderDate: revivePurchaseDate(order?.orderDate),
  receivedDate: revivePurchaseDate(order?.receivedDate),
});

export const normalizePurchaseStockRecordDateFields = <T extends Record<string, any>>(record: T): T => ({
  ...record,
  date: revivePurchaseDate(record?.date),
  createdAt: revivePurchaseDate(record?.createdAt),
});

export const getPurchaseOrderTime = (purchaseOrDate: any): number => {
  const candidates = purchaseOrDate && typeof purchaseOrDate === 'object' && !(purchaseOrDate instanceof Date)
    ? [
        purchaseOrDate.orderDate,
        purchaseOrDate.receivedDate,
        purchaseOrDate.createdAt,
        purchaseOrDate.updatedAt,
        purchaseOrDate.lastModified,
      ]
    : [purchaseOrDate];

  for (const candidate of candidates) {
    const time = parseDateTime(candidate);
    if (time) return time;
  }
  return 0;
};

export const getPurchaseOrderDateKey = (purchaseOrDate: any): string => {
  const time = getPurchaseOrderTime(purchaseOrDate);
  return time ? getLocalDateString(new Date(time)) : '';
};
