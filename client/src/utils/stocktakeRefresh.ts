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

const toSafeText = (value: unknown, fallback = ''): string => {
  return typeof value === 'string' || typeof value === 'number'
    ? String(value)
    : fallback;
};

const toSafeNumber = (value: unknown): number => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : 0;
};

export const buildFridgeStocktakeViewItems = (
  records: any[],
  inventoryItems: any[],
  selectedFridge: string,
  unknownItemName: string
) => {
  return records
    .filter(record => record && record.fridgeId === selectedFridge && record.itemId)
    .map(record => {
      const inventoryItem = inventoryItems.find(item => item?.id === record.itemId);
      return {
        ...record,
        fridgeId: toSafeText(record.fridgeId),
        itemId: toSafeText(record.itemId),
        quantity: toSafeNumber(record.quantity),
        sortOrder: record.sortOrder === undefined ? undefined : toSafeNumber(record.sortOrder),
        itemName: toSafeText(inventoryItem?.name, toSafeText(record.itemName, unknownItemName)),
        unit: toSafeText(inventoryItem?.unit, toSafeText(record.unit)),
        barcode: toSafeText(inventoryItem?.barcode, toSafeText(record.barcode)),
      };
    });
};

export const saveInventoryRefreshCache = (storeId: string | null | undefined, items: any[]) => {
  if (!storeId) {
    console.warn('Missing storeId; skipped inventory refresh cache write');
    return;
  }

  localStorage.setItem(`store_${storeId}_inventory_items`, JSON.stringify(items));
  localStorage.setItem(`store_${storeId}_inventory`, JSON.stringify(items));
};

export const saveFridgeRefreshCache = (
  storeId: string | null | undefined,
  fridges: any[],
  fridgeInventory: any[]
) => {
  if (!storeId) {
    console.warn('Missing storeId; skipped fridge refresh cache write');
    return;
  }

  localStorage.setItem(`store_${storeId}_fridges`, JSON.stringify(fridges));
  localStorage.setItem(`store_${storeId}_fridge_inventory`, JSON.stringify(fridgeInventory));
};

export const saveFridgeItemOrderCache = (
  storage: Pick<Storage, 'setItem'>,
  storageKey: string,
  itemOrder: string[]
): boolean => {
  try {
    storage.setItem(storageKey, JSON.stringify(itemOrder));
    return true;
  } catch {
    // Cloud sortOrder fields are authoritative; this optional cache must not
    // unmount the stocktake page when browser storage is full.
    return false;
  }
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

export const buildFridgeStocktakeSubmissionId = ({
  date,
  fridgeId,
  items,
}: {
  date: string;
  fridgeId: string;
  items: Array<{ itemId: string; systemStock: number; actualStock: number }>;
}): string => {
  const payload = [
    date,
    fridgeId,
    ...items
      .map(item => `${item.itemId}:${Number(item.systemStock) || 0}:${Number(item.actualStock) || 0}`)
      .sort(),
  ].join('|');
  let hash = 2166136261;

  for (let index = 0; index < payload.length; index += 1) {
    hash ^= payload.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  const safeDate = date.replace(/[^0-9]/g, '');
  const safeFridgeId = fridgeId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48) || 'fridge';
  return `stocktake-${safeDate}-${safeFridgeId}-${(hash >>> 0).toString(36)}`;
};

export const buildFridgeStocktakeHistoryRecords = ({
  fridges,
  fridgeInventory,
  inventoryItems,
  actualQuantities,
  now,
  date,
}: {
  fridges: any[];
  fridgeInventory: any[];
  inventoryItems: any[];
  actualQuantities: Record<string, number>;
  now: number;
  date: string;
}): any[] => {
  const fridgeNames = new Map<string, string>();
  fridges.forEach((fridge: any) => {
    if (fridge?.id) {
      fridgeNames.set(String(fridge.id), fridge.name || String(fridge.id));
    }
  });

  const groupedInventory = new Map<string, any[]>();
  fridgeInventory.forEach((record: any) => {
    if (!record?.fridgeId) return;
    const fridgeId = String(record.fridgeId);
    const records = groupedInventory.get(fridgeId) || [];
    records.push(record);
    groupedInventory.set(fridgeId, records);
  });

  return Array.from(groupedInventory.entries())
    .map(([fridgeId, fridgeRecords]) => {
      const items = fridgeRecords.map((record: any) => {
        const warehouseItem = inventoryItems.find((item: any) => item.id === record.itemId);
        const warehouseStock = Number(warehouseItem?.currentStock || 0);
        const fridgeStock = Number(record.quantity || 0);
        const actualStock = Number(actualQuantities[record.itemId] ?? 0);

        return {
          itemId: record.itemId,
          itemName: warehouseItem?.name || record.itemName || '未知商品',
          unit: warehouseItem?.unit || record.unit || '',
          totalStock: warehouseStock + fridgeStock,
          warehouseStock,
          systemStock: fridgeStock,
          actualStock,
          difference: actualStock - fridgeStock,
        };
      });

      return {
        id: `stocktake-${now}-${fridgeId}`,
        fridgeId,
        fridgeName: fridgeNames.get(fridgeId) || fridgeRecords[0]?.fridgeName || fridgeId,
        date,
        createdAt: new Date(now),
        lastModified: now,
        items,
        totalDiscrepancies: items.filter(item => item.difference !== 0).length,
      };
    });
};

export const printStocktakeHistory = (elementId: string) => {
  const source = document.getElementById(elementId);
  if (!source) {
    window.print();
    return;
  }

  const printWindow = window.open('', '_blank', 'width=900,height=700');
  if (!printWindow) {
    window.print();
    return;
  }

  printWindow.document.write(`
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Stocktake History</title>
        <style>
          @page { size: A4; margin: 10mm; }
          body { font-family: Arial, "Microsoft YaHei", sans-serif; color: #111827; margin: 0; }
          h3 { font-size: 14pt; margin: 0 0 8px 0; }
          .stocktake-print-actions, button, input[type="date"] { display: none !important; }
          div { max-height: none !important; overflow: visible !important; }
          table { width: 100% !important; border-collapse: collapse !important; font-size: 9pt !important; }
          tr { page-break-inside: avoid; }
          thead { display: table-header-group; }
          th, td { border: 1px solid #111827 !important; padding: 4px 6px !important; font-size: 9pt !important; }
          th { background: #f3f4f6 !important; font-weight: 700 !important; }
        </style>
      </head>
      <body>${source.innerHTML}</body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => {
    printWindow.print();
    printWindow.close();
  }, 250);
};
