import React, { useState, useEffect } from 'react';
import PurchaseManagement from './PurchaseManagement';
import { useAppContext } from '../../contexts/AppContext';
import { smartGetDocuments, smartGetDocumentsByDateRange, smartAddDocument, smartUpdateDocument, smartDeleteDocument, smartSetDocument } from '../../services/smartSyncService';
import { dataService } from '../../services/DataService';
import MenuImage from '../../components/MenuImage';
import { processAndUploadMenuImage } from '../../services/menuImageService';
import { colors, font, radii, shadows } from '../../styles/uiTokens';
import { buildLowStockSuggestions, isInventoryItemLowStock } from '../../utils/reorderSuggestions';
import { buildReplenishmentPurchaseDraft, type ReplenishmentPurchaseDraft } from '../../utils/purchaseReplenishment';
import { useI18n } from '../../i18n/I18nContext';
import type { TranslationKey } from '../../i18n/translations';
import { useAuth } from '../../contexts/AuthContext';
import { canAccessPermission } from '../../utils/permissions';

// 本地类型定义（与AppContext保持一致）
interface InventoryItem {
  id: string;
  barcode: string;
  name: string;
  category: string;
  unit: string;
  currentStock: number;
  minStock: number;
  costPrice: number;
  salePrice?: number;
  tags: string[];
  location?: string;
  preferredSupplierId?: string;
  preferredSupplierName?: string;
  lastUpdated: Date;
  lastModified?: number;
}

interface RecipeIngredient {
  itemId: string;
  itemName: string;
  quantity: number;
  unit: string;
}

interface MenuItem {
  id: string;
  name: string;
  nameEs?: string;
  price: number;
  category: string;
  type?: 'recipe' | 'direct'; // recipe=需要配方，direct=直接扣库存
  stockItemId?: string; // 直接扣库存时关联的库存物品ID
  ingredients?: RecipeIngredient[];
  available?: boolean;
  image?: string; // 菜品图片（Base64）
  imageUrl?: string;
  imageThumbUrl?: string;
  imageStoragePath?: string;
  imageThumbStoragePath?: string;
  imageUpdatedAt?: number;
  imageUploadPending?: boolean;  lastModified?: number;
}

interface StockRecord {
  id: string;
  itemId: string;
  itemName: string;
  type: 'in' | 'out' | 'adjust' | 'waste' | 'transfer';
  quantity: number;
  signedQuantity?: number;
  beforeStock?: number;
  afterStock?: number;
  reason: string;
  date: Date;
  createdAt?: any;
  createdAtMs?: number;
  lastModified?: number;
  operator: string;
  orderNumber?: string;
  source?: string;
  sourceId?: string;
  locationType?: 'warehouse' | 'fridge';
  fridgeId?: string;
  fridgeName?: string;
}

const isLegacyDemoStockRecord = (record: Partial<StockRecord>): boolean => {
  return record.id === 'rec1' || record.id === 'rec2';
};

const normalizeStockRecordDate = (...values: any[]): Date => {
  for (const value of values) {
    if (!value) continue;

    if (value?.toDate) {
      const date = value.toDate();
      if (Number.isFinite(date.getTime())) return date;
    }

    if (value instanceof Date && Number.isFinite(value.getTime())) return value;

    if (typeof value === 'number' && Number.isFinite(value)) {
      const date = new Date(value);
      if (Number.isFinite(date.getTime())) return date;
    }

    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [year, month, day] = value.split('-').map(Number);
      const localDate = new Date(year, month - 1, day);
      if (Number.isFinite(localDate.getTime())) return localDate;
    }

    if (typeof value === 'object') {
      const seconds = Number(value.seconds ?? value._seconds);
      if (Number.isFinite(seconds)) {
        const nanoseconds = Number(value.nanoseconds ?? value._nanoseconds ?? 0);
        const date = new Date(seconds * 1000 + Math.floor(nanoseconds / 1000000));
        if (Number.isFinite(date.getTime())) return date;
      }
    }

    const parsed = new Date(value);
    if (Number.isFinite(parsed.getTime())) return parsed;
  }

  return new Date();
};

const formatStockRecordTime = (record: StockRecord, locale: string): string => {
  return normalizeStockRecordDate(record.createdAtMs, record.lastModified, record.createdAt, record.date)
    .toLocaleString(locale);
};

const getManaguaDateKey = (value: any = new Date()): string => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Managua',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(normalizeStockRecordDate(value));
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
};

const getStockRecordSignedQuantity = (record: StockRecord): number => {
  const explicitSignedQuantity = Number(record.signedQuantity);
  if (Number.isFinite(explicitSignedQuantity)) return explicitSignedQuantity;

  if (record.type === 'adjust') {
    if (Number.isFinite(Number(record.beforeStock)) && Number.isFinite(Number(record.afterStock))) {
      return Number(record.afterStock) - Number(record.beforeStock);
    }
  }

  const quantity = Number(record.quantity) || 0;
  if (record.type === 'in') return Math.abs(quantity);
  if (record.type === 'out' || record.type === 'waste') return -Math.abs(quantity);
  return quantity;
};

const formatStockRecordQuantity = (record: StockRecord): string => {
  const signedQuantity = getStockRecordSignedQuantity(record);
  return `${signedQuantity > 0 ? '+' : ''}${signedQuantity}`;
};

const formatStockRecordReason = (record: StockRecord, t: (key: TranslationKey) => string): string => {
  switch (record.reason) {
    case 'warehouse to fridge':
    case '仓库调拨到冰箱':
      return t('inventory.record.reason.warehouseToFridge');
    case 'fridge to warehouse':
    case '冰箱退回仓库':
      return t('inventory.record.reason.fridgeToWarehouse');
    case 'pos sale':
      return record.orderNumber ? `${t('inventory.record.reason.sale')} ${record.orderNumber}` : t('inventory.record.reason.sale');
    case 'purchase order':
      return record.orderNumber ? `${t('inventory.record.reason.purchase')} ${record.orderNumber}` : t('inventory.record.reason.purchase');
    case 'purchase order deleted':
      return record.orderNumber ? `${t('inventory.record.reason.purchaseDeleted')} ${record.orderNumber}` : t('inventory.record.reason.purchaseDeleted');
    case 'deleted order stock restore':
      return record.orderNumber ? `${t('inventory.record.reason.orderRestored')} ${record.orderNumber}` : t('inventory.record.reason.orderRestored');
    case 'warehouse stocktake':
      return t('inventory.record.reason.warehouseStocktake');
    case 'fridge stocktake':
      return t('inventory.record.reason.fridgeStocktake');
    case 'inventory item edit':
      return t('inventory.record.reason.itemEdit');
    default:
      return record.reason || '-';
  }
};

const formatStockRecordLocation = (record: StockRecord, fridgeNamesById: Record<string, string>, t: (key: TranslationKey) => string): string => {
  if (record.locationType === 'fridge') {
    return record.fridgeName || fridgeNamesById[record.fridgeId || ''] || record.fridgeId || t('inventory.location.fridge');
  }
  if (record.locationType === 'warehouse') return t('inventory.location.warehouse');
  return '-';
};

const formatStockRecordBalance = (record: StockRecord): string => {
  const before = Number(record.beforeStock);
  const after = Number(record.afterStock);
  if (!Number.isFinite(before) || !Number.isFinite(after)) return '-';
  return `${before} → ${after}`;
};

const formatStockRecordOperator = (operator: string | undefined, t: (key: TranslationKey) => string): string => {
  if (!operator || operator === 'system' || operator === '系统' || operator === '系统操作') return t('inventory.operator.system');
  if (operator === 'pos') return t('inventory.operator.pos');
  if (operator === '店长' || operator === 'manager') return t('inventory.operator.manager');
  return operator;
};

const createInventoryItemEditStockRecord = (oldItem: InventoryItem, updatedItem: InventoryItem, now: number): StockRecord | null => {
  const stockDifference = Number(updatedItem.currentStock || 0) - Number(oldItem.currentStock || 0);
  if (stockDifference === 0) return null;

  return {
    id: `inventory-edit-${updatedItem.id}-${now}`,
    itemId: updatedItem.id,
    itemName: updatedItem.name,
    type: 'adjust',
    quantity: Math.abs(stockDifference),
    signedQuantity: stockDifference,
    beforeStock: Number(oldItem.currentStock || 0),
    afterStock: Number(updatedItem.currentStock || 0),
    reason: 'inventory item edit',
    source: 'inventory_item_edit',
    sourceId: updatedItem.id,
    locationType: 'warehouse',
    date: new Date(now),
    createdAt: new Date(now),
    createdAtMs: now,
    lastModified: now,
    operator: 'system'
  };
};

interface InventoryProps {
  defaultTab?: 'items' | 'menu' | 'purchase' | 'records';
}

interface InventoryCategory {
  id?: string;
  key: string;
  name: string;
  icon: string;
  sortOrder?: number;
  lastModified?: number;
}

const DEFAULT_INVENTORY_CATEGORIES: InventoryCategory[] = [
  { id: 'cerveza', key: 'cerveza', name: 'Cerveza', icon: '🍺' },
  { id: 'bebida', key: 'bebida', name: 'Bebida', icon: '🥤' },
  { id: 'jugo', key: 'jugo', name: 'Jugo', icon: '🧃' },
  { id: 'ingredient', key: 'ingredient', name: '食材', icon: '🥬' },
  { id: 'alcohol', key: 'alcohol', name: '酒水', icon: '🍺' },
  { id: 'beverage', key: 'beverage', name: '饮料', icon: '🥤' },
  { id: 'other', key: 'other', name: '其他', icon: '📦' }
];

const REQUIRED_FRIDGE_INVENTORY_CATEGORIES: InventoryCategory[] = [
  { id: 'cerveza', key: 'cerveza', name: 'Cerveza', icon: '🍺' },
  { id: 'bebida', key: 'bebida', name: 'Bebida', icon: '🥤' },
  { id: 'jugo', key: 'jugo', name: 'Jugo', icon: '🧃' },
];

const inventoryPageStyle: React.CSSProperties = {
  height: '100vh',
  display: 'flex',
  flexDirection: 'column',
  padding: '1rem',
  gap: '0.75rem',
  overflow: 'hidden',
  boxSizing: 'border-box',
  background: colors.page,
  color: colors.textPrimary,
  fontFamily: font.family,
};

const inventoryShellStyle: React.CSSProperties = {
  backgroundColor: colors.surface,
  borderRadius: radii.lg,
  boxShadow: shadows.soft,
  border: `1px solid ${colors.border}`,
  padding: '0.72rem',
  flexShrink: 0,
};

const inventoryInputStyle: React.CSSProperties = {
  padding: '0.56rem 0.68rem',
  border: `1px solid ${colors.borderStrong}`,
  borderRadius: radii.md,
  fontSize: font.body,
  backgroundColor: colors.surface,
  color: colors.textPrimary,
  outline: 'none',
};

const inventoryActionButtonStyle: React.CSSProperties = {
  padding: '0.52rem 0.78rem',
  backgroundColor: colors.surface,
  color: colors.textPrimary,
  border: `1px solid ${colors.borderStrong}`,
  borderRadius: radii.md,
  fontWeight: 700,
  cursor: 'pointer',
  fontSize: font.body,
};

const inventoryPrimaryButtonStyle: React.CSSProperties = {
  ...inventoryActionButtonStyle,
  backgroundColor: colors.teal,
  color: colors.surface,
  border: 'none',
  boxShadow: '0 8px 18px rgba(15, 118, 110, 0.18)',
};

const getInventoryTabStyle = (isActive: boolean): React.CSSProperties => ({
  padding: '0.52rem 0.92rem',
  backgroundColor: isActive ? colors.teal : colors.surfaceMuted,
  color: isActive ? colors.surface : colors.textPrimary,
  border: `1px solid ${isActive ? colors.teal : colors.border}`,
  borderRadius: radii.pill,
  fontWeight: 700,
  cursor: 'pointer',
  fontSize: font.body,
  boxShadow: isActive ? '0 8px 18px rgba(15, 118, 110, 0.16)' : 'none',
});

const SELLABLE_DIRECT_MENU_CATEGORY_KEYS = ['alcohol', 'beverage', 'cerveza', 'bebida', 'jugo', 'jugos'];

const isDirectMenuInventoryCategory = (categoryKey?: string): boolean => {
  return SELLABLE_DIRECT_MENU_CATEGORY_KEYS.includes(String(categoryKey || '').toLowerCase());
};

const getMenuCategoryForInventoryCategory = (categoryKey?: string): string => {
  const normalizedKey = String(categoryKey || '').toLowerCase();
  if (normalizedKey === 'alcohol' || normalizedKey === 'cerveza') return 'Cerveza';
  if (normalizedKey === 'jugo' || normalizedKey === 'jugos') return 'Jugo';
  return 'Bebida';
};

const normalizeInventoryCategories = (categories: any[] = []): InventoryCategory[] => {
  const now = Date.now();
  const merged = new Map<string, InventoryCategory>();

  categories.forEach((category, index) => {
    if (!category || typeof category !== 'object') return;
    const key = String(category.key || category.id || `cat_${now}_${index}`);
    const normalized: InventoryCategory = {
      id: String(category.id || key),
      key,
      name: String(category.name || key),
      icon: String(category.icon || '📦'),
      sortOrder: Number(category.sortOrder ?? index),
      lastModified: Number(category.lastModified || 0) || now
    };
    const existing = merged.get(key);
    if (!existing || (normalized.lastModified || 0) >= (existing.lastModified || 0)) {
      merged.set(key, normalized);
    }
  });

  return Array.from(merged.values())
    .sort((a, b) => Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0));
};

const ensureRequiredFridgeInventoryCategories = (categories: InventoryCategory[]): InventoryCategory[] => {
  const normalizedCategories = normalizeInventoryCategories(categories);
  const existingKeys = new Set(normalizedCategories.map(category => String(category.key).toLowerCase()));
  const existingNames = new Set(normalizedCategories.map(category => String(category.name).toLowerCase()));
  const missingCategories = REQUIRED_FRIDGE_INVENTORY_CATEGORIES
    .filter(category =>
      !existingKeys.has(category.key.toLowerCase()) &&
      !existingNames.has(category.name.toLowerCase())
    )
    .map((category, index) => ({
      ...category,
      sortOrder: normalizedCategories.length + index,
      lastModified: Date.now(),
    }));

  return missingCategories.length > 0
    ? normalizeInventoryCategories([...normalizedCategories, ...missingCategories])
    : normalizedCategories;
};

const Inventory: React.FC<InventoryProps> = ({ defaultTab = 'items' }) => {
  const { t, language } = useI18n();
  const { user } = useAuth();
  const {
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
    fridgeInventory,
    setFridgeInventory
  } = useAppContext();
  
  const [activeTab, setActiveTab] = useState<'items' | 'menu' | 'purchase' | 'records' | 'reorder'>(defaultTab);
  const isStandalonePurchase = defaultTab === 'purchase';
  const canManageItems = Boolean(user && canAccessPermission(user.role, 'inventory:items'));
  const canManagePurchases = Boolean(user && canAccessPermission(user.role, 'inventory:purchase'));
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [stockStatusFilter, setStockStatusFilter] = useState<'all' | 'negative' | 'low'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [reorderSearchTerm, setReorderSearchTerm] = useState('');
  const [purchaseDraft, setPurchaseDraft] = useState<ReplenishmentPurchaseDraft | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showInventorySummary, setShowInventorySummary] = useState(false);
  const [inventoryLastSyncedAt, setInventoryLastSyncedAt] = useState<Date | null>(null);
  const [isRefreshingInventory, setIsRefreshingInventory] = useState(false);

  useEffect(() => {
    setActiveTab(defaultTab);
  }, [defaultTab]);

  // 生成唯一条形码（13位EAN格式）
  const generateBarcode = () => {
    const prefix = '690'; // 中国前缀
    const random = Math.floor(Math.random() * 10000000000).toString().padStart(10, '0');
    return prefix + random;
  };

  const [editingItem, setEditingItem] = useState<Partial<InventoryItem>>({
    barcode: generateBarcode(),
    category: 'ingredient',
    unit: 'lb' // ✅ 默认单位为磅(lb)
  });
  const [showMenuModal, setShowMenuModal] = useState(false);
  const [editingMenu, setEditingMenu] = useState<Partial<MenuItem> & { image?: string }>({
    name: '',
    price: 0,
    category: '主食',
    available: true,
    ingredients: []
  });
  const [selectedMenuImageFile, setSelectedMenuImageFile] = useState<File | null>(null);
  const [isProcessingMenuImage, setIsProcessingMenuImage] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<{ id?: string; name: string }>({ name: '' });
  const [showInventoryCategoryModal, setShowInventoryCategoryModal] = useState(false);
  const [editingInventoryCategory, setEditingInventoryCategory] = useState<InventoryCategory>({ key: '', name: '', icon: '📦' });

  // 菜品分类管理（从 AppContext 获取，与 POS 同步）
  // categories 和 setCategories 已经从 useAppContext() 中获取

  // 库存物品类别管理（从 localStorage 加载）
  const getInventoryCategoryStorageKey = React.useCallback(() => {
    const storeId = dataService.getCurrentStoreId();
    return storeId ? `store_${storeId}_inventory_categories` : 'inventory_categories';
  }, []);
  const [inventoryCategories, setInventoryCategories] = useState<InventoryCategory[]>(() => {
    try {
      const serviceData = normalizeInventoryCategories(dataService.getData('inventory_categories'));
      if (serviceData.length > 0) {
        return ensureRequiredFridgeInventoryCategories(serviceData);
      }

      const storeId = dataService.getCurrentStoreId();
      const storageKeys = [
        storeId ? `store_${storeId}_inventory_categories` : '',
        'inventory_categories'
      ].filter(Boolean);

      for (const storageKey of storageKeys) {
        const saved = localStorage.getItem(storageKey);
        if (saved) {
          const parsed = normalizeInventoryCategories(JSON.parse(saved));
          if (parsed.length > 0) {
            return ensureRequiredFridgeInventoryCategories(parsed);
          }
        }
      }
    } catch (error) {
      console.error('加载库存类别失败:', error);
    }

    return ensureRequiredFridgeInventoryCategories(normalizeInventoryCategories(DEFAULT_INVENTORY_CATEGORIES));
  });
  
  React.useEffect(() => {
    let cancelled = false;

    const loadInventoryCategories = async () => {
      try {
        const cloudCategories = await smartGetDocuments('inventory_categories', true);
        if (cancelled) return;

        const normalizedCloudCategories = ensureRequiredFridgeInventoryCategories(
          normalizeInventoryCategories(cloudCategories)
        );
        if (normalizedCloudCategories.length > 0) {
          const cloudCategoryKeys = new Set(cloudCategories.map((category: any) =>
            String(category?.key || category?.id || '').toLowerCase()
          ));
          const missingRequiredCategories = normalizedCloudCategories.filter(category =>
            REQUIRED_FRIDGE_INVENTORY_CATEGORIES.some(required => required.key === category.key) &&
            !cloudCategoryKeys.has(category.key.toLowerCase())
          );
          if (missingRequiredCategories.length > 0) {
            await Promise.all(missingRequiredCategories.map(category =>
              smartSetDocument('inventory_categories', category.id || category.key, category)
            ));
          }
          setInventoryCategories(normalizedCloudCategories);
        }
      } catch (error) {
        console.error('加载云端库存类别失败:', error);
      }
    };

    loadInventoryCategories();
    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    try {
      const normalizedCategories = normalizeInventoryCategories(inventoryCategories);
      if (JSON.stringify(normalizedCategories) !== JSON.stringify(inventoryCategories)) {
        setInventoryCategories(normalizedCategories);
        return;
      }

      const storageKey = getInventoryCategoryStorageKey();
      localStorage.setItem(storageKey, JSON.stringify(normalizedCategories));
    } catch (error) {
      console.error('保存库存类别失败:', error);
    }
  }, [inventoryCategories, getInventoryCategoryStorageKey]);

  const refreshInventoryData = React.useCallback(async () => {
    setIsRefreshingInventory(true);
    try {
      const [cloudItems, cloudCategories] = await Promise.all([
        smartGetDocuments('inventory_items', true),
        smartGetDocuments('inventory_categories', true)
      ]);

      const normalizedCloudItems = cloudItems.map((item: any) => ({
        ...item,
        currentStock: Number(item.currentStock) || 0,
        minStock: Number(item.minStock) || 0,
        costPrice: Number(item.costPrice) || 0,
        salePrice: item.salePrice === undefined ? undefined : Number(item.salePrice) || 0,
        preferredSupplierId: String(item.preferredSupplierId || ''),
        preferredSupplierName: String(item.preferredSupplierName || ''),
        lastUpdated: item.lastUpdated ? new Date(item.lastUpdated) : new Date()
      })) as InventoryItem[];

      setInventoryItems(normalizedCloudItems);
      const storeId = dataService.getCurrentStoreId();
      if (storeId) {
        localStorage.setItem(`store_${storeId}_inventory_items`, JSON.stringify(normalizedCloudItems));
        localStorage.setItem(`store_${storeId}_inventory`, JSON.stringify(normalizedCloudItems));
      } else {
        console.warn('Missing storeId; skipped inventory refresh cache write');
      }

      const normalizedCloudCategories = normalizeInventoryCategories(cloudCategories);
      setInventoryCategories(normalizedCloudCategories);
      const categoryStorageKey = getInventoryCategoryStorageKey();
      localStorage.setItem(categoryStorageKey, JSON.stringify(normalizedCloudCategories));

      setInventoryLastSyncedAt(new Date());
    } catch (error) {
      console.error('刷新库存数据失败:', error);
      alert(t('inventory.alert.refreshFailed'));
    } finally {
      setIsRefreshingInventory(false);
    }
  }, [getInventoryCategoryStorageKey, setInventoryItems, t]);

  const saveInventoryCategorySnapshot = React.useCallback((nextCategories: InventoryCategory[]) => {
    const normalizedCategories = normalizeInventoryCategories(nextCategories);
    const categoryStorageKey = getInventoryCategoryStorageKey();
    localStorage.setItem(categoryStorageKey, JSON.stringify(normalizedCategories));
    setInventoryCategories(normalizedCategories);
    return normalizedCategories;
  }, [getInventoryCategoryStorageKey]);

  const saveInventoryCategoryToCloud = React.useCallback(async (category: InventoryCategory) => {
    const docId = category.id || category.key;
    await smartSetDocument('inventory_categories', docId, {
      ...category,
      id: docId,
      lastModified: category.lastModified || Date.now()
    });
  }, []);

  const saveInventoryCategoryChange = React.useCallback(async (
    nextCategories: InventoryCategory[],
    changedCategory: InventoryCategory
  ) => {
    const normalizedChangedCategory = normalizeInventoryCategories([changedCategory])[0];
    await saveInventoryCategoryToCloud(normalizedChangedCategory);
    saveInventoryCategorySnapshot(nextCategories);
  }, [saveInventoryCategorySnapshot, saveInventoryCategoryToCloud]);

  const deleteInventoryCategoryFromCloud = React.useCallback(async (
    nextCategories: InventoryCategory[],
    category: InventoryCategory
  ) => {
    await smartDeleteDocument('inventory_categories', category.id || category.key);
    saveInventoryCategorySnapshot(nextCategories);
  }, [saveInventoryCategorySnapshot]);

  const saveInventoryCategoryOrder = React.useCallback(async (nextCategories: InventoryCategory[]) => {
    const now = Date.now();
    const orderedCategories = nextCategories.map((category, index) => ({
      ...category,
      id: category.id || category.key,
      sortOrder: index,
      lastModified: now,
    }));

    await Promise.all(orderedCategories.map(category => saveInventoryCategoryToCloud(category)));
    saveInventoryCategorySnapshot(orderedCategories);
  }, [saveInventoryCategorySnapshot, saveInventoryCategoryToCloud]);

  const stockRecordsStorageKey = dataService.getStoreKey('inventory_stock_records');
  const initialStockRecordDate = getManaguaDateKey();
  const [stockRecordStartDate, setStockRecordStartDate] = useState(initialStockRecordDate);
  const [stockRecordEndDate, setStockRecordEndDate] = useState(initialStockRecordDate);
  const [isLoadingStockRecords, setIsLoadingStockRecords] = useState(false);

  const [stockRecords, setStockRecords] = useState<StockRecord[]>(() => {
    try {
      const saved = localStorage.getItem(stockRecordsStorageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        // 恢复 Date 对象
        return parsed.map((record: any) => {
          const normalizedDate = normalizeStockRecordDate(record.createdAtMs, record.lastModified, record.createdAt, record.date);
          return {
            ...record,
            date: normalizedDate
          };
        }).filter((record: StockRecord) => (
          !isLegacyDemoStockRecord(record) && getManaguaDateKey(record.date) === initialStockRecordDate
        ));
      }
    } catch (error) {
      console.error('加载库存记录失败:', error);
    }
    return [];
  });
  const [stockRecordSearchTerm, setStockRecordSearchTerm] = useState('');
  const fridgeNamesById = React.useMemo(() => Object.fromEntries(
    fridges.map(fridge => [fridge.id, fridge.name])
  ), [fridges]);

  const loadStockRecords = React.useCallback(async () => {
    setIsLoadingStockRecords(true);
    try {
      const cloudRecords = await smartGetDocumentsByDateRange(
        'inventory_stock_records',
        'createdAtMs',
        stockRecordStartDate,
        stockRecordEndDate,
        true,
        'number-timestamp'
      );
      const sortedRecords = cloudRecords
        .map((record: any) => {
          const normalizedDate = normalizeStockRecordDate(record.createdAtMs, record.lastModified, record.createdAt, record.date);
          return { ...record, date: normalizedDate };
        })
        .filter((record: StockRecord) => !isLegacyDemoStockRecord(record))
        .sort((a: StockRecord, b: StockRecord) => b.date.getTime() - a.date.getTime());
      setStockRecords(sortedRecords);

      const cached = JSON.parse(localStorage.getItem(stockRecordsStorageKey) || '[]');
      const merged = new Map<string, any>(cached.map((record: any) => [record.id, record]));
      sortedRecords.forEach(record => merged.set(record.id, record));
      localStorage.setItem(stockRecordsStorageKey, JSON.stringify(Array.from(merged.values())));
    } catch (error) {
      console.error('加载云端库存记录失败:', error);
    } finally {
      setIsLoadingStockRecords(false);
    }
  }, [stockRecordEndDate, stockRecordStartDate, stockRecordsStorageKey]);

  useEffect(() => {
    void loadStockRecords();
  }, [loadStockRecords]);

  const filteredStockRecords = React.useMemo(() => {
    const keyword = stockRecordSearchTerm.trim().toLowerCase();
    if (!keyword) return stockRecords;

    return stockRecords.filter(record => {
      const searchableText = [
        record.itemName,
        record.itemId,
        record.orderNumber,
        record.source,
        record.sourceId,
        record.reason,
        formatStockRecordReason(record, t),
        record.operator,
        formatStockRecordOperator(record.operator, t),
        record.locationType,
        record.fridgeId,
        record.fridgeName,
        formatStockRecordLocation(record, fridgeNamesById, t),
      ].filter(Boolean).join(' ').toLowerCase();

      return searchableText.includes(keyword);
    });
  }, [fridgeNamesById, stockRecords, stockRecordSearchTerm, t]);

  // 过滤库存物品
  // 获取类别名称 - 从 inventoryCategories 中动态查找
  const getCategoryName = (category: string) => {
    const cat = inventoryCategories.find(c => c.key === category);
    return cat ? `${cat.icon} ${cat.name}` : category;
  };

  // 获取类别颜色 - 根据类别索引动态生成
  const getCategoryColor = (category: string) => {
    const colors = ['#d1fae5', '#fef3c7', '#dbeafe', '#f3f4f6', '#e0e7ff', '#fce7f3', '#ccfbf1'];
    const index = inventoryCategories.findIndex(c => c.key === category);
    return index !== -1 ? colors[index % colors.length] : '#e0e7ff';
  };

  const getDefaultUnitForInventoryCategory = (categoryKey: string) => {
    const category = inventoryCategories.find(c => c.key === categoryKey || c.id === categoryKey);
    const normalizedKey = String(categoryKey || '').toLowerCase();
    const normalizedName = String(category?.name || '').toLowerCase();
    const botCategories = ['alcohol', 'beverage', 'cerveza', 'bebida', 'jugo', 'jugos'];

    return botCategories.includes(normalizedKey) || botCategories.includes(normalizedName) ? 'BOT' : 'lb';
  };

  const getFridgeStock = (itemId: string) => {
    return fridgeInventory
      .filter(inv => inv.itemId === itemId)
      .reduce((sum, inv) => sum + Number(inv.quantity || 0), 0);
  };

  const getTotalStock = (item: InventoryItem) => item.currentStock + getFridgeStock(item.id);

  // 检查总库存是否低于警戒线
  const isLowStock = (item: InventoryItem) => isInventoryItemLowStock(item, getFridgeStock(item.id));
  const isNegativeStockItem = (item: InventoryItem) => item.currentStock < 0 || getFridgeStock(item.id) < 0 || getTotalStock(item) < 0;
  const negativeStockItems = inventoryItems.filter(isNegativeStockItem);
  const lowStockSuggestions = buildLowStockSuggestions({
    inventoryItems,
    fridgeInventory,
    suppliers,
    purchaseOrders,
  });
  const filteredReorderSuggestions = lowStockSuggestions.filter(suggestion => {
    const keyword = reorderSearchTerm.trim().toLowerCase();
    return !keyword || [suggestion.itemName, suggestion.supplierName]
      .some(value => value.toLowerCase().includes(keyword));
  });
  const reorderEstimatedAmount = filteredReorderSuggestions.reduce((sum, suggestion) => sum + suggestion.estimatedAmount, 0);

  const filteredItems = inventoryItems.filter(item => {
    const matchCategory = categoryFilter === 'all' || item.category === categoryFilter;
    const matchSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                       (item.barcode && item.barcode.includes(searchTerm));
    const matchStatus = stockStatusFilter === 'all'
      || (stockStatusFilter === 'negative' && isNegativeStockItem(item))
      || (stockStatusFilter === 'low' && isLowStock(item));
    return matchCategory && matchSearch && matchStatus;
  });

  // 模拟扫码功能
  const handleScanBarcode = () => {
    const barcode = prompt(t('inventory.barcode.prompt'));
    if (barcode) {
      setSearchTerm(barcode);
      const found = inventoryItems.find(item => item.barcode === barcode);
      if (found) {
      alert(`${t('inventory.barcode.found')}: ${found.name}\n${t('inventory.field.barcode')}: ${found.barcode}\n${t('inventory.table.totalStock')}: ${getTotalStock(found)} ${found.unit}\n${t('inventory.location.warehouse')}: ${found.currentStock} ${found.unit}\n${t('inventory.location.fridge')}: ${getFridgeStock(found.id)} ${found.unit}`);
    } else {
      alert(t('inventory.barcode.notFound'));
      }
    }
  };

  return (
    <div style={inventoryPageStyle}>
      {/* 顶部标签和统计 */}
      {!isStandalonePurchase && (
      <div style={inventoryShellStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', marginBottom: activeTab === 'items' || activeTab === 'reorder' ? '0.65rem' : 0, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
            {canManageItems && (
              <button
                onClick={() => setActiveTab('items')}
                style={getInventoryTabStyle(activeTab === 'items')}
              >
              📦 {t('inventory.tab.items')}
              </button>
            )}
            <button
              onClick={() => setActiveTab('records')}
              style={getInventoryTabStyle(activeTab === 'records')}
            >
            📊 {t('inventory.tab.records')}
            </button>
            {canManagePurchases && (
              <button
                onClick={() => setActiveTab('reorder')}
                style={getInventoryTabStyle(activeTab === 'reorder')}
              >
              {t('inventory.tab.reorder')} {lowStockSuggestions.length > 0 ? `(${lowStockSuggestions.length})` : ''}
              </button>
            )}
          </div>

          <div style={{ display: 'flex', gap: '0.45rem', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {inventoryLastSyncedAt && (
              <span style={{ fontSize: font.caption, color: colors.textSecondary, whiteSpace: 'nowrap' }}>
                {t('inventory.lastSync')} {inventoryLastSyncedAt.toLocaleTimeString('es-NI', { hour12: false })}
              </span>
            )}
            <button
              onClick={refreshInventoryData}
              disabled={isRefreshingInventory}
              style={{
                ...inventoryActionButtonStyle,
                backgroundColor: isRefreshingInventory ? colors.surfaceMuted : colors.surface,
                color: isRefreshingInventory ? colors.textMuted : colors.textPrimary,
                cursor: isRefreshingInventory ? 'not-allowed' : 'pointer',
              }}
            >
              {isRefreshingInventory ? t('inventory.syncing') : t('inventory.refresh')}
            </button>
            <button
              onClick={handleScanBarcode}
              style={inventoryActionButtonStyle}
            >
              📷 {t('inventory.scan')}
            </button>
            <button
              onClick={() => {
                setEditingItem({
                  barcode: generateBarcode(),
                  category: 'ingredient',
                  unit: 'lb'
                });
                setShowAddModal(true);
              }}
              style={inventoryPrimaryButtonStyle}
            >
              ➕ {t('inventory.addItem')}
            </button>
          </div>
        </div>

        {/* 搜索和筛选 */}
        {activeTab === 'items' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 1fr) minmax(150px, 190px) minmax(150px, 190px) auto', gap: '0.55rem', alignItems: 'center', backgroundColor: colors.surfaceMuted, border: `1px solid ${colors.border}`, borderRadius: radii.md, padding: '0.55rem' }}>
            <input
              type="text"
              placeholder={t('inventory.search.items')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                ...inventoryInputStyle,
                flex: 1,
              }}
            />
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              style={{
                ...inventoryInputStyle,
              }}
            >
              <option value="all">{t('inventory.filter.allCategories')}</option>
              {inventoryCategories.map(cat => (
                <option key={cat.key} value={cat.key}>{cat.icon} {cat.name}</option>
              ))}
            </select>
            <select
              value={stockStatusFilter}
              onChange={(e) => setStockStatusFilter(e.target.value as 'all' | 'negative' | 'low')}
              style={{
                ...inventoryInputStyle,
              }}
            >
              <option value="all">{t('inventory.filter.allStatuses')}</option>
              <option value="negative">{t('inventory.status.negative')}</option>
              <option value="low">{t('inventory.status.low')}</option>
            </select>
            <button
              onClick={() => setShowInventoryCategoryModal(true)}
              style={inventoryActionButtonStyle}
            >
              🏷️ {t('inventory.category.manage')}
            </button>
          </div>
        )}
        {activeTab === 'reorder' && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.55rem', alignItems: 'center', backgroundColor: colors.surfaceMuted, border: `1px solid ${colors.border}`, borderRadius: radii.md, padding: '0.55rem' }}>
            <input
              type="text"
              placeholder={t('inventory.search.reorder')}
              value={reorderSearchTerm}
              onChange={(event) => setReorderSearchTerm(event.target.value)}
              style={{ ...inventoryInputStyle, flex: '1 1 240px', minWidth: 0 }}
            />
            <span style={{ color: colors.textSecondary, fontSize: font.caption, flex: '0 1 auto' }}>
              {t('inventory.reorder.rule')}
            </span>
          </div>
        )}
      </div>
      )}

      {/* 库存物品列表 */}
      {activeTab === 'items' && (
        <div style={{ flex: 1, minHeight: 0, backgroundColor: colors.surface, borderRadius: radii.lg, boxShadow: shadows.soft, border: `1px solid ${colors.border}`, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {/* 🔥 货值统计面板 */}
          {(() => {
            // 🔥 计算仓库库存货值
            const warehouseValue = inventoryItems.reduce((sum, item) => sum + (item.currentStock * item.costPrice), 0);
            
            // 🔥 计算冰箱库存货值
            let fridgeValue = 0;
            fridgeInventory.forEach(fridgeItem => {
              // 查找对应的库存商品
              const item = inventoryItems.find(i => i.id === fridgeItem.itemId);
              if (item) {
                fridgeValue += fridgeItem.quantity * item.costPrice;
              }
            });
            
            // 🔥 总货值 = 仓库 + 冰箱
            const totalValue = warehouseValue + fridgeValue;
            
            // 按类别统计货值（包含仓库和冰箱）
            const categoryValues: {[key: string]: { name: string; icon: string; value: number; quantity: number }} = {};
            
            // 统计仓库库存
            inventoryItems.forEach(item => {
              if (!categoryValues[item.category]) {
                const cat = inventoryCategories.find(c => c.key === item.category);
                categoryValues[item.category] = {
                  name: cat ? cat.name : item.category,
                  icon: cat ? cat.icon : '📦',
                  value: 0,
                  quantity: 0
                };
              }
              categoryValues[item.category].value += item.currentStock * item.costPrice;
              categoryValues[item.category].quantity += item.currentStock;
            });
            
            // 统计冰箱库存
            fridgeInventory.forEach(fridgeItem => {
              const item = inventoryItems.find(i => i.id === fridgeItem.itemId);
              if (item) {
                if (!categoryValues[item.category]) {
                  const cat = inventoryCategories.find(c => c.key === item.category);
                  categoryValues[item.category] = {
                    name: cat ? cat.name : item.category,
                    icon: cat ? cat.icon : '📦',
                    value: 0,
                    quantity: 0
                  };
                }
                categoryValues[item.category].value += fridgeItem.quantity * item.costPrice;
                categoryValues[item.category].quantity += fridgeItem.quantity;
              }
            });
            
            // 低库存预警货值（仅仓库）
            const lowStockItems = inventoryItems.filter(item => isLowStock(item));
            const lowStockValue = lowStockItems.reduce((sum, item) => sum + (getTotalStock(item) * item.costPrice), 0);

            if (!showInventorySummary) {
              return (
                <div style={{
                  padding: '0.55rem 0.75rem',
                  borderBottom: '1px solid #e5e7eb',
                  backgroundColor: '#f9fafb',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '0.75rem',
                  flexShrink: 0
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', minWidth: 0 }}>
                    <div style={{ fontSize: '0.9rem', fontWeight: '700', color: '#1f2937', whiteSpace: 'nowrap' }}>
                  {t('inventory.summary.totalValue')} C$ {totalValue.toLocaleString(language === 'es-NI' ? 'es-NI' : 'zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#6b7280', whiteSpace: 'nowrap' }}>
                  {t('inventory.location.warehouse')} C$ {warehouseValue.toFixed(2)} / {t('inventory.location.fridge')} C$ {fridgeValue.toFixed(2)}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: lowStockItems.length > 0 ? '#dc2626' : '#059669', whiteSpace: 'nowrap', fontWeight: '600' }}>
                  {lowStockItems.length > 0 ? `${t('inventory.status.low')} ${lowStockItems.length}` : t('inventory.status.normal')}
                    </div>
                  </div>
                  <button
                    onClick={() => setShowInventorySummary(true)}
                    style={{
                      padding: '0.35rem 0.7rem',
                      backgroundColor: '#eef2ff',
                      color: '#3730a3',
                      border: '1px solid #c7d2fe',
                      borderRadius: '0.25rem',
                      fontWeight: '700',
                      cursor: 'pointer',
                      fontSize: '0.8rem',
                      flexShrink: 0
                    }}
                  >
                {t('inventory.summary.expand')}
                  </button>
                </div>
              );
            }
            
            return (
              <div style={{
                padding: '0.75rem',
                borderBottom: '1px solid #e5e7eb',
                backgroundColor: '#f9fafb',
                flexShrink: 0
              }}>
                {/* 总货值 */}
                <div style={{
                  marginBottom: '0.65rem',
                  padding: '0.75rem',
                  backgroundColor: 'white',
                  borderRadius: '0.5rem',
                  border: '2px solid #3b82f6',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <div>
                  <div style={{ fontSize: '0.85rem', color: '#6b7280', marginBottom: '0.25rem' }}>💰 {t('inventory.summary.totalValueDetail')}</div>
                    <div style={{ fontSize: '1.35rem', fontWeight: 'bold', color: '#3b82f6' }}>
                      C$ {totalValue.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.25rem' }}>
                    {t('inventory.location.warehouse')}: C$ {warehouseValue.toFixed(2)} | {t('inventory.location.fridge')}: C$ {fridgeValue.toFixed(2)}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '0.85rem', color: '#6b7280' }}>{t('inventory.summary.itemTypes')}</div>
                  <div style={{ fontSize: '1.2rem', fontWeight: '600', color: '#374151' }}>{inventoryItems.length}</div>
                    <button
                      onClick={() => setShowInventorySummary(false)}
                      style={{
                        marginTop: '0.35rem',
                        padding: '0.3rem 0.6rem',
                        backgroundColor: '#f3f4f6',
                        color: '#374151',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.25rem',
                        cursor: 'pointer',
                        fontSize: '0.75rem',
                        fontWeight: '700'
                      }}
                    >
                  {t('inventory.summary.collapse')}
                    </button>
                  </div>
                </div>
                
                {/* 分类货值 */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: '0.5rem',
                  marginBottom: lowStockItems.length > 0 ? '1rem' : '0'
                }}>
                  {Object.entries(categoryValues).map(([key, data]) => (
                    <div key={key} style={{
                      padding: '0.55rem',
                      backgroundColor: 'white',
                      borderRadius: '0.375rem',
                      border: '1px solid #e5e7eb'
                    }}>
                      <div style={{ fontSize: '0.8rem', color: '#6b7280', marginBottom: '0.25rem' }}>
                        {data.icon} {data.name}
                      </div>
                      <div style={{ fontSize: '0.95rem', fontWeight: '600', color: '#374151' }}>
                        C$ {data.value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.25rem' }}>
                        {data.quantity.toLocaleString()} {t('inventory.summary.units')}
                      </div>
                    </div>
                  ))}
                </div>
                
                {/* 低库存预警 */}
                {negativeStockItems.length > 0 && (
                  <div style={{
                    padding: '0.75rem',
                    backgroundColor: '#fff1f2',
                    borderRadius: '0.375rem',
                    border: '1px solid #fecdd3',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: lowStockItems.length > 0 ? '0.75rem' : 0
                  }}>
                    <div>
                    <span style={{ fontWeight: '700', color: '#be123c' }}>{t('inventory.status.negative')}</span>
                      <span style={{ marginLeft: '0.5rem', fontSize: '0.85rem', color: '#9f1239' }}>
                    {negativeStockItems.length} {t('inventory.negative.description')}
                      </span>
                    </div>
                    <button
                      onClick={() => setStockStatusFilter('negative')}
                      style={{
                        padding: '0.35rem 0.7rem',
                        backgroundColor: '#be123c',
                        color: 'white',
                        border: 'none',
                        borderRadius: '0.25rem',
                        cursor: 'pointer',
                        fontWeight: '700',
                        fontSize: '0.8rem'
                      }}
                    >
                    {t('inventory.negative.view')}
                    </button>
                  </div>
                )}

                {lowStockItems.length > 0 && (
                  <div style={{
                    padding: '0.75rem',
                    backgroundColor: '#fee2e2',
                    borderRadius: '0.375rem',
                    border: '1px solid #fecaca',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}>
                    <div>
                    <span style={{ fontWeight: '600', color: '#dc2626' }}>⚠️ {t('inventory.low.warning')}</span>
                      <span style={{ marginLeft: '0.5rem', fontSize: '0.85rem', color: '#991b1b' }}>
                    {lowStockItems.length} {t('inventory.low.description')}
                      </span>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '0.75rem', color: '#991b1b' }}>{t('inventory.low.currentValue')}</div>
                      <div style={{ fontSize: '1rem', fontWeight: '600', color: '#dc2626' }}>
                        C$ {lowStockValue.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
          
          {negativeStockItems.length > 0 && (
            <div style={{
              padding: '0.65rem 0.85rem',
              backgroundColor: '#fff1f2',
              borderBottom: '1px solid #fecdd3',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '0.75rem',
              flexShrink: 0
            }}>
              <div style={{ color: '#9f1239', fontWeight: 700 }}>
                      {t('inventory.status.negative')} {negativeStockItems.length}，{t('inventory.negative.needStocktake')}
              </div>
              <button
                onClick={() => setStockStatusFilter('negative')}
                style={{
                  padding: '0.35rem 0.7rem',
                  backgroundColor: '#be123c',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.25rem',
                  cursor: 'pointer',
                  fontWeight: '700',
                  fontSize: '0.8rem'
                }}
              >
                      {t('inventory.negative.view')}
              </button>
            </div>
          )}

          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ backgroundColor: '#f9fafb', position: 'sticky', top: 0 }}>
                <tr>
                  {[t('inventory.table.name'), t('inventory.table.category'), t('inventory.table.totalStock'), t('inventory.location.warehouse'), t('inventory.location.fridge'), t('inventory.table.minStock'), t('inventory.table.unit'), t('inventory.table.cost'), t('inventory.table.sale'), t('inventory.table.profit'), t('inventory.table.locationTags'), t('inventory.table.status'), t('inventory.table.actions')].map((title, index) => (
                    <th key={title} style={{ padding: '0.75rem', textAlign: index >= 2 && index <= 9 ? 'right' : (index >= 11 ? 'center' : 'left'), borderBottom: '2px solid #e5e7eb', fontSize: '0.85rem', fontWeight: '600' }}>{title}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredItems.map(item => {
                  const fridgeStock = getFridgeStock(item.id);
                  const totalStock = item.currentStock + fridgeStock;

                  return (
                  <tr key={item.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '0.75rem' }}>
                      <div style={{ fontWeight: '600' }}>{item.name}</div>
                      {item.barcode && <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>{item.barcode}</div>}
                    </td>
                    <td style={{ padding: '0.75rem' }}>
                      <span style={{
                        padding: '0.25rem 0.5rem',
                        backgroundColor: getCategoryColor(item.category),
                        borderRadius: '0.25rem',
                        fontSize: '0.8rem'
                      }}>
                        {getCategoryName(item.category)}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: '600' }}>
                      {totalStock.toLocaleString()}
                    </td>
                    <td style={{ padding: '0.75rem', textAlign: 'right', color: '#6b7280' }}>
                      {item.currentStock.toLocaleString()}
                    </td>
                    <td style={{ padding: '0.75rem', textAlign: 'right', color: fridgeStock > 0 ? '#2563eb' : '#9ca3af', fontWeight: fridgeStock > 0 ? '600' : '400' }}>
                      {fridgeStock.toLocaleString()}
                    </td>
                    <td style={{ padding: '0.75rem', textAlign: 'right', color: '#6b7280' }}>
                      {item.minStock.toLocaleString()}
                    </td>
                    <td style={{ padding: '0.75rem', color: '#6b7280' }}>{item.unit}</td>
                    <td style={{ padding: '0.75rem', textAlign: 'right', color: '#6b7280' }}>C$ {item.costPrice.toFixed(2)}</td>
                    <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: '600' }}>
                      {item.salePrice ? `C$ ${item.salePrice.toFixed(2)}` : '-'}
                    </td>
                    <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: '600' }}>
                      {item.salePrice ? (
                        <span style={{ color: item.salePrice - item.costPrice > 0 ? '#10b981' : '#ef4444' }}>
                          C$ {(item.salePrice - item.costPrice).toFixed(2)}
                        </span>
                      ) : (
                          <span style={{ color: '#9ca3af', fontSize: '0.8rem' }}>{t('inventory.table.calculatedByMenu')}</span>
                      )}
                    </td>
                    <td style={{ padding: '0.75rem', fontSize: '0.85rem', color: '#6b7280' }}>
                      {item.location || '-'}
                      {item.tags && item.tags.length > 0 && (
                        <div style={{ marginTop: '0.25rem', display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                          {item.tags.map((tag, idx) => (
                            <span key={idx} style={{
                              padding: '0.15rem 0.4rem',
                              backgroundColor: '#e0e7ff',
                              color: '#4338ca',
                              borderRadius: '0.25rem',
                              fontSize: '0.7rem'
                            }}>
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                      {isNegativeStockItem(item) ? (
                        <span style={{
                          padding: '0.25rem 0.5rem',
                          backgroundColor: '#ffe4e6',
                          color: '#be123c',
                          borderRadius: '0.25rem',
                          fontSize: '0.75rem',
                          fontWeight: '700'
                        }}>
                            {t('inventory.status.negative')}
                        </span>
                      ) : isLowStock(item) ? (
                        <span style={{
                          padding: '0.25rem 0.5rem',
                          backgroundColor: '#fee2e2',
                          color: '#dc2626',
                          borderRadius: '0.25rem',
                          fontSize: '0.75rem',
                          fontWeight: '600'
                        }}>
                            ⚠️ {t('inventory.status.low')}
                        </span>
                      ) : (
                        <span style={{
                          padding: '0.25rem 0.5rem',
                          backgroundColor: '#d1fae5',
                          color: '#059669',
                          borderRadius: '0.25rem',
                          fontSize: '0.75rem',
                          fontWeight: '600'
                        }}>
                            ✓ {t('inventory.status.normal')}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                      <button
                        onClick={() => {
                          setEditingItem({ ...item });
                          setShowAddModal(true);
                        }}
                        style={{
                          padding: '0.35rem 0.7rem',
                          backgroundColor: '#3b82f6',
                          color: 'white',
                          border: 'none',
                          borderRadius: '0.25rem',
                          cursor: 'pointer',
                          fontSize: '0.75rem',
                          fontWeight: '600'
                        }}
                      >
                          ✏️ {t('pos.tables.editOne')}
                      </button>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'reorder' && (
        <div style={{ flex: 1, minHeight: 0, backgroundColor: colors.surface, borderRadius: radii.lg, boxShadow: shadows.soft, border: `1px solid ${colors.border}`, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '0.8rem', borderBottom: `1px solid ${colors.border}`, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))', gap: '0.55rem', backgroundColor: colors.surfaceMuted }}>
            {[
              [t('inventory.reorder.pendingItems'), `${filteredReorderSuggestions.length}`],
              [t('inventory.reorder.linkedSuppliers'), `${filteredReorderSuggestions.filter(item => item.supplierSource !== 'unlinked').length}`],
              [t('inventory.reorder.unlinkedSuppliers'), `${filteredReorderSuggestions.filter(item => item.supplierSource === 'unlinked').length}`],
              [t('inventory.reorder.estimatedAmount'), `C$ ${reorderEstimatedAmount.toFixed(2)}`],
            ].map(([label, value]) => (
              <div key={label} style={{ padding: '0.7rem', backgroundColor: colors.surface, border: `1px solid ${colors.border}`, borderRadius: radii.md }}>
                <div style={{ color: colors.textSecondary, fontSize: font.caption }}>{label}</div>
                <div style={{ marginTop: '0.2rem', color: colors.textPrimary, fontSize: font.section, fontWeight: 700 }}>{value}</div>
              </div>
            ))}
          </div>
          <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '980px' }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 1, backgroundColor: colors.surface }}>
                <tr>
                  {[t('inventory.reorder.item'), t('inventory.reorder.currentStock'), t('inventory.table.minStock'), t('inventory.reorder.targetStock'), t('inventory.reorder.suggestedPurchase'), t('inventory.reorder.supplier'), t('inventory.reorder.referenceCost'), t('inventory.reorder.estimatedAmount'), t('inventory.table.actions')].map((title, index) => (
                    <th key={title} style={{ padding: '0.75rem', textAlign: index === 0 || index === 5 ? 'left' : index === 8 ? 'center' : 'right', borderBottom: `2px solid ${colors.border}`, fontSize: font.caption, fontWeight: 700 }}>{title}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredReorderSuggestions.map(suggestion => (
                  <tr key={suggestion.itemId} style={{ borderBottom: `1px solid ${colors.border}` }}>
                    <td style={{ padding: '0.75rem', fontWeight: 700 }}>{suggestion.itemName}</td>
                    <td style={{ padding: '0.75rem', textAlign: 'right', color: suggestion.currentStock < 0 ? colors.danger : colors.textPrimary }}>{suggestion.currentStock.toLocaleString()} {suggestion.unit}</td>
                    <td style={{ padding: '0.75rem', textAlign: 'right' }}>{suggestion.minStock.toLocaleString()} {suggestion.unit}</td>
                    <td style={{ padding: '0.75rem', textAlign: 'right', color: colors.textSecondary }}>{suggestion.targetStock.toLocaleString()} {suggestion.unit}</td>
                    <td style={{ padding: '0.75rem', textAlign: 'right', color: colors.teal, fontWeight: 800 }}>{suggestion.suggestedQuantity.toLocaleString()} {suggestion.unit}</td>
                    <td style={{ padding: '0.75rem' }}>
                      <div style={{ color: suggestion.supplierSource === 'unlinked' ? colors.danger : colors.textPrimary, fontWeight: 650 }}>{suggestion.supplierName}</div>
                      <div style={{ color: colors.textMuted, fontSize: font.caption, marginTop: 2 }}>
                          {suggestion.supplierSource === 'preferred' ? t('inventory.reorder.preferredSupplier') : suggestion.supplierSource === 'latest-purchase' ? t('inventory.reorder.latestSupplier') : t('inventory.reorder.setSupplierHint')}
                      </div>
                    </td>
                    <td style={{ padding: '0.75rem', textAlign: 'right' }}>C$ {suggestion.estimatedUnitCost.toFixed(2)}</td>
                    <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 700 }}>C$ {suggestion.estimatedAmount.toFixed(2)}</td>
                    <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                      <button
                        onClick={() => {
                          const draft = buildReplenishmentPurchaseDraft(suggestion);
                          if (draft) {
                            setPurchaseDraft(draft);
                            setActiveTab('purchase');
                            return;
                          }
                          const inventoryItem = inventoryItems.find(row => row.id === suggestion.itemId);
                          if (inventoryItem) {
                            setEditingItem({ ...inventoryItem });
                            setShowAddModal(true);
                          }
                        }}
                        style={inventoryActionButtonStyle}
                      >
                        {suggestion.supplierSource === 'unlinked' ? t('inventory.reorder.linkSupplier') : t('inventory.reorder.createPurchase')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredReorderSuggestions.length === 0 && (
              <div style={{ minHeight: 260, display: 'grid', placeItems: 'center', color: colors.textMuted }}>
                {lowStockSuggestions.length === 0 ? t('inventory.reorder.empty') : t('inventory.reorder.noMatches')}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 菜品管理 */}
      {activeTab === 'menu' && (
        <div style={{ flex: 1, backgroundColor: 'white', borderRadius: '0.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '1rem', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: '600', margin: 0 }}>菜品管理</h3>
              <button
                onClick={() => setShowCategoryModal(true)}
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
                🏷️ 分类管理
              </button>
            </div>
            <button
              onClick={() => {
                setSelectedMenuImageFile(null);
                setIsProcessingMenuImage(false);
                setEditingMenu({
                  name: '',
                  price: 0,
                  category: categories[0] || '主食',
                  available: true,
                  ingredients: [],
                  image: undefined
                });
                setShowMenuModal(true);
              }}
              style={{
                padding: '0.6rem 1rem',
                backgroundColor: '#10b981',
                color: 'white',
                border: 'none',
                borderRadius: '0.375rem',
                fontWeight: '600',
                cursor: 'pointer',
                fontSize: '0.85rem'
              }}
            >
              ➕ 添加菜品
            </button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '1rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1rem' }}>
              {menuItems.map(menu => (
                <div key={menu.id} style={{
                  padding: '1rem',
                  border: '1px solid #e5e7eb',
                  borderRadius: '0.5rem',
                  backgroundColor: menu.available ? 'white' : '#fee2e2'
                }}>
                  <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.75rem' }}>
                    {/* 菜品图片 */}
                    <div style={{
                      width: '80px',
                      height: '80px',
                      borderRadius: '0.375rem',
                      backgroundColor: '#f3f4f6',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '2rem',
                      flexShrink: 0,
                      overflow: 'hidden'
                    }}>
                      <MenuImage
                        menuId={menu.id}
                        name={menu.name}
                        src={menu.imageThumbUrl || menu.imageUrl}
                        legacySrc={menu.image}
                        cacheVersion={menu.imageUpdatedAt}
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover'
                        }}
                        placeholder={'🍽️'}
                      />                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                        <div>
                          <div style={{ fontWeight: 'bold', fontSize: '1.05rem' }}>{menu.name}</div>
                          <div style={{ fontSize: '0.85rem', color: '#6b7280', marginTop: '0.25rem' }}>
                            {menu.category} · C$ {menu.price}
                          </div>
                        </div>
                        <span style={{
                          padding: '0.25rem 0.5rem',
                          backgroundColor: menu.available ? '#d1fae5' : '#fee2e2',
                          color: menu.available ? '#059669' : '#dc2626',
                          borderRadius: '0.25rem',
                          fontSize: '0.75rem',
                          fontWeight: '600'
                        }}>
                          {menu.available ? '✓ 可售' : '✗ 停售'}
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  <div style={{ marginBottom: '0.75rem', paddingLeft: '90px' }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: '600', marginBottom: '0.5rem', color: '#374151' }}>
                      配方原料：
                    </div>
                    {menu.ingredients?.map((ing, idx) => (
                      <div key={idx} style={{ 
                        padding: '0.35rem 0', 
                        borderBottom: idx < (menu.ingredients?.length || 0) - 1 ? '1px solid #f3f4f6' : 'none',
                        fontSize: '0.85rem',
                        color: '#6b7280'
                      }}>
                        {ing.itemName} - {ing.quantity}{ing.unit}
                      </div>
                    ))}
                  </div>

                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      onClick={() => {
                        setSelectedMenuImageFile(null);
                        setIsProcessingMenuImage(false);
                        setEditingMenu({ ...menu });
                        setShowMenuModal(true);
                      }}
                      style={{
                        flex: 1,
                        padding: '0.5rem',
                        backgroundColor: '#3b82f6',
                        color: 'white',
                        border: 'none',
                        borderRadius: '0.25rem',
                        fontWeight: '600',
                        cursor: 'pointer',
                        fontSize: '0.8rem'
                      }}
                    >
                      ✏️ 编辑
                    </button>
                    <button
                      onClick={() => {
                        setMenuItems(menuItems.map(m => 
                          m.id === menu.id ? { ...m, available: !m.available } : m
                        ));
                      }}
                      style={{
                        flex: 1,
                        padding: '0.5rem',
                        backgroundColor: menu.available ? '#f59e0b' : '#10b981',
                        color: 'white',
                        border: 'none',
                        borderRadius: '0.25rem',
                        fontWeight: '600',
                        cursor: 'pointer',
                        fontSize: '0.8rem'
                      }}
                    >
                      {menu.available ? '⏸️ 停售' : '▶️ 上架'}
                    </button>
                    <button
                      onClick={() => {
                        if (window.confirm(`确定要删除菜品“${menu.name}”吗？`)) {
                          setMenuItems(menuItems.filter(m => m.id !== menu.id));
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
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 采购入库管理 */}
      {activeTab === 'purchase' && canManagePurchases && (
        <PurchaseManagement
          suppliers={suppliers}
          setSuppliers={setSuppliers}
          purchaseOrders={purchaseOrders}
          setPurchaseOrders={setPurchaseOrders}
          inventoryItems={inventoryItems}
          setInventoryItems={setInventoryItems}
          inventoryCategories={inventoryCategories}
          initialDraft={purchaseDraft}
          onInitialDraftConsumed={() => setPurchaseDraft(null)}
        />
      )}

      {/* 出入库记录 */}
      {activeTab === 'records' && (
        <div style={{ flex: 1, backgroundColor: 'white', borderRadius: '0.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '0.9rem 1rem', borderBottom: '1px solid #e5e7eb', display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              type="text"
              value={stockRecordSearchTerm}
              onChange={(event) => setStockRecordSearchTerm(event.target.value)}
              placeholder={t('inventory.record.search')}
              style={{
                flex: '1 1 320px',
                padding: '0.65rem 0.8rem',
                border: '1px solid #d1d5db',
                borderRadius: '0.45rem',
                fontSize: '0.92rem',
                outline: 'none'
              }}
            />
            <input
              type="date"
              value={stockRecordStartDate}
              max={stockRecordEndDate}
              onChange={(event) => setStockRecordStartDate(event.target.value)}
              aria-label={t('inventory.record.startDate')}
              style={inventoryInputStyle}
            />
            <span style={{ color: colors.textSecondary }}>{t('inventory.record.to')}</span>
            <input
              type="date"
              value={stockRecordEndDate}
              min={stockRecordStartDate}
              onChange={(event) => setStockRecordEndDate(event.target.value)}
              aria-label={t('inventory.record.endDate')}
              style={inventoryInputStyle}
            />
            <button type="button" onClick={() => void loadStockRecords()} disabled={isLoadingStockRecords} style={inventoryActionButtonStyle}>
              {isLoadingStockRecords ? t('inventory.record.loading') : t('inventory.record.refresh')}
            </button>
            <span style={{ color: '#6b7280', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
              {t('inventory.record.showing')} {filteredStockRecords.length} / {stockRecords.length}
            </span>
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ backgroundColor: '#f9fafb', position: 'sticky', top: 0 }}>
                <tr>
                  {[t('inventory.record.time'), t('inventory.record.item'), t('inventory.record.location'), t('inventory.record.type'), t('inventory.record.quantity'), t('inventory.record.balance'), t('inventory.record.reason'), t('inventory.record.operator')].map((title, index) => (
                    <th key={title} style={{ padding: '0.75rem', textAlign: index === 3 ? 'center' : (index === 4 || index === 5 ? 'right' : 'left'), borderBottom: '2px solid #e5e7eb', fontSize: '0.85rem', fontWeight: '600' }}>{title}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredStockRecords.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ padding: '2rem', textAlign: 'center', color: '#9ca3af' }}>
                    {t('inventory.record.empty')}
                    </td>
                  </tr>
                ) : filteredStockRecords.map(record => (
                  <tr key={record.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '0.75rem', fontSize: '0.85rem', color: '#6b7280' }}>
                          {formatStockRecordTime(record, language === 'es-NI' ? 'es-NI' : 'zh-CN')}
                    </td>
                    <td style={{ padding: '0.75rem', fontWeight: '600' }}>{record.itemName}</td>
                        <td style={{ padding: '0.75rem', fontSize: '0.85rem' }}>{formatStockRecordLocation(record, fridgeNamesById, t)}</td>
                    <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                      <span style={{
                        padding: '0.25rem 0.5rem',
                        backgroundColor: record.type === 'in' ? '#d1fae5' : (record.type === 'out' ? '#dbeafe' : '#fef3c7'),
                        color: record.type === 'in' ? '#059669' : (record.type === 'out' ? '#2563eb' : '#d97706'),
                        borderRadius: '0.25rem',
                        fontSize: '0.75rem',
                        fontWeight: '600'
                      }}>
                            {record.type === 'in' ? `📥 ${t('inventory.record.in')}` : (record.type === 'out' ? `📤 ${t('inventory.record.out')}` : (record.type === 'waste' ? `🗑️ ${t('inventory.record.waste')}` : `🔧 ${t('inventory.record.adjust')}`))}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: '600' }}>
                      {formatStockRecordQuantity(record)}
                    </td>
                    <td style={{ padding: '0.75rem', textAlign: 'right', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
                      {formatStockRecordBalance(record)}
                    </td>
                        <td style={{ padding: '0.75rem', fontSize: '0.85rem' }}>{formatStockRecordReason(record, t)}</td>
                        <td style={{ padding: '0.75rem', fontSize: '0.85rem', color: '#6b7280' }}>{formatStockRecordOperator(record.operator, t)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 添加/编辑物品弹窗 */}
      {showAddModal && (
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
            width: '600px',
            maxHeight: '80vh',
            overflow: 'auto'
          }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '1rem' }}>
              {editingItem.id ? `✏️ ${t('inventory.modal.editItem')}` : `➕ ${t('inventory.modal.addItem')}`}
            </h3>
            
            <div style={{ display: 'grid', gap: '1rem' }}>
              {/* 条形码 - 唯一标识 */}
              <div>
                <label style={{ display: 'block', marginBottom: '0.35rem', fontWeight: '600', fontSize: '0.9rem' }}>
                  {t('inventory.field.barcodeUnique')}<span style={{ color: '#ef4444' }}>*</span>
                </label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input
                    type="text"
                    value={editingItem.barcode || ''}
                    onChange={(e) => setEditingItem({...editingItem, barcode: e.target.value})}
                    placeholder={t('inventory.field.barcodePlaceholder')}
                    style={{
                      flex: 1,
                      padding: '0.6rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '0.375rem',
                      fontSize: '0.9rem',
                      fontFamily: 'monospace',
                      backgroundColor: 'white',
                      cursor: 'text'
                    }}
                  />
                  {!editingItem.id && (
                    <button
                      onClick={() => setEditingItem({...editingItem, barcode: generateBarcode()})}
                      style={{
                        padding: '0.6rem 1rem',
                        backgroundColor: '#8b5cf6',
                        color: 'white',
                        border: 'none',
                        borderRadius: '0.375rem',
                        cursor: 'pointer',
                        fontSize: '0.85rem',
                        fontWeight: '600'
                      }}
                    >
                      🔄 {t('inventory.field.regenerate')}
                    </button>
                  )}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                  {t('inventory.field.barcodeHelp')}
                </div>
              </div>

              {/* 商品名称 */}
              <div>
                <label style={{ display: 'block', marginBottom: '0.35rem', fontWeight: '600', fontSize: '0.9rem' }}>
                  {t('inventory.field.name')} <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="text"
                  value={editingItem.name || ''}
                  onChange={(e) => setEditingItem({...editingItem, name: e.target.value})}
                  placeholder={t('inventory.field.namePlaceholder')}
                  style={{
                    width: '100%',
                    padding: '0.6rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.375rem',
                    fontSize: '0.9rem'
                  }}
                />
              </div>

              {/* 类别和单位 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.35rem', fontWeight: '600', fontSize: '0.9rem' }}>
                    {t('inventory.table.category')} <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <select
                    value={editingItem.category}
                    onChange={(e) => {
                      const newCategory = e.target.value;
                      // ✅ 根据类别自动设置默认单位（西语缩写）
                      const defaultUnit = getDefaultUnitForInventoryCategory(newCategory);
                      setEditingItem({...editingItem, category: newCategory, unit: defaultUnit});
                    }}
                    style={{
                      width: '100%',
                      padding: '0.6rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '0.375rem',
                      fontSize: '0.9rem'
                    }}
                  >
                    {inventoryCategories.map(cat => (
                      <option key={cat.key} value={cat.key}>{cat.icon} {cat.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.35rem', fontWeight: '600', fontSize: '0.9rem' }}>
                    {t('inventory.table.unit')} <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="text"
                    value={editingItem.unit || ''}
                    onChange={(e) => setEditingItem({...editingItem, unit: e.target.value})}
                    placeholder={t('inventory.field.unitPlaceholder')}
                    style={{
                      width: '100%',
                      padding: '0.6rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '0.375rem',
                      fontSize: '0.9rem'
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.35rem', fontWeight: '600', fontSize: '0.9rem' }}>
                  {t('inventory.field.preferredSupplier')}
                </label>
                <select
                  value={editingItem.preferredSupplierId || ''}
                  onChange={(event) => {
                    const supplier = suppliers.find(item => item.id === event.target.value);
                    setEditingItem({
                      ...editingItem,
                      preferredSupplierId: supplier?.id || '',
                      preferredSupplierName: supplier?.name || '',
                    });
                  }}
                  style={{ width: '100%', padding: '0.6rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', fontSize: '0.9rem', backgroundColor: 'white' }}
                >
                  <option value="">{t('inventory.field.autoSupplier')}</option>
                  {suppliers.filter(supplier => supplier.status !== 'inactive').map(supplier => (
                    <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
                  ))}
                </select>
              </div>

              {/* 库存和警戒线 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.35rem', fontWeight: '600', fontSize: '0.9rem' }}>
                    {t('inventory.field.initialStock')}
                  </label>
                  <input
                    type="number"
                    value={editingItem.currentStock || ''}
                    onChange={(e) => setEditingItem({...editingItem, currentStock: e.target.value ? parseFloat(e.target.value) : 0})}
                    placeholder="0"
                    style={{
                      width: '100%',
                      padding: '0.6rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '0.375rem',
                      fontSize: '0.9rem'
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.35rem', fontWeight: '600', fontSize: '0.9rem' }}>
                    {t('inventory.field.minStock')}
                  </label>
                  <input
                    type="number"
                    value={editingItem.minStock || ''}
                    onChange={(e) => setEditingItem({...editingItem, minStock: e.target.value ? parseFloat(e.target.value) : 0})}
                    placeholder="0"
                    style={{
                      width: '100%',
                      padding: '0.6rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '0.375rem',
                      fontSize: '0.9rem'
                    }}
                  />
                </div>
              </div>

              {/* 进价和售价 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.35rem', fontWeight: '600', fontSize: '0.9rem' }}>
                    {t('inventory.field.costPrice')} (C$) <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={editingItem.costPrice || ''}
                    onChange={(e) => setEditingItem({...editingItem, costPrice: e.target.value ? parseFloat(e.target.value) : 0})}
                    placeholder="0.00"
                    style={{
                      width: '100%',
                      padding: '0.6rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '0.375rem',
                      fontSize: '0.9rem'
                    }}
                  />
                  <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                    {t('inventory.field.costHelp')}
                  </div>
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.35rem', fontWeight: '600', fontSize: '0.9rem' }}>
                    {t('inventory.field.salePrice')} (C$)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={editingItem.salePrice || ''}
                    onChange={(e) => setEditingItem({...editingItem, salePrice: e.target.value ? parseFloat(e.target.value) : undefined})}
                    placeholder={t('inventory.field.salePlaceholder')}
                    style={{
                      width: '100%',
                      padding: '0.6rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '0.375rem',
                      fontSize: '0.9rem'
                    }}
                  />
                  <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                    💡 {t('inventory.field.saleHelp')}
                  </div>
                </div>
              </div>

              {/* 利润显示 */}
              {(editingItem.costPrice && editingItem.salePrice) && (
                <div style={{
                  padding: '0.75rem',
                  backgroundColor: (editingItem.salePrice - editingItem.costPrice) > 0 ? '#d1fae5' : '#fee2e2',
                  borderRadius: '0.375rem',
                  textAlign: 'center'
                }}>
                  <div style={{ fontSize: '0.85rem', color: '#374151' }}>
                    {t('inventory.field.unitProfit')}:
                    <span style={{
                      fontSize: '1.2rem',
                      fontWeight: 'bold',
                      color: (editingItem.salePrice - editingItem.costPrice) > 0 ? '#059669' : '#dc2626'
                    }}>
                      {' '}C$ {(editingItem.salePrice - editingItem.costPrice).toFixed(2)}
                    </span>
                  </div>
                </div>
              )}

              {!editingItem.salePrice && editingItem.costPrice && (
                <div style={{
                  padding: '0.75rem',
                  backgroundColor: '#f3f4f6',
                  borderRadius: '0.375rem',
                  textAlign: 'center'
                }}>
                  <div style={{ fontSize: '0.85rem', color: '#6b7280', marginBottom: '0.25rem' }}>💡 {t('inventory.field.profitHelpTitle')}</div>
                  <div style={{ fontSize: '0.8rem', color: '#374151' }}>
                    {t('inventory.field.ingredientHelp')}<br/>
                    {t('inventory.field.recipeProfitHelp')}<br/>
                    <span style={{ color: '#059669', fontWeight: '600' }}>
                      {t('inventory.field.recipeProfitFormula')}
                    </span>
                  </div>
                </div>
              )}

              {/* 标签管理 */}
              <div>
                <label style={{ display: 'block', marginBottom: '0.35rem', fontWeight: '600', fontSize: '0.9rem' }}>
                  {t('inventory.field.tags')}
                </label>
                <input
                  type="text"
                  value={(editingItem.tags || []).join(', ')}
                  onChange={(e) => {
                    const tags = e.target.value.split(',').map(t => t.trim()).filter(t => t);
                    setEditingItem({...editingItem, tags});
                  }}
                  placeholder={t('inventory.field.tagsPlaceholder')}
                  style={{
                    width: '100%',
                    padding: '0.6rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.375rem',
                    fontSize: '0.9rem'
                  }}
                />
                <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                  {t('inventory.field.currentTags')}: {(editingItem.tags || []).length > 0 ? (editingItem.tags || []).join('、') : t('inventory.field.none')}
                </div>
              </div>

              {/* 存放位置 */}
              <div>
                <label style={{ display: 'block', marginBottom: '0.35rem', fontWeight: '600', fontSize: '0.9rem' }}>
                  {t('inventory.field.location')}
                </label>
                <input
                  type="text"
                  value={editingItem.location || ''}
                  onChange={(e) => setEditingItem({...editingItem, location: e.target.value})}
                  placeholder={t('inventory.field.locationPlaceholder')}
                  style={{
                    width: '100%',
                    padding: '0.6rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.375rem',
                    fontSize: '0.9rem'
                  }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
              {editingItem.id && (
                <button
                onClick={async () => {
                  const itemId = editingItem.id;
                  if (!itemId) return;

                  if (!window.confirm(`${t('inventory.confirm.deleteItem')} “${editingItem.name}”? ${t('inventory.confirm.irreversible')}`)) {
                    return;
                  }

                  const linkedMenuItems = isDirectMenuInventoryCategory(editingItem.category)
                    ? menuItems.filter(m => m.stockItemId === itemId)
                    : [];
                  const linkedFridgeInventory = fridgeInventory.filter(inv => inv.itemId === itemId);

                  try {
                    await Promise.all(linkedMenuItems.map(menuItem => smartDeleteDocument('menu_items', menuItem.id)));
                    await Promise.all(linkedFridgeInventory.map(inv => smartDeleteDocument('fridge_inventory', inv.id || `${inv.fridgeId}-${inv.itemId}`)));
                    await smartDeleteDocument('inventory_items', itemId);
                  } catch (error) {
                    console.error('\u5220\u9664\u5e93\u5b58\u7269\u54c1\u5931\u8d25:', error);
                    alert(t('inventory.alert.deleteFailed'));
                    return;
                  }

                  if (linkedMenuItems.length > 0) {
                    setMenuItems(items => items.filter(m => m.stockItemId !== itemId));
                  }
                  setFridgeInventory(items => items.filter(inv => inv.itemId !== itemId));
                  setInventoryItems(items => items.filter(item => item.id !== itemId));

                  setShowAddModal(false);
                  setEditingItem({
                    barcode: generateBarcode(),
                    category: 'ingredient',
                    unit: 'lb'
                  });
                  alert(t('inventory.alert.deleteSuccess'));
                  }}
                  style={{
                    padding: '0.6rem 1.2rem',
                    backgroundColor: '#ef4444',
                    color: 'white',
                    border: 'none',
                    borderRadius: '0.375rem',
                    cursor: 'pointer',
                    fontWeight: '600'
                  }}
                >
                  🗑️ {t('pos.tables.delete')}
                </button>
              )}
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setEditingItem({
                    barcode: generateBarcode(),
                    category: 'ingredient',
                    unit: 'lb'
                  });
                }}
                style={{
                  padding: '0.6rem 1.2rem',
                  backgroundColor: '#f3f4f6',
                  color: '#374151',
                  border: 'none',
                  borderRadius: '0.375rem',
                  cursor: 'pointer',
                  fontWeight: '600'
                }}
              >
                {t('pos.common.cancel')}
              </button>
              <button
                onClick={async () => {
                  if (!editingItem.barcode || !editingItem.name) {
                    alert(t('inventory.alert.requiredFields'));
                    return;
                  }
                  
                  // 🔥 检查条形码是否重复（新增时）
                  if (!editingItem.id) {
                    const duplicateBarcode = inventoryItems.find(item => item.barcode === editingItem.barcode);
                    if (duplicateBarcode) {
                      alert(`❌ ${t('inventory.alert.barcodeUsed')} ${editingItem.barcode}\n\n${t('inventory.field.name')}: ${duplicateBarcode.name}\n${t('inventory.table.category')}: ${duplicateBarcode.category}\n\n${t('inventory.alert.useDifferentBarcode')}`);
                      return;
                    }
                  }
                  
                  // 🔥 检查条形码是否与其他商品重复（编辑时，排除自己）
                  if (editingItem.id) {
                    const duplicateBarcode = inventoryItems.find(item => 
                      item.barcode === editingItem.barcode && item.id !== editingItem.id
                    );
                    if (duplicateBarcode) {
                      alert(`❌ ${t('inventory.alert.barcodeUsedByOther')} ${editingItem.barcode}\n\n${t('inventory.field.name')}: ${duplicateBarcode.name}\n${t('inventory.table.category')}: ${duplicateBarcode.category}\n\n${t('inventory.alert.useDifferentBarcodeOnly')}`);
                      return;
                    }
                  }
                  
                  // 🔥 检查商品名称是否重复（同一类别下）
                  const duplicateName = inventoryItems.find(item => 
                    item.name.toLowerCase() === editingItem.name!.toLowerCase() && 
                    item.category === editingItem.category &&
                    (!editingItem.id || item.id !== editingItem.id)
                  );
                  if (duplicateName) {
                    const confirmDuplicate = window.confirm(
                      `⚠️ ${t('inventory.alert.duplicateName')}\n\n` +
                      `${t('inventory.field.name')}: ${duplicateName.name}\n` +
                      `${t('inventory.table.category')}: ${duplicateName.category}\n` +
                      `${t('inventory.field.barcode')}: ${duplicateName.barcode}\n\n` +
                      t('inventory.alert.continueDuplicate')
                    );
                    if (!confirmDuplicate) {
                      return;
                    }
                  }
                  
                  if (editingItem.id) {
                    // 编辑现有物品
                    const oldItem = inventoryItems.find(item => item.id === editingItem.id);
                    const barcodeChanged = false;
                    const newId = editingItem.id;
                    const now = Date.now();
                    const updatedInventoryItem = {
                      ...(oldItem || {}),
                      id: newId,
                      barcode: editingItem.barcode!,
                      name: editingItem.name!,
                      category: editingItem.category!,
                      unit: editingItem.unit || getDefaultUnitForInventoryCategory(editingItem.category || 'ingredient'),
                      currentStock: editingItem.currentStock || 0,
                      minStock: editingItem.minStock || 0,
                      costPrice: editingItem.costPrice || 0,
                      salePrice: editingItem.salePrice || 0,
                      tags: editingItem.tags || [],
                      location: editingItem.location,
                      preferredSupplierId: editingItem.preferredSupplierId || '',
                      preferredSupplierName: editingItem.preferredSupplierName || '',
                      lastUpdated: new Date(),
                      lastModified: now
                    };
                    const stockAdjustmentRecord = oldItem
                      ? createInventoryItemEditStockRecord(oldItem, updatedInventoryItem, now)
                      : null;
                    
                    let updatedMenuItem: any = null;
                    try {
                      await smartUpdateDocument('inventory_items', newId, {
                        ...updatedInventoryItem,
                      });
                      if (stockAdjustmentRecord) {
                        await smartAddDocument('inventory_stock_records', stockAdjustmentRecord);
                      }
                      if (barcodeChanged) {
                        await smartDeleteDocument('inventory_items', editingItem.id);
                      }

                      if (isDirectMenuInventoryCategory(updatedInventoryItem.category)) {
                        const menuItem = menuItems.find(m => m.stockItemId === editingItem.id);
                        if (menuItem) {
                          updatedMenuItem = {
                            ...menuItem,
                            name: editingItem.name!,
                            price: editingItem.salePrice || 0,
                            category: getMenuCategoryForInventoryCategory(updatedInventoryItem.category),
                            type: 'direct',
                            stockItemId: newId,
                            available: menuItem.available !== false,
                            lastModified: now
                          };
                          await smartUpdateDocument('menu_items', menuItem.id, updatedMenuItem);
                        } else {
                          updatedMenuItem = {
                            id: `menu-${newId}`,
                            name: editingItem.name!,
                            nameEs: '',
                            price: editingItem.salePrice || 0,
                            category: getMenuCategoryForInventoryCategory(updatedInventoryItem.category),
                            type: 'direct' as 'direct',
                            stockItemId: newId,
                            available: true,
                            lastModified: now
                          };
                          await smartAddDocument('menu_items', updatedMenuItem);
                        }
                      }
                    } catch (error) {
                      console.error('\u540c\u6b65\u7269\u54c1\u5931\u8d25:', error);
                      alert(t('inventory.alert.saveFailed'));
                      return;
                    }

                    setInventoryItems(items => items.map(item =>
                      item.id === editingItem.id ? updatedInventoryItem : item
                    ));
                    if (stockAdjustmentRecord) {
                      setStockRecords(records => [stockAdjustmentRecord, ...records]);
                    }

                    if (updatedMenuItem) {
                      setMenuItems(items => {
                        const exists = items.some(m => m.id === updatedMenuItem.id);
                        return exists
                          ? items.map(m => m.id === updatedMenuItem.id ? updatedMenuItem : m)
                          : [...items, updatedMenuItem];
                      });
                    }

                    alert(t('inventory.alert.updateSuccess'));
                  } else {
                    // 添加新物品
                    const now = Date.now();
                    const defaultUnit = getDefaultUnitForInventoryCategory(editingItem.category || 'ingredient');
                    const newItem: InventoryItem = {
                      id: editingItem.barcode!, // id必须等于barcode，作为全局唯一标识
                      barcode: editingItem.barcode!,
                      name: editingItem.name!,
                      category: editingItem.category!,
                      unit: editingItem.unit || defaultUnit,
                      currentStock: editingItem.currentStock || 0,
                      minStock: editingItem.minStock || 0,
                      costPrice: editingItem.costPrice || 0,
                      salePrice: editingItem.salePrice || 0,
                      tags: editingItem.tags || [],
                      location: editingItem.location,
                      preferredSupplierId: editingItem.preferredSupplierId || '',
                      preferredSupplierName: editingItem.preferredSupplierName || '',
                      lastUpdated: new Date(),
                      lastModified: now
                    };
                    let newMenuItem: any = null;
                    try {
                      await smartAddDocument('inventory_items', newItem);

                      if (isDirectMenuInventoryCategory(newItem.category)) {
                        newMenuItem = {
                          id: `menu-${Date.now()}`,
                          name: editingItem.name!,
                          nameEs: '',
                          price: editingItem.salePrice || 0,
                          category: getMenuCategoryForInventoryCategory(newItem.category),
                          type: 'direct' as 'direct',
                          stockItemId: newItem.id,
                          available: true,
                          lastModified: now
                        };
                        await smartAddDocument('menu_items', newMenuItem);
                      }
                    } catch (error) {
                      console.error('\u540c\u6b65\u65b0\u7269\u54c1\u5931\u8d25:', error);
                      alert(t('inventory.alert.addFailed'));
                      return;
                    }

                    setInventoryItems([...inventoryItems, newItem]);
                    if (newMenuItem) {
                      setMenuItems([...menuItems, newMenuItem]);
                      alert(t('inventory.alert.addedAndSynced'));
                    } else {
                      alert(t('inventory.alert.addSuccess'));
                    }
                  }
                  
                  setShowAddModal(false);
                  setEditingItem({
                    barcode: generateBarcode(),
                    category: 'ingredient',
                    unit: 'lb'
                  });
                }}
                style={{
                  padding: '0.6rem 1.2rem',
                  backgroundColor: '#10b981',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.375rem',
                  cursor: 'pointer',
                  fontWeight: '600'
                }}
              >
                {editingItem.id ? `💾 ${t('inventory.modal.saveChanges')}` : `✅ ${t('inventory.modal.confirmAdd')}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 菜品编辑弹窗 */}
      {showMenuModal && (
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
            width: '700px',
            maxHeight: '85vh',
            overflow: 'auto'
          }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '1rem' }}>
              {editingMenu.id ? '编辑菜品' : '添加菜品'}
            </h3>
            
            <div style={{ display: 'grid', gap: '1rem' }}>
              {/* 菜品图片上传 */}
              <div>
                <label style={{ display: 'block', marginBottom: '0.35rem', fontWeight: '600', fontSize: '0.9rem' }}>
                  菜品图片
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setSelectedMenuImageFile(file);
                    }
                  }}
                  style={{ display: 'none' }}
                  id="menu-image-upload"
                />
                <label
                  htmlFor="menu-image-upload"
                  style={{
                    width: '120px',
                    height: '120px',
                    border: '2px dashed #d1d5db',
                    borderRadius: '0.5rem',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    backgroundColor: '#f9fafb',
                    overflow: 'hidden',
                    position: 'relative'
                  }}
                >
                  {selectedMenuImageFile ? (
                    <>
                      <div style={{ fontSize: '2rem' }}>🖼️</div>
                      <div style={{ fontSize: '0.75rem', color: '#2563eb', marginTop: '0.4rem', textAlign: 'center' }}>
                        保存时压缩上传
                      </div>
                    </>
                  ) : (editingMenu.imageThumbUrl || editingMenu.imageUrl || editingMenu.image || editingMenu.imageUpdatedAt || editingMenu.imageUploadPending) ? (
                    <MenuImage
                      menuId={editingMenu.id || 'new-menu'}
                      name={editingMenu.name || '菜品'}
                      src={editingMenu.imageThumbUrl || editingMenu.imageUrl}
                      legacySrc={editingMenu.image}
                      cacheVersion={editingMenu.imageUpdatedAt}
                      variant="medium"
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover'
                      }}
                    />
                  ) : (
                    <>
                      <div style={{ fontSize: '2.5rem' }}>📷</div>
                      <div style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: '0.5rem' }}>点击上传</div>
                    </>
                  )}
                </label>
              </div>

              {/* 菜品名称 */}
              <div>
                <label style={{ display: 'block', marginBottom: '0.35rem', fontWeight: '600', fontSize: '0.9rem' }}>
                  菜品名称 <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="text"
                  value={editingMenu.name || ''}
                  onChange={(e) => setEditingMenu({...editingMenu, name: e.target.value})}
                  placeholder="输入菜品名称"
                  style={{
                    width: '100%',
                    padding: '0.6rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.375rem',
                    fontSize: '0.9rem'
                  }}
                />
              </div>

              {/* 分类和价格 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.35rem', fontWeight: '600', fontSize: '0.9rem' }}>
                    分类 <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <select
                    value={editingMenu.category}
                    onChange={(e) => setEditingMenu({...editingMenu, category: e.target.value})}
                    style={{
                      width: '100%',
                      padding: '0.6rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '0.375rem',
                      fontSize: '0.9rem'
                    }}
                  >
                    {categories.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.35rem', fontWeight: '600', fontSize: '0.9rem' }}>
                    价格 (C$) <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={editingMenu.price || ''}
                    onChange={(e) => setEditingMenu({...editingMenu, price: e.target.value ? parseFloat(e.target.value) : 0})}
                    placeholder="0.00"
                    style={{
                      width: '100%',
                      padding: '0.6rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '0.375rem',
                      fontSize: '0.9rem'
                    }}
                  />
                </div>
              </div>

              {/* 商品类型 */}
              <div>
                <label style={{ display: 'block', marginBottom: '0.35rem', fontWeight: '600', fontSize: '0.9rem' }}>
                  商品类型 <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <select
                  value={editingMenu.type || 'recipe'}
                  onChange={(e) => {
                    const newType = e.target.value as 'recipe' | 'direct';
                    setEditingMenu({
                      ...editingMenu,
                      type: newType,
                      // 如果切换到直接扣库存，清空配方
                      ingredients: newType === 'recipe' ? editingMenu.ingredients : []
                    });
                  }}
                  style={{
                    width: '100%',
                    padding: '0.6rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.375rem',
                    fontSize: '0.9rem'
                  }}
                >
                  <option value="recipe">📝 需要配方（按配方扣原料）</option>
                  <option value="direct">📦 直接扣库存（成品销售）</option>
                </select>
                <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: '#6b7280' }}>
                  💡 需要配方：现制菜品，扣减多种原料 | 直接扣库存：方便面、瓶装饮料等成品
                </div>
              </div>

              {/* 配方原料 / 关联库存商品 */}
              {editingMenu.type === 'direct' ? (
                // 直接扣库存模式：关联库存商品
                <div>
                  <label style={{ display: 'block', marginBottom: '0.35rem', fontWeight: '600', fontSize: '0.9rem' }}>
                    关联库存商品 <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <select
                    value={editingMenu.ingredients?.[0]?.itemId || ''}
                    onChange={(e) => {
                      const selectedItem = inventoryItems.find(item => item.id === e.target.value);
                      if (selectedItem) {
                        setEditingMenu({
                          ...editingMenu,
                          stockItemId: selectedItem.id, // 设置 stockItemId
                          ingredients: [{
                            itemId: selectedItem.id,
                            itemName: selectedItem.name,
                            quantity: 1,
                            unit: selectedItem.unit
                          }]
                        });
                      }
                    }}
                    style={{
                      width: '100%',
                      padding: '0.6rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '0.375rem',
                      fontSize: '0.9rem'
                    }}
                  >
                    <option value="">请选择库存商品</option>
                    {inventoryItems
                      .filter(item => item.category !== 'ingredient') // 排除食材，只显示成品
                      .map(item => (
                        <option key={item.id} value={item.id}>
                          {item.name} (库存: {item.currentStock} {item.unit})
                        </option>
                      ))
                    }
                  </select>
                  <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: '#6b7280' }}>
                    💡 直接关联库存商品，售出一个自动扣减一个库存
                  </div>
                </div>
              ) : (
                // 菜品：显示配方管理
                <div>
                <label style={{ display: 'block', marginBottom: '0.35rem', fontWeight: '600', fontSize: '0.9rem' }}>
                  配方原料
                </label>
                <div style={{ backgroundColor: '#f9fafb', padding: '1rem', borderRadius: '0.375rem' }}>
                  {(editingMenu.ingredients || []).map((ing, idx) => (
                    <div key={idx} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', alignItems: 'center' }}>
                      <select
                        value={ing.itemId}
                        onChange={(e) => {
                          const selectedItem = inventoryItems.find(item => item.id === e.target.value);
                          const newIngredients = [...(editingMenu.ingredients || [])];
                          newIngredients[idx] = { 
                            ...ing, 
                            itemId: e.target.value,
                            itemName: selectedItem ? selectedItem.name : '',
                            unit: selectedItem ? selectedItem.unit : ing.unit
                          };
                          setEditingMenu({...editingMenu, ingredients: newIngredients});
                        }}
                        style={{
                          flex: 2,
                          padding: '0.5rem',
                          border: '1px solid #d1d5db',
                          borderRadius: '0.25rem',
                          fontSize: '0.85rem'
                        }}
                      >
                        <option value="">请选择原料</option>
                        {inventoryItems.map(item => (
                          <option key={item.id} value={item.id}>
                            {item.name} (库存: {item.currentStock} {item.unit})
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={ing.quantity || ''}
                        onChange={(e) => {
                          const newIngredients = [...(editingMenu.ingredients || [])];
                          newIngredients[idx] = { ...ing, quantity: e.target.value ? parseFloat(e.target.value) : 0 };
                          setEditingMenu({...editingMenu, ingredients: newIngredients});
                        }}
                        placeholder="0.5"
                        style={{
                          flex: 1,
                          padding: '0.5rem',
                          border: '1px solid #d1d5db',
                          borderRadius: '0.25rem',
                          fontSize: '0.85rem'
                        }}
                      />
                      <input
                        type="text"
                        value={ing.unit}
                        onChange={(e) => {
                          const newIngredients = [...(editingMenu.ingredients || [])];
                          newIngredients[idx] = { ...ing, unit: e.target.value };
                          setEditingMenu({...editingMenu, ingredients: newIngredients});
                        }}
                        placeholder="单位"
                        style={{
                          flex: 1,
                          padding: '0.5rem',
                          border: '1px solid #d1d5db',
                          borderRadius: '0.25rem',
                          fontSize: '0.85rem'
                        }}
                      />
                      <button
                        onClick={() => {
                          const newIngredients = (editingMenu.ingredients || []).filter((_, i) => i !== idx);
                          setEditingMenu({...editingMenu, ingredients: newIngredients});
                        }}
                        style={{
                          padding: '0.5rem',
                          backgroundColor: '#ef4444',
                          color: 'white',
                          border: 'none',
                          borderRadius: '0.25rem',
                          cursor: 'pointer',
                          fontSize: '0.85rem'
                        }}
                      >
                        🗑️
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() => {
                      const newIngredients = [...(editingMenu.ingredients || []), { itemId: '', itemName: '', quantity: 0, unit: '磅' }];
                      setEditingMenu({...editingMenu, ingredients: newIngredients});
                    }}
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      backgroundColor: '#3b82f6',
                      color: 'white',
                      border: 'none',
                      borderRadius: '0.25rem',
                      cursor: 'pointer',
                      fontWeight: '600',
                      fontSize: '0.85rem'
                    }}
                  >
                    ➕ 添加原料
                  </button>
                </div>
              </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
              <button
                onClick={() => {
                  setSelectedMenuImageFile(null);
                  setIsProcessingMenuImage(false);
                  setShowMenuModal(false);
                  setEditingMenu({
                    name: '',
                    price: 0,
                    category: '主食',
                    available: true,
                    ingredients: []
                  });
                }}
                style={{
                  padding: '0.6rem 1.2rem',
                  backgroundColor: '#f3f4f6',
                  color: '#374151',
                  border: 'none',
                  borderRadius: '0.375rem',
                  cursor: 'pointer',
                  fontWeight: '600'
                }}
              >
                取消
              </button>
              <button
                disabled={isProcessingMenuImage}
                onClick={async () => {
                  if (!editingMenu.name || !editingMenu.price) {
                    alert('请填写菜品名称和价格');
                    return;
                  }
                  try {
                    setIsProcessingMenuImage(true);
                    let imageFields: Partial<MenuItem> = {};
                    const menuIdForSave = editingMenu.id || `menu-${Date.now()}`;

                    if (selectedMenuImageFile) {
                      imageFields = await processAndUploadMenuImage(menuIdForSave, selectedMenuImageFile);
                      if (imageFields.imageUploadPending) {
                        alert('图片已压缩并保存在本机，但还没有上传到云端。当前终端可显示，其他终端需要等网络/权限恢复后自动同步。');
                      }
                    }

                    if (editingMenu.id) {
                      const updatedMenu = {
                        ...menuItems.find(m => m.id === editingMenu.id),
                        ...editingMenu,
                        ...imageFields,
                        image: selectedMenuImageFile ? undefined : editingMenu.image,
                        lastModified: Date.now()
                      } as MenuItem;
                      setMenuItems(menuItems.map(m =>
                        m.id === editingMenu.id ? updatedMenu : m
                      ));
                      await smartUpdateDocument('menu_items', editingMenu.id, updatedMenu);
                    } else {
                      const now = Date.now();
                      const newMenu: MenuItem = {
                        id: menuIdForSave,
                        name: editingMenu.name!,
                        price: editingMenu.price!,
                        category: editingMenu.category || '主食',
                        available: editingMenu.available !== false,
                        ingredients: editingMenu.ingredients || [],
                        ...imageFields,
                        lastModified: now
                      } as MenuItem;
                      setMenuItems([...menuItems, newMenu]);
                      await smartSetDocument('menu_items', newMenu.id, newMenu);
                    }

                    setShowMenuModal(false);
                    setSelectedMenuImageFile(null);
                    setEditingMenu({
                      name: '',
                      price: 0,
                      category: '主食',
                      available: true,
                      ingredients: []
                    });
                    alert(editingMenu.id ? '修改成功！' : '添加成功！');
                  } catch (error: any) {
                    console.error('保存菜品失败:', error);
                    alert(error?.message || '保存失败，请检查网络后重试');
                  } finally {
                    setIsProcessingMenuImage(false);
                  }                }}
                style={{
                  padding: '0.6rem 1.2rem',
                  backgroundColor: '#10b981',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.375rem',
                  cursor: isProcessingMenuImage ? 'not-allowed' : 'pointer',
                  fontWeight: '600'
                }}
              >
                {isProcessingMenuImage ? '图片处理中...' : '确认保存'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 分类管理弹窗 */}
      {showCategoryModal && (
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
            width: '500px',
            maxHeight: '70vh',
            overflow: 'auto'
          }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '1rem' }}>
              🏷️ 菜品分类管理
            </h3>
            
            {/* 添加新分类 */}
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.35rem', fontWeight: '600', fontSize: '0.9rem' }}>
                添加新分类
              </label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  type="text"
                  value={editingCategory.name}
                  onChange={(e) => setEditingCategory({ name: e.target.value })}
                  placeholder="输入分类名称"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && editingCategory.name.trim()) {
                      if (categories.includes(editingCategory.name.trim())) {
                        alert('该分类已存在');
                        return;
                      }
                      setCategories([...categories, editingCategory.name.trim()]);
                      setEditingCategory({ name: '' });
                    }
                  }}
                  style={{
                    flex: 1,
                    padding: '0.6rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.375rem',
                    fontSize: '0.9rem'
                  }}
                />
                <button
                  onClick={() => {
                    if (!editingCategory.name.trim()) {
                      alert('请输入分类名称');
                      return;
                    }
                    if (categories.includes(editingCategory.name.trim())) {
                      alert('该分类已存在');
                      return;
                    }
                    setCategories([...categories, editingCategory.name.trim()]);
                    setEditingCategory({ name: '' });
                  }}
                  style={{
                    padding: '0.6rem 1rem',
                    backgroundColor: '#10b981',
                    color: 'white',
                    border: 'none',
                    borderRadius: '0.375rem',
                    fontWeight: '600',
                    cursor: 'pointer',
                    fontSize: '0.85rem'
                  }}
                >
                  ➕ 添加
                </button>
              </div>
            </div>

            {/* 分类列表 */}
            <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '1rem' }}>
              <div style={{ fontSize: '0.9rem', fontWeight: '600', marginBottom: '0.75rem', color: '#374151' }}>
                现有分类 ({categories.length})
              </div>
              <div style={{ display: 'grid', gap: '0.5rem' }}>
                {categories.map((cat, idx) => (
                  <div key={idx} style={{
                    padding: '0.75rem',
                    backgroundColor: '#f9fafb',
                    borderRadius: '0.375rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    border: '1px solid #e5e7eb'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontSize: '1.2rem' }}>🏷️</span>
                      <span style={{ fontWeight: '600', fontSize: '0.95rem' }}>{cat}</span>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        onClick={() => {
                          const newName = prompt('修改分类名称:', cat);
                          if (newName && newName.trim() && newName.trim() !== cat) {
                            if (categories.includes(newName.trim())) {
                              alert('该分类名称已存在');
                              return;
                            }
                            const newCategories = [...categories];
                            newCategories[idx] = newName.trim();
                            setCategories(newCategories);
                            // 同时更新使用该分类的菜品
                            setMenuItems(menuItems.map(menu => 
                              menu.category === cat ? { ...menu, category: newName.trim() } : menu
                            ));
                          }
                        }}
                        style={{
                          padding: '0.35rem 0.6rem',
                          backgroundColor: '#3b82f6',
                          color: 'white',
                          border: 'none',
                          borderRadius: '0.25rem',
                          cursor: 'pointer',
                          fontSize: '0.75rem',
                          fontWeight: '600'
                        }}
                      >
                        ✏️ 编辑
                      </button>
                      <button
                        onClick={() => {
                          const usedCount = menuItems.filter(m => m.category === cat).length;
                          if (usedCount > 0) {
                            if (!window.confirm(`该分类下有 ${usedCount} 个菜品，删除后这些菜品将保留原分类名称。确定要删除吗？`)) {
                              return;
                            }
                          } else {
                            if (!window.confirm(`确定要删除分类“${cat}”吗？`)) {
                              return;
                            }
                          }
                          setCategories(categories.filter((_, i) => i !== idx));
                        }}
                        style={{
                          padding: '0.35rem 0.6rem',
                          backgroundColor: '#ef4444',
                          color: 'white',
                          border: 'none',
                          borderRadius: '0.25rem',
                          cursor: 'pointer',
                          fontSize: '0.75rem',
                          fontWeight: '600'
                        }}
                      >
                        🗑️ 删除
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
              <button
                onClick={() => {
                  setShowCategoryModal(false);
                  setEditingCategory({ name: '' });
                }}
                style={{
                  padding: '0.6rem 1.2rem',
                  backgroundColor: '#f3f4f6',
                  color: '#374151',
                  border: 'none',
                  borderRadius: '0.375rem',
                  cursor: 'pointer',
                  fontWeight: '600'
                }}
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 库存类别管理弹窗 */}
      {showInventoryCategoryModal && (
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
            width: '600px',
            maxHeight: '70vh',
            overflow: 'auto'
          }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '1rem' }}>
              🏷️ {t('inventory.category.title')}
            </h3>
            
            {/* 添加新类别 */}
            <div style={{ marginBottom: '1rem', padding: '1rem', backgroundColor: '#f9fafb', borderRadius: '0.375rem' }}>
              <div style={{ fontSize: '0.9rem', fontWeight: '600', marginBottom: '0.75rem' }}>{t('inventory.category.add')}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr auto', gap: '0.5rem' }}>
                <input
                  type="text"
                  value={editingInventoryCategory.icon}
                  onChange={(e) => setEditingInventoryCategory({...editingInventoryCategory, icon: e.target.value})}
                  placeholder={t('inventory.category.icon')}
                  style={{
                    padding: '0.5rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.25rem',
                    fontSize: '0.9rem',
                    textAlign: 'center'
                  }}
                />
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input
                    type="text"
                    value={editingInventoryCategory.name}
                    onChange={(e) => {
                      const name = e.target.value;
                      // 自动生成 key：拼音首字母或简单转换
                      const key = name ? (editingInventoryCategory.key || `cat_${Date.now()}`) : '';
                      setEditingInventoryCategory({...editingInventoryCategory, name, key});
                    }}
                    placeholder={t('inventory.category.name')}
                    style={{
                      flex: 1,
                      padding: '0.5rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '0.25rem',
                      fontSize: '0.9rem'
                    }}
                  />
                  <button
                    onClick={async () => {
                      if (!editingInventoryCategory.name) {
                        alert(t('inventory.category.nameRequired'));
                        return;
                      }
                      if (inventoryCategories.find(c => c.key === editingInventoryCategory.key)) {
                        alert(t('inventory.category.exists'));
                        return;
                      }
                      const newCategory = {
                        ...editingInventoryCategory,
                        id: editingInventoryCategory.key,
                        sortOrder: inventoryCategories.length,
                        lastModified: Date.now()
                      };
                      try {
                        await saveInventoryCategoryChange([...inventoryCategories, newCategory], newCategory);
                      } catch (error) {
                        console.error('保存库存类别失败:', error);
                        alert(t('inventory.category.saveFailed'));
                        return;
                      }
                      setEditingInventoryCategory({ key: '', name: '', icon: '📦' });
                    }}
                    style={{
                      padding: '0.5rem 0.8rem',
                      backgroundColor: '#10b981',
                      color: 'white',
                      border: 'none',
                      borderRadius: '0.25rem',
                      cursor: 'pointer',
                      fontWeight: '600',
                      fontSize: '0.8rem'
                    }}
                  >
                    ➕
                  </button>
                </div>
              </div>
            </div>

            {/* 类别列表 */}
            <div>
              <div style={{ fontSize: '0.9rem', fontWeight: '600', marginBottom: '0.75rem', color: '#374151' }}>
                {t('inventory.category.existing')} ({inventoryCategories.length})
              </div>
              <div style={{ display: 'grid', gap: '0.5rem' }}>
                {inventoryCategories.map((cat, idx) => (
                  <div key={cat.key} style={{
                    padding: '0.75rem',
                    backgroundColor: '#f9fafb',
                    borderRadius: '0.375rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    border: '1px solid #e5e7eb'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <span style={{ fontSize: '1.5rem' }}>{cat.icon}</span>
                      <div>
                        <div style={{ fontWeight: '600', fontSize: '0.95rem' }}>{cat.name}</div>
                        <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>{t('inventory.category.key')}: {cat.key}</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        onClick={async () => {
                          if (idx <= 0) return;
                          const nextCategories = [...inventoryCategories];
                          [nextCategories[idx - 1], nextCategories[idx]] = [nextCategories[idx], nextCategories[idx - 1]];
                          try {
                            await saveInventoryCategoryOrder(nextCategories);
                          } catch (error) {
                            console.error('保存库存类别排序失败:', error);
                            alert(t('inventory.category.orderFailed'));
                          }
                        }}
                        disabled={idx <= 0}
                        style={{
                          padding: '0.35rem 0.5rem',
                          backgroundColor: idx <= 0 ? '#e5e7eb' : '#f3f4f6',
                          color: '#374151',
                          border: '1px solid #d1d5db',
                          borderRadius: '0.25rem',
                          cursor: idx <= 0 ? 'not-allowed' : 'pointer',
                          fontSize: '0.75rem',
                          fontWeight: '600'
                        }}
                      >
                        ▲
                      </button>
                      <button
                        onClick={async () => {
                          if (idx >= inventoryCategories.length - 1) return;
                          const nextCategories = [...inventoryCategories];
                          [nextCategories[idx], nextCategories[idx + 1]] = [nextCategories[idx + 1], nextCategories[idx]];
                          try {
                            await saveInventoryCategoryOrder(nextCategories);
                          } catch (error) {
                            console.error('保存库存类别排序失败:', error);
                            alert(t('inventory.category.orderFailed'));
                          }
                        }}
                        disabled={idx >= inventoryCategories.length - 1}
                        style={{
                          padding: '0.35rem 0.5rem',
                          backgroundColor: idx >= inventoryCategories.length - 1 ? '#e5e7eb' : '#f3f4f6',
                          color: '#374151',
                          border: '1px solid #d1d5db',
                          borderRadius: '0.25rem',
                          cursor: idx >= inventoryCategories.length - 1 ? 'not-allowed' : 'pointer',
                          fontSize: '0.75rem',
                          fontWeight: '600'
                        }}
                      >
                        ▼
                      </button>
                      <button
                        onClick={async () => {
                          const newName = prompt(t('inventory.category.editName'), cat.name);
                          const newIcon = prompt(t('inventory.category.editIcon'), cat.icon);
                          if (newName && newIcon) {
                            const newCats = [...inventoryCategories];
                            const updatedCategory = { ...cat, id: cat.id || cat.key, name: newName, icon: newIcon, lastModified: Date.now() };
                            newCats[idx] = updatedCategory;
                            try {
                              await saveInventoryCategoryChange(newCats, updatedCategory);
                            } catch (error) {
                              console.error('保存库存类别失败:', error);
                              alert(t('inventory.category.saveFailed'));
                            }
                          }
                        }}
                        style={{
                          padding: '0.35rem 0.6rem',
                          backgroundColor: '#3b82f6',
                          color: 'white',
                          border: 'none',
                          borderRadius: '0.25rem',
                          cursor: 'pointer',
                          fontSize: '0.75rem',
                          fontWeight: '600'
                        }}
                      >
                        ✏️ {t('pos.tables.editOne')}
                      </button>
                      <button
                        onClick={async () => {
                          if (inventoryCategories.length <= 1) {
                            alert(t('inventory.category.keepOne'));
                            return;
                          }
                          if (!window.confirm(`${t('inventory.category.deleteConfirm')} “${cat.name}”?`)) {
                            return;
                          }
                          const nextCategories = inventoryCategories.filter((_, i) => i !== idx);
                          try {
                            await deleteInventoryCategoryFromCloud(nextCategories, cat);
                          } catch (error) {
                            console.error('删除库存类别失败:', error);
                            alert(t('inventory.category.deleteFailed'));
                            return;
                          }
                        }}
                        style={{
                          padding: '0.35rem 0.6rem',
                          backgroundColor: '#ef4444',
                          color: 'white',
                          border: 'none',
                          borderRadius: '0.25rem',
                          cursor: 'pointer',
                          fontSize: '0.75rem',
                          fontWeight: '600'
                        }}
                      >
                        🗑️ {t('pos.tables.delete')}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
              <button
                onClick={() => {
                  setShowInventoryCategoryModal(false);
                  setEditingInventoryCategory({ key: '', name: '', icon: '📦' });
                }}
                style={{
                  padding: '0.6rem 1.2rem',
                  backgroundColor: '#f3f4f6',
                  color: '#374151',
                  border: 'none',
                  borderRadius: '0.375rem',
                  cursor: 'pointer',
                  fontWeight: '600'
                }}
              >
                {t('pos.common.close')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Inventory;
