export interface StockDeductionRequest {
  itemId: string;
  quantity: number;
}

export interface StockDeductionInventoryItem {
  id: string;
  name?: string;
  currentStock?: number;
}

export interface StockDeductionFridgeRecord {
  id?: string;
  fridgeId: string;
  itemId: string;
  quantity?: number;
}

export interface StockDeductionPlan {
  fridgeDeductions: Array<{
    recordId: string;
    fridgeId: string;
    itemId: string;
    quantity: number;
  }>;
  warehouseDeductions: Array<{
    itemId: string;
    quantity: number;
  }>;
}

const toPositiveNumber = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

export const buildStockDeductionPlan = ({
  requests,
  inventoryItems,
  fridgeInventory,
}: {
  requests: StockDeductionRequest[];
  inventoryItems: StockDeductionInventoryItem[];
  fridgeInventory: StockDeductionFridgeRecord[];
}): StockDeductionPlan => {
  const requestedByItem = new Map<string, number>();
  requests.forEach(request => {
    const quantity = toPositiveNumber(request.quantity);
    if (!request.itemId || quantity <= 0) return;
    requestedByItem.set(request.itemId, (requestedByItem.get(request.itemId) || 0) + quantity);
  });

  const itemsById = new Map(inventoryItems.map(item => [item.id, item]));
  const fridgeDeductions: StockDeductionPlan['fridgeDeductions'] = [];
  const warehouseDeductions: StockDeductionPlan['warehouseDeductions'] = [];

  requestedByItem.forEach((requiredQuantity, itemId) => {
    const stockItem = itemsById.get(itemId);
    if (!stockItem) {
      throw new Error(`missing-stock-item:${itemId}`);
    }

    let remainingQuantity = requiredQuantity;
    const fridgeRecords = fridgeInventory
      .filter(record => record.itemId === itemId)
      .sort((a, b) => String(a.fridgeId).localeCompare(String(b.fridgeId)));

    fridgeRecords.forEach(record => {
      if (remainingQuantity <= 0) return;
      const availableInFridge = toPositiveNumber(record.quantity);
      const deductFromFridge = Math.min(remainingQuantity, availableInFridge);
      if (deductFromFridge <= 0) return;

      remainingQuantity -= deductFromFridge;
      fridgeDeductions.push({
        recordId: record.id || `${record.fridgeId}-${record.itemId}`,
        fridgeId: record.fridgeId,
        itemId: record.itemId,
        quantity: deductFromFridge,
      });
    });

    if (remainingQuantity <= 0) return;

    warehouseDeductions.push({ itemId, quantity: remainingQuantity });
  });

  return { fridgeDeductions, warehouseDeductions };
};
