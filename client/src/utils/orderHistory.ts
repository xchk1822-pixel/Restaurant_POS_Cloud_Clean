import { getLocalDateString } from './exchangeRate';
import { toTimestampMillis } from './localTime';

export const getOrderCancellationRecords = (order: any): any[] => {
  const orderLevelRecords = Array.isArray(order?.cancelRecords) ? order.cancelRecords : [];
  const itemLevelRecords = Array.isArray(order?.items)
    ? order.items.flatMap((item: any) => (
        Array.isArray(item?.cancelRecords)
          ? item.cancelRecords.map((record: any) => ({
              ...record,
              itemId: record.itemId || item.id,
              itemName: record.itemName || item.name,
            }))
          : []
      ))
    : [];

  return [...orderLevelRecords, ...itemLevelRecords].filter((record: any) => {
    return record && (record.itemName || record.reason || Number(record.quantity) > 0);
  });
};

export const getOrderCancellationSummary = (order: any) => {
  return {
    reason: order?.cancelReason || order?.cancellationReason || '',
    cancelledBy: order?.cancelledBy || order?.voidedBy || '',
    cancelledAt: order?.cancelledAt || order?.cancelAt || order?.voidedAt || '',
    records: getOrderCancellationRecords(order),
  };
};

export interface OrderHistoryFilters {
  searchKeyword: string;
  status: string;
  orderType: string;
  startDate: string;
  endDate: string;
}

export const getOrderTimestamp = (order: any): number => {
  return toTimestampMillis(
    order?.createdAt ||
    order?.date ||
    order?.orderDate ||
    order?.completedAt ||
    order?.updatedAt
  );
};

export const getOrderDateKey = (order: any): string => {
  const timestamp = getOrderTimestamp(order);
  return timestamp ? getLocalDateString(new Date(timestamp)) : '';
};

export const normalizeOrderType = (order: any): string => {
  const type = order?.orderType || order?.type || 'dine_in';
  return type === 'dine-in' ? 'dine_in' : type;
};

export const filterAndSortOrders = (orders: any[], filters: OrderHistoryFilters): any[] => {
  const keyword = filters.searchKeyword.trim().toLowerCase();

  return orders
    .filter((order: any) => {
      if (keyword) {
        const orderNumber = String(order.orderNumber || order.id || '').toLowerCase();
        const tableNumber = String(order.tableNumber || '').toLowerCase();
        if (!orderNumber.includes(keyword) && !tableNumber.includes(keyword)) {
          return false;
        }
      }

      if (filters.status !== 'all' && order.status !== filters.status) {
        return false;
      }

      if (filters.orderType !== 'all' && normalizeOrderType(order) !== filters.orderType) {
        return false;
      }

      if (filters.startDate && filters.endDate) {
        const orderDateKey = getOrderDateKey(order);
        if (!orderDateKey) return false;
        return orderDateKey >= filters.startDate && orderDateKey <= filters.endDate;
      }

      return true;
    })
    .sort((a: any, b: any) => getOrderTimestamp(b) - getOrderTimestamp(a));
};

export const groupOrdersByDate = (orders: any[], formatDate: (timestamp: number) => string) => {
  return orders.reduce((groups: Record<string, any[]>, order: any) => {
    const timestamp = getOrderTimestamp(order);
    const date = timestamp ? formatDate(timestamp) : '未知日期';
    if (!groups[date]) groups[date] = [];
    groups[date].push(order);
    return groups;
  }, {});
};
