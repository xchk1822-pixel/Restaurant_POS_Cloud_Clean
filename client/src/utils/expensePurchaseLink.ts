const normalize = (value: any): string => String(value || '').trim().toLowerCase();

export const matchesExpensePurchaseOrder = (expense: any, order: any): boolean => {
  const expenseOrderId = normalize(expense?.orderId || expense?.purchaseOrderId);
  const expenseOrderNumber = normalize(expense?.orderNumber || expense?.invoiceNumber);
  const expenseSupplierId = normalize(expense?.supplierId);
  const expenseSupplierName = normalize(expense?.supplierName);
  const orderId = normalize(order?.id);
  const orderNumber = normalize(order?.orderNumber || order?.invoiceNumber);
  const supplierId = normalize(order?.supplierId);
  const supplierName = normalize(order?.supplierName);

  if (expenseOrderId && orderId === expenseOrderId) return true;
  if (!expenseOrderNumber || orderNumber !== expenseOrderNumber) return false;
  if (expenseSupplierId && supplierId) return expenseSupplierId === supplierId;
  if (expenseSupplierName && supplierName) return expenseSupplierName === supplierName;
  return true;
};

export const findExpensePurchaseOrder = (expense: any, purchaseOrders: any[]): any | undefined => (
  (Array.isArray(purchaseOrders) ? purchaseOrders : []).find(order => matchesExpensePurchaseOrder(expense, order))
);

export const getExpensePurchaseItems = (expense: any, purchaseOrders: any[]): any[] => {
  const order = findExpensePurchaseOrder(expense, purchaseOrders);
  return Array.isArray(order?.items) ? order.items : [];
};
