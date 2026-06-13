import {
  formatNicaraguaDateTime,
  getLocalDateString,
  toTimestampMillis,
} from './localTime';

export const normalizeInventoryItemsForRefresh = (items: any[]) => {
  return items.map((item: any) => ({
    ...item,
    currentStock: Number(item.currentStock) || 0,
    minStock: Number(item.minStock) || 0,
    costPrice: Number(item.costPrice) || 0,
    salePrice: item.salePrice === undefined ? undefined : Number(item.salePrice) || 0,
    lastUpdated: item.lastUpdated ? new Date(item.lastUpdated) : new Date(),
  }));
};

export const normalizeFridgesForRefresh = (fridges: any[]) => {
  return fridges.map((fridge: any) => ({
    ...fridge,
    createdAt: fridge.createdAt ? new Date(fridge.createdAt) : new Date(),
  }));
};

export const normalizeFridgeInventoryForRefresh = (records: any[]) => {
  return records.map((record: any) => ({
    ...record,
    quantity: Number(record.quantity) || 0,
    sortOrder: record.sortOrder === undefined ? undefined : Number(record.sortOrder) || 0,
    lastModified: Number(record.lastModified || 0) || Date.now(),
  }));
};

export const saveInventoryRefreshCache = (storeId: string | null | undefined, items: any[]) => {
  if (storeId) {
    localStorage.setItem(`store_${storeId}_inventory_items`, JSON.stringify(items));
    localStorage.setItem(`store_${storeId}_inventory`, JSON.stringify(items));
    return;
  }

  localStorage.setItem('inventory_items', JSON.stringify(items));
  localStorage.setItem('inventory', JSON.stringify(items));
};

export const saveFridgeRefreshCache = (
  storeId: string | null | undefined,
  fridges: any[],
  fridgeInventory: any[]
) => {
  localStorage.setItem(storeId ? `store_${storeId}_fridges` : 'fridges', JSON.stringify(fridges));
  localStorage.setItem(
    storeId ? `store_${storeId}_fridge_inventory` : 'fridge_inventory',
    JSON.stringify(fridgeInventory)
  );
};

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const getStocktakeTimestamp = (record: any): number => {
  return toTimestampMillis(record?.createdAt)
    || toTimestampMillis(record?.lastModified)
    || toTimestampMillis(record?.date);
};

export const getStocktakeRecordDateKey = (recordOrDate: any): string => {
  const value = recordOrDate?.date ?? recordOrDate;

  if (typeof value === 'string' && DATE_ONLY_PATTERN.test(value)) {
    return value;
  }

  const timestamp = toTimestampMillis(value);
  return timestamp ? getLocalDateString(new Date(timestamp)) : '';
};

export const formatStocktakeRecordDateTime = (record: any): string => {
  const value = record?.createdAt || record?.date || record;

  if (typeof value === 'string' && DATE_ONLY_PATTERN.test(value)) {
    return value;
  }

  return formatNicaraguaDateTime(value) || String(record?.date || '');
};

export const sortStocktakeHistoryRecords = <T extends { id?: string }>(records: T[]): T[] => {
  return [...records].sort((a: any, b: any) => getStocktakeTimestamp(b) - getStocktakeTimestamp(a));
};

export const normalizeStocktakeHistoryForRefresh = (records: any[]) => {
  return sortStocktakeHistoryRecords(records.map((record: any) => ({
    ...record,
    date: getStocktakeRecordDateKey(record),
    lastModified: Number(record.lastModified || 0) || getStocktakeTimestamp(record) || Date.now(),
  })));
};
