import React, { useState, useEffect, useRef } from 'react';
import MenuSelection from '../../components/MenuSelection';
import SplitBillModal from '../../components/SplitBillModal';
import { useAppContext } from '../../contexts/AppContext';
import { dataService } from '../../services/DataService';
import { amountToPoints, getUSDToNioRate, getPointsExchangeRate, getLocalDateTimeString } from '../../utils/exchangeRate';
import { formatNicaraguaDateTime, formatNicaraguaTime, getLocalDateString, toTimestampMillis } from '../../utils/localTime';
import { dataManager } from '../../services/dataManager';
import { smartSetDocument, smartUpdateDocument, smartDeleteDocument, smartSubscribeToCollection } from '../../services/smartSyncService';

interface Table {
  id: string;
  number: string;
  x: number;
  y: number;
  width: number;
  height: number;
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
    capacity: number;
    status: 'available' | 'occupied' | 'reserved' | 'needs_cleaning';
    currentOrderId?: string;
  }>;
  lastModified?: number; // 馃敟 鏈€鍚庝慨鏀规椂闂存埑锛堟绉掞級锛岀敤浜庡璁惧鍚屾鐗堟湰鎺у埗
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

// 椤惧淇℃伅
interface Customer {
  id: string;
  name: string;
  phone: string;
  points: number; // 绉垎
  totalSpent: number; // 鎬绘秷璐?
  visitCount: number; // 娑堣垂娆℃暟
  createdAt: string;  // 馃攧 涓?DataManager 淇濇寔涓€鑷达紝浣跨敤 ISO 瀛楃涓?
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
  orderNumber?: string; // 璁㈠崟鍙凤紙鏍煎紡锛歁MDD + 搴忓彿锛?
  tableId: string;
  tableNumber: string;
  orderType: 'dine_in' | 'takeout' | 'delivery';
  deliveryType?: 'self' | 'outsourced'; // 娲鹃€佺被鍨嬶細鑷€?澶栨淳
  deliveryFee?: number; // 娲鹃€佽垂
  customerId?: string; // 鍏宠仈椤惧ID
  customerName?: string; // 椤惧濮撳悕锛堝啑浣欏瓧娈碉紝鏂逛究鏄剧ず锛?
  items: OrderItem[];
  status: 'draft' | 'confirmed' | 'preparing' | 'served' | 'completed' | 'cancelled';

  // 鉁?鏃堕棿杩借釜瀛楁
  createdAt: Date;           // 涓嬪崟鏃堕棿
  preparingAt?: Date;        // 寮€濮嬪埗浣滄椂闂达紙纭涓嬪崟鏃惰褰曪級
  servedAt?: Date;           // 浜や粯鏃堕棿锛堜笂鑿?鎵撳寘瀹屾垚锛?
  completedAt?: Date;        // 瀹屾垚鏃堕棿锛堟敮浠樺畬鎴愶級
  clearedAt?: Date;          // 娓呭彴鏃堕棿锛堝彲閫夛級

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
  cardAmount?: number; // 鍒峰崱鏀粯閲戦
  stockDeducted?: boolean;
  stockDeductedAt?: Date;
  stockDeductedItems?: Record<string, number>;
  stockDeductionOperationId?: string;
  pointsProcessed?: boolean;
  pointsProcessedAt?: Date;
  pointsEarned?: number;
  pointsUsed?: number;
  pointsDiscount?: number;
  lastModified?: number; // 馃敟 鏈€鍚庝慨鏀规椂闂存埑锛堟绉掞級锛岀敤浜庡璁惧鍚屾鐗堟湰鎺у埗
}

interface HeldOrder {
  id: string;
  orderId?: string; // 鍏宠仈鐨勮鍗旾D
  tableId: string;
  tableNumber: string;
  items: OrderItem[];
  orderType: 'dine_in' | 'takeout' | 'delivery';
  deliveryType?: 'self' | 'outsourced'; // 娲鹃€佺被鍨嬶細鑷€?澶栨淳
  createdAt: Date;
  serviceFeeEnabled: boolean;
  taxEnabled: boolean;
  deliveryFee: number;
}

const normalizeDateForSignature = (value: any): number | string | null => {
  if (!value) return null;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'object' && typeof value.seconds === 'number') {
    return value.seconds * 1000 + Math.floor((value.nanoseconds || 0) / 1000000);
  }

  const time = new Date(value).getTime();
  return Number.isNaN(time) ? String(value) : time;
};

const getOrdersSignature = (orders: Array<Partial<Order>> = []): string => {
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

const getOrderSignature = (order: Partial<Order>): string => getOrdersSignature([order]);

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

const serializeOrderForFirestore = (order: Order): any => {
  const orderAny = order as any;
  return stripUndefinedValues({
    ...order,
    createdAt: order.createdAt instanceof Date ? order.createdAt.toISOString() : order.createdAt,
    updatedAt: orderAny.updatedAt instanceof Date ? orderAny.updatedAt.toISOString() : orderAny.updatedAt,
    preparingAt: order.preparingAt instanceof Date ? order.preparingAt.toISOString() : order.preparingAt,
    servedAt: order.servedAt instanceof Date ? order.servedAt.toISOString() : order.servedAt,
    completedAt: order.completedAt instanceof Date ? order.completedAt.toISOString() : order.completedAt,
    cancelledAt: order.cancelledAt instanceof Date ? order.cancelledAt.toISOString() : order.cancelledAt,
    clearedAt: order.clearedAt instanceof Date ? order.clearedAt.toISOString() : order.clearedAt,
    lastPaidAt: order.lastPaidAt instanceof Date ? order.lastPaidAt.toISOString() : order.lastPaidAt,
    stockDeductedAt: order.stockDeductedAt instanceof Date ? order.stockDeductedAt.toISOString() : order.stockDeductedAt,
    pointsProcessedAt: order.pointsProcessedAt instanceof Date ? order.pointsProcessedAt.toISOString() : order.pointsProcessedAt,
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
    console.error('淇濆瓨寰呭悓姝ヨ鍗曢槦鍒楀け璐?', error);
  }
};

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
        status: table.status,
        capacity: table.capacity,
        currentOrderId: table.currentOrderId || null,
        mergedFromTables: table.mergedFromTables || null,
        lastModified: table.lastModified || null
      }))
      .sort((a, b) => String(a.id).localeCompare(String(b.id)))
  );
};

const getTableVersion = (table: Partial<Table>): number => {
  const version = Number(table.lastModified || 0);
  return Number.isFinite(version) ? version : 0;
};

const getTableDedupeKey = (table: Partial<Table>): string => {
  const number = String(table.number || '').trim();
  return number ? `number:${number}` : `id:${table.id}`;
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

    const normalizedTable: Table = {
      ...table,
      width: table.width || 110,
      height: table.height || 90,
      status: table.status || 'available',
      capacity: table.capacity || 4,
      number: String(table.number || '').trim() || String(table.id),
      lastModified: getTableVersion(table) || Date.now()
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

const getOrderVersion = (order: Partial<Order>): number => {
  const version = Number(order.lastModified || 0);
  return Number.isFinite(version) ? version : 0;
};

const getPaymentRank = (paymentStatus?: string): number => {
  switch (paymentStatus) {
    case 'paid': return 3;
    case 'partial': return 2;
    case 'refunded': return 1;
    case 'unpaid':
    default: return 0;
  }
};

const getOrderStatusRank = (status?: string): number => {
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

const isTerminalOrderStatus = (status?: string): boolean => {
  return status === 'completed' || status === 'cancelled';
};

const isCloudTerminalAdvance = (localOrder: Partial<Order>, incomingOrder: Partial<Order>): boolean => {
  return isTerminalOrderStatus(incomingOrder.status) && !isTerminalOrderStatus(localOrder.status);
};

const isOrderStateRegression = (localOrder: Partial<Order>, incomingOrder: Partial<Order>): boolean => {
  if (localOrder.stockDeducted && !incomingOrder.stockDeducted) return true;
  if (localOrder.clearedAt && !incomingOrder.clearedAt) return true;

  const localStatusRank = getOrderStatusRank(localOrder.status);
  const incomingStatusRank = getOrderStatusRank(incomingOrder.status);
  if (localStatusRank > incomingStatusRank && ['completed', 'cancelled'].includes(String(localOrder.status))) {
    return true;
  }

  return getPaymentRank(localOrder.paymentStatus) > getPaymentRank(incomingOrder.paymentStatus);
};

const toDisplayDate = (value: any): Date | null => {
  const timestamp = toTimestampMillis(value);
  return timestamp ? new Date(timestamp) : null;
};

const formatOrderTime = (value: any): string => {
  return formatNicaraguaTime(value);
};

const isPaidAwaitingClear = (order: Partial<Order>): boolean => {
  return order.paymentStatus === 'paid' &&
    order.status !== 'completed' &&
    order.status !== 'cancelled' &&
    !order.clearedAt;
};

const isUnpaidActiveOrder = (order: Partial<Order>): boolean => {
  return isEditableActiveOrder(order) &&
    order.paymentStatus !== 'paid';
};

const isEditableActiveOrder = (order?: Partial<Order> | null): boolean => {
  return !!order &&
    order.status !== 'completed' &&
    order.status !== 'cancelled' &&
    order.status !== 'draft';
};

const hasNewerCloudOrders = (cloudOrders: Order[], localOrders: Order[]): boolean => {
  const localById = new Map(localOrders.map(order => [order.id, order]));

  return cloudOrders.some(cloudOrder => {
    const localOrder = localById.get(cloudOrder.id);
    if (!localOrder) return true;
    if (isCloudTerminalAdvance(localOrder, cloudOrder)) return true;
    if (isOrderStateRegression(localOrder, cloudOrder)) return false;
    return getOrderVersion(cloudOrder) > getOrderVersion(localOrder);
  });
};

const mergeOrdersByVersion = (localOrders: Order[], incomingOrders: Order[]): Order[] => {
  const merged = new Map<string, Order>();

  localOrders.forEach(order => {
    if (order.id) merged.set(order.id, order);
  });

  incomingOrders.forEach(incomingOrder => {
    if (!incomingOrder.id) return;
    const localOrder = merged.get(incomingOrder.id);
    if (!localOrder || isCloudTerminalAdvance(localOrder, incomingOrder) || (!isOrderStateRegression(localOrder, incomingOrder) && getOrderVersion(incomingOrder) >= getOrderVersion(localOrder))) {
      merged.set(incomingOrder.id, incomingOrder);
    }
  });

  return Array.from(merged.values());
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
      await smartUpdateDocument('pos_orders', order.id, serializeOrderForFirestore(order));
      publishedOrderSignaturesRef.current.set(order.id, getOrderSignature(order));
      pendingOrderSyncIdsRef.current.delete(order.id);
      savePendingOrderSyncIds(pendingOrderSyncIdsRef.current);
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

          // 鉁?濡傛灉鏁版嵁涓嶅湪鏍囧噯 key 涓紝鑷姩杩佺Щ
          if (storeKey && k !== storeKey) {
            localStorage.setItem(storeKey, stored);
            console.log(`鉁?宸茶嚜鍔ㄤ粠 ${k} 杩佺Щ鍒?${storeKey}`);
          }

          if (Array.isArray(parsed)) {
            return parsed.map(item => ({
              ...item,
              // 鉁?鍙湁褰撳瓧娈靛瓨鍦ㄦ椂鎵嶈浆鎹紝涓嶈璁剧疆榛樿鍊?
              createdAt: item.createdAt ? new Date(item.createdAt) : undefined,
              confirmedAt: item.confirmedAt ? new Date(item.confirmedAt) : undefined,
              completedAt: item.completedAt ? new Date(item.completedAt) : undefined,
              cancelledAt: item.cancelledAt ? new Date(item.cancelledAt) : undefined,
              clearedAt: item.clearedAt ? new Date(item.clearedAt) : undefined,
              preparingAt: item.preparingAt ? new Date(item.preparingAt) : undefined,
              servedAt: item.servedAt ? new Date(item.servedAt) : undefined,
              lastPaidAt: item.lastPaidAt ? new Date(item.lastPaidAt) : undefined,
              // 馃敟 濡傛灉娌℃湁 lastModified锛屾牴鎹?createdAt 鐢熸垚
              lastModified: item.lastModified || (item.createdAt ? new Date(item.createdAt).getTime() : Date.now()),
            })) as unknown as T;
          }
          return parsed;
        }
      }
    } catch (error) {
      console.error('鍔犺浇鏁版嵁澶辫触:', error);
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
      console.error('淇濆瓨鏁版嵁澶辫触:', error);
    }
  };

  // 鐢熸垚鍞竴璁㈠崟ID锛堥伩鍏嶉噸澶嶏級
  const generateOrderId = () => {
    return `order-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  };

  const [viewMode, setViewMode] = useState<'overview' | 'order' | 'split-bill'>('overview');
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  const [serviceFeeEnabled, setServiceFeeEnabled] = useState(false);
  const [taxEnabled, setTaxEnabled] = useState(false);
  const [deliveryFee, setDeliveryFee] = useState(0);
  const [deliveryType, setDeliveryType] = useState<'self' | 'outsourced'>('self'); // 娲鹃€佺被鍨嬶細鑷€?澶栨淳

  // 鎶樻墸鍔熻兘
  const [discountEnabled, setDiscountEnabled] = useState(false);
  const [discountType, setDiscountType] = useState<'percentage' | 'fixed'>('percentage'); // percentage: 鐧惧垎姣? fixed: 鍥哄畾閲戦
  const [discountValue, setDiscountValue] = useState<number>(0); // 鎶樻墸鍊硷紙鐧惧垎姣旀垨閲戦锛?
  const [discountReason, setDiscountReason] = useState(''); // 鎶樻墸鍘熷洜

  // 绉垎鍏戞崲
  const [pointsRedemptionEnabled, setPointsRedemptionEnabled] = useState(false);
  const [pointsToUse, setPointsToUse] = useState<number>(0); // 浣跨敤鐨勭Н鍒?
  // 浣跨敤鍏ㄥ眬绉垎鍏戞崲鐜?
  const pointsExchangeRate = getPointsExchangeRate();
  const [orderType, setOrderType] = useState<'dine_in' | 'takeout' | 'delivery'>('dine_in');

  // 浣跨敤鍏ㄥ眬姹囩巼
  const exchangeRate = getUSDToNioRate();

  const [cashNIO, setCashNIO] = useState('');
  const [cashUSD, setCashUSD] = useState('');
  const [cardNIO, setCardNIO] = useState('');
  const [cardUSD, setCardUSD] = useState('');

  // 馃毇 闃叉閲嶅鏀粯
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);

  // 鉁?璁板綍宸叉墸鍑忓簱瀛樼殑璁㈠崟ID锛堥槻姝㈤噸澶嶆墸鍑忥級
  const [deductedOrderIds, setDeductedOrderIds] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem(getScopedStorageKey('pos_deducted_orders'));
      if (saved) {
        return new Set(JSON.parse(saved));
      }
    } catch (error) {
      console.error('鍔犺浇宸叉墸搴撳瓨璁㈠崟澶辫触:', error);
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
    // 鉁?灏濊瘯澶氫釜鍙兘鐨?key锛岀‘淇濇暟鎹笉涓㈠け
    const saved = loadFromStorage<Order[]>('pos_orders', [], [
      'pos_orders',
      'restaurant_pos_orders',
      'orders'
    ]);
    console.log('初始化加载订单:', saved.length);

    const seenIds = new Set();
    const fixedOrders = saved.filter(order => {
      // 绉婚櫎閲嶅ID
      if (seenIds.has(order.id)) {
        console.warn(`馃棏锔?鍔犺浇鏃剁Щ闄ら噸澶嶈鍗? ${order.id}`);
        return false;
      }
      seenIds.add(order.id);

      // 保留所有订单，避免桌台布局变动导致当前订单列表消失。

      // 淇 createdAt 涓?null 鐨勯棶棰?
      if (!order.createdAt) {
        (order as any).createdAt = order.preparingAt || getLocalDateTimeString();
        console.log(`馃敡 淇璁㈠崟 ${order.id} 鐨?createdAt`);
      }

      // 淇缂哄け鐨勬椂闂村瓧娈?
      if (order.status === 'served' && !order.servedAt) {
        (order as any).servedAt = order.createdAt || getLocalDateTimeString();
        console.log(`馃敡 淇璁㈠崟 ${order.id} 鐨?servedAt`);
      }

      if (order.status === 'completed' && !order.completedAt) {
        (order as any).completedAt = order.servedAt || order.createdAt || getLocalDateTimeString();
        console.log(`馃敡 淇璁㈠崟 ${order.id} 鐨?completedAt`);
      }

      if (order.status === 'completed' && !order.servedAt) {
        (order as any).servedAt = order.createdAt || getLocalDateTimeString();
        console.log('fixed completed order servedAt:', order.id);
      }

      return true;
    });

    console.log('loaded orders:', fixedOrders.length);
    return fixedOrders;
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



  // 馃攧 椤惧绠＄悊 - 浣跨敤 DataManager 瀹炵幇鏁版嵁浜掗€?
  const markTableUserEdit = () => {
    tableUserEditPendingRef.current = true;
  };

  const [customers, setCustomers] = useState<Customer[]>(() => {
    return dataManager.getData('customers');
  });

  // 馃攧 瀹炴椂鐩戝惉瀹㈡埛鏁版嵁鍙樺寲
  useEffect(() => {
    const unsubscribe = dataManager.subscribe('customers', (newCustomers) => {
      console.log('POS customers updated:', newCustomers.length);
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

  const [heldOrders, setHeldOrders] = useState<HeldOrder[]>(() => {
    return loadFromStorage<HeldOrder[]>('pos_held_orders', [], [
      'pos_held_orders',
      'held_orders'
    ]);
  });
  const [showHeldOrders, setShowHeldOrders] = useState(false);

  const [showTableActionModal, setShowTableActionModal] = useState(false);
  const [tableActionData, setTableActionData] = useState<{ tableId: string; tableNumber: string; orderId: string } | null>(null);

  // 馃敟 缁勪欢鍔犺浇鏃讹紝浠?Firestore 鍚屾 POS 鏁版嵁
  useEffect(() => {
    const syncPOSData = async () => {
      console.log('start syncing POS data');

      try {
        // 鍚屾妗屽彴鐘舵€?
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
          console.log('synced tables', normalized.tables.length, 'removed duplicates', normalized.duplicates.length);
        }

        const ordersData = dataService.getData('pos_orders');
        if (ordersData.length > 0) {
          setOrders(prevOrders => mergeOrdersByVersion(prevOrders, ordersData as Order[]));
          console.log('synced POS orders', ordersData.length);
        }

        // 鍚屾鎸傚崟
        const heldOrdersData = dataService.getData('pos_held_orders');
        if (heldOrdersData.length > 0) {
          setHeldOrders(heldOrdersData);
          console.log('synced held orders', heldOrdersData.length);
        }

        // 鍚屾鍙栨秷璁板綍
        const cancelRecordsData = dataService.getData('pos_cancel_records');
        if (cancelRecordsData.length > 0) {
          setCancelRecords(cancelRecordsData);
          console.log('synced cancel records', cancelRecordsData.length);
        }
      } catch (error) {
        console.error('鉂?鍚屾 POS 鏁版嵁澶辫触:', error);
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
          console.error('鍒犻櫎閲嶅妗屽彴澶辫触:', table.id, error);
        });
      });

      const cloudTablesSignature = getTablesSignature(normalized.tables);
      saveToStorage('pos_tables', normalized.tables);
      tableCloudHydratedRef.current = true;
      if (cloudTablesSignature === localTablesSignatureRef.current) {
        return;
      }

      console.log('received POS table update:', normalized.tables.length, 'duplicates:', normalized.duplicates.length);
      localTablesSignatureRef.current = cloudTablesSignature;
      publishedTablesSignatureRef.current = cloudTablesSignature;
      setTables(normalized.tables);
    });

    return () => unsubscribe();
  }, []);


  // 馃敟 鑷姩鏇存柊妗屽彴鐘舵€侊紙鏍规嵁璁㈠崟鐘舵€侊級
  // 根据订单状态自动更新桌台状态。
  useEffect(() => {
    setTables(prevTables => {
      let hasChanges = false;
      const nextTables = prevTables.map(table => {
      const paidOrder = orders.find(o =>
        o.tableId === table.id &&
        o.paymentStatus === 'paid' && o.status !== 'completed' && o.status !== 'cancelled' &&
        !o.clearedAt  // 娌℃湁娓呭彴鏍囪
      );

      // 鏌ユ壘璇ユ鍙版槸鍚︽湁鏈敮浠樼殑璁㈠崟锛坉raft/confirmed/preparing/served锛?
      const unpaidOrder = orders.find(o =>
        o.tableId === table.id &&
        isUnpaidActiveOrder(o)
      );

      let newStatus: 'available' | 'occupied' | 'reserved' | 'needs_cleaning' = table.status;

      if (paidOrder) {
        // 鉁?鏈夊凡鏀粯浣嗘湭娓呭彴鐨勮鍗曪紝妗屽彴搴旇鏄?needs_cleaning锛堢孩鑹诧紝鏄剧ず鎵妸锛?
        newStatus = 'needs_cleaning';
      } else if (unpaidOrder) {
        // 鉁?鏈夋湭鏀粯璁㈠崟锛屾鍙板簲璇ユ槸 occupied锛堟鑹诧紝姝ｅ湪鐢ㄩ锛?
        newStatus = 'occupied';
      } else {
        // 娌℃湁浠讳綍璁㈠崟鎴栧凡娓呭彴锛屾鍙板簲璇ユ槸 available锛堢豢鑹诧級
        if (table.status === 'occupied' || table.status === 'needs_cleaning') {
          newStatus = 'available';
        }
      }

      const nextCurrentOrderId = newStatus === 'available' ? undefined : table.currentOrderId;

      if (newStatus !== table.status || nextCurrentOrderId !== table.currentOrderId) {
        hasChanges = true;
        return {
          ...table,
          status: newStatus,
          currentOrderId: newStatus === 'available' ? undefined : table.currentOrderId,
          lastModified: Date.now() // 娣诲姞鏃堕棿鎴?
        };
      }
      return table;
      });
      return hasChanges ? nextTables : prevTables;
    });
  }, [orders]);

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
          console.error('鍒犻櫎閲嶅妗屽彴澶辫触:', table.id, error);
        });
      });
      setTables(normalized.tables);
      return;
    }

    saveToStorage('pos_tables', tables);
    const tablesSignature = getTablesSignature(tables);
    localTablesSignatureRef.current = tablesSignature;

    if (!tablePublisherReadyRef.current) {
      tablePublisherReadyRef.current = true;
      publishedTablesSignatureRef.current = tablesSignature;
      return;
    }

    if (!tableUserEditPendingRef.current) {
      return;
    }

    if (tables.length === 0 || tablesSignature === publishedTablesSignatureRef.current) {
      tableUserEditPendingRef.current = false;
      return;
    }

    publishedTablesSignatureRef.current = tablesSignature;
    tableUserEditPendingRef.current = false;
    tables.forEach(table => {
      smartUpdateDocument('pos_tables', table.id, table).catch(error => {
        console.error('鍚屾妗屽彴鍒?Firestore 澶辫触:', table.id, error);
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

      saveToStorage('pos_orders', uniqueOrders);
      const uniqueOrdersSignature = getOrdersSignature(uniqueOrders);
      localOrdersSignatureRef.current = uniqueOrdersSignature;
      console.log('POS orders saved locally:', uniqueOrders.length);

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
        const orderSignature = getOrderSignature(order);
        return pendingIds.has(order.id) || publishedSignatures.get(order.id) !== orderSignature;
      });

      if (ordersToPublish.length > 0) {
        console.log('POS incremental order sync:', ordersToPublish.length, '/', uniqueOrders.length);
      }

      ordersToPublish.forEach(order => {
        const orderSignature = getOrderSignature(order);
        const orderData = serializeOrderForFirestore(order);

        smartUpdateDocument('pos_orders', order.id, orderData)
          .then(() => {
            publishedSignatures.set(order.id, orderSignature);
            if (pendingIds.delete(order.id)) {
              savePendingOrderSyncIds(pendingIds);
            }
          })
          .catch(error => {
            pendingIds.add(order.id);
            savePendingOrderSyncIds(pendingIds);
            console.error('鍚屾 POS 璁㈠崟鍒?Firestore 澶辫触:', order.id, error);
          });
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
            console.error('鍚屾 POS 璁㈠崟鍒?Firestore 澶辫触:', order.id, error);
          });
        });
      }

      dataManager.saveData('orders', uniqueOrders, { syncFirestore: false });
    } catch (error) {
      console.error('淇濆瓨璁㈠崟澶辫触:', error);
    }
  }, [orders, setAppOrders]);

  React.useEffect(() => {
    if (!appOrders || appOrders.length === 0) return;
    const incomingOrders = appOrders as Order[];
    setOrders(prevOrders => {
      if (!hasNewerCloudOrders(incomingOrders, prevOrders)) {
        return prevOrders;
      }

      const mergedOrders = mergeOrdersByVersion(prevOrders, incomingOrders);
      const mergedOrdersSignature = getOrdersSignature(mergedOrders);
      if (mergedOrdersSignature === localOrdersSignatureRef.current) return prevOrders;
      if (mergedOrdersSignature === getOrdersSignature(prevOrders)) return prevOrders;

      console.log('POS received global order update:', appOrders.length);
      localOrdersSignatureRef.current = mergedOrdersSignature;
      publishedOrdersSignatureRef.current = mergedOrdersSignature;
      mergedOrders.forEach(order => {
        publishedOrderSignaturesRef.current.set(order.id, getOrderSignature(order));
        pendingOrderSyncIdsRef.current.delete(order.id);
      });
      savePendingOrderSyncIds(pendingOrderSyncIdsRef.current);
      return mergedOrders;
    });
    // 鍙湪鍏ㄥ眬璁㈠崟娴佸彉鍖栨椂鎺ユ敹锛岄伩鍏嶆湰鏈哄垰淇敼璁㈠崟鏃惰鏃х殑鍏ㄥ眬鐘舵€佽鐩栥€?    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appOrders]);

  useEffect(() => {
    if (orders.length > 0) return;

    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      const storedOrders = loadFromStorage<Order[]>('pos_orders', []);
      if (storedOrders.length > 0) {
        console.log('POS loaded orders from cache:', storedOrders.length);
        setOrders(prevOrders => prevOrders.length > 0 ? prevOrders : storedOrders);
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

    console.log('馃攳 鐐瑰嚮妗屽彴:', { tableId, tableNumber: table.number, status: table.status });

    // 鉁?濡傛灉妗屽彴鏄?needs_cleaning 鐘舵€侊紙绾㈣壊/宸叉敮浠樹絾鏈竻鍙帮級锛屽脊鍑哄姞鑿?娓呭彴閫夋嫨
    if (table.status === 'needs_cleaning') {
      // 馃敟 鍚屾椂鍖归厤姝ｅ父 tableId 鍜?split-merged 寮€澶寸殑 tableId
      const paidOrder = orders.find(o => {
        const matchesTableId = o.tableId === tableId ||
                              (o.tableId && o.tableId.startsWith('split-merged') && tableId && tableId.startsWith('split-merged'));
        return matchesTableId && isPaidAwaitingClear(o);
      });
      console.log('paid order awaiting clear:', paidOrder ? { id: paidOrder.id, clearedAt: paidOrder.clearedAt, tableId: paidOrder.tableId } : 'not found');

      if (paidOrder) {
        setTableActionData({
          tableId: tableId,
          tableNumber: table.number,
          orderId: paidOrder.id
        });
        setShowTableActionModal(true);
        console.log('鉁?鏄剧ず鍔犺彍/娓呭彴寮圭獥');
        return;
      } else {
        console.error('table is needs_cleaning but matching order was not found');
        console.log('馃搵 璇ユ鍙扮殑璁㈠崟:', orders.filter(o => o.tableId === tableId || (o.tableId && o.tableId.startsWith('split-merged') && tableId && tableId.startsWith('split-merged'))).map(o => ({ id: o.id, status: o.status, clearedAt: o.clearedAt, tableId: o.tableId })));
      }
    }

    const existingOrder = orders.find(o =>
      o.tableId === tableId &&
      o.status !== 'completed' &&
      o.status !== 'cancelled' &&
      o.status !== 'draft'  // 鈫?鎺掗櫎鑽夌璁㈠崟
    );

    console.log('馃攳 鏌ユ壘妗屽彴璁㈠崟:', {
      tableId,
      tableNumber: table.number,
      existingOrder: existingOrder ? {
        id: existingOrder.id,
        status: existingOrder.status,
        paymentStatus: existingOrder.paymentStatus
      } : null
    });

    // 妫€鏌ユ槸鍚︽湁宸插畬鎴愪絾鏈竻鍙扮殑璁㈠崟锛堢敤浜庡姞鑿?娓呭彴閫夋嫨锛?
    const paidButNotClearedOrder = orders.find(o =>
      o.tableId === tableId &&
      isPaidAwaitingClear(o) &&
      !o.clearedAt  // 娌℃湁娓呭彴鏍囪
    );

    // 濡傛灉鏈夊凡鏀粯浣嗘湭娓呭彴鐨勮鍗曪紝寮瑰嚭鍔犺彍/娓呭彴閫夋嫨
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
      // 濡傛灉璁㈠崟宸叉湁椤惧锛岃嚜鍔ㄩ€夋嫨
      if (existingOrder.customerId) {
        const customer = customers.find(c => c.id === existingOrder.customerId);
        if (customer) {
          setSelectedCustomer(customer);
        }
      }
      // 宸叉湁璁㈠崟锛岀洿鎺ヨ烦杞?
      setServiceFeeEnabled(false);
      setTaxEnabled(false);
      setDeliveryFee(0);
      setCashNIO('');
      setCashUSD('');
      setCardNIO('');
      setCardUSD('');
      setViewMode('order');
    } else {
      // 鏂拌鍗曪紝鍏堝脊鍑洪【瀹㈤€夋嫨妗?

      // 鈿狅笍 涓嶅啀鑷姩鍒涘缓鑽夌璁㈠崟锛岀瓑鐢ㄦ埛鍙戦€佸帹鎴挎垨鏀粯鏃跺啀鍒涘缓
      // 杩欐牱鍙互閬垮厤浜х敓澶氫綑鐨勮崏绋胯鍗?

      setCurrentItems([]);
      setSelectedOrderId(null);
      setServiceFeeEnabled(false);
      setTaxEnabled(false);
      setDeliveryFee(0);
      setCashNIO('');
      setCashUSD('');
      setCardNIO('');
      setCardUSD('');
      console.log('selected customer, switching to order view');
      setShowCustomerModal(true);
    }
  };

  // 椤惧绠＄悊鍑芥暟
  const handleSelectCustomer = (customer: Customer) => {
    setSelectedCustomer(customer);
    setShowCustomerModal(false);
    // 閫夋嫨椤惧鍚庯紝璺宠浆鍒扮偣椁愮晫闈?
    setViewMode('order');
  };

  const handleCreateCustomer = async () => {
    if (!newCustomerName.trim()) {
      alert('请输入顾客姓名');
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

    // 馃攧 浣跨敤 DataManager 娣诲姞瀹㈡埛锛岃嚜鍔ㄥ悓姝ュ埌鎵€鏈夋ā鍧?
    const nextCustomers = [...customers, newCustomer];
    setCustomers(nextCustomers);
    await dataManager.saveData('customers', nextCustomers, { syncFirestore: false, notify: true });
    await smartSetDocument('customers', newCustomer.id, newCustomer);

    setSelectedCustomer(newCustomer);
    setNewCustomerName('');
    setNewCustomerPhone('');
    setShowNewCustomerForm(false);
    setShowCustomerModal(false);
    alert('顾客 ' + newCustomer.name + ' 创建成功');
    // 鍒涘缓椤惧鍚庯紝璺宠浆鍒扮偣椁愮晫闈?
    setViewMode('order');
  };

  const handleSkipCustomer = () => {
    setSelectedCustomer(null);
    setShowCustomerModal(false);
    // 璺宠繃椤惧閫夋嫨锛岀洿鎺ヨ烦杞埌鐐归鐣岄潰
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

    // 鉁?鍚屾鏇存柊璁㈠崟锛堝鏋滄湁娲诲姩璁㈠崟锛?
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

    // 鉁?鍚屾鏇存柊璁㈠崟锛堝鏋滄湁娲诲姩璁㈠崟锛?
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
    const nextTotalAmount = newCurrentItems.reduce((sum, item) => sum + item.subtotal, 0);

    setCurrentItems(newCurrentItems);

    // 鉁?鍚屾鏇存柊璁㈠崟锛堝鏋滄湁娲诲姩璁㈠崟锛?
    if (selectedOrderId) {
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

  const handleHoldOrder = () => {
    if (currentItems.length === 0) {
      alert('当前没有商品，无法挂单');
      return;
    }

    if (!selectedTableId) {
      alert('璇峰厛閫夋嫨妗屽彴');
      return;
    }

    const table = tables.find(t => t.id === selectedTableId);
    if (!table) return;

    // 濡傛灉娌℃湁璁㈠崟ID锛屽厛鍒涘缓璁㈠崟
    let orderId = selectedOrderId;
    if (!orderId) {
      const newOrder: Order = {
        id: generateOrderId(),
        orderNumber: generateOrderNumber(),
        tableId: selectedTableId!,
        tableNumber: table.number,
        orderType: orderType,
        deliveryType: orderType === 'delivery' ? deliveryType : undefined,
        deliveryFee: orderType === 'delivery' ? deliveryFee : 0,
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
      deliveryType: orderType === 'delivery' ? deliveryType : undefined, // 淇濆瓨娲鹃€佺被鍨?
      createdAt: new Date(),
      serviceFeeEnabled,
      taxEnabled,
      deliveryFee
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

    alert(`鉁?宸叉寕鍗曪紒\n\n妗屽彿锛?{table.number}\n鍟嗗搧鏁帮細${currentItems.length} 涓猏n\n馃挕 鎻愮ず锛氬湪姒傝鐣岄潰鐐瑰嚮"鎸傚崟"鎸夐挳鍙互鎭㈠璁㈠崟`);
  };

  const handleRetrieveOrder = (heldOrder: HeldOrder) => {
    if (currentItems.length > 0) {
      if (!window.confirm('当前有未完成的订单，是否覆盖？')) {
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

    alert(`✅ 已恢复订单\n\n桌号：${heldOrder.tableNumber}\n商品数：${heldOrder.items.length} 个`);
  };

  // 鉁?鍒涘缓澶栨淳璁㈠崟鐨勫紑鏀褰?
  const createDeliveryExpense = async (order: Order, deliveryFeeAmount: number) => {
    try {
      const today = getLocalDateTimeString().split(' ')[0];

      const expense = {
        id: `delivery_expense_${Date.now()}`,
        date: today,
        categoryId: 'delivery_fee', // 娲鹃€佽垂绫诲埆
        categoryName: '娲鹃€佽垂鏀嚭',
        description: `澶栨淳璁㈠崟 ${order.orderNumber || order.id} - 娲鹃€佽垂`,
        amount: deliveryFeeAmount,
        orderId: order.id,
        orderNumber: order.orderNumber,
        relatedType: 'delivery',
        createdAt: getLocalDateTimeString(),
      };

      // 浣跨敤 dataManager 淇濆瓨寮€鏀褰?
      const nextExpenses = [...dataManager.getData('expenses'), expense];
      await dataManager.saveData('expenses', nextExpenses, { syncFirestore: false, notify: true });
      await smartSetDocument('expenses', expense.id, expense);

      console.log('鉁?宸插垱寤哄娲捐鍗曞紑鏀褰?', expense);
      console.log('馃挵 娲鹃€佽垂閲戦:', deliveryFeeAmount, 'C$');
    } catch (error) {
      console.error('鉂?鍒涘缓寮€鏀褰曞け璐?', error);
    }
  };

  const handleTableAction = async (action: 'clear' | 'add') => {
    console.log('馃敟 handleTableAction 琚皟鐢?', { action, tableActionData });

    if (!tableActionData) {
      console.error('鉂?tableActionData 涓虹┖');
      return;
    }

    if (action === 'clear') {
      console.log('鉁?鎵ц娓呭彴鎿嶄綔');

      const orderToClear = orders.find(o => o.id === tableActionData.orderId);
      if (!orderToClear) {
        console.error('鉂?鎵句笉鍒拌鍗?', tableActionData.orderId);
        return;
      }

      try {
        await completeOrderWithStockDeduction(orderToClear, { releaseTable: true });
      } catch (error) {
        console.error('complete order sync failed:', orderToClear.id, error);
        alert('完成订单同步失败，请检查网络后重试');
        return;
      }

      // 濡傛灉鏈夋鍙帮紝鏇存柊妗屽彴鐘舵€?
      if (tableActionData.tableId) {
        const updatedTable = tables.find(t => t.id === tableActionData.tableId);
        if (updatedTable) {
          const tableWithTimestamp = {
            ...updatedTable,
            status: 'available' as const,
            lastModified: Date.now() // 馃敟 娣诲姞鏃堕棿鎴?
          };
          setTables(tables.map(t =>
            t.id === tableActionData.tableId ? tableWithTimestamp : t
          ));

        }
        alert('\u684c\u53f0\u5df2\u6e05\u7406\uff0c\u53ef\u4ee5\u63a5\u5f85\u65b0\u987e\u5ba2');
      } else {
        alert('\u6e05\u53f0\u5931\u8d25');
      }
    } else {
      console.log('鉁?鎵ц鍔犺彍鎿嶄綔');
      // 鍔犺彍锛氬姞杞藉凡瀹屾垚鐨勮鍗曪紝鍏佽缁х画娣诲姞鑿滃搧
      const existingOrder = orders.find(o => o.id === tableActionData.orderId);
      if (existingOrder) {
        console.log('馃搵 鍔犺浇璁㈠崟杩涜鍔犺彍:', existingOrder.id);

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
        console.log('add dishes to paid order');
      } else {
        console.error('鉂?鎵句笉鍒拌鍗?', tableActionData.orderId);
      }
    }

    console.log('馃敀 鍏抽棴寮圭獥');
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

  const existingOrder = selectedOrderId ? orders.find(o => o.id === selectedOrderId) : null;
  const settledAmount = existingOrder?.settledAmount || 0;
  const remainingAmount = Math.max(0, finalTotal - settledAmount);
  const getSentQuantity = (item: Partial<OrderItem>) => Number(item.sentQuantity) || 0;
  const hasUnsentItems = currentItems.some(item => item.quantity > getSentQuantity(item));

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
        orderNumber: generateOrderNumber(),
        tableId: orderType === 'dine_in' ? selectedTableId! : '',
        tableNumber: orderType === 'dine_in' ? (tables.find(t => t.id === selectedTableId)?.number || '') : '',
        orderType,
        deliveryType: orderType === 'delivery' ? deliveryType : undefined,
        deliveryFee: orderType === 'delivery' ? deliveryFee : 0,
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

      setOrders(prevOrders => {
        if (prevOrders.some(order => order.id === newOrder.id)) {
          return prevOrders;
        }
        return [...prevOrders, newOrder];
      });
      pendingOrderSyncIdsRef.current.add(newOrder.id);
      savePendingOrderSyncIds(pendingOrderSyncIdsRef.current);
      setSelectedOrderId(newOrder.id);
      console.log('created POS order:', newOrder.id);

      setTables(prevTables => prevTables.map(t =>
        orderType === 'dine_in' && t.id === selectedTableId
          ? { ...t, status: 'occupied' as const, currentOrderId: newOrder.id, lastModified: Date.now() }
          : t
      ));
    } else {
      const editableOrderId = selectedEditableOrder.id;
      setOrders(prevOrders => prevOrders.map(o =>
        o.id === editableOrderId ? (() => {
          const nextSettledAmount = Number(o.settledAmount || o.paidAmount || 0);
          const nextPaymentStatus: 'unpaid' | 'partial' | 'paid' =
            nextSettledAmount >= finalTotal - 0.001
              ? 'paid'
              : nextSettledAmount > 0
                ? 'partial'
                : 'unpaid';

          return {
            ...o,
            items: updatedItems,
            totalAmount: finalTotal,
            pointsUsed: pointsRedemptionEnabled ? pointsToUse : (o.pointsUsed || 0),
            pointsDiscount: pointsRedemptionEnabled ? pointsRedemptionAmount : (o.pointsDiscount || 0),
            paymentStatus: nextPaymentStatus,
            updatedAt: new Date(),
            lastModified: Date.now()
          };
        })() : o
      ));
      pendingOrderSyncIdsRef.current.add(editableOrderId);
      savePendingOrderSyncIds(pendingOrderSyncIdsRef.current);
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

  const deductStockForOrder = (order: Order): Order => {
    if (order.stockDeducted) {
      console.log('订单库存已经扣减过，跳过重复扣减:', order.id);
      return {
        ...order,
        lastModified: Date.now()
      };
    }

    if (!order.items || order.items.length === 0) {
      console.warn('鈿狅笍 璁㈠崟娌℃湁鍟嗗搧锛岃烦杩囧簱瀛樻墸鍑?', order.id);
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
      console.log('鉁?璁㈠崟搴撳瓨宸叉墸鍑忚繃锛岃烦杩?', order.id);
      return order;
    }

    console.log('鉁?寮€濮嬫墸鍑忓簱瀛?', order.id, itemsToDeduct.map(item => `${item.name} x${item.quantity}`).join(', '));
    deductStock(itemsToDeduct);

    const operationId = order.stockDeductionOperationId || `stock-${order.id}-${Date.now()}`;
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
      lastModified: Date.now()
    };
  };

  const completeOrderWithStockDeduction = async (order: Order, options: { releaseTable?: boolean } = {}) => {
    const now = new Date();
    const completedOrder = deductStockForOrder({
      ...order,
      status: 'completed' as const,
      completedAt: order.completedAt || now,
      clearedAt: order.clearedAt || now,
      lastModified: Date.now()
    });

    await publishOrderImmediately(completedOrder);

    setOrders(prevOrders => prevOrders.map(o =>
      o.id === order.id ? completedOrder : o
    ));

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
        pointsProcessingOrderIdsRef.current.delete(order.id);
        console.error('process customer points failed:', order.id, error);
      });

    if (options.releaseTable && order.tableId) {
      setTables(prevTables => prevTables.map(t =>
        t.id === order.tableId
          ? { ...t, status: 'available' as const, currentOrderId: undefined, lastModified: Date.now() }
          : t
      ));
    }

    return completedOrder;
  };

  const handleCompletePayment = async () => {
    if (isProcessingPayment) {
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
        const updatedOrder: Order = {
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

        paidOrderForSideEffects = updatedOrder;
        setOrders(prevOrders => prevOrders.map(o =>
          o.id === selectedOrderId ? paidOrderForSideEffects! : o
        ));
        pendingOrderSyncIdsRef.current.add(selectedOrderId);
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
          orderNumber: generateOrderNumber(),
          tableId: selectedTableId || '',
          tableNumber: selectedTableId ? tables.find(t => t.id === selectedTableId)?.number || '' : '',
          orderType,
          deliveryType: orderType === 'delivery' ? deliveryType : undefined,
          deliveryFee: orderType === 'delivery' ? deliveryFee : 0,
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
        finalOrderId = paidOrderForSideEffects.id;
        setOrders(prevOrders => [...prevOrders, paidOrderForSideEffects!]);
        pendingOrderSyncIdsRef.current.add(paidOrderForSideEffects.id);
      }

      savePendingOrderSyncIds(pendingOrderSyncIdsRef.current);

      if (isFullyPaid && paidOrderForSideEffects?.orderType === 'dine_in' && paidOrderForSideEffects.tableId) {
        setTables(prevTables => prevTables.map(t =>
          t.id === paidOrderForSideEffects!.tableId ? { ...t, status: 'needs_cleaning' as const } : t
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
        console.log('payment completed:', finalOrderId);
      }
    } catch (error) {
      console.error('payment failed:', error);
      alert('\u652f\u4ed8\u5904\u7406\u5931\u8d25\uff0c\u8bf7\u68c0\u67e5\u63a7\u5236\u53f0\u9519\u8bef\u540e\u91cd\u8bd5');
    } finally {
      setIsProcessingPayment(false);
    }
  };

  const confirmCancelOrder = async () => {
    if (!managerAuthorizationPasswords.includes(cancelPassword.trim())) {
      alert('密码错误：请输入老板密码 admin123 或店长密码 123456 授权');
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
            cancelledBy: '搴楅暱',
            cancelledAt: new Date(),
            orderId: selectedOrderId || 'draft-order',
            tableNumber: selectedTableId ? tables.find(t => t.id === selectedTableId)?.number || '' : '',
            orderType: 'item'
          };

          setCancelRecords([...cancelRecords, cancelRecord]);

          setCurrentItems(currentItems.map(i =>
            i.id === itemToDelete
              ? { ...i, quantity: newQuantity, subtotal: newQuantity * i.price }
              : i
          ));

          alert(`✅ 已减少 1 个 ${item.name}`);
        } else if (cancelAction === 'add') {
          const newQuantity = item.quantity + 1;

          const addRecord: CancelRecord = {
            id: `cancel-${Date.now()}`,
            itemId: item.id,
            itemName: item.name,
            quantity: 1,
            reason: cancelReason,
            cancelledBy: '搴楅暱',
            cancelledAt: new Date(),
            orderId: selectedOrderId || 'draft-order',
            tableNumber: selectedTableId ? tables.find(t => t.id === selectedTableId)?.number || '' : '',
            orderType: 'item'
          };

          setCancelRecords([...cancelRecords, addRecord]);

          setCurrentItems(currentItems.map(i =>
            i.id === itemToDelete
              ? { ...i, quantity: newQuantity, subtotal: newQuantity * i.price }
              : i
          ));

          alert(`✅ 已增加 1 个 ${item.name}（需通知厨房）`);
        } else {
          const cancelRecord: CancelRecord = {
            id: `cancel-${Date.now()}`,
            itemId: item.id,
            itemName: item.name,
            quantity: item.quantity,
            reason: cancelReason,
            cancelledBy: '搴楅暱',
            cancelledAt: new Date(),
            orderId: selectedOrderId || 'draft-order',
            tableNumber: selectedTableId ? tables.find(t => t.id === selectedTableId)?.number || '' : '',
            orderType: 'item'
          };

          setCancelRecords([...cancelRecords, cancelRecord]);
          setCurrentItems(currentItems.filter(i => i.id !== itemToDelete));

          alert('✅ 商品已取消（需通知厨房）');
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
          alert('未找到当前订单，请刷新后重试');
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
          alert('取消订单同步失败，请检查网络后重试');
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
            cancelledBy: '搴楅暱',
            cancelledAt: new Date(),
            orderId: order.id,
            tableNumber: order.tableNumber,
            orderType: 'order'
          }));

          setCancelRecords([...cancelRecords, ...orderCancelRecords]);
        }
      }

      if (tableIdToRelease) {
        setTables(prevTables => prevTables.map(t =>
          t.id === tableIdToRelease
            ? { ...t, status: 'available' as const, currentOrderId: undefined, lastModified: Date.now() }
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

      alert('✅ 订单已取消');
    }
  };

  const handleSplitBillConfirm = (splitBills: SplitBill[]) => {
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
        orderNumber: generateOrderNumber(),
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

    alert(`✅ 账单已拆分为 ${splitBills.length} 份\n` + 
      splitBills.map(bill => `${bill.customerName}: C$${bill.subtotal.toFixed(2)} (${bill.paymentStatus === 'paid' ? '已付' : '未付'})`).join('\n') +
      `\n\n总计: C$${totalAmount.toFixed(2)}`);
  };
  
  // 打印小票功能
  const handlePrintReceipt = () => {
    const tableNumber = selectedTableId ? tables.find(t => t.id === selectedTableId)?.number : '';
    const orderTypeText = orderType === 'dine_in' ? '堂食' : orderType === 'takeout' ? '打包' : '外卖';
    
    let printContent = `
      <div style="font-family: monospace; padding: 20px; max-width: 300px; margin: 0 auto;">
        <h2 style="text-align: center; margin-bottom: 10px;">🍜 Restaurante Chino</h2>
        <div style="border-top: 2px dashed #000; border-bottom: 2px dashed #000; padding: 10px 0; margin: 10px 0;">
          <div style="display: flex; justify-content: space-between; margin: 5px 0;">
            <span>订单类型：</span>
            <span>${orderTypeText}</span>
          </div>
          ${tableNumber ? `<div style="display: flex; justify-content: space-between; margin: 5px 0;"><span>桌号：</span><span>桌${tableNumber}</span></div>` : ''}
          <div style="display: flex; justify-content: space-between; margin: 5px 0;">
            <span>时间：</span>
            <span>${new Date().toLocaleString('zh-CN')}</span>
          </div>
          ${selectedOrderId ? `<div style="display: flex; justify-content: space-between; margin: 5px 0;"><span>订单号：</span><span>${selectedOrderId.slice(-6)}</span></div>` : ''}
        </div>
        
        <div style="margin: 15px 0;">
          <div style="display: flex; justify-content: space-between; font-weight: bold; border-bottom: 1px solid #000; padding-bottom: 5px; margin-bottom: 10px;">
            <span style="flex: 2;">商品</span>
            <span style="flex: 1; text-align: center;">数量</span>
            <span style="flex: 1; text-align: right;">金额</span>
          </div>
          ${currentItems.map(item => `
            <div style="display: flex; justify-content: space-between; margin: 8px 0;">
              <span style="flex: 2;">${item.name}</span>
              <span style="flex: 1; text-align: center;">x${item.quantity}</span>
              <span style="flex: 1; text-align: right;">C$${item.subtotal.toFixed(2)}</span>
            </div>
          `).join('')}
        </div>
        
        <div style="border-top: 2px dashed #000; padding-top: 10px; margin-top: 10px;">
          <div style="display: flex; justify-content: space-between; font-size: 1.2em; font-weight: bold;">
            <span>总计：</span>
            <span>C$${currentItems.reduce((sum, item) => sum + item.subtotal, 0).toFixed(2)}</span>
          </div>
        </div>
        
        ${(() => {
          const currentOrder = orders.find(o => o.id === selectedOrderId);
          if (currentOrder?.splitBills && currentOrder.splitBills.length > 0) {
            return `<div style="margin-top: 15px; padding: 10px; background-color: #f0f0f0; border-radius: 5px;">
              <div style="font-weight: bold; margin-bottom: 5px;">🔀 已拆分为 ${currentOrder.splitBills.length} 份</div>
              ${currentOrder.splitBills.map(bill => `<div style="margin: 5px 0;">${bill.customerName}: C$${bill.subtotal.toFixed(2)} (${bill.paymentStatus === 'paid' ? '✅ 已付' : '⏳ 未付'})</div>`).join('')}
            </div>`;
          }
          return '';
        })()}
        
        <div style="text-align: center; margin-top: 20px; font-size: 0.9em; color: #666;">
          <p>谢谢惠顾！</p>
          <p>欢迎下次光临</p>
        </div>
      </div>
    `;
    
    const printWindow = window.open('', '_blank', 'width=400,height=600');
    if (printWindow) {
      printWindow.document.write(`<!DOCTYPE html><html><head><title>订单小票</title><style>
        body { margin: 0; padding: 0; background: #f3f4f6; }
        .receipt-toolbar { position: sticky; top: 0; display: flex; gap: 8px; padding: 10px; background: #111827; z-index: 10; }
        .receipt-toolbar button { flex: 1; border: 0; border-radius: 4px; padding: 10px; color: white; font-weight: 700; cursor: pointer; }
        .print-btn { background: #2563eb; }
        .back-btn { background: #6b7280; }
        .receipt-cut-feed { height: 80px; }
        @media print {
          body { margin: 0; padding: 0; background: white; }
          .no-print { display: none !important; }
          .receipt-cut-feed { height: 100px; }
        }
      </style></head><body>
        <div class="receipt-toolbar no-print">
          <button class="print-btn" onclick="window.print()">打印并切纸</button>
          <button class="back-btn" onclick="window.close()">返回POS</button>
        </div>
        ${printContent}
        <div class="receipt-cut-feed"></div>
        <script>window.onload = function() { setTimeout(function(){ window.print(); }, 300); }</script>
      </body></html>`);
      printWindow.document.close();
    }
  };

  const getTableColor = (table: Table) => {
    switch (table.status) {
      case 'available': return '#10b981'; // 缁胯壊 - 绌洪棽
      case 'occupied': return '#ef4444'; // 下单未支付：红色
      case 'reserved': return '#f59e0b'; // 榛勮壊 - 棰勮
      case 'needs_cleaning': return '#f97316'; // 已支付待清台：橙色
      default: return '#6b7280';
    }
  };

  // 鐢熸垚璁㈠崟鍙凤紙鏍煎紡锛歁MDD + 3浣嶅簭鍙凤級
  const generateOrderNumber = () => {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const dateStr = `${month}${day}`;

    // 缁熻浠婂ぉ宸插垱寤虹殑璁㈠崟鏁伴噺
    const maxSeq = orders.reduce((max, order) => {
      const orderNumber = String(order.orderNumber || '');
      if (!orderNumber.startsWith(dateStr)) return max;

      const seq = Number(orderNumber.slice(dateStr.length));
      return Number.isFinite(seq) ? Math.max(max, seq) : max;
    }, 0);

    const seq = String(maxSeq + 1).padStart(3, '0');
    return `${dateStr}${seq}`;
  };

  // 鈿狅笍 閲嶈鍘熷垯锛氳鍗曠粷瀵逛笉鑳藉垹闄わ紝鍙兘鏇存柊鐘舵€?
  // - draft: 鑽夌璁㈠崟
  // - confirmed: 宸茬‘璁?
  // - preparing: 鍒朵綔涓?
  // - served: 宸蹭笂鑿?
  // - completed: 宸插畬鎴愶紙淇濈暀锛?
  // - cancelled: 宸插彇娑堬紙淇濈暀锛?
  // - partial: 閮ㄥ垎鏀粯锛堜繚鐣欙級
  // 鎵€鏈夊巻鍙茶鍗曢兘蹇呴』姘镐箙淇濆瓨锛岀敤浜庢姤琛ㄥ拰瀹¤

  // 鈿狅笍 宸茬Щ闄わ細妗屽彴娲诲姩璁㈠崟妫€鏌ワ紙閬垮厤姝诲惊鐜級

  // 杩囨护璁㈠崟锛氭敹閾剁晫闈㈠彧鏄剧ず褰撳ぉ鐨勮鍗曪紙鍘嗗彶璁㈠崟鍦ㄥ簵闀跨鐞嗘煡鐪嬶級
  const today = getLocalDateString();

  const allOrders = (orderTypeFilter === 'all'
    ? orders
    : orders.filter(o => o.orderType === orderTypeFilter)
  ).filter(o => {
    // 鎺掗櫎鑽夌鐘舵€佺殑璁㈠崟
    if (o.status === 'draft') return false;

    const orderDate = toDisplayDate(o.createdAt || o.preparingAt || o.completedAt || o.lastModified);
    if (!orderDate) return false;

    return getLocalDateString(orderDate) === today;
  });

  const filteredOrders = [...allOrders].sort((a, b) => {
    const dateA = toDisplayDate(a.createdAt || a.preparingAt || a.completedAt || a.lastModified)?.getTime() || 0;
    const dateB = toDisplayDate(b.createdAt || b.preparingAt || b.completedAt || b.lastModified)?.getTime() || 0;
    return dateB - dateA;
  });

  const handleAddTable = () => {
    if (newTableName.trim()) {
      markTableUserEdit();
      if (editingTable) {
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
      setTables(prevTables => normalizeTables([...prevTables, newTable], activeOrderTableIdsRef.current).tables);
      setNewTableName('');
      setEditingTable(null);
      setShowAddTableModal(false);
    }
  };

  const handleDeleteTable = async (tableId: string) => {
    if (window.confirm('\u786e\u5b9a\u8981\u5220\u9664\u8fd9\u4e2a\u684c\u5b50\u5417?')) {
      markTableUserEdit();
      deletedTableIdsRef.current.add(tableId);
      setSelectedTables(prev => prev.filter(id => id !== tableId));
      if (selectedTableId === tableId) {
        setSelectedTableId(null);
      }
      setTables(prevTables => prevTables.filter(t => t.id !== tableId));

      try {
        await smartDeleteDocument('pos_tables', tableId);
        console.log('鉁?妗屽彴宸蹭粠浜戠鍒犻櫎:', tableId);
      } catch (error) {
        console.error('鉂?鍒犻櫎妗屽彴澶辫触:', error);
        alert('\u5220\u9664\u4e91\u7aef\u684c\u53f0\u5931\u8d25\uff0c\u8bf7\u68c0\u67e5\u7f51\u7edc\u540e\u91cd\u8bd5');
      }
    }
  };

  const handleOrderClick = (order: any) => {
    // 鉁?濡傛灉璁㈠崟宸叉竻鍙帮紝杩涘叆鍙璇︽儏妯″紡锛堝彲浠ユ墦鍗板皬绁級
    if (order.status === 'cancelled' || (order.status === 'completed' && order.clearedAt)) {
      const table = tables.find(t => t.number === order.tableNumber);
      setSelectedTableId(table ? table.id : null);
      setSelectedOrderId(order.id);

      // 鍔犺浇璁㈠崟鍟嗗搧鍒?currentItems锛堝彧璇伙級
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

      // 鉁?鎭㈠璁㈠崟鐨勫鎴蜂俊鎭?
      if (order.customerId) {
        const customer = customers.find(c => c.id === order.customerId);
        if (customer) {
          setSelectedCustomer(customer);
        }
      } else {
        setSelectedCustomer(null);
      }

      // 鉁?鎭㈠璁㈠崟绫诲瀷鍜屾淳閫佺被鍨?
      setOrderType(order.orderType || 'dine_in');
      if (order.orderType === 'delivery') {
        setDeliveryType(order.deliveryType || 'self');
        setDeliveryFee(order.deliveryFee || 0);
      }

      // 璁剧疆涓鸿鍗曟ā寮忥紙浣嗕細妫€娴嬩负鍙锛?
      setViewMode('order');
      return;
    }

    // 鉁?鎵€鏈夌被鍨嬬殑璁㈠崟锛堝爞椋?鎵撳寘/澶栧崠锛夐兘寮瑰嚭鍔犺彍/瀹屾垚閫夋嫨妗?
    if (order.status === 'completed' && !order.clearedAt) {
      setTableActionData({
        tableId: order.tableId,  // 澶栧崠/鎵撳寘鍙兘涓?null
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
    console.log('馃柋锔?寮€濮嬫嫋鎷芥鍙?', tableId, 'isEditMode:', isEditMode);
    if (!isEditMode) return;
    setDraggedTable(tableId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', tableId);
  };

  // 榧犳爣鎷栨嫿瀹炵幇
  const handleTableMouseDown = (e: React.MouseEvent, tableId: string) => {
    if (!isEditMode) return;

    const table = tables.find(t => t.id === tableId);
    if (!table) return;

    setIsDragging(true);
    setDraggedTable(tableId);

    // 璁＄畻榧犳爣鐩稿浜庢鍙板乏涓婅鐨勫亸绉?
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
      markTableUserEdit();
      const finalPosition = pendingDragPositionRef.current;
      if (finalPosition) {
        setTables(prevTables => prevTables.map(t => (
          t.id === draggedTable
            ? { ...t, x: finalPosition.x, y: finalPosition.y, lastModified: Date.now() }
            : t
        )));
      }
      pendingDragPositionRef.current = null;
      console.log('鉁?妗屽彴绉诲姩瀹屾垚:', draggedTable);
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

    markTableUserEdit();
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
        capacity: t.capacity,
        status: t.status,
        currentOrderId: t.currentOrderId
      }));

    const mergedTable: Table = {
      ...firstTable,
      id: `merged-${Date.now()}`,
      number: `${mergedFromTables.map(t => t.number).join('+')}`,
      width: 110,
      height: 90,
      mergedFromTables,
      lastModified: Date.now(),
      capacity: mergedFromTables.reduce((sum, t) => sum + (t.capacity || 0), 0)
    };

    selectedTables.forEach(id => {
      deletedTableIdsRef.current.add(id);
      smartDeleteDocument('pos_tables', id).catch(error => {
        console.error('鍒犻櫎鍚堝苟鍓嶆鍙板け璐?', id, error);
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

    markTableUserEdit();
    const numbers = table.number.split('+');
    const now = Date.now();
    const restoredTables = table.mergedFromTables
      ? table.mergedFromTables.map(original => ({
        ...original,
        x: original.x,
        y: original.y,
        width: original.width || 110,
        height: original.height || 90,
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
      status: 'available' as const,
      capacity: Math.floor(table.capacity / numbers.length),
      lastModified: now
    }));

    deletedTableIdsRef.current.add(tableId);
    restoredTables.forEach(restoredTable => {
      deletedTableIdsRef.current.delete(restoredTable.id);
    });
    smartDeleteDocument('pos_tables', tableId).catch(error => {
      console.error('鍒犻櫎鎷嗗垎鍓嶆鍙板け璐?', tableId, error);
    });
    setTables(normalizeTables([...tables.filter(t => t.id !== tableId), ...restoredTables], activeOrderTableIdsRef.current).tables);
  };

  const getStatusColor = (status: string, paymentStatus?: string, clearedAt?: Date) => {
    if (paymentStatus === 'paid' && status !== 'completed' && status !== 'cancelled' && !clearedAt) {
      return '#fed7aa';
    }

    switch (status) {
      case 'draft': return '#f3f4f6'; // 娴呯伆鑹?- 鑽夌
      case 'confirmed': return '#fecaca';
      case 'preparing': return '#fecaca';
      case 'served': return '#fecaca';
      case 'completed': return '#ffffff'; // 鐧借壊 - 宸插畬鎴愶紙鑷劧鑹诧級
      case 'cancelled': return '#fee2e2'; // 娴呯孩鑹?- 宸插彇娑?
      default: return '#f3f4f6';
    }
  };

  const getStatusText = (status: string, paymentStatus?: string, clearedAt?: Date) => {
    if (paymentStatus === 'paid' && status !== 'completed' && status !== 'cancelled' && !clearedAt) {
      return '\u5df2\u652f\u4ed8';
    }

    switch (status) {
      case 'draft': return '\u8349\u7a3f';
      case 'confirmed': return '\u5df2\u786e\u8ba4';
      case 'preparing': return '\u5236\u4f5c\u4e2d';
      case 'served': return paymentStatus === 'paid' ? '\u5df2\u652f\u4ed8' : '\u5df2\u4e0a\u83dc';
      case 'completed': return '\u5df2\u5b8c\u6210';
      case 'cancelled': return '\u5df2\u53d6\u6d88';
      default: return status;
    }
  };


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
          {itemToDelete ? '⚠️ 取消商品授权' : '⚠️ 取消订单授权'}
        </h3>

        <div style={{ marginBottom: '1rem', padding: '0.75rem', backgroundColor: '#fef2f2', borderRadius: '0.5rem', border: '1px solid #fecaca' }}>
          <p style={{ margin: 0, fontSize: '0.9rem', color: '#991b1b' }}>
            <strong>警告：</strong>
            {itemToDelete
              ? '该商品已发送到厨房，取消需要店长授权。' 
              : '取消订单需要店长授权。此操作不可恢复！'}
          </p>
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: '600', color: '#374151', marginBottom: '0.5rem' }}>
            店长/老板授权密码
          </label>
          <div style={{ fontSize: '0.8rem', color: '#6b7280', marginBottom: '0.5rem' }}>
            老板密码 admin123；店长密码 123456
          </div>
          <input
            type="password"
            value={cancelPassword}
            onChange={(e) => setCancelPassword(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            placeholder="请输入授权密码"
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
            📝 取消原因
          </label>
          <textarea
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            placeholder="请说明取消原因..."
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
            取消
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
            确认授权
          </button>
        </div>
      </div>
    </div>
  );

  // Table Action Modal Component
  const TableActionModal = () => {
    // 鏌ユ壘璁㈠崟锛屽垽鏂槸鍫傞杩樻槸鎵撳寘/澶栧崠
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
          {isDineIn ? `桌${tableActionData?.tableNumber}` : `${tableActionData?.tableNumber}`} 操作选择
        </h3>
        <p style={{ margin: '0 0 1.5rem 0', color: '#6b7280', fontSize: '0.95rem' }}>
          {isDineIn ? '该桌订单已支付，请选择加菜或清台。' : '该订单已支付，请选择下一步操作。'}
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
            加菜
          </button>
          <button
            onClick={() => {
              handleTableAction('clear');
            }}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: '#ef4444',
              color: 'white',
              border: 'none',
              borderRadius: '0.375rem',
              fontWeight: '600',
              cursor: 'pointer',
              fontSize: '0.95rem'
            }}
          >
            {isDineIn ? '🧹 清台' : '✅ 完成'}
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
        <div style={{ height: 'calc(100vh - 8rem)', display: 'flex', flexDirection: 'column', padding: '1rem', gap: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0' }}>
            <h2 style={{ margin: 0, fontSize: '1.5rem', color: '#1f2937' }}>
              账单拆分 - 桌{selectedTableId ? tables.find(t => t.id === selectedTableId)?.number : ''}
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
              ← 返回点餐
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
    // 鉁?妫€娴嬫槸鍚︿负宸叉竻鍙拌鍗曪紙鍙妯″紡锛?
    const currentOrder = orders.find(o => o.id === selectedOrderId);
    // 鉁?鍔犺彍妯″紡锛氬嵆浣胯鍗曟槸completed锛屽彧瑕佹病鏈塩learedAt锛屽氨涓嶈繘鍏ュ彧璇绘ā寮?
    const isReadOnly = currentOrder?.status === 'cancelled' || (currentOrder?.status === 'completed' && !!currentOrder?.clearedAt);

    return (
      <>
        <div style={{
          height: 'calc(100vh - 64px)',  // 鍑忓幓椤堕儴瀵艰埅鏍忛珮搴?
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}>
          {/* 涓诲唴瀹瑰尯 */}
          <div style={{ flex: 1, display: 'flex', gap: '0.75rem', padding: '0.75rem', overflow: 'hidden', boxSizing: 'border-box' }}>
            {/* Left: Menu Selection - 鍙妯″紡闅愯棌 */}
            {!isReadOnly && (
              <div style={{ flex: 6, backgroundColor: 'white', borderRadius: '0.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
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
                <div style={{ flex: 1, backgroundColor: '#fffbe6', borderRadius: '0.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
                  {/* 鍙粴鍔ㄧ殑鍐呭鍖?- 闄愬埗鏈€澶ч珮搴?*/}
                  <div style={{ flex: '1 1 auto', overflowY: 'auto', padding: '0.75rem', maxHeight: 'calc(100vh - 200px)' }}>
                    {/* Receipt Header */}
                <div style={{ textAlign: 'center', borderBottom: '2px dashed #d1d5db', paddingBottom: '0.75rem', marginBottom: '0.75rem' }}>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#1f2937', margin: '0 0 0.5rem 0' }}>
                    Restaurante Chino
                  </h3>

                  <div style={{ fontSize: '0.8rem', color: '#4b5563', lineHeight: '1.6' }}>
                    {/* 鉁?浣跨敤璁㈠崟鐨勫疄闄呮暟鎹紝鑰屼笉鏄綋鍓嶇姸鎬?*/}
                    {(() => {
                      const currentOrder = orders.find(o => o.id === selectedOrderId);
                      const displayOrderType = currentOrder?.orderType || orderType;
                      const displayOrderNumber = currentOrder?.orderNumber || (selectedOrderId ? selectedOrderId.slice(-6) : '');

                      return (
                        <>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                            <span>订单类型：</span>
                            <span style={{ fontWeight: '600' }}>
                              {displayOrderType === 'dine_in' ? '🍽️ 堂食' : displayOrderType === 'takeout' ? '🥡 打包' : '🚚 外卖'}
                            </span>
                          </div>

                          {/* 鉁?鏄剧ず璁㈠崟鍙?*/}
                          {displayOrderNumber && (
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                              <span>订单号：</span>
                              <span style={{ fontWeight: '600', fontSize: '0.75rem' }}>{displayOrderNumber}</span>
                            </div>
                          )}

                          {/* 鉁?鏄剧ず妗屽彿锛堝鏋滄湁锛?*/}
                          {selectedTableId && (
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                              <span>桌号：</span>
                              <span style={{ fontWeight: '600' }}>桌{tables.find(t => t.id === selectedTableId)?.number}</span>
                            </div>
                          )}

                          {/* 鉁?鏄剧ず瀹㈡埛淇℃伅 */}
                          {selectedCustomer && (
                            <>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                                <span>顾客：</span>
                                <span style={{ fontWeight: '600' }}>{selectedCustomer.name}</span>
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                                <span>电话：</span>
                                <span style={{ fontWeight: '600' }}>{selectedCustomer.phone}</span>
                              </div>
                            </>
                          )}

                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                            <span>时间：</span>
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
                          🔀 已拆分为 {currentOrder.splitBills.length} 份
                        </div>
                        {currentOrder.splitBills.map(bill => (
                          <div key={bill.id} style={{ color: '#78350f' }}>
                            {bill.customerName}: C${bill.subtotal.toFixed(2)} ({bill.paymentStatus === 'paid' ? '已付' : '未付'})
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
                          title={item.quantity > 1 ? "减少数量" : "删除商品"}
                        >
                          {item.quantity > 1 ? '−' : '×'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Cost Details */}
                <div style={{ borderTop: '2px dashed #d1d5db', paddingTop: '0.5rem' }}>
                  {/* 鉁?澶栧崠璁㈠崟鏄剧ず娲鹃€佽垂锛堝湪绋庤垂鏈嶅姟璐逛笂闈級 */}
                  {(() => {
                    const currentOrder = orders.find(o => o.id === selectedOrderId);
                    const displayDeliveryFee = currentOrder?.orderType === 'delivery' ? (currentOrder.deliveryFee || deliveryFee) : 0;

                    if (displayDeliveryFee > 0) {
                      return (
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem', fontSize: '0.75rem' }}>
                          <span style={{ color: '#6b7280' }}>🚚 派送费</span>
                          <span style={{ color: '#374151', fontWeight: '600' }}>C${displayDeliveryFee.toFixed(2)}</span>
                        </div>
                      );
                    }
                    return null;
                  })()}

                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem', fontSize: '0.75rem' }}>
                    <span style={{ color: '#6b7280' }}>税费 (15%)</span>
                    <span style={{ color: '#374151', fontWeight: '600' }}>C${(taxEnabled ? tax : 0).toFixed(2)}</span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem', fontSize: '0.75rem' }}>
                    <span style={{ color: '#6b7280' }}>服务费 (10%)</span>
                    <span style={{ color: '#374151', fontWeight: '600' }}>C${(serviceFeeEnabled ? serviceFee : 0).toFixed(2)}</span>
                  </div>

                  {discountEnabled && discountAmount > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem', fontSize: '0.75rem' }}>
                      <span style={{ color: '#ef4444' }}>
                        🎫 折扣 {discountType === 'percentage' ? `(${discountValue}%)` : ''}
                        {discountReason && <span style={{ fontSize: '0.7rem', color: '#9ca3af' }}> - {discountReason}</span>}
                      </span>
                      <span style={{ color: '#ef4444', fontWeight: '600' }}>-C${discountAmount.toFixed(2)}</span>
                    </div>
                  )}

                  {pointsRedemptionEnabled && pointsRedemptionAmount > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem', fontSize: '0.75rem' }}>
                      <span style={{ color: '#f59e0b' }}>⭐ 积分兑换 ({pointsToUse} 积分)</span>
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
                    <span style={{ color: '#374151' }}>总计</span>
                    <span style={{ color: '#2563eb' }}>C${finalTotal.toFixed(2)}</span>
                  </div>
                </div>

                {/* Receipt Footer */}
                <div style={{ textAlign: 'center', marginTop: '0.5rem', paddingTop: '0.3rem', borderTop: '1px dashed #d1d5db', fontSize: '0.65rem', color: '#9ca3af' }}>
                  <div>谢谢惠顾!</div>
                  <div>{formatNicaraguaDateTime(new Date())}</div>
                </div>
                  </div>

                  {/* 鍥哄畾搴曢儴鎸夐挳鍖?- 鍦ㄦ粴鍔ㄥ鍣ㄥ */}
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
                    🖨️ 打印小票
                  </button>

                  {isReadOnly && (
                    <button
                      onClick={() => {
                        setViewMode('overview');
                        setCurrentItems([]);
                        setSelectedOrderId(null);
                        setSelectedTableId(null);
                        setSelectedCustomer(null);
                        setServiceFeeEnabled(false);
                        setTaxEnabled(false);
                        setDeliveryFee(0);
                        setOrderType('dine_in');
                      }}
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
                      ← 返回主界面
                    </button>
                  )}

                  {/* 鉁?鍙妯″紡闅愯棌鎵€鏈夋搷浣滄寜閽?*/}
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
                        title={hasUnsentItems ? '确认下单（发送到厨房）' : '所有商品已确认'}
                      >
                        ✅ 确认下单
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
                          ⏸️ 挂单
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
                      🔀 拆分账单
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
                      ❌ 取消整单
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
                fontSize: '0.875rem',
                color: '#9ca3af'
              }}>
                暂无订单
              </div>
            )}
          </div>

          {/* Right: Payment Interface - 鍙妯″紡闅愯棌 */}
          {!isReadOnly && (
            <div style={{ flex: 3, backgroundColor: 'white', borderRadius: '0.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', padding: '1rem', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: '600', color: '#374151', margin: 0, marginBottom: '0.75rem' }}>💳 支付</h3>

            {selectedOrderId && settledAmount > 0 && (
              <div style={{
                padding: '0.4rem',
                backgroundColor: '#d1fae5',
                borderRadius: '0.25rem',
                marginBottom: '0.4rem',
                border: '1px solid #10b981'
              }}>
                <div style={{ fontSize: '0.75rem', color: '#065f46', fontWeight: '600', marginBottom: '0.2rem' }}>
                  ✅ 已结算
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
                  <span style={{ color: '#065f46', fontWeight: '600' }}>还需：</span>
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
                      <label style={{ fontSize: '0.8rem', color: '#6b7280', fontWeight: '600', whiteSpace: 'nowrap' }}>🚚 派送类型:</label>
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
                          自送
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
                          外派
                        </label>
                      </div>
                    </div>

                    {/* 娲鹃€佽垂杈撳叆妗?*/}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <label style={{ fontSize: '0.8rem', color: '#6b7280', fontWeight: '600', whiteSpace: 'nowrap' }}>💰 派送费:</label>
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
                        ⚠️ 外派订单的派送费将计入当天支出
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
                          // 鉁?鍚敤鎶樻墸鏃堕渶瑕佸簵闀挎巿鏉?
                          const password = prompt('🔑 请输入店长/老板密码以启用折扣：');
                          if (password && managerAuthorizationPasswords.includes(password.trim())) {
                            setDiscountEnabled(true);
                          } else {
                            alert('❌ 密码错误，需要店长或老板授权');
                          }
                        } else {
                          // 绂佺敤鎶樻墸涓嶉渶瑕佹巿鏉?
                          setDiscountEnabled(false);
                        }
                      }}
                      id="discount-checkbox"
                      style={{ width: '14px', height: '14px', cursor: 'pointer' }}
                    />
                    <label htmlFor="discount-checkbox" style={{ fontSize: '0.8rem', color: '#6b7280', fontWeight: '600', cursor: 'pointer' }}>
                      🎫 折扣
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
                          <option value="percentage">百分比(%)</option>
                          <option value="fixed">固定金额(C$)</option>
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
                        placeholder="折扣原因"
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
                        ⭐ 积分({selectedCustomer.points})
                        {selectedCustomer.points === 0 && (
                          <span style={{ fontSize: '0.7rem', color: '#ef4444', marginLeft: '0.3rem' }}>
                            (无积分)
                          </span>
                        )}
                      </label>
                    </div>

                    {pointsRedemptionEnabled && selectedCustomer.points > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <label style={{ fontSize: '0.75rem', color: '#92400e', whiteSpace: 'nowrap' }}>
                            兑换比例({pointsExchangeRate}分 = C$1):
                          </label>
                          <input
                            type="number"
                            value={pointsToUse || ''}
                            onChange={(e) => {
                              const value = Math.min(parseInt(e.target.value) || 0, selectedCustomer.points);
                              setPointsToUse(value);
                            }}
                            placeholder="积分"
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
                  <h4 style={{ fontSize: '0.9rem', fontWeight: '600', color: '#374151', marginBottom: '0.4rem', borderBottom: '1px solid #e5e7eb', paddingBottom: '0.2rem' }}>💵 现金</h4>
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
                  <h4 style={{ fontSize: '0.9rem', fontWeight: '600', color: '#374151', marginBottom: '0.4rem', borderBottom: '1px solid #e5e7eb', paddingBottom: '0.2rem' }}>💳 刷卡</h4>
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
                    <span>总计</span>
                    <span style={{ color: '#2563eb', fontSize: '1.3rem' }}>C${finalTotal.toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.95rem' }}>
                    <span style={{ color: '#6b7280' }}>本次支付</span>
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
                      还需支付: C${Math.abs(change).toFixed(2)}
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                    <button
                      onClick={() => {
                        setViewMode('overview');
                        setCurrentItems([]);
                        setServiceFeeEnabled(false);
                        setTaxEnabled(false);
                        setDeliveryFee(0);
                        setOrderType('dine_in');
                        setCashNIO('');
                        setCashUSD('');
                        setCardNIO('');
                        setCardUSD('');
                      }}
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
                      ← 返回
                    </button>

                    <button
                      onClick={handleCompletePayment}
                      disabled={paidAmount < remainingAmount || currentItems.length === 0}
                      style={{
                        flex: 2,
                        padding: '0.75rem',
                        backgroundColor: paidAmount >= remainingAmount && currentItems.length > 0 ? '#10b981' : '#d1d5db',
                        color: 'white',
                        border: 'none',
                        borderRadius: '0.25rem',
                        fontWeight: '600',
                        cursor: paidAmount >= remainingAmount && currentItems.length > 0 ? 'pointer' : 'not-allowed',
                        fontSize: '0.95rem'
                      }}
                    >
                      ✓ 完成
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
                        <span>服务费</span>
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', fontSize: '0.75rem', flex: 1 }}>
                        <input
                          type="checkbox"
                          checked={taxEnabled}
                          onChange={(e) => setTaxEnabled(e.target.checked)}
                          style={{ marginRight: '0.2rem', width: '12px', height: '12px' }}
                        />
                        <span>税费</span>
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
      <div style={{ height: 'calc(100vh - 64px)', display: 'flex', flexDirection: 'column', padding: '1rem', gap: '1rem', overflow: 'hidden' }}>
        <div style={{ flex: 1, display: 'flex', gap: '1rem', overflow: 'hidden' }}>
          {/* Left: Table Layout */}
          <div style={{ flex: 1, backgroundColor: 'white', borderRadius: '0.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '0.75rem', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: '600', color: '#374151', margin: 0 }}>🪑 桌台布局</h3>
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
                  ⏸️ 挂单
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
                    🔗 合并桌子
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
                    {isEditMode ? '完成编辑' : '编辑桌台'}
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
                    ➕ 添加桌台
                  </button>
                )}
              </div>
            </div>
            <div
              style={{
                flex: 1,
                position: 'relative',
                backgroundColor: '#f3f4f6',
                overflow: 'hidden',
                backgroundImage: 'radial-gradient(#d1d5db 1px, transparent 1px)',
                backgroundSize: '20px 20px'
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
                    height: '90px',
                    cursor: isEditMode ? (isDragging && draggedTable === table.id ? 'grabbing' : 'grab') : 'pointer',
                    transition: isEditMode ? 'none' : 'all 0.3s ease',
                    opacity: isDragging && draggedTable === table.id ? 0.7 : 1,
                    transform: isDragging && draggedTable === table.id ? 'scale(1.08)' : 'scale(1)',
                    zIndex: isDragging && draggedTable === table.id ? 1000 : 1,
                    userSelect: 'none'
                  }}
                >
                  <div style={{
                    position: 'absolute',
                    top: '6px',
                    left: '6px',
                    right: '-6px',
                    bottom: '-6px',
                    backgroundColor: 'rgba(0, 0, 0, 0.15)',
                    borderRadius: '18px',
                    filter: 'blur(6px)'
                  }} />

                  <div style={{
                    width: '100%',
                    height: '75px',
                    borderRadius: '18px',
                    border: selectedTableId === table.id ? '3px solid #3b82f6' : (selectedTables.includes(table.id) ? '3px dashed #7c3aed' : '2px solid rgba(255, 255, 255, 0.8)'),
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'relative',
                    background: selectedTables.includes(table.id)
                      ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
                      : `linear-gradient(135deg, ${getTableColor(table)} 0%, ${getTableColor(table)}dd 100%)`,
                    boxShadow: selectedTableId === table.id
                      ? '0 6px 12px rgba(59, 130, 246, 0.4), inset 0 2px 6px rgba(255, 255, 255, 0.3)'
                      : '0 4px 8px rgba(0, 0, 0, 0.15), inset 0 2px 6px rgba(255, 255, 255, 0.3)',
                    overflow: 'hidden'
                  }}>
                    <div style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      height: '50%',
                      background: 'linear-gradient(to bottom, rgba(255,255,255,0.3) 0%, rgba(255,255,255,0) 100%)',
                      borderRadius: '18px 18px 0 0'
                    }} />

                    <div style={{
                      fontSize: '1.2rem',
                      fontWeight: 'bold',
                      color: 'white',
                      textShadow: '0 2px 4px rgba(0,0,0,0.3)',
                      zIndex: 1
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
                      ✂️ 拆分
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
                        修改
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
                        删除
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
                  <h4 style={{ margin: 0, fontSize: '1rem', color: '#92400e' }}>⏸️ 挂单列表</h4>
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
                      暂无挂单
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
                            桌{heldOrder.tableNumber}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                            {formatOrderTime(heldOrder.createdAt)}
                          </div>
                        </div>
                        <div style={{ fontSize: '0.8rem', color: '#6b7280', marginBottom: '0.5rem' }}>
                          {heldOrder.orderType === 'dine_in' ? '🍽️ 堂食' : heldOrder.orderType === 'takeout' ? '🥡 打包' : '🚚 外卖'}
                          {heldOrder.orderType === 'delivery' && heldOrder.deliveryType && (
                            <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem', color: heldOrder.deliveryType === 'outsourced' ? '#ef4444' : '#10b981' }}>
                              ({heldOrder.deliveryType === 'self' ? '自送' : '外派'})
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '0.8rem', color: '#6b7280', marginBottom: '0.75rem' }}>
                          商品数：{heldOrder.items.length} 个
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
                            ✅ 取单
                          </button>
                          <button
                            onClick={() => {
                              if (window.confirm(`确定要删除桌${heldOrder.tableNumber}的挂单吗？`)) {
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
          <div style={{ width: '400px', backgroundColor: 'white', borderRadius: '0.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '0.75rem', borderBottom: '1px solid #e5e7eb', flexShrink: 0 }}>
              <h3 style={{ fontSize: '1rem', fontWeight: '600', color: '#374151', margin: 0, marginBottom: '0.75rem' }}>📋 订单列表</h3>
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                <button
                  onClick={() => setOrderTypeFilter('all')}
                  style={{
                    flex: 1,
                    padding: '0.4rem',
                    backgroundColor: orderTypeFilter === 'all' ? '#3b82f6' : '#f3f4f6',
                    color: orderTypeFilter === 'all' ? 'white' : '#374151',
                    border: 'none',
                    borderRadius: '0.25rem',
                    fontWeight: '600',
                    cursor: 'pointer',
                    fontSize: '0.75rem'
                  }}
                >
                  全部
                </button>
                <button
                  onClick={() => setOrderTypeFilter('dine_in')}
                  style={{
                    flex: 1,
                    padding: '0.4rem',
                    backgroundColor: orderTypeFilter === 'dine_in' ? '#10b981' : '#f3f4f6',
                    color: orderTypeFilter === 'dine_in' ? 'white' : '#374151',
                    border: 'none',
                    borderRadius: '0.25rem',
                    fontWeight: '600',
                    cursor: 'pointer',
                    fontSize: '0.75rem'
                  }}
                >
                  🍽️ 堂食
                </button>
                <button
                  onClick={() => setOrderTypeFilter('takeout')}
                  style={{
                    flex: 1,
                    padding: '0.4rem',
                    backgroundColor: orderTypeFilter === 'takeout' ? '#f59e0b' : '#f3f4f6',
                    color: orderTypeFilter === 'takeout' ? 'white' : '#374151',
                    border: 'none',
                    borderRadius: '0.25rem',
                    fontWeight: '600',
                    cursor: 'pointer',
                    fontSize: '0.75rem'
                  }}
                >
                  🥡 打包
                </button>
                <button
                  onClick={() => setOrderTypeFilter('delivery')}
                  style={{
                    flex: 1,
                    padding: '0.4rem',
                    backgroundColor: orderTypeFilter === 'delivery' ? '#8b5cf6' : '#f3f4f6',
                    color: orderTypeFilter === 'delivery' ? 'white' : '#374151',
                    border: 'none',
                    borderRadius: '0.25rem',
                    fontWeight: '600',
                    cursor: 'pointer',
                    fontSize: '0.75rem'
                  }}
                >
                  🚚 外卖
                </button>
              </div>

              <div style={{ marginTop: '0.75rem', padding: '0.75rem', backgroundColor: '#f9fafb', borderRadius: '0.375rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '0.85rem', color: '#6b7280' }}>订单总数：</span>
                  <span style={{ fontSize: '0.85rem', fontWeight: '600', color: '#374151' }}>{filteredOrders.length} 单</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '0.85rem', color: '#6b7280' }}>草稿/待确认：</span>
                  <span style={{ fontSize: '0.85rem', fontWeight: '600', color: '#f59e0b' }}>
                    {filteredOrders.filter(o => o.status === 'draft').length} 单
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '0.85rem', color: '#6b7280' }}>制作中：</span>
                  <span style={{ fontSize: '0.85rem', fontWeight: '600', color: '#3b82f6' }}>
                    {filteredOrders.filter(o => o.status === 'preparing' || o.status === 'confirmed').length} 单
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '0.5rem', borderTop: '1px solid #e5e7eb' }}>
                  <span style={{ fontSize: '0.85rem', color: '#6b7280' }}>总金额：</span>
                  <span style={{ fontSize: '1rem', fontWeight: 'bold', color: '#2563eb' }}>
                    C${filteredOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0).toFixed(2)}
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

                  // 鎵撳寘鍜屽鍗栦篃闇€瑕侀€夋嫨椤惧
                  if (newOrderType !== 'dine_in') {
                    console.log('takeout/delivery order, opening customer selector');
                    setShowCustomerModal(true);
                  } else {
                    setViewMode('order');
                  }
                }}
                style={{
                  width: '100%',
                  padding: '0.6rem',
                  backgroundColor: '#3b82f6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.25rem',
                  fontWeight: '600',
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                  marginTop: '0.5rem'
                }}
              >
                ➕ 新建{orderTypeFilter === 'all' ? '订单' : orderTypeFilter === 'dine_in' ? '堂食订单' : orderTypeFilter === 'takeout' ? '打包订单' : '外卖订单'}
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '0.75rem' }}>
              {filteredOrders.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: '#9ca3af' }}>
                  暂无订单
                </div>
              ) : (
                filteredOrders.map(order => (
                  <div
                    key={order.id}
                    onClick={() => handleOrderClick(order)}
                    style={{
                      backgroundColor: getStatusColor(order.status, order.paymentStatus, order.clearedAt),
                      border: '2px solid #e5e7eb',
                      borderRadius: '0.5rem',
                      padding: '0.75rem',
                      marginBottom: '0.75rem',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                      <div style={{ fontSize: '0.95rem', fontWeight: 'bold', color: '#374151', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        #{order.orderNumber || 'N/A'}
                        {/* 鉁?鏀粯鐘舵€佹爣璇?*/}
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
                        borderRadius: '0.25rem',
                        fontSize: '0.75rem',
                        fontWeight: '600',
                        color: '#374151'
                      }}>
                        {getStatusText(order.status, order.paymentStatus, order.clearedAt)}
                      </div>
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#6b7280', marginBottom: '0.25rem' }}>
                      {order.orderType === 'dine_in' ? (
                        // 鍫傞锛氭樉绀烘鍙?
                        <>堂食 | 桌{order.tableNumber}</>
                      ) : order.orderType === 'takeout' ? (
                        // 鎵撳寘锛氬彧鏄剧ず鎵撳寘
                        <>🥡 打包</>
                      ) : (
                        // 澶栧崠锛氬彧鏄剧ず澶栧崠
                        <>🚚 外卖</>
                      )}
                    </div>
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
                            alert('请先完成支付，再点击完成订单扣减库存');
                            handleOrderClick(order);
                            return;
                          }

                          if (window.confirm(`确认${order.orderType === 'takeout' ? '顾客已取餐' : '外卖订单已完成'}？\n\n点击确定后订单完成，并扣减库存。`)) {
                            try {
                              await completeOrderWithStockDeduction(order);
                              alert('✅ 订单已完成，库存已扣减');
                            } catch (error) {
                              console.error('complete order sync failed:', order.id, error);
                              alert('完成订单同步失败，请检查网络后重试');
                            }
                          }
                        }}
                        style={{
                          width: '100%',
                          padding: '0.55rem 0.75rem',
                          margin: '0.45rem 0 0.6rem 0',
                          backgroundColor: order.paymentStatus === 'paid' || order.status === 'served' ? '#16a34a' : '#f59e0b',
                          color: 'white',
                          border: 'none',
                          borderRadius: '0.375rem',
                          cursor: 'pointer',
                          fontSize: '0.9rem',
                          fontWeight: '700',
                          boxShadow: '0 1px 2px rgba(0,0,0,0.12)'
                        }}
                      >
                        {order.paymentStatus === 'paid' || order.status === 'served'
                          ? (order.orderType === 'takeout' ? '✅ 顾客已取餐，完成订单' : '✅ 外卖已完成，完成订单')
                          : '💳 先支付后完成订单'}
                      </button>
                    )}

                    {/* 鉁?瀹屾暣鏃堕棿鏄剧ず锛氫笅鍗曘€佷氦浠樸€佸畬鎴?*/}
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '0.3rem',
                      padding: '0.4rem 0',
                      marginBottom: '0.5rem',
                      fontSize: '0.85rem'
                    }}>
                      {/* 涓嬪崟鏃堕棿 */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                        <span style={{ color: '#6b7280', fontSize: '0.75rem' }}>下单</span>
                        <span style={{
                          fontWeight: 'bold',
                          fontFamily: 'monospace',
                          fontSize: '0.9rem',
                          color: '#d97706'
                        }}>
                          {formatOrderTime(order.createdAt || order.preparingAt || order.completedAt || order.lastModified)}
                        </span>
                      </div>

                      {/* 浜や粯鏃堕棿 */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                        <span style={{ color: '#6b7280', fontSize: '0.75rem' }}>交付</span>
                        <span style={{
                          fontWeight: 'bold',
                          fontFamily: 'monospace',
                          fontSize: '0.9rem',
                          color: order.servedAt ? '#059669' : '#d1d5db'
                        }}>
                          {formatOrderTime(order.servedAt)}
                        </span>
                      </div>

                      {/* 瀹屾垚鏃堕棿 */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                        <span style={{ color: '#6b7280', fontSize: '0.75rem' }}>完成</span>
                        <span style={{
                          fontWeight: 'bold',
                          fontFamily: 'monospace',
                          fontSize: '0.9rem',
                          color: order.completedAt ? '#2563eb' : '#d1d5db'
                        }}>
                          {formatOrderTime(order.completedAt)}
                        </span>
                      </div>
                    </div>

                    {order.paymentStatus === 'partial' && order.paidAmount > 0 && (
                      <div style={{
                        padding: '0.4rem 0.6rem',
                        backgroundColor: '#fef3c7',
                        borderRadius: '0.25rem',
                        marginBottom: '0.5rem',
                        fontSize: '0.8rem'
                      }}>
                        已付: C${order.paidAmount.toFixed(2)} / C${order.totalAmount.toFixed(2)}
                        <span style={{ color: '#f59e0b', fontWeight: '600', marginLeft: '0.5rem' }}>
                          (还差 C${(order.totalAmount - order.paidAmount).toFixed(2)})
                        </span>
                      </div>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontSize: '0.85rem', color: '#374151' }}>
                        {order.items?.length || 0} 项商品
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
                {editingTable ? '编辑桌子' : '添加桌子'}
              </h3>
              <input
                type="text"
                value={newTableName}
                onChange={(e) => setNewTableName(e.target.value)}
                placeholder="输入桌子名称"
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
                  取消
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
                  {editingTable ? '保存' : '添加'}
                </button>
              </div>
            </div>
          </div>
        )}

        {showTableActionModal && tableActionData && <TableActionModal />}

      </div>
      {showCancelModal && renderCancelModal()}

      {/* 椤惧閫夋嫨妯℃€佹 - 鏀惧湪鏈€澶栧眰锛屾墍鏈夎鍥鹃兘鍙互璁块棶 */}
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
              👤 选择顾客
            </h3>

            {!showNewCustomerForm ? (
              <>
                <input
                  type="text"
                  placeholder="搜索顾客姓名或电话..."
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
                            <div style={{ fontSize: '0.85rem', color: '#6b7280' }}>{customer.phone || '无电话'}</div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '0.85rem', color: '#f59e0b' }}>⭐ {customer.points} 积分</div>
                            <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>消费 {customer.visitCount} 次</div>
                          </div>
                        </div>
                      </div>
                    ))}

                  {customers.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '2rem', color: '#9ca3af' }}>
                      暂无顾客，请创建新顾客
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
                    ➕ 新建顾客
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
                    ⏭️ 跳过
                  </button>
                </div>
              </>
            ) : (
              <>
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>姓名 *</label>
                  <input
                    type="text"
                    value={newCustomerName}
                    onChange={(e) => setNewCustomerName(e.target.value)}
                    placeholder="请输入顾客姓名"
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '0.25rem',
                      fontSize: '0.9rem',
                      marginBottom: '1rem'
                    }}
                  />

                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>电话</label>
                  <input
                    type="tel"
                    value={newCustomerPhone}
                    onChange={(e) => setNewCustomerPhone(e.target.value)}
                    placeholder="请输入电话号码（可选）"
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
                    ✅ 创建
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
                    ↩️ 返回
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

