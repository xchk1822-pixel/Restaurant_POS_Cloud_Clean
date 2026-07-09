import { getLocalDateString } from '../../utils/exchangeRate';

export type SupplierStatus = 'active' | 'inactive';
export type PurchasePaymentType = 'cash' | 'credit' | string;

export interface SupplierRecord {
  id: string;
  name: string;
  contact?: string;
  phone?: string;
  address?: string;
  balance?: number;
  status?: SupplierStatus;
  lastUpdated?: any;
  lastModified?: number;
}

export interface PurchaseOrderRecord {
  id: string;
  orderNumber?: string;
  supplierId: string;
  supplierName?: string;
  totalAmount?: number | string;
  paidAmount?: number | string;
  paymentType?: PurchasePaymentType;
  status?: string;
  orderDate?: any;
  receivedDate?: any;
  createdAt?: any;
  lastModified?: any;
  items?: Array<{
    itemName?: string;
    quantity?: number | string;
    unitPrice?: number | string;
    subtotal?: number | string;
  }>;
}

export interface SupplierPaymentRecord {
  id: string;
  supplierId: string;
  supplierName?: string;
  orderId?: string;
  orderNumber?: string;
  amount?: number | string;
  paymentDate?: any;
  paymentMethod?: 'cash' | 'transfer' | 'check' | string;
  notes?: string;
  createdAt?: any;
  lastModified?: any;
}

export interface SupplierAccountSnapshot {
  supplierId: string;
  supplierName: string;
  purchaseCount: number;
  creditOrderCount: number;
  unpaidOrderCount: number;
  repaymentCount: number;
  totalPurchase: number;
  totalPaid: number;
  totalDebt: number;
  lastPurchaseDate: string;
  lastPaymentDate: string;
}

export interface SupplierLedgerEntry {
  id: string;
  kind: 'purchase' | 'payment';
  dateKey: string;
  dateTime: number;
  label: string;
  title: string;
  detail: string;
  amount: number;
  paidAmount: number;
  remainingDebt: number;
  order?: PurchaseOrderRecord;
  payment?: SupplierPaymentRecord;
}

export interface SupplierDateRange {
  startDate: string;
  endDate: string;
}

const toMoney = (value: unknown): number => {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
};

const toTime = (value: any): number => {
  if (!value) return 0;
  if (typeof value?.toDate === 'function') return value.toDate().getTime() || 0;
  if (typeof value?.seconds === 'number') return value.seconds * 1000;
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : 0;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day).getTime();
  }
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

export const formatSupplierDate = (value: any): string => {
  const time = toTime(value);
  return time ? getLocalDateString(new Date(time)) : '-';
};

export const getCurrentMonthSupplierRange = (today = new Date()): SupplierDateRange => {
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  return {
    startDate: getLocalDateString(firstDay),
    endDate: getLocalDateString(lastDay)
  };
};

export const isDateKeyInRange = (dateKey: string, range: SupplierDateRange): boolean => {
  if (!dateKey || dateKey === '-') return false;
  if (range.startDate && dateKey < range.startDate) return false;
  if (range.endDate && dateKey > range.endDate) return false;
  return true;
};

export const getPurchaseOrderDateValue = (order: PurchaseOrderRecord): any => {
  return order.orderDate || order.receivedDate || order.createdAt || order.lastModified;
};

export const getSupplierPaymentDateValue = (payment: SupplierPaymentRecord): any => {
  return payment.paymentDate || payment.createdAt || payment.lastModified;
};

export const getPurchasePaidAmount = (order: PurchaseOrderRecord): number => {
  return Math.max(toMoney(order.paidAmount), 0);
};

export const getPurchaseRemainingDebt = (order: PurchaseOrderRecord): number => {
  return Math.max(toMoney(order.totalAmount) - getPurchasePaidAmount(order), 0);
};

export const getPurchaseAccountLabel = (order: PurchaseOrderRecord): string => {
  const total = toMoney(order.totalAmount);
  const paid = getPurchasePaidAmount(order);
  const remaining = getPurchaseRemainingDebt(order);

  if (order.paymentType === 'cash') return '现付采购';
  if (remaining <= 0 && total > 0) return '已结清采购';
  if (paid > 0 && remaining > 0) return '部分挂账';
  return '挂账采购';
};

export const getSupplierOrders = (
  supplierId: string,
  orders: PurchaseOrderRecord[]
): PurchaseOrderRecord[] => orders.filter(order => order.supplierId === supplierId);

export const getSupplierPayments = (
  supplierId: string,
  payments: SupplierPaymentRecord[]
): SupplierPaymentRecord[] => payments.filter(payment => payment.supplierId === supplierId);

export const buildSupplierAccountSnapshot = (
  supplier: SupplierRecord,
  orders: PurchaseOrderRecord[],
  payments: SupplierPaymentRecord[]
): SupplierAccountSnapshot => {
  const supplierOrders = getSupplierOrders(supplier.id, orders);
  const supplierPayments = getSupplierPayments(supplier.id, payments);
  const totalPurchase = supplierOrders.reduce((sum, order) => sum + toMoney(order.totalAmount), 0);
  const totalPaidFromOrders = supplierOrders.reduce((sum, order) => sum + getPurchasePaidAmount(order), 0);
  const totalDebt = supplierOrders.reduce((sum, order) => sum + getPurchaseRemainingDebt(order), 0);
  const sortedOrders = [...supplierOrders].sort((a, b) => toTime(getPurchaseOrderDateValue(b)) - toTime(getPurchaseOrderDateValue(a)));
  const sortedPayments = [...supplierPayments].sort((a, b) => toTime(getSupplierPaymentDateValue(b)) - toTime(getSupplierPaymentDateValue(a)));

  return {
    supplierId: supplier.id,
    supplierName: supplier.name,
    purchaseCount: supplierOrders.length,
    creditOrderCount: supplierOrders.filter(order => order.paymentType === 'credit').length,
    unpaidOrderCount: supplierOrders.filter(order => getPurchaseRemainingDebt(order) > 0).length,
    repaymentCount: supplierPayments.length,
    totalPurchase,
    totalPaid: totalPaidFromOrders,
    totalDebt,
    lastPurchaseDate: sortedOrders[0] ? formatSupplierDate(getPurchaseOrderDateValue(sortedOrders[0])) : '-',
    lastPaymentDate: sortedPayments[0] ? formatSupplierDate(getSupplierPaymentDateValue(sortedPayments[0])) : '-'
  };
};

export const buildSupplierLedgerEntries = (
  orders: PurchaseOrderRecord[],
  payments: SupplierPaymentRecord[]
): SupplierLedgerEntry[] => {
  const methodLabels: Record<string, string> = {
    cash: '现金',
    transfer: '转账',
    check: '支票'
  };

  const entries: SupplierLedgerEntry[] = [
    ...orders.map(order => {
      const amount = toMoney(order.totalAmount);
      const paidAmount = getPurchasePaidAmount(order);
      const remainingDebt = getPurchaseRemainingDebt(order);
      const itemDetail = (order.items || [])
        .map(item => `${item.itemName || '商品'} C$ ${toMoney(item.subtotal).toFixed(2)}`)
        .join('，');
      const dateValue = getPurchaseOrderDateValue(order);

      return {
        id: `purchase-${order.id}`,
        kind: 'purchase' as const,
        dateKey: formatSupplierDate(dateValue),
        dateTime: toTime(dateValue),
        label: getPurchaseAccountLabel(order),
        title: order.orderNumber || order.id,
        detail: itemDetail || `${order.items?.length || 0} 项商品`,
        amount,
        paidAmount,
        remainingDebt,
        order
      };
    }),
    ...payments.map(payment => {
      const dateValue = getSupplierPaymentDateValue(payment);
      const amount = toMoney(payment.amount);

      return {
        id: `payment-${payment.id}`,
        kind: 'payment' as const,
        dateKey: formatSupplierDate(dateValue),
        dateTime: toTime(dateValue),
        label: '还款',
        title: payment.orderNumber || payment.orderId || payment.id,
        detail: `${methodLabels[payment.paymentMethod || ''] || '还款'}${payment.notes ? ` · ${payment.notes}` : ''}`,
        amount,
        paidAmount: amount,
        remainingDebt: 0,
        payment
      };
    })
  ];

  return entries.sort((a, b) => b.dateTime - a.dateTime);
};

export const filterSupplierOrdersByDateRange = (
  orders: PurchaseOrderRecord[],
  range: SupplierDateRange
): PurchaseOrderRecord[] => {
  return orders.filter(order => isDateKeyInRange(formatSupplierDate(getPurchaseOrderDateValue(order)), range));
};

export const filterSupplierPaymentsByDateRange = (
  payments: SupplierPaymentRecord[],
  range: SupplierDateRange
): SupplierPaymentRecord[] => {
  return payments.filter(payment => isDateKeyInRange(formatSupplierDate(getSupplierPaymentDateValue(payment)), range));
};

export const summarizeSupplierLedgerEntries = (entries: SupplierLedgerEntry[]) => {
  return entries.reduce(
    (summary, entry) => {
      if (entry.kind === 'purchase') {
        summary.purchaseAmount += entry.amount;
        summary.purchaseCount += 1;
      } else {
        summary.paymentAmount += entry.amount;
        summary.paymentCount += 1;
      }
      return summary;
    },
    { purchaseAmount: 0, paymentAmount: 0, purchaseCount: 0, paymentCount: 0 }
  );
};

export const getUnpaidPurchaseOrders = (orders: PurchaseOrderRecord[]): PurchaseOrderRecord[] => {
  return orders
    .filter(order => getPurchaseRemainingDebt(order) > 0)
    .sort((a, b) => toTime(getPurchaseOrderDateValue(b)) - toTime(getPurchaseOrderDateValue(a)));
};
