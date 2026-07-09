export type PosLifecycleTable = {
  id: string;
  status: 'available' | 'occupied' | 'reserved' | 'needs_cleaning';
  currentOrderId?: string;
  lastModified?: number;
};

export type PosLifecycleOrder = {
  id: string;
  orderNumber?: string;
  tableId?: string;
  tableNumber?: string;
  orderType?: string;
  status?: string;
  paymentStatus?: string;
  totalAmount?: number;
  paidAmount?: number;
  settledAmount?: number;
  lastModified?: number;
  createdAt?: any;
  completedAt?: any;
  clearedAt?: any;
  stockDeducted?: boolean;
  stockDeductedAt?: any;
  stockDeductedItems?: Record<string, number>;
  stockDeductionOperationId?: string;
  pointsProcessed?: boolean;
  pointsProcessedAt?: any;
  pointsEarned?: number;
  pointsUsed?: number;
  pointsDiscount?: number;
  cancelledAt?: any;
  preparingAt?: any;
  updatedAt?: any;
  items?: Array<{
    id?: string;
    menuItemId?: string;
    quantity?: number;
    subtotal?: number;
    stockItemId?: string;
    ingredients?: any[];
  }>;
};

export const normalizeDateForSignature = (value: any): number | string | null => {
  if (!value) return null;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'object' && typeof value.seconds === 'number') {
    return value.seconds * 1000 + Math.floor((value.nanoseconds || 0) / 1000000);
  }

  const time = new Date(value).getTime();
  return Number.isNaN(time) ? String(value) : time;
};

export const getOrdersSignature = (orders: Array<Partial<PosLifecycleOrder>> = []): string => {
  return JSON.stringify(
    [...orders]
      .map(order => ({
        id: order.id,
        tableId: order.tableId,
        tableNumber: order.tableNumber,
        orderType: order.orderType,
        status: order.status,
        paymentStatus: order.paymentStatus,
        totalAmount: order.totalAmount || 0,
        paidAmount: order.paidAmount || 0,
        settledAmount: order.settledAmount || 0,
        lastModified: order.lastModified || null,
        createdAt: normalizeDateForSignature(order.createdAt),
        completedAt: normalizeDateForSignature(order.completedAt),
        clearedAt: normalizeDateForSignature(order.clearedAt),
        stockDeducted: !!order.stockDeducted,
        stockDeductedAt: normalizeDateForSignature(order.stockDeductedAt),
        stockDeductedItems: order.stockDeductedItems || {},
        stockDeductionOperationId: order.stockDeductionOperationId || null,
        pointsProcessed: !!order.pointsProcessed,
        pointsProcessedAt: normalizeDateForSignature(order.pointsProcessedAt),
        pointsEarned: order.pointsEarned || 0,
        pointsUsed: order.pointsUsed || 0,
        pointsDiscount: order.pointsDiscount || 0,
        items: (order.items || []).map(item => ({
          id: item.id,
          menuItemId: item.menuItemId,
          quantity: item.quantity,
          subtotal: item.subtotal,
          stockItemId: item.stockItemId,
          ingredients: item.ingredients || []
        }))
      }))
      .sort((a, b) => String(a.id).localeCompare(String(b.id)))
  );
};

export const getOrderSignature = (order: Partial<PosLifecycleOrder>): string => getOrdersSignature([order]);

export const getOrderVersion = (order: Partial<PosLifecycleOrder>): number => {
  const version = Number(order.lastModified || 0);
  return Number.isFinite(version) ? version : 0;
};

export const getPaymentRank = (paymentStatus?: string): number => {
  switch (paymentStatus) {
    case 'paid': return 3;
    case 'partial': return 2;
    case 'refunded': return 1;
    case 'unpaid':
    default: return 0;
  }
};

export const getOrderStatusRank = (status?: string): number => {
  switch (status) {
    case 'cancelled':
    case 'completed': return 5;
    case 'paid': return 4;
    case 'served': return 3;
    case 'preparing': return 2;
    case 'confirmed': return 1;
    case 'draft':
    default: return 0;
  }
};

export const isTerminalOrderStatus = (status?: string): boolean => {
  return status === 'completed' || status === 'cancelled';
};

export const isCloudTerminalAdvance = (
  localOrder: Partial<PosLifecycleOrder>,
  incomingOrder: Partial<PosLifecycleOrder>
): boolean => {
  return isTerminalOrderStatus(incomingOrder.status) && !isTerminalOrderStatus(localOrder.status);
};

export const isCloudTerminalAuthoritative = (
  localOrder: Partial<PosLifecycleOrder> | undefined,
  incomingOrder: Partial<PosLifecycleOrder>,
  pendingOrderIds?: Set<string>
): boolean => {
  if (!incomingOrder.id) return false;
  if (pendingOrderIds?.has(String(incomingOrder.id)) && isTerminalOrderStatus(localOrder?.status)) return false;
  return isTerminalOrderStatus(incomingOrder.status) && getOrderSignature(localOrder || {}) !== getOrderSignature(incomingOrder);
};

export const isOrderStateRegression = (
  localOrder: Partial<PosLifecycleOrder>,
  incomingOrder: Partial<PosLifecycleOrder>
): boolean => {
  if (localOrder.stockDeducted && !incomingOrder.stockDeducted) return true;
  if (localOrder.clearedAt && !incomingOrder.clearedAt) return true;

  const localStatusRank = getOrderStatusRank(localOrder.status);
  const incomingStatusRank = getOrderStatusRank(incomingOrder.status);
  if (localStatusRank > incomingStatusRank && ['completed', 'cancelled'].includes(String(localOrder.status))) {
    return true;
  }

  return getPaymentRank(localOrder.paymentStatus) > getPaymentRank(incomingOrder.paymentStatus);
};

export const isEditableActiveOrder = (order?: Partial<PosLifecycleOrder> | null): boolean => {
  return !!order &&
    order.status !== 'completed' &&
    order.status !== 'cancelled' &&
    order.status !== 'draft';
};

export const isUnpaidActiveOrder = (order: Partial<PosLifecycleOrder>): boolean => {
  return isEditableActiveOrder(order) &&
    order.paymentStatus !== 'paid';
};

export const isDisplayablePosOrder = (order: Partial<PosLifecycleOrder>): boolean => {
  const hasOrderNumber = Boolean(String(order.orderNumber || '').trim());
  const hasItems = Array.isArray(order.items) && order.items.length > 0;
  const hasMoney = Number(order.totalAmount || 0) > 0 ||
    Number(order.paidAmount || 0) > 0 ||
    Number((order as any).settledAmount || 0) > 0;
  const hasCancellationRecord = order.status === 'cancelled' && Boolean((order as any).cancelledAt || hasItems);

  return hasOrderNumber && (hasItems || hasMoney || hasCancellationRecord);
};

export const getPosOrderCardColor = (
  status?: string,
  paymentStatus?: string,
  clearedAt?: any
): string => {
  if (paymentStatus === 'paid' && status !== 'completed' && status !== 'cancelled' && !clearedAt) {
    return '#fed7aa';
  }

  switch (status) {
    case 'confirmed':
    case 'preparing':
    case 'served':
      return '#fecaca';
    case 'completed':
    case 'cancelled':
      return '#ffffff';
    case 'draft':
    default:
      return '#f3f4f6';
  }
};

export const getPosOrderStatusText = (
  status?: string,
  paymentStatus?: string,
  clearedAt?: any
): string => {
  if (paymentStatus === 'paid' && status !== 'completed' && status !== 'cancelled' && !clearedAt) {
    return 'Pagado';
  }

  switch (status) {
    case 'draft': return 'Borrador';
    case 'confirmed': return 'Confirmado';
    case 'preparing': return 'En cocina';
    case 'served': return paymentStatus === 'paid' ? 'Pagado' : 'Servido';
    case 'completed': return 'Completado';
    case 'cancelled': return 'Cancelado';
    default: return status || '';
  }
};

export const reconcileTableStatusFromOrders = <T extends PosLifecycleTable>(
  table: T,
  orders: PosLifecycleOrder[],
  now: number = Date.now()
): T => {
  const paidOrder = orders.find(o =>
    o.tableId === table.id &&
    o.paymentStatus === 'paid' &&
    o.status !== 'completed' &&
    o.status !== 'cancelled' &&
    !o.clearedAt
  );
  const unpaidOrder = orders.find(o =>
    o.tableId === table.id &&
    isUnpaidActiveOrder(o)
  );

  let nextStatus: PosLifecycleTable['status'] = table.status;
  let nextOrderId = table.currentOrderId;

  if (paidOrder) {
    nextStatus = 'needs_cleaning';
    nextOrderId = paidOrder.id;
  } else if (unpaidOrder) {
    nextStatus = 'occupied';
    nextOrderId = unpaidOrder.id;
  } else if (table.status === 'occupied' || table.status === 'needs_cleaning') {
    nextStatus = 'available';
    nextOrderId = '';
  }

  const normalizedCurrentOrderId = nextStatus === 'available' ? '' : (nextOrderId || '');
  const currentOrderId = table.currentOrderId || '';
  if (nextStatus === table.status && normalizedCurrentOrderId === currentOrderId) {
    return table;
  }

  return {
    ...table,
    status: nextStatus,
    currentOrderId: normalizedCurrentOrderId,
    lastModified: now
  };
};

export const getPosLifecycleSnapshot = (
  order: PosLifecycleOrder,
  table: PosLifecycleTable,
  now: number = Date.now()
) => {
  const reconciledTable = reconcileTableStatusFromOrders(table, [order], now);

  return {
    orderId: order.id,
    orderStatus: order.status || '',
    paymentStatus: order.paymentStatus || '',
    isTerminal: isTerminalOrderStatus(order.status),
    orderCardColor: getPosOrderCardColor(order.status, order.paymentStatus, order.clearedAt),
    orderStatusText: getPosOrderStatusText(order.status, order.paymentStatus, order.clearedAt),
    tableStatus: reconciledTable.status,
    tableCurrentOrderId: reconciledTable.currentOrderId,
  };
};

export const hasNewerCloudOrders = (
  cloudOrders: PosLifecycleOrder[],
  localOrders: PosLifecycleOrder[],
  pendingOrderIds?: Set<string>
): boolean => {
  const localById = new Map(localOrders.map(order => [order.id, order]));

  return cloudOrders.some(cloudOrder => {
    const localOrder = localById.get(cloudOrder.id);
    if (!localOrder) return true;
    if (isCloudTerminalAuthoritative(localOrder, cloudOrder, pendingOrderIds)) return true;
    if (isCloudTerminalAdvance(localOrder, cloudOrder)) return true;
    if (isOrderStateRegression(localOrder, cloudOrder)) return false;
    return getOrderVersion(cloudOrder) > getOrderVersion(localOrder);
  });
};

export const mergeOrdersByVersion = <T extends PosLifecycleOrder>(
  localOrders: T[],
  incomingOrders: T[],
  pendingOrderIds?: Set<string>
): T[] => {
  const merged = new Map<string, T>();

  localOrders.forEach(order => {
    if (order.id) merged.set(order.id, order);
  });

  incomingOrders.forEach(incomingOrder => {
    if (!incomingOrder.id) return;
    const localOrder = merged.get(incomingOrder.id);
    if (!localOrder || isCloudTerminalAuthoritative(localOrder, incomingOrder, pendingOrderIds) || isCloudTerminalAdvance(localOrder, incomingOrder) || (!isOrderStateRegression(localOrder, incomingOrder) && getOrderVersion(incomingOrder) >= getOrderVersion(localOrder))) {
      merged.set(incomingOrder.id, incomingOrder);
    }
  });

  return Array.from(merged.values());
};
