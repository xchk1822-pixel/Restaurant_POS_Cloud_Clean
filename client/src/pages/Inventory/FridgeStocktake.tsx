import React, { useState, useEffect } from 'react';
import { useAppContext } from '../../contexts/AppContext';
import { getLocalDateString } from '../../utils/exchangeRate'; // 🔥 导入本地日期工具
import { smartAddDocument, smartGetDocuments, smartIncrementField, smartUpdateDocument, smartDeleteDocument } from '../../services/smartSyncService';
import { mergeRecordsByVersion } from '../../utils/syncMerge';

interface FridgeItem {
  fridgeId: string;
  itemId: string;
  quantity: number;
  itemName?: string;
  unit?: string;
  barcode?: string;
}

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
  const [editingFridge, setEditingFridge] = useState<any>(null);
  
  // ✅ 简化版调拨弹窗
  const [transferModal, setTransferModal] = useState<{ show: boolean; itemId: string; type: 'add' | 'remove' }>({ show: false, itemId: '', type: 'add' });
  const [transferQuantity, setTransferQuantity] = useState<number>(1);
  
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
  
  // 库存分类（从 localStorage 加载）
  const [inventoryCategories] = useState<Array<{ key: string; name: string; icon: string }>>(() => {
    try {
      const saved = localStorage.getItem('inventory_categories');
      return saved ? JSON.parse(saved) : [
        { key: 'ingredient', name: '食材', icon: '🥬' },
        { key: 'alcohol', name: '酒水', icon: '🍺' },
        { key: 'beverage', name: '饮料', icon: '🥤' },
        { key: 'other', name: '其他', icon: '📦' }
      ];
    } catch {
      return [
        { key: 'ingredient', name: '食材', icon: '🥬' },
        { key: 'alcohol', name: '酒水', icon: '🍺' },
        { key: 'beverage', name: '饮料', icon: '🥤' },
        { key: 'other', name: '其他', icon: '📦' }
      ];
    }
  });
  
  // 盘点历史
  const [stocktakeHistory, setStocktakeHistory] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem('fridge_stocktake_history');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // 获取当前冰箱的商品列表
  const getFridgeItems = (): FridgeItem[] => {
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
  };

  // ✅ 获取所有其他冰箱已占用的商品ID（互斥逻辑）
  const getOtherFridgeItemIds = (): Set<string> => {
    const otherItems = fridgeInventory.filter(inv => inv.fridgeId !== selectedFridge);
    return new Set(otherItems.map(inv => inv.itemId));
  };

  const fridgeItems = getFridgeItems();
  const refreshFridgeData = async () => {
    setIsRefreshing(true);
    try {
      const [cloudFridges, cloudFridgeInventory, cloudItems, cloudHistory] = await Promise.all([
        smartGetDocuments('fridges'),
        smartGetDocuments('fridge_inventory'),
        smartGetDocuments('inventory_items'),
        smartGetDocuments('fridge_stocktake_history')
      ]);

      if (cloudFridges.length > 0) {
        setFridges(prev => mergeRecordsByVersion(prev, cloudFridges));
      }

      if (cloudFridgeInventory.length > 0) {
        setFridgeInventory(prev => mergeRecordsByVersion(prev, cloudFridgeInventory));
      }

      if (cloudItems.length > 0) {
        setInventoryItems(prev => mergeRecordsByVersion(prev, cloudItems, item => ({
          ...item,
          lastUpdated: item.lastUpdated ? new Date(item.lastUpdated) : new Date()
        })));
      }

      if (cloudHistory.length > 0) {
        const mergedHistory = mergeRecordsByVersion(stocktakeHistory, cloudHistory);
        setStocktakeHistory(mergedHistory);
        localStorage.setItem('fridge_stocktake_history', JSON.stringify(mergedHistory.slice(0, 50)));
      }

      setLastSyncedAt(new Date());
    } catch (error) {
      console.error('刷新冰箱盘点数据失败:', error);
      alert('刷新冰箱盘点数据失败，请检查网络后重试');
    } finally {
      setIsRefreshing(false);
    }
  };

  // 初始化：加载实际数量和排序
  useEffect(() => {
    // ✅ 初始化实际数量（清空，等待人工清点）
    const initial: Record<string, number> = {};
    fridgeItems.forEach(item => {
      // 只保留之前的输入值，不清空
      if (actualQuantities[item.itemId] !== undefined) {
        initial[item.itemId] = actualQuantities[item.itemId];
      }
      // 新商品或清空后，默认为空（null表示未盘点）
    });
    setActualQuantities(initial);
    
    // 加载或初始化排序
    const loadOrder = () => {
      try {
        const saved = localStorage.getItem(`fridge_item_order_${selectedFridge}`);
        const currentItemIds = fridgeItems.map(item => item.itemId);
        
        if (saved) {
          const savedOrder: string[] = JSON.parse(saved);
          const existingItems = savedOrder.filter(id => currentItemIds.includes(id));
          const newItems = currentItemIds.filter(id => !savedOrder.includes(id));
          
          // 合并：保留原有顺序 + 新商品追加到末尾
          const mergedOrder = [...existingItems, ...newItems];
          setItemOrder(mergedOrder);
          
          // 如果有变化，保存更新后的顺序
          if (newItems.length > 0) {
            localStorage.setItem(`fridge_item_order_${selectedFridge}`, JSON.stringify(mergedOrder));
          }
        } else {
          // 没有保存的顺序，使用默认顺序
          setItemOrder(currentItemIds);
          localStorage.setItem(`fridge_item_order_${selectedFridge}`, JSON.stringify(currentItemIds));
        }
      } catch (error) {
        console.error('加载排序失败:', error);
        const defaultOrder = fridgeItems.map(item => item.itemId);
        setItemOrder(defaultOrder);
      }
    };
    
    loadOrder();
  }, [selectedFridge, fridgeItems.length]);

  // 自动保存排序
  useEffect(() => {
    if (itemOrder.length > 0 && selectedFridge) {
      localStorage.setItem(`fridge_item_order_${selectedFridge}`, JSON.stringify(itemOrder));
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
  const handleAddFridge = () => {
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
    
    setFridges([...fridges, newFridge]);
    smartAddDocument('fridges', newFridge).catch(error => {
      console.error('同步新增冰箱失败:', error);
    });
    setNewFridgeName('');
    setNewFridgeLocation('');
    setShowAddFridgeModal(false);
    setSelectedFridge(newFridge.id);
  };

  // 编辑冰箱
  const handleEditFridge = () => {
    if (!editingFridge || !newFridgeName.trim()) return;
    
    const updatedFridge = {
      ...editingFridge,
      name: newFridgeName.trim(),
      location: newFridgeLocation.trim(),
      lastModified: Date.now()
    };

    setFridges(fridges.map(f =>
      f.id === editingFridge.id
        ? updatedFridge
        : f
    ));
    smartUpdateDocument('fridges', editingFridge.id, updatedFridge).catch(error => {
      console.error('同步编辑冰箱失败:', error);
    });
    
    setEditingFridge(null);
    setNewFridgeName('');
    setNewFridgeLocation('');
    setShowEditFridgeModal(false);
  };

  // 删除冰箱
  const handleDeleteFridge = (fridge: any) => {
    if (!window.confirm(`确定要删除冰箱“${fridge.name}”吗？该冰箱的所有库存记录也将被删除。`)) {
      return;
    }
    
    const recordsToDelete = fridgeInventory.filter(inv => inv.fridgeId === fridge.id);
    setFridges(fridges.filter(f => f.id !== fridge.id));
    setFridgeInventory(fridgeInventory.filter(inv => inv.fridgeId !== fridge.id));
    smartDeleteDocument('fridges', fridge.id).catch(error => {
      console.error('同步删除冰箱失败:', error);
    });
    recordsToDelete.forEach(record => {
      const recordId = record.id || `${record.fridgeId}-${record.itemId}`;
      smartDeleteDocument('fridge_inventory', recordId).catch(error => {
        console.error('同步删除冰箱库存记录失败:', error);
      });
    });
    
    if (selectedFridge === fridge.id && fridges.length > 1) {
      setSelectedFridge(fridges.find(f => f.id !== fridge.id)?.id || '');
    }
  };

  // ✅ 简化版调拨：增加/减少冰箱库存
  const handleSimpleTransfer = () => {
    const item = inventoryItems.find(i => i.id === transferModal.itemId);
    if (!item) {
      alert('商品不存在');
      return;
    }

    if (transferQuantity <= 0) {
      alert('⚠️ 请输入有效的数量（必须大于0）');
      return;
    }

    const now = Date.now();
    const fridgeInventoryId = `${selectedFridge}-${item.id}`;

    if (transferModal.type === 'add') {
      // ✅ 从仓库调拨到冰箱
      if (item.currentStock < transferQuantity) {
        alert(`⚠️ 仓库库存不足！当前库存：${item.currentStock} ${item.unit}`);
        return;
      }

      // 1. 减少仓库库存
      setInventoryItems(items => items.map(i =>
        i.id === item.id ? { ...i, currentStock: i.currentStock - transferQuantity, lastModified: now, lastUpdated: new Date() } : i
      ));
      smartIncrementField('inventory_items', item.id, 'currentStock', -transferQuantity, {
        lastModified: now,
        lastUpdated: new Date()
      }).catch(error => {
        console.error('同步仓库调拨扣减失败:', error);
      });

      // 2. 增加冰箱库存
      setFridgeInventory(inv => {
        const existingIndex = inv.findIndex(
          record => record.fridgeId === selectedFridge && record.itemId === item.id
        );
        
        if (existingIndex !== -1) {
          const newInv = [...inv];
          newInv[existingIndex] = {
            ...newInv[existingIndex],
            id: newInv[existingIndex].id || fridgeInventoryId,
            quantity: newInv[existingIndex].quantity + transferQuantity,
            lastModified: now
          };
          return newInv;
        } else {
          return [...inv, {
            id: fridgeInventoryId,
            fridgeId: selectedFridge,
            itemId: item.id,
            quantity: transferQuantity,
            lastModified: now
          }];
        }
      });
      smartIncrementField('fridge_inventory', fridgeInventoryId, 'quantity', transferQuantity, {
        fridgeId: selectedFridge,
        itemId: item.id,
        lastModified: now
      }).catch(error => {
        console.error('同步冰箱调拨增加失败:', error);
      });

      alert(`✅ 调拨成功！\n\n商品：${item.name}\n数量：${transferQuantity} ${item.unit}\n仓库 → 冰箱`);

    } else {
      // ✅ 从冰箱退回仓库
      const fridgeRecord = fridgeInventory.find(
        inv => inv.fridgeId === selectedFridge && inv.itemId === item.id
      );
      
      if (!fridgeRecord || fridgeRecord.quantity < transferQuantity) {
        alert(`⚠️ 冰箱库存不足！当前库存：${fridgeRecord?.quantity || 0} ${item.unit}`);
        return;
      }

      // 1. 增加仓库库存
      setInventoryItems(items => items.map(i =>
        i.id === item.id ? { ...i, currentStock: i.currentStock + transferQuantity, lastModified: now, lastUpdated: new Date() } : i
      ));
      smartIncrementField('inventory_items', item.id, 'currentStock', transferQuantity, {
        lastModified: now,
        lastUpdated: new Date()
      }).catch(error => {
        console.error('同步仓库退回增加失败:', error);
      });

      // 2. 减少冰箱库存
      setFridgeInventory(inv => {
        const existingIndex = inv.findIndex(
          record => record.fridgeId === selectedFridge && record.itemId === item.id
        );
        
        if (existingIndex !== -1) {
          const newInv = [...inv];
          newInv[existingIndex] = {
            ...newInv[existingIndex],
            id: newInv[existingIndex].id || fridgeInventoryId,
            quantity: Math.max(0, newInv[existingIndex].quantity - transferQuantity),
            lastModified: now
          };
          return newInv;
        }
        return inv;
      });
      smartIncrementField('fridge_inventory', fridgeInventoryId, 'quantity', -transferQuantity, {
        fridgeId: selectedFridge,
        itemId: item.id,
        lastModified: now
      }).catch(error => {
        console.error('同步冰箱退回扣减失败:', error);
      });

      alert(`✅ 退回成功！\n\n商品：${item.name}\n数量：${transferQuantity} ${item.unit}\n冰箱 → 仓库`);
    }

    // 关闭弹窗
    setTransferModal({ show: false, itemId: '', type: 'add' });
    setTransferQuantity(1);
  };

  // ✅ 添加新商品到冰箱
  const handleAddNewItem = () => {
    if (!newItemData.itemId) {
      alert('请选择商品');
      return;
    }
    if (newItemData.quantity <= 0) {
      alert('⚠️ 请输入有效的数量（必须大于0）');
      return;
    }

    const item = inventoryItems.find(i => i.id === newItemData.itemId);
    if (!item) {
      alert('商品不存在');
      return;
    }

    if (item.currentStock < newItemData.quantity) {
      alert(`⚠️ 仓库库存不足！当前库存：${item.currentStock} ${item.unit}`);
      return;
    }

    // 检查是否已在当前冰箱
    const existingInCurrentFridge = fridgeInventory.find(
      inv => inv.fridgeId === selectedFridge && inv.itemId === item.id
    );
    
    if (existingInCurrentFridge) {
      alert(`⚠️ 该商品已在当前冰箱中，请使用“+”按钮增加数量`);
      return;
    }

    // 检查是否在其他冰箱
    const existingInOtherFridge = fridgeInventory.find(
      inv => inv.itemId === item.id && inv.fridgeId !== selectedFridge
    );
    
    if (existingInOtherFridge) {
      const otherFridge = fridges.find(f => f.id === existingInOtherFridge.fridgeId);
      alert(`⚠️ 该商品已存在于"${otherFridge?.name || '其他冰箱'}"中，无法添加到当前冰箱`);
      return;
    }

    const now = Date.now();
    const fridgeInventoryId = `${selectedFridge}-${item.id}`;

    // 1. 减少仓库库存
    setInventoryItems(items => items.map(i =>
      i.id === item.id ? { ...i, currentStock: i.currentStock - newItemData.quantity, lastModified: now, lastUpdated: new Date() } : i
    ));
    smartIncrementField('inventory_items', item.id, 'currentStock', -newItemData.quantity, {
      lastModified: now,
      lastUpdated: new Date()
    }).catch(error => {
      console.error('同步添加冰箱商品的仓库扣减失败:', error);
    });

    // 2. 添加到冰箱库存
    setFridgeInventory(inv => [...inv, {
      id: fridgeInventoryId,
      fridgeId: selectedFridge,
      itemId: item.id,
      quantity: newItemData.quantity,
      lastModified: now
    }]);
    smartIncrementField('fridge_inventory', fridgeInventoryId, 'quantity', newItemData.quantity, {
      fridgeId: selectedFridge,
      itemId: item.id,
      lastModified: now
    }).catch(error => {
      console.error('同步添加冰箱商品失败:', error);
    });

    alert(`✅ 添加成功！\n\n商品：${item.name}\n数量：${newItemData.quantity} ${item.unit}\n已添加到：${fridges.find(f => f.id === selectedFridge)?.name}`);
    
    // 关闭弹窗
    setShowAddItemModal(false);
    setNewItemData({ itemId: '', quantity: 1 });
    setAddSearchTerm('');
  };

  // 完成盘点
  const completeStocktake = async () => {
    // ✅ 检查是否有未清点的商品
    const uncountedItems = fridgeItems.filter(item => actualQuantities[item.itemId] === undefined);
    
    if (uncountedItems.length > 0) {
      alert(`⚠️ 还有 ${uncountedItems.length} 个商品未清点：\n${uncountedItems.map(item => '• ' + item.itemName).join('\n')}\n\n请完成所有商品的清点后再确认`);
      return;
    }
    
    const discrepancies: any[] = [];
    let hasDifference = false;

    fridgeItems.forEach(item => {
      const actual = actualQuantities[item.itemId] ?? 0;
      const difference = actual - item.quantity;
      if (difference !== 0) {
        discrepancies.push({
          itemName: item.itemName,
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

    const now = Date.now();

    // 更新冰箱库存
    const newInventory = fridgeInventory.map(inv => {
      if (inv.fridgeId === selectedFridge && actualQuantities[inv.itemId] !== undefined) {
        return {
          ...inv,
          id: inv.id || `${inv.fridgeId}-${inv.itemId}`,
          quantity: actualQuantities[inv.itemId],
          lastModified: now
        };
      }
      return inv;
    });
    setFridgeInventory(newInventory);

    const updatedFridgeRecords = newInventory.filter(inv =>
      inv.fridgeId === selectedFridge && actualQuantities[inv.itemId] !== undefined
    );
    await Promise.allSettled(
      updatedFridgeRecords.map(inv =>
        smartUpdateDocument('fridge_inventory', inv.id || `${inv.fridgeId}-${inv.itemId}`, inv)
      )
    );

    // 保存盘点历史
    try {
      const saved = localStorage.getItem('fridge_stocktake_history');
      const history = saved ? JSON.parse(saved) : [];
      const stocktakeRecord = {
        id: `stocktake-${Date.now()}`,
        fridgeId: selectedFridge,
        fridgeName: fridges.find(f => f.id === selectedFridge)?.name,
        date: getLocalDateString(), // 🔥 使用本地时间
        createdAt: new Date(),
        lastModified: now,
        items: fridgeItems.map(item => {
          const warehouseItem = inventoryItems.find(i => i.id === item.itemId);
          const warehouseStock = warehouseItem?.currentStock || 0;
          const fridgeStock = item.quantity;
          const totalStock = warehouseStock + fridgeStock;
          const actualStock = actualQuantities[item.itemId] || 0;
          
          return {
            itemId: item.itemId,
            itemName: item.itemName,
            unit: item.unit,
            totalStock,
            warehouseStock,
            systemStock: fridgeStock,
            actualStock,
            difference: actualStock - fridgeStock
          };
        }),
        totalDiscrepancies: discrepancies.length
      };
      history.unshift(stocktakeRecord);
      localStorage.setItem('fridge_stocktake_history', JSON.stringify(history.slice(0, 50)));
      setStocktakeHistory(history.slice(0, 50));
      smartAddDocument('fridge_stocktake_history', stocktakeRecord).catch(error => {
        console.error('同步冰箱盘点历史失败:', error);
      });
    } catch (error) {
      console.error('保存盘点历史失败:', error);
    }

    alert('盘点完成！');
  };

  // 移动商品顺序
  const moveItem = (itemId: string, direction: 'up' | 'down') => {
    const index = itemOrder.indexOf(itemId);
    if (index === -1) return;
    
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= itemOrder.length) return;
    
    const newOrder = [...itemOrder];
    [newOrder[index], newOrder[newIndex]] = [newOrder[newIndex], newOrder[index]];
    setItemOrder(newOrder);
  };

  // 导出CSV
  const exportToCSV = () => {
    const filteredHistory = stocktakeHistory.filter(record => {
      const recordDate = getLocalDateString(new Date(record.date)); // 🔥 使用本地时间
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
      const date = new Date(record.date).toLocaleString('zh-CN');
      
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
      padding: '1.5rem', 
      height: '100vh', 
      maxHeight: '100vh',
      display: 'flex', 
      flexDirection: 'column', 
      gap: '1rem', 
      overflow: 'hidden',
      boxSizing: 'border-box'
    }}>
      {/* 标题栏 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 'bold' }}>🧊 冰箱盘点</h2>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          {lastSyncedAt && (
            <span style={{ fontSize: '0.75rem', color: '#6b7280', whiteSpace: 'nowrap' }}>
              最后同步 {lastSyncedAt.toLocaleTimeString('es-NI', { hour12: false })}
            </span>
          )}
          <button
            onClick={refreshFridgeData}
            disabled={isRefreshing}
            style={{
              padding: '0.6rem 1.2rem',
              backgroundColor: isRefreshing ? '#9ca3af' : '#0ea5e9',
              color: 'white',
              border: 'none',
              borderRadius: '0.375rem',
              cursor: isRefreshing ? 'not-allowed' : 'pointer',
              fontWeight: '600'
            }}
          >
            {isRefreshing ? '同步中...' : '刷新冰箱'}
          </button>
          <button
            onClick={() => setShowAddFridgeModal(true)}
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
            ➕ 冰箱管理
          </button>
          <button
            onClick={() => setShowHistoryModal(true)}
            style={{
              padding: '0.6rem 1.2rem',
              backgroundColor: '#8b5cf6',
              color: 'white',
              border: 'none',
              borderRadius: '0.375rem',
              cursor: 'pointer',
              fontWeight: '600'
            }}
          >
            📋 盘点历史
          </button>
        </div>
      </div>

      {/* 冰箱选择按钮组 */}
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
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
                padding: '0.75rem 1.2rem',
                backgroundColor: isSelected ? '#3b82f6' : 'white',
                color: isSelected ? 'white' : '#374151',
                border: isSelected ? '2px solid #3b82f6' : '2px solid #e5e7eb',
                borderRadius: '0.5rem',
                cursor: 'pointer',
                fontSize: '0.9rem',
                fontWeight: '600',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                transition: 'all 0.2s',
                boxShadow: isSelected ? '0 4px 6px rgba(59, 130, 246, 0.3)' : 'none'
              }}
            >
              <span style={{ fontSize: '1.3rem' }}>{icon}</span>
              <div style={{ textAlign: 'left' }}>
                <div>{fridge.name}</div>
                {fridge.location && (
                  <div style={{ fontSize: '0.75rem', opacity: 0.8, marginTop: '0.15rem' }}>
                    {fridge.location}
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* 搜索栏 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '0.75rem', alignItems: 'center' }}>
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
            padding: '0.5rem 0.75rem',
            border: '1px solid #d1d5db',
            borderRadius: '0.375rem',
            fontSize: '0.85rem'
          }}
        />
        <div style={{ fontSize: '0.85rem', color: '#6b7280', whiteSpace: 'nowrap' }}>
          📊 {fridgeItems.length} 个商品
        </div>
        <button
          onClick={completeStocktake}
          style={{
            padding: '0.5rem 1.2rem',
            backgroundColor: '#10b981',
            color: 'white',
            border: 'none',
            borderRadius: '0.375rem',
            cursor: 'pointer',
            fontSize: '0.9rem',
            fontWeight: '600',
            whiteSpace: 'nowrap'
          }}
        >
          ✅ 完成盘点
        </button>
      </div>

      {/* 商品列表 */}
      <div style={{ flex: 1, backgroundColor: 'white', borderRadius: '0.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {/* ✅ 顶部工具栏：添加新商品 */}
        <div style={{ padding: '0.75rem', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f9fafb' }}>
          <button
            onClick={() => {
              setShowAddItemModal(true);
              setAddSearchTerm('');
              setNewItemData({ itemId: '', quantity: 1 });
            }}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '0.375rem',
              cursor: 'pointer',
              fontSize: '0.85rem',
              fontWeight: '600',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
          >
            <span style={{ fontSize: '1.1rem' }}>+</span>
            添加新商品到冰箱
          </button>
          <div style={{ fontSize: '0.85rem', color: '#6b7280' }}>
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
                    ? itemOrder
                        .map(id => fridgeItems.find(item => item.itemId === id))
                        .filter((item): item is NonNullable<typeof item> => item !== undefined)
                    : fridgeItems;
                  
                  return sortedItems.map((item) => {
                    const warehouseItem = inventoryItems.find(i => i.id === item.itemId);
                    const warehouseStock = warehouseItem?.currentStock || 0;
                    const fridgeStock = item.quantity;
                    const totalStock = warehouseStock + fridgeStock;
                    const actualCount = actualQuantities[item.itemId];
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
                                  delete next[item.itemId];
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
                                    [item.itemId]: value
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
                                        delete next[item.itemId];
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
                              onClick={() => {
                                if (window.confirm(`确定要从冰箱中删除"${item.itemName}"吗？\n\n冰箱中的 ${fridgeStock} ${warehouseItem?.unit || '瓶'} 将退回到仓库`)) {
                                  const now = Date.now();
                                  const fridgeInventoryId = `${selectedFridge}-${item.itemId}`;
                                  // ✅ 1. 把冰箱库存退回到仓库
                                  setInventoryItems(items => items.map(i =>
                                    i.id === item.itemId ? { ...i, currentStock: i.currentStock + fridgeStock, lastModified: now, lastUpdated: new Date() } : i
                                  ));
                                  smartIncrementField('inventory_items', item.itemId, 'currentStock', fridgeStock, {
                                    lastModified: now,
                                    lastUpdated: new Date()
                                  }).catch(error => {
                                    console.error('同步移除冰箱商品退回仓库失败:', error);
                                  });
                                  
                                  // ✅ 2. 删除冰箱记录
                                  setFridgeInventory(inv => inv.filter(i => 
                                    !(i.fridgeId === selectedFridge && i.itemId === item.itemId)
                                  ));
                                  smartDeleteDocument('fridge_inventory', fridgeInventoryId).catch(error => {
                                    console.error('同步删除冰箱商品失败:', error);
                                  });
                                }
                              }}
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
            padding: '2rem',
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
                placeholder="搜索商品（仅显示饮料/酒水）..."
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
                    const isAllowedCategory = item.category === 'beverage' || item.category === 'alcohol';
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
                    setTransferModal({ show: false, itemId: '', type: 'add' });
                    setTransferQuantity(1);
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
                  onClick={handleSimpleTransfer}
                  style={{
                    padding: '0.6rem 1.2rem',
                    backgroundColor: isAdd ? '#3b82f6' : '#10b981',
                    color: 'white',
                    border: 'none',
                    borderRadius: '0.375rem',
                    cursor: 'pointer',
                    fontWeight: '600'
                  }}
                >
                  {isAdd ? '确认调拨' : '确认退回'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 盘点历史弹窗 */}
      {showHistoryModal && (() => {
        // 每次打开时重新加载历史
        const reloadHistory = () => {
          try {
            const saved = localStorage.getItem('fridge_stocktake_history');
            return saved ? JSON.parse(saved) : [];
          } catch {
            return [];
          }
        };
        const currentHistory = reloadHistory();
        
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
            width: '90vw',
            maxWidth: '1000px',
            height: '80vh',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }} className="print-container">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h3 style={{ margin: 0 }}>📋 今日盘点汇总</h3>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
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
                  onClick={() => window.print()}
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

            <div style={{ flex: 1, overflowY: 'auto', maxHeight: 'calc(80vh - 120px)' }}>
              {(() => {
              const filteredHistory = currentHistory.filter((record: any) => {
                const recordDate = getLocalDateString(new Date(record.date)); // 🔥 使用本地时间
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
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                  {filteredHistory.map((record: any) => {
                    const latestRecord = record;
                    
                    return (
                      <div key={record.id} style={{
                        border: '1px solid #e5e7eb',
                        borderRadius: '0.5rem',
                        overflow: 'hidden'
                      }}>
                        <div style={{
                          padding: '1rem',
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
                              {new Date(latestRecord.date).toLocaleString('zh-CN')}
                            </div>
                          </div>
                          <div style={{
                            padding: '0.4rem 0.8rem',
                            backgroundColor: latestRecord.totalDiscrepancies > 0 ? '#fef3c7' : '#d1fae5',
                            color: latestRecord.totalDiscrepancies > 0 ? '#92400e' : '#065f46',
                            borderRadius: '0.375rem',
                            fontWeight: '600'
                          }}>
                            {latestRecord.totalDiscrepancies > 0 ? `⚠️ ${latestRecord.totalDiscrepancies}个差异` : '✓ 无差异'}
                          </div>
                        </div>

                        <div style={{ maxHeight: '300px', overflow: 'auto' }}>
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
      
      body > *:not(.print-container) {
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
