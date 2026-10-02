import { getLocalDateString } from './exchangeRate';
import type { ReorderSuggestion } from './reorderSuggestions';

export interface ReplenishmentPurchaseDraft {
  supplierId: string;
  paymentType: 'cash' | 'credit';
  notes: string;
  source: 'reorder_suggestion';
  reorderSuggestionItemIds: string[];
  items: Array<{
    itemId: string;
    itemName: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
  }>;
}

const toTime = (value: any): number => {
  const candidate = value?.orderDate || value?.receivedDate || value?.createdAt || value?.lastModified || value;
  if (!candidate) return 0;
  if (typeof candidate?.toDate === 'function') return candidate.toDate().getTime() || 0;
  if (typeof candidate?.seconds === 'number') return candidate.seconds * 1000;
  if (typeof candidate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(candidate)) {
    const [year, month, day] = candidate.split('-').map(Number);
    return new Date(year, month - 1, day).getTime();
  }
  const time = candidate instanceof Date ? candidate.getTime() : new Date(candidate).getTime();
  return Number.isFinite(time) ? time : 0;
};

const getOrderDateKey = (order: any): string => {
  const time = toTime(order);
  return time ? getLocalDateString(new Date(time)) : '';
};

export const buildReplenishmentPurchaseDraft = (
  suggestion: ReorderSuggestion
): ReplenishmentPurchaseDraft | null => {
  if (!suggestion.supplierId || suggestion.supplierSource === 'unlinked') return null;

  const quantity = Math.max(Number(suggestion.suggestedQuantity) || 0, 0);
  const unitPrice = Math.max(Number(suggestion.estimatedUnitCost) || 0, 0);
  if (quantity <= 0) return null;

  return {
    supplierId: suggestion.supplierId,
    paymentType: 'credit',
    notes: '由低库存补货建议生成',
    source: 'reorder_suggestion',
    reorderSuggestionItemIds: [suggestion.itemId],
    items: [{
      itemId: suggestion.itemId,
      itemName: suggestion.itemName,
      quantity,
      unitPrice,
      subtotal: Math.round(quantity * unitPrice * 10) / 10,
    }],
  };
};

export const mergePurchaseOrderRange = <T extends { id: string }>(
  currentOrders: T[],
  rangeOrders: T[],
  startDate: string,
  endDate: string
): T[] => {
  const incomingIds = new Set(rangeOrders.map(order => order.id));
  const outsideRange = currentOrders.filter(order => {
    if (incomingIds.has(order.id)) return false;
    const dateKey = getOrderDateKey(order);
    return !dateKey || dateKey < startDate || dateKey > endDate;
  });

  return [...rangeOrders, ...outsideRange];
};
