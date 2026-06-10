import React, { useState } from 'react';
import PurchaseManagement from './PurchaseManagement';
import { useAppContext } from '../../contexts/AppContext';
import { smartGetDocuments, smartAddDocument, smartUpdateDocument, smartDeleteDocument, smartSetDocument } from '../../services/smartSyncService';
import { dataService } from '../../services/DataService';
import MenuImage from '../../components/MenuImage';
import { processAndUploadMenuImage } from '../../services/menuImageService';

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
  type: 'in' | 'out' | 'adjust' | 'waste';
  quantity: number;
  reason: string;
  date: Date;
  operator: string;
}

interface InventoryProps {
  defaultTab?: 'items' | 'menu' | 'purchase' | 'records';
}

interface InventoryCategory {
  id?: string;
  key: string;
  name: string;
  icon: string;
  lastModified?: number;
}

const DEFAULT_INVENTORY_CATEGORIES: InventoryCategory[] = [
  { id: 'ingredient', key: 'ingredient', name: '食材', icon: '🥬' },
  { id: 'alcohol', key: 'alcohol', name: '酒水', icon: '🍺' },
  { id: 'beverage', key: 'beverage', name: '饮料', icon: '🥤' },
  { id: 'other', key: 'other', name: '其他', icon: '📦' }
];

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
      lastModified: Number(category.lastModified || 0) || now
    };
    const existing = merged.get(key);
    if (!existing || (normalized.lastModified || 0) >= (existing.lastModified || 0)) {
      merged.set(key, normalized);
    }
  });

  return Array.from(merged.values());
};

const mergeInventoryCategories = (...groups: any[][]): InventoryCategory[] => normalizeInventoryCategories(groups.flat());

const getInventoryItemVersion = (item: any): number => {
  if (!item) return 0;
  const value = item.lastModified || item.lastUpdated || item.updatedAt || item.createdAt;
  if (!value) return 0;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'object' && typeof value.seconds === 'number') {
    return value.seconds * 1000 + Math.floor((value.nanoseconds || 0) / 1000000);
  }
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
};

const mergeInventoryItemsByVersion = (localItems: InventoryItem[], cloudItems: any[]): InventoryItem[] => {
  const merged = new Map<string, InventoryItem>();

  localItems.forEach(item => {
    if (item?.id) merged.set(String(item.id), item);
  });

  cloudItems.forEach(cloudItem => {
    if (!cloudItem?.id) return;
    const id = String(cloudItem.id);
    const localItem = merged.get(id);
    if (!localItem || getInventoryItemVersion(cloudItem) >= getInventoryItemVersion(localItem)) {
      merged.set(id, {
        ...cloudItem,
        lastUpdated: cloudItem.lastUpdated ? new Date(cloudItem.lastUpdated) : new Date()
      } as InventoryItem);
    }
  });

  return Array.from(merged.values());
};

const Inventory: React.FC<InventoryProps> = ({ defaultTab = 'items' }) => {
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
    fridgeInventory,
    setFridgeInventory
  } = useAppContext();
  
  const [activeTab, setActiveTab] = useState<'items' | 'menu' | 'purchase' | 'records'>(defaultTab);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showInventorySummary, setShowInventorySummary] = useState(false);
  const [inventoryLastSyncedAt, setInventoryLastSyncedAt] = useState<Date | null>(null);
  const [isRefreshingInventory, setIsRefreshingInventory] = useState(false);

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
  const inventoryCategoryRemoteUpdateRef = React.useRef(false);

  const [inventoryCategories, setInventoryCategories] = useState<InventoryCategory[]>(() => {
    try {
      const serviceData = normalizeInventoryCategories(dataService.getData('inventory_categories'));
      if (serviceData.length > 0) {
        return serviceData;
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
            return parsed;
          }
        }
      }
    } catch (error) {
      console.error('加载库存类别失败:', error);
    }

    return normalizeInventoryCategories(DEFAULT_INVENTORY_CATEGORIES);
  });
  
  React.useEffect(() => {
    let cancelled = false;

    const loadInventoryCategories = async () => {
      try {
        const cloudCategories = await smartGetDocuments('inventory_categories');
        if (cancelled) return;

        const normalizedCloudCategories = normalizeInventoryCategories(cloudCategories);
        if (normalizedCloudCategories.length > 0) {
          inventoryCategoryRemoteUpdateRef.current = true;
          setInventoryCategories(prev => mergeInventoryCategories(prev, normalizedCloudCategories));
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
      localStorage.setItem('inventory_categories', JSON.stringify(normalizedCategories));

      const shouldSyncToCloud = !inventoryCategoryRemoteUpdateRef.current;
      inventoryCategoryRemoteUpdateRef.current = false;
      if (!shouldSyncToCloud) {
        return;
      }

      normalizedCategories.forEach(category => {
        const docId = category.id || category.key;
        smartSetDocument('inventory_categories', docId, category).catch(error => {
          console.error('同步库存类别失败:', error);
        });
      });
    } catch (error) {
      console.error('保存库存类别失败:', error);
    }
  }, [inventoryCategories, getInventoryCategoryStorageKey]);

  const refreshInventoryData = React.useCallback(async () => {
    setIsRefreshingInventory(true);
    try {
      const [cloudItems, cloudCategories] = await Promise.all([
        smartGetDocuments('inventory_items'),
        smartGetDocuments('inventory_categories')
      ]);

      if (cloudItems.length > 0) {
        setInventoryItems(prev => mergeInventoryItemsByVersion(prev, cloudItems));
      }

      const normalizedCloudCategories = normalizeInventoryCategories(cloudCategories);
      if (normalizedCloudCategories.length > 0) {
        inventoryCategoryRemoteUpdateRef.current = true;
        setInventoryCategories(prev => mergeInventoryCategories(prev, normalizedCloudCategories));
      }

      setInventoryLastSyncedAt(new Date());
    } catch (error) {
      console.error('刷新库存数据失败:', error);
      alert('刷新库存数据失败，请检查网络后重试');
    } finally {
      setIsRefreshingInventory(false);
    }
  }, [setInventoryItems]);

  const [stockRecords] = useState<StockRecord[]>(() => {
    try {
      const saved = localStorage.getItem('inventory_stock_records');
      if (saved) {
        const parsed = JSON.parse(saved);
        // 恢复 Date 对象
        return parsed.map((r: any) => ({
          ...r,
          date: r.date ? new Date(r.date) : new Date()
        }));
      }
    } catch (error) {
      console.error('加载库存记录失败:', error);
    }
    // 默认值
    return [
      { id: 'rec1', itemId: 'item1', itemName: '大米', type: 'in', quantity: 50000, reason: '采购入库', date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), operator: '张三' },
      { id: 'rec2', itemId: 'item3', itemName: '可乐', type: 'out', quantity: 12, reason: '销售出库', date: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), operator: '系统' },
    ];
  });

  // 过滤库存物品
  const filteredItems = inventoryItems.filter(item => {
    const matchCategory = categoryFilter === 'all' || item.category === categoryFilter;
    const matchSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                       (item.barcode && item.barcode.includes(searchTerm));
    return matchCategory && matchSearch;
  });

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

  const getFridgeStock = (itemId: string) => {
    return fridgeInventory
      .filter(inv => inv.itemId === itemId)
      .reduce((sum, inv) => sum + Number(inv.quantity || 0), 0);
  };

  const getTotalStock = (item: InventoryItem) => item.currentStock + getFridgeStock(item.id);

  // 检查总库存是否低于警戒线
  const isLowStock = (item: InventoryItem) => getTotalStock(item) <= item.minStock;

  // 模拟扫码功能
  const handleScanBarcode = () => {
    const barcode = prompt('请扫描或输入条形码：');
    if (barcode) {
      setSearchTerm(barcode);
      const found = inventoryItems.find(item => item.barcode === barcode);
      if (found) {
        alert(`找到商品：${found.name}\n条形码：${found.barcode}\n总库存：${getTotalStock(found)} ${found.unit}\n仓库：${found.currentStock} ${found.unit}\n冰箱：${getFridgeStock(found.id)} ${found.unit}`);
      } else {
        alert('未找到该商品');
      }
    }
  };

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', padding: '0.75rem', gap: '0.6rem', overflow: 'hidden' }}>
      {/* 顶部标签和统计 */}
      <div style={{ backgroundColor: 'white', borderRadius: '0.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', padding: '0.65rem', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: activeTab === 'items' ? '0.55rem' : 0 }}>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={() => setActiveTab('items')}
              style={{
                padding: '0.45rem 0.85rem',
                backgroundColor: activeTab === 'items' ? '#3b82f6' : '#f3f4f6',
                color: activeTab === 'items' ? 'white' : '#374151',
                border: 'none',
                borderRadius: '0.375rem',
                fontWeight: '600',
                cursor: 'pointer',
                fontSize: '0.9rem'
              }}
            >
              📦 库存物品
            </button>
            <button
              onClick={() => setActiveTab('purchase')}
              style={{
                padding: '0.45rem 0.85rem',
                backgroundColor: activeTab === 'purchase' ? '#3b82f6' : '#f3f4f6',
                color: activeTab === 'purchase' ? 'white' : '#374151',
                border: 'none',
                borderRadius: '0.375rem',
                fontWeight: '600',
                cursor: 'pointer',
                fontSize: '0.9rem'
              }}
            >
              🛒 采购入库
            </button>
            <button
              onClick={() => setActiveTab('records')}
              style={{
                padding: '0.45rem 0.85rem',
                backgroundColor: activeTab === 'records' ? '#3b82f6' : '#f3f4f6',
                color: activeTab === 'records' ? 'white' : '#374151',
                border: 'none',
                borderRadius: '0.375rem',
                fontWeight: '600',
                cursor: 'pointer',
                fontSize: '0.9rem'
              }}
            >
              📊 出入库记录
            </button>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            {inventoryLastSyncedAt && (
              <span style={{ fontSize: '0.75rem', color: '#6b7280', whiteSpace: 'nowrap' }}>
                最后同步 {inventoryLastSyncedAt.toLocaleTimeString('es-NI', { hour12: false })}
              </span>
            )}
            <button
              onClick={refreshInventoryData}
              disabled={isRefreshingInventory}
              style={{
                padding: '0.45rem 0.75rem',
                backgroundColor: isRefreshingInventory ? '#9ca3af' : '#0ea5e9',
                color: 'white',
                border: 'none',
                borderRadius: '0.375rem',
                fontWeight: '600',
                cursor: isRefreshingInventory ? 'not-allowed' : 'pointer',
                fontSize: '0.85rem'
              }}
            >
              {isRefreshingInventory ? '同步中...' : '刷新库存'}
            </button>
            <button
              onClick={handleScanBarcode}
              style={{
                padding: '0.45rem 0.75rem',
                backgroundColor: '#8b5cf6',
                color: 'white',
                border: 'none',
                borderRadius: '0.375rem',
                fontWeight: '600',
                cursor: 'pointer',
                fontSize: '0.85rem'
              }}
            >
              📷 扫码
            </button>
            <button
              onClick={() => setShowAddModal(true)}
              style={{
                padding: '0.45rem 0.75rem',
                backgroundColor: '#10b981',
                color: 'white',
                border: 'none',
                borderRadius: '0.375rem',
                fontWeight: '600',
                cursor: 'pointer',
                fontSize: '0.85rem'
              }}
            >
              ➕ 添加物品
            </button>
          </div>
        </div>

        {/* 搜索和筛选 */}
        {activeTab === 'items' && (
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              type="text"
              placeholder="搜索商品名称或条形码..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                flex: 1,
                padding: '0.45rem 0.6rem',
                border: '1px solid #d1d5db',
                borderRadius: '0.375rem',
                fontSize: '0.9rem'
              }}
            />
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              style={{
                padding: '0.45rem 0.6rem',
                border: '1px solid #d1d5db',
                borderRadius: '0.375rem',
                fontSize: '0.9rem'
              }}
            >
              <option value="all">全部类别</option>
              {inventoryCategories.map(cat => (
                <option key={cat.key} value={cat.key}>{cat.icon} {cat.name}</option>
              ))}
            </select>
            <button
              onClick={() => setShowInventoryCategoryModal(true)}
              style={{
                padding: '0.45rem 0.75rem',
                backgroundColor: '#8b5cf6',
                color: 'white',
                border: 'none',
                borderRadius: '0.375rem',
                fontWeight: '600',
                cursor: 'pointer',
                fontSize: '0.85rem'
              }}
            >
              🏷️ 类别管理
            </button>
          </div>
        )}
      </div>

      {/* 库存物品列表 */}
      {activeTab === 'items' && (
        <div style={{ flex: 1, minHeight: 0, backgroundColor: 'white', borderRadius: '0.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
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
                      库存总货值 C$ {totalValue.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#6b7280', whiteSpace: 'nowrap' }}>
                      仓库 C$ {warehouseValue.toFixed(2)} / 冰箱 C$ {fridgeValue.toFixed(2)}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: lowStockItems.length > 0 ? '#dc2626' : '#059669', whiteSpace: 'nowrap', fontWeight: '600' }}>
                      {lowStockItems.length > 0 ? `低库存 ${lowStockItems.length} 种` : '库存正常'}
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
                    展开统计
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
                    <div style={{ fontSize: '0.85rem', color: '#6b7280', marginBottom: '0.25rem' }}>💰 库存总货值（仓库 + 冰箱）</div>
                    <div style={{ fontSize: '1.35rem', fontWeight: 'bold', color: '#3b82f6' }}>
                      C$ {totalValue.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.25rem' }}>
                      仓库: C$ {warehouseValue.toFixed(2)} | 冰箱: C$ {fridgeValue.toFixed(2)}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '0.85rem', color: '#6b7280' }}>物品种类</div>
                    <div style={{ fontSize: '1.2rem', fontWeight: '600', color: '#374151' }}>{inventoryItems.length} 种</div>
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
                      收起统计
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
                        {data.quantity.toLocaleString()} 单位
                      </div>
                    </div>
                  ))}
                </div>
                
                {/* 低库存预警 */}
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
                      <span style={{ fontWeight: '600', color: '#dc2626' }}>⚠️ 低库存预警</span>
                      <span style={{ marginLeft: '0.5rem', fontSize: '0.85rem', color: '#991b1b' }}>
                        {lowStockItems.length} 种物品库存不足
                      </span>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '0.75rem', color: '#991b1b' }}>当前货值</div>
                      <div style={{ fontSize: '1rem', fontWeight: '600', color: '#dc2626' }}>
                        C$ {lowStockValue.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
          
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ backgroundColor: '#f9fafb', position: 'sticky', top: 0 }}>
                <tr>
                  <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '2px solid #e5e7eb', fontSize: '0.85rem', fontWeight: '600' }}>商品名称</th>
                  <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '2px solid #e5e7eb', fontSize: '0.85rem', fontWeight: '600' }}>类别</th>
                  <th style={{ padding: '0.75rem', textAlign: 'right', borderBottom: '2px solid #e5e7eb', fontSize: '0.85rem', fontWeight: '600' }}>总库存</th>
                  <th style={{ padding: '0.75rem', textAlign: 'right', borderBottom: '2px solid #e5e7eb', fontSize: '0.85rem', fontWeight: '600' }}>仓库</th>
                  <th style={{ padding: '0.75rem', textAlign: 'right', borderBottom: '2px solid #e5e7eb', fontSize: '0.85rem', fontWeight: '600' }}>冰箱</th>
                  <th style={{ padding: '0.75rem', textAlign: 'right', borderBottom: '2px solid #e5e7eb', fontSize: '0.85rem', fontWeight: '600' }}>警戒线</th>
                  <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '2px solid #e5e7eb', fontSize: '0.85rem', fontWeight: '600' }}>单位</th>
                  <th style={{ padding: '0.75rem', textAlign: 'right', borderBottom: '2px solid #e5e7eb', fontSize: '0.85rem', fontWeight: '600' }}>进价</th>
                  <th style={{ padding: '0.75rem', textAlign: 'right', borderBottom: '2px solid #e5e7eb', fontSize: '0.85rem', fontWeight: '600' }}>售价</th>
                  <th style={{ padding: '0.75rem', textAlign: 'right', borderBottom: '2px solid #e5e7eb', fontSize: '0.85rem', fontWeight: '600' }}>利润</th>
                  <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '2px solid #e5e7eb', fontSize: '0.85rem', fontWeight: '600' }}>位置/标签</th>
                  <th style={{ padding: '0.75rem', textAlign: 'center', borderBottom: '2px solid #e5e7eb', fontSize: '0.85rem', fontWeight: '600' }}>状态</th>
                  <th style={{ padding: '0.75rem', textAlign: 'center', borderBottom: '2px solid #e5e7eb', fontSize: '0.85rem', fontWeight: '600' }}>操作</th>
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
                        <span style={{ color: '#9ca3af', fontSize: '0.8rem' }}>通过菜品计算</span>
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
                      {isLowStock(item) ? (
                        <span style={{
                          padding: '0.25rem 0.5rem',
                          backgroundColor: '#fee2e2',
                          color: '#dc2626',
                          borderRadius: '0.25rem',
                          fontSize: '0.75rem',
                          fontWeight: '600'
                        }}>
                          ⚠️ 库存不足
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
                          ✓ 正常
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
                        ✏️ 编辑
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
      {activeTab === 'purchase' && (
        <PurchaseManagement
          suppliers={suppliers}
          setSuppliers={setSuppliers}
          purchaseOrders={purchaseOrders}
          setPurchaseOrders={setPurchaseOrders}
          inventoryItems={inventoryItems}
          setInventoryItems={setInventoryItems}
          inventoryCategories={inventoryCategories}
        />
      )}

      {/* 出入库记录 */}
      {activeTab === 'records' && (
        <div style={{ flex: 1, backgroundColor: 'white', borderRadius: '0.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ backgroundColor: '#f9fafb', position: 'sticky', top: 0 }}>
                <tr>
                  <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '2px solid #e5e7eb', fontSize: '0.85rem', fontWeight: '600' }}>时间</th>
                  <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '2px solid #e5e7eb', fontSize: '0.85rem', fontWeight: '600' }}>商品</th>
                  <th style={{ padding: '0.75rem', textAlign: 'center', borderBottom: '2px solid #e5e7eb', fontSize: '0.85rem', fontWeight: '600' }}>类型</th>
                  <th style={{ padding: '0.75rem', textAlign: 'right', borderBottom: '2px solid #e5e7eb', fontSize: '0.85rem', fontWeight: '600' }}>数量</th>
                  <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '2px solid #e5e7eb', fontSize: '0.85rem', fontWeight: '600' }}>原因</th>
                  <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '2px solid #e5e7eb', fontSize: '0.85rem', fontWeight: '600' }}>操作员</th>
                </tr>
              </thead>
              <tbody>
                {stockRecords.map(record => (
                  <tr key={record.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '0.75rem', fontSize: '0.85rem', color: '#6b7280' }}>
                      {new Date(record.date).toLocaleString('zh-CN')}
                    </td>
                    <td style={{ padding: '0.75rem', fontWeight: '600' }}>{record.itemName}</td>
                    <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                      <span style={{
                        padding: '0.25rem 0.5rem',
                        backgroundColor: record.type === 'in' ? '#d1fae5' : (record.type === 'out' ? '#dbeafe' : '#fef3c7'),
                        color: record.type === 'in' ? '#059669' : (record.type === 'out' ? '#2563eb' : '#d97706'),
                        borderRadius: '0.25rem',
                        fontSize: '0.75rem',
                        fontWeight: '600'
                      }}>
                        {record.type === 'in' ? '📥 入库' : (record.type === 'out' ? '📤 出库' : (record.type === 'waste' ? '🗑️ 损耗' : '🔧 调整'))}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: '600' }}>
                      {record.type === 'in' ? '+' : '-'}{record.quantity}
                    </td>
                    <td style={{ padding: '0.75rem', fontSize: '0.85rem' }}>{record.reason}</td>
                    <td style={{ padding: '0.75rem', fontSize: '0.85rem', color: '#6b7280' }}>{record.operator}</td>
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
              {editingItem.id ? '✏️ 编辑物品' : '➕ 添加库存物品'}
            </h3>
            
            <div style={{ display: 'grid', gap: '1rem' }}>
              {/* 条形码 - 唯一标识 */}
              <div>
                <label style={{ display: 'block', marginBottom: '0.35rem', fontWeight: '600', fontSize: '0.9rem' }}>
                  条形码（唯一ID）<span style={{ color: '#ef4444' }}>*</span>
                </label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input
                    type="text"
                    value={editingItem.barcode || ''}
                    onChange={(e) => setEditingItem({...editingItem, barcode: e.target.value})}
                    placeholder="请输入或扫描条形码"
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
                      🔄 重新生成
                    </button>
                  )}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                  条形码是唯一标识，用于扫码识别和库存管理
                </div>
              </div>

              {/* 商品名称 */}
              <div>
                <label style={{ display: 'block', marginBottom: '0.35rem', fontWeight: '600', fontSize: '0.9rem' }}>
                  商品名称 <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="text"
                  value={editingItem.name || ''}
                  onChange={(e) => setEditingItem({...editingItem, name: e.target.value})}
                  placeholder="输入商品名称"
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
                    类别 <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <select
                    value={editingItem.category}
                    onChange={(e) => {
                      const newCategory = e.target.value;
                      // ✅ 根据类别自动设置默认单位（西语缩写）
                      const defaultUnit = (newCategory === 'beverage' || newCategory === 'alcohol') ? 'bot' : 'lb';
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
                    单位 <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="text"
                    value={editingItem.unit || ''}
                    onChange={(e) => setEditingItem({...editingItem, unit: e.target.value})}
                    placeholder="克、毫升、瓶、个等"
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

              {/* 库存和警戒线 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.35rem', fontWeight: '600', fontSize: '0.9rem' }}>
                    初始库存
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
                    最低警戒线
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
                    进价 (C$) <span style={{ color: '#ef4444' }}>*</span>
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
                    所有物品都需要填写进价
                  </div>
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.35rem', fontWeight: '600', fontSize: '0.9rem' }}>
                    售价 (C$)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={editingItem.salePrice || ''}
                    onChange={(e) => setEditingItem({...editingItem, salePrice: e.target.value ? parseFloat(e.target.value) : undefined})}
                    placeholder="仅酒水饮料填写"
                    style={{
                      width: '100%',
                      padding: '0.6rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '0.375rem',
                      fontSize: '0.9rem'
                    }}
                  />
                  <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                    💡 食材原料留空，利润通过菜品计算
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
                    单件利润：
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
                  <div style={{ fontSize: '0.85rem', color: '#6b7280', marginBottom: '0.25rem' }}>💡 盈利计算说明</div>
                  <div style={{ fontSize: '0.8rem', color: '#374151' }}>
                    该物品为食材原料，不直接销售<br/>
                    利润将通过菜品配方自动计算：<br/>
                    <span style={{ color: '#059669', fontWeight: '600' }}>
                      菜品利润 = 菜品售价 - 所有原料成本
                    </span>
                  </div>
                </div>
              )}

              {/* 标签管理 */}
              <div>
                <label style={{ display: 'block', marginBottom: '0.35rem', fontWeight: '600', fontSize: '0.9rem' }}>
                  标签（用逗号分隔）
                </label>
                <input
                  type="text"
                  value={(editingItem.tags || []).join(', ')}
                  onChange={(e) => {
                    const tags = e.target.value.split(',').map(t => t.trim()).filter(t => t);
                    setEditingItem({...editingItem, tags});
                  }}
                  placeholder="例如：畅销, 新品, 推荐"
                  style={{
                    width: '100%',
                    padding: '0.6rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.375rem',
                    fontSize: '0.9rem'
                  }}
                />
                <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                  当前标签：{(editingItem.tags || []).length > 0 ? (editingItem.tags || []).join('、') : '无'}
                </div>
              </div>

              {/* 存放位置 */}
              <div>
                <label style={{ display: 'block', marginBottom: '0.35rem', fontWeight: '600', fontSize: '0.9rem' }}>
                  存放位置
                </label>
                <input
                  type="text"
                  value={editingItem.location || ''}
                  onChange={(e) => setEditingItem({...editingItem, location: e.target.value})}
                  placeholder="如：仓库A、冰箱B"
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
                onClick={() => {
                  const itemId = editingItem.id;
                  if (!itemId) return;

                  if (!window.confirm(`确定要删除物品“${editingItem.name}”吗？此操作不可恢复！`)) {
                    return;
                  }
                                  
                  // 如果是酒水或饮料，同时删除对应的菜单项
                  if (editingItem.category === 'beverage' || editingItem.category === 'alcohol') {
                    menuItems
                      .filter(m => m.stockItemId === itemId)
                      .forEach(menuItem => {
                        smartDeleteDocument('menu_items', menuItem.id).catch(error => {
                          console.error('同步删除菜单项失败:', error);
                        });
                      });
                    setMenuItems(items => items.filter(m => m.stockItemId !== itemId));
                  }

                  fridgeInventory
                    .filter(inv => inv.itemId === itemId)
                    .forEach(inv => {
                      const fridgeInventoryId = inv.id || `${inv.fridgeId}-${inv.itemId}`;
                      smartDeleteDocument('fridge_inventory', fridgeInventoryId).catch(error => {
                        console.error('同步删除冰箱库存记录失败:', error);
                      });
                    });
                  setFridgeInventory(items => items.filter(inv => inv.itemId !== itemId));
                  smartDeleteDocument('inventory_items', itemId).catch(error => {
                    console.error('同步删除库存物品失败:', error);
                  });
                                  
                  setInventoryItems(items => items.filter(item => item.id !== itemId));
                    
                    setShowAddModal(false);
                    setEditingItem({
                      barcode: generateBarcode(),
                      category: inventoryCategories[0]?.key || 'ingredient',
                      unit: '克'
                    });
                    alert('删除成功！');
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
                  🗑️ 删除
                </button>
              )}
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setEditingItem({
                    barcode: generateBarcode(),
                    category: inventoryCategories[0]?.key || 'ingredient',
                    unit: '克'
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
                onClick={async () => {
                  if (!editingItem.barcode || !editingItem.name) {
                    alert('请填写条形码和商品名称');
                    return;
                  }
                  
                  // 🔥 检查条形码是否重复（新增时）
                  if (!editingItem.id) {
                    const duplicateBarcode = inventoryItems.find(item => item.barcode === editingItem.barcode);
                    if (duplicateBarcode) {
                      alert(`❌ 条形码 ${editingItem.barcode} 已被使用！\n\n商品名称: ${duplicateBarcode.name}\n类别: ${duplicateBarcode.category}\n\n请使用不同的条形码或编辑现有商品。`);
                      return;
                    }
                  }
                  
                  // 🔥 检查条形码是否与其他商品重复（编辑时，排除自己）
                  if (editingItem.id) {
                    const duplicateBarcode = inventoryItems.find(item => 
                      item.barcode === editingItem.barcode && item.id !== editingItem.id
                    );
                    if (duplicateBarcode) {
                      alert(`❌ 条形码 ${editingItem.barcode} 已被其他商品使用！\n\n商品名称: ${duplicateBarcode.name}\n类别: ${duplicateBarcode.category}\n\n请使用不同的条形码。`);
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
                      `⚠️ 警告：同类别下已存在同名商品！\n\n` +
                      `商品名称: ${duplicateName.name}\n` +
                      `类别: ${duplicateName.category}\n` +
                      `条形码: ${duplicateName.barcode}\n\n` +
                      `是否继续添加？（建议修改名称或使用不同类别）`
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
                      unit: editingItem.unit || '克',
                      currentStock: editingItem.currentStock || 0,
                      minStock: editingItem.minStock || 0,
                      costPrice: editingItem.costPrice || 0,
                      salePrice: editingItem.salePrice || 0,
                      tags: editingItem.tags || [],
                      location: editingItem.location,
                      lastUpdated: new Date(),
                      lastModified: now
                    };
                    
                    setInventoryItems(items => items.map(item => 
                      item.id === editingItem.id ? updatedInventoryItem : item
                    ));
                    
                    // ✅ 如果 ID 改变了，也要更新冰箱库存中的引用
                    if (barcodeChanged && oldItem) {
                      setFridgeInventory(invs => invs.map(inv => {
                        if (inv.itemId !== editingItem.id) return inv;
                        const oldFridgeInventoryId = inv.id || `${inv.fridgeId}-${editingItem.id}`;
                        const newFridgeInventoryId = `${inv.fridgeId}-${newId}`;
                        smartUpdateDocument('fridge_inventory', newFridgeInventoryId, {
                          ...inv,
                          id: newFridgeInventoryId,
                          itemId: newId,
                          lastModified: now
                        }).catch(error => {
                          console.error('同步冰箱库存新ID失败:', error);
                        });
                        smartDeleteDocument('fridge_inventory', oldFridgeInventoryId).catch(error => {
                          console.error('删除冰箱库存旧ID失败:', error);
                        });
                        return { ...inv, id: newFridgeInventoryId, itemId: newId, lastModified: now };
                      }));
                    }
                    
                    // 如果是酒水或饮料，同步更新菜单
                    if (oldItem && (oldItem.category === 'beverage' || oldItem.category === 'alcohol')) {
                      const menuItem = menuItems.find(m => m.stockItemId === editingItem.id);
                      if (menuItem) {
                        setMenuItems(items => items.map(m => 
                          m.id === menuItem.id ? {
                            ...m,
                            name: editingItem.name!,
                            price: editingItem.salePrice || 0,
                            category: editingItem.category === 'beverage' ? '饮料' : '酒水',
                            type: 'direct' as 'direct',
                            stockItemId: newId, // ✅ 更新菜单中的引用
                            lastModified: now
                          } : m
                        ));
                        smartUpdateDocument('menu_items', menuItem.id, {
                          ...menuItem,
                          name: editingItem.name!,
                          price: editingItem.salePrice || 0,
                          category: editingItem.category === 'beverage' ? '饮料' : '酒水',
                          type: 'direct',
                          stockItemId: newId,
                          lastModified: now
                        }).catch(error => {
                          console.error('同步菜单项更新失败:', error);
                        });
                      }
                    }
                    
                    // 🔥 同步到 Firestore
                    try {
                      await smartUpdateDocument('inventory_items', newId, {
                        ...updatedInventoryItem,
                      });
                      if (barcodeChanged) {
                        await smartDeleteDocument('inventory_items', editingItem.id);
                      }
                      console.log('✅ 物品已同步到 Firestore');
                    } catch (error) {
                      console.error('❌ 同步物品失败:', error);
                    }
                    
                    alert('修改成功！');
                  } else {
                    // 添加新物品
                    const now = Date.now();
                    const defaultUnit = (editingItem.category === 'beverage' || editingItem.category === 'alcohol') ? 'bot' : 'lb'; // ✅ 饮料酒水用bot，其他用lb
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
                      lastUpdated: new Date(),
                      lastModified: now
                    };
                    setInventoryItems([...inventoryItems, newItem]);
                    
                    // 🔥 同步到 Firestore
                    try {
                      await smartAddDocument('inventory_items', newItem);
                      console.log('✅ 新物品已同步到 Firestore');
                    } catch (error) {
                      console.error('❌ 同步新物品失败:', error);
                    }
                    
                    // 如果是酒水或饮料，自动添加到菜单
                    if (editingItem.category === 'beverage' || editingItem.category === 'alcohol') {
                      const newMenuItem = {
                        id: `menu-${Date.now()}`,
                        name: editingItem.name!,
                        nameEs: '',
                        price: editingItem.salePrice || 0,
                        category: editingItem.category === 'beverage' ? '饮料' : '酒水',
                        type: 'direct' as 'direct', // 直接扣库存
                        stockItemId: newItem.id, // 关联库存物品
                        available: true,
                        lastModified: now
                      };
                      setMenuItems([...menuItems, newMenuItem]);
                      smartAddDocument('menu_items', newMenuItem).catch(error => {
                        console.error('同步自动创建菜单项失败:', error);
                      });
                      alert('添加成功！已自动同步到菜单');
                    } else {
                      alert('添加成功！');
                    }
                  }
                  
                  setShowAddModal(false);
                  setEditingItem({
                    barcode: generateBarcode(),
                    category: inventoryCategories[0]?.key || 'ingredient',
                    unit: '克'
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
                {editingItem.id ? '💾 保存修改' : '✅ 确认添加'}
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
                  ) : (editingMenu.imageThumbUrl || editingMenu.imageUrl || editingMenu.image) ? (
                    <MenuImage
                      menuId={editingMenu.id || 'new-menu'}
                      name={editingMenu.name || '菜品'}
                      src={editingMenu.imageThumbUrl || editingMenu.imageUrl}
                      legacySrc={editingMenu.image}
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
                  setIsProcessingMenuImage(true);
                  let imageFields: Partial<MenuItem> = {};
                  const menuIdForSave = editingMenu.id || `menu-${Date.now()}`;
                  try {
                    if (selectedMenuImageFile) {
                      imageFields = await processAndUploadMenuImage(menuIdForSave, selectedMenuImageFile);
                    }
                  } catch (error: any) {
                    console.error('处理菜品图片失败:', error);
                    alert(error?.message || '图片处理失败，请换一张图片重试');
                    setIsProcessingMenuImage(false);
                    return;
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
                  setIsProcessingMenuImage(false);
                  setEditingMenu({
                    name: '',
                    price: 0,
                    category: '主食',
                    available: true,
                    ingredients: []
                  });
                  alert(editingMenu.id ? '修改成功！' : '添加成功！');
                }}
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
              🏷️ 库存类别管理
            </h3>
            
            {/* 添加新类别 */}
            <div style={{ marginBottom: '1rem', padding: '1rem', backgroundColor: '#f9fafb', borderRadius: '0.375rem' }}>
              <div style={{ fontSize: '0.9rem', fontWeight: '600', marginBottom: '0.75rem' }}>添加新类别</div>
              <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr auto', gap: '0.5rem' }}>
                <input
                  type="text"
                  value={editingInventoryCategory.icon}
                  onChange={(e) => setEditingInventoryCategory({...editingInventoryCategory, icon: e.target.value})}
                  placeholder="图标"
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
                    placeholder="类别名称"
                    style={{
                      flex: 1,
                      padding: '0.5rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '0.25rem',
                      fontSize: '0.9rem'
                    }}
                  />
                  <button
                    onClick={() => {
                      if (!editingInventoryCategory.name) {
                        alert('请填写类别名称');
                        return;
                      }
                      if (inventoryCategories.find(c => c.key === editingInventoryCategory.key)) {
                        alert('该类别已存在');
                        return;
                      }
                      setInventoryCategories(prev => mergeInventoryCategories(prev, [{ ...editingInventoryCategory, id: editingInventoryCategory.key, lastModified: Date.now() }]));
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
                现有类别 ({inventoryCategories.length})
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
                        <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>标识：{cat.key}</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        onClick={() => {
                          const newName = prompt('修改类别名称:', cat.name);
                          const newIcon = prompt('修改图标（Emoji）:', cat.icon);
                          if (newName && newIcon) {
                            const newCats = [...inventoryCategories];
                            newCats[idx] = { ...cat, id: cat.id || cat.key, name: newName, icon: newIcon, lastModified: Date.now() };
                            setInventoryCategories(newCats);
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
                          if (inventoryCategories.length <= 1) {
                            alert('至少需要保留一个类别');
                            return;
                          }
                          if (!window.confirm(`确定要删除类别“${cat.name}”吗？`)) {
                            return;
                          }
                          setInventoryCategories(inventoryCategories.filter((_, i) => i !== idx));
                          smartDeleteDocument('inventory_categories', cat.id || cat.key).catch(error => {
                            console.error('删除库存类别失败:', error);
                          });
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
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Inventory;
