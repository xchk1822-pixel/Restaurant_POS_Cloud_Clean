export interface InventoryCategoryRef {
  id?: string;
  key?: string;
  name?: string;
}

export interface InventoryItemCategoryRef {
  category?: string;
}

export interface FridgeOrderRecord {
  itemId: string;
  sortOrder?: number | string;
}

const normalize = (value: unknown): string => String(value || '').trim().toLowerCase();

const allowedFridgeCategoryKeys = new Set([
  'alcohol',
  'beverage',
  'cerveza',
  'bebida',
  'bebidas',
  'jugo',
  'jugos',
]);

const allowedFridgeCategoryNames = new Set([
  '酒水',
  '饮料',
  'cerveza',
  'bebida',
  'bebidas',
  'jugo',
  'jugos',
]);

export const canItemEnterFridge = (
  item: InventoryItemCategoryRef,
  categories: InventoryCategoryRef[] = []
): boolean => {
  const itemCategory = normalize(item.category);
  if (!itemCategory) return false;
  if (allowedFridgeCategoryKeys.has(itemCategory) || allowedFridgeCategoryNames.has(itemCategory)) {
    return true;
  }

  const category = categories.find(cat =>
    normalize(cat.key) === itemCategory || normalize(cat.id) === itemCategory
  );

  return category ? allowedFridgeCategoryNames.has(normalize(category.name)) : false;
};

const getSortOrder = (record: FridgeOrderRecord, fallback: number): number => {
  const order = Number(record.sortOrder);
  return Number.isFinite(order) ? order : fallback;
};

export const resolveFridgeItemOrder = (
  records: FridgeOrderRecord[],
  savedOrder: string[] = []
): string[] => {
  const currentItemIds = records.map(record => record.itemId);
  const hasCloudOrder = records.some(record => Number.isFinite(Number(record.sortOrder)));

  if (hasCloudOrder) {
    return records
      .map((record, index) => ({ record, index }))
      .sort((a, b) => getSortOrder(a.record, a.index) - getSortOrder(b.record, b.index))
      .map(({ record }) => record.itemId);
  }

  if (savedOrder.length > 0) {
    const existingItems = savedOrder.filter(id => currentItemIds.includes(id));
    const newItems = currentItemIds.filter(id => !savedOrder.includes(id));
    return [...existingItems, ...newItems];
  }

  return currentItemIds;
};
