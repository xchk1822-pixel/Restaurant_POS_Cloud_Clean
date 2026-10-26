export const formatInventoryQuantity = (value: unknown): string => {
  const quantity = Number(value);
  return Number.isFinite(quantity) ? String(Number(quantity.toFixed(1))) : '0';
};
