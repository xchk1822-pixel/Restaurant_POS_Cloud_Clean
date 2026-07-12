export const roundPurchaseAmount = (value: number): number => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return 0;
  return Math.round((amount + Number.EPSILON) * 100) / 100;
};

export const calculatePurchaseLineSubtotal = (quantity: number, unitPrice: number): number => {
  return roundPurchaseAmount((Number(quantity) || 0) * roundPurchaseAmount(Number(unitPrice) || 0));
};

export const calculatePurchaseOrderTotal = (items: Array<{ subtotal: number }>): number => {
  return roundPurchaseAmount(items.reduce((sum, item) => sum + (Number(item.subtotal) || 0), 0));
};
