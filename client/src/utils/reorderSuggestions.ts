export interface ReorderInventoryItem {
  id: string;
  name: string;
  unit: string;
  currentStock: number;
  minStock: number;
  costPrice: number;
  preferredSupplierId?: string;
  preferredSupplierName?: string;
}

export interface ReorderFridgeInventory {
  itemId: string;
  quantity: number;
}

export interface ReorderSupplier {
  id: string;
  name: string;
  status?: string;
}

export interface ReorderPurchaseOrder {
  id: string;
  supplierId?: string;
  supplierName?: string;
  orderDate?: unknown;
  receivedDate?: unknown;
  createdAt?: unknown;
  lastModified?: number;
  deletedAt?: unknown;
  isDeleted?: boolean;
  items?: Array<{
    itemId?: string;
    quantity?: number;
    unitPrice?: number;
  }>;
}

export interface ReorderSuggestion {
  itemId: string;
  itemName: string;
  unit: string;
  currentStock: number;
  minStock: number;
  targetStock: number;
  suggestedQuantity: number;
  supplierId: string;
  supplierName: string;
  supplierSource: 'preferred' | 'latest-purchase' | 'unlinked';
  estimatedUnitCost: number;
  estimatedAmount: number;
}

const toTimestamp = (value: unknown): number => {
  if (!value) return 0;
  if (typeof (value as any)?.toMillis === 'function') return Number((value as any).toMillis()) || 0;
  if (typeof (value as any)?.toDate === 'function') return (value as any).toDate().getTime() || 0;
  const parsed = value instanceof Date ? value.getTime() : new Date(value as any).getTime();
  return Number.isFinite(parsed) ? parsed : Number(value) || 0;
};

const roundQuantity = (value: number): number => Math.round((value + Number.EPSILON) * 10) / 10;

export const hasLowStockThreshold = (item: Pick<ReorderInventoryItem, 'minStock'>): boolean =>
  Number(item.minStock) > 0;

export const isInventoryItemLowStock = (
  item: Pick<ReorderInventoryItem, 'currentStock' | 'minStock'>,
  fridgeQuantity = 0
): boolean => hasLowStockThreshold(item) && Number(item.currentStock) + Number(fridgeQuantity) <= Number(item.minStock);

export const buildLowStockSuggestions = ({
  inventoryItems,
  fridgeInventory,
  suppliers,
  purchaseOrders,
}: {
  inventoryItems: ReorderInventoryItem[];
  fridgeInventory: ReorderFridgeInventory[];
  suppliers: ReorderSupplier[];
  purchaseOrders: ReorderPurchaseOrder[];
}): ReorderSuggestion[] => {
  const fridgeTotals = new Map<string, number>();
  fridgeInventory.forEach(row => {
    fridgeTotals.set(row.itemId, (fridgeTotals.get(row.itemId) || 0) + Number(row.quantity || 0));
  });

  const supplierById = new Map(suppliers.map(supplier => [supplier.id, supplier]));
  const usableOrders = purchaseOrders
    .filter(order => !order.isDeleted && !order.deletedAt)
    .sort((left, right) => {
      const rightTime = toTimestamp(right.receivedDate || right.orderDate || right.createdAt) || Number(right.lastModified || 0);
      const leftTime = toTimestamp(left.receivedDate || left.orderDate || left.createdAt) || Number(left.lastModified || 0);
      return rightTime - leftTime;
    });

  return inventoryItems
    .map(item => {
      const currentStock = roundQuantity(Number(item.currentStock || 0) + (fridgeTotals.get(item.id) || 0));
      if (!isInventoryItemLowStock(item, fridgeTotals.get(item.id) || 0)) return null;

      const latestOrder = usableOrders.find(order => order.items?.some(line => line.itemId === item.id));
      const latestLine = latestOrder?.items?.find(line => line.itemId === item.id);
      const preferredSupplier = item.preferredSupplierId ? supplierById.get(item.preferredSupplierId) : undefined;
      const latestSupplier = latestOrder?.supplierId ? supplierById.get(latestOrder.supplierId) : undefined;
      const supplierId = preferredSupplier?.id || item.preferredSupplierId || latestSupplier?.id || latestOrder?.supplierId || '';
      const supplierName = preferredSupplier?.name || item.preferredSupplierName || latestSupplier?.name || latestOrder?.supplierName || '未关联供应商';
      const supplierSource = preferredSupplier || item.preferredSupplierId
        ? 'preferred' as const
        : latestOrder
          ? 'latest-purchase' as const
          : 'unlinked' as const;
      const targetStock = roundQuantity(Number(item.minStock) * 2);
      const suggestedQuantity = roundQuantity(Math.max(targetStock - currentStock, 0));
      const estimatedUnitCost = Number(latestLine?.unitPrice || item.costPrice || 0);

      return {
        itemId: item.id,
        itemName: item.name,
        unit: item.unit,
        currentStock,
        minStock: Number(item.minStock),
        targetStock,
        suggestedQuantity,
        supplierId,
        supplierName,
        supplierSource,
        estimatedUnitCost,
        estimatedAmount: Math.round((suggestedQuantity * estimatedUnitCost + Number.EPSILON) * 100) / 100,
      };
    })
    .filter((item): item is ReorderSuggestion => Boolean(item))
    .sort((left, right) => (left.currentStock / left.minStock) - (right.currentStock / right.minStock));
};
