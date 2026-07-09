import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { dataService } from '../services/DataService';
import { dataManager } from '../services/dataManager';
import { smartAddDocument, smartGetDocuments, smartIncrementField, smartSubscribeToPosOrdersByDatePrefix, smartUpdateDocument } from '../services/smartSyncService';
import { uploadCachedMenuImage } from '../services/menuImageService';
import { getLocalDateString } from '../utils/localTime';
import { buildStockDeductionPlan, type StockDeductionRequest } from '../utils/stockDeduction';

// 库存物品接口
export interface InventoryItem {
  id: string;
  barcode: string;
  name: string;
  category: string;
  unit: string; // 基础单位（如：克、毫升）
  currentStock: number; // 当前库存（以基础单位计）
  minStock: number;
  costPrice: number;
  salePrice?: number;
  tags: string[];
  location?: string;
  lastUpdated: Date;

  // 单位换算支持
  purchaseUnit?: string; // 采购单位（如：KG、L）
  conversionRate?: number; // 换算率（如：1000 表示 1KG = 1000克）
}

// 菜品配方接口
export interface RecipeIngredient {
  itemId: string;
  itemName: string;
  quantity: number;
  unit: string;
}

export interface MenuItem {
  id: string;
  name: string;
  nameEs?: string;
  price: number;
  category: string;
  image?: string;
  imageUrl?: string;
  imageThumbUrl?: string;
  imageStoragePath?: string;
  imageThumbStoragePath?: string;
  imageUpdatedAt?: number;
  imageUploadPending?: boolean;
  type?: 'recipe' | 'direct'; // recipe=需要配方，direct=直接扣库存
  stockItemId?: string; // 直接扣库存时关联的库存物品ID
  ingredients?: RecipeIngredient[]; // 配方模式时的原料列表
  available?: boolean;

  // 连锁店支持 - 每个分店完全独立
  storeId?: string; // 关联到具体分店（可选，兼容旧数据）
}

// 采购单接口
export interface PurchaseOrder {
  id: string;
  orderNumber: string;
  supplierId: string;
  supplierName: string;
  items: {
    itemId: string;
    itemName: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
  }[];
  totalAmount: number;
  paidAmount: number;
  paymentType: 'cash' | 'credit';
  status: 'pending' | 'partial' | 'completed';
  orderDate: Date;
  receivedDate?: Date;
  notes?: string;
  invoiceNumber?: string;
  invoiceImage?: string;
}

// 供应商接口
export interface Supplier {
  id: string;
  name: string;
  contact: string;
  phone: string;
  address: string;
  balance: number;
  status: 'active' | 'inactive';
  lastUpdated: Date;
}

// 冰箱接口
export interface Fridge {
  id: string;
  name: string;  // 如："1号冰箱"、"吧台冰箱"
  location?: string;  // 位置描述
  createdAt: Date;
}

// 冰箱库存接口
export interface FridgeInventory {
  id?: string; // 🔥 添加 ID 字段（用于 Firestore 同步）
  fridgeId: string;
  itemId: string;
  quantity: number;  // 该冰箱中该商品的数量
  sortOrder?: number;
  lastModified?: number; // 🔥 添加时间戳（用于多设备同步）
}

// 订单项目
export interface OrderItem {
  id?: string;
  menuItemId: string;
  name: string;
  quantity: number;
  price: number;
  subtotal: number;
  type?: 'recipe' | 'direct';
  stockItemId?: string;
  ingredients?: RecipeIngredient[];
}

// 订单接口
export interface Order {
  id: string;
  orderNumber?: string;
  tableId: string;
  tableNumber: string;
  orderType: 'dine_in' | 'takeout' | 'delivery';
  customerId?: string;
  customerName?: string;
  items: OrderItem[];
  status: 'draft' | 'confirmed' | 'preparing' | 'served' | 'completed' | 'cancelled';
  createdAt: Date;
  confirmedAt?: Date;
  completedAt?: Date;
  clearedAt?: Date;
  totalAmount: number;
  paidAmount: number;
  paymentStatus: 'unpaid' | 'partial' | 'paid';
  lastPaidAt?: Date;
  settledAmount: number;
  paymentMethod?: 'cash' | 'card' | 'mixed';
  cashAmount?: number;
  cardAmount?: number;
}

interface StockDeductionSource {
  operationId?: string;
  orderId?: string;
  orderNumber?: string;
  orderType?: Order['orderType'];
  completedAt?: Date;
}

interface AppContextType {
  // 库存
  inventoryItems: InventoryItem[];
  setInventoryItems: React.Dispatch<React.SetStateAction<InventoryItem[]>>;

  // 菜单
  menuItems: MenuItem[];
  setMenuItems: React.Dispatch<React.SetStateAction<MenuItem[]>>;

  // 菜品分类（从 menuItems 中动态提取）
  categories: string[];
  setCategories: React.Dispatch<React.SetStateAction<string[]>>;

  // 采购
  purchaseOrders: PurchaseOrder[];
  setPurchaseOrders: React.Dispatch<React.SetStateAction<PurchaseOrder[]>>;

  // 供应商
  suppliers: Supplier[];
  setSuppliers: React.Dispatch<React.SetStateAction<Supplier[]>>;

  // 冰箱管理
  fridges: Fridge[];
  setFridges: React.Dispatch<React.SetStateAction<Fridge[]>>;

  // 冰箱库存
  fridgeInventory: FridgeInventory[];
  setFridgeInventory: React.Dispatch<React.SetStateAction<FridgeInventory[]>>;

  // 订单（全系统共享）
  orders: Order[];
  setOrders: React.Dispatch<React.SetStateAction<Order[]>>;

  // 扣减库存（销售时调用）
  deductStock: (orderItems: OrderItem[], source?: StockDeductionSource) => Promise<void>;

  // 增加库存（采购入库时调用）
  addStock: (itemId: string, quantity: number) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const getTodayOrderPrefix = (): string => {
  const today = getLocalDateString();
  return `${today.slice(5, 7)}${today.slice(8, 10)}`;
};

const isOrderFromPrefix = (order: Partial<Order>, orderPrefix: string): boolean => {
  return String(order?.orderNumber || '').startsWith(orderPrefix);
};

const getActiveStoreId = (): string | null => {
  try {
    const currentUser = localStorage.getItem('current_user');
    if (!currentUser) return null;
    const parsed = JSON.parse(currentUser);
    return parsed.storeId || null;
  } catch {
    return null;
  }
};

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [activeStoreId, setActiveStoreId] = useState<string | null>(() => getActiveStoreId());
  const [currentOrderPrefix, setCurrentOrderPrefix] = useState(() => getTodayOrderPrefix());

  // 🔥 监听用户登录，重新加载分店专属数据
  useEffect(() => {
    const checkUserAndReload = () => {
      const currentUser = localStorage.getItem('current_user');
      const nextStoreId = getActiveStoreId();
      setActiveStoreId(prev => prev === nextStoreId ? prev : nextStoreId);

      if (currentUser) {

        // 重新加载库存数据
        const inventoryData = dataService.getData('inventory_items');
        if (inventoryData.length > 0) {
          setInventoryItems(inventoryData);
        }

        // 重新加载菜单数据
        const menuData = dataService.getData('menu_items');
        if (menuData.length > 0) {
          setMenuItems(menuData);
        }

        // 重新加载订单数据
        const ordersData = dataService.getData('pos_orders');
        if (ordersData.length > 0) {
          setOrders(ordersData);
        }

        const purchaseData = dataService.getData('purchase_orders');
        if (purchaseData.length > 0) {
          setPurchaseOrders(purchaseData);
        }

        const supplierData = dataService.getData('suppliers');
        if (supplierData.length > 0) {
          setSuppliers(supplierData);
        }

        const fridgesData = dataService.getData('fridges');
        if (fridgesData.length > 0) {
          setFridges(fridgesData);
        }

        const fridgeInventoryData = dataService.getData('fridge_inventory');
        if (fridgeInventoryData.length > 0) {
          setFridgeInventory(fridgeInventoryData);
        }
      }
    };

    // 初始检查
    checkUserAndReload();

    // 监听 storage 事件（其他标签页登录）
    window.addEventListener('storage', checkUserAndReload);

    // 监听自定义事件（当前标签页登录）
    window.addEventListener('userLoggedIn', checkUserAndReload);

    // 🔥 监听数据同步完成事件
    window.addEventListener('dataSynced', checkUserAndReload);

    return () => {
      window.removeEventListener('storage', checkUserAndReload);
      window.removeEventListener('userLoggedIn', checkUserAndReload);
      window.removeEventListener('dataSynced', checkUserAndReload);
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setCurrentOrderPrefix(prev => {
        const next = getTodayOrderPrefix();
        return prev === next ? prev : next;
      });
    }, 60000);

    return () => window.clearInterval(timer);
  }, []);

  // 🔥 标记是否已经加载过真实数据
  const [, setHasLoadedRealData] = useState(false);

  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>(() => {
    try {
      // 🔥 使用 dataService 读取数据（支持分店隔离）
      const items = dataService.getData('inventory_items');
      if (items.length > 0) {
        setHasLoadedRealData(true); // 标记已加载真实数据
        return items;
      }
    } catch (error) {
      console.error('加载库存数据失败:', error);
    }

    // 🔥 只有在没有任何数据时才返回默认值
    return [];
  });

  // 初始化菜单数据（从 localStorage 加载）
  const [menuItems, setMenuItems] = useState<MenuItem[]>(() => {
    try {
      // 🔥 使用 dataService 读取数据（支持分店隔离）
      const items = dataService.getData('menu_items');
      if (items.length > 0) {
        setHasLoadedRealData(true);
        return items;
      }
    } catch (error) {
      console.error('加载菜单数据失败:', error);
    }

    // 🔥 只有在没有任何数据时才返回默认值
    return [];
  });

  // 菜品分类管理（从 menuItems 中动态提取）
  const [categories, setCategories] = useState<string[]>(() => {
    const uniqueCategories = Array.from(new Set(menuItems.map(item => item.category)));
    return uniqueCategories;
  });

  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>(() => {
    try {
      const saved = dataService.getData('purchase_orders');
      if (saved.length > 0) {
        return saved;
      }
    } catch (error) {
      console.error('加载采购订单失败:', error);
    }
    return [];
  });

  const [suppliers, setSuppliers] = useState<Supplier[]>(() => {
    try {
      const saved = dataService.getData('suppliers');
      if (saved.length > 0) {
        return saved;
      }
    } catch (error) {
      console.error('加载供应商数据失败:', error);
    }
    // 默认值
    return [];
  });

  // 初始化冰箱数据（从 DataService 加载）
  const [fridges, setFridges] = useState<Fridge[]>(() => {
    try {
      const saved = dataService.getData('fridges');
      if (saved.length > 0) {
        return saved;
      }
    } catch (error) {
      console.error('加载冰箱数据失败:', error);
    }

    // 默认值：创建两个示例冰箱
    return [];
  });

  // 初始化冰箱库存数据（从 DataService 加载）
  const [fridgeInventory, setFridgeInventory] = useState<FridgeInventory[]>(() => {
    try {
      const saved = dataService.getData('fridge_inventory');
      if (saved.length > 0) {
        return saved;
      }
    } catch (error) {
      console.error('加载冰箱库存数据失败:', error);
    }

    // 默认值
    return [];
  });

  // 初始化订单数据（从 localStorage 加载）
  const [orders, setOrders] = useState<Order[]>(() => {
    try {
      // 🔥 使用 dataService 读取数据（支持分店隔离）
      const items = dataService.getData('pos_orders');
      if (items.length > 0) {
        return items;
      }
    } catch (error) {
      console.error('加载订单数据失败:', error);
    }
    return [];
  });

  const getSyncVersion = useCallback((record: any): number => {
    if (!record) return 0;
    const candidates = [
      record.lastModified,
      record.lastUpdated,
      record.createdAt,
    ];

    for (const value of candidates) {
      if (!value) continue;
      if (typeof value === 'number' && Number.isFinite(value)) return value;
      if (value instanceof Date) return value.getTime();
      if (typeof value === 'object' && typeof value.seconds === 'number') {
        return value.seconds * 1000 + Math.floor((value.nanoseconds || 0) / 1000000);
      }
      const parsed = new Date(value).getTime();
      if (!Number.isNaN(parsed)) return parsed;
    }

    return 0;
  }, []);

  const getPaymentRank = useCallback((paymentStatus?: string): number => {
    switch (paymentStatus) {
      case 'paid': return 3;
      case 'partial': return 2;
      case 'refunded': return 1;
      case 'unpaid':
      default: return 0;
    }
  }, []);

  const getOrderStatusRank = useCallback((status?: string): number => {
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
  }, []);

  const isTerminalOrderStatus = useCallback((status?: string): boolean => {
    return status === 'completed' || status === 'cancelled';
  }, []);

  const isCloudTerminalAdvance = useCallback((localItem: any, cloudItem: any): boolean => {
    return isTerminalOrderStatus(cloudItem.status) && !isTerminalOrderStatus(localItem.status);
  }, [isTerminalOrderStatus]);

  const isOrderStateRegression = useCallback((localItem: any, cloudItem: any): boolean => {
    const localLooksLikeOrder = 'paymentStatus' in localItem || 'status' in localItem || 'items' in localItem;
    const cloudLooksLikeOrder = 'paymentStatus' in cloudItem || 'status' in cloudItem || 'items' in cloudItem;
    if (!localLooksLikeOrder || !cloudLooksLikeOrder) return false;

    if (localItem.stockDeducted && !cloudItem.stockDeducted) return true;
    if (localItem.clearedAt && !cloudItem.clearedAt) return true;

    const localStatusRank = getOrderStatusRank(localItem.status);
    const cloudStatusRank = getOrderStatusRank(cloudItem.status);
    if (localStatusRank > cloudStatusRank && ['completed', 'cancelled'].includes(localItem.status)) {
      return true;
    }

    const localPaymentRank = getPaymentRank(localItem.paymentStatus);
    const cloudPaymentRank = getPaymentRank(cloudItem.paymentStatus);
    if (localPaymentRank > cloudPaymentRank) {
      return true;
    }

    return false;
  }, [getOrderStatusRank, getPaymentRank]);

  const shouldUseCloudItem = useCallback(<T extends { id?: string }>(localItem: T, cloudItem: T): boolean => {
    if (isCloudTerminalAdvance(localItem, cloudItem)) {
      return true;
    }

    if (isOrderStateRegression(localItem, cloudItem)) {
      return false;
    }

    return getSyncVersion(cloudItem) >= getSyncVersion(localItem);
  }, [getSyncVersion, isCloudTerminalAdvance, isOrderStateRegression]);

  const mergeCloudDataByVersion = useCallback(<T extends { id?: string }>(localData: T[], cloudData: T[]): T[] => {
    const merged = new Map<string, T>();

    localData.forEach(item => {
      if (item?.id) {
        merged.set(String(item.id), item);
      }
    });

    cloudData.forEach(cloudItem => {
      if (!cloudItem?.id) return;
      const id = String(cloudItem.id);
      const localItem = merged.get(id);

      if (!localItem || shouldUseCloudItem(localItem, cloudItem)) {
        merged.set(id, cloudItem);
      }
    });

    return Array.from(merged.values());
  }, [shouldUseCloudItem]);

  useEffect(() => {
    const applyCloudData = <T extends { id?: string }>(
      data: T[],
      setter: React.Dispatch<React.SetStateAction<T[]>>,
      label: string,
      options: { merge?: boolean } = {}
    ) => {
      if (Array.isArray(data)) {
        setter(prev => {
          const mergedData = options.merge ? mergeCloudDataByVersion(prev, data) : data;
          if (JSON.stringify(prev) === JSON.stringify(mergedData)) {
            return prev;
          }
          return mergedData;
        });
      }
    };

    if (!activeStoreId) {
      return;
    }

    let cancelled = false;

    const loadSnapshotData = async () => {
      const snapshotLoads: Array<{
        name: string;
        setter: React.Dispatch<React.SetStateAction<any[]>>;
        label: string;
      }> = [
        { name: 'menu_items', setter: setMenuItems, label: '菜单' },
        { name: 'inventory_items', setter: setInventoryItems, label: '库存' },
        { name: 'purchase_orders', setter: setPurchaseOrders, label: '采购订单' },
        { name: 'suppliers', setter: setSuppliers, label: '供应商' },
        { name: 'fridges', setter: setFridges, label: '冰箱' },
        { name: 'fridge_inventory', setter: setFridgeInventory, label: '冰箱库存' },
      ];

      for (const config of snapshotLoads) {
        try {
          const data = await smartGetDocuments(config.name, true);
          if (!cancelled) {
            applyCloudData(data, config.setter, config.label);
          }
        } catch (error) {
          console.error(`加载 ${config.name} 失败:`, error);
        }
      }
    };

    loadSnapshotData();

    const todayOrderPrefix = currentOrderPrefix;
    const unsubscribers = [
      smartSubscribeToPosOrdersByDatePrefix(todayOrderPrefix, data => {
        if (!data || data.length === 0) {
          console.warn('AppContext received empty current-day POS order snapshot; preserving local orders.');
          return;
        }
        setOrders(prevOrders => {
          const nextOrders = [
            ...prevOrders.filter(order => !isOrderFromPrefix(order, todayOrderPrefix)),
            ...(data as Order[]),
          ];
          if (JSON.stringify(prevOrders) === JSON.stringify(nextOrders)) {
            return prevOrders;
          }
          return nextOrders;
        });
      }),
    ];
    return () => {
      cancelled = true;
      unsubscribers.forEach(unsubscribe => unsubscribe());
    };
  }, [activeStoreId, currentOrderPrefix, mergeCloudDataByVersion]);

  // 扣减库存
  const getFridgeDeductionKey = (fridgeId: string, itemId: string) => JSON.stringify([fridgeId, itemId]);
  const parseFridgeDeductionKey = (key: string): [string, string] => {
    try {
      const parsed = JSON.parse(key);
      if (Array.isArray(parsed) && parsed.length === 2) {
        return [String(parsed[0]), String(parsed[1])];
      }
    } catch {
      // fall through to legacy parsing
    }
    const lastDash = key.lastIndexOf('-');
    return lastDash === -1
      ? [key, '']
      : [key.slice(0, lastDash), key.slice(lastDash + 1)];
  };

  const deductStock = async (orderItems: OrderItem[], source?: StockDeductionSource) => {

    const [cloudMenuItems, cloudInventoryItems, cloudFridgeInventory] = await Promise.all([
      smartGetDocuments('menu_items', true),
      smartGetDocuments('inventory_items', true),
      smartGetDocuments('fridge_inventory', true)
    ]);

    const effectiveMenuItems = (cloudMenuItems.length > 0 ? cloudMenuItems : menuItems) as MenuItem[];
    const effectiveInventoryItems = (cloudInventoryItems.length > 0 ? cloudInventoryItems : inventoryItems) as InventoryItem[];
    const effectiveFridgeInventory = (cloudFridgeInventory.length > 0 ? cloudFridgeInventory : fridgeInventory) as FridgeInventory[];

    if (effectiveInventoryItems.length === 0) {
      const needsInventory = orderItems.some(item =>
        item.stockItemId ||
        (item.ingredients && item.ingredients.length > 0) ||
        effectiveMenuItems.some(menu =>
          menu.id === item.menuItemId &&
          (menu.stockItemId || (menu.ingredients && menu.ingredients.length > 0))
        )
      );
      if (needsInventory) {
        throw new Error('库存数据未加载，已阻止订单标记为已扣库存');
      }
    }

    // ✅ 先计算所有需要扣减的数量（不立即更新状态）
    const fridgeDeductionsMap: Map<string, number> = new Map(); // key: "fridgeId-itemId", value: deductQty
    const warehouseDeductionsMap: Map<string, number> = new Map(); // key: itemId, value: deductQty
    const stockDeductionRequests: StockDeductionRequest[] = [];

    const planStockDeduction = (stockItem: InventoryItem, requiredQuantity: number) => {
      if (requiredQuantity <= 0) return;
      stockDeductionRequests.push({ itemId: stockItem.id, quantity: requiredQuantity });
    };

    orderItems.forEach(orderItem => {
      const menuItem = effectiveMenuItems.find(m => m.id === orderItem.menuItemId);
      const ingredients = menuItem?.ingredients || orderItem.ingredients || [];
      const stockItemId = menuItem?.stockItemId || orderItem.stockItemId;

      if (!menuItem && ingredients.length === 0 && !stockItemId) {
        console.warn('⚠️ 未找到菜单项:', orderItem.menuItemId);
        return;
      }


      // 根据 type 决定扣库存方式（兼容旧数据）
      let deductionType: string = menuItem?.type || orderItem.type || (stockItemId ? 'direct' : 'recipe'); // 默认需要配方
      // 兼容旧数据：dish -> recipe, beverage/alcohol -> direct
      if (deductionType === 'dish') deductionType = 'recipe';
      if (deductionType === 'beverage' || deductionType === 'alcohol') deductionType = 'direct';


      if (deductionType === 'recipe' && ingredients.length > 0) {
        // 配方模式：扣减原料
        ingredients.forEach(ing => {
          const stockItem = effectiveInventoryItems.find(i => i.id === ing.itemId);
          if (!stockItem) {
            console.warn('  ❌ 未找到库存物品 ID:', ing.itemId);
            return;
          }

          const deductQuantity = ing.quantity * orderItem.quantity;

          // 单位换算：将配方单位转换为库存基础单位
          let finalDeductQuantity = deductQuantity;

          // 如果配方指定了单位，且与库存单位不同，需要转换
          if (ing.unit && stockItem.unit && ing.unit !== stockItem.unit) {
            // 情况1：配方单位是克，库存单位是KG -> 克转KG：除以1000
            if (ing.unit === '克' && stockItem.unit === 'KG') {
              finalDeductQuantity = deductQuantity / 1000;
            }
            // 情况2：配方单位是KG，库存单位是克 -> KG转克：乘以1000
            else if (ing.unit === 'KG' && stockItem.unit === '克') {
              finalDeductQuantity = deductQuantity * 1000;
            }
            // 情况3：使用conversionRate进行通用转换
            else if (stockItem.conversionRate) {
              // 假设配方的unit是采购单位，库存unit是基础单位
              finalDeductQuantity = deductQuantity * stockItem.conversionRate;
            }
          }


          planStockDeduction(stockItem, finalDeductQuantity);
        });
      } else if (deductionType === 'direct' && stockItemId) {
        // 直接扣库存模式 - 优先从冰箱扣减
        const stockItem = effectiveInventoryItems.find(i => i.id === stockItemId);
        if (!stockItem) {
          console.warn('  ❌ 未找到库存物品 ID:', stockItemId);
          return;
        }

        planStockDeduction(stockItem, orderItem.quantity);
      } else {
        console.warn('⚠️ 菜品没有可扣减的库存配置:', {
          menuItemId: orderItem.menuItemId,
          name: orderItem.name,
          deductionType,
          stockItemId,
          ingredients: ingredients.length
        });
      }
    });

    const stockDeductionPlan = buildStockDeductionPlan({
      requests: stockDeductionRequests,
      inventoryItems: effectiveInventoryItems,
      fridgeInventory: effectiveFridgeInventory,
    });

    stockDeductionPlan.fridgeDeductions.forEach(deduction => {
      const mapKey = getFridgeDeductionKey(deduction.fridgeId, deduction.itemId);
      fridgeDeductionsMap.set(mapKey, (fridgeDeductionsMap.get(mapKey) || 0) + deduction.quantity);
    });
    stockDeductionPlan.warehouseDeductions.forEach(deduction => {
      warehouseDeductionsMap.set(deduction.itemId, (warehouseDeductionsMap.get(deduction.itemId) || 0) + deduction.quantity);
    });

    const stockWriteTasks: Promise<any>[] = [];
    const sourceOperationId = source?.operationId || `sale-stock-${Date.now()}`;
    const stockDeductedAt = source?.completedAt ? new Date(source.completedAt) : new Date();
    const stockDeductedAtMs = stockDeductedAt.getTime();

    // ✅ 先同步云端/离线队列，成功或已进入待同步队列后再更新本地状态
    if (fridgeDeductionsMap.size > 0) {
      fridgeDeductionsMap.forEach((deductQty, key) => {
        const [fridgeId, itemId] = parseFridgeDeductionKey(key);
        const currentInv = effectiveFridgeInventory.find(
          inv => inv.fridgeId === fridgeId && inv.itemId === itemId
        );
        if (!currentInv) return;
        const recordId = currentInv.id || `${currentInv.fridgeId}-${currentInv.itemId}`;
        const stockItem = effectiveInventoryItems.find(item => item.id === itemId);
        stockWriteTasks.push(
          smartIncrementField('fridge_inventory', recordId, 'quantity', -deductQty, {
            fridgeId: currentInv.fridgeId,
            itemId: currentInv.itemId,
            lastModified: stockDeductedAtMs,
            syncOperationId: `${sourceOperationId}-fridge-${recordId}`
          }).then(async result => {
            if (result?.error) {
              throw new Error(`冰箱库存扣减失败: ${recordId} ${result.error}`);
            }
            const beforeStock = Number(currentInv.quantity || 0);
            const stockRecord = {
              id: `${sourceOperationId}-fridge-${recordId}`,
              itemId,
              itemName: stockItem?.name || itemId,
              type: 'out',
              quantity: deductQty,
              signedQuantity: -deductQty,
              reason: 'pos sale',
              source: 'pos_sale',
              sourceId: sourceOperationId,
              orderId: source?.orderId,
              orderNumber: source?.orderNumber,
              orderType: source?.orderType,
              locationType: 'fridge',
              fridgeId: currentInv.fridgeId,
              beforeStock,
              afterStock: beforeStock - deductQty,
              unit: stockItem?.unit || '',
              date: stockDeductedAt,
              createdAt: stockDeductedAt,
              createdAtMs: stockDeductedAtMs,
              lastModified: stockDeductedAtMs,
              operator: 'pos'
            };
            const stockRecordResult: any = await smartAddDocument('inventory_stock_records', stockRecord);
            if (stockRecordResult?.error) {
              throw new Error(`库存流水写入失败: ${stockRecord.id} ${stockRecordResult.error}`);
            }
          })
        );
      });
    }

    if (warehouseDeductionsMap.size > 0) {
      warehouseDeductionsMap.forEach((deductQty, itemId) => {
        const item = effectiveInventoryItems.find(stockItem => stockItem.id === itemId);
        if (!item || deductQty <= 0) return;
        stockWriteTasks.push(
          smartIncrementField('inventory_items', item.id, 'currentStock', -deductQty, {
            lastModified: stockDeductedAtMs,
            lastUpdated: stockDeductedAt,
            syncOperationId: `${sourceOperationId}-warehouse-${item.id}`
          }).then(async result => {
            if (result?.error) {
              throw new Error(`仓库库存扣减失败: ${item.name} ${result.error}`);
            }
            const beforeStock = Number(item.currentStock || 0);
            const stockRecord = {
              id: `${sourceOperationId}-warehouse-${item.id}`,
              itemId: item.id,
              itemName: item.name,
              type: 'out',
              quantity: deductQty,
              signedQuantity: -deductQty,
              reason: 'pos sale',
              source: 'pos_sale',
              sourceId: sourceOperationId,
              orderId: source?.orderId,
              orderNumber: source?.orderNumber,
              orderType: source?.orderType,
              locationType: 'warehouse',
              beforeStock,
              afterStock: beforeStock - deductQty,
              unit: item.unit || '',
              date: stockDeductedAt,
              createdAt: stockDeductedAt,
              createdAtMs: stockDeductedAtMs,
              lastModified: stockDeductedAtMs,
              operator: 'pos'
            };
            const stockRecordResult: any = await smartAddDocument('inventory_stock_records', stockRecord);
            if (stockRecordResult?.error) {
              throw new Error(`库存流水写入失败: ${stockRecord.id} ${stockRecordResult.error}`);
            }
          })
        );
      });
    }

    await Promise.all(stockWriteTasks);

    if (fridgeDeductionsMap.size > 0) {
      setFridgeInventory(effectiveFridgeInventory.map(inv => {
        const mapKey = getFridgeDeductionKey(inv.fridgeId, inv.itemId);
        const deductQty = fridgeDeductionsMap.get(mapKey) || 0;
        if (deductQty <= 0) return inv;
        return {
          ...inv,
          id: inv.id || `${inv.fridgeId}-${inv.itemId}`,
          quantity: Number(inv.quantity || 0) - deductQty,
          lastModified: Date.now()
        };
      }));
    }

    if (warehouseDeductionsMap.size > 0) {
      setInventoryItems(effectiveInventoryItems.map(item => {
        const deductQty = warehouseDeductionsMap.get(item.id) || 0;
        if (deductQty <= 0) return item;
        return {
          ...item,
          currentStock: Number(item.currentStock || 0) - deductQty,
          lastUpdated: new Date(),
          lastModified: Date.now()
        };
      }));
    }

  };

  // 增加库存
  const addStock = (itemId: string, quantity: number) => {
    setInventoryItems(items => {
      return items.map(item => {
        if (item.id === itemId) {
          const updatedItem = {
            ...item,
            currentStock: item.currentStock + quantity,
            lastUpdated: new Date(),
            lastModified: Date.now() // 🔥 添加时间戳
          };

          smartIncrementField('inventory_items', item.id, 'currentStock', quantity, {
            lastModified: updatedItem.lastModified,
            lastUpdated: updatedItem.lastUpdated
          }).catch(error => {
            console.error(`❌ 同步库存增加失败:`, error);
          });

          return updatedItem;
        }
        return item;
      });
    });
  };

  // Keep category state and the POS local mirror in sync without legacy cloud writes.
  useEffect(() => {
    if (menuItems.length > 0) {
      dataManager.saveData('menuItems', menuItems, { syncFirestore: false });
    }

    // 同步更新分类列表
    const uniqueCategories = Array.from(new Set(menuItems.map(item => item.category)));
    setCategories(uniqueCategories);
  }, [menuItems]);

  useEffect(() => {
    const syncPendingImages = async () => {
      if (!navigator.onLine) return;
      const pendingItems = menuItems.filter(item => item.imageUploadPending);
      if (pendingItems.length === 0) return;

      for (const item of pendingItems) {
        try {
          const imageFields = await uploadCachedMenuImage(item.id, item.imageUpdatedAt);
          const updatedMenu = {
            ...item,
            ...imageFields,
            lastModified: Date.now()
          };
          await smartUpdateDocument('menu_items', item.id, updatedMenu);
          setMenuItems(current => current.map(menu => menu.id === item.id ? updatedMenu : menu));
        } catch (error) {
          console.warn('待上传菜品图片同步失败:', item.id, error);
        }
      }
    };

    syncPendingImages();
    window.addEventListener('online', syncPendingImages);
    return () => window.removeEventListener('online', syncPendingImages);
  }, [menuItems]);

  // ❌ 移除自动保存（避免与实时监听形成循环）
  // ✅ 改为在 Inventory.tsx 中手动调用 smartAddDocument/smartUpdateDocument
  useEffect(() => {
    if (inventoryItems.length > 0) {
      try {
        const storeId = dataService.getCurrentStoreId();
        if (storeId) {
          localStorage.setItem(`store_${storeId}_inventory_items`, JSON.stringify(inventoryItems));
          localStorage.setItem(`store_${storeId}_inventory`, JSON.stringify(inventoryItems));
        }
      } catch (error) {
        console.error('cache inventory failed:', error);
      }
    }
  }, [inventoryItems]);

  // Keep purchase records available for local finance screens without legacy cloud writes.
  useEffect(() => {
    if (purchaseOrders.length > 0) {
      dataManager.saveData('purchases', purchaseOrders, { syncFirestore: false });
    }
  }, [purchaseOrders]);

  // ❌ 移除 pos_orders 的自动保存（避免与 POS.tsx 的实时监听形成死循环）
  // ✅ POS.tsx 已经通过 localStorage 保存，不需要在这里重复保存
  useEffect(() => {
    if (orders.length > 0) {
      dataManager.saveData('orders', orders, { syncFirestore: false, persistLocal: false });
    }

    // 触发自定义事件，通知其他模块
    window.dispatchEvent(new CustomEvent('posOrdersUpdated', { detail: orders }));
  }, [orders]);

  return (
    <AppContext.Provider value={{
      inventoryItems,
      setInventoryItems,
      menuItems,
      setMenuItems,
      categories,
      setCategories,
      purchaseOrders,
      setPurchaseOrders,
      suppliers,
      setSuppliers,
      fridges,
      setFridges,
      fridgeInventory,
      setFridgeInventory,
      orders,
      setOrders,
      deductStock,
      addStock
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
};
