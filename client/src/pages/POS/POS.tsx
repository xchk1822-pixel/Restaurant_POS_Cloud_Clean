import React, { useState, useEffect, useRef } from 'react';
import MenuSelection from '../../components/MenuSelection';
import SplitBillModal from '../../components/SplitBillModal';
import { useAppContext } from '../../contexts/AppContext';
import { dataService } from '../../services/DataService';
import { amountToPoints, getUSDToNioRate, getPointsExchangeRate, getLocalDateTimeString } from '../../utils/exchangeRate';
import { formatNicaraguaDateTime, formatNicaraguaTime, getLocalDateString, toTimestampMillis } from '../../utils/localTime';
import { dataManager } from '../../services/dataManager';
import { smartSetDocument, smartUpdateDocument, smartDeleteDocument, smartSubscribeToCollection, smartSubscribeToPosOrdersByDatePrefix, smartClaimOrderStockDeduction, smartGenerateDailyOrderNumber, getStableStockDeductionOperationId } from '../../services/smartSyncService';
import { colors, font, radii, shadows } from '../../styles/uiTokens';
import {
  getOrderSignature,
  getOrdersSignature,
  getPosOrderCardColor,
  getPosOrderStatusText,
  hasNewerCloudOrders,
  isDisplayablePosOrder,
  isEditableActiveOrder,
  mergeOrdersByVersion,
  reconcileTableStatusFromOrders,
} from '../../utils/posLifecycle';
import {
  buildKitchenTicketPayload,
  buildLocalPrintPayload,
  buildThermalReceiptHtml,
  buildThermalReceiptText,
  getCurrentStoreReceiptProfile,
  openBrowserPrintWindow,
  printViaLocalBridge,
} from '../../utils/receiptPrinter';
import tableFoodBackground from '../../assets/pos/table-food-background.jpg';
import tableSingleModern from '../../assets/pos/table-single-modern.png';
import tableHorizontalModern from '../../assets/pos/table-horizontal-modern.png';
import tableVerticalModern from '../../assets/pos/table-vertical-modern.png';

interface Table {
  id: string;
  number: string;
  x: number;
  y: number;
  width: number;
  height: number;
  shape?: 'round' | 'square' | 'rectangle';
  orientation?: 'horizontal' | 'vertical';
  status: 'available' | 'occupied' | 'reserved' | 'needs_cleaning';
  capacity: number;
  currentOrderId?: string;
  mergedFromTables?: Array<{
    id: string;
    number: string;
    x: number;
    y: number;
    width: number;
    height: number;
    shape?: 'round' | 'square' | 'rectangle';
    orientation?: 'horizontal' | 'vertical';
    capacity: number;
    status: 'available' | 'occupied' | 'reserved' | 'needs_cleaning';
    currentOrderId?: string;
  }>;
  lastModified?: number;
}

interface OrderItem {
  id: string;
  menuItemId: string;
  name: string;
  quantity: number;
  price: number;
  subtotal: number;
  type?: 'recipe' | 'direct';
  stockItemId?: string;
  ingredients?: Array<{
    itemId: string;
    itemName: string;
    quantity: number;
    unit: string;
  }>;
  sentToKitchen: boolean;
  sentQuantity: number;
  cancelledQuantity?: number;
  cancelRecords?: CancelRecord[];
}

interface CancelRecord {
  id: string;
  itemId: string;
  itemName: string;
  quantity: number;
  reason: string;
  cancelledBy: string;
  cancelledAt: Date;
  orderId: string;
  tableNumber: string;
  orderType: 'item' | 'order';
}

interface SplitBill {
  id: string;
  customerName: string;
  items: OrderItem[];
  subtotal: number;
  paidAmount: number;
  paymentStatus: 'unpaid' | 'paid';
}

interface Customer {
  id: string;
  name: string;
  phone: string;
  points: number; // 绉垎
  totalSpent: number; // 鎬绘秷璐?
  visitCount: number; // 娑堣垂娆℃暟
  createdAt: string;
  lastVisitAt?: string;
  notes?: string;
}

interface PointsTransaction {
  id: string;
  customerId: string;
  orderId: string;
  orderNumber?: string;
  type: 'earn' | 'redeem' | 'adjust';
  points: number;
  amount?: number;
  description: string;
  createdAt: string;
}

interface Order {
  id: string;
  orderNumber?: string;
  tableId: string;
  tableNumber: string;
  orderType: 'dine_in' | 'takeout' | 'delivery';
  deliveryType?: 'self' | 'outsourced';
  deliveryFee?: number; // 娲鹃€佽垂
  customerId?: string; // 鍏宠仈椤惧ID
  customerName?: string;
  items: OrderItem[];
  cancelRecords?: CancelRecord[];
  status: 'draft' | 'confirmed' | 'preparing' | 'served' | 'completed' | 'cancelled';

  createdAt: Date;
  updatedAt?: Date | string;
  preparingAt?: Date;
  servedAt?: Date;
  completedAt?: Date;
  clearedAt?: Date;

  totalAmount: number;
  paidAmount: number;
  paymentStatus: 'unpaid' | 'partial' | 'paid';
  lastPaidAt?: Date;
  settledAmount: number;
  splitBills?: SplitBill[];
  cancelledBy?: string;
  cancelReason?: string;
  cancelledAt?: Date;
  paymentMethod?: 'cash' | 'card' | 'mixed'; // 鏀粯鏂瑰紡
  cashAmount?: number; // 鐜伴噾鏀粯閲戦
  cardAmount?: number;
  stockDeducted?: boolean;
  stockDeductedAt?: Date;
  stockDeductedItems?: Record<string, number>;
  stockDeductionOperationId?: string;
  stockDeductionInProgress?: boolean;
  stockDeductionClaimedAt?: number;
  stockDeductionPending?: boolean;
  stockDeductionFailedAt?: number;
  stockDeductionError?: string;
  pointsProcessed?: boolean;
  pointsProcessedAt?: Date;
  pointsEarned?: number;
  pointsUsed?: number;
  pointsDiscount?: number;
  lastModified?: number;
}

interface HeldOrder {
  id: string;
  orderId?: string; // 鍏宠仈鐨勮鍗旾D
  tableId: string;
  tableNumber: string;
  items: OrderItem[];
  orderType: 'dine_in' | 'takeout' | 'delivery';
  deliveryType?: 'self' | 'outsourced';
  createdAt: Date;
  serviceFeeEnabled: boolean;
  taxEnabled: boolean;
  deliveryFee: number;
}

type PosToast = {
  id: number;
  message: string;
  tone: 'success' | 'error' | 'warning';
};

const stripUndefinedValues = (value: any): any => {
  if (Array.isArray(value)) {
    return value
      .filter(entry => entry !== undefined)
      .map(stripUndefinedValues);
  }

  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entryValue]) => entryValue !== undefined)
        .map(([entryKey, entryValue]) => [entryKey, stripUndefinedValues(entryValue)])
    );
  }

  return value;
};

const serializeDateForFirestore = (value: any): any => {
  if (value instanceof Date) {
    const time = value.getTime();
    if (!Number.isFinite(time)) {
      return undefined;
    }
    return value.toISOString();
  }

  return value;
};

const serializeOrderForFirestore = (order: Order): Record<string, any> => {
  const orderAny = order as any;
  return stripUndefinedValues({
    ...order,
    createdAt: serializeDateForFirestore(order.createdAt),
    updatedAt: serializeDateForFirestore(orderAny.updatedAt),
    preparingAt: serializeDateForFirestore(order.preparingAt),
    servedAt: serializeDateForFirestore(order.servedAt),
    completedAt: serializeDateForFirestore(order.completedAt),
    cancelledAt: serializeDateForFirestore(order.cancelledAt),
    clearedAt: serializeDateForFirestore(order.clearedAt),
    lastPaidAt: serializeDateForFirestore(order.lastPaidAt),
    stockDeductedAt: serializeDateForFirestore(order.stockDeductedAt),
    pointsProcessedAt: serializeDateForFirestore(order.pointsProcessedAt),
    lastModified: order.lastModified || Date.now(),
  });
};

const getScopedStorageKey = (key: string): string => {
  try {
    const currentUser = localStorage.getItem('current_user');
    const storeId = currentUser ? JSON.parse(currentUser).storeId : null;
    return storeId ? `store_${storeId}_${key}` : key;
  } catch {
    return key;
  }
};

const getCurrentUserRecord = (): any => {
  try {
    const currentUser = localStorage.getItem('current_user');
    return currentUser ? JSON.parse(currentUser) : null;
  } catch {
    return null;
  }
};

const getCurrentStoreIdForPrint = (): string => {
  return getCurrentUserRecord()?.storeId || dataService.getCurrentStoreId() || '';
};

const loadPendingOrderSyncIds = (): Set<string> => {
  try {
    const stored = localStorage.getItem(getScopedStorageKey('pos_pending_order_sync'));
    return stored ? new Set(JSON.parse(stored)) : new Set();
  } catch {
    return new Set();
  }
};

const savePendingOrderSyncIds = (ids: Set<string>) => {
  try {
    localStorage.setItem(getScopedStorageKey('pos_pending_order_sync'), JSON.stringify(Array.from(ids)));
  } catch (error) {
    console.error('POS operation failed:', error);
  }
};

const waitForNextPaint = () => new Promise<void>(resolve => {
  if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
    Promise.resolve().then(resolve);
    return;
  }

  window.requestAnimationFrame(() => resolve());
});

const getTablesSignature = (tables: Array<Partial<Table>> = []): string => {
  return JSON.stringify(
    [...tables]
      .map(table => ({
        id: table.id,
        number: table.number,
        x: table.x,
        y: table.y,
        width: table.width,
        height: table.height,
        shape: table.shape || null,
        orientation: table.orientation || null,
        status: table.status,
        capacity: table.capacity,
        currentOrderId: table.currentOrderId || null,
        mergedFromTables: table.mergedFromTables || null,
        lastModified: table.lastModified || null
      }))
      .sort((a, b) => String(a.id).localeCompare(String(b.id)))
  );
};

const getTableSignature = (table: Partial<Table>): string => getTablesSignature([table]);

const getTableVersion = (table: Partial<Table>): number => {
  const version = Number(table.lastModified || 0);
  return Number.isFinite(version) ? version : 0;
};

const getTableDedupeKey = (table: Partial<Table>): string => {
  const number = String(table.number || '').trim();
  return number ? `number:${number}` : `id:${table.id}`;
};

const inferTableShape = (
  table: Partial<Table>,
  width: number,
  height: number
): 'round' | 'square' | 'rectangle' => {
  if (table.shape && table.shape !== 'round') return table.shape;

  const number = String(table.number || '');
  if (width > height * 1.75 || height > width * 1.75) {
    return 'rectangle';
  }

  return number.includes('+') ? 'rectangle' : 'square';
};

const normalizeTables = (
  rawTables: Table[],
  preferredTableIds: Set<string> = new Set()
): { tables: Table[]; duplicates: Table[] } => {
  const byKey = new Map<string, Table>();
  const duplicates: Table[] = [];

  const getScore = (table: Table): number => {
    let score = getTableVersion(table);
    if (preferredTableIds.has(table.id)) score += 1_000_000_000_000_000;
    if (table.currentOrderId) score += 500_000_000_000_000;
    return score;
  };

  rawTables.forEach(table => {
    if (!table || !table.id) return;

    const normalizedWidth = table.width || 110;
    const normalizedHeight = table.height || 90;
    const normalizedOrientation = table.orientation || (normalizedWidth >= normalizedHeight ? 'horizontal' : 'vertical');
    const normalizedShape = inferTableShape(table, normalizedWidth, normalizedHeight);

    const normalizedTable: Table = {
      ...table,
      width: normalizedWidth,
      height: normalizedHeight,
      shape: normalizedShape,
      orientation: normalizedOrientation,
      status: table.status || 'available',
      capacity: table.capacity || 4,
      number: String(table.number || '').trim() || String(table.id),
      currentOrderId: table.currentOrderId || '',
      lastModified: getTableVersion(table)
    };

    const key = getTableDedupeKey(normalizedTable);
    const existing = byKey.get(key);

    if (!existing) {
      byKey.set(key, normalizedTable);
      return;
    }

    if (getScore(normalizedTable) > getScore(existing)) {
      duplicates.push(existing);
      byKey.set(key, normalizedTable);
    } else {
      duplicates.push(normalizedTable);
    }
  });

  return {
    tables: Array.from(byKey.values()),
    duplicates
  };
};

const mergeTablesByVersion = (
  localTables: Table[],
  incomingTables: Table[],
  preferredTableIds: Set<string> = new Set(),
  dirtyTableIds: Set<string> = new Set()
): Table[] => {
  const merged = new Map<string, Table>();

  localTables.forEach(localTable => {
    if (localTable?.id) merged.set(localTable.id, localTable);
  });

  incomingTables.forEach(incomingTable => {
    if (!incomingTable?.id) return;
    const localTable = merged.get(incomingTable.id);
    if (!localTable) {
      merged.set(incomingTable.id, incomingTable);
      return;
    }
    if (dirtyTableIds.has(localTable.id) && getTableVersion(localTable) > getTableVersion(incomingTable)) {
      return;
    }
    merged.set(incomingTable.id, incomingTable);
  });

  return normalizeTables(Array.from(merged.values()), preferredTableIds).tables;
};

const getMergedTableBounds = (tables: Array<Pick<Table, 'x' | 'y' | 'width' | 'height'>>) => {
  const minX = Math.min(...tables.map(table => table.x));
  const minY = Math.min(...tables.map(table => table.y));
  const maxX = Math.max(...tables.map(table => table.x + (table.width || 110)));
  const maxY = Math.max(...tables.map(table => table.y + (table.height || 90)));
  const width = Math.max(110, maxX - minX);
  const height = Math.max(90, maxY - minY);
  const orientation: 'horizontal' | 'vertical' = width >= height ? 'horizontal' : 'vertical';

  return { x: minX, y: minY, width, height, orientation };
};

const toDisplayDate = (value: any): Date | null => {
  const timestamp = toTimestampMillis(value);
  return timestamp ? new Date(timestamp) : null;
};

const formatOrderTime = (value: any): string => {
  return formatNicaraguaTime(value);
};

const getOrderListTimeValue = (order: Partial<Order>): any => {
  if (order.status === 'cancelled') {
    return order.cancelledAt || order.createdAt || order.preparingAt || order.updatedAt;
  }

  return order.createdAt || order.preparingAt || order.completedAt || order.updatedAt || order.lastModified;
};

const isOrderFromDatePrefix = (order: Partial<Order>, datePrefix: string): boolean => {
  const orderNumber = String(order.orderNumber || '').trim();
  if (orderNumber.startsWith(datePrefix)) return true;

  const orderDate = toDisplayDate(getOrderListTimeValue(order));
  if (!orderDate) return false;

  const date = getLocalDateString(orderDate);
  return `${date.slice(5, 7)}${date.slice(8, 10)}` === datePrefix;
};

const isPaidAwaitingClear = (order: Partial<Order>): boolean => {
  return order.paymentStatus === 'paid' &&
    order.status !== 'completed' &&
    order.status !== 'cancelled' &&
    !order.clearedAt;
};

const getPosOrderSummaryAmount = (order: Partial<Order>): number => {
  if (order.status === 'cancelled') return 0;
  return Number(order.totalAmount || 0);
};

const tableCanvasFoodPattern = [
  'linear-gradient(rgba(248,250,252,0.34), rgba(248,250,252,0.42))',
  `url(${tableFoodBackground})`,
  'linear-gradient(rgba(255,255,255,0.25) 1px, transparent 1px)',
  'linear-gradient(90deg, rgba(255,255,255,0.25) 1px, transparent 1px)',
].join(', ');

const posOrderTypeLabels: Record<'dine_in' | 'takeout' | 'delivery', string> = {
  dine_in: 'Mesa',
  takeout: 'Barra',
  delivery: 'Delivery',
};

const posOrderTypeIcons: Record<'dine_in' | 'takeout' | 'delivery', string> = {
  dine_in: '🍽️',
  takeout: '🥡',
  delivery: '🚚',
};

const formatPosOrderType = (type: 'dine_in' | 'takeout' | 'delivery') => `${posOrderTypeIcons[type]} ${posOrderTypeLabels[type]}`;

const posPanelStyle: React.CSSProperties = {
  backgroundColor: colors.surface,
  borderRadius: radii.lg,
  boxShadow: shadows.soft,
  border: `1px solid ${colors.border}`,
  overflow: 'hidden',
};

const posMutedPanelStyle: React.CSSProperties = {
  backgroundColor: colors.surfaceMuted,
  border: `1px solid ${colors.border}`,
  borderRadius: radii.md,
};

const POS: React.FC = () => {
  const { deductStock, orders: appOrders, setOrders: setAppOrders } = useAppContext();
  const localOrdersSignatureRef = useRef('');
  const publishedOrdersSignatureRef = useRef('');
  const publishedOrderSignaturesRef = useRef<Map<string, string>>(new Map());
  const pendingOrderSyncIdsRef = useRef<Set<string>>(loadPendingOrderSyncIds());
  const orderPublisherReadyRef = useRef(false);
  const localTablesSignatureRef = useRef('');
  const publishedTablesSignatureRef = useRef('');
  const publishedTableSignaturesRef = useRef<Map<string, string>>(new Map());
  const dirtyTableIdsRef = useRef<Set<string>>(new Set());
  const tablePublisherReadyRef = useRef(false);
  const tableCloudHydratedRef = useRef(false);
  const tableUserEditPendingRef = useRef(false);
  const dragAnimationFrameRef = useRef<number | null>(null);
  const pendingDragPositionRef = useRef<{ x: number; y: number } | null>(null);
  const deletedTableIdsRef = useRef<Set<string>>(new Set());
  const activeOrderTableIdsRef = useRef<Set<string>>(new Set());
  const pointsProcessingOrderIdsRef = useRef<Set<string>>(new Set());

  const publishOrderImmediately = async (order: Order) => {
    pendingOrderSyncIdsRef.current.add(order.id);
    savePendingOrderSyncIds(pendingOrderSyncIdsRef.current);

    try {
      const publishResult = await smartUpdateDocument('pos_orders', order.id, serializeOrderForFirestore(order));
      if (publishResult?.pending || publishResult?.success === false) {
        return publishResult;
      }
      publishedOrderSignaturesRef.current.set(order.id, getOrderSignature(order));
      pendingOrderSyncIdsRef.current.delete(order.id);
      savePendingOrderSyncIds(pendingOrderSyncIdsRef.current);
      return publishResult;
    } catch (error) {
      pendingOrderSyncIdsRef.current.add(order.id);
      savePendingOrderSyncIds(pendingOrderSyncIdsRef.current);
      throw error;
    }
  };

  // 绂佹椤甸潰鏁翠綋婊氬姩
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
      if (dragAnimationFrameRef.current !== null) {
        window.cancelAnimationFrame(dragAnimationFrameRef.current);
      }
    };
  }, []);

  const loadFromStorage = <T,>(key: string, defaultValue: T, possibleKeys?: string[]): T => {
    try {
      const currentUser = localStorage.getItem('current_user');
      const storeId = currentUser ? JSON.parse(currentUser).storeId : null;
      const storeKey = storeId ? `store_${storeId}_${key}` : null;
      const keysToTry = [
        ...(storeKey ? [storeKey] : []),
        ...(possibleKeys || [key])
      ];

      for (const k of keysToTry) {
        const stored = localStorage.getItem(k);
        if (stored) {
          const parsed = JSON.parse(stored);

          if (storeKey && k !== storeKey) {
            localStorage.setItem(storeKey, stored);
          }

          if (Array.isArray(parsed)) {
            return parsed.map(item => ({
              ...item,
              createdAt: item.createdAt ? new Date(item.createdAt) : undefined,
              confirmedAt: item.confirmedAt ? new Date(item.confirmedAt) : undefined,
              completedAt: item.completedAt ? new Date(item.completedAt) : undefined,
              cancelledAt: item.cancelledAt ? new Date(item.cancelledAt) : undefined,
              clearedAt: item.clearedAt ? new Date(item.clearedAt) : undefined,
              preparingAt: item.preparingAt ? new Date(item.preparingAt) : undefined,
              servedAt: item.servedAt ? new Date(item.servedAt) : undefined,
              lastPaidAt: item.lastPaidAt ? new Date(item.lastPaidAt) : undefined,
              lastModified: item.lastModified || (item.createdAt ? new Date(item.createdAt).getTime() : Date.now()),
            })) as unknown as T;
          }
          return parsed;
        }
      }
    } catch (error) {
      console.error('POS operation failed:', error);
    }
    return defaultValue;
  };

  const saveToStorage = (key: string, data: any) => {
    try {
      const currentUser = localStorage.getItem('current_user');
      const storeId = currentUser ? JSON.parse(currentUser).storeId : null;
      const storageKey = storeId ? `store_${storeId}_${key}` : key;
      localStorage.setItem(storageKey, JSON.stringify(data));

      // 保存本地分店缓存，云端同步由订单增量同步逻辑处理。
    } catch (error) {
      console.error('POS operation failed:', error);
    }
  };

  const filterCachedOrdersForStartup = (cachedOrders: Order[]): Order[] => {
    return cachedOrders;
  };

  const generateOrderId = () => {
    return `order-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  };

  const [viewMode, setViewMode] = useState<'overview' | 'order' | 'split-bill'>('overview');
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  const [serviceFeeEnabled, setServiceFeeEnabled] = useState(false);
  const [taxEnabled, setTaxEnabled] = useState(false);
  const [deliveryFee, setDeliveryFee] = useState(0);
  const [deliveryType, setDeliveryType] = useState<'self' | 'outsourced'>('self');

  // 鎶樻墸鍔熻兘
  const [discountEnabled, setDiscountEnabled] = useState(false);
  const [discountType, setDiscountType] = useState<'percentage' | 'fixed'>('percentage');
  const [discountValue, setDiscountValue] = useState<number>(0); // Discount value: percentage or fixed amount.
  const [discountReason, setDiscountReason] = useState(''); // Discount reason.

  // 绉垎鍏戞崲
  const [pointsRedemptionEnabled, setPointsRedemptionEnabled] = useState(false);
  const [pointsToUse, setPointsToUse] = useState<number>(0);
  // 浣跨敤鍏ㄥ眬绉垎鍏戞崲鐜?
  const pointsExchangeRate = getPointsExchangeRate();
  const [orderType, setOrderType] = useState<'dine_in' | 'takeout' | 'delivery'>('dine_in');

  // 浣跨敤鍏ㄥ眬姹囩巼
  const exchangeRate = getUSDToNioRate();

  const [cashNIO, setCashNIO] = useState('');
  const [cashUSD, setCashUSD] = useState('');
  const [cardNIO, setCardNIO] = useState('');
  const [cardUSD, setCardUSD] = useState('');

  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const paymentProcessingRef = useRef(false);
  const [clearingOrderId, setClearingOrderId] = useState<string | null>(null);
  const [completingOrderIds, setCompletingOrderIds] = useState<Set<string>>(() => new Set());
  const [finalizingOrderIds, setFinalizingOrderIds] = useState<Set<string>>(() => new Set());
  const [posToast, setPosToast] = useState<PosToast | null>(null);

  const markOrderFinalizing = (orderId: string) => {
    setFinalizingOrderIds(prev => {
      const next = new Set(prev);
      next.add(orderId);
      return next;
    });
  };

  const clearOrderFinalizing = (orderId: string) => {
    setFinalizingOrderIds(prev => {
      const next = new Set(prev);
      next.delete(orderId);
      return next;
    });
  };

  const showPosToast = (message: string, tone: PosToast['tone'] = 'success') => {
    const id = Date.now();
    setPosToast({ id, message, tone });
    window.setTimeout(() => {
      setPosToast(current => current?.id === id ? null : current);
    }, tone === 'error' ? 5200 : 3200);
  };

  const getCompletionErrorMessage = (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error || '');
    const insufficientStockPrefix = 'insufficient-stock:';
    if (message.includes(insufficientStockPrefix)) {
      const itemName = message.split(insufficientStockPrefix)[1]?.split('\n')[0]?.trim() || 'producto';
      return `Inventario insuficiente: ${itemName}. Ajuste inventario y vuelva a intentar.`;
    }
    return 'No se pudo sincronizar. Revise la red e intente de nuevo.';
  };

  const [deductedOrderIds, setDeductedOrderIds] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem(getScopedStorageKey('pos_deducted_orders'));
      if (saved) {
        return new Set(JSON.parse(saved));
      }
    } catch (error) {
      console.error('POS operation failed:', error);
    }
    return new Set();
  });

  const [orderTypeFilter, setOrderTypeFilter] = useState<'all' | 'dine_in' | 'takeout' | 'delivery'>('all');
  const [showAddTableModal, setShowAddTableModal] = useState(false);
  const [editingTable, setEditingTable] = useState<any>(null);
  const [newTableName, setNewTableName] = useState('');
  const [isEditMode, setIsEditMode] = useState(false);
  const [draggedTable, setDraggedTable] = useState<string | null>(null);
  const [selectedTables, setSelectedTables] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  const [tables, setTables] = useState<Table[]>(() => {
    const loadedTables = loadFromStorage<Table[]>('pos_tables', [
      { id: '1', number: '1', x: 50, y: 50, width: 80, height: 60, status: 'available', capacity: 4 },
      { id: '2', number: '2', x: 150, y: 50, width: 80, height: 60, status: 'available', capacity: 4 },
      { id: '3', number: '3', x: 250, y: 50, width: 80, height: 60, status: 'available', capacity: 2 },
      { id: '4', number: '4', x: 50, y: 150, width: 80, height: 60, status: 'available', capacity: 6 },
      { id: '5', number: '5', x: 150, y: 150, width: 80, height: 60, status: 'available', capacity: 4 },
      { id: '6', number: '6', x: 250, y: 150, width: 80, height: 60, status: 'available', capacity: 2 },
    ], [
      'pos_tables',
      'tables',
      'restaurant_tables'
    ]);
    return normalizeTables(loadedTables).tables;
  });

  const [orders, setOrders] = useState<Order[]>(() => {
    const saved = loadFromStorage<Order[]>('pos_orders', [], [
      'pos_orders',
      'restaurant_pos_orders',
      'orders'
    ]);

    const seenIds = new Set();
    const fixedOrders = filterCachedOrdersForStartup(saved);
    const normalizedOrders = fixedOrders.filter(order => {
      // Remove duplicate ids loaded from older local cache.
      if (seenIds.has(order.id)) {
        return false;
      }
      seenIds.add(order.id);

      // 保留所有订单，避免桌台布局变动导致当前订单列表消失。

      if (!order.createdAt) {
        (order as any).createdAt = order.preparingAt || getLocalDateTimeString();
      }

      if (order.status === 'served' && !order.servedAt) {
        (order as any).servedAt = order.createdAt || getLocalDateTimeString();
      }

      if (order.status === 'completed' && !order.completedAt) {
        (order as any).completedAt = order.servedAt || order.createdAt || getLocalDateTimeString();
      }

      if (order.status === 'completed' && !order.servedAt) {
        (order as any).servedAt = order.createdAt || getLocalDateTimeString();
      }

      return true;
    });

    return normalizedOrders;
  });

  useEffect(() => {
    activeOrderTableIdsRef.current = new Set(
      orders
        .filter(order =>
          Boolean(order.tableId) &&
          order.status !== 'cancelled' &&
          (
            order.status !== 'completed' ||
            !order.clearedAt
          )
        )
        .map(order => order.tableId)
    );
  }, [orders]);



  const markTableUserEdit = (tableId?: string) => {
    tableUserEditPendingRef.current = true;
    if (tableId) {
      dirtyTableIdsRef.current.add(tableId);
    }
  };

  const [customers, setCustomers] = useState<Customer[]>(() => {
    return dataManager.getData('customers');
  });

  useEffect(() => {
    const unsubscribe = dataManager.subscribe('customers', (newCustomers) => {
      setCustomers(newCustomers);
    });
    return () => unsubscribe();
  }, []);
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerSearch, setCustomerSearch] = useState('');
  const [showNewCustomerForm, setShowNewCustomerForm] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');

  const [currentItems, setCurrentItems] = useState<OrderItem[]>([]);

  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelPassword, setCancelPassword] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);
  const [cancelAction, setCancelAction] = useState<'delete' | 'reduce' | 'add'>('delete');
  const managerAuthorizationPasswords = ['admin123', '123456'];
  const [cancelRecords, setCancelRecords] = useState<CancelRecord[]>([]);

  const getCurrentOrderCancelRecords = (orderId?: string, extraRecords: CancelRecord[] = []): CancelRecord[] => {
    const targetOrderId = orderId || selectedOrderId || 'draft-order';
    const shouldAttachDraftRecords = !selectedOrderId;

    return [...cancelRecords, ...extraRecords].filter(record =>
      record.orderType === 'item' &&
      (
        record.orderId === targetOrderId ||
        (shouldAttachDraftRecords && record.orderId === 'draft-order')
      )
    );
  };

  const mergeOrderCancelRecords = (order: Order, orderId?: string, extraRecords: CancelRecord[] = []): Order => {
    const currentRecords = getCurrentOrderCancelRecords(orderId || order.id, extraRecords);
    if (currentRecords.length === 0) return order;

    const existingRecords = Array.isArray(order.cancelRecords) ? order.cancelRecords : [];
    const existingIds = new Set(existingRecords.map(record => record.id));
    const recordsToAppend = currentRecords
      .filter(record => !existingIds.has(record.id))
      .map(record => record.orderId === 'draft-order' ? { ...record, orderId: order.id } : record);

    if (recordsToAppend.length === 0) return order;

    return {
      ...order,
      cancelRecords: [...existingRecords, ...recordsToAppend]
    };
  };

  const [heldOrders, setHeldOrders] = useState<HeldOrder[]>(() => {
    return loadFromStorage<HeldOrder[]>('pos_held_orders', [], [
      'pos_held_orders',
      'held_orders'
    ]);
  });
  const [showHeldOrders, setShowHeldOrders] = useState(false);

  const [showTableActionModal, setShowTableActionModal] = useState(false);
  const [tableActionData, setTableActionData] = useState<{ tableId: string; tableNumber: string; orderId: string } | null>(null);

  useEffect(() => {
    const syncPOSData = async () => {

      try {
        // Load cached table layout before the cloud snapshot arrives.
        const tablesData = dataService.getData('pos_tables');

        if (tablesData.length > 0) {
          const normalized = normalizeTables(tablesData as Table[], activeOrderTableIdsRef.current);
          normalized.duplicates.forEach(table => {
            deletedTableIdsRef.current.add(table.id);
            smartDeleteDocument('pos_tables', table.id).catch(error => {
              console.error('delete duplicate table failed:', table.id, error);
            });
          });
          setTables(normalized.tables);
        }

        const ordersData = dataService.getData('pos_orders');
        if (ordersData.length > 0) {
          const today = getLocalDateString();
          const todayOrderPrefix = `${today.slice(5, 7)}${today.slice(8, 10)}`;
          const cachedOrdersForMerge = (ordersData as Order[]).filter(order => {
            if (pendingOrderSyncIdsRef.current.has(order.id)) return true;
            return !isOrderFromDatePrefix(order, todayOrderPrefix);
          });
          if (cachedOrdersForMerge.length > 0) {
            setOrders(prevOrders => mergeOrdersByVersion(prevOrders, cachedOrdersForMerge, pendingOrderSyncIdsRef.current));
          }
        }

        // 鍚屾鎸傚崟
        const heldOrdersData = dataService.getData('pos_held_orders');
        if (heldOrdersData.length > 0) {
          setHeldOrders(heldOrdersData);
        }

        // 鍚屾鍙栨秷璁板綍
        const cancelRecordsData = dataService.getData('pos_cancel_records');
        if (cancelRecordsData.length > 0) {
          setCancelRecords(cancelRecordsData);
        }
      } catch (error) {
        console.error('POS operation failed:', error);
      }
    };

    syncPOSData();

    window.addEventListener('dataSynced', syncPOSData);
    return () => {
      window.removeEventListener('dataSynced', syncPOSData);
    };
  }, []);

  useEffect(() => {
    const unsubscribe = smartSubscribeToCollection('pos_tables', (cloudTables) => {
      if (!cloudTables || cloudTables.length === 0) {
        saveToStorage('pos_tables', []);
        tableCloudHydratedRef.current = true;
        localTablesSignatureRef.current = getTablesSignature([]);
        publishedTablesSignatureRef.current = getTablesSignature([]);
        setTables([]);
        return;
      }

      const incomingTables = (cloudTables as Table[])
        .filter(table => !deletedTableIdsRef.current.has(table.id));
      const normalized = normalizeTables(incomingTables, activeOrderTableIdsRef.current);
      normalized.duplicates.forEach(table => {
        deletedTableIdsRef.current.add(table.id);
        smartDeleteDocument('pos_tables', table.id).catch(error => {
          console.error('POS operation failed:', table.id, error);
        });
      });

      tableCloudHydratedRef.current = true;
      setTables(prevTables => {
        const mergedTables = mergeTablesByVersion(
          prevTables,
          normalized.tables,
          activeOrderTableIdsRef.current,
          dirtyTableIdsRef.current
        );
        const mergedTablesSignature = getTablesSignature(mergedTables);
        saveToStorage('pos_tables', mergedTables);

        if (mergedTablesSignature === localTablesSignatureRef.current) {
          return prevTables;
        }

        localTablesSignatureRef.current = mergedTablesSignature;
        publishedTablesSignatureRef.current = mergedTablesSignature;
        publishedTableSignaturesRef.current = new Map(
          mergedTables.map(table => [table.id, getTableSignature(table)])
        );
        return mergedTables;
      });
    });

    return () => unsubscribe();
  }, []);


  useEffect(() => {
    const now = Date.now();
    let hasChanges = false;
    const changedTableIds = new Set<string>();
    const reconciledTables = tables.map(table => {
      const nextTable = reconcileTableStatusFromOrders(table, orders, now);
      if (nextTable !== table) {
        hasChanges = true;
        changedTableIds.add(table.id);
      }
      return nextTable;
    });

    if (!hasChanges) {
      return;
    }

    if (tableCloudHydratedRef.current) {
      changedTableIds.forEach(tableId => markTableUserEdit(tableId));
    }
    setTables(reconciledTables);
  }, [orders, tables]);

  useEffect(() => {
    saveToStorage('pos_cancel_records', cancelRecords);
  }, [cancelRecords]);

  useEffect(() => {
    saveToStorage('pos_held_orders', heldOrders);
  }, [heldOrders]);

  useEffect(() => {
    const normalized = normalizeTables(tables, activeOrderTableIdsRef.current);
    if (normalized.duplicates.length > 0) {
      normalized.duplicates.forEach(table => {
        deletedTableIdsRef.current.add(table.id);
        smartDeleteDocument('pos_tables', table.id).catch(error => {
          console.error('POS operation failed:', table.id, error);
        });
      });
      setTables(normalized.tables);
      return;
    }

    saveToStorage('pos_tables', tables);
    const tablesSignature = getTablesSignature(tables);
    localTablesSignatureRef.current = tablesSignature;

    if (!tableCloudHydratedRef.current) {
      tablePublisherReadyRef.current = false;
      return;
    }

    if (!tablePublisherReadyRef.current) {
      tablePublisherReadyRef.current = true;
      publishedTablesSignatureRef.current = tablesSignature;
      publishedTableSignaturesRef.current = new Map(
        tables.map(table => [table.id, getTableSignature(table)])
      );
      return;
    }

    if (!tableUserEditPendingRef.current) {
      return;
    }

    if (tables.length === 0 || tablesSignature === publishedTablesSignatureRef.current) {
      tableUserEditPendingRef.current = false;
      return;
    }

    const dirtyTableIds = dirtyTableIdsRef.current;
    const previousTableSignatures = publishedTableSignaturesRef.current;
    const tablesToPublish = tables.filter(table => {
      if (dirtyTableIds.size > 0) {
        return dirtyTableIds.has(table.id);
      }
      return previousTableSignatures.get(table.id) !== getTableSignature(table);
    });

    publishedTablesSignatureRef.current = tablesSignature;
    tableUserEditPendingRef.current = false;
    dirtyTableIdsRef.current = new Set();
    tablesToPublish.forEach(table => {
      previousTableSignatures.set(table.id, getTableSignature(table));
      smartUpdateDocument('pos_tables', table.id, table).catch(error => {
        console.error('POS operation failed:', table.id, error);
      });
    });
  }, [tables]);

  // 同步订单到本地和全局上下文。
  React.useEffect(() => {
    try {
      const seenIds = new Set();
      const uniqueOrders = orders.filter(order => {
        if (seenIds.has(order.id)) {
          console.warn('removed duplicate order:', order.id);
          return false;
        }
        seenIds.add(order.id);
        return true;
      });

      const uniqueOrdersSignature = getOrdersSignature(uniqueOrders);
      if (uniqueOrdersSignature === localOrdersSignatureRef.current) {
        return;
      }

      saveToStorage('pos_orders', uniqueOrders);
      localOrdersSignatureRef.current = uniqueOrdersSignature;

      setAppOrders(prevOrders => {
        if (getOrdersSignature(prevOrders as Order[]) === uniqueOrdersSignature) {
          return prevOrders;
        }
        return uniqueOrders;
      });

      const publishedSignatures = publishedOrderSignaturesRef.current;
      const pendingIds = pendingOrderSyncIdsRef.current;

      if (!orderPublisherReadyRef.current) {
        uniqueOrders.forEach(order => {
          if (!pendingIds.has(order.id)) {
            publishedSignatures.set(order.id, getOrderSignature(order));
          }
        });
        orderPublisherReadyRef.current = true;
      }

      const currentOrderIds = new Set(uniqueOrders.map(order => order.id));
      Array.from(publishedSignatures.keys()).forEach(orderId => {
        if (!currentOrderIds.has(orderId)) {
          publishedSignatures.delete(orderId);
        }
      });

      const ordersToPublish = uniqueOrders.filter(order => {
        return pendingIds.has(order.id);
      });

      if (ordersToPublish.length > 0) {
      }

      ordersToPublish.forEach(async order => {
        const orderSignature = getOrderSignature(order);
        const orderData = serializeOrderForFirestore(order);

        try {
          const publishResult = await smartUpdateDocument('pos_orders', order.id, orderData);
          if (publishResult?.pending || publishResult?.success === false) {
            pendingIds.add(order.id);
            savePendingOrderSyncIds(pendingIds);
            return;
          }

          publishedSignatures.set(order.id, orderSignature);
          if (pendingIds.delete(order.id)) {
            savePendingOrderSyncIds(pendingIds);
          }
        } catch (error) {
          pendingIds.add(order.id);
          savePendingOrderSyncIds(pendingIds);
          console.error('POS operation failed:', order.id, error);
        }
      });

      if (false && uniqueOrdersSignature !== publishedOrdersSignatureRef.current) {
        publishedOrdersSignatureRef.current = uniqueOrdersSignature;
        uniqueOrders.forEach(order => {
          const orderAny = order as any;
          const orderData: any = {
            ...order,
            createdAt: order.createdAt instanceof Date ? order.createdAt.toISOString() : order.createdAt,
            updatedAt: orderAny.updatedAt instanceof Date ? orderAny.updatedAt.toISOString() : orderAny.updatedAt,
            preparingAt: order.preparingAt instanceof Date ? order.preparingAt.toISOString() : order.preparingAt,
            completedAt: order.completedAt instanceof Date ? order.completedAt.toISOString() : order.completedAt,
            clearedAt: order.clearedAt instanceof Date ? order.clearedAt.toISOString() : order.clearedAt,
            stockDeductedAt: order.stockDeductedAt instanceof Date ? order.stockDeductedAt.toISOString() : order.stockDeductedAt,
            pointsProcessedAt: order.pointsProcessedAt instanceof Date ? order.pointsProcessedAt.toISOString() : order.pointsProcessedAt,
            lastModified: order.lastModified || Date.now(),
          };
          smartUpdateDocument('pos_orders', order.id, orderData).catch(error => {
            console.error('POS operation failed:', order.id, error);
          });
        });
      }

      dataManager.saveData('orders', uniqueOrders, { syncFirestore: false });
    } catch (error) {
      console.error('POS operation failed:', error);
    }
  }, [orders, setAppOrders]);

  const applyIncomingCloudOrders = React.useCallback((incomingOrders: Order[]) => {
    const today = getLocalDateString();
    const todayOrderPrefix = `${today.slice(5, 7)}${today.slice(8, 10)}`;

    if (!incomingOrders || incomingOrders.length === 0) {
      console.warn('POS received empty current-day order snapshot; preserving local orders.');
      return;
    }
    const incomingById = new Map(incomingOrders.map(order => [order.id, order]));
    setOrders(prevOrders => {
      const cloudReconciledOrders = prevOrders.filter(order => {
        if (pendingOrderSyncIdsRef.current.has(order.id)) return true;
        if (!isOrderFromDatePrefix(order, todayOrderPrefix)) return true;
        return incomingById.has(order.id);
      });
      const removedByCloudSnapshot = cloudReconciledOrders.length !== prevOrders.length;

      if (!removedByCloudSnapshot && !hasNewerCloudOrders(incomingOrders, prevOrders, pendingOrderSyncIdsRef.current)) {
        return prevOrders;
      }

      const mergedOrders = mergeOrdersByVersion(cloudReconciledOrders, incomingOrders, pendingOrderSyncIdsRef.current);
      const mergedOrdersSignature = getOrdersSignature(mergedOrders);
      if (mergedOrdersSignature === localOrdersSignatureRef.current) return prevOrders;
      if (mergedOrdersSignature === getOrdersSignature(prevOrders)) return prevOrders;

      localOrdersSignatureRef.current = mergedOrdersSignature;
      publishedOrdersSignatureRef.current = mergedOrdersSignature;
      mergedOrders.forEach(order => {
        const incomingOrder = incomingById.get(order.id);
        const mergedOrderSignature = getOrderSignature(order);
        const cloudMatchesMergedOrder = Boolean(
          incomingOrder &&
          getOrderSignature(incomingOrder) === mergedOrderSignature
        );

        if (cloudMatchesMergedOrder || !pendingOrderSyncIdsRef.current.has(order.id)) {
          publishedOrderSignaturesRef.current.set(order.id, mergedOrderSignature);
        }

        if (cloudMatchesMergedOrder) {
          pendingOrderSyncIdsRef.current.delete(order.id);
        }
      });
      savePendingOrderSyncIds(pendingOrderSyncIdsRef.current);
      return mergedOrders;
    });
  }, []);

  React.useEffect(() => {
    const today = getLocalDateString();
    const todayOrderPrefixForSubscription = `${today.slice(5, 7)}${today.slice(8, 10)}`;
    return smartSubscribeToPosOrdersByDatePrefix(todayOrderPrefixForSubscription, data => {
      applyIncomingCloudOrders(data as Order[]);
    });
  }, [applyIncomingCloudOrders]);

  React.useEffect(() => {
    if (!appOrders || appOrders.length === 0) return;
    applyIncomingCloudOrders(appOrders as Order[]);
  }, [appOrders, applyIncomingCloudOrders]);

  useEffect(() => {
    if (orders.length > 0) return;

    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      const storedOrders = loadFromStorage<Order[]>('pos_orders', []);
      const filteredStoredOrders = filterCachedOrdersForStartup(storedOrders);
      if (filteredStoredOrders.length > 0) {
        setOrders(prevOrders => prevOrders.length > 0 ? prevOrders : filteredStoredOrders);
        window.clearInterval(timer);
      } else if (attempts >= 10) {
        window.clearInterval(timer);
      }
    }, 1500);

    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders.length]);

  const handleTableSelect = (tableId: string) => {
    const table = tables.find(t => t.id === tableId);
    if (!table) return;


    if (table.status === 'needs_cleaning') {
      const paidOrder = orders.find(o => {
        const matchesTableId = o.tableId === tableId ||
                              (o.tableId && o.tableId.startsWith('split-merged') && tableId && tableId.startsWith('split-merged'));
        return matchesTableId && isPaidAwaitingClear(o);
      });

      if (paidOrder) {
        setTableActionData({
          tableId: tableId,
          tableNumber: table.number,
          orderId: paidOrder.id
        });
        setShowTableActionModal(true);
        return;
      } else {
        console.error('table is needs_cleaning but matching order was not found');
      }
    }

    const existingOrder = orders.find(o =>
      o.tableId === tableId &&
      o.status !== 'completed' &&
      o.status !== 'cancelled' &&
      o.status !== 'draft'
    );


    const paidButNotClearedOrder = orders.find(o =>
      o.tableId === tableId &&
      isPaidAwaitingClear(o) &&
      !o.clearedAt
    );

    if (paidButNotClearedOrder) {
      setTableActionData({
        tableId: tableId,
        tableNumber: table.number,
        orderId: paidButNotClearedOrder.id
      });
      setShowTableActionModal(true);
      return;
    }

    if (existingOrder && existingOrder.paymentStatus === 'paid') {
      setTableActionData({
        tableId: tableId,
        tableNumber: table.number,
        orderId: existingOrder.id
      });
      setShowTableActionModal(true);
      return;
    }

    setSelectedTableId(tableId);

    if (existingOrder) {
      setCurrentItems(existingOrder.items.map(item => ({...item})));
      setSelectedOrderId(existingOrder.id);
      if (existingOrder.customerId) {
        const customer = customers.find(c => c.id === existingOrder.customerId);
        if (customer) {
          setSelectedCustomer(customer);
        }
      }
      setServiceFeeEnabled(false);
      setTaxEnabled(false);
      setDeliveryFee(0);
      setCashNIO('');
      setCashUSD('');
      setCardNIO('');
      setCardUSD('');
      setViewMode('order');
    } else {


      setCurrentItems([]);
      setSelectedOrderId(null);
      setServiceFeeEnabled(false);
      setTaxEnabled(false);
      setDeliveryFee(0);
      setCashNIO('');
      setCashUSD('');
      setCardNIO('');
      setCardUSD('');
      setShowCustomerModal(true);
    }
  };

  // 椤惧绠＄悊鍑芥暟
  const handleSelectCustomer = (customer: Customer) => {
    setSelectedCustomer(customer);
    setShowCustomerModal(false);
    setViewMode('order');
  };

  const handleCreateCustomer = async () => {
    if (!newCustomerName.trim()) {
      alert('Ingrese el nombre del cliente');
      return;
    }

    const newCustomer: Customer = {
      id: 'cust-' + Date.now(),
      name: newCustomerName.trim(),
      phone: newCustomerPhone.trim(),
      points: 0,
      totalSpent: 0,
      visitCount: 0,
      createdAt: getLocalDateTimeString(),
    };

    const nextCustomers = [...customers, newCustomer];
    setCustomers(nextCustomers);
    await dataManager.saveData('customers', nextCustomers, { syncFirestore: false, notify: true });
    await smartSetDocument('customers', newCustomer.id, newCustomer);

    setSelectedCustomer(newCustomer);
    setNewCustomerName('');
    setNewCustomerPhone('');
    setShowNewCustomerForm(false);
    setShowCustomerModal(false);
      alert('Cliente ' + newCustomer.name + ' creado');
    // After creating the customer, continue to the order screen.
    setViewMode('order');
  };

  const handleSkipCustomer = () => {
    setSelectedCustomer(null);
    setShowCustomerModal(false);
    setViewMode('order');
  };

  const processCustomerPointsForCompletedOrder = async (order: Order): Promise<Order> => {
    if (!order.customerId || order.pointsProcessed) {
      return order;
    }

    if (pointsProcessingOrderIdsRef.current.has(order.id)) {
      return order;
    }
    pointsProcessingOrderIdsRef.current.add(order.id);

    const customer = customers.find(cust => cust.id === order.customerId);
    if (!customer) {
      console.warn('completed order has no matching customer for points:', order.id, order.customerId);
      pointsProcessingOrderIdsRef.current.delete(order.id);
      return order;
    }

    const redeemedPoints = Math.max(0, Number(order.pointsUsed || 0));
    const redeemedAmount = Math.max(0, Number(order.pointsDiscount || 0));
    const earningBaseAmount = Math.max(0, Number(order.totalAmount || 0));
    const earnedPoints = amountToPoints(earningBaseAmount);
    const finalPoints = Math.max(0, Number(customer.points || 0) + earnedPoints - redeemedPoints);
    const processedAt = new Date();

    const updatedCustomer: Customer = {
      ...customer,
      points: finalPoints,
      totalSpent: Number(customer.totalSpent || 0) + earningBaseAmount,
      visitCount: Number(customer.visitCount || 0) + 1,
      lastVisitAt: getLocalDateTimeString(processedAt),
    };

    const updatedCustomers = customers.map(cust =>
      cust.id === customer.id ? updatedCustomer : cust
    );

    setCustomers(updatedCustomers);
    await dataManager.saveData('customers', updatedCustomers, { syncFirestore: false, notify: false });
    await smartSetDocument('customers', updatedCustomer.id, updatedCustomer);

    const transactions: PointsTransaction[] = [];
    if (earnedPoints > 0) {
      transactions.push({
        id: `POINTS-${order.id}-earn`,
        customerId: customer.id,
        orderId: order.id,
        orderNumber: order.orderNumber,
        type: 'earn',
        points: earnedPoints,
        amount: earningBaseAmount,
        description: `消费获得积分 C$ ${earningBaseAmount.toFixed(2)} +${earnedPoints}`,
        createdAt: processedAt.toISOString(),
      });
    }

    if (redeemedPoints > 0) {
      transactions.push({
        id: `POINTS-${order.id}-redeem`,
        customerId: customer.id,
        orderId: order.id,
        orderNumber: order.orderNumber,
        type: 'redeem',
        points: -redeemedPoints,
        amount: redeemedAmount,
        description: `订单积分抵扣 C$ ${redeemedAmount.toFixed(2)} -${redeemedPoints}`,
        createdAt: processedAt.toISOString(),
      });
    }

    await Promise.all(transactions.map(transaction =>
      smartSetDocument('points_transactions', transaction.id, transaction)
    ));

    const processedOrder = {
      ...order,
      pointsProcessed: true,
      pointsProcessedAt: processedAt,
      pointsEarned: earnedPoints,
      pointsUsed: redeemedPoints,
      pointsDiscount: redeemedAmount,
      lastModified: Date.now(),
    };

    pointsProcessingOrderIdsRef.current.delete(order.id);
    return processedOrder;
  };

  const normalizeMenuItemType = (item: any): 'recipe' | 'direct' => {
    if (item.type === 'direct' || item.type === 'beverage' || item.type === 'alcohol') {
      return 'direct';
    }
    if (item.type === 'recipe' || item.type === 'dish') {
      return 'recipe';
    }
    return item.stockItemId ? 'direct' : 'recipe';
  };

  const handleAddItem = (item: any) => {
    const existingItem = currentItems.find(i => i.menuItemId === item.id);

    let newCurrentItems: OrderItem[];
    if (existingItem) {
      newCurrentItems = currentItems.map(i =>
        i.menuItemId === item.id
          ? { ...i, quantity: i.quantity + 1, subtotal: (i.quantity + 1) * i.price }
          : i
      );
    } else {
      newCurrentItems = [...currentItems, {
        id: Date.now().toString(),
        menuItemId: item.id,
        name: item.name,
        quantity: 1,
        price: item.price,
        subtotal: item.price,
        type: normalizeMenuItemType(item),
        stockItemId: item.stockItemId,
        ingredients: item.ingredients || [],
        sentToKitchen: false,
        sentQuantity: 0
      }];
    }

    setCurrentItems(newCurrentItems);

    if (selectedOrderId) {
      setOrders(orders.map(o =>
        o.id === selectedOrderId ? { ...o, items: newCurrentItems } : o
      ));
    }
  };

  const handleRemoveItem = (itemId: string) => {
    const item = currentItems.find(i => i.id === itemId);
    if (!item) return;

    if (item.sentToKitchen && item.quantity <= item.sentQuantity) {
      setItemToDelete(itemId);
      setCancelAction('delete');
      setShowCancelModal(true);
      return;
    }

    const newCurrentItems = currentItems.filter(i => i.id !== itemId);
    setCurrentItems(newCurrentItems);

    if (selectedOrderId) {
      setOrders(orders.map(o =>
        o.id === selectedOrderId ? { ...o, items: newCurrentItems } : o
      ));
    }
  };

  const handleUpdateQuantity = (itemId: string, quantity: number) => {
    const newCurrentItems = currentItems.map(i =>
      i.id === itemId
        ? { ...i, quantity, subtotal: quantity * i.price }
        : i
    );

    setCurrentItems(newCurrentItems);

    if (selectedOrderId) {
      const nextTotalAmount = newCurrentItems.reduce((sum, item) => sum + item.subtotal, 0);
      setOrders(orders.map(o =>
        o.id === selectedOrderId ? {
          ...o,
          items: newCurrentItems,
          totalAmount: nextTotalAmount,
          paymentStatus: (o.settledAmount || o.paidAmount || 0) >= nextTotalAmount - 0.001
            ? 'paid'
            : (o.settledAmount || o.paidAmount || 0) > 0
              ? 'partial'
              : 'unpaid',
          lastModified: Date.now()
        } : o
      ));
    }
  };

  const handleHoldOrder = async () => {
    if (currentItems.length === 0) {
      alert('No hay productos para retener');
      return;
    }

    if (!selectedTableId) {
      alert('Seleccione una mesa primero');
      return;
    }

    const table = tables.find(t => t.id === selectedTableId);
    if (!table) return;

    let orderId = selectedOrderId;
    if (!orderId) {
      const newOrder: Order = {
        id: generateOrderId(),
        orderNumber: await generateOrderNumber(),
        tableId: selectedTableId!,
        tableNumber: table.number,
        orderType: orderType,
        deliveryType: orderType === 'delivery' ? deliveryType : undefined,
        customerId: selectedCustomer?.id,
        customerName: selectedCustomer?.name,
        items: currentItems,
        status: 'draft',
        createdAt: new Date(),
        totalAmount: subtotal,
        pointsUsed: pointsRedemptionEnabled ? pointsToUse : 0,
        pointsDiscount: pointsRedemptionAmount,
        paidAmount: 0,
        paymentStatus: 'unpaid',
        settledAmount: 0
      };
      setOrders([...orders, newOrder]);
      orderId = newOrder.id;
      setSelectedOrderId(orderId);
    }

    const heldOrder: HeldOrder = {
      id: `held-${Date.now()}`,
      orderId: orderId,
      tableId: selectedTableId!,
      tableNumber: table.number,
      items: [...currentItems],
      orderType: orderType,
      deliveryType: orderType === 'delivery' ? deliveryType : undefined,
      createdAt: new Date(),
      serviceFeeEnabled,
      taxEnabled,
      deliveryFee,
    };

    setHeldOrders([...heldOrders, heldOrder]);

    setCurrentItems([]);
    setSelectedTableId(null);
    setSelectedOrderId(null);
    setServiceFeeEnabled(false);
    setTaxEnabled(false);
    setDeliveryFee(0);
    setDeliveryType('self'); // 閲嶇疆娲鹃€佺被鍨?
    setOrderType('dine_in');
    setCashNIO('');
    setCashUSD('');
    setCardNIO('');
    setCardUSD('');
    setViewMode('overview');

    alert(`Pedido retenido\n\nMesa: ${table.number}\nProductos: ${currentItems.length}\n\nPuede recuperar el pedido desde la lista de pedidos retenidos.`);
  };

  const handleRetrieveOrder = (heldOrder: HeldOrder) => {
    if (currentItems.length > 0) {
    if (!window.confirm('Hay un pedido sin terminar. ¿Desea reemplazarlo?')) {
        return;
      }
    }

    setCurrentItems(heldOrder.items);
    setSelectedTableId(heldOrder.tableId);
    setOrderType(heldOrder.orderType);
    setDeliveryType(heldOrder.deliveryType || 'self'); // 鎭㈠娲鹃€佺被鍨?
    setServiceFeeEnabled(heldOrder.serviceFeeEnabled);
    setTaxEnabled(heldOrder.taxEnabled);
    setDeliveryFee(heldOrder.deliveryFee);

    setCashNIO('');
    setCashUSD('');
    setCardNIO('');
    setCardUSD('');

    setHeldOrders(heldOrders.filter(o => o.id !== heldOrder.id));

    setViewMode('order');

    alert(`✅ Pedido recuperado\n\nMesa: ${heldOrder.tableNumber}\nProductos: ${heldOrder.items.length}`);
  };

  const createDeliveryExpense = async (order: Order, deliveryFeeAmount: number) => {
    try {
      const today = getLocalDateTimeString().split(' ')[0];

      const expense = {
        id: `delivery_expense_${Date.now()}`,
        date: today,
        categoryId: 'delivery_fee',
        categoryName: '外卖配送费支出',
        description: `外卖订单 ${order.orderNumber || order.id} - 配送费`,
        amount: deliveryFeeAmount,
        orderId: order.id,
        orderNumber: order.orderNumber,
        relatedType: 'delivery',
        createdAt: getLocalDateTimeString(),
      };

      const nextExpenses = [...dataManager.getData('expenses'), expense];
      await dataManager.saveData('expenses', nextExpenses, { syncFirestore: false, notify: true });
      await smartSetDocument('expenses', expense.id, expense);

    } catch (error) {
      console.error('create delivery expense failed:', error);
    }
  };

  const handleTableAction = async (action: 'clear' | 'add') => {

    if (!tableActionData) {
      console.error('POS table action data is missing');
      return;
    }

    if (action === 'clear') {

      const orderToClear = orders.find(o => o.id === tableActionData.orderId);
      if (!orderToClear) {
        console.error('clear order target not found:', tableActionData.orderId);
        return;
      }

      if (clearingOrderId === orderToClear.id) {
        return;
      }

      setClearingOrderId(orderToClear.id);
      markOrderFinalizing(orderToClear.id);
      try {
        await waitForNextPaint();
        await completeOrderWithStockDeduction(orderToClear, { releaseTable: true });
      } catch (error) {
        console.error('complete order sync failed:', orderToClear.id, error);
        showPosToast(getCompletionErrorMessage(error), 'error');
        return;
      } finally {
        setClearingOrderId(null);
        clearOrderFinalizing(orderToClear.id);
      }

      if (tableActionData.tableId) {
        showPosToast('Mesa liberada. Lista para nuevo cliente.', 'success');
      } else {
        showPosToast('Pedido completado. Inventario descontado.', 'success');
      }
    } else {
      const existingOrder = orders.find(o => o.id === tableActionData.orderId);
      if (existingOrder) {

        setSelectedTableId(tableActionData.tableId);
        setCurrentItems(existingOrder.items.map(item => ({...item})));
        setSelectedOrderId(existingOrder.id);

        setServiceFeeEnabled(false);
        setTaxEnabled(false);
        setDeliveryFee(0);
        setCashNIO('');
        setCashUSD('');
        setCardNIO('');
        setCardUSD('');

        setViewMode('order');
      } else {
        console.error('table action order target not found:', tableActionData.orderId);
      }
    }

    setShowTableActionModal(false);
    setTableActionData(null);
  };

  const subtotal = currentItems.reduce((sum, item) => sum + item.subtotal, 0);
  const serviceFee = subtotal * 0.1;
  const tax = subtotal * 0.15;

  // 璁＄畻鎶樻墸
  const discountAmount = discountEnabled ?
    (discountType === 'percentage' ? subtotal * (discountValue / 100) : Math.min(discountValue, subtotal))
    : 0;

  // 璁＄畻绉垎鍏戞崲閲戦
  const pointsRedemptionAmount = pointsRedemptionEnabled && selectedCustomer ?
    Math.min(pointsToUse / pointsExchangeRate, subtotal - discountAmount)
    : 0;

  const finalTotal = subtotal + (serviceFeeEnabled ? serviceFee : 0) + (taxEnabled ? tax : 0) + deliveryFee - discountAmount - pointsRedemptionAmount;
  const calculateTotalForItems = (items: OrderItem[]): number => {
    const nextSubtotal = items.reduce((sum, item) => sum + item.subtotal, 0);
    return nextSubtotal +
      (serviceFeeEnabled ? nextSubtotal * 0.1 : 0) +
      (taxEnabled ? nextSubtotal * 0.15 : 0) +
      deliveryFee -
      discountAmount -
      pointsRedemptionAmount;
  };

  const existingOrder = selectedOrderId ? orders.find(o => o.id === selectedOrderId) : null;
  const settledAmount = existingOrder?.settledAmount || 0;
  const remainingAmount = Math.max(0, finalTotal - settledAmount);
  const getSentQuantity = (item: Partial<OrderItem>) => Number(item.sentQuantity) || 0;
  const hasUnsentItems = currentItems.some(item => item.quantity > getSentQuantity(item));
  const persistItemCancellationForExistingOrder = (nextItems: OrderItem[], cancelRecord: CancelRecord) => {
    if (!selectedOrderId) return;

    const order = orders.find(o => o.id === selectedOrderId);
    if (!order) return;

    const nextTotalAmount = calculateTotalForItems(nextItems);
    const nextSettledAmount = Number(order.settledAmount || order.paidAmount || 0);
    const nextPaymentStatus: 'unpaid' | 'partial' | 'paid' =
      nextSettledAmount >= nextTotalAmount - 0.001
        ? 'paid'
        : nextSettledAmount > 0
          ? 'partial'
          : 'unpaid';

    const updatedOrder = mergeOrderCancelRecords({
      ...order,
      items: nextItems,
      totalAmount: nextTotalAmount,
      paymentStatus: nextPaymentStatus,
      updatedAt: new Date(),
      lastModified: Date.now()
    }, selectedOrderId, [cancelRecord]);

    setOrders(prevOrders => prevOrders.map(o =>
      o.id === selectedOrderId ? updatedOrder : o
    ));
    pendingOrderSyncIdsRef.current.add(selectedOrderId);
    savePendingOrderSyncIds(pendingOrderSyncIdsRef.current);
    publishOrderImmediately(updatedOrder).catch(error => {
      console.error('cancel item immediate publish failed:', selectedOrderId, error);
    });
  };

  const resetOrderEntryState = () => {
    setViewMode('overview');
    setCurrentItems([]);
    setSelectedOrderId(null);
    setSelectedTableId(null);
    setSelectedCustomer(null);
    setServiceFeeEnabled(false);
    setTaxEnabled(false);
    setDeliveryFee(0);
    setOrderType('dine_in');
    setCashNIO('');
    setCashUSD('');
    setCardNIO('');
    setCardUSD('');
  };

  const discardUnconfirmedOrderItems = () => {
    if (!selectedOrderId || !hasUnsentItems) return;

    const confirmedItems = currentItems
      .map(item => {
        const sentQuantity = getSentQuantity(item);
        if (sentQuantity <= 0) return null;
        return {
          ...item,
          quantity: sentQuantity,
          subtotal: sentQuantity * item.price,
          sentToKitchen: true,
          sentQuantity
        };
      })
      .filter((item): item is OrderItem => item !== null);

    setOrders(prevOrders => prevOrders.map(order =>
      order.id === selectedOrderId
        ? { ...order, items: confirmedItems, lastModified: Date.now() }
        : order
    ));
  };

  const returnToOverviewFromOrder = () => {
    discardUnconfirmedOrderItems();
    resetOrderEntryState();
  };

  const handleSendToKitchen = async () => {
    if (currentItems.length === 0) {
      alert('\u8bf7\u5148\u6dfb\u52a0\u5546\u54c1');
      return;
    }

    const selectedEditableOrder = selectedOrderId
      ? orders.find(o => o.id === selectedOrderId && isEditableActiveOrder(o)) || null
      : null;
    const activeOrder = selectedEditableOrder;
    const activeOrderType = activeOrder?.orderType || orderType;

    if (activeOrderType === 'dine_in' && !selectedTableId) {
      alert('\u8bf7\u5148\u9009\u62e9\u684c\u53f0');
      return;
    }

    const unsentItems = currentItems.filter(item => item.quantity > getSentQuantity(item));
    const isDirectStockItem = (item: OrderItem) => {
      const type = String((item.type as any) || '').toLowerCase();
      return type === 'direct' || type === 'beverage' || type === 'alcohol';
    };
    const dishesToSend = unsentItems.filter(item => !isDirectStockItem(item));
    const beveragesToLock = unsentItems.filter(isDirectStockItem);
    let kitchenPrintOrderNumber = selectedEditableOrder?.orderNumber || selectedEditableOrder?.id || '';
    let kitchenPrintTableNumber = activeOrderType === 'dine_in'
      ? (selectedEditableOrder?.tableNumber || tables.find(t => t.id === selectedTableId)?.number || '')
      : '';

    if (unsentItems.length === 0) {
      alert('\u6ca1\u6709\u9700\u8981\u53d1\u9001\u7684\u65b0\u589e\u5546\u54c1');
      return;
    }

    const updatedItems = currentItems.map(item => {
      if (item.quantity > getSentQuantity(item)) {
        return {
          ...item,
          sentToKitchen: true,
          sentQuantity: item.quantity
        };
      }
      return item;
    });

    setCurrentItems(updatedItems);

    if (!selectedEditableOrder) {
      const existingActiveOrder = orders.find(o =>
        orderType === 'dine_in' &&
        o.tableId === selectedTableId &&
        isEditableActiveOrder(o)
      );

      if (existingActiveOrder) {
        alert(`\u8be5\u684c\u53f0\u5df2\u6709\u672a\u5b8c\u6210\u8ba2\u5355\uff08${existingActiveOrder.orderNumber || existingActiveOrder.id}\uff09\n\n\u8bf7\u5148\u6253\u5f00\u539f\u8ba2\u5355\u5904\u7406`);
        return;
      }

      const now = new Date();
      const newOrder: Order = {
        id: generateOrderId(),
        orderNumber: await generateOrderNumber(),
        tableId: orderType === 'dine_in' ? selectedTableId! : '',
        tableNumber: orderType === 'dine_in' ? (tables.find(t => t.id === selectedTableId)?.number || '') : '',
        orderType,
        deliveryType: orderType === 'delivery' ? deliveryType : undefined,
        customerId: selectedCustomer?.id,
        customerName: selectedCustomer?.name,
        items: updatedItems,
        status: 'confirmed',
        createdAt: now,
        preparingAt: now,
        totalAmount: finalTotal,
        pointsUsed: pointsRedemptionEnabled ? pointsToUse : 0,
        pointsDiscount: pointsRedemptionAmount,
        paidAmount: 0,
        paymentStatus: 'unpaid',
        settledAmount: 0,
        lastModified: Date.now()
      };

      const newOrderWithCancelRecords = mergeOrderCancelRecords(newOrder);
      kitchenPrintOrderNumber = newOrderWithCancelRecords.orderNumber || newOrderWithCancelRecords.id;
      kitchenPrintTableNumber = newOrderWithCancelRecords.tableNumber || kitchenPrintTableNumber;

      setOrders(prevOrders => {
        if (prevOrders.some(order => order.id === newOrderWithCancelRecords.id)) {
          return prevOrders;
        }
        return [...prevOrders, newOrderWithCancelRecords];
      });
      pendingOrderSyncIdsRef.current.add(newOrderWithCancelRecords.id);
      savePendingOrderSyncIds(pendingOrderSyncIdsRef.current);
      publishOrderImmediately(newOrderWithCancelRecords).catch(error => {
        console.error('confirm order immediate publish failed:', newOrderWithCancelRecords.id, error);
      });
      setSelectedOrderId(newOrderWithCancelRecords.id);

      setTables(prevTables => prevTables.map(t =>
        orderType === 'dine_in' && t.id === selectedTableId
          ? { ...t, status: 'occupied' as const, currentOrderId: newOrderWithCancelRecords.id, lastModified: Date.now() }
          : t
      ));
    } else {
      const editableOrderId = selectedEditableOrder.id;
      let updatedOrderForPublish: Order | null = null;
      setOrders(prevOrders => prevOrders.map(o =>
        o.id === editableOrderId ? (() => {
          const nextSettledAmount = Number(o.settledAmount || o.paidAmount || 0);
          const nextPaymentStatus: 'unpaid' | 'partial' | 'paid' =
            nextSettledAmount >= finalTotal - 0.001
              ? 'paid'
              : nextSettledAmount > 0
                ? 'partial'
                : 'unpaid';

          updatedOrderForPublish = {
            ...o,
            items: updatedItems,
            totalAmount: finalTotal,
            pointsUsed: pointsRedemptionEnabled ? pointsToUse : (o.pointsUsed || 0),
            pointsDiscount: pointsRedemptionEnabled ? pointsRedemptionAmount : (o.pointsDiscount || 0),
            paymentStatus: nextPaymentStatus,
            updatedAt: new Date(),
            lastModified: Date.now()
          };
          updatedOrderForPublish = mergeOrderCancelRecords(updatedOrderForPublish, editableOrderId);
          return updatedOrderForPublish;
        })() : o
      ));
      pendingOrderSyncIdsRef.current.add(editableOrderId);
      savePendingOrderSyncIds(pendingOrderSyncIdsRef.current);
      if (updatedOrderForPublish) {
        publishOrderImmediately(updatedOrderForPublish).catch(error => {
          console.error('confirm updated order immediate publish failed:', editableOrderId, error);
        });
      }
    }

    const dishMessage = dishesToSend.map(item => {
      const sentQuantity = getSentQuantity(item);
      const newQty = item.quantity - sentQuantity;
      return `- ${item.name} x${newQty}${sentQuantity > 0 ? ` (${item.quantity})` : ''}`;
    }).join('\n');

    const beverageMessage = beveragesToLock.map(item => {
      const sentQuantity = getSentQuantity(item);
      const newQty = item.quantity - sentQuantity;
      return `- ${item.name} x${newQty}${sentQuantity > 0 ? ` (${item.quantity})` : ''}`;
    }).join('\n');

    let alertMessage = '';
    if (dishesToSend.length > 0) {
      alertMessage += `\u2705 \u5df2\u53d1\u9001 ${dishesToSend.length} \u9053\u83dc\u54c1\u5230\u53a8\u623f\n\n${dishMessage}`;
    }
    if (beveragesToLock.length > 0) {
      if (alertMessage) alertMessage += '\n\n';
      alertMessage += `\u2705 \u5df2\u786e\u8ba4 ${beveragesToLock.length} \u4e2a\u9152\u6c34/\u996e\u6599\n\n${beverageMessage}`;
    }

    if (dishesToSend.length > 0) {
      const kitchenPayload = buildKitchenTicketPayload({
        storeId: getCurrentStoreIdForPrint(),
        orderNumber: kitchenPrintOrderNumber,
        orderTypeText: posOrderTypeLabels[activeOrderType],
        tableNumber: kitchenPrintTableNumber,
        createdAt: new Date(),
        items: dishesToSend.map(item => ({
          name: item.name,
          quantity: item.quantity - getSentQuantity(item),
          notes: (item as any).notes,
        })),
      });
      printViaLocalBridge(kitchenPayload, { timeoutMs: 900 }).then(() => undefined);
    }

    alert(alertMessage);
  };

  const paidAmount = (
    (cashNIO ? parseFloat(cashNIO) : 0) +
    (cashUSD ? parseFloat(cashUSD) * exchangeRate : 0) +
    (cardNIO ? parseFloat(cardNIO) : 0) +
    (cardUSD ? parseFloat(cardUSD) * exchangeRate : 0)
  );

  const change = paidAmount - remainingAmount;

  const getStockDeductionKey = (item: OrderItem) => item.id || item.menuItemId;

  const deductStockForOrder = async (order: Order): Promise<Order> => {
    if (order.stockDeducted) {
      return {
        ...order,
        lastModified: Date.now()
      };
    }

    if (!order.items || order.items.length === 0) {
      console.warn('POS warning:', order.id);
      return order;
    }

    const deductedItems = order.stockDeductedItems || {};
    const itemsToDeduct = order.items
      .map(item => {
        const key = getStockDeductionKey(item);
        const deductedQuantity = Number(deductedItems[key] || 0);
        const quantityToDeduct = item.quantity - deductedQuantity;

        if (quantityToDeduct <= 0) return null;

        return {
          ...item,
          quantity: quantityToDeduct,
          subtotal: quantityToDeduct * item.price
        };
      })
      .filter((item): item is OrderItem => Boolean(item));

    if (itemsToDeduct.length === 0) {
      return order;
    }

    const operationId = order.stockDeductionOperationId || getStableStockDeductionOperationId(order.id);
    const claimResult: any = await smartClaimOrderStockDeduction('pos_orders', order.id, {
      stockDeductionOperationId: operationId,
      lastModified: Date.now()
    });

    if (claimResult?.alreadyDeducted) {
      return {
        ...order,
        ...(claimResult.data || {}),
        stockDeducted: true,
        stockDeductionInProgress: false,
        lastModified: Date.now()
      };
    }

    if (!claimResult?.success) {
      if (claimResult?.inProgress) {
        throw new Error('该订单正在另一台设备扣减库存，请刷新后再试');
      }
      throw new Error('无法获取订单库存扣减锁，请检查网络后重试');
    }

    try {
      await deductStock(itemsToDeduct, {
        operationId,
        orderId: order.id,
        orderNumber: order.orderNumber,
        orderType: order.orderType,
        completedAt: new Date()
      });
    } catch (error) {
      await smartUpdateDocument('pos_orders', order.id, {
        status: order.status,
        paymentStatus: order.paymentStatus,
        paidAmount: order.paidAmount,
        settledAmount: order.settledAmount,
        completedAt: order.completedAt,
        clearedAt: order.clearedAt,
        stockDeductionInProgress: false,
        stockDeductionFailedAt: Date.now(),
        stockDeductionOperationId: operationId,
        lastModified: Date.now()
      });
      throw error;
    }

    const nextDeductedItems = { ...deductedItems };
    order.items.forEach(item => {
      nextDeductedItems[getStockDeductionKey(item)] = item.quantity;
    });

    const nextDeductedOrderIds = new Set(deductedOrderIds);
    nextDeductedOrderIds.add(order.id);
    setDeductedOrderIds(nextDeductedOrderIds);
        localStorage.setItem(getScopedStorageKey('pos_deducted_orders'), JSON.stringify(Array.from(nextDeductedOrderIds)));

    return {
      ...order,
      stockDeducted: true,
      stockDeductedAt: new Date(),
      stockDeductedItems: nextDeductedItems,
      stockDeductionOperationId: operationId,
      stockDeductionInProgress: false,
      lastModified: Date.now()
    };
  };

  const syncPointsForCompletedOrder = (completedOrder: Order) => {
    processCustomerPointsForCompletedOrder(completedOrder)
      .then(pointsProcessedOrder => {
        if (!pointsProcessedOrder.pointsProcessed) return;
        setOrders(prevOrders => prevOrders.map(o =>
          o.id === pointsProcessedOrder.id ? pointsProcessedOrder : o
        ));
        pendingOrderSyncIdsRef.current.add(pointsProcessedOrder.id);
        savePendingOrderSyncIds(pendingOrderSyncIdsRef.current);
        smartUpdateDocument('pos_orders', pointsProcessedOrder.id, {
          ...pointsProcessedOrder,
          createdAt: pointsProcessedOrder.createdAt instanceof Date ? pointsProcessedOrder.createdAt.toISOString() : pointsProcessedOrder.createdAt,
          preparingAt: pointsProcessedOrder.preparingAt instanceof Date ? pointsProcessedOrder.preparingAt.toISOString() : pointsProcessedOrder.preparingAt,
          servedAt: pointsProcessedOrder.servedAt instanceof Date ? pointsProcessedOrder.servedAt.toISOString() : pointsProcessedOrder.servedAt,
          completedAt: pointsProcessedOrder.completedAt instanceof Date ? pointsProcessedOrder.completedAt.toISOString() : pointsProcessedOrder.completedAt,
          clearedAt: pointsProcessedOrder.clearedAt instanceof Date ? pointsProcessedOrder.clearedAt.toISOString() : pointsProcessedOrder.clearedAt,
          lastPaidAt: pointsProcessedOrder.lastPaidAt instanceof Date ? pointsProcessedOrder.lastPaidAt.toISOString() : pointsProcessedOrder.lastPaidAt,
          stockDeductedAt: pointsProcessedOrder.stockDeductedAt instanceof Date ? pointsProcessedOrder.stockDeductedAt.toISOString() : pointsProcessedOrder.stockDeductedAt,
          pointsProcessedAt: pointsProcessedOrder.pointsProcessedAt instanceof Date ? pointsProcessedOrder.pointsProcessedAt.toISOString() : pointsProcessedOrder.pointsProcessedAt,
        }).catch(error => {
          console.error('sync points-processed order failed:', pointsProcessedOrder.id, error);
        });
      })
      .catch(error => {
        pointsProcessingOrderIdsRef.current.delete(completedOrder.id);
        console.error('process customer points failed:', completedOrder.id, error);
      });
  };

  const startCompletionBackgroundSync = (order: Order, completedOrder: Order) => {
    publishOrderImmediately(completedOrder)
      .then(result => {
        const completionSyncPending = result?.pending || result?.success === false;
        if (!completionSyncPending) {
          syncPointsForCompletedOrder(completedOrder);
        }

        if (order.stockDeducted || !order.items || order.items.length === 0) {
          return;
        }

        return deductStockForOrder(completedOrder)
          .then(stockDeductedOrder => {
            const stockSyncedOrder: Order = {
              ...completedOrder,
              ...stockDeductedOrder,
              status: 'completed',
              completedAt: completedOrder.completedAt,
              clearedAt: completedOrder.clearedAt,
              stockDeductionPending: false,
              lastModified: Date.now()
            };

            setOrders(prevOrders => prevOrders.map(o =>
              o.id === order.id ? stockSyncedOrder : o
            ));
            publishOrderImmediately(stockSyncedOrder).catch(error => {
              console.error('sync stock-deducted completed order failed:', order.id, error);
            });
          })
          .catch(error => {
            const message = error instanceof Error ? error.message : String(error || 'unknown');
            console.error('background stock deduction failed:', order.id, error);
            const failedOrder: Order = {
              ...completedOrder,
              stockDeductionPending: true,
              stockDeductionInProgress: false,
              stockDeductionFailedAt: Date.now(),
              stockDeductionError: message,
              lastModified: Date.now()
            };
            setOrders(prevOrders => prevOrders.map(o =>
              o.id === order.id ? failedOrder : o
            ));
            publishOrderImmediately(failedOrder).catch(syncError => {
              console.error('sync stock-deduction failure marker failed:', order.id, syncError);
            });
          });
      })
      .catch(error => {
        console.error('complete order publish queued locally:', completedOrder.id, error);
      });
  };

  const completeOrderWithStockDeduction = async (order: Order, options: { releaseTable?: boolean } = {}) => {
    const now = new Date();
    const completedOrder: Order = {
      ...order,
      status: 'completed' as const,
      completedAt: order.completedAt || now,
      clearedAt: order.clearedAt || now,
      stockDeductionPending: !order.stockDeducted,
      lastModified: Date.now()
    };

    setOrders(prevOrders => prevOrders.map(o =>
      o.id === order.id ? completedOrder : o
    ));

    if (options.releaseTable && order.tableId) {
      markTableUserEdit(order.tableId);
      setTables(prevTables => prevTables.map(t =>
        t.id === order.tableId
          ? { ...t, status: 'available' as const, currentOrderId: '', lastModified: Date.now() }
          : t
      ));
    }

    startCompletionBackgroundSync(order, completedOrder);
    return completedOrder;
  };

  const handleCompletePayment = async () => {
    if (paymentProcessingRef.current || isProcessingPayment) {
      console.warn('payment is already processing');
      return;
    }

    if (paidAmount < remainingAmount) {
      alert('\u652f\u4ed8\u91d1\u989d\u4e0d\u8db3');
      return;
    }

    if (currentItems.length === 0) {
      alert('\u5f53\u524d\u6ca1\u6709\u5546\u54c1\uff0c\u65e0\u6cd5\u652f\u4ed8');
      return;
    }

    if (orderType === 'dine_in' && !selectedTableId && !selectedOrderId) {
      alert('\u8bf7\u5148\u9009\u62e9\u684c\u53f0');
      return;
    }

    paymentProcessingRef.current = true;
    setIsProcessingPayment(true);

    try {
      const cashTenderedAmount = (cashNIO ? parseFloat(cashNIO) : 0) + (cashUSD ? parseFloat(cashUSD) * exchangeRate : 0);
      const cardTenderedAmount = (cardNIO ? parseFloat(cardNIO) : 0) + (cardUSD ? parseFloat(cardUSD) * exchangeRate : 0);
      const actualSettled = Math.min(paidAmount, remainingAmount);
      const changeAmount = Math.max(paidAmount - remainingAmount, 0);
      const settledCashAmount = Math.max(cashTenderedAmount - changeAmount, 0);
      const settledCardAmount = Math.min(cardTenderedAmount, Math.max(actualSettled - settledCashAmount, 0));
      const newSettledAmount = Math.min(finalTotal, settledAmount + actualSettled);
      const isFullyPaid = newSettledAmount >= finalTotal - 0.001;
      const nextPaymentStatus: 'paid' | 'partial' = isFullyPaid ? 'paid' : 'partial';
      const getPaymentMethod = (cashAmount: number, cardAmount: number): 'cash' | 'card' | 'mixed' => {
        if (cashAmount > 0 && cardAmount <= 0) return 'cash';
        if (cashAmount <= 0 && cardAmount > 0) return 'card';
        return 'mixed';
      };
      const now = new Date();
      let paidOrderForSideEffects: Order | null = null;
      let finalOrderId = selectedOrderId;

      if (selectedOrderId) {
        const existingOrder = orders.find(o => o.id === selectedOrderId);
        if (!existingOrder) {
          alert('\u672a\u627e\u5230\u5f53\u524d\u8ba2\u5355\uff0c\u8bf7\u8fd4\u56de\u91cd\u65b0\u6253\u5f00\u8ba2\u5355');
          return;
        }

        const nextCashAmount = (existingOrder.cashAmount || 0) + settledCashAmount;
        const nextCardAmount = (existingOrder.cardAmount || 0) + settledCardAmount;
        let updatedOrder: Order = {
          ...existingOrder,
          items: currentItems,
          totalAmount: finalTotal,
          pointsUsed: pointsRedemptionEnabled ? pointsToUse : (existingOrder.pointsUsed || 0),
          pointsDiscount: pointsRedemptionEnabled ? pointsRedemptionAmount : (existingOrder.pointsDiscount || 0),
          status: 'served',
          servedAt: existingOrder.servedAt || now,
          paymentStatus: nextPaymentStatus,
          paidAmount: newSettledAmount,
          settledAmount: newSettledAmount,
          lastPaidAt: now,
          paymentMethod: getPaymentMethod(nextCashAmount, nextCardAmount),
          cashAmount: nextCashAmount,
          cardAmount: nextCardAmount,
          lastModified: Date.now()
        };
        updatedOrder = mergeOrderCancelRecords(updatedOrder, selectedOrderId);

        paidOrderForSideEffects = updatedOrder;
        setOrders(prevOrders => prevOrders.map(o =>
          o.id === selectedOrderId ? paidOrderForSideEffects! : o
        ));
        pendingOrderSyncIdsRef.current.add(selectedOrderId);
        publishOrderImmediately(updatedOrder).catch(error => {
          console.error('payment order immediate publish failed:', updatedOrder.id, error);
        });
      } else {
        const existingActiveOrder = selectedTableId ? orders.find(o =>
          o.tableId === selectedTableId &&
          o.status !== 'completed' &&
          o.status !== 'cancelled'
        ) : null;

        if (existingActiveOrder) {
          alert('\u8be5\u684c\u53f0\u5df2\u6709\u672a\u5b8c\u6210\u8ba2\u5355\uff0c\u8bf7\u5148\u6253\u5f00\u539f\u8ba2\u5355\u5904\u7406');
          return;
        }

        const newOrder: Order = {
          id: generateOrderId(),
          orderNumber: await generateOrderNumber(),
          tableId: selectedTableId || '',
          tableNumber: selectedTableId ? tables.find(t => t.id === selectedTableId)?.number || '' : '',
          orderType,
          deliveryType: orderType === 'delivery' ? deliveryType : undefined,
          customerId: selectedCustomer?.id,
          customerName: selectedCustomer?.name,
          items: currentItems,
          status: 'served',
          createdAt: now,
          servedAt: now,
          completedAt: undefined,
          totalAmount: finalTotal,
          pointsUsed: pointsRedemptionEnabled ? pointsToUse : 0,
          pointsDiscount: pointsRedemptionAmount,
          paidAmount: newSettledAmount,
          paymentStatus: nextPaymentStatus,
          settledAmount: newSettledAmount,
          paymentMethod: getPaymentMethod(settledCashAmount, settledCardAmount),
          cashAmount: settledCashAmount,
          cardAmount: settledCardAmount,
          lastPaidAt: now,
          lastModified: Date.now()
        };

        paidOrderForSideEffects = newOrder;
        paidOrderForSideEffects = mergeOrderCancelRecords(paidOrderForSideEffects);
        finalOrderId = paidOrderForSideEffects.id;
        setOrders(prevOrders => [...prevOrders, paidOrderForSideEffects!]);
        pendingOrderSyncIdsRef.current.add(paidOrderForSideEffects.id);
        publishOrderImmediately(paidOrderForSideEffects).catch(error => {
          console.error('payment new order immediate publish failed:', paidOrderForSideEffects!.id, error);
        });
      }

      savePendingOrderSyncIds(pendingOrderSyncIdsRef.current);

      if (isFullyPaid && paidOrderForSideEffects?.orderType === 'dine_in' && paidOrderForSideEffects.tableId) {
        markTableUserEdit(paidOrderForSideEffects.tableId);
        setTables(prevTables => prevTables.map(t =>
          t.id === paidOrderForSideEffects!.tableId ? { ...t, status: 'needs_cleaning' as const, lastModified: Date.now() } : t
        ));
      }

      if (paidOrderForSideEffects?.orderType === 'delivery' && paidOrderForSideEffects.deliveryType === 'outsourced' && deliveryFee > 0) {
        await createDeliveryExpense(paidOrderForSideEffects, deliveryFee);
      }

      let successMessage = `\u2705 \u652f\u4ed8\u6210\u529f\uff01

\u672c\u6b21\u652f\u4ed8: C$${paidAmount.toFixed(2)}
\u5df2\u7ed3\u7b97\u603b\u989d: C$${newSettledAmount.toFixed(2)}
\u8ba2\u5355\u603b\u989d: C$${finalTotal.toFixed(2)}
\u627e\u96f6: C$${Math.max(0, change).toFixed(2)}`;
      if (isFullyPaid) {
        successMessage += `

\u8ba2\u5355\u5df2\u652f\u4ed8\uff0c\u5802\u98df\u684c\u53f0\u5df2\u8f6c\u4e3a\u5f85\u6e05\u53f0`;
      } else {
        successMessage += `
\u8fd8\u9700\u652f\u4ed8: C$${(finalTotal - newSettledAmount).toFixed(2)}`;
      }

      alert(successMessage);

      setViewMode('overview');
      setCurrentItems([]);
      setSelectedOrderId(null);
      setSelectedTableId(null);
      setServiceFeeEnabled(false);
      setTaxEnabled(false);
      setDeliveryFee(0);
      setOrderType('dine_in');
      setCashNIO('');
      setCashUSD('');
      setCardNIO('');
      setCardUSD('');
      setPointsRedemptionEnabled(false);
      setPointsToUse(0);

      if (finalOrderId) {
      }
    } catch (error) {
      console.error('payment failed:', error);
      alert('\u652f\u4ed8\u5904\u7406\u5931\u8d25\uff0c\u8bf7\u68c0\u67e5\u63a7\u5236\u53f0\u9519\u8bef\u540e\u91cd\u8bd5');
    } finally {
      paymentProcessingRef.current = false;
      setIsProcessingPayment(false);
    }
  };

  const confirmCancelOrder = async () => {
    if (!managerAuthorizationPasswords.includes(cancelPassword.trim())) {
      alert('Clave incorrecta. Ingrese clave autorizada.');
      return;
    }

    if (!cancelReason.trim()) {
      alert('\u8bf7\u8f93\u5165\u53d6\u6d88\u539f\u56e0');
      return;
    }

    if (itemToDelete) {
      const item = currentItems.find(i => i.id === itemToDelete);
      if (item) {
        if (cancelAction === 'reduce') {
          const newQuantity = item.quantity - 1;

          const cancelRecord: CancelRecord = {
            id: `cancel-${Date.now()}`,
            itemId: item.id,
            itemName: item.name,
            quantity: 1,
            reason: cancelReason,
            cancelledBy: '店长',
            cancelledAt: new Date(),
            orderId: selectedOrderId || 'draft-order',
            tableNumber: selectedTableId ? tables.find(t => t.id === selectedTableId)?.number || '' : '',
            orderType: 'item'
          };

          setCancelRecords(prevRecords => [...prevRecords, cancelRecord]);

          const nextCurrentItems = currentItems.map(i =>
            i.id === itemToDelete
              ? { ...i, quantity: newQuantity, subtotal: newQuantity * i.price }
              : i
          );
          setCurrentItems(nextCurrentItems);
          persistItemCancellationForExistingOrder(nextCurrentItems, cancelRecord);

        alert(`✅ Se redujo 1 ${item.name}`);
        } else if (cancelAction === 'add') {
          const newQuantity = item.quantity + 1;

          const addRecord: CancelRecord = {
            id: `cancel-${Date.now()}`,
            itemId: item.id,
            itemName: item.name,
            quantity: 1,
            reason: cancelReason,
            cancelledBy: '店长',
            cancelledAt: new Date(),
            orderId: selectedOrderId || 'draft-order',
            tableNumber: selectedTableId ? tables.find(t => t.id === selectedTableId)?.number || '' : '',
            orderType: 'item'
          };

          void addRecord;

          const nextCurrentItems = currentItems.map(i =>
            i.id === itemToDelete
              ? { ...i, quantity: newQuantity, subtotal: newQuantity * i.price }
              : i
          );
          setCurrentItems(nextCurrentItems);

      alert(`✅ Se agregó 1 ${item.name}. Avise a cocina.`);
        } else {
          const cancelRecord: CancelRecord = {
            id: `cancel-${Date.now()}`,
            itemId: item.id,
            itemName: item.name,
            quantity: item.quantity,
            reason: cancelReason,
            cancelledBy: '店长',
            cancelledAt: new Date(),
            orderId: selectedOrderId || 'draft-order',
            tableNumber: selectedTableId ? tables.find(t => t.id === selectedTableId)?.number || '' : '',
            orderType: 'item'
          };

          setCancelRecords(prevRecords => [...prevRecords, cancelRecord]);
          const nextCurrentItems = currentItems.filter(i => i.id !== itemToDelete);
          setCurrentItems(nextCurrentItems);
          persistItemCancellationForExistingOrder(nextCurrentItems, cancelRecord);

      alert('✅ Producto cancelado. Avise a cocina.');
        }
      }

      setItemToDelete(null);
      setShowCancelModal(false);
      setCancelPassword('');
      setCancelReason('');
      setCancelAction('delete');
    } else {
      let tableIdToRelease = selectedTableId;

      if (selectedOrderId) {
        const order = orders.find(o => o.id === selectedOrderId);

        if (!order) {
      alert('No se encontró el pedido. Actualice e intente de nuevo.');
          return;
        }

        const cancelledOrder: Order = {
          ...order,
          status: 'cancelled',
          cancelledBy: '店长',
          cancelReason: cancelReason,
          cancelledAt: new Date(),
          lastModified: Date.now()
        };

        try {
          await publishOrderImmediately(cancelledOrder);
        } catch (error) {
          console.error('cancel order sync failed:', cancelledOrder.id, error);
      alert('No se pudo sincronizar la cancelación. Revise la red e intente de nuevo.');
          return;
        }

        tableIdToRelease = cancelledOrder.tableId || selectedTableId;

        setOrders(prevOrders => prevOrders.map(o =>
          o.id === selectedOrderId ? cancelledOrder : o
        ));

        if (order) {
          const orderCancelRecords: CancelRecord[] = order.items.map(item => ({
            id: `cancel-${Date.now()}-${item.id}`,
            itemId: item.id,
            itemName: item.name,
            quantity: item.quantity,
            reason: cancelReason,
            cancelledBy: '店长',
            cancelledAt: new Date(),
            orderId: order.id,
            tableNumber: order.tableNumber,
            orderType: 'order'
          }));

          setCancelRecords([...cancelRecords, ...orderCancelRecords]);
        }
      }

      if (tableIdToRelease) {
        markTableUserEdit(tableIdToRelease);
        setTables(prevTables => prevTables.map(t =>
          t.id === tableIdToRelease
            ? { ...t, status: 'available' as const, currentOrderId: '', lastModified: Date.now() }
            : t
        ));
      }

      setShowCancelModal(false);
      setCancelPassword('');
      setCancelReason('');
      setViewMode('overview');
      setCurrentItems([]);
      setSelectedOrderId(null);
      setSelectedTableId(null);

    alert('✅ Pedido cancelado');
    }
  };

  const handleSplitBillConfirm = async (splitBills: SplitBill[]) => {
    const totalAmount = splitBills.reduce((sum, bill) => sum + bill.subtotal, 0);
    const paidAmount = splitBills.reduce((sum, bill) => sum + bill.paidAmount, 0);

    let paymentStatus: 'unpaid' | 'partial' | 'paid' = 'unpaid';
    if (paidAmount >= totalAmount && totalAmount > 0) {
      paymentStatus = 'paid';
    } else if (paidAmount > 0) {
      paymentStatus = 'partial';
    }

    if (selectedOrderId) {
      setOrders(orders.map(order =>
        order.id === selectedOrderId
          ? {
              ...order,
              splitBills,
              totalAmount,
              paidAmount,
              paymentStatus
            }
          : order
      ));
    } else {
      const newOrder: Order = {
        id: generateOrderId(),
        orderNumber: await generateOrderNumber(),
        tableId: selectedTableId!,
        tableNumber: tables.find(t => t.id === selectedTableId)?.number || '',
        orderType: orderType,
        customerId: selectedCustomer?.id,
        customerName: selectedCustomer?.name,
        items: currentItems,
        status: 'confirmed',
        createdAt: new Date(),
        preparingAt: new Date(),
        totalAmount,
        paidAmount,
        paymentStatus,
        splitBills,
        settledAmount: 0
      };

      setOrders([...orders, newOrder]);
      setSelectedOrderId(newOrder.id);

      setTables(tables.map(t =>
        t.id === selectedTableId ? {...t, status: 'occupied'} : t
      ));
    }

    alert(`✅ Cuenta dividida en ${splitBills.length}\n` +
      splitBills.map(bill => `${bill.customerName}: C$${bill.subtotal.toFixed(2)} (${bill.paymentStatus === 'paid' ? 'Pagado' : 'Pendiente'})`).join('\n') +
      `\n\nTotal: C$${totalAmount.toFixed(2)}`);
  };
  
  // 打印小票功能
  const handlePrintReceipt = async () => {
    const tableNumber = selectedTableId ? tables.find(t => t.id === selectedTableId)?.number : '';
    const orderTypeText = posOrderTypeLabels[orderType];
    const currentOrder = selectedOrderId ? orders.find(o => o.id === selectedOrderId) : null;
    const currentUser = getCurrentUserRecord();
    const receiptSubtotal = currentItems.reduce((sum, item) => sum + item.subtotal, 0);
    const receiptTax = taxEnabled ? tax : 0;
    const receiptServiceFee = serviceFeeEnabled ? serviceFee : 0;

    const cashPaid = (cashNIO ? parseFloat(cashNIO) : 0) + (cashUSD ? parseFloat(cashUSD) * exchangeRate : 0);
    const cardPaid = (cardNIO ? parseFloat(cardNIO) : 0) + (cardUSD ? parseFloat(cardUSD) * exchangeRate : 0);
    const paymentLines = [
      cashPaid > 0 ? `Efectivo C$${cashPaid.toFixed(2)}` : '',
      cardPaid > 0 ? `Tarjeta C$${cardPaid.toFixed(2)}` : '',
      !cashPaid && !cardPaid && currentOrder?.cashAmount ? `Efectivo C$${Number(currentOrder.cashAmount).toFixed(2)}` : '',
      !cashPaid && !cardPaid && currentOrder?.cardAmount ? `Tarjeta C$${Number(currentOrder.cardAmount).toFixed(2)}` : '',
    ].filter(Boolean);
    const totalDiscount = discountAmount + pointsRedemptionAmount;
    const orderNumber = currentOrder?.orderNumber || selectedOrderId || '';

    const storeProfile = getCurrentStoreReceiptProfile();
    const receiptItems = currentItems.map(item => ({
      name: item.name,
      quantity: item.quantity,
      price: item.price,
      subtotal: item.subtotal,
      notes: (item as any).notes,
    }));
    const receiptTotals = {
      consumo: receiptSubtotal,
      discount: totalDiscount,
      subtotal: Math.max(receiptSubtotal - totalDiscount + deliveryFee, 0),
      tax: receiptTax,
      serviceFee: receiptServiceFee,
      total: finalTotal,
    };
    const receiptCreatedAt = currentOrder?.createdAt ? new Date(currentOrder.createdAt) : new Date();
    const receiptCustomerName = selectedCustomer?.name || currentOrder?.customerName || 'Clientes Varios';
    const receiptCustomerPhone = selectedCustomer?.phone || '';
    const receiptCustomerAddress = (selectedCustomer as any)?.address || '';
    const receiptCashierName = currentUser?.name || currentUser?.username || '';

    const receiptHtml = buildThermalReceiptHtml({
      storeProfile,
      orderNumber,
      orderTypeText,
      tableNumber,
      customerName: receiptCustomerName,
      customerPhone: receiptCustomerPhone,
      customerAddress: receiptCustomerAddress,
      createdAt: receiptCreatedAt,
      items: receiptItems,
      totals: receiptTotals,
      paymentLines,
      cashierName: receiptCashierName,
      widthMm: 80,
    });
    const receiptText = buildThermalReceiptText({
      storeProfile,
      orderNumber,
      orderTypeText,
      tableNumber,
      customerName: receiptCustomerName,
      customerPhone: receiptCustomerPhone,
      customerAddress: receiptCustomerAddress,
      createdAt: receiptCreatedAt,
      items: receiptItems,
      totals: receiptTotals,
      paymentLines,
      cashierName: receiptCashierName,
      widthMm: 80,
    });

    const bridgeResult = await printViaLocalBridge(buildLocalPrintPayload({
      role: 'cashier',
      storeId: getCurrentStoreIdForPrint(),
      orderNumber,
      html: receiptHtml,
      text: receiptText,
      widthMm: 80,
    }), { timeoutMs: 900 });

    if (!bridgeResult.success) {
      openBrowserPrintWindow(receiptHtml);
    }
  };

      // Order number format: MMDD + three-digit sequence.
  const generateOrderNumber = async () => {
    return smartGenerateDailyOrderNumber(new Date());
  };

  // - draft: 鑽夌璁㈠崟
  // - confirmed: 宸茬‘璁?
  // - partial: partially paid, keep it active.


  const today = getLocalDateString();
  const todayOrderPrefix = `${today.slice(5, 7)}${today.slice(8, 10)}`;
  const isTodayPosOrder = (order: Partial<Order>): boolean => {
    const orderNumber = String(order.orderNumber || '').trim();
    if (/^\d{7}$/.test(orderNumber)) {
      return orderNumber.startsWith(todayOrderPrefix);
    }
    if (orderNumber.startsWith('ORD-')) {
      return false;
    }

    const orderDate = toDisplayDate(getOrderListTimeValue(order));
    return Boolean(orderDate && getLocalDateString(orderDate) === today);
  };

  const allOrders = (orderTypeFilter === 'all'
    ? orders
    : orders.filter(o => o.orderType === orderTypeFilter)
  ).filter(o => {
    // Exclude draft orders from active historical order checks.
    if (o.status === 'draft') return false;
    if (!isDisplayablePosOrder(o)) return false;

    return isTodayPosOrder(o);
  });

  const filteredOrders = [...allOrders].sort((a, b) => {
    const dateA = toDisplayDate(getOrderListTimeValue(a))?.getTime() || 0;
    const dateB = toDisplayDate(getOrderListTimeValue(b))?.getTime() || 0;
    return dateB - dateA;
  });

  const handleAddTable = () => {
    if (newTableName.trim()) {
      if (editingTable) {
        markTableUserEdit(editingTable.id);
        setTables(prevTables => normalizeTables(
          prevTables.map(t => (
            t.id === editingTable.id
              ? { ...t, number: newTableName.trim(), lastModified: Date.now() }
              : t
          )),
          activeOrderTableIdsRef.current
        ).tables);
        setNewTableName('');
        setEditingTable(null);
        setShowAddTableModal(false);
        return;
      }

      const newTable: Table = {
        id: `table-${Date.now()}`,
        number: newTableName.trim(),
        x: 40 + (tables.length % 7) * 150,
        y: 40 + Math.floor(tables.length / 7) * 130,
        width: 110,
        height: 90,
        status: 'available',
        capacity: 4,
        lastModified: Date.now()
      };
      markTableUserEdit(newTable.id);
      setTables(prevTables => normalizeTables([...prevTables, newTable], activeOrderTableIdsRef.current).tables);
      setNewTableName('');
      setEditingTable(null);
      setShowAddTableModal(false);
    }
  };

  const handleDeleteTable = async (tableId: string) => {
    if (window.confirm('\u786e\u5b9a\u8981\u5220\u9664\u8fd9\u4e2a\u684c\u5b50\u5417?')) {
      markTableUserEdit(tableId);
      deletedTableIdsRef.current.add(tableId);
      setSelectedTables(prev => prev.filter(id => id !== tableId));
      if (selectedTableId === tableId) {
        setSelectedTableId(null);
      }
      setTables(prevTables => prevTables.filter(t => t.id !== tableId));

      try {
        await smartDeleteDocument('pos_tables', tableId);
      } catch (error) {
        console.error('POS operation failed:', error);
        alert('\u5220\u9664\u4e91\u7aef\u684c\u53f0\u5931\u8d25\uff0c\u8bf7\u68c0\u67e5\u7f51\u7edc\u540e\u91cd\u8bd5');
      }
    }
  };

  const handleOrderClick = (order: any) => {
    if (order.status === 'cancelled' || (order.status === 'completed' && order.clearedAt)) {
      const table = tables.find(t => t.number === order.tableNumber);
      setSelectedTableId(table ? table.id : null);
      setSelectedOrderId(order.id);

      const formattedItems: OrderItem[] = (order.items || []).map((item: any, index: number) => ({
        id: item.id || `item-${index}`,
        menuItemId: item.menuItemId || '',
        name: item.name,
        quantity: item.quantity,
        price: item.price,
        subtotal: item.quantity * item.price,
        type: item.type || (item.stockItemId ? 'direct' : 'recipe'),
        stockItemId: item.stockItemId,
        ingredients: item.ingredients || [],
        sentToKitchen: true,
        sentQuantity: item.quantity
      }));
      setCurrentItems(formattedItems);

      if (order.customerId) {
        const customer = customers.find(c => c.id === order.customerId);
        if (customer) {
          setSelectedCustomer(customer);
        }
      } else {
        setSelectedCustomer(null);
      }

      setOrderType(order.orderType || 'dine_in');
      if (order.orderType === 'delivery') {
        setDeliveryType(order.deliveryType || 'self');
        setDeliveryFee(order.deliveryFee || 0);
      } else {
        setDeliveryFee(0);
      }
      setServiceFeeEnabled(false);
      setTaxEnabled(false);

      setViewMode('order');
      return;
    }

    if (order.status === 'completed' && !order.clearedAt) {
      setTableActionData({
        tableId: order.tableId,
        tableNumber: order.tableNumber,
        orderId: order.id
      });
      setShowTableActionModal(true);
      return;
    }

    const table = tables.find(t => t.id === order.tableId) || tables.find(t => t.number === order.tableNumber);
    setSelectedTableId(table ? table.id : null);
    setSelectedOrderId(order.id);

    const formattedItems: OrderItem[] = (order.items || []).map((item: any, index: number) => ({
      id: item.id || `item-${index}`,
      menuItemId: item.menuItemId || '',
      name: item.name,
      quantity: item.quantity,
      price: item.price,
      subtotal: item.quantity * item.price,
      type: item.type || (item.stockItemId ? 'direct' : 'dish'),
      stockItemId: item.stockItemId,
      ingredients: item.ingredients || [],
      sentToKitchen: item.sentToKitchen || false,
      sentQuantity: item.sentQuantity || 0
    }));

    setCurrentItems(formattedItems);
    setOrderType(order.orderType || 'dine_in');
    setDeliveryType(order.deliveryType || 'self');
    setDeliveryFee(order.orderType === 'delivery' ? (order.deliveryFee || 0) : 0);
    setServiceFeeEnabled(false);
    setTaxEnabled(false);
    setCashNIO('');
    setCashUSD('');
    setCardNIO('');
    setCardUSD('');
    setViewMode('order');
  };

  const handleTableDragStart = (e: React.DragEvent, tableId: string) => {
    if (!isEditMode) return;
    setDraggedTable(tableId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', tableId);
  };

  const handleTableMouseDown = (e: React.MouseEvent, tableId: string) => {
    if (!isEditMode) return;

    const table = tables.find(t => t.id === tableId);
    if (!table) return;

    setIsDragging(true);
    setDraggedTable(tableId);

    const rect = (e.target as HTMLElement).getBoundingClientRect();
    setDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    });

    e.preventDefault();
    e.stopPropagation();
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !draggedTable) return;

    const container = e.currentTarget as HTMLElement;
    const rect = container.getBoundingClientRect();

    const newX = e.clientX - rect.left - dragOffset.x + container.scrollLeft;
    const newY = e.clientY - rect.top - dragOffset.y + container.scrollTop;

    pendingDragPositionRef.current = {
      x: Math.max(0, newX),
      y: Math.max(0, newY)
    };

    if (dragAnimationFrameRef.current !== null) {
      return;
    }

    dragAnimationFrameRef.current = window.requestAnimationFrame(() => {
      dragAnimationFrameRef.current = null;
      const nextPosition = pendingDragPositionRef.current;
      if (!nextPosition) return;

      setTables(prevTables => prevTables.map(t => {
        if (t.id === draggedTable) {
          return {
            ...t,
            x: nextPosition.x,
            y: nextPosition.y
          };
        }
        return t;
      }));
    });
  };

  const handleMouseUp = () => {
    if (isDragging && draggedTable) {
      markTableUserEdit(draggedTable);
      const finalPosition = pendingDragPositionRef.current;
      if (finalPosition) {
        setTables(prevTables => prevTables.map(t => (
          t.id === draggedTable
            ? { ...t, x: finalPosition.x, y: finalPosition.y, lastModified: Date.now() }
            : t
        )));
      }
      pendingDragPositionRef.current = null;
    }
    setIsDragging(false);
    setDraggedTable(null);
  };


  const handleTableSelectForMerge = (tableId: string) => {
    if (!isEditMode) return;
    setSelectedTables(prev =>
      prev.includes(tableId)
        ? prev.filter(id => id !== tableId)
        : [...prev, tableId]
    );
  };

  const handleMergeTables = () => {
    if (selectedTables.length < 2) {
      alert('\u8bf7\u81f3\u5c11\u9009\u62e9 2 \u5f20\u684c\u5b50');
      return;
    }

    const firstTable = tables.find(t => t.id === selectedTables[0]);
    if (!firstTable) return;

    const mergedFromTables = selectedTables
      .map(id => tables.find(t => t.id === id))
      .filter((t): t is Table => Boolean(t))
      .map(t => ({
        id: t.id,
        number: t.number,
        x: t.x,
        y: t.y,
        width: t.width,
        height: t.height,
        shape: t.shape,
        orientation: t.orientation,
        capacity: t.capacity,
        status: t.status,
        currentOrderId: t.currentOrderId
      }));

    const mergedBounds = getMergedTableBounds(mergedFromTables);

    const mergedTable: Table = {
      ...firstTable,
      id: `merged-${Date.now()}`,
      number: `${mergedFromTables.map(t => t.number).join('+')}`,
      x: mergedBounds.x,
      y: mergedBounds.y,
      width: mergedBounds.width,
      height: mergedBounds.height,
      shape: 'rectangle',
      orientation: mergedBounds.orientation,
      mergedFromTables,
      lastModified: Date.now(),
      capacity: mergedFromTables.reduce((sum, t) => sum + (t.capacity || 0), 0)
    };
    markTableUserEdit(mergedTable.id);

    selectedTables.forEach(id => {
      deletedTableIdsRef.current.add(id);
      smartDeleteDocument('pos_tables', id).catch(error => {
        console.error('delete merged source table failed:', id, error);
      });
    });
    const newTables = tables.filter(t => !selectedTables.includes(t.id));
    newTables.push(mergedTable);
    setTables(normalizeTables(newTables, activeOrderTableIdsRef.current).tables);
    setSelectedTables([]);
  };

  const handleSplitTable = (tableId: string) => {
    const table = tables.find(t => t.id === tableId);
    if (!table || !table.number.includes('+')) {
      alert('\u53ea\u80fd\u62c6\u5206\u5408\u5e76\u8fc7\u7684\u684c\u5b50');
      return;
    }

    const numbers = table.number.split('+');
    const now = Date.now();
    const restoredTables = table.mergedFromTables
      ? table.mergedFromTables.map(original => ({
        ...original,
        x: original.x,
        y: original.y,
        width: original.width || 110,
        height: original.height || 90,
        shape: original.shape || (Math.abs((original.width || 110) - (original.height || 90)) <= 12 ? 'round' as const : 'rectangle' as const),
        orientation: original.orientation || ((original.width || 110) >= (original.height || 90) ? 'horizontal' as const : 'vertical' as const),
        status: original.status || ('available' as const),
        capacity: original.capacity || Math.floor(table.capacity / numbers.length),
        lastModified: now
      }))
      : numbers.map((num, idx) => ({
      id: `split-${tableId}-${idx}`,
      number: num,
      x: table.x + idx * 130,
      y: table.y,
      width: 110,
      height: 90,
      shape: 'rectangle' as const,
      orientation: 'horizontal' as const,
      status: 'available' as const,
      capacity: Math.floor(table.capacity / numbers.length),
      lastModified: now
    }));

    restoredTables.forEach(restoredTable => {
      deletedTableIdsRef.current.delete(restoredTable.id);
      smartSetDocument('pos_tables', restoredTable.id, restoredTable).catch(error => {
        console.error('restore split table failed:', restoredTable.id, error);
      });
    });
    deletedTableIdsRef.current.add(tableId);
    smartDeleteDocument('pos_tables', tableId).catch(error => {
      console.error('delete split source table failed:', tableId, error);
    });
    setTables(normalizeTables([...tables.filter(t => t.id !== tableId), ...restoredTables], activeOrderTableIdsRef.current).tables);
  };

  const getStatusColor = (status: string, paymentStatus?: string, clearedAt?: Date) => {
    return getPosOrderCardColor(status, paymentStatus, clearedAt);
  };

  const getStatusText = (status: string, paymentStatus?: string, clearedAt?: Date) => {
    return getPosOrderStatusText(status, paymentStatus, clearedAt);
  };


  const getTableSprite = (table: Table) => {
    if (table.shape === 'rectangle' || table.number.includes('+')) {
      return table.orientation === 'vertical' ? tableVerticalModern : tableHorizontalModern;
    }

    return tableSingleModern;
  };

  const getTableImageFilter = (table: Table) => {
    const baseShadow = selectedTableId === table.id
      ? 'drop-shadow(0 14px 16px rgba(37, 99, 235, 0.20))'
      : selectedTables.includes(table.id)
        ? 'drop-shadow(0 14px 16px rgba(124, 58, 237, 0.24))'
        : 'drop-shadow(0 12px 14px rgba(15, 23, 42, 0.18))';

    if (selectedTables.includes(table.id)) {
      return `saturate(1.55) hue-rotate(238deg) brightness(0.98) ${baseShadow}`;
    }

    switch (table.status) {
      case 'occupied':
        return `sepia(0.42) saturate(2.65) hue-rotate(318deg) brightness(0.94) ${baseShadow}`;
      case 'needs_cleaning':
        return `sepia(0.34) saturate(2.25) hue-rotate(342deg) brightness(1.06) ${baseShadow}`;
      case 'reserved':
        return `sepia(0.38) saturate(1.95) hue-rotate(356deg) brightness(1.04) ${baseShadow}`;
    }

    if (selectedTableId === table.id) {
      return `saturate(1.35) hue-rotate(205deg) brightness(1.02) ${baseShadow}`;
    }

    return baseShadow;
  };

  const renderPosToast = () => (
    <>
      {posToast && (
        <div style={{
          position: 'fixed',
          top: '76px',
          right: '20px',
          zIndex: 10000,
          maxWidth: '360px',
          padding: '0.85rem 1rem',
          borderRadius: '0.75rem',
          color: posToast.tone === 'error' ? '#991b1b' : '#065f46',
          backgroundColor: posToast.tone === 'error' ? '#fee2e2' : '#dcfce7',
          border: posToast.tone === 'error' ? '1px solid #fecaca' : '1px solid #86efac',
          boxShadow: '0 14px 30px rgba(15, 23, 42, 0.18)',
          fontWeight: 800,
          fontSize: '0.9rem',
          lineHeight: 1.35,
          pointerEvents: 'none'
        }}>
          {posToast.message}
        </div>
      )}
    </>
  );


  // Cancel Modal Component
  const renderCancelModal = () => (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 999999,
      }}
    >
      <div style={{
        backgroundColor: 'white',
        borderRadius: '0.75rem',
        padding: '1.5rem',
        width: '450px',
        maxWidth: '90%',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)'
      }}>
        <h3 style={{
          fontSize: '1.25rem',
          fontWeight: 'bold',
          color: '#dc2626',
          marginBottom: '1rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem'
        }}>
          {itemToDelete ? '⚠️ Autorizar cancelación de producto' : '⚠️ Autorizar cancelación de pedido'}
        </h3>

        <div style={{ marginBottom: '1rem', padding: '0.75rem', backgroundColor: '#fef2f2', borderRadius: '0.5rem', border: '1px solid #fecaca' }}>
          <p style={{ margin: 0, fontSize: '0.9rem', color: '#991b1b' }}>
            <strong>Atención: </strong>
            {itemToDelete
              ? 'Este producto ya fue enviado a cocina. Se requiere autorización.'
              : 'Cancelar el pedido requiere autorización. Esta acción no se puede deshacer.'}
          </p>
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: '600', color: '#374151', marginBottom: '0.5rem' }}>
            Clave de autorización
          </label>
          <div style={{ fontSize: '0.8rem', color: '#6b7280', marginBottom: '0.5rem' }}>
            Clave del jefe o gerente
          </div>
          <input
            type="password"
            value={cancelPassword}
            onChange={(e) => setCancelPassword(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            placeholder="Ingrese la clave"
            style={{
              width: '100%',
              padding: '0.75rem',
              border: '2px solid #d1d5db',
              borderRadius: '0.375rem',
              fontSize: '1rem',
              boxSizing: 'border-box',
              position: 'relative',
              zIndex: 1000000
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                confirmCancelOrder();
              }
            }}
          />
        </div>

        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: '600', color: '#374151', marginBottom: '0.5rem' }}>
            📝 Motivo de cancelación
          </label>
          <textarea
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            placeholder="Escriba el motivo..."
            rows={3}
            style={{
              width: '100%',
              padding: '0.75rem',
              border: '2px solid #d1d5db',
              borderRadius: '0.375rem',
              fontSize: '0.9rem',
              resize: 'vertical',
              boxSizing: 'border-box'
            }}
          />
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
          <button
            onClick={() => {
              setShowCancelModal(false);
              setCancelPassword('');
              setCancelReason('');
              setItemToDelete(null);
            }}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: '#f3f4f6',
              color: '#374151',
              border: 'none',
              borderRadius: '0.375rem',
              fontWeight: '600',
              cursor: 'pointer',
              fontSize: '0.95rem'
            }}
          >
            Cerrar
          </button>
          <button
            onClick={confirmCancelOrder}
            disabled={!cancelPassword.trim()}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: !cancelPassword.trim() ? '#d1d5db' : '#dc2626',
              color: 'white',
              border: 'none',
              borderRadius: '0.375rem',
              fontWeight: '600',
              cursor: !cancelPassword.trim() ? 'not-allowed' : 'pointer',
              fontSize: '0.95rem'
            }}
          >
            Autorizar
          </button>
        </div>
      </div>
    </div>
  );

  // Table Action Modal Component
  const TableActionModal = () => {
    const order = orders.find(o => o.id === tableActionData?.orderId);
    const isDineIn = order?.orderType === 'dine_in';

    return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999
    }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '0.75rem',
        padding: '2rem',
        maxWidth: '400px',
        width: '90%',
        boxShadow: '0 10px 25px rgba(0,0,0,0.2)'
      }}>
        <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.25rem', color: '#374151' }}>
          {isDineIn ? `Mesa ${tableActionData?.tableNumber}` : `${tableActionData?.tableNumber}`} - Acción
        </h3>
        <p style={{ margin: '0 0 1.5rem 0', color: '#6b7280', fontSize: '0.95rem' }}>
          {isDineIn ? 'Este pedido ya está pagado. Puede agregar productos o liberar la mesa.' : 'Este pedido ya está pagado. Elija la siguiente acción.'}
        </p>

        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
          <button
            onClick={() => {
              handleTableAction('add');
            }}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '0.375rem',
              fontWeight: '600',
              cursor: 'pointer',
              fontSize: '0.95rem'
            }}
          >
            Agregar
          </button>
          <button
            onClick={() => {
              handleTableAction('clear');
            }}
            disabled={!!clearingOrderId}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: clearingOrderId ? '#9ca3af' : '#ef4444',
              color: 'white',
              border: 'none',
              borderRadius: '0.375rem',
              fontWeight: '600',
              cursor: clearingOrderId ? 'not-allowed' : 'pointer',
              fontSize: '0.95rem'
            }}
          >
            {clearingOrderId ? 'Procesando...' : (isDineIn ? '🧹 Liberar mesa' : '✅ Completar')}
          </button>
        </div>
      </div>
    </div>
  );
  };

  // Split Bill View
  if (viewMode === 'split-bill') {
    return (
      <>
        {renderPosToast()}
        <div style={{ height: 'calc(100vh - 8rem)', display: 'flex', flexDirection: 'column', padding: '1rem', gap: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0' }}>
            <h2 style={{ margin: 0, fontSize: '1.5rem', color: '#1f2937' }}>
              Dividir cuenta - Mesa {selectedTableId ? tables.find(t => t.id === selectedTableId)?.number : ''}
            </h2>
            <button
              onClick={() => setViewMode('order')}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: '#6b7280',
                color: 'white',
                border: 'none',
                borderRadius: '0.375rem',
                cursor: 'pointer',
                fontWeight: '600'
              }}
            >
              ← Volver a pedido
            </button>
          </div>

          <SplitBillModal
            items={currentItems}
            initialSplitBills={(() => {
              const currentOrder = orders.find(o => o.id === selectedOrderId);
              return currentOrder?.splitBills;
            })()}
            onClose={() => setViewMode('order')}
            onConfirm={(splitBills) => {
              handleSplitBillConfirm(splitBills);
              setViewMode('order');
            }}
          />
        </div>
      </>
    );
  }

  // Order View
  if (viewMode === 'order') {
    const currentOrder = orders.find(o => o.id === selectedOrderId);
    const isReadOnly = currentOrder?.status === 'cancelled' || (currentOrder?.status === 'completed' && !!currentOrder?.clearedAt);

    return (
      <>
        {renderPosToast()}
        <div style={{
          height: 'calc(100vh - 64px)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          background: colors.page,
          fontFamily: font.family,
        }}>
          <div style={{ flex: 1, display: 'flex', gap: '0.75rem', padding: '0.75rem', overflow: 'hidden', boxSizing: 'border-box' }}>
            {/* Left: Menu Selection - 鍙妯″紡闅愯棌 */}
            {!isReadOnly && (
              <div style={{ ...posPanelStyle, flex: 6, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                <MenuSelection
                  items={currentItems}
                  onAddItem={handleAddItem}
                  onRemoveItem={handleRemoveItem}
                  onUpdateQuantity={handleUpdateQuantity}
                />
              </div>
            )}

            {/* Middle: Order Details */}
            <div style={{
              flex: isReadOnly ? '0 0 auto' : 4,
              width: isReadOnly ? '320px' : 'auto',
              maxWidth: '350px',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden'
            }}>
              {currentItems.length > 0 ? (
                <div style={{ ...posPanelStyle, flex: 1, backgroundColor: '#fffdf2', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                  <div style={{ flex: '1 1 auto', overflowY: 'auto', padding: '0.75rem', maxHeight: 'calc(100vh - 200px)' }}>
                    {/* Receipt Header */}
                <div style={{ textAlign: 'center', borderBottom: '2px dashed #d1d5db', paddingBottom: '0.75rem', marginBottom: '0.75rem' }}>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#1f2937', margin: '0 0 0.5rem 0' }}>
                    Restaurante Chino
                  </h3>

                  <div style={{ fontSize: '0.8rem', color: '#4b5563', lineHeight: '1.6' }}>
                    {(() => {
                      const currentOrder = orders.find(o => o.id === selectedOrderId);
                      const displayOrderType = currentOrder?.orderType || orderType;
                      const displayOrderNumber = currentOrder?.orderNumber || (selectedOrderId ? selectedOrderId.slice(-6) : '');

                      return (
                        <>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                            <span>Tipo:</span>
                            <span style={{ fontWeight: '600' }}>
                              {formatPosOrderType(displayOrderType)}
                            </span>
                          </div>

                          {displayOrderNumber && (
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                              <span>Pedido:</span>
                              <span style={{ fontWeight: '600', fontSize: '0.75rem' }}>{displayOrderNumber}</span>
                            </div>
                          )}

                          {selectedTableId && (
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                              <span>Mesa:</span>
                              <span style={{ fontWeight: '600' }}>{tables.find(t => t.id === selectedTableId)?.number}</span>
                            </div>
                          )}

                          {selectedCustomer && (
                            <>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                                <span>Cliente:</span>
                                <span style={{ fontWeight: '600' }}>{selectedCustomer.name}</span>
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                                <span>电话：</span>
                                <span style={{ fontWeight: '600' }}>{selectedCustomer.phone}</span>
                              </div>
                            </>
                          )}

                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                                <span>Hora:</span>
                            <span style={{ fontWeight: '600' }}>{formatNicaraguaTime(new Date())}</span>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </div>

                {/* Split Bill Notice */}
                {(() => {
                  const currentOrder = orders.find(o => o.id === selectedOrderId);
                  if (currentOrder?.splitBills && currentOrder.splitBills.length > 0) {
                    return (
                      <div style={{
                        marginTop: '0.5rem',
                        padding: '0.5rem',
                        backgroundColor: '#fef3c7',
                        borderRadius: '0.25rem',
                        fontSize: '0.75rem'
                      }}>
                        <div style={{ fontWeight: '600', color: '#92400e', marginBottom: '0.25rem' }}>
                    🔀 Dividido en {currentOrder.splitBills.length}
                        </div>
                        {currentOrder.splitBills.map(bill => (
                          <div key={bill.id} style={{ color: '#78350f' }}>
                      {bill.customerName}: C${bill.subtotal.toFixed(2)} ({bill.paymentStatus === 'paid' ? 'Pagado' : 'Pendiente'})
                          </div>
                        ))}
                      </div>
                    );
                  }
                  return null;
                })()}

                {/* Items List */}
                <div style={{ marginBottom: '0.75rem' }}>
                  {currentItems.map(item => (
                    <div key={item.id} style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '0.375rem 0',
                      borderBottom: '1px dashed #e5e7eb',
                      fontSize: '0.8rem'
                    }}>
                      <div style={{ flex: 2 }}>
                        <div style={{ fontWeight: '600', color: '#374151' }}>{item.name}</div>
                        <div style={{ fontSize: '0.7rem', color: '#6b7280' }}>x{item.quantity} × C${item.price.toFixed(2)}</div>
                      </div>
                      <div style={{ flex: 1, textAlign: 'right', fontWeight: '600', color: '#374151', marginRight: '0.5rem' }}>
                        C${item.subtotal.toFixed(2)}
                      </div>
                      <div style={{ display: 'flex', gap: '0.25rem' }}>
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleUpdateQuantity(item.id, item.quantity + 1);
                          }}
                          style={{
                            width: '24px',
                            height: '24px',
                            padding: '0',
                            backgroundColor: '#10b981',
                            color: 'white',
                            border: 'none',
                            borderRadius: '0.25rem',
                            cursor: 'pointer',
                            fontSize: '0.9rem',
                            fontWeight: 'bold',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                          title="澧炲姞鏁伴噺"
                        >
                          +
                        </button>
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (item.quantity > 1) {
                              if (item.quantity > item.sentQuantity) {
                                handleUpdateQuantity(item.id, item.quantity - 1);
                              } else {
                                setItemToDelete(item.id);
                                setCancelAction('reduce');
                                setShowCancelModal(true);
                              }
                            } else {
                              handleRemoveItem(item.id);
                            }
                          }}
                          style={{
                            width: '24px',
                            height: '24px',
                            padding: '0',
                            backgroundColor: item.quantity > 1 ? '#f59e0b' : '#ef4444',
                            color: 'white',
                            border: 'none',
                            borderRadius: '0.25rem',
                            cursor: 'pointer',
                            fontSize: '0.9rem',
                            fontWeight: 'bold',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                    title={item.quantity > 1 ? "Reducir cantidad" : "Eliminar producto"}
                        >
                          {item.quantity > 1 ? '−' : '×'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Cost Details */}
                <div style={{ borderTop: '2px dashed #d1d5db', paddingTop: '0.5rem' }}>
                  {/* Delivery fee appears above tax and service lines. */}
                  {(() => {
                    const currentOrder = orders.find(o => o.id === selectedOrderId);
                    const displayDeliveryFee = currentOrder?.orderType === 'delivery' ? (currentOrder.deliveryFee || deliveryFee) : 0;

                    if (displayDeliveryFee > 0) {
                      return (
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem', fontSize: '0.75rem' }}>
                  <span style={{ color: '#6b7280' }}>🚚 Envío</span>
                          <span style={{ color: '#374151', fontWeight: '600' }}>C${displayDeliveryFee.toFixed(2)}</span>
                        </div>
                      );
                    }
                    return null;
                  })()}

                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem', fontSize: '0.75rem' }}>
                    <span style={{ color: '#6b7280' }}>IVA (15%)</span>
                    <span style={{ color: '#374151', fontWeight: '600' }}>C${(taxEnabled ? tax : 0).toFixed(2)}</span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem', fontSize: '0.75rem' }}>
                    <span style={{ color: '#6b7280' }}>Servicio (10%)</span>
                    <span style={{ color: '#374151', fontWeight: '600' }}>C${(serviceFeeEnabled ? serviceFee : 0).toFixed(2)}</span>
                  </div>

                  {discountEnabled && discountAmount > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem', fontSize: '0.75rem' }}>
                      <span style={{ color: '#ef4444' }}>
                  🎫 Descuento {discountType === 'percentage' ? `(${discountValue}%)` : ''}
                        {discountReason && <span style={{ fontSize: '0.7rem', color: '#9ca3af' }}> - {discountReason}</span>}
                      </span>
                      <span style={{ color: '#ef4444', fontWeight: '600' }}>-C${discountAmount.toFixed(2)}</span>
                    </div>
                  )}

                  {pointsRedemptionEnabled && pointsRedemptionAmount > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem', fontSize: '0.75rem' }}>
                  <span style={{ color: '#f59e0b' }}>⭐ Canje de puntos ({pointsToUse})</span>
                      <span style={{ color: '#f59e0b', fontWeight: '600' }}>-C${pointsRedemptionAmount.toFixed(2)}</span>
                    </div>
                  )}

                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '0.3rem 0',
                    borderTop: '2px solid #d1d5db',
                    fontSize: '1.1rem',
                    fontWeight: 'bold'
                  }}>
                  <span style={{ color: '#374151' }}>Total</span>
                    <span style={{ color: '#2563eb' }}>C${finalTotal.toFixed(2)}</span>
                  </div>
                </div>

                {/* Receipt Footer */}
                <div style={{ textAlign: 'center', marginTop: '0.5rem', paddingTop: '0.3rem', borderTop: '1px dashed #d1d5db', fontSize: '0.65rem', color: '#9ca3af' }}>
                  <div>谢谢惠顾!</div>
                  <div>{formatNicaraguaDateTime(new Date())}</div>
                </div>
                  </div>

                  <div style={{ display: 'flex', gap: '0.5rem', padding: '0.75rem', borderTop: '2px solid #d1d5db', backgroundColor: '#fffbe6', flexShrink: 0 }}>
                  <button
                    onClick={handlePrintReceipt}
                    style={{
                      flex: 1,
                      padding: '0.6rem',
                      backgroundColor: '#3b82f6',
                      color: 'white',
                      border: 'none',
                      borderRadius: '0.25rem',
                      fontWeight: '600',
                      cursor: 'pointer',
                      fontSize: '0.8rem'
                    }}
                  >
                  🖨️ Imprimir recibo
                  </button>

                  {isReadOnly && (
                    <button
                      onClick={returnToOverviewFromOrder}
                      style={{
                        flex: 1,
                        padding: '0.6rem',
                        backgroundColor: '#6b7280',
                        color: 'white',
                        border: 'none',
                        borderRadius: '0.25rem',
                        fontWeight: '600',
                        cursor: 'pointer',
                        fontSize: '0.8rem'
                      }}
                    >
                      ← Inicio
                    </button>
                  )}

                  {!isReadOnly && (
                    <>
                      <button
                        onClick={handleSendToKitchen}
                        disabled={!hasUnsentItems}
                        style={{
                          flex: 1,
                          padding: '0.6rem',
                          backgroundColor: hasUnsentItems ? '#10b981' : '#d1d5db',
                          color: 'white',
                          border: 'none',
                          borderRadius: '0.25rem',
                          fontWeight: '600',
                          cursor: hasUnsentItems ? 'pointer' : 'not-allowed',
                          fontSize: '0.8rem',
                          opacity: hasUnsentItems ? 1 : 0.6
                        }}
                        title={hasUnsentItems ? 'Confirmar pedido y enviar a cocina' : 'Todo confirmado'}
                      >
                        ✅ Confirmar pedido
                      </button>
                      {currentItems.length > 0 && (
                        <button
                          onClick={handleHoldOrder}
                          style={{
                            flex: 1,
                            padding: '0.6rem',
                            backgroundColor: '#f59e0b',
                            color: 'white',
                            border: 'none',
                            borderRadius: '0.25rem',
                            fontWeight: '600',
                            cursor: 'pointer',
                            fontSize: '0.8rem'
                          }}
                        >
                          ⏸️ Retener
                        </button>
                      )}
                    </>
                  )}
                </div>

                {/* 鎷嗗垎鍜屽彇娑堟暣鍗曟寜閽?- 鍙妯″紡闅愯棌 */}
                {!isReadOnly && currentItems.length > 0 && (
                  <div style={{ display: 'flex', gap: '0.5rem', padding: '0.5rem 0.75rem', borderTop: '1px solid #e5e7eb', backgroundColor: '#fffbe6', flexShrink: 0 }}>
                    <button
                      onClick={() => setViewMode('split-bill')}
                      style={{
                        flex: 1,
                        padding: '0.5rem',
                        backgroundColor: '#8b5cf6',
                        color: 'white',
                        border: 'none',
                        borderRadius: '0.25rem',
                        cursor: 'pointer',
                        fontSize: '0.75rem',
                        fontWeight: '600'
                      }}
                    >
                      🔀 Dividir cuenta
                    </button>
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setItemToDelete(null);
                        setShowCancelModal(true);
                      }}
                      style={{
                        flex: 1,
                        padding: '0.5rem',
                        backgroundColor: '#ef4444',
                        color: 'white',
                        border: 'none',
                        borderRadius: '0.25rem',
                        cursor: 'pointer',
                        fontSize: '0.75rem',
                        fontWeight: '600'
                      }}
                    >
                      ❌ Cancelar pedido
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div style={{
                flex: 1,
                backgroundColor: '#fffbe6',
                borderRadius: '0.5rem',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'column',
                gap: '0.75rem',
                fontSize: '0.875rem',
                color: '#9ca3af'
              }}>
                <div style={{ fontWeight: 700, color: '#6b7280' }}>Sin pedido</div>
                <button
                  onClick={returnToOverviewFromOrder}
                  style={{
                    padding: '0.55rem 1.1rem',
                    borderRadius: '0.55rem',
                    border: '1px solid #f59e0b',
                    backgroundColor: '#f59e0b',
                    color: '#ffffff',
                    fontWeight: 800,
                    cursor: 'pointer',
                    boxShadow: '0 8px 18px rgba(245, 158, 11, 0.22)'
                  }}
                >
                  ← Volver
                </button>
                {/* empty-order-state-end */}
              </div>
            )}
          </div>

          {/* Right: Payment Interface - 鍙妯″紡闅愯棌 */}
          {!isReadOnly && (
            <div style={{ ...posPanelStyle, flex: 3, padding: '1rem', display: 'flex', flexDirection: 'column' }}>
            <h3 style={{ fontSize: '1.05rem', fontWeight: '800', color: colors.textPrimary, margin: 0, marginBottom: '0.75rem' }}>💳 Pago</h3>

            {selectedOrderId && settledAmount > 0 && (
              <div style={{
                padding: '0.4rem',
                backgroundColor: '#d1fae5',
                borderRadius: '0.25rem',
                marginBottom: '0.4rem',
                border: '1px solid #10b981'
              }}>
                <div style={{ fontSize: '0.75rem', color: '#065f46', fontWeight: '600', marginBottom: '0.2rem' }}>
                  ✅ Pagado
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '0.15rem' }}>
                  <span style={{ color: '#047857' }}>之前：</span>
                  <span style={{ fontWeight: '600', color: '#059669' }}>C${settledAmount.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '0.15rem' }}>
                  <span style={{ color: '#047857' }}>总额：</span>
                  <span style={{ fontWeight: '600', color: '#2563eb' }}>C${finalTotal.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '0.2rem', borderTop: '1px dashed #10b981', fontSize: '0.8rem' }}>
                  <span style={{ color: '#065f46', fontWeight: '600' }}>Falta:</span>
                  <span style={{ fontWeight: 'bold', color: '#dc2626', fontSize: '1rem' }}>C${remainingAmount.toFixed(2)}</span>
                </div>
              </div>
            )}

            {currentItems.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {orderType === 'delivery' && (
                  <div style={{ padding: '0.4rem', backgroundColor: '#f9fafb', borderRadius: '0.25rem', border: '1px solid #e5e7eb' }}>
                    {/* 娲鹃€佺被鍨嬮€夋嫨 */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.4rem' }}>
                      <label style={{ fontSize: '0.8rem', color: '#6b7280', fontWeight: '600', whiteSpace: 'nowrap' }}>🚚 Tipo de entrega:</label>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.8rem', cursor: 'pointer' }}>
                          <input
                            type="radio"
                            name="deliveryType"
                            value="self"
                            checked={deliveryType === 'self'}
                            onChange={(e) => setDeliveryType(e.target.value as 'self' | 'outsourced')}
                            style={{ cursor: 'pointer' }}
                          />
                          Propio
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.8rem', cursor: 'pointer' }}>
                          <input
                            type="radio"
                            name="deliveryType"
                            value="outsourced"
                            checked={deliveryType === 'outsourced'}
                            onChange={(e) => setDeliveryType(e.target.value as 'self' | 'outsourced')}
                            style={{ cursor: 'pointer' }}
                          />
                          Tercero
                        </label>
                      </div>
                    </div>

                    {/* Delivery fee input */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <label style={{ fontSize: '0.8rem', color: '#6b7280', fontWeight: '600', whiteSpace: 'nowrap' }}>💰 Costo de envío:</label>
                      <input
                        type="number"
                        value={deliveryFee || ''}
                        onChange={(e) => setDeliveryFee(parseFloat(e.target.value) || 0)}
                        placeholder="0"
                        min="0"
                        step="0.01"
                        style={{ flex: 1, padding: '0.3rem', border: '1px solid #d1d5db', borderRadius: '0.25rem', fontSize: '0.85rem' }}
                      />
                    </div>

                    {/* 鎻愮ず鏂囧瓧 */}
                    {deliveryType === 'outsourced' && deliveryFee > 0 && (
                      <div style={{ fontSize: '0.75rem', color: '#ef4444', marginTop: '0.25rem' }}>
                        ⚠️ El envío de tercero se registrará como gasto del día
                      </div>
                    )}
                  </div>
                )}

                {/* 鎶樻墸鍔熻兘 */}
                <div style={{ padding: '0.4rem', backgroundColor: '#f9fafb', borderRadius: '0.25rem', border: '1px solid #e5e7eb' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: discountEnabled ? '0.4rem' : '0' }}>
                    <input
                      type="checkbox"
                      checked={discountEnabled}
                      onChange={(e) => {
                        if (e.target.checked) {
                          const password = prompt('🔑 Ingrese clave de gerente/jefe para aplicar descuento:');
                          if (password && managerAuthorizationPasswords.includes(password.trim())) {
                            setDiscountEnabled(true);
                          } else {
                            alert('❌ Clave incorrecta. Requiere autorización.');
                          }
                        } else {
                          setDiscountEnabled(false);
                        }
                      }}
                      id="discount-checkbox"
                      style={{ width: '14px', height: '14px', cursor: 'pointer' }}
                    />
                    <label htmlFor="discount-checkbox" style={{ fontSize: '0.8rem', color: '#6b7280', fontWeight: '600', cursor: 'pointer' }}>
                      🎫 Descuento
                    </label>
                  </div>

                  {discountEnabled && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      <div style={{ display: 'flex', gap: '0.4rem' }}>
                        <select
                          value={discountType}
                          onChange={(e) => setDiscountType(e.target.value as 'percentage' | 'fixed')}
                          style={{ flex: 1, padding: '0.3rem', border: '1px solid #d1d5db', borderRadius: '0.25rem', fontSize: '0.8rem' }}
                        >
                          <option value="percentage">Porcentaje(%)</option>
                          <option value="fixed">Monto fijo(C$)</option>
                        </select>
                        <input
                          type="number"
                          value={discountValue || ''}
                          onChange={(e) => setDiscountValue(parseFloat(e.target.value) || 0)}
                          placeholder={discountType === 'percentage' ? '%' : 'C$'}
                          min="0"
                          max={discountType === 'percentage' ? 100 : subtotal}
                          step="0.01"
                          style={{ flex: 1, padding: '0.3rem', border: '1px solid #d1d5db', borderRadius: '0.25rem', fontSize: '0.8rem' }}
                        />
                      </div>
                      <input
                        type="text"
                        value={discountReason}
                        onChange={(e) => setDiscountReason(e.target.value)}
                        placeholder="Motivo del descuento"
                        style={{ width: '100%', padding: '0.3rem', border: '1px solid #d1d5db', borderRadius: '0.25rem', fontSize: '0.8rem' }}
                      />
                      {discountAmount > 0 && (
                        <div style={{ fontSize: '0.8rem', color: '#ef4444', fontWeight: '600' }}>
                          -C${discountAmount.toFixed(2)}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* 绉垎鍏戞崲 */}
                {selectedCustomer && (
                  <div style={{
                    padding: '0.4rem',
                    backgroundColor: selectedCustomer.points > 0 ? '#fef3c7' : '#f3f4f6',
                    borderRadius: '0.25rem',
                    border: selectedCustomer.points > 0 ? '1px solid #f59e0b' : '1px solid #d1d5db'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: (pointsRedemptionEnabled && selectedCustomer.points > 0) ? '0.4rem' : '0' }}>
                      <input
                        type="checkbox"
                        checked={pointsRedemptionEnabled}
                        onChange={(e) => setPointsRedemptionEnabled(e.target.checked)}
                        id="points-checkbox"
                        disabled={selectedCustomer.points === 0}
                        style={{
                          width: '14px',
                          height: '14px',
                          cursor: selectedCustomer.points > 0 ? 'pointer' : 'not-allowed',
                          opacity: selectedCustomer.points === 0 ? 0.5 : 1
                        }}
                      />
                      <label htmlFor="points-checkbox" style={{
                        fontSize: '0.8rem',
                        color: selectedCustomer.points > 0 ? '#92400e' : '#9ca3af',
                        fontWeight: '600',
                        cursor: selectedCustomer.points > 0 ? 'pointer' : 'not-allowed',
                        flex: 1
                      }}>
                        ⭐ Puntos({selectedCustomer.points})
                        {selectedCustomer.points === 0 && (
                          <span style={{ fontSize: '0.7rem', color: '#ef4444', marginLeft: '0.3rem' }}>
                            (sin puntos)
                          </span>
                        )}
                      </label>
                    </div>

                    {pointsRedemptionEnabled && selectedCustomer.points > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <label style={{ fontSize: '0.75rem', color: '#92400e', whiteSpace: 'nowrap' }}>
                            Cambio({pointsExchangeRate} pts = C$1):
                          </label>
                          <input
                            type="number"
                            value={pointsToUse || ''}
                            onChange={(e) => {
                              const value = Math.min(parseInt(e.target.value) || 0, selectedCustomer.points);
                              setPointsToUse(value);
                            }}
                            placeholder="Puntos"
                            min="0"
                            max={selectedCustomer.points}
                            step="1"
                            style={{ flex: 1, padding: '0.3rem', border: '1px solid #f59e0b', borderRadius: '0.25rem', fontSize: '0.8rem' }}
                          />
                          <span style={{ fontSize: '0.75rem', color: '#92400e', whiteSpace: 'nowrap' }}>
                            =C${pointsRedemptionAmount.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div>
                  <h4 style={{ fontSize: '0.9rem', fontWeight: '600', color: '#374151', marginBottom: '0.4rem', borderBottom: '1px solid #e5e7eb', paddingBottom: '0.2rem' }}>💵 Efectivo</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <span style={{ fontSize: '0.85rem', color: '#6b7280', fontWeight: '600', minWidth: '40px' }}>C$</span>
                      <input type="number" value={cashNIO} onChange={(e) => setCashNIO(e.target.value)} placeholder="0.00" min="0" step="0.01"
                        style={{ flex: 1, padding: '0.4rem', border: '1px solid #d1d5db', borderRadius: '0.25rem', fontSize: '0.9rem' }} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <span style={{ fontSize: '0.85rem', color: '#6b7280', fontWeight: '600', minWidth: '40px' }}>$</span>
                      <input type="number" value={cashUSD} onChange={(e) => setCashUSD(e.target.value)} placeholder="0.00" min="0" step="0.01"
                        style={{ flex: 1, padding: '0.4rem', border: '1px solid #d1d5db', borderRadius: '0.25rem', fontSize: '0.9rem' }} />
                      <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>≈C${cashUSD ? (parseFloat(cashUSD) * exchangeRate).toFixed(2) : '0.00'}</span>
                    </div>
                  </div>
                </div>

                <div>
                  <h4 style={{ fontSize: '0.9rem', fontWeight: '600', color: '#374151', marginBottom: '0.4rem', borderBottom: '1px solid #e5e7eb', paddingBottom: '0.2rem' }}>💳 Tarjeta</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <span style={{ fontSize: '0.85rem', color: '#6b7280', fontWeight: '600', minWidth: '40px' }}>C$</span>
                      <input type="number" value={cardNIO} onChange={(e) => setCardNIO(e.target.value)} placeholder="0.00" min="0" step="0.01"
                        style={{ flex: 1, padding: '0.4rem', border: '1px solid #d1d5db', borderRadius: '0.25rem', fontSize: '0.9rem' }} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <span style={{ fontSize: '0.85rem', color: '#6b7280', fontWeight: '600', minWidth: '40px' }}>$</span>
                      <input type="number" value={cardUSD} onChange={(e) => setCardUSD(e.target.value)} placeholder="0.00" min="0" step="0.01"
                        style={{ flex: 1, padding: '0.4rem', border: '1px solid #d1d5db', borderRadius: '0.25rem', fontSize: '0.9rem' }} />
                      <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>≈C${cardUSD ? (parseFloat(cardUSD) * exchangeRate).toFixed(2) : '0.00'}</span>
                    </div>
                  </div>
                </div>

                <div style={{ borderTop: '2px solid #e5e7eb', paddingTop: '0.6rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem', fontSize: '1.1rem', fontWeight: 'bold' }}>
                    <span>Total</span>
                    <span style={{ color: '#2563eb', fontSize: '1.3rem' }}>C${finalTotal.toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.95rem' }}>
                    <span style={{ color: '#6b7280' }}>Pago actual</span>
                    <span style={{ color: '#10b981', fontWeight: '600' }}>C${paidAmount.toFixed(2)}</span>
                  </div>

                  {change >= 0 && paidAmount > 0 && (
                    <div style={{
                      padding: '0.5rem',
                      backgroundColor: '#d1fae5',
                      borderRadius: '0.375rem',
                      marginBottom: '0.5rem',
                      textAlign: 'center',
                      border: '1px solid #10b981'
                    }}>
                      <div style={{ fontSize: '0.8rem', color: '#065f46', marginBottom: '0.15rem', fontWeight: '600' }}>Cambio</div>
                      <div style={{ fontSize: '1.4rem', fontWeight: 'bold', color: '#065f46' }}>C${change.toFixed(2)}</div>
                    </div>
                  )}
                  {change < 0 && paidAmount > 0 && (
                    <div style={{
                      padding: '0.5rem',
                      backgroundColor: '#fee2e2',
                      borderRadius: '0.375rem',
                      marginBottom: '0.5rem',
                      textAlign: 'center',
                      fontSize: '0.85rem',
                      color: '#991b1b',
                      border: '1px solid #ef4444'
                    }}>
                      Falta pagar: C${Math.abs(change).toFixed(2)}
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                    <button
                      onClick={returnToOverviewFromOrder}
                      style={{
                        flex: 1,
                        padding: '0.75rem',
                        backgroundColor: '#f3f4f6',
                        color: '#374151',
                        border: 'none',
                        borderRadius: '0.25rem',
                        fontWeight: '600',
                        cursor: 'pointer',
                        fontSize: '0.95rem'
                      }}
                    >
                      ← Volver
                    </button>

                    <button
                      onClick={handleCompletePayment}
                      disabled={isProcessingPayment || paidAmount < remainingAmount || currentItems.length === 0}
                      style={{
                        flex: 2,
                        padding: '0.75rem',
                        backgroundColor: !isProcessingPayment && paidAmount >= remainingAmount && currentItems.length > 0 ? '#10b981' : '#d1d5db',
                        color: 'white',
                        border: 'none',
                        borderRadius: '0.25rem',
                        fontWeight: '600',
                        cursor: !isProcessingPayment && paidAmount >= remainingAmount && currentItems.length > 0 ? 'pointer' : 'not-allowed',
                        fontSize: '0.95rem'
                      }}
                    >
                      {isProcessingPayment ? 'Procesando...' : '✓ Completar pago'}
                    </button>
                  </div>

                  <div style={{ marginTop: '0.5rem', padding: '0.4rem', backgroundColor: '#fef3c7', borderRadius: '0.25rem', border: '1px solid #fbbf24' }}>
                    <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.3rem' }}>
                      <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', fontSize: '0.75rem', flex: 1 }}>
                        <input
                          type="checkbox"
                          checked={serviceFeeEnabled}
                          onChange={(e) => setServiceFeeEnabled(e.target.checked)}
                          style={{ marginRight: '0.2rem', width: '12px', height: '12px' }}
                        />
                        <span>Servicio</span>
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', fontSize: '0.75rem', flex: 1 }}>
                        <input
                          type="checkbox"
                          checked={taxEnabled}
                          onChange={(e) => setTaxEnabled(e.target.checked)}
                          style={{ marginRight: '0.2rem', width: '12px', height: '12px' }}
                        />
                        <span>IVA</span>
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
          )}
        </div>
        </div>
        {showCancelModal && renderCancelModal()}
      </>
    );
  }

  // Overview View
  return (
    <>
      {renderPosToast()}
      <div style={{ height: 'calc(100vh - 64px)', display: 'flex', flexDirection: 'column', padding: '1rem', gap: '1rem', overflow: 'hidden', backgroundColor: '#eef2f7' }}>
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 430px', gap: '1rem', overflow: 'hidden' }}>
          {/* Left: Table Layout */}
          <div style={{ minWidth: 0, backgroundColor: 'white', borderRadius: '0.75rem', boxShadow: '0 10px 25px rgba(15,23,42,0.08)', border: '1px solid #e2e8f0', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '0.9rem 1rem', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#ffffff' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: '600', color: '#374151', margin: 0 }}>🪑 Mesas</h3>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  onClick={() => setShowHeldOrders(!showHeldOrders)}
                  style={{
                    padding: '0.4rem 0.8rem',
                    backgroundColor: showHeldOrders ? '#f59e0b' : '#6b7280',
                    color: 'white',
                    border: 'none',
                    borderRadius: '0.25rem',
                    fontWeight: '600',
                    cursor: 'pointer',
                    fontSize: '0.8rem',
                    position: 'relative'
                  }}
                >
                  ⏸️ Retenidos
                  {heldOrders.length > 0 && (
                    <span style={{
                      position: 'absolute',
                      top: '-6px',
                      right: '-6px',
                      backgroundColor: '#ef4444',
                      color: 'white',
                      borderRadius: '50%',
                      width: '18px',
                      height: '18px',
                      fontSize: '0.7rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 'bold'
                    }}>
                      {heldOrders.length}
                    </span>
                  )}
                </button>

                {isEditMode && selectedTables.length >= 2 && (
                  <button
                    onClick={handleMergeTables}
                    style={{
                      padding: '0.4rem 0.8rem',
                      backgroundColor: '#8b5cf6',
                      color: 'white',
                      border: 'none',
                      borderRadius: '0.25rem',
                      fontWeight: '600',
                      cursor: 'pointer',
                      fontSize: '0.8rem'
                    }}
                  >
                    🔗 Unir mesas
                  </button>
                )}
                <button
                  onClick={() => {
                    setIsEditMode(!isEditMode);
                    setSelectedTables([]);
                  }}
                  style={{
                    padding: '0.4rem 0.8rem',
                    backgroundColor: isEditMode ? '#ef4444' : '#6b7280',
                    color: 'white',
                    border: 'none',
                    borderRadius: '0.25rem',
                    fontWeight: '600',
                    cursor: 'pointer',
                    fontSize: '0.8rem'
                  }}
                >
                    {isEditMode ? 'Terminar edición' : 'Editar mesas'}
                </button>
                {isEditMode && (
                  <button
                    onClick={() => setShowAddTableModal(true)}
                    style={{
                      padding: '0.4rem 0.8rem',
                      backgroundColor: '#10b981',
                      color: 'white',
                      border: 'none',
                      borderRadius: '0.25rem',
                      fontWeight: '600',
                      cursor: 'pointer',
                      fontSize: '0.8rem'
                    }}
                  >
                    ➕ Agregar mesa
                  </button>
                )}
              </div>
            </div>
            <div
              style={{
                flex: 1,
                position: 'relative',
                backgroundColor: '#f8fafc',
                overflow: 'hidden',
                backgroundImage: tableCanvasFoodPattern,
                backgroundSize: '100% 100%, cover, 28px 28px, 28px 28px',
                backgroundPosition: 'center, center, 0 0, 0 0',
                backgroundRepeat: 'no-repeat, no-repeat, repeat, repeat'
              }}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            >
              {tables.map(table => (
                <div
                  key={table.id}
                  draggable={isEditMode}
                  onDragStart={(e) => handleTableDragStart(e, table.id)}
                  onMouseDown={(e) => handleTableMouseDown(e, table.id)}
                  onClick={() => {
                    if (isEditMode) {
                      handleTableSelectForMerge(table.id);
                    } else {
                      handleTableSelect(table.id);
                    }
                  }}
                  style={{
                    position: 'absolute',
                    left: table.x,
                    top: table.y,
                    width: `${table.width}px`,
                    height: `${table.height}px`,
                    cursor: isEditMode ? (isDragging && draggedTable === table.id ? 'grabbing' : 'grab') : 'pointer',
                    transition: isEditMode ? 'none' : 'transform 0.18s ease, opacity 0.18s ease',
                    opacity: isDragging && draggedTable === table.id ? 0.7 : 1,
                    transform: isDragging && draggedTable === table.id ? 'scale(1.08)' : 'scale(1)',
                    zIndex: isDragging && draggedTable === table.id ? 1000 : 1,
                    userSelect: 'none'
                  }}
                >
                  <img
                    src={getTableSprite(table)}
                    alt=""
                    draggable={false}
                    style={{
                      position: 'absolute',
                      inset: table.shape === 'rectangle' ? '-10px' : '-8px',
                      width: table.shape === 'rectangle' ? 'calc(100% + 20px)' : 'calc(100% + 16px)',
                      height: table.shape === 'rectangle' ? 'calc(100% + 20px)' : 'calc(100% + 16px)',
                      objectFit: 'contain',
                      pointerEvents: 'none',
                      filter: getTableImageFilter(table)
                    }}
                  />

                  <div style={{
                    position: 'absolute',
                    inset: 0,
                    width: 'auto',
                    height: 'auto',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'transparent',
                    overflow: 'visible',
                    pointerEvents: 'none'
                  }}>
                    <div style={{
                      position: 'absolute',
                      display: 'none',
                      top: 0,
                      left: 0,
                      right: 0,
                      height: '50%',
                      background: 'linear-gradient(to bottom, rgba(255,255,255,0.3) 0%, rgba(255,255,255,0) 100%)',
                      borderRadius: '18px 18px 0 0'
                    }} />

                    <div style={{
                      minWidth: '2.65rem',
                      maxWidth: 'calc(100% - 12px)',
                      padding: '0.2rem 0.48rem',
                      borderRadius: '999px',
                      backgroundColor: 'rgba(17, 24, 39, 0.76)',
                      border: '1px solid rgba(255, 255, 255, 0.82)',
                      fontSize: table.number.length > 5 ? '0.88rem' : '1rem',
                      fontWeight: 800,
                      color: 'white',
                      lineHeight: 1.15,
                      textAlign: 'center',
                      textShadow: '0 1px 2px rgba(0, 0, 0, 0.32)',
                      boxShadow: '0 6px 12px rgba(15, 23, 42, 0.18)',
                      zIndex: 2
                    }}>
                      {table.number}
                    </div>

                    {table.status === 'needs_cleaning' && (
                      <div style={{
                        position: 'absolute',
                        bottom: '4px',
                        right: '8px',
                        fontSize: '1.2rem',
                        zIndex: 2
                      }}>
                        🧹
                      </div>
                    )}
                  </div>

                  {isEditMode && table.number.includes('+') && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSplitTable(table.id);
                      }}
                      style={{
                        position: 'absolute',
                        top: '-35px',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        padding: '0.3rem 0.6rem',
                        backgroundColor: '#f59e0b',
                        color: 'white',
                        border: '2px solid white',
                        borderRadius: '0.375rem',
                        fontSize: '0.7rem',
                        fontWeight: '600',
                        cursor: 'pointer',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      ✂️ Separar
                    </button>
                  )}
                  {isEditMode && (
                    <div style={{
                      position: 'absolute',
                      bottom: '-40px',
                      left: '50%',
                      transform: 'translateX(-50%)',
                      display: 'flex',
                      gap: '0.4rem',
                      backgroundColor: 'white',
                      padding: '0.3rem',
                      borderRadius: '0.375rem',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
                    }}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingTable(table);
                          setNewTableName(table.number);
                          setShowAddTableModal(true);
                        }}
                        style={{
                          padding: '0.25rem 0.5rem',
                          backgroundColor: '#3b82f6',
                          color: 'white',
                          border: 'none',
                          borderRadius: '0.25rem',
                          fontSize: '0.7rem',
                          fontWeight: '600',
                          cursor: 'pointer'
                        }}
                      >
                        Editar
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteTable(table.id);
                        }}
                        style={{
                          padding: '0.25rem 0.5rem',
                          backgroundColor: '#ef4444',
                          color: 'white',
                          border: 'none',
                          borderRadius: '0.25rem',
                          fontSize: '0.7rem',
                          fontWeight: '600',
                          cursor: 'pointer'
                        }}
                      >
                        Eliminar
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {showHeldOrders && (
              <div style={{
                position: 'absolute',
                top: '60px',
                right: '20px',
                width: '350px',
                maxHeight: 'calc(100vh - 200px)',
                backgroundColor: 'white',
                borderRadius: '0.5rem',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                border: '2px solid #f59e0b',
                overflow: 'hidden',
                zIndex: 100,
                display: 'flex',
                flexDirection: 'column'
              }}>
                <div style={{
                  padding: '0.75rem',
                  backgroundColor: '#fef3c7',
                  borderBottom: '1px solid #f59e0b',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <h4 style={{ margin: 0, fontSize: '1rem', color: '#92400e' }}>⏸️ Pedidos retenidos</h4>
                  <button
                    onClick={() => setShowHeldOrders(false)}
                    style={{
                      padding: '0.25rem 0.5rem',
                      backgroundColor: '#f59e0b',
                      color: 'white',
                      border: 'none',
                      borderRadius: '0.25rem',
                      cursor: 'pointer',
                      fontSize: '0.8rem'
                    }}
                  >
                    ×
                  </button>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', padding: '0.75rem' }}>
                  {heldOrders.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '2rem', color: '#9ca3af' }}>
                      Sin pedidos retenidos
                    </div>
                  ) : (
                    heldOrders.map(heldOrder => (
                      <div
                        key={heldOrder.id}
                        style={{
                          backgroundColor: '#fffbeb',
                          border: '1px solid #fcd34d',
                          borderRadius: '0.375rem',
                          padding: '0.75rem',
                          marginBottom: '0.75rem'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                          <div style={{ fontWeight: 'bold', color: '#374151' }}>
                            Mesa {heldOrder.tableNumber}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                            {formatOrderTime(heldOrder.createdAt)}
                          </div>
                        </div>
                        <div style={{ fontSize: '0.8rem', color: '#6b7280', marginBottom: '0.5rem' }}>
                          {formatPosOrderType(heldOrder.orderType)}
                          {heldOrder.orderType === 'delivery' && heldOrder.deliveryType && (
                            <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem', color: heldOrder.deliveryType === 'outsourced' ? '#ef4444' : '#10b981' }}>
                              ({heldOrder.deliveryType === 'self' ? 'Propio' : 'Tercero'})
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '0.8rem', color: '#6b7280', marginBottom: '0.75rem' }}>
                          Productos: {heldOrder.items.length}
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button
                            onClick={() => handleRetrieveOrder(heldOrder)}
                            style={{
                              flex: 1,
                              padding: '0.5rem',
                              backgroundColor: '#10b981',
                              color: 'white',
                              border: 'none',
                              borderRadius: '0.25rem',
                              fontWeight: '600',
                              cursor: 'pointer',
                              fontSize: '0.8rem'
                            }}
                          >
                            ✅ Recuperar
                          </button>
                          <button
                            onClick={() => {
                              if (window.confirm(`¿Eliminar el pedido retenido de mesa ${heldOrder.tableNumber}?`)) {
                                setHeldOrders(heldOrders.filter(o => o.id !== heldOrder.id));
                              }
                            }}
                            style={{
                              padding: '0.5rem 0.75rem',
                              backgroundColor: '#ef4444',
                              color: 'white',
                              border: 'none',
                              borderRadius: '0.25rem',
                              fontWeight: '600',
                              cursor: 'pointer',
                              fontSize: '0.8rem'
                            }}
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Right: Order List */}
          <div style={{ ...posPanelStyle, width: '430px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '0.9rem 1rem', borderBottom: `1px solid ${colors.border}`, flexShrink: 0, backgroundColor: colors.surface }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '0.75rem' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: '800', color: colors.textPrimary, margin: 0 }}>Pedidos</h3>
                <button
                  onClick={() => setOrderTypeFilter('all')}
                  style={{
                    padding: '0.44rem 0.85rem',
                    backgroundColor: orderTypeFilter === 'all' ? '#2563eb' : '#f8fafc',
                    color: orderTypeFilter === 'all' ? 'white' : '#334155',
                    border: orderTypeFilter === 'all' ? '1px solid #2563eb' : '1px solid #cbd5e1',
                    borderRadius: '999px',
                    fontWeight: '800',
                    cursor: 'pointer',
                    fontSize: '0.75rem',
                    boxShadow: orderTypeFilter === 'all' ? '0 6px 14px rgba(37,99,235,0.22)' : 'none'
                  }}
                >
                  Todos
                </button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '0.45rem' }}>
                <button
                  onClick={() => setOrderTypeFilter('dine_in')}
                  style={{
                    flex: 1,
                    padding: '0.55rem 0.35rem',
                    backgroundColor: orderTypeFilter === 'dine_in' ? '#059669' : '#f8fafc',
                    color: orderTypeFilter === 'dine_in' ? 'white' : '#334155',
                    border: orderTypeFilter === 'dine_in' ? '1px solid #059669' : '1px solid #cbd5e1',
                    borderRadius: '0.5rem',
                    fontWeight: '700',
                    cursor: 'pointer',
                    fontSize: '0.75rem'
                  }}
                >
                  {formatPosOrderType('dine_in')}
                </button>
                <button
                  onClick={() => setOrderTypeFilter('takeout')}
                  style={{
                    flex: 1,
                    padding: '0.55rem 0.35rem',
                    backgroundColor: orderTypeFilter === 'takeout' ? '#d97706' : '#f8fafc',
                    color: orderTypeFilter === 'takeout' ? 'white' : '#334155',
                    border: orderTypeFilter === 'takeout' ? '1px solid #d97706' : '1px solid #cbd5e1',
                    borderRadius: '0.5rem',
                    fontWeight: '700',
                    cursor: 'pointer',
                    fontSize: '0.75rem'
                  }}
                >
                  {formatPosOrderType('takeout')}
                </button>
                <button
                  onClick={() => setOrderTypeFilter('delivery')}
                  style={{
                    flex: 1,
                    padding: '0.55rem 0.35rem',
                    backgroundColor: orderTypeFilter === 'delivery' ? '#7c3aed' : '#f8fafc',
                    color: orderTypeFilter === 'delivery' ? 'white' : '#334155',
                    border: orderTypeFilter === 'delivery' ? '1px solid #7c3aed' : '1px solid #cbd5e1',
                    borderRadius: '0.5rem',
                    fontWeight: '700',
                    cursor: 'pointer',
                    fontSize: '0.75rem'
                  }}
                >
                  {formatPosOrderType('delivery')}
                </button>
              </div>

              <div style={{ ...posMutedPanelStyle, marginTop: '0.85rem', padding: '0.85rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '0.85rem', color: '#6b7280' }}>Total pedidos:</span>
                  <span style={{ fontSize: '0.85rem', fontWeight: '600', color: '#374151' }}>{filteredOrders.length}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '0.85rem', color: '#6b7280' }}>Borrador:</span>
                  <span style={{ fontSize: '0.85rem', fontWeight: '600', color: '#f59e0b' }}>
                    {filteredOrders.filter(o => o.status === 'draft').length}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '0.85rem', color: '#6b7280' }}>En cocina:</span>
                  <span style={{ fontSize: '0.85rem', fontWeight: '600', color: '#3b82f6' }}>
                    {filteredOrders.filter(o => o.status === 'preparing' || o.status === 'confirmed').length}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '0.5rem', borderTop: '1px solid #e5e7eb' }}>
                  <span style={{ fontSize: '0.85rem', color: '#6b7280' }}>Total:</span>
                  <span style={{ fontSize: '1rem', fontWeight: 'bold', color: '#2563eb' }}>
                    C${filteredOrders.reduce((sum, o) => sum + getPosOrderSummaryAmount(o), 0).toFixed(2)}
                  </span>
                </div>
              </div>

              <button
                onClick={() => {
                  const newOrderType = orderTypeFilter === 'all' ? 'dine_in' : orderTypeFilter;
                  setOrderType(newOrderType as 'dine_in' | 'takeout' | 'delivery');
                  setCurrentItems([]);
                  setSelectedOrderId(null);
                  setSelectedTableId(null);
                  setServiceFeeEnabled(false);
                  setTaxEnabled(false);
                  setDeliveryFee(0);
                  setCashNIO('');
                  setCashUSD('');
                  setCardNIO('');
                  setCardUSD('');

                  // Takeout and delivery orders also need customer selection.
                  if (newOrderType !== 'dine_in') {
                    setShowCustomerModal(true);
                  } else {
                    setViewMode('order');
                  }
                }}
                style={{
                  width: '100%',
                  padding: '0.72rem',
                  backgroundColor: '#2563eb',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.6rem',
                  fontWeight: '800',
                  cursor: 'pointer',
                  fontSize: '0.92rem',
                  marginTop: '0.65rem',
                  boxShadow: '0 8px 18px rgba(37, 99, 235, 0.22)'
                }}
              >
                ➕ Nuevo {orderTypeFilter === 'all' ? 'pedido' : posOrderTypeLabels[orderTypeFilter]}
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '0.85rem', backgroundColor: colors.surfaceMuted }}>
              {filteredOrders.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: '#9ca3af' }}>
                  Sin pedidos
                </div>
              ) : (
                filteredOrders.map(order => (
                  <div
                    key={order.id}
                    onClick={() => handleOrderClick(order)}
                    style={{
                      backgroundColor: getStatusColor(order.status, order.paymentStatus, order.clearedAt),
                      border: pendingOrderSyncIdsRef.current.has(order.id) ? '2px solid #f59e0b' : '1px solid #e2e8f0',
                      borderRadius: '0.75rem',
                      padding: '0.85rem',
                      marginBottom: '0.85rem',
                      cursor: 'pointer',
                      transition: 'transform 0.16s ease, box-shadow 0.16s ease',
                      boxShadow: '0 6px 16px rgba(15, 23, 42, 0.08)'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                      <div style={{ fontSize: '0.95rem', fontWeight: 'bold', color: '#374151', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        #{order.orderNumber || 'N/A'}
                        {pendingOrderSyncIdsRef.current.has(order.id) && (
                          <span style={{ fontSize: '0.68rem', color: '#92400e', backgroundColor: '#fef3c7', border: '1px solid #fbbf24', borderRadius: '999px', padding: '0.12rem 0.42rem', fontWeight: '800' }}>Sincronizando</span>
                        )}
                        {order.paymentStatus === 'paid' && order.status !== 'completed' && (
                          <span style={{ fontSize: '1rem', color: '#10b981' }}>$</span>
                        )}
                        {order.paymentStatus === 'partial' && (
                          <span style={{ fontSize: '1rem', color: '#f59e0b' }}>$</span>
                        )}
                      </div>
                      <div style={{
                        padding: '0.25rem 0.5rem',
                        backgroundColor: 'white',
                        borderRadius: '999px',
                        fontSize: '0.75rem',
                        fontWeight: '600',
                        color: '#374151'
                      }}>
                        {getStatusText(order.status, order.paymentStatus, order.clearedAt)}
                      </div>
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#6b7280', marginBottom: '0.25rem' }}>
                      {order.orderType === 'dine_in' ? (
                        // Dine-in: show the table number.
                        <>Mesa {order.tableNumber}</>
                      ) : order.orderType === 'takeout' ? (
                        // Takeout shows only takeout status.
                        <>{formatPosOrderType('takeout')}</>
                      ) : (
                        <>{formatPosOrderType('delivery')}</>
                      )}
                    </div>
                    {finalizingOrderIds.has(order.id) && order.status !== 'completed' && (
                      <div style={{
                        padding: '0.45rem 0.6rem',
                        backgroundColor: '#eff6ff',
                        color: '#1d4ed8',
                        borderRadius: '0.55rem',
                        marginBottom: '0.45rem',
                        fontSize: '0.78rem',
                        fontWeight: 700
                      }}>
                        Completando...
                      </div>
                    )}
                    {order.customerName && (
                      <div style={{ fontSize: '0.8rem', color: '#3b82f6', marginBottom: '0.25rem', fontWeight: '600' }}>
                        👤 {order.customerName}
                      </div>
                    )}

                    {order.orderType !== 'dine_in' && order.status !== 'completed' && order.status !== 'cancelled' && (
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          const canComplete = order.paymentStatus === 'paid' || order.status === 'served';

                          if (!canComplete) {
                            alert('Primero complete el pago. Luego finalice el pedido para descontar inventario.');
                            handleOrderClick(order);
                            return;
                          }

                          if (window.confirm(`¿Confirmar ${order.orderType === 'takeout' ? 'retiro en barra' : 'delivery completado'}?\n\nAl confirmar se completa el pedido y se descuenta inventario.`)) {
                            setCompletingOrderIds(prev => {
                              const next = new Set(prev);
                              next.add(order.id);
                              return next;
                            });
                            markOrderFinalizing(order.id);
                            try {
                              await waitForNextPaint();
                              await completeOrderWithStockDeduction(order);
                              showPosToast('Pedido completado. Inventario descontado.', 'success');
                            } catch (error) {
                              console.error('complete order sync failed:', order.id, error);
                              showPosToast(getCompletionErrorMessage(error), 'error');
                            } finally {
                              setCompletingOrderIds(prev => {
                                const next = new Set(prev);
                                next.delete(order.id);
                                return next;
                              });
                              clearOrderFinalizing(order.id);
                            }
                          }
                        }}
                        disabled={completingOrderIds.has(order.id) || finalizingOrderIds.has(order.id)}
                        style={{
                          width: '100%',
                          padding: '0.68rem 0.75rem',
                          margin: '0.5rem 0 0.7rem 0',
                          backgroundColor: completingOrderIds.has(order.id) || finalizingOrderIds.has(order.id)
                            ? '#9ca3af'
                            : order.paymentStatus === 'paid' || order.status === 'served' ? '#16a34a' : '#f59e0b',
                          color: 'white',
                          border: 'none',
                          borderRadius: '0.6rem',
                          cursor: completingOrderIds.has(order.id) || finalizingOrderIds.has(order.id) ? 'not-allowed' : 'pointer',
                          fontSize: '0.9rem',
                          fontWeight: '700',
                          boxShadow: completingOrderIds.has(order.id) || finalizingOrderIds.has(order.id) ? 'none' : '0 8px 18px rgba(22, 163, 74, 0.22)'
                        }}
                      >
                        {finalizingOrderIds.has(order.id) ? 'Completando...' :
                          completingOrderIds.has(order.id) ? 'Procesando...' :
                          order.paymentStatus === 'paid' || order.status === 'served'
                          ? (order.orderType === 'takeout' ? '✅ Retirado en barra' : '✅ Delivery completado')
                          : '💳 Pagar antes de completar'}
                      </button>
                    )}

                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '0.3rem',
                      padding: '0.4rem 0',
                      marginBottom: '0.5rem',
                      fontSize: '0.85rem'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                        <span style={{ color: '#6b7280', fontSize: '0.75rem' }}>Pedido</span>
                        <span style={{
                          fontWeight: 'bold',
                          fontFamily: 'monospace',
                          fontSize: '0.9rem',
                          color: '#d97706'
                        }}>
                          {formatOrderTime(order.createdAt || order.preparingAt || order.updatedAt || order.lastModified)}
                        </span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                        <span style={{ color: '#6b7280', fontSize: '0.75rem' }}>Entrega</span>
                        <span style={{
                          fontWeight: 'bold',
                          fontFamily: 'monospace',
                          fontSize: '0.9rem',
                          color: order.servedAt ? '#059669' : '#d1d5db'
                        }}>
                          {formatOrderTime(order.servedAt)}
                        </span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                        <span style={{ color: '#6b7280', fontSize: '0.75rem' }}>
                          {order.status === 'cancelled' ? 'Cancelado' : 'Final'}
                        </span>
                        <span style={{
                          fontWeight: 'bold',
                          fontFamily: 'monospace',
                          fontSize: '0.9rem',
                          color: order.status === 'cancelled' && order.cancelledAt ? '#dc2626' : order.completedAt ? '#2563eb' : '#d1d5db'
                        }}>
                          {formatOrderTime(order.status === 'cancelled' ? order.cancelledAt : order.completedAt)}
                        </span>
                      </div>
                    </div>

                    {order.status === 'cancelled' && (Number(order.paidAmount || 0) > 0 || Number(order.totalAmount || 0) > 0) && (
                      <div style={{
                        padding: '0.4rem 0.6rem',
                        backgroundColor: '#fee2e2',
                        borderRadius: '0.25rem',
                        marginBottom: '0.5rem',
                        fontSize: '0.8rem',
                        color: '#991b1b'
                      }}>
                        Cancelado: cobrado C${Number(order.paidAmount || 0).toFixed(2)}
                        {Number(order.totalAmount || 0) > Number(order.paidAmount || 0) && (
                          <span style={{ fontWeight: '600', marginLeft: '0.5rem' }}>
                            {' '}/ anulado C${(Number(order.totalAmount || 0) - Number(order.paidAmount || 0)).toFixed(2)}
                          </span>
                        )}
                      </div>
                    )}

                    {order.status !== 'cancelled' && order.paymentStatus === 'partial' && order.paidAmount > 0 && (
                      <div style={{
                        padding: '0.4rem 0.6rem',
                        backgroundColor: '#fef3c7',
                        borderRadius: '0.25rem',
                        marginBottom: '0.5rem',
                        fontSize: '0.8rem'
                      }}>
                        Pagado: C${order.paidAmount.toFixed(2)} / C${order.totalAmount.toFixed(2)}
                        <span style={{ color: '#f59e0b', fontWeight: '600', marginLeft: '0.5rem' }}>
                          (falta C${(order.totalAmount - order.paidAmount).toFixed(2)})
                        </span>
                      </div>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontSize: '0.85rem', color: '#374151' }}>
                        {order.items?.length || 0} productos
                      </div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#2563eb' }}>
                        C${order.totalAmount?.toFixed(2) || '0.00'}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {showAddTableModal && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }}>
            <div style={{
              backgroundColor: 'white',
              borderRadius: '0.5rem',
              padding: '1.5rem',
              width: '400px'
            }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '1rem' }}>
                {editingTable ? 'Editar mesa' : 'Agregar mesa'}
              </h3>
              <input
                type="text"
                value={newTableName}
                onChange={(e) => setNewTableName(e.target.value)}
                placeholder="Nombre de mesa"
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.25rem',
                  fontSize: '0.9rem',
                  marginBottom: '1rem'
                }}
              />
              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => {
                    setShowAddTableModal(false);
                    setEditingTable(null);
                    setNewTableName('');
                  }}
                  style={{
                    padding: '0.5rem 1rem',
                    backgroundColor: '#f3f4f6',
                    color: '#374151',
                    border: 'none',
                    borderRadius: '0.25rem',
                    cursor: 'pointer'
                  }}
                >
                  Cerrar
                </button>
                <button
                  onClick={handleAddTable}
                  style={{
                    padding: '0.5rem 1rem',
                    backgroundColor: '#10b981',
                    color: 'white',
                    border: 'none',
                    borderRadius: '0.25rem',
                    cursor: 'pointer'
                  }}
                >
                  {editingTable ? 'Guardar' : 'Agregar'}
                </button>
              </div>
            </div>
          </div>
        )}

        {showTableActionModal && tableActionData && <TableActionModal />}

      </div>
      {showCancelModal && renderCancelModal()}

      {showCustomerModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '0.5rem',
            padding: '1.5rem',
            maxWidth: '600px',
            width: '90%',
            maxHeight: '80vh',
            overflowY: 'auto'
          }}>
            <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.25rem', fontWeight: 'bold' }}>
              👤 Seleccionar cliente
            </h3>

            {!showNewCustomerForm ? (
              <>
                <input
                  type="text"
                  placeholder="Buscar nombre o teléfono..."
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    marginBottom: '1rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.25rem',
                    fontSize: '0.9rem'
                  }}
                />

                <div style={{ maxHeight: '400px', overflowY: 'auto', marginBottom: '1rem' }}>
                  {customers
                    .filter(c =>
                      c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
                      c.phone.includes(customerSearch)
                    )
                    .map(customer => (
                      <div
                        key={customer.id}
                        onClick={() => handleSelectCustomer(customer)}
                        style={{
                          padding: '0.75rem',
                          marginBottom: '0.5rem',
                          border: '1px solid #e5e7eb',
                          borderRadius: '0.25rem',
                          cursor: 'pointer'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <div style={{ fontWeight: '600' }}>{customer.name}</div>
                            <div style={{ fontSize: '0.85rem', color: '#6b7280' }}>{customer.phone || 'Sin teléfono'}</div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '0.85rem', color: '#f59e0b' }}>⭐ {customer.points} puntos</div>
                            <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>{customer.visitCount} visitas</div>
                          </div>
                        </div>
                      </div>
                    ))}

                  {customers.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '2rem', color: '#9ca3af' }}>
                      Sin clientes. Cree uno nuevo.
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    onClick={() => setShowNewCustomerForm(true)}
                    style={{
                      flex: 1,
                      padding: '0.75rem',
                      backgroundColor: '#10b981',
                      color: 'white',
                      border: 'none',
                      borderRadius: '0.25rem',
                      fontWeight: '600',
                      cursor: 'pointer'
                    }}
                  >
                    ➕ Nuevo cliente
                  </button>
                  <button
                    onClick={handleSkipCustomer}
                    style={{
                      flex: 1,
                      padding: '0.75rem',
                      backgroundColor: '#6b7280',
                      color: 'white',
                      border: 'none',
                      borderRadius: '0.25rem',
                      fontWeight: '600',
                      cursor: 'pointer'
                    }}
                  >
                    ⏭️ Omitir
                  </button>
                </div>
              </>
            ) : (
              <>
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>Nombre *</label>
                  <input
                    type="text"
                    value={newCustomerName}
                    onChange={(e) => setNewCustomerName(e.target.value)}
                    placeholder="Ingrese nombre del cliente"
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '0.25rem',
                      fontSize: '0.9rem',
                      marginBottom: '1rem'
                    }}
                  />

                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>Teléfono</label>
                  <input
                    type="tel"
                    value={newCustomerPhone}
                    onChange={(e) => setNewCustomerPhone(e.target.value)}
                    placeholder="Ingrese teléfono (opcional)"
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '0.25rem',
                      fontSize: '0.9rem'
                    }}
                  />
                </div>

                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    onClick={handleCreateCustomer}
                    style={{
                      flex: 1,
                      padding: '0.75rem',
                      backgroundColor: '#10b981',
                      color: 'white',
                      border: 'none',
                      borderRadius: '0.25rem',
                      fontWeight: '600',
                      cursor: 'pointer'
                    }}
                  >
                    ✅ Crear
                  </button>
                  <button
                    onClick={() => {
                      setShowNewCustomerForm(false);
                      setNewCustomerName('');
                      setNewCustomerPhone('');
                    }}
                    style={{
                      flex: 1,
                      padding: '0.75rem',
                      backgroundColor: '#6b7280',
                      color: 'white',
                      border: 'none',
                      borderRadius: '0.25rem',
                      fontWeight: '600',
                      cursor: 'pointer'
                    }}
                  >
                    ↩️ Volver
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default POS;
