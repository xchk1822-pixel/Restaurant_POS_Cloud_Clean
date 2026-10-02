import { getLocalDateString } from './exchangeRate';
import { getPurchaseOrderTime } from './purchaseDates';

const toNumber = (value: any): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const getPurchaseExpenseId = (purchase: any): string => {
  return `purchase-expense-${purchase?.id || purchase?.orderNumber || purchase?.invoiceNumber}`;
};

export const getPurchaseExpenseDate = (purchase: any): string => {
  const time = getPurchaseOrderTime(purchase);
  return time ? getLocalDateString(new Date(time)) : '';
};

export const isPaidCashPurchase = (purchase: any): boolean => {
  const totalAmount = toNumber(purchase?.totalAmount);
  const paidAmount = toNumber(purchase?.paidAmount);
  return totalAmount > 0 && (
    purchase?.paymentType === 'cash' ||
    (paidAmount >= totalAmount && purchase?.paymentType !== 'credit')
  );
};

export const hasPurchaseExpense = (purchase: any, expenses: any[]): boolean => {
  const purchaseId = String(purchase?.id || '');
  const orderNumber = String(purchase?.orderNumber || '').trim();
  const expenseId = getPurchaseExpenseId(purchase);

  return expenses.some(expense => {
    if (expense?.isDeleted) return false;
    if (expense?.id === expenseId) return true;
    if (purchaseId && (expense?.purchaseOrderId === purchaseId || expense?.orderId === purchaseId)) return true;
    if (
      orderNumber &&
      expense?.relatedType === 'purchase' &&
      String(expense?.orderNumber || '').trim() === orderNumber
    ) {
      return true;
    }
    return false;
  });
};

export const buildPurchaseExpenseFromOrder = (purchase: any): any => {
  const date = getPurchaseExpenseDate(purchase);
  const purchaseId = purchase?.id || purchase?.orderNumber || `purchase-${Date.now()}`;

  return {
    id: getPurchaseExpenseId({ ...purchase, id: purchaseId }),
    date,
    categoryId: 'supplier_payment',
    categoryName: '\u4f9b\u5e94\u5546\u8d27\u6b3e',
    amount: toNumber(purchase?.totalAmount),
    description: `\u91c7\u8d2d\u73b0\u7ed3 - ${purchase?.supplierName || ''} (${purchase?.orderNumber || purchaseId})`,
    type: 'purchase',
    supplierId: purchase?.supplierId || '',
    supplierName: purchase?.supplierName || '',
    purchaseOrderId: purchaseId,
    orderId: purchaseId,
    relatedType: 'purchase',
    orderNumber: purchase?.orderNumber || '',
    createdAt: date,
    repairedFromPurchaseOrder: true,
    lastModified: Date.now(),
  };
};

export const buildMissingPurchaseExpenses = (purchases: any[], expenses: any[]): any[] => {
  return (Array.isArray(purchases) ? purchases : [])
    .filter(isPaidCashPurchase)
    .filter(purchase => getPurchaseOrderTime(purchase) > 0)
    .filter(purchase => !hasPurchaseExpense(purchase, expenses))
    .map(buildPurchaseExpenseFromOrder);
};
