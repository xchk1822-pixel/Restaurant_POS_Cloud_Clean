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
  return fridges
    .map((fridge: any) => {
      const fridgeRecords = fridgeInventory.filter((record: any) => record.fridgeId === fridge.id);
      if (fridgeRecords.length === 0) return null;

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
        id: `stocktake-${now}-${fridge.id}`,
        fridgeId: fridge.id,
        fridgeName: fridge.name,
        date,
        createdAt: new Date(now),
        lastModified: now,
        items,
        totalDiscrepancies: items.filter(item => item.difference !== 0).length,
      };
    })
    .filter(Boolean);
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
