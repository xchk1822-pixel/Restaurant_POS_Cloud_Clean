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
