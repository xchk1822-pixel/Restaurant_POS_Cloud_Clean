import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useAppContext } from '../../contexts/AppContext';
import { getLocalDateString } from '../../utils/exchangeRate'; // 🔥 导入本地日期工具
import { smartAddDocument, smartGetDocuments, smartIncrementField, smartUpdateDocument, smartDeleteDocument, smartSetDocument, smartTransferFridgeStock } from '../../services/smartSyncService';
import { mergeRecordsByVersion } from '../../utils/syncMerge';
import { dataService } from '../../services/DataService';
import {
  buildFridgeStocktakeHistoryRecords,
  formatStocktakeRecordDateTime,
  getStocktakeRecordDateKey,
  normalizeFridgeInventoryForRefresh,
  normalizeFridgesForRefresh,
  normalizeInventoryItemsForRefresh,
  normalizeStocktakeHistoryForRefresh,
  saveFridgeRefreshCache,
  saveInventoryRefreshCache,
  printStocktakeHistory,
  sortStocktakeHistoryRecords,
} from '../../utils/stocktakeRefresh';
import { canItemEnterFridge, resolveFridgeItemOrder } from '../../utils/fridgeInventory';

interface FridgeItem {
  fridgeId: string;
  itemId: string;
  quantity: number;
  sortOrder?: number;
  itemName?: string;
  unit?: string;
  barcode?: string;
}

const getFridgeQuantityKey = (fridgeId: string, itemId: string) => `${fridgeId}:${itemId}`;

const FridgeStocktake: React.FC = () => {
  const { fridges, setFridges, fridgeInventory, setFridgeInventory, inventoryItems, setInventoryItems } = useAppContext();
  
  // 状态管理
  const [selectedFridge, setSelectedFridge] = useState<string>(fridges[0]?.id || '');
  const [searchTerm, setSearchTerm] = useState('');
  const [actualQuantities, setActualQuantities] = useState<Record<string, number>>({});
  const [itemOrder, setItemOrder] = useState<string[]>([]);
  
  // 弹窗状态
  const [showAddFridgeModal, setShowAddFridgeModal] = useState(false);
  const [showEditFridgeModal, setShowEditFridgeModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showTransferHistoryModal, setShowTransferHistoryModal] = useState(false);
  const [transferRecords, setTransferRecords] = useState<any[]>([]);
  const [transferHistoryDate, setTransferHistoryDate] = useState(getLocalDateString());
  const [transferSearchTerm, setTransferSearchTerm] = useState('');
  const [isTransferHistoryLoading, setIsTransferHistoryLoading] = useState(false);
  const [editingFridge, setEditingFridge] = useState<any>(null);
  
  // ✅ 简化版调拨弹窗
  const [transferModal, setTransferModal] = useState<{ show: boolean; itemId: string; type: 'add' | 'remove' }>({ show: false, itemId: '', type: 'add' });
  const [transferQuantity, setTransferQuantity] = useState<number>(1);
  const [isTransferSubmitting, setIsTransferSubmitting] = useState(false);
  const isTransferSubmittingRef = useRef(false);
  const [isStocktakeSubmitting, setIsStocktakeSubmitting] = useState(false);
  const isStocktakeSubmittingRef = useRef(false);
  
  // ✅ 添加新商品弹窗
  const [showAddItemModal, setShowAddItemModal] = useState(false);
  const [newItemData, setNewItemData] = useState<{ itemId: string; quantity: number }>({ itemId: '', quantity: 1 });
  const [addSearchTerm, setAddSearchTerm] = useState('');
  
  // 表单状态
  const [newFridgeName, setNewFridgeName] = useState('');
  const [newFridgeLocation, setNewFridgeLocation] = useState('');
  const [selectedHistoryDate, setSelectedHistoryDate] = useState(getLocalDateString());
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const hasAutoRefreshed = useRef(false);
  const inventoryCategoryStorageKey = dataService.getStoreKey('inventory_categories');
  
  // 库存分类（从 localStorage 加载）
  const [inventoryCategories] = useState<Array<{ key: string; name: string; icon: string }>>(() => {
    try {
      const saved = localStorage.getItem(inventoryCategoryStorageKey);
      return saved ? JSON.parse(saved) : [
        { key: 'cerveza', name: 'Cerveza', icon: '🍺' },
        { key: 'bebida', name: 'Bebida', icon: '🥤' },
        { key: 'jugo', name: 'Jugo', icon: '🧃' },
        { key: 'ingredient', name: '食材', icon: '🥬' },
        { key: 'alcohol', name: '酒水', icon: '🍺' },
        { key: 'beverage', name: '饮料', icon: '🥤' },
        { key: 'other', name: '其他', icon: '📦' }
      ];
    } catch {
      return [
        { key: 'cerveza', name: 'Cerveza', icon: '🍺' },
        { key: 'bebida', name: 'Bebida', icon: '🥤' },
        { key: 'jugo', name: 'Jugo', icon: '🧃' },
        { key: 'ingredient', name: '食材', icon: '🥬' },
        { key: 'alcohol', name: '酒水', icon: '🍺' },
        { key: 'beverage', name: '饮料', icon: '🥤' },
        { key: 'other', name: '其他', icon: '📦' }
      ];
    }
  });
  
  const stocktakeHistoryStorageKey = dataService.getStoreKey('fridge_stocktake_history');
  const getFridgeItemOrderStorageKey = (fridgeId: string) => dataService.getStoreKey(`fridge_item_order_${fridgeId}`);

  // 盘点历史
  const [stocktakeHistory, setStocktakeHistory] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem(stocktakeHistoryStorageKey);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // 获取当前冰箱的商品列表
  const getFridgeItems = useCallback((): FridgeItem[] => {
    return fridgeInventory
      .filter(inv => inv.fridgeId === selectedFridge)
      .map(inv => {
        const item = inventoryItems.find(i => i.id === inv.itemId);
        return {
          ...inv,
          itemName: item?.name || '未知商品',
          unit: item?.unit || '',
          barcode: item?.barcode || ''
        };
      })
      .filter(item => 
        !searchTerm || 
        item.itemName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.barcode?.includes(searchTerm)
      );
  }, [fridgeInventory, inventoryItems, selectedFridge, searchTerm]);

  const fridgeItems = useMemo(() => getFridgeItems(), [getFridgeItems]);
  const fridgeItemOrderSignature = fridgeItems
    .map(item => `${item.itemId}:${item.sortOrder ?? ''}`)
    .join('|');
  const cacheStocktakeHistory = (records: any[]) => {
    const sortedHistory = sortStocktakeHistoryRecords(records).slice(0, 50);
    setStocktakeHistory(sortedHistory);
    localStorage.setItem(stocktakeHistoryStorageKey, JSON.stringify(sortedHistory));
    return sortedHistory;
  };

  const mergeAndCacheStocktakeHistory = (cloudHistory: any[]) => {
    const normalizedCloudHistory = normalizeStocktakeHistoryForRefresh(cloudHistory);
    const mergedHistory = mergeRecordsByVersion(stocktakeHistory, normalizedCloudHistory);
    return cacheStocktakeHistory(mergedHistory);
  };

  const refreshFridgeHistory = async () => {
    const cloudHistory = await smartGetDocuments('fridge_stocktake_history', true);
    return mergeAndCacheStocktakeHistory(cloudHistory);
  };

  const openHistoryModal = async () => {
    setShowHistoryModal(true);
    try {
      await refreshFridgeHistory();
      setLastSyncedAt(new Date());
    } catch (error) {
      console.error('刷新冰箱盘点历史失败:', error);
    }
  };

  const getTransferRecordTime = (record: any) => {
    const value = record.createdAtMs || record.timestamp || record.lastModified || record.createdAt;
    if (!value) return 0;
    if (typeof value === 'number') return value;
    if (value?.toDate) return value.toDate().getTime();
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const formatTransferRecordTime = (record: any) => {
    const time = getTransferRecordTime(record);
    if (!time) return '--';
    return new Date(time).toLocaleString('es-NI', {
      timeZone: 'America/Managua',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  };

  const formatTransferRecordDateKey = (timestamp: number) => {
    if (!timestamp) return '';
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Managua',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(timestamp));
  };

  const refreshTransferHistory = async () => {
    setIsTransferHistoryLoading(true);
    try {
      const records = await smartGetDocuments('stock_transfer_records', true);
      const sortedRecords = [...records].sort((a, b) => getTransferRecordTime(b) - getTransferRecordTime(a));
      setTransferRecords(sortedRecords);
      setLastSyncedAt(new Date());
      return sortedRecords;
    } catch (error) {
      console.error('刷新调拨记录失败:', error);
      alert('刷新调拨记录失败，请检查网络后重试');
      return transferRecords;
    } finally {
      setIsTransferHistoryLoading(false);
    }
  };

  const openTransferHistoryModal = async () => {
    setShowTransferHistoryModal(true);
    await refreshTransferHistory();
  };

  const filteredTransferRecords = useMemo(() => {
    const normalizedSearch = transferSearchTerm.trim().toLowerCase();
    return transferRecords.filter(record => {
      const recordDate = record.date || formatTransferRecordDateKey(getTransferRecordTime(record));
      const matchesDate = !transferHistoryDate || recordDate === transferHistoryDate;
      const matchesSearch = !normalizedSearch ||
        String(record.itemName || '').toLowerCase().includes(normalizedSearch) ||
        String(record.fridgeName || '').toLowerCase().includes(normalizedSearch) ||
        String(record.operationId || record.id || '').toLowerCase().includes(normalizedSearch);
      return matchesDate && matchesSearch;
    });
  }, [transferRecords, transferHistoryDate, transferSearchTerm]);

  const refreshFridgeData = async (showFailureAlert = true) => {
    setIsRefreshing(true);
    try {
      const [cloudFridges, cloudFridgeInventory, cloudItems, cloudHistory] = await Promise.all([
        smartGetDocuments('fridges', true),
        smartGetDocuments('fridge_inventory', true),
        smartGetDocuments('inventory_items', true),
        smartGetDocuments('fridge_stocktake_history', true)
      ]);

      const storeId = dataService.getCurrentStoreId();
      const normalizedFridges = normalizeFridgesForRefresh(cloudFridges);
      const normalizedFridgeInventory = normalizeFridgeInventoryForRefresh(cloudFridgeInventory);
      const normalizedCloudItems = normalizeInventoryItemsForRefresh(cloudItems);

      setFridges(normalizedFridges);
      if (normalizedFridges.length > 0 && !normalizedFridges.some((fridge: any) => fridge.id === selectedFridge)) {
        setSelectedFridge(normalizedFridges[0].id);
      }
      setFridgeInventory(normalizedFridgeInventory);
      setInventoryItems(normalizedCloudItems);

      saveFridgeRefreshCache(storeId, normalizedFridges, normalizedFridgeInventory);
      saveInventoryRefreshCache(storeId, normalizedCloudItems);

      mergeAndCacheStocktakeHistory(cloudHistory);

      setLastSyncedAt(new Date());
    } catch (error) {
      console.error('刷新冰箱盘点数据失败:', error);
      if (showFailureAlert) {
        alert('刷新冰箱盘点数据失败，请检查网络后重试');
      }
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    if (hasAutoRefreshed.current) return;
    hasAutoRefreshed.current = true;
    refreshFridgeData(false);
    // This is an intentional one-time cloud refresh, not a realtime subscription.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (fridges.length > 0 && !fridges.some((fridge: any) => fridge.id === selectedFridge)) {
      setSelectedFridge(fridges[0].id);
    }
  }, [fridges, selectedFridge]);

  // 初始化：加载实际数量和排序
  useEffect(() => {
    // 加载或初始化排序
    const loadOrder = () => {
      try {
        const orderStorageKey = getFridgeItemOrderStorageKey(selectedFridge);
        const saved = localStorage.getItem(orderStorageKey);
        const currentItemIds = fridgeItems.map(item => item.itemId);
        
        if (saved) {
          const savedOrder: string[] = JSON.parse(saved);
          const existingItems = savedOrder.filter(id => currentItemIds.includes(id));
          const newItems = currentItemIds.filter(id => !savedOrder.includes(id));
          
          // 合并：保留原有顺序 + 新商品追加到末尾
          const mergedOrder = resolveFridgeItemOrder(fridgeItems, [...existingItems, ...newItems]);
          setItemOrder(mergedOrder);
          
          // 如果有变化，保存更新后的顺序
          if (newItems.length > 0) {
            localStorage.setItem(orderStorageKey, JSON.stringify(mergedOrder));
          }
        } else {
          // 没有保存的顺序，使用默认顺序
          const resolvedOrder = resolveFridgeItemOrder(fridgeItems, currentItemIds);
          setItemOrder(resolvedOrder);
          localStorage.setItem(orderStorageKey, JSON.stringify(resolvedOrder));
        }
      } catch (error) {
        console.error('加载排序失败:', error);
        const defaultOrder = fridgeItems.map(item => item.itemId);
        setItemOrder(defaultOrder);
      }
    };
    
    loadOrder();
  }, [selectedFridge, fridgeItemOrderSignature, fridgeItems]);

  // 自动保存排序
  useEffect(() => {
    if (itemOrder.length > 0 && selectedFridge) {
      localStorage.setItem(getFridgeItemOrderStorageKey(selectedFridge), JSON.stringify(itemOrder));
    }
  }, [itemOrder, selectedFridge]);

  // 扫码处理
  const handleScan = (barcode: string) => {
    const item = fridgeItems.find(i => i.barcode === barcode);
    if (item) {
      const input = document.getElementById(`input-${item.itemId}`) as HTMLInputElement;
      if (input) {
        input.focus();
        input.select();
      }
    }
  };

  // 添加冰箱
  const handleAddFridge = async () => {
    if (!newFridgeName.trim()) {
      alert('请输入冰箱名称');
      return;
    }
    
    const newFridge = {
      id: `fridge-${Date.now()}`,
      name: newFridgeName.trim(),
      location: newFridgeLocation.trim(),
      createdAt: new Date(),
      lastModified: Date.now()
    };
    
    await smartSetDocument('fridges', newFridge.id, newFridge).catch(error => {
      console.error('保存新增冰箱失败:', error);
      alert('保存新增冰箱失败，请检查网络后重试');
      throw error;
    });
    setFridges([...fridges, newFridge]);
    setNewFridgeName('');
    setNewFridgeLocation('');
    setShowAddFridgeModal(false);
    setSelectedFridge(newFridge.id);
  };

  // 编辑冰箱
  const handleEditFridge = async () => {
    if (!editingFridge || !newFridgeName.trim()) return;
    
    const updatedFridge = {
      ...editingFridge,
      name: newFridgeName.trim(),
      location: newFridgeLocation.trim(),
      lastModified: Date.now()
    };

    await smartSetDocument('fridges', editingFridge.id, updatedFridge).catch(error => {
      console.error('保存编辑冰箱失败:', error);
      alert('保存编辑冰箱失败，请检查网络后重试');
      throw error;
    });

    setFridges(fridges.map(f =>
      f.id === editingFridge.id
        ? updatedFridge
        : f
    ));
    
    setEditingFridge(null);
    setNewFridgeName('');
    setNewFridgeLocation('');
    setShowEditFridgeModal(false);
  };

  // 删除冰箱
  const handleDeleteFridge = async (fridge: any) => {
    if (!window.confirm(`确定要删除冰箱“${fridge.name}”吗？该冰箱的所有库存记录也将被删除。`)) {
      return;
    }
    
    const recordsToDelete = fridgeInventory.filter(inv => inv.fridgeId === fridge.id);
    await smartDeleteDocument('fridges', fridge.id).catch(error => {
      console.error('\u5220\u9664\u51b0\u7bb1\u5931\u8d25:', error);
      alert('\u5220\u9664\u51b0\u7bb1\u5931\u8d25\uff0c\u8bf7\u68c0\u67e5\u7f51\u7edc\u540e\u91cd\u8bd5');
      throw error;
    });

    await Promise.all(recordsToDelete.map(record => {
      const recordId = record.id || `${record.fridgeId}-${record.itemId}`;
      return smartDeleteDocument('fridge_inventory', recordId);
    })).catch(error => {
      console.error('\u5220\u9664\u51b0\u7bb1\u5e93\u5b58\u8bb0\u5f55\u5931\u8d25:', error);
      alert('\u5220\u9664\u51b0\u7bb1\u5e93\u5b58\u8bb0\u5f55\u5931\u8d25\uff0c\u8bf7\u68c0\u67e5\u7f51\u7edc\u540e\u91cd\u8bd5');
      throw error;
    });

    setFridges(fridges.filter(f => f.id !== fridge.id));
    setFridgeInventory(fridgeInventory.filter(inv => inv.fridgeId !== fridge.id));
    
    if (selectedFridge === fridge.id && fridges.length > 1) {
      setSelectedFridge(fridges.find(f => f.id !== fridge.id)?.id || '');
    }
  };

  // ✅ 简化版调拨：增加/减少冰箱库存
  const handleSimpleTransfer = async () => {
    if (isTransferSubmittingRef.current) {
      return;
    }

    const item = inventoryItems.find(i => i.id === transferModal.itemId);
    if (!item) {
      alert('\u5546\u54c1\u4e0d\u5b58\u5728');
      return;
    }

    if (transferQuantity <= 0) {
      alert('\u8bf7\u8f93\u5165\u6709\u6548\u7684\u6570\u91cf\uff08\u5fc5\u987b\u5927\u4e8e0\uff09');
      return;
    }

    const now = Date.now();
    const fridgeInventoryId = `${selectedFridge}-${item.id}`;
    const existingFridgeRecord = fridgeInventory.find(
      record => record.fridgeId === selectedFridge && record.itemId === item.id
    );
    const nextSortOrder = fridgeInventory
      .filter(record => record.fridgeId === selectedFridge)
      .reduce((max, record) => Math.max(max, Number(record.sortOrder ?? -1)), -1) + 1;
    const sortOrder = existingFridgeRecord?.sortOrder ?? nextSortOrder;

    const direction = transferModal.type === 'add' ? 'warehouse_to_fridge' : 'fridge_to_warehouse';
    const fridgeName = fridges.find(f => f.id === selectedFridge)?.name || '';

    if (direction === 'warehouse_to_fridge' && item.currentStock < transferQuantity) {
      alert(`\u4ed3\u5e93\u5e93\u5b58\u4e0d\u8db3\uff01\u5f53\u524d\u5e93\u5b58\uff1a${item.currentStock} ${item.unit}`);
      return;
    }

    if (direction === 'fridge_to_warehouse' && (!existingFridgeRecord || existingFridgeRecord.quantity < transferQuantity)) {
      alert(`\u51b0\u7bb1\u5e93\u5b58\u4e0d\u8db3\uff01\u5f53\u524d\u5e93\u5b58\uff1a${existingFridgeRecord?.quantity || 0} ${item.unit}`);
      return;
    }

    isTransferSubmittingRef.current = true;
    setIsTransferSubmitting(true);

    try {
      const transferResult = await smartTransferFridgeStock({
        itemId: item.id,
        itemName: item.name,
        unit: item.unit,
        fridgeId: selectedFridge,
        fridgeName,
        quantity: transferQuantity,
        direction,
        sortOrder,
      });

      if (!transferResult.success) {
        const transferError = (transferResult as any).error;
        if (transferError === 'firestore-disabled') {
          alert('\u4e91\u7aef\u5e93\u5b58\u670d\u52a1\u672a\u542f\u7528\uff0c\u8bf7\u5148\u68c0\u67e5\u7cfb\u7edf\u914d\u7f6e');
        } else if (transferError === 'permission-denied') {
          alert('\u4e91\u7aef\u6743\u9650\u672a\u5f00\u653e\u51b0\u7bb1\u8c03\u62e8\u8bb0\u5f55\uff0c\u8bf7\u90e8\u7f72\u6700\u65b0 Firestore \u89c4\u5219\u540e\u91cd\u8bd5');
        } else if (transferError === 'insufficient-warehouse-stock') {
          alert('\u4ed3\u5e93\u5e93\u5b58\u4e0d\u8db3\uff0c\u8bf7\u5237\u65b0\u540e\u6838\u5bf9\u5e93\u5b58');
        } else if (transferError === 'insufficient-fridge-stock') {
          alert('\u51b0\u7bb1\u5e93\u5b58\u4e0d\u8db3\uff0c\u8bf7\u5237\u65b0\u540e\u6838\u5bf9\u5e93\u5b58');
        } else if (transferError === 'fridge-transfer-unconfirmed' || transferError === 'weak-network-transfer-timeout') {
          alert('\u4e91\u7aef\u786e\u8ba4\u8d85\u65f6\uff0c\u7cfb\u7edf\u65e0\u6cd5\u786e\u8ba4\u8c03\u62e8\u662f\u5426\u5df2\u7ecf\u5165\u8d26\u3002\u8bf7\u5148\u70b9\u51fb\u5237\u65b0\u6838\u5bf9\u5e93\u5b58\u548c\u8c03\u62e8\u8bb0\u5f55\uff0c\u518d\u51b3\u5b9a\u662f\u5426\u91cd\u65b0\u64cd\u4f5c\u3002');
        } else {
          alert('\u51b0\u7bb1\u8c03\u62e8\u4fdd\u5b58\u5931\u8d25\uff0c\u8bf7\u5237\u65b0\u6838\u5bf9\u540e\u91cd\u8bd5');
        }
        return;
      }

      const successfulTransfer = transferResult as any;
      const isPendingTransfer = Boolean(successfulTransfer.pending);
      const nextWarehouseStock = Number(successfulTransfer.warehouseStock);
      const nextFridgeStock = Number(successfulTransfer.fridgeStock);

      setInventoryItems(items => items.map(i =>
        i.id === item.id ? { ...i, currentStock: nextWarehouseStock, lastModified: now, lastUpdated: new Date() } : i
      ));
      setFridgeInventory(inv => {
        const existingIndex = inv.findIndex(
          record => record.fridgeId === selectedFridge && record.itemId === item.id
        );

        if (existingIndex !== -1) {
          const newInv = [...inv];
          newInv[existingIndex] = {
            ...newInv[existingIndex],
            id: newInv[existingIndex].id || fridgeInventoryId,
            quantity: nextFridgeStock,
            sortOrder,
            lastModified: now
          };
          return newInv;
        }
        return [...inv, {
          id: fridgeInventoryId,
          fridgeId: selectedFridge,
          itemId: item.id,
          quantity: nextFridgeStock,
          sortOrder,
          lastModified: now
        }];
      });

      alert(`${isPendingTransfer ? '\u5df2\u672c\u5730\u8bb0\u5f55\uff0c\u5f85\u4e91\u7aef\u540c\u6b65' : (direction === 'warehouse_to_fridge' ? '\u8c03\u62e8\u6210\u529f' : '\u9000\u56de\u6210\u529f')}\uff01\n\n\u5546\u54c1\uff1a${item.name}\n\u6570\u91cf\uff1a${transferQuantity} ${item.unit}\n${direction === 'warehouse_to_fridge' ? '\u4ed3\u5e93 -> \u51b0\u7bb1' : '\u51b0\u7bb1 -> \u4ed3\u5e93'}\n${isPendingTransfer ? '\u7f51\u7edc\u6062\u590d\u540e\u4f1a\u81ea\u52a8\u5c1d\u8bd5\u540c\u6b65\uff0c\u8bf7\u540e\u7eed\u5237\u65b0\u6838\u5bf9\u8c03\u62e8\u8bb0\u5f55' : '\u5df2\u8bb0\u5f55\u8c03\u62e8\u6d41\u6c34'}`);
      setTransferModal({ show: false, itemId: '', type: 'add' });
      setTransferQuantity(1);
    } catch (error) {
      console.error('\u51b0\u7bb1\u8c03\u62e8\u4fdd\u5b58\u5931\u8d25:', error);
      alert('\u51b0\u7bb1\u8c03\u62e8\u4fdd\u5b58\u5931\u8d25\uff0c\u8bf7\u5237\u65b0\u6838\u5bf9\u540e\u91cd\u8bd5');
    } finally {
      isTransferSubmittingRef.current = false;
      setIsTransferSubmitting(false);
    }
  };
  const handleAddNewItem = async () => {
    if (!newItemData.itemId) {
      alert('\u8bf7\u9009\u62e9\u5546\u54c1');
      return;
    }
    if (newItemData.quantity <= 0) {
      alert('\u8bf7\u8f93\u5165\u6709\u6548\u7684\u6570\u91cf\uff08\u5fc5\u987b\u5927\u4e8e0\uff09');
      return;
    }

    const item = inventoryItems.find(i => i.id === newItemData.itemId);
    if (!item) {
      alert('\u5546\u54c1\u4e0d\u5b58\u5728');
      return;
    }

    if (item.currentStock < newItemData.quantity) {
      alert(`\u4ed3\u5e93\u5e93\u5b58\u4e0d\u8db3\uff01\u5f53\u524d\u5e93\u5b58\uff1a${item.currentStock} ${item.unit}`);
      return;
    }

    const existingInCurrentFridge = fridgeInventory.find(
      inv => inv.fridgeId === selectedFridge && inv.itemId === item.id
    );
    if (existingInCurrentFridge) {
      alert('\u8be5\u5546\u54c1\u5df2\u5b58\u5728\u5f53\u524d\u51b0\u7bb1\u4e2d');
      return;
    }

    const existingInOtherFridge = fridgeInventory.find(
      inv => inv.fridgeId !== selectedFridge && inv.itemId === item.id
    );
    if (existingInOtherFridge) {
      const otherFridge = fridges.find(f => f.id === existingInOtherFridge.fridgeId);
      alert(`\u8be5\u5546\u54c1\u5df2\u5b58\u5728\u4e8e\u201c${otherFridge?.name || '\u5176\u4ed6\u51b0\u7bb1'}\u201d\u4e2d\uff0c\u65e0\u6cd5\u6dfb\u52a0\u5230\u5f53\u524d\u51b0\u7bb1`);
      return;
    }

    const now = Date.now();
    const fridgeInventoryId = `${selectedFridge}-${item.id}`;
    const nextSortOrder = fridgeInventory
      .filter(record => record.fridgeId === selectedFridge)
      .reduce((max, record) => Math.max(max, Number(record.sortOrder ?? -1)), -1) + 1;

    try {
      await smartIncrementField('inventory_items', item.id, 'currentStock', -newItemData.quantity, {
        lastModified: now,
        lastUpdated: new Date()
      });
      await smartIncrementField('fridge_inventory', fridgeInventoryId, 'quantity', newItemData.quantity, {
        fridgeId: selectedFridge,
        itemId: item.id,
        sortOrder: nextSortOrder,
        lastModified: now
      });
    } catch (error) {
      console.error('\u6dfb\u52a0\u51b0\u7bb1\u5546\u54c1\u4fdd\u5b58\u5931\u8d25:', error);
      alert('\u6dfb\u52a0\u51b0\u7bb1\u5546\u54c1\u4fdd\u5b58\u5931\u8d25\uff0c\u8bf7\u68c0\u67e5\u7f51\u7edc\u540e\u91cd\u8bd5');
      return;
    }

    setInventoryItems(items => items.map(i =>
      i.id === item.id ? { ...i, currentStock: i.currentStock - newItemData.quantity, lastModified: now, lastUpdated: new Date() } : i
    ));
    setFridgeInventory(inv => [...inv, {
      id: fridgeInventoryId,
      fridgeId: selectedFridge,
      itemId: item.id,
      quantity: newItemData.quantity,
      sortOrder: nextSortOrder,
      lastModified: now
    }]);
    setItemOrder(prev => [...prev.filter(id => id !== item.id), item.id]);

    alert(`\u6dfb\u52a0\u6210\u529f\uff01\n\n\u5546\u54c1\uff1a${item.name}\n\u6570\u91cf\uff1a${newItemData.quantity} ${item.unit}\n\u5df2\u6dfb\u52a0\u5230\uff1a${fridges.find(f => f.id === selectedFridge)?.name}`);
    setShowAddItemModal(false);
    setNewItemData({ itemId: '', quantity: 1 });
    setAddSearchTerm('');
  };
  const completeStocktake = async () => {
    // 当前选中的冰箱独立完成盘点，避免多个冰箱互相影响。
    const stocktakeFridgeItems = fridgeInventory
      .filter(inv => inv.fridgeId === selectedFridge)
      .map(inv => {
      const item = inventoryItems.find(i => i.id === inv.itemId);
      const fridge = fridges.find(f => f.id === inv.fridgeId);
      return {
        ...inv,
        itemName: item?.name || (inv as any).itemName || '未知商品',
        unit: item?.unit || (inv as any).unit || '',
        fridgeName: fridge?.name || '未知冰箱',
      };
    });
    const uncountedItems = stocktakeFridgeItems.filter(item =>
      actualQuantities[getFridgeQuantityKey(item.fridgeId, item.itemId)] === undefined
    );
    
    if (uncountedItems.length > 0) {
      alert(`⚠️ 还有 ${uncountedItems.length} 个商品未清点：\n${uncountedItems.map(item => '• ' + item.itemName).join('\n')}\n\n请完成所有商品的清点后再确认`);
      return;
    }
    
    const discrepancies: any[] = [];
    let hasDifference = false;

    stocktakeFridgeItems.forEach(item => {
      const actual = actualQuantities[getFridgeQuantityKey(item.fridgeId, item.itemId)] ?? 0;
      const difference = actual - item.quantity;
      if (difference !== 0) {
        discrepancies.push({
          itemName: `${item.fridgeName} - ${item.itemName}`,
          systemStock: item.quantity,
          actualStock: actual,
          difference
        });
        hasDifference = true;
      }
    });

    if (!hasDifference) {
      if (!window.confirm('盘点数据与系统库存完全一致，确认完成盘点吗？')) {
        return;
      }
    } else {
      const confirmMsg = `发现 ${discrepancies.length} 个商品存在差异，确认完成盘点并更新库存吗？`;
      if (!window.confirm(confirmMsg)) {
        return;
      }
    }

    if (isStocktakeSubmittingRef.current) {
      return;
    }

    isStocktakeSubmittingRef.current = true;
    setIsStocktakeSubmitting(true);

    try {
      const now = Date.now();

      // 更新冰箱库存
      const newInventory = fridgeInventory.map(inv => {
        if (inv.fridgeId === selectedFridge && actualQuantities[getFridgeQuantityKey(inv.fridgeId, inv.itemId)] !== undefined) {
          return {
            ...inv,
            id: inv.id || `${inv.fridgeId}-${inv.itemId}`,
            quantity: actualQuantities[getFridgeQuantityKey(inv.fridgeId, inv.itemId)],
            lastModified: now
          };
        }
        return inv;
      });

      const updatedFridgeRecords = newInventory.filter(inv =>
        inv.fridgeId === selectedFridge && actualQuantities[getFridgeQuantityKey(inv.fridgeId, inv.itemId)] !== undefined
      );
      await Promise.all(
        updatedFridgeRecords.map(inv => smartUpdateDocument('fridge_inventory', inv.id || `${inv.fridgeId}-${inv.itemId}`, inv))
      );

      // 保存盘点历史
      const saved = localStorage.getItem(stocktakeHistoryStorageKey);
      const history = saved ? JSON.parse(saved) : [];
      const stocktakeActualQuantities = stocktakeFridgeItems.reduce<Record<string, number>>((acc, item) => {
        acc[item.itemId] = actualQuantities[getFridgeQuantityKey(item.fridgeId, item.itemId)] ?? 0;
        return acc;
      }, {});
      const stocktakeRecords = buildFridgeStocktakeHistoryRecords({
        fridges: fridges.filter(fridge => fridge.id === selectedFridge),
        fridgeInventory: stocktakeFridgeItems,
        inventoryItems,
        actualQuantities: stocktakeActualQuantities,
        now,
        date: getLocalDateString(),
      });
      const stocktakeRecord = stocktakeRecords[0] || {
        id: `stocktake-${Date.now()}`,
        fridgeId: selectedFridge,
        fridgeName: fridges.find(fridge => fridge.id === selectedFridge)?.name || selectedFridge,
        date: getLocalDateString(), // 🔥 使用本地时间
        createdAt: new Date(),
        lastModified: now,
        items: fridgeItems.map(item => {
          const warehouseItem = inventoryItems.find(i => i.id === item.itemId);
          const warehouseStock = warehouseItem?.currentStock || 0;
          const fridgeStock = item.quantity;
          const totalStock = warehouseStock + fridgeStock;
          
          return {
            itemId: item.itemId,
            itemName: item.itemName,
            unit: item.unit,
            totalStock,
            warehouseStock,
            systemStock: fridgeStock,
            actualStock: actualQuantities[getFridgeQuantityKey(selectedFridge, item.itemId)] || 0,
            difference: (actualQuantities[getFridgeQuantityKey(selectedFridge, item.itemId)] || 0) - fridgeStock
          };
        }),
        totalDiscrepancies: discrepancies.length
      };
      const recordsToSave = stocktakeRecords.length > 0 ? stocktakeRecords : [stocktakeRecord];
      await Promise.all(
        recordsToSave.map(record => smartAddDocument('fridge_stocktake_history', record))
      );
      await Promise.all(
        recordsToSave.flatMap(historyRecord =>
          historyRecord.items
            .filter((item: any) => item.difference !== 0)
            .map((item: any) => {
              const record = {
                id: `stock-record-${historyRecord.id}-${item.itemId}`,
                itemId: item.itemId,
                itemName: item.itemName,
                type: 'adjust',
                quantity: Math.abs(item.difference),
                signedQuantity: item.difference,
                reason: 'fridge stocktake',
                source: 'fridge_stocktake',
                sourceId: historyRecord.id,
                locationType: 'fridge',
                fridgeId: historyRecord.fridgeId,
                fridgeName: historyRecord.fridgeName,
                beforeStock: item.systemStock,
                afterStock: item.actualStock,
                unit: item.unit,
                date: historyRecord.createdAt,
                createdAt: historyRecord.createdAt,
                createdAtMs: now,
                lastModified: now,
                operator: 'system'
              };
              return smartAddDocument('inventory_stock_records', record);
            })
        )
      );

      setFridgeInventory(newInventory);
      cacheStocktakeHistory([...recordsToSave, ...history]);
      setActualQuantities(prev => {
        const next = { ...prev };
        stocktakeFridgeItems.forEach(item => {
          delete next[getFridgeQuantityKey(item.fridgeId, item.itemId)];
        });
        return next;
      });

      alert('盘点完成！');
    } catch (error) {
      console.error('保存盘点历史失败:', error);
      alert('\u4fdd\u5b58\u76d8\u70b9\u7ed3\u679c\u5931\u8d25\uff0c\u8bf7\u68c0\u67e5\u7f51\u7edc\u540e\u91cd\u8bd5');
    } finally {
      isStocktakeSubmittingRef.current = false;
      setIsStocktakeSubmitting(false);
    }
  };

  // 移动商品顺序
  const moveItem = async (itemId: string, direction: 'up' | 'down') => {
    const index = itemOrder.indexOf(itemId);
    if (index === -1) return;
    
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= itemOrder.length) return;
    
    const newOrder = [...itemOrder];
    [newOrder[index], newOrder[newIndex]] = [newOrder[newIndex], newOrder[index]];
    const now = Date.now();
    const orderUpdates = newOrder
      .map((orderedItemId, sortOrder) => {
        const record = fridgeInventory.find(inv =>
          inv.fridgeId === selectedFridge && inv.itemId === orderedItemId
        );
        if (!record) return null;
        const recordId = record.id || `${record.fridgeId}-${record.itemId}`;
        return {
          ...record,
          id: recordId,
          sortOrder,
          lastModified: now,
        };
      })
      .filter((record): record is NonNullable<typeof record> => record !== null);

    try {
      await Promise.all(
        orderUpdates.map(record => smartUpdateDocument('fridge_inventory', record.id, record))
      );
    } catch (error) {
      console.error('保存冰箱排序失败:', error);
      alert('保存冰箱排序失败，请检查网络后重试');
      return;
    }

    setItemOrder(newOrder);
    localStorage.setItem(getFridgeItemOrderStorageKey(selectedFridge), JSON.stringify(newOrder));
    setFridgeInventory(inv => inv.map(record => {
      const updatedRecord = orderUpdates.find(update =>
        update.fridgeId === record.fridgeId && update.itemId === record.itemId
      );
      return updatedRecord || record;
    }));
  };

  // 导出CSV
  const exportToCSV = () => {
    const filteredHistory = stocktakeHistory.filter(record => {
      const recordDate = getStocktakeRecordDateKey(record);
      return recordDate === selectedHistoryDate;
    });

    if (filteredHistory.length === 0) {
      alert('所选日期无盘点记录');
      return;
    }

    let csv = '\uFEFF';
    csv += '冰箱名称,盘点时间,商品名称,单位,总库存,仓库值,冰箱值,盘点值,差异\n';
    
    filteredHistory.forEach(record => {
      const fridge = fridges.find(f => f.id === record.fridgeId);
      const fridgeName = fridge?.name || record.fridgeName || '未知冰箱';
      const date = formatStocktakeRecordDateTime(record);
      
      record.items.forEach((item: any) => {
        csv += `${fridgeName},${date},${item.itemName},${item.unit || ''},${item.totalStock},${item.warehouseStock},${item.systemStock},${item.actualStock},${item.difference}\n`;
      });
    });
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `盘点记录_${selectedHistoryDate}.csv`;
    link.click();
  };

  // 渲染
  return (
    <div style={{ 
      padding: '0.75rem', 
      height: '100vh', 
      maxHeight: '100vh',
      display: 'flex', 
      flexDirection: 'column', 
      gap: '0.5rem', 
      overflow: 'hidden',
      boxSizing: 'border-box'
    }}>
      {/* 标题栏 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#111827', whiteSpace: 'nowrap' }}>🧊 冰箱盘点</h2>
        <div style={{ display: 'flex', gap: '0.45rem', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {lastSyncedAt && (
            <span style={{ fontSize: '0.75rem', color: '#6b7280', whiteSpace: 'nowrap' }}>
              最后同步 {lastSyncedAt.toLocaleTimeString('es-NI', { hour12: false })}
            </span>
          )}
          <button
            onClick={() => refreshFridgeData()}
            disabled={isRefreshing}
            style={{
              padding: '0.42rem 0.72rem',
              backgroundColor: isRefreshing ? '#9ca3af' : '#0ea5e9',
              color: 'white',
              border: 'none',
              borderRadius: '0.375rem',
              cursor: isRefreshing ? 'not-allowed' : 'pointer',
              fontWeight: '700',
              fontSize: '0.78rem'
            }}
          >
            {isRefreshing ? '同步中...' : '刷新冰箱'}
          </button>
          <button
            onClick={() => setShowAddFridgeModal(true)}
            style={{
              padding: '0.42rem 0.72rem',
              backgroundColor: '#10b981',
              color: 'white',
              border: 'none',
              borderRadius: '0.375rem',
              cursor: 'pointer',
              fontWeight: '700',
              fontSize: '0.78rem'
            }}
          >
            ➕ 冰箱管理
          </button>
          <button
            onClick={openTransferHistoryModal}
            style={{
              padding: '0.42rem 0.72rem',
              backgroundColor: '#f97316',
              color: 'white',
              border: 'none',
              borderRadius: '0.375rem',
              cursor: 'pointer',
              fontWeight: '700',
              fontSize: '0.78rem'
            }}
          >
            调拨记录
          </button>
          <button
            onClick={openHistoryModal}
            style={{
              padding: '0.42rem 0.72rem',
              backgroundColor: '#8b5cf6',
              color: 'white',
              border: 'none',
              borderRadius: '0.375rem',
              cursor: 'pointer',
              fontWeight: '700',
              fontSize: '0.78rem'
            }}
          >
            📋 盘点历史
          </button>
        </div>
      </div>

      {/* 冰箱选择按钮组 */}
      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
        {fridges.map(fridge => {
          const isSelected = selectedFridge === fridge.id;
          let icon = '🧊';
          if (fridge.name.includes('吧台') || fridge.location?.includes('吧台')) {
            icon = '🍸';
          } else if (fridge.name.includes('厨房') || fridge.location?.includes('厨房')) {
            icon = '👨‍🍳';
          } else if (fridge.name.includes('冷藏') || fridge.name.includes('保鲜')) {
            icon = '❄️';
          }
          
          return (
            <button
              key={fridge.id}
              onClick={() => setSelectedFridge(fridge.id)}
              style={{
                padding: '0.38rem 0.68rem',
                backgroundColor: isSelected ? '#3b82f6' : 'white',
                color: isSelected ? 'white' : '#374151',
                border: isSelected ? '1px solid #3b82f6' : '1px solid #e5e7eb',
                borderRadius: '0.45rem',
                cursor: 'pointer',
                fontSize: '0.78rem',
                fontWeight: '700',
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                transition: 'all 0.2s',
                boxShadow: isSelected ? '0 2px 4px rgba(59, 130, 246, 0.22)' : 'none'
              }}
            >
              <span style={{ fontSize: '1rem' }}>{icon}</span>
              <div style={{ textAlign: 'left' }}>
                <div>{fridge.name}</div>
                {fridge.location && (
                  <div style={{ fontSize: '0.68rem', opacity: 0.8, marginTop: '0.05rem', lineHeight: 1.1 }}>
                    {fridge.location}
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* 搜索栏 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 1fr) auto auto', gap: '0.45rem', alignItems: 'center' }}>
        <input
          type="text"
          placeholder="搜索商品名称或扫描条形码..."
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            if (e.target.value.length === 13 && /^\d+$/.test(e.target.value)) {
              handleScan(e.target.value);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && searchTerm.length === 13) {
              handleScan(searchTerm);
            }
          }}
          style={{
            padding: '0.42rem 0.65rem',
            border: '1px solid #d1d5db',
            borderRadius: '0.375rem',
            fontSize: '0.8rem'
          }}
        />
        <div style={{ fontSize: '0.78rem', color: '#6b7280', whiteSpace: 'nowrap' }}>
          📊 {fridgeItems.length} 个商品
        </div>
        <button
          onClick={completeStocktake}
          disabled={isStocktakeSubmitting}
          style={{
            padding: '0.42rem 0.9rem',
            backgroundColor: isStocktakeSubmitting ? '#9ca3af' : '#10b981',
            color: 'white',
            border: 'none',
            borderRadius: '0.375rem',
            cursor: isStocktakeSubmitting ? 'not-allowed' : 'pointer',
            fontSize: '0.8rem',
            fontWeight: '700',
            whiteSpace: 'nowrap',
            opacity: isStocktakeSubmitting ? 0.75 : 1
          }}
        >
          {isStocktakeSubmitting ? '处理中...' : '✅ 完成盘点'}
        </button>
      </div>

      {/* 商品列表 */}
      <div style={{ flex: 1, minHeight: 0, backgroundColor: 'white', borderRadius: '0.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {/* ✅ 顶部工具栏：添加新商品 */}
        <div style={{ padding: '0.45rem 0.6rem', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f9fafb' }}>
          <button
            onClick={() => {
              setShowAddItemModal(true);
              setAddSearchTerm('');
              setNewItemData({ itemId: '', quantity: 1 });
            }}
            style={{
              padding: '0.36rem 0.72rem',
              backgroundColor: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '0.375rem',
              cursor: 'pointer',
              fontSize: '0.78rem',
              fontWeight: '700',
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem'
            }}
          >
            <span style={{ fontSize: '1.1rem' }}>+</span>
            添加新商品到冰箱
          </button>
          <div style={{ fontSize: '0.78rem', color: '#6b7280' }}>
            📊 {fridgeItems.length} 个商品
          </div>
        </div>
        
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {fridgeItems.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: '#9ca3af' }}>
              <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>📦</div>
              <p>该冰箱暂无商品</p>
              <p style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>点击上方"添加新商品到冰箱"按钮开始添加</p>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ backgroundColor: '#f9fafb', position: 'sticky', top: 0 }}>
                <tr>
                  <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '2px solid #e5e7eb', fontSize: '0.85rem', fontWeight: '600' }}>排序</th>
                  <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '2px solid #e5e7eb', fontSize: '0.85rem', fontWeight: '600' }}>商品名称</th>
                  <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '2px solid #e5e7eb', fontSize: '0.85rem', fontWeight: '600' }}>条形码</th>
                  <th style={{ padding: '0.75rem', textAlign: 'right', borderBottom: '2px solid #e5e7eb', fontSize: '0.85rem', fontWeight: '600' }}>总库存</th>
                  <th style={{ padding: '0.75rem', textAlign: 'right', borderBottom: '2px solid #e5e7eb', fontSize: '0.85rem', fontWeight: '600' }}>仓库值</th>
                  <th style={{ padding: '0.75rem', textAlign: 'right', borderBottom: '2px solid #e5e7eb', fontSize: '0.85rem', fontWeight: '600' }}>冰箱值</th>
                  <th style={{ padding: '0.75rem', textAlign: 'right', borderBottom: '2px solid #e5e7eb', fontSize: '0.85rem', fontWeight: '600' }}>盘点值</th>
                  <th style={{ padding: '0.75rem', textAlign: 'right', borderBottom: '2px solid #e5e7eb', fontSize: '0.85rem', fontWeight: '600' }}>差异</th>
                  <th style={{ padding: '0.75rem', textAlign: 'center', borderBottom: '2px solid #e5e7eb', fontSize: '0.85rem', fontWeight: '600' }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const sortedItems = itemOrder.length > 0 
                    ? [
                        ...itemOrder
                          .map(id => fridgeItems.find(item => item.itemId === id))
                          .filter((item): item is NonNullable<typeof item> => item !== undefined),
                        ...fridgeItems.filter(item => !itemOrder.includes(item.itemId))
                      ]
                    : fridgeItems;
                  
                  return sortedItems.map((item) => {
                    const warehouseItem = inventoryItems.find(i => i.id === item.itemId);
                    const warehouseStock = warehouseItem?.currentStock || 0;
                    const fridgeStock = item.quantity;
                    const totalStock = warehouseStock + fridgeStock;
                    const quantityKey = getFridgeQuantityKey(item.fridgeId, item.itemId);
                    const actualCount = actualQuantities[quantityKey];
                    const isCounted = actualCount !== undefined;
                    const difference = isCounted ? actualCount - fridgeStock : null;
                    const hasDifference = isCounted && difference !== 0;

                    return (
                      <tr
                        key={item.itemId}
                        style={{
                          borderBottom: '1px solid #f3f4f6',
                          backgroundColor: hasDifference ? '#fef3c7' : 'white'
                        }}
                      >
                        <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', alignItems: 'center' }}>
                            <button
                              onClick={() => moveItem(item.itemId, 'up')}
                              disabled={itemOrder.indexOf(item.itemId) === 0}
                              style={{
                                padding: '0.15rem 0.4rem',
                                backgroundColor: itemOrder.indexOf(item.itemId) === 0 ? '#e5e7eb' : '#f3f4f6',
                                border: '1px solid #d1d5db',
                                borderRadius: '0.25rem',
                                cursor: itemOrder.indexOf(item.itemId) === 0 ? 'not-allowed' : 'pointer',
                                fontSize: '0.7rem',
                                lineHeight: '1',
                                opacity: itemOrder.indexOf(item.itemId) === 0 ? 0.5 : 1
                              }}
                            >
                              ▲
                            </button>
                            <button
                              onClick={() => moveItem(item.itemId, 'down')}
                              disabled={itemOrder.indexOf(item.itemId) === itemOrder.length - 1}
                              style={{
                                padding: '0.15rem 0.4rem',
                                backgroundColor: itemOrder.indexOf(item.itemId) === itemOrder.length - 1 ? '#e5e7eb' : '#f3f4f6',
                                border: '1px solid #d1d5db',
                                borderRadius: '0.25rem',
                                cursor: itemOrder.indexOf(item.itemId) === itemOrder.length - 1 ? 'not-allowed' : 'pointer',
                                fontSize: '0.7rem',
                                lineHeight: '1',
                                opacity: itemOrder.indexOf(item.itemId) === itemOrder.length - 1 ? 0.5 : 1
                              }}
                            >
                              ▼
                            </button>
                          </div>
                        </td>
                        <td style={{ padding: '0.75rem', fontWeight: '600' }}>
                          {item.itemName}
                          <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                            {item.unit}
                          </div>
                        </td>
                        <td style={{ padding: '0.75rem', fontSize: '0.85rem', fontFamily: 'monospace', color: '#6b7280' }}>
                          {item.barcode}
                        </td>
                        <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: '700' }}>
                          {totalStock}
                        </td>
                        <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: '600', color: '#3b82f6' }}>
                          {warehouseStock}
                        </td>
                        <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: '600', color: '#8b5cf6' }}>
                          {fridgeStock}
                        </td>
                        <td style={{ padding: '0.75rem', textAlign: 'right' }}>
                          <input
                            id={`input-${item.itemId}`}
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            value={isCounted ? actualCount.toString() : ''}
                            onChange={(e) => {
                              const inputValue = e.target.value;
                              
                              // ✅ 允许清空
                              if (inputValue === '') {
                                setActualQuantities(prev => {
                                  const next = { ...prev };
                                  delete next[quantityKey];
                                  return next;
                                });
                                return;
                              }
                              
                              // ✅ 只允许数字
                              if (/^\d+$/.test(inputValue)) {
                                const value = parseInt(inputValue);
                                if (value >= 0) {
                                  setActualQuantities(prev => ({
                                    ...prev,
                                    [quantityKey]: value
                                  }));
                                }
                              }
                            }}
                            onKeyDown={(e) => {
                              // ✅ 允许 Backspace 和 Delete 键清空
                              if (e.key === 'Backspace' || e.key === 'Delete') {
                                // 如果当前只有一个字符，清空后变为未清点状态
                                if (isCounted && actualCount.toString().length === 1) {
                                  setTimeout(() => {
                                    const el = document.getElementById(`input-${item.itemId}`) as HTMLInputElement;
                                    if (el && el.value === '') {
                                      setActualQuantities(prev => {
                                        const next = { ...prev };
                                        delete next[quantityKey];
                                        return next;
                                      });
                                    }
                                  }, 0);
                                }
                              }
                            }}
                            placeholder="--"
                            style={{
                              width: '80px',
                              padding: '0.4rem',
                              border: isCounted ? (hasDifference ? '2px solid #f59e0b' : '1px solid #d1d5db') : '2px solid #f59e0b',
                              borderRadius: '0.25rem',
                              textAlign: 'right',
                              fontSize: '0.9rem',
                              fontWeight: '600',
                              backgroundColor: isCounted ? 'white' : '#fffbeb'
                            }}
                          />
                        </td>
                        <td style={{ padding: '0.75rem', textAlign: 'right' }}>
                          {isCounted ? (
                            hasDifference ? (
                              <span style={{
                                fontWeight: 'bold',
                                fontSize: '1.1rem',
                                color: difference! > 0 ? '#10b981' : '#ef4444'
                              }}>
                                {difference! > 0 ? '+' : ''}{difference}
                              </span>
                            ) : (
                              <span style={{ color: '#10b981', fontSize: '1.2rem', fontWeight: 'bold' }}>✓</span>
                            )
                          ) : (
                            <span style={{ color: '#f59e0b', fontSize: '0.85rem', fontWeight: '600' }}>⏳ 待清点</span>
                          )}
                        </td>
                        <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: '0.3rem', justifyContent: 'center', alignItems: 'center' }}>
                            {/* ✅ 从仓库调拨到冰箱（增加） */}
                            <button
                              onClick={() => {
                                const warehouseStock = warehouseItem?.currentStock || 0;
                                if (warehouseStock === 0) {
                                  alert('⚠️ 仓库库存不足');
                                  return;
                                }
                                setTransferModal({ show: true, itemId: item.itemId, type: 'add' });
                                setTransferQuantity(1);
                              }}
                              style={{
                                padding: '0.3rem 0.6rem',
                                backgroundColor: '#dbeafe',
                                color: '#2563eb',
                                border: '1px solid #bfdbfe',
                                borderRadius: '0.25rem',
                                cursor: 'pointer',
                                fontSize: '1rem',
                                fontWeight: '700',
                                lineHeight: '1'
                              }}
                              title="从仓库调拨到冰箱"
                            >
                              +
                            </button>
                                                    
                            {/* ✅ 从冰箱退回仓库（减少） */}
                            <button
                              onClick={() => {
                                if (fridgeStock === 0) {
                                  alert('⚠️ 冰箱库存为0');
                                  return;
                                }
                                setTransferModal({ show: true, itemId: item.itemId, type: 'remove' });
                                setTransferQuantity(1);
                              }}
                              style={{
                                padding: '0.3rem 0.6rem',
                                backgroundColor: '#fee2e2',
                                color: '#dc2626',
                                border: '1px solid #fecaca',
                                borderRadius: '0.25rem',
                                cursor: 'pointer',
                                fontSize: '1rem',
                                fontWeight: '700',
                                lineHeight: '1'
                              }}
                              title="从冰箱退回仓库"
                            >
                              -
                            </button>
                                                    
                            {/* 删除商品 */}
                            <button
                              onClick={async () => {
                                if (window.confirm(`\u786e\u5b9a\u8981\u4ece\u51b0\u7bb1\u4e2d\u5220\u9664\u201c${item.itemName}\u201d\u5417\uff1f\n\n\u51b0\u7bb1\u4e2d\u7684 ${fridgeStock} ${warehouseItem?.unit || '\u74f6'} \u5c06\u9000\u56de\u5230\u4ed3\u5e93`)) {
                                  const now = Date.now();
                                  const fridgeInventoryId = `${selectedFridge}-${item.itemId}`;

                                  try {
                                    await smartIncrementField('inventory_items', item.itemId, 'currentStock', fridgeStock, {
                                      lastModified: now,
                                      lastUpdated: new Date()
                                    });
                                    await smartDeleteDocument('fridge_inventory', fridgeInventoryId);
                                  } catch (error) {
                                    console.error('\u4ece\u51b0\u7bb1\u79fb\u9664\u5546\u54c1\u5931\u8d25:', error);
                                    alert('\u4ece\u51b0\u7bb1\u79fb\u9664\u5546\u54c1\u5931\u8d25\uff0c\u8bf7\u68c0\u67e5\u7f51\u7edc\u540e\u91cd\u8bd5');
                                    return;
                                  }

                                  setInventoryItems(items => items.map(i =>
                                    i.id === item.itemId ? { ...i, currentStock: i.currentStock + fridgeStock, lastModified: now, lastUpdated: new Date() } : i
                                  ));
                                  setFridgeInventory(inv => inv.filter(i =>
                                    !(i.fridgeId === selectedFridge && i.itemId === item.itemId)
                                  ));
                                }                              }}
                              style={{
                                padding: '0.3rem 0.6rem',
                                backgroundColor: '#f3f4f6',
                                color: '#6b7280',
                                border: '1px solid #e5e7eb',
                                borderRadius: '0.25rem',
                                cursor: 'pointer',
                                fontSize: '0.75rem'
                              }}
                              title="从冰箱移除此商品"
                            >
                              🗑️
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  });
                })()}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* 冰箱管理弹窗 */}
      {showAddFridgeModal && (
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
            padding: '1rem',
            minWidth: '500px',
            maxHeight: '80vh',
            overflow: 'auto'
          }}>
            <h3 style={{ margin: '0 0 1.5rem 0' }}>🧊 冰箱管理</h3>
            
            {/* 现有冰箱列表 */}
            <div style={{ marginBottom: '1.5rem' }}>
              <h4 style={{ margin: '0 0 1rem 0', fontSize: '1rem' }}>现有冰箱</h4>
              {fridges.map(fridge => (
                <div key={fridge.id} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '0.75rem',
                  border: '1px solid #e5e7eb',
                  borderRadius: '0.375rem',
                  marginBottom: '0.5rem'
                }}>
                  <div>
                    <div style={{ fontWeight: '600' }}>{fridge.name}</div>
                    {fridge.location && (
                      <div style={{ fontSize: '0.85rem', color: '#6b7280' }}>{fridge.location}</div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      onClick={() => {
                        setEditingFridge(fridge);
                        setNewFridgeName(fridge.name);
                        setNewFridgeLocation(fridge.location || '');
                        setShowEditFridgeModal(true);
                      }}
                      style={{
                        padding: '0.4rem 0.8rem',
                        backgroundColor: '#3b82f6',
                        color: 'white',
                        border: 'none',
                        borderRadius: '0.25rem',
                        cursor: 'pointer',
                        fontSize: '0.85rem'
                      }}
                    >
                      编辑
                    </button>
                    <button
                      onClick={() => handleDeleteFridge(fridge)}
                      style={{
                        padding: '0.4rem 0.8rem',
                        backgroundColor: '#ef4444',
                        color: 'white',
                        border: 'none',
                        borderRadius: '0.25rem',
                        cursor: 'pointer',
                        fontSize: '0.85rem'
                      }}
                    >
                      删除
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* 添加新冰箱 */}
            <div style={{ borderTop: '2px solid #e5e7eb', paddingTop: '1.5rem' }}>
              <h4 style={{ margin: '0 0 1rem 0', fontSize: '1rem' }}>添加新冰箱</h4>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>冰箱名称 *</label>
                <input
                  type="text"
                  value={newFridgeName}
                  onChange={(e) => setNewFridgeName(e.target.value)}
                  placeholder="例如：1号冰箱"
                  style={{
                    width: '100%',
                    padding: '0.6rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.375rem',
                    fontSize: '0.9rem'
                  }}
                />
              </div>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>位置</label>
                <input
                  type="text"
                  value={newFridgeLocation}
                  onChange={(e) => setNewFridgeLocation(e.target.value)}
                  placeholder="例如：吧台左侧"
                  style={{
                    width: '100%',
                    padding: '0.6rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.375rem',
                    fontSize: '0.9rem'
                  }}
                />
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => {
                    setShowAddFridgeModal(false);
                    setNewFridgeName('');
                    setNewFridgeLocation('');
                  }}
                  style={{
                    padding: '0.6rem 1.2rem',
                    backgroundColor: '#6b7280',
                    color: 'white',
                    border: 'none',
                    borderRadius: '0.375rem',
                    cursor: 'pointer'
                  }}
                >
                  取消
                </button>
                <button
                  onClick={handleAddFridge}
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
                  添加冰箱
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 编辑冰箱弹窗 */}
      {showEditFridgeModal && editingFridge && (
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
            padding: '2rem',
            minWidth: '400px'
          }}>
            <h3 style={{ margin: '0 0 1.5rem 0' }}>✏️ 编辑冰箱</h3>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>冰箱名称 *</label>
              <input
                type="text"
                value={newFridgeName}
                onChange={(e) => setNewFridgeName(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.6rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.375rem',
                  fontSize: '0.9rem'
                }}
              />
            </div>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>位置</label>
              <input
                type="text"
                value={newFridgeLocation}
                onChange={(e) => setNewFridgeLocation(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.6rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.375rem',
                  fontSize: '0.9rem'
                }}
              />
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setShowEditFridgeModal(false);
                  setEditingFridge(null);
                  setNewFridgeName('');
                  setNewFridgeLocation('');
                }}
                style={{
                  padding: '0.6rem 1.2rem',
                  backgroundColor: '#6b7280',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.375rem',
                  cursor: 'pointer'
                }}
              >
                取消
              </button>
              <button
                onClick={handleEditFridge}
                style={{
                  padding: '0.6rem 1.2rem',
                  backgroundColor: '#3b82f6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.375rem',
                  cursor: 'pointer',
                  fontWeight: '600'
                }}
              >
                保存修改
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ✅ 添加新商品弹窗 */}
      {showAddItemModal && (
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
            padding: '2rem',
            minWidth: '500px',
            maxHeight: '80vh',
            overflow: 'auto'
          }}>
            <h3 style={{ margin: '0 0 1.5rem 0' }}>➕ 添加新商品到冰箱</h3>
            
            {/* 搜索框 */}
            <div style={{ marginBottom: '1rem' }}>
              <input
                type="text"
                placeholder="搜索商品（Cerveza / Bebida / Jugo）..."
                value={addSearchTerm}
                onChange={(e) => setAddSearchTerm(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.6rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.375rem',
                  fontSize: '0.9rem'
                }}
              />
            </div>

            {/* 商品列表 - 只显示未在任何冰箱的饮料/酒水 */}
            <div style={{ maxHeight: '300px', overflow: 'auto', marginBottom: '1rem' }}>
              {(() => {
                const allFridgeItemIds = new Set(fridgeInventory.map(inv => inv.itemId));
                
                return inventoryItems
                  .filter(item => {
                    // ✅ 只允许饮料和酒水进冰箱
                    const isAllowedCategory = canItemEnterFridge(item, inventoryCategories);
                    // ✅ 只显示未在任何冰箱的商品
                    const notInAnyFridge = !allFridgeItemIds.has(item.id);
                    // ✅ 搜索筛选
                    const matchesSearch = !addSearchTerm || item.name.toLowerCase().includes(addSearchTerm.toLowerCase());
                    
                    return isAllowedCategory && notInAnyFridge && matchesSearch;
                  })
                  .map(item => (
                    <div
                      key={item.id}
                      onClick={() => setNewItemData({...newItemData, itemId: item.id})}
                      style={{
                        padding: '0.75rem',
                        border: newItemData.itemId === item.id ? '2px solid #3b82f6' : '1px solid #e5e7eb',
                        borderRadius: '0.375rem',
                        marginBottom: '0.5rem',
                        cursor: 'pointer',
                        backgroundColor: newItemData.itemId === item.id ? '#eff6ff' : 'white'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontWeight: '600' }}>{item.name}</div>
                          <div style={{ fontSize: '0.85rem', color: '#6b7280' }}>
                            {item.unit} | 仓库库存: {item.currentStock}
                          </div>
                        </div>
                        {newItemData.itemId === item.id && (
                          <span style={{ color: '#3b82f6', fontSize: '1.2rem' }}>✓</span>
                        )}
                      </div>
                    </div>
                  ));
              })()}
            </div>

            {/* 数量输入 */}
            {newItemData.itemId && (() => {
              const selectedItem = inventoryItems.find(i => i.id === newItemData.itemId);
              return (
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>调拨数量</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={newItemData.quantity > 0 ? newItemData.quantity.toString() : ''}
                    onChange={(e) => {
                      const inputValue = e.target.value;
                      
                      // ✅ 允许清空
                      if (inputValue === '') {
                        setNewItemData({...newItemData, quantity: 0});
                        return;
                      }
                      
                      // ✅ 只允许数字
                      if (/^\d+$/.test(inputValue)) {
                        const value = parseInt(inputValue);
                        const maxQty = selectedItem?.currentStock || 0;
                        if (value >= 0 && value <= maxQty) {
                          setNewItemData({...newItemData, quantity: value});
                        }
                      }
                    }}
                    onKeyDown={(e) => {
                      // ✅ 允许 Backspace 和 Delete 清空
                      if ((e.key === 'Backspace' || e.key === 'Delete') && newItemData.quantity.toString().length === 1) {
                        setTimeout(() => {
                          const el = e.target as HTMLInputElement;
                          if (el.value === '') {
                            setNewItemData({...newItemData, quantity: 0});
                          }
                        }, 0);
                      }
                    }}
                    placeholder="请输入数量"
                    style={{
                      width: '100%',
                      padding: '0.6rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '0.375rem',
                      fontSize: '0.9rem'
                    }}
                  />
                  <div style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: '0.3rem' }}>
                    最多可调拨 {selectedItem?.currentStock || 0} {selectedItem?.unit || ''}
                  </div>
                </div>
              );
            })()}

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setShowAddItemModal(false);
                  setNewItemData({ itemId: '', quantity: 1 });
                  setAddSearchTerm('');
                }}
                style={{
                  padding: '0.6rem 1.2rem',
                  backgroundColor: '#6b7280',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.375rem',
                  cursor: 'pointer'
                }}
              >
                取消
              </button>
              <button
                onClick={handleAddNewItem}
                style={{
                  padding: '0.6rem 1.2rem',
                  backgroundColor: '#3b82f6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.375rem',
                  cursor: 'pointer',
                  fontWeight: '600'
                }}
              >
                确认添加
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ✅ 简化版调拨弹窗 */}
      {transferModal.show && (() => {
        const item = inventoryItems.find(i => i.id === transferModal.itemId);
        if (!item) return null;
        
        const fridgeRecord = fridgeInventory.find(inv => inv.fridgeId === selectedFridge && inv.itemId === item.id);
        const fridgeStock = fridgeRecord?.quantity || 0;
        const warehouseStock = item.currentStock || 0;
        const isAdd = transferModal.type === 'add';
        
        return (
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
              padding: '2rem',
              minWidth: '400px',
              maxHeight: '80vh',
              overflow: 'auto'
            }}>
              <h3 style={{ margin: '0 0 1.5rem 0' }}>
                {isAdd ? '📦 从仓库调拨到冰箱' : '🔄 从冰箱退回仓库'}
              </h3>
              
              <div style={{ marginBottom: '1rem' }}>
                <div style={{ fontWeight: '600', marginBottom: '0.5rem' }}>商品：{item.name}</div>
                <div style={{ fontSize: '0.9rem', color: '#6b7280' }}>
                  {isAdd ? (
                    <>
                      <div>当前冰箱库存：{fridgeStock} {item.unit}</div>
                      <div>仓库库存：{warehouseStock} {item.unit}</div>
                    </>
                  ) : (
                    <>
                      <div>当前冰箱库存：{fridgeStock} {item.unit}</div>
                      <div>退回后仓库库存：{warehouseStock + transferQuantity} {item.unit}</div>
                    </>
                  )}
                </div>
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>数量</label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={transferQuantity > 0 ? transferQuantity.toString() : ''}
                  onChange={(e) => {
                    const inputValue = e.target.value;
                    
                    // ✅ 允许清空
                    if (inputValue === '') {
                      setTransferQuantity(0);
                      return;
                    }
                    
                    // ✅ 只允许数字
                    if (/^\d+$/.test(inputValue)) {
                      const value = parseInt(inputValue);
                      const maxQty = isAdd ? warehouseStock : fridgeStock;
                      if (value >= 0 && value <= maxQty) {
                        setTransferQuantity(value);
                      }
                    }
                  }}
                  onKeyDown={(e) => {
                    // ✅ 允许 Backspace 和 Delete 清空
                    if ((e.key === 'Backspace' || e.key === 'Delete') && transferQuantity.toString().length === 1) {
                      setTimeout(() => {
                        const el = e.target as HTMLInputElement;
                        if (el.value === '') {
                          setTransferQuantity(0);
                        }
                      }, 0);
                    }
                  }}
                  placeholder="请输入数量"
                  style={{
                    width: '100%',
                    padding: '0.6rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.375rem',
                    fontSize: '1rem',
                    textAlign: 'center'
                  }}
                />
                <div style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: '0.3rem' }}>
                  {isAdd ? `最多可调拨 ${warehouseStock} ${item.unit}` : `最多可退回 ${fridgeStock} ${item.unit}`}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => {
                    if (isTransferSubmitting) return;
                    setTransferModal({ show: false, itemId: '', type: 'add' });
                    setTransferQuantity(1);
                  }}
                  disabled={isTransferSubmitting}
                  style={{
                    padding: '0.6rem 1.2rem',
                    backgroundColor: '#6b7280',
                    color: 'white',
                    border: 'none',
                    borderRadius: '0.375rem',
                    cursor: isTransferSubmitting ? 'not-allowed' : 'pointer',
                    opacity: isTransferSubmitting ? 0.65 : 1
                  }}
                >
                  取消
                </button>
                <button
                  onClick={handleSimpleTransfer}
                  disabled={isTransferSubmitting || transferQuantity <= 0}
                  style={{
                    padding: '0.6rem 1.2rem',
                    backgroundColor: isTransferSubmitting || transferQuantity <= 0 ? '#9ca3af' : (isAdd ? '#3b82f6' : '#10b981'),
                    color: 'white',
                    border: 'none',
                    borderRadius: '0.375rem',
                    cursor: isTransferSubmitting || transferQuantity <= 0 ? 'not-allowed' : 'pointer',
                    fontWeight: '600'
                  }}
                >
                  {isTransferSubmitting ? '处理中...' : (isAdd ? '确认调拨' : '确认退回')}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 调拨记录弹窗 */}
      {showTransferHistoryModal && (
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
            width: '96vw',
            maxWidth: '1320px',
            height: '90vh',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.25rem' }}>调拨记录</h3>
                <div style={{ color: '#6b7280', fontSize: '0.85rem', marginTop: '0.25rem' }}>
                  每条记录包含具体时间、数量、方向、仓库/冰箱调拨前后数值
                </div>
              </div>
              <button
                onClick={() => setShowTransferHistoryModal(false)}
                style={{
                  padding: '0.45rem 0.9rem',
                  backgroundColor: '#6b7280',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.375rem',
                  cursor: 'pointer'
                }}
              >
                关闭
              </button>
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: '180px minmax(180px, 1fr) auto auto',
              gap: '0.75rem',
              alignItems: 'center',
              marginBottom: '1rem'
            }}>
              <input
                type="date"
                value={transferHistoryDate}
                onChange={(e) => setTransferHistoryDate(e.target.value)}
                style={{
                  padding: '0.55rem 0.7rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.375rem',
                  fontSize: '0.9rem'
                }}
              />
              <input
                type="text"
                value={transferSearchTerm}
                onChange={(e) => setTransferSearchTerm(e.target.value)}
                placeholder="搜索商品、冰箱、操作ID"
                style={{
                  padding: '0.55rem 0.7rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.375rem',
                  fontSize: '0.9rem'
                }}
              />
              <button
                onClick={() => setTransferHistoryDate('')}
                style={{
                  padding: '0.55rem 0.9rem',
                  backgroundColor: '#f3f4f6',
                  color: '#374151',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.375rem',
                  cursor: 'pointer',
                  fontWeight: 600
                }}
              >
                全部日期
              </button>
              <button
                onClick={refreshTransferHistory}
                disabled={isTransferHistoryLoading}
                style={{
                  padding: '0.55rem 0.9rem',
                  backgroundColor: isTransferHistoryLoading ? '#9ca3af' : '#f97316',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.375rem',
                  cursor: isTransferHistoryLoading ? 'not-allowed' : 'pointer',
                  fontWeight: 600
                }}
              >
                {isTransferHistoryLoading ? '刷新中...' : '刷新记录'}
              </button>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#6b7280', fontSize: '0.85rem', marginBottom: '0.75rem' }}>
              <span>当前显示 {filteredTransferRecords.length} 条记录</span>
              {transferHistoryDate && <span>日期：{transferHistoryDate}</span>}
            </div>

            <div style={{ flex: 1, overflow: 'auto', border: '1px solid #e5e7eb', borderRadius: '0.5rem' }}>
              {filteredTransferRecords.length === 0 ? (
                <div style={{ padding: '3rem', textAlign: 'center', color: '#9ca3af' }}>
                  暂无调拨记录
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.86rem' }}>
                  <thead style={{ position: 'sticky', top: 0, backgroundColor: '#f9fafb', zIndex: 1 }}>
                    <tr>
                      <th style={{ padding: '0.7rem', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>时间</th>
                      <th style={{ padding: '0.7rem', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>商品</th>
                      <th style={{ padding: '0.7rem', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>冰箱</th>
                      <th style={{ padding: '0.7rem', textAlign: 'center', borderBottom: '1px solid #e5e7eb' }}>方向</th>
                      <th style={{ padding: '0.7rem', textAlign: 'right', borderBottom: '1px solid #e5e7eb' }}>数量</th>
                      <th style={{ padding: '0.7rem', textAlign: 'right', borderBottom: '1px solid #e5e7eb' }}>仓库前/后</th>
                      <th style={{ padding: '0.7rem', textAlign: 'right', borderBottom: '1px solid #e5e7eb' }}>冰箱前/后</th>
                      <th style={{ padding: '0.7rem', textAlign: 'center', borderBottom: '1px solid #e5e7eb' }}>状态</th>
                      <th style={{ padding: '0.7rem', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>操作ID</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTransferRecords.map(record => {
                      const isToFridge = record.direction === 'warehouse_to_fridge';
                      const pending = Boolean(record.pendingCloudSync);
                      return (
                        <tr key={record.id || record.operationId} style={{ backgroundColor: pending ? '#fff7ed' : 'white' }}>
                          <td style={{ padding: '0.65rem', borderBottom: '1px solid #f3f4f6', whiteSpace: 'nowrap', fontFamily: 'monospace' }}>
                            {formatTransferRecordTime(record)}
                          </td>
                          <td style={{ padding: '0.65rem', borderBottom: '1px solid #f3f4f6', fontWeight: 600 }}>
                            {record.itemName || record.itemId || '--'}
                            {record.unit && <span style={{ color: '#6b7280', fontWeight: 400 }}> / {record.unit}</span>}
                          </td>
                          <td style={{ padding: '0.65rem', borderBottom: '1px solid #f3f4f6' }}>
                            {record.fridgeName || record.fridgeId || '--'}
                          </td>
                          <td style={{ padding: '0.65rem', borderBottom: '1px solid #f3f4f6', textAlign: 'center' }}>
                            {isToFridge ? '仓库→冰箱' : '冰箱→仓库'}
                          </td>
                          <td style={{ padding: '0.65rem', borderBottom: '1px solid #f3f4f6', textAlign: 'right', fontWeight: 700 }}>
                            {record.quantity || 0}
                          </td>
                          <td style={{ padding: '0.65rem', borderBottom: '1px solid #f3f4f6', textAlign: 'right', fontFamily: 'monospace' }}>
                            {record.beforeWarehouseStock ?? '--'} / {record.afterWarehouseStock ?? '--'}
                          </td>
                          <td style={{ padding: '0.65rem', borderBottom: '1px solid #f3f4f6', textAlign: 'right', fontFamily: 'monospace' }}>
                            {record.beforeFridgeStock ?? '--'} / {record.afterFridgeStock ?? '--'}
                          </td>
                          <td style={{ padding: '0.65rem', borderBottom: '1px solid #f3f4f6', textAlign: 'center', color: pending ? '#c2410c' : '#15803d', fontWeight: 700 }}>
                            {pending ? '待同步' : '已入账'}
                          </td>
                          <td style={{ padding: '0.65rem', borderBottom: '1px solid #f3f4f6', fontFamily: 'monospace', color: '#6b7280', maxWidth: '170px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {record.operationId || record.id || '--'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {showHistoryModal && (() => {
        const currentHistory = stocktakeHistory;
        
        return (
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
            padding: '2rem',
            width: '96vw',
            maxWidth: '1320px',
            height: '90vh',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }} id="fridge-stocktake-print" className="print-container">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', marginBottom: '0.65rem', flexWrap: 'wrap' }}>
              <h3 style={{ margin: 0 }}>📋 今日盘点汇总</h3>
              <div className="stocktake-print-actions" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <input
                  type="date"
                  value={selectedHistoryDate}
                  onChange={(e) => setSelectedHistoryDate(e.target.value)}
                  style={{
                    padding: '0.4rem 0.6rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.375rem',
                    fontSize: '0.9rem'
                  }}
                />
                <button
                  onClick={exportToCSV}
                  style={{
                    padding: '0.4rem 0.8rem',
                    backgroundColor: '#10b981',
                    color: 'white',
                    border: 'none',
                    borderRadius: '0.375rem',
                    cursor: 'pointer',
                    fontSize: '0.85rem'
                  }}
                >
                  📥 导出CSV
                </button>
                <button
                  onClick={() => printStocktakeHistory('fridge-stocktake-print')}
                  style={{
                    padding: '0.4rem 0.8rem',
                    backgroundColor: '#3b82f6',
                    color: 'white',
                    border: 'none',
                    borderRadius: '0.375rem',
                    cursor: 'pointer',
                    fontSize: '0.85rem'
                  }}
                >
                  🖨️ 打印
                </button>
                <button
                  onClick={() => setShowHistoryModal(false)}
                  style={{
                    padding: '0.4rem 0.8rem',
                    backgroundColor: '#6b7280',
                    color: 'white',
                    border: 'none',
                    borderRadius: '0.375rem',
                    cursor: 'pointer',
                    fontSize: '0.85rem'
                  }}
                >
                  关闭
                </button>
              </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, paddingRight: '0.25rem' }}>
              {(() => {
              const filteredHistory = currentHistory.filter((record: any) => {
                const recordDate = getStocktakeRecordDateKey(record);
                return recordDate === selectedHistoryDate;
              });

              if (filteredHistory.length === 0) {
                return (
                  <div style={{ textAlign: 'center', padding: '3rem', color: '#9ca3af' }}>
                    <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>📊</div>
                    <p>{selectedHistoryDate === getLocalDateString() ? '今日暂无盘点记录' : `${selectedHistoryDate} 无盘点记录`}</p>
                  </div>
                );
              }

              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                  {filteredHistory.map((record: any) => {
                    const latestRecord = record;
                    
                    return (
                      <div key={record.id} style={{
                        border: '1px solid #e5e7eb',
                        borderRadius: '0.5rem',
                        overflow: 'hidden'
                      }}>
                        <div style={{
                          padding: '0.55rem 0.75rem',
                          backgroundColor: '#f9fafb',
                          borderBottom: '1px solid #e5e7eb',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center'
                        }}>
                          <div>
                            <div style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>
                              🧊 {latestRecord.fridgeName || '未知冰箱'}
                            </div>
                            <div style={{ fontSize: '0.85rem', color: '#6b7280', marginTop: '0.25rem' }}>
                              {formatStocktakeRecordDateTime(latestRecord)}
                            </div>
                          </div>
                          <div style={{
                            padding: '0.25rem 0.6rem',
                            backgroundColor: latestRecord.totalDiscrepancies > 0 ? '#fef3c7' : '#d1fae5',
                            color: latestRecord.totalDiscrepancies > 0 ? '#92400e' : '#065f46',
                            borderRadius: '0.375rem',
                            fontWeight: '600'
                          }}>
                            {latestRecord.totalDiscrepancies > 0 ? `⚠️ ${latestRecord.totalDiscrepancies}个差异` : '✓ 无差异'}
                          </div>
                        </div>

                        <div style={{ overflowX: 'auto' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                            <thead style={{ backgroundColor: 'white', position: 'sticky', top: 0 }}>
                              <tr>
                                <th style={{ padding: '0.6rem', textAlign: 'left', borderBottom: '2px solid #e5e7eb' }}>商品名称</th>
                                <th style={{ padding: '0.6rem', textAlign: 'right', borderBottom: '2px solid #e5e7eb' }}>总库存</th>
                                <th style={{ padding: '0.6rem', textAlign: 'right', borderBottom: '2px solid #e5e7eb' }}>仓库值</th>
                                <th style={{ padding: '0.6rem', textAlign: 'right', borderBottom: '2px solid #e5e7eb' }}>冰箱值</th>
                                <th style={{ padding: '0.6rem', textAlign: 'right', borderBottom: '2px solid #e5e7eb' }}>盘点值</th>
                                <th style={{ padding: '0.6rem', textAlign: 'right', borderBottom: '2px solid #e5e7eb' }}>差异</th>
                              </tr>
                            </thead>
                            <tbody>
                              {latestRecord.items.map((item: any, idx: number) => {
                                const hasDiff = item.difference !== 0;
                                return (
                                  <tr key={idx} style={{ backgroundColor: hasDiff ? '#fef3c7' : 'white' }}>
                                    <td style={{ padding: '0.6rem', borderBottom: '1px solid #f3f4f6' }}>
                                      {item.itemName}
                                      <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.15rem' }}>
                                        {item.unit || ''}
                                      </div>
                                    </td>
                                    <td style={{ padding: '0.6rem', textAlign: 'right', borderBottom: '1px solid #f3f4f6', fontWeight: '700' }}>
                                      {item.totalStock}
                                    </td>
                                    <td style={{ padding: '0.6rem', textAlign: 'right', borderBottom: '1px solid #f3f4f6', color: '#3b82f6' }}>
                                      {item.warehouseStock}
                                    </td>
                                    <td style={{ padding: '0.6rem', textAlign: 'right', borderBottom: '1px solid #f3f4f6', color: '#8b5cf6' }}>
                                      {item.systemStock}
                                    </td>
                                    <td style={{ padding: '0.6rem', textAlign: 'right', borderBottom: '1px solid #f3f4f6', fontWeight: '600' }}>
                                      {item.actualStock}
                                    </td>
                                    <td style={{ padding: '0.6rem', textAlign: 'right', borderBottom: '1px solid #f3f4f6' }}>
                                      {hasDiff ? (
                                        <span style={{
                                          fontWeight: 'bold',
                                          fontSize: '1.1rem',
                                          color: item.difference > 0 ? '#10b981' : '#ef4444'
                                        }}>
                                          {item.difference > 0 ? '+' : ''}{item.difference}
                                        </span>
                                      ) : (
                                        <span style={{ color: '#10b981', fontSize: '1.2rem', fontWeight: 'bold' }}>✓</span>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
            </div>
          </div>
        </div>
      );
      })()}
    </div>
  );
};

// 打印样式
if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = `
    @media print {
      @page {
        size: A4;
        margin: 10mm;
      }
      
      .stocktake-print-actions {
        display: none !important;
      }
      
      .print-container {
        display: block !important;
        position: static !important;
        width: 100% !important;
        height: auto !important;
        max-height: none !important;
        overflow: visible !important;
        background: white;
        padding: 0 !important;
        margin: 0 !important;
      }
      
      /* 移除所有内部滚动 */
      .print-container div[style*="overflow"] {
        overflow: visible !important;
        max-height: none !important;
        height: auto !important;
      }
      
      /* 标题缩小 */
      .print-container h3 {
        font-size: 14pt !important;
        margin: 0 0 8px 0 !important;
      }
      
      /* 表格优化 - A4适配 */
      table {
        page-break-inside: auto;
        width: 100% !important;
        font-size: 9pt !important;
        border-collapse: collapse !important;
      }
      tr {
        page-break-inside: avoid;
        page-break-after: auto;
      }
      thead {
        display: table-header-group;
      }
      
      td, th {
        border: 1px solid #000 !important;
        padding: 4px 6px !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
        font-size: 9pt !important;
      }
      
      th {
        background-color: #f3f4f6 !important;
        font-weight: bold !important;
        font-size: 9pt !important;
      }
      
      /* 差异高亮保持 */
      td span {
        font-size: 9pt !important;
      }
      
      button {
        display: none !important;
      }
      
      /* 日期选择器等隐藏 */
      input[type="date"] {
        display: none !important;
      }
    }
  `;
  document.head.appendChild(style);
}

export default FridgeStocktake;
