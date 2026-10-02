import React, { useEffect, useState, useRef } from 'react';
import { dataManager } from '../../services/dataManager';
import { smartAddDocument, smartDeleteDocument, smartGetDocumentsByDateRange, smartIncrementField, smartSavePurchaseLocally, smartUpdateDocument } from '../../services/smartSyncService';
import { calculatePurchaseLineSubtotal, calculatePurchaseOrderTotal, roundPurchaseAmount } from './purchaseCalculations';
import { getLocalDateString } from '../../utils/exchangeRate'; // 🔥 导入本地日期工具
import { getPurchaseOrderDateKey, getPurchaseOrderTime } from '../../utils/purchaseDates';
import { mergePurchaseOrderRange, type ReplenishmentPurchaseDraft } from '../../utils/purchaseReplenishment';
import { useI18n } from '../../i18n/I18nContext';

interface Supplier {
  id: string;
  name: string;
  contact: string;
  phone: string;
  address: string;
  balance: number;
  status: 'active' | 'inactive';
  lastUpdated: Date;
  lastModified?: number;
}

interface PurchaseOrder {
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
  invoiceNumber?: string; // 发票号
  source?: 'manual' | 'reorder_suggestion';
  reorderSuggestionItemIds?: string[];
  lastModified?: number;
}

interface InventoryItem {
  id: string;
  barcode: string;
  name: string;
  category: string; // 动态类别
  unit: string;
  currentStock: number;
  minStock: number;
  costPrice: number; // 进价（所有物品都需要）
  salePrice?: number; // 售价（仅酒水饮料需要）
  tags: string[];
  location?: string;
  lastUpdated: Date;
}

const formatPurchaseDate = (value: any, locale: string, noDateLabel: string): string => {
  const time = getPurchaseOrderTime(value);
  return time ? new Date(time).toLocaleDateString(locale) : noDateLabel;
};

interface PurchaseManagementProps {
  suppliers: Supplier[];
  setSuppliers: React.Dispatch<React.SetStateAction<Supplier[]>>;
  purchaseOrders: PurchaseOrder[];
  setPurchaseOrders: React.Dispatch<React.SetStateAction<PurchaseOrder[]>>;
  inventoryItems: InventoryItem[];
  setInventoryItems: React.Dispatch<React.SetStateAction<InventoryItem[]>>;
  inventoryCategories: Array<{ key: string; name: string; icon: string }>;
  initialDraft?: ReplenishmentPurchaseDraft | null;
  onInitialDraftConsumed?: () => void;
}

const PurchaseManagement: React.FC<PurchaseManagementProps> = ({
  suppliers,
  setSuppliers,
  purchaseOrders,
  setPurchaseOrders,
  inventoryItems,
  setInventoryItems,
  inventoryCategories,
  initialDraft,
  onInitialDraftConsumed
}) => {
  const { t, language } = useI18n();
  const dateLocale = language === 'es-NI' ? 'es-NI' : 'zh-CN';
  const [showNewOrderModal, setShowNewOrderModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<PurchaseOrder | null>(null);
  const [isSubmittingPurchaseOrder, setIsSubmittingPurchaseOrder] = useState(false);
  const [deletingPurchaseOrderId, setDeletingPurchaseOrderId] = useState<string | null>(null);
  const isSubmittingPurchaseOrderRef = useRef(false);
  
  // 查询筛选状态
  const [searchFilters, setSearchFilters] = useState({
    orderNumber: '',
    supplierId: '',
    startDate: getLocalDateString(),
    endDate: getLocalDateString(),
    paymentType: 'all' as 'all' | 'cash' | 'credit',
    status: 'all' as 'all' | 'pending' | 'partial' | 'completed'
  });

  useEffect(() => {
    if (!searchFilters.startDate || !searchFilters.endDate || searchFilters.startDate > searchFilters.endDate) return;
    let active = true;
    smartGetDocumentsByDateRange(
      'purchase_orders',
      'orderDate',
      searchFilters.startDate,
      searchFilters.endDate,
      true,
      'timestamp'
    ).then(records => {
      if (active) {
        setPurchaseOrders(current => mergePurchaseOrderRange(
          current,
          records as PurchaseOrder[],
          searchFilters.startDate,
          searchFilters.endDate
        ));
      }
    }).catch(error => console.error('读取采购订单日期范围失败:', error));
    return () => {
      active = false;
    };
  }, [searchFilters.endDate, searchFilters.startDate, setPurchaseOrders]);

  // 新建采购单状态
  const [newOrder, setNewOrder] = useState({
    supplierId: '',
    orderNumber: '', // 🎫 发票号码（作为订单号）
    paymentType: 'cash' as 'cash' | 'credit',
    notes: '',
    source: 'manual' as 'manual' | 'reorder_suggestion',
    reorderSuggestionItemIds: [] as string[],
    items: [] as Array<{
      itemId: string;
      itemName: string;
      quantity: number;
      unitPrice: number;
      subtotal: number;
    }>
  });

  useEffect(() => {
    if (!initialDraft) return;
    setNewOrder({
      supplierId: initialDraft.supplierId,
      orderNumber: '',
      paymentType: 'cash',
      notes: initialDraft.notes,
      source: initialDraft.source,
      reorderSuggestionItemIds: [...initialDraft.reorderSuggestionItemIds],
      items: initialDraft.items.map(item => ({ ...item })),
    });
    setItemCategoryFilters({});
    setShowNewOrderModal(true);
    onInitialDraftConsumed?.();
  }, [initialDraft, onInitialDraftConsumed]);
  
  // 物品选择筛选状态（每行独立）
  const [itemCategoryFilters, setItemCategoryFilters] = useState<{[key: number]: string}>({});

  // 添加物品到采购单
  const addOrderItem = () => {
    setNewOrder({
      ...newOrder,
      items: [...newOrder.items, { itemId: '', itemName: '', quantity: 0, unitPrice: 0, subtotal: 0 }]
    });
  };

  // 更新采购单物品
  const updateOrderItem = (index: number, field: string, value: any) => {
    const newItems = [...newOrder.items];
    newItems[index] = { ...newItems[index], [field]: value };
    
    // 如果是物品ID，自动填充名称和价格
    if (field === 'itemId') {
      const item = inventoryItems.find(i => i.id === value);
      if (item) {
        newItems[index].itemName = item.name;
        newItems[index].unitPrice = roundPurchaseAmount(item.costPrice); // 使用进价
        newItems[index].subtotal = calculatePurchaseLineSubtotal(newItems[index].quantity, item.costPrice);
      }
    }
    
    // 如果修改数量或单价，重新计算小计
    if (field === 'quantity' || field === 'unitPrice') {
      if (field === 'unitPrice') {
        newItems[index].unitPrice = roundPurchaseAmount(newItems[index].unitPrice);
      }
      newItems[index].subtotal = calculatePurchaseLineSubtotal(newItems[index].quantity, newItems[index].unitPrice);
    }
    
    setNewOrder({ ...newOrder, items: newItems });
  };

  // 删除采购单物品
  const removeOrderItem = (index: number) => {
    setNewOrder({
      ...newOrder,
      items: newOrder.items.filter((_, i) => i !== index)
    });
  };

  // 计算总金额
  const calculateTotal = () => {
    return calculatePurchaseOrderTotal(newOrder.items);
  };

  const showExistingPurchaseOrder = (existingOrder: PurchaseOrder) => {
    const existingOrderDate = getPurchaseOrderDateKey(existingOrder);
    setPurchaseOrders(current => [
      existingOrder,
      ...current.filter(order => order.id !== existingOrder.id),
    ]);
    setSearchFilters({
      orderNumber: String(existingOrder.orderNumber || '').trim(),
      supplierId: '',
      startDate: existingOrderDate,
      endDate: existingOrderDate,
      paymentType: 'all',
      status: 'all',
    });
    setShowNewOrderModal(false);
    setSelectedOrder(existingOrder);
    setShowDetailModal(true);
    window.setTimeout(() => {
      alert(`${t('purchase.alert.duplicatePrefix')} ${existingOrder.orderNumber} ${t('purchase.alert.duplicateMiddle')} ${existingOrderDate || t('purchase.alert.originalRecord')}`);
    }, 0);
  };


  // 提交采购单
  const submitPurchaseOrder = async () => {
    if (!newOrder.supplierId) {
      alert(t('purchase.alert.selectSupplier'));
      return;
    }
    if (newOrder.items.length === 0) {
      alert(t('purchase.alert.addItem'));
      return;
    }
    if (newOrder.items.some(item => !item.itemId || item.quantity <= 0)) {
      alert(t('purchase.alert.completeItems'));
      return;
    }
    if (!newOrder.orderNumber || newOrder.orderNumber.trim() === '') {
      alert(t('purchase.alert.invoiceRequired'));
      return;
    }
    const submittedOrderNumber = newOrder.orderNumber.trim();

    const supplier = suppliers.find(s => s.id === newOrder.supplierId);
    if (!supplier) return;

    if (isSubmittingPurchaseOrderRef.current) {
      return;
    }
    isSubmittingPurchaseOrderRef.current = true;
    setIsSubmittingPurchaseOrder(true);

    try {
    const existingPurchaseOrder = purchaseOrders.find(
      order => String(order.orderNumber || '').trim() === submittedOrderNumber
    );
    if (existingPurchaseOrder) {
      showExistingPurchaseOrder(existingPurchaseOrder);
      return;
    }

    const normalizedOrderItems = newOrder.items.map(item => ({
      ...item,
      unitPrice: roundPurchaseAmount(item.unitPrice),
      subtotal: calculatePurchaseLineSubtotal(item.quantity, item.unitPrice),
    }));
    const totalAmount = calculatePurchaseOrderTotal(normalizedOrderItems);
    const now = Date.now();

    const order: PurchaseOrder = {
      id: `po-${Date.now()}`,
      orderNumber: submittedOrderNumber,
      supplierId: newOrder.supplierId,
      supplierName: supplier.name,
      items: normalizedOrderItems,
      totalAmount,
      paidAmount: newOrder.paymentType === 'cash' ? totalAmount : 0,
      paymentType: newOrder.paymentType,
      status: 'completed', // ✅ 所有采购单创建后立即入库
      orderDate: new Date(), // ✅ 采购日期使用当前时间
      receivedDate: new Date(), // ✅ 入库日期使用当前时间
      notes: newOrder.notes,
      source: newOrder.source,
      reorderSuggestionItemIds: [...newOrder.reorderSuggestionItemIds],
      lastModified: now
    };

    const nextPurchaseOrders = [order, ...purchaseOrders];
    const inventoryUpdates = normalizedOrderItems.map(orderItem => ({
      orderItem,
      inventoryItem: inventoryItems.find(item => item.id === orderItem.itemId)
    }));
    const supplierCloudUpdate = newOrder.paymentType === 'credit' ? (() => {
      const recalculatedBalance = roundPurchaseAmount(nextPurchaseOrders
        .filter(order => order.supplierId === newOrder.supplierId)
        .reduce((sum, order) => sum + Math.max(roundPurchaseAmount((Number(order.totalAmount) || 0) - (Number(order.paidAmount) || 0)), 0), 0));
      return { ...supplier, balance: recalculatedBalance, lastUpdated: new Date(), lastModified: now };
    })() : null;
    let purchaseExpense: any = null;

    if (newOrder.paymentType === 'cash') {
      const expenseDate = getLocalDateString();
      purchaseExpense = {
        id: `purchase-expense-${order.id}`,
        date: expenseDate,
        categoryId: 'supplier_payment',
        categoryName: '\u4f9b\u5e94\u5546\u8d27\u6b3e',
        amount: totalAmount,
        description: `\u91c7\u8d2d\u73b0\u7ed3 - ${supplier.name} (${submittedOrderNumber})`,
        type: 'purchase',
        supplierId: newOrder.supplierId,
        supplierName: supplier.name,
        purchaseOrderId: order.id,
        orderId: order.id,
        relatedType: 'purchase',
        orderNumber: submittedOrderNumber,
        createdAt: getLocalDateString(),
        lastModified: now,
      };
    }

    const submittedDraft = { ...newOrder, items: [...newOrder.items] };
    let purchaseStockResults: any[] = [];
    try {
      const runningStockByItem = new Map<string, number>();
      const stockRecords = normalizedOrderItems.map((orderItem, itemIndex) => {
        const inventoryItem = inventoryItems.find(item => item.id === orderItem.itemId);
        const beforeStock = runningStockByItem.has(orderItem.itemId)
          ? Number(runningStockByItem.get(orderItem.itemId))
          : Number(inventoryItem?.currentStock) || 0;
        const afterStock = beforeStock + orderItem.quantity;
        runningStockByItem.set(orderItem.itemId, afterStock);
        return {
          id: `stock-record-${order.id}-${orderItem.itemId}-${itemIndex}`,
          itemId: orderItem.itemId,
          itemName: orderItem.itemName || inventoryItem?.name || orderItem.itemId,
          type: 'in',
          quantity: orderItem.quantity,
          signedQuantity: orderItem.quantity,
          reason: 'purchase order',
          source: 'purchase_order',
          sourceId: order.id,
          orderNumber: order.orderNumber,
          supplierId: order.supplierId,
          supplierName: order.supplierName,
          locationType: 'warehouse',
          beforeStock,
          afterStock,
          unit: inventoryItem?.unit || '',
          date: order.orderDate,
          createdAt: order.receivedDate || order.orderDate,
          createdAtMs: now,
          lastModified: now,
          operator: 'system'
        };
      });
      const purchaseWriteResult = await smartSavePurchaseLocally({
        order,
        inventoryIncrements: normalizedOrderItems.map((orderItem, itemIndex) => ({
          itemId: orderItem.itemId,
          quantity: orderItem.quantity,
          operationId: `purchase-stock-${order.id}-${orderItem.itemId}-${itemIndex}`,
          lastModified: now,
          lastUpdated: new Date(),
        })),
        stockRecords,
        expense: purchaseExpense,
        supplierUpdate: supplierCloudUpdate,
      });
      if (!purchaseWriteResult?.success) {
        throw new Error(String(purchaseWriteResult?.error || 'purchase-local-transaction-failed'));
      }
      purchaseStockResults = (purchaseWriteResult.inventoryRecords || []).map(data => ({ data }));

      setPurchaseOrders(nextPurchaseOrders);
      setInventoryItems(items => items.map(item => {
        const inventoryUpdateIndex = inventoryUpdates.findIndex(update => update.orderItem.itemId === item.id);
        const inventoryUpdate = inventoryUpdates[inventoryUpdateIndex];
        if (!inventoryUpdate) return item;
        const confirmedRecord = purchaseStockResults[inventoryUpdateIndex]?.data;
        return {
          ...item,
          ...confirmedRecord,
          currentStock: confirmedRecord
            ? Number(confirmedRecord.currentStock || 0)
            : item.currentStock + inventoryUpdate.orderItem.quantity,
          lastModified: confirmedRecord?.lastModified || now,
          lastUpdated: confirmedRecord?.lastUpdated || new Date()
        };
      }));
      if (supplierCloudUpdate) {
        setSuppliers(suppliers => suppliers.map(sup =>
          sup.id === newOrder.supplierId ? supplierCloudUpdate : sup
        ));
      }

      await dataManager.saveData('purchases', nextPurchaseOrders, {
        syncFirestore: false,
        persistLocal: false,
      });
      if (purchaseExpense) {
        const nextExpenses = [
          purchaseExpense,
          ...dataManager.getData('expenses').filter(expense => expense.id !== purchaseExpense.id)
        ];
        await dataManager.saveData('expenses', nextExpenses, {
          syncFirestore: false,
          persistLocal: false,
        });
      }

      setShowNewOrderModal(false);
      setNewOrder({
        supplierId: '',
        orderNumber: '',
        paymentType: 'cash',
        notes: '',
        source: 'manual',
        reorderSuggestionItemIds: [],
        items: [],
      });
      setItemCategoryFilters({});
      window.setTimeout(() => {
        const savedSuffix = purchaseWriteResult.cloudSynced
          ? t('purchase.alert.cloudSavedSuffix')
          : purchaseWriteResult.offline
            ? t('purchase.alert.savedSuffix')
            : t('purchase.alert.pendingSyncSuffix');
        alert(`${t('purchase.alert.savedPrefix')} ${submittedOrderNumber} ${savedSuffix}`);
      }, 0);
    } catch (error) {
      console.error('保存采购单本地事务失败:', error);
      setNewOrder(submittedDraft);
      alert(t('purchase.alert.localSaveFailed'));
      return;
    }
    } finally {
      isSubmittingPurchaseOrderRef.current = false;
      setIsSubmittingPurchaseOrder(false);
    }
  };

  // 入库操作
  const deletePurchaseOrder = async (order: PurchaseOrder) => {
    if (deletingPurchaseOrderId) {
      return;
    }
    if (!window.confirm(`${t('purchase.alert.deleteConfirmPrefix')} ${order.orderNumber}? ${t('purchase.alert.deleteConfirmSuffix')}`)) {
      return;
    }

    const now = Date.now();
    const remainingPurchaseOrders = purchaseOrders.filter(existingOrder => existingOrder.id !== order.id);
    const quantityByItemId = order.items.reduce<Record<string, number>>((acc, orderItem) => {
      const quantity = Number(orderItem.quantity) || 0;
      acc[orderItem.itemId] = (acc[orderItem.itemId] || 0) + quantity;
      return acc;
    }, {});
    const supplier = suppliers.find(item => item.id === order.supplierId);
    const supplierCloudUpdate = order.paymentType === 'credit' && supplier ? {
      ...supplier,
      balance: remainingPurchaseOrders
        .filter(existingOrder => existingOrder.supplierId === order.supplierId)
        .reduce((sum, existingOrder) => sum + Math.max(roundPurchaseAmount((Number(existingOrder.totalAmount) || 0) - (Number(existingOrder.paidAmount) || 0)), 0), 0),
      lastUpdated: new Date(),
      lastModified: now,
    } : null;

    setDeletingPurchaseOrderId(order.id);
    const restoredStockByItemId = new Map<string, any>();
    try {
      await smartDeleteDocument('purchase_orders', order.id);
      await Promise.all(order.items.map(async (orderItem, itemIndex) => {
        const quantity = Number(orderItem.quantity) || 0;
        if (!quantity) return;
        const incrementResult: any = await smartIncrementField('inventory_items', orderItem.itemId, 'currentStock', -quantity, {
          lastModified: now,
          lastUpdated: new Date(),
          syncOperationId: `purchase-delete-stock-${order.id}-${orderItem.itemId}-${itemIndex}`
        });
        if (incrementResult?.error) throw new Error(incrementResult.error);
        if (incrementResult?.data) restoredStockByItemId.set(orderItem.itemId, incrementResult.data);

        const inventoryItem = inventoryItems.find(item => item.id === orderItem.itemId);
        const afterStock = incrementResult?.data
          ? Number(incrementResult.data.currentStock || 0)
          : (Number(inventoryItem?.currentStock) || 0) - quantity;
        await smartAddDocument('inventory_stock_records', {
          id: `stock-reversal-${order.id}-${orderItem.itemId}-${itemIndex}`,
          itemId: orderItem.itemId,
          itemName: orderItem.itemName || inventoryItem?.name || orderItem.itemId,
          type: 'out',
          quantity,
          signedQuantity: -quantity,
          reason: 'purchase order deleted',
          source: 'purchase_order_delete',
          sourceId: order.id,
          orderNumber: order.orderNumber,
          supplierId: order.supplierId,
          supplierName: order.supplierName,
          locationType: 'warehouse',
          beforeStock: afterStock + quantity,
          afterStock,
          unit: inventoryItem?.unit || '',
          date: new Date(now),
          createdAt: new Date(now),
          createdAtMs: now,
          lastModified: now,
          operator: 'system'
        });
      }));
      await smartDeleteDocument('expenses', `purchase-expense-${order.id}`);
      if (supplierCloudUpdate) {
        await smartUpdateDocument('suppliers', order.supplierId, supplierCloudUpdate);
      }

      setPurchaseOrders(remainingPurchaseOrders);
      setInventoryItems(items => items.map(item => {
        const removedQuantity = quantityByItemId[item.id] || 0;
        if (!removedQuantity) return item;
        const confirmedRecord = restoredStockByItemId.get(item.id);
        return {
          ...item,
          ...confirmedRecord,
          currentStock: confirmedRecord ? Number(confirmedRecord.currentStock || 0) : item.currentStock - removedQuantity,
          lastUpdated: confirmedRecord?.lastUpdated || new Date(),
          lastModified: confirmedRecord?.lastModified || now,
        };
      }));
      if (supplierCloudUpdate) {
        setSuppliers(items => items.map(item => item.id === order.supplierId ? supplierCloudUpdate : item));
      }

      void dataManager.saveData('purchases', remainingPurchaseOrders, { syncFirestore: false })
        .catch(error => console.error('保存采购删除本地缓存失败', error));
      const nextExpenses = dataManager.getData('expenses').filter(expense => expense.id !== `purchase-expense-${order.id}`);
      void dataManager.saveData('expenses', nextExpenses, { syncFirestore: false })
        .catch(error => console.error('保存采购开支删除本地缓存失败', error));
      alert(`${t('purchase.alert.deletedPrefix')} ${order.orderNumber} ${t('purchase.alert.deletedSuffix')}`);
    } catch (error) {
      console.error('删除采购单失败:', error);
      alert(t('purchase.alert.deleteFailed'));
    } finally {
      setDeletingPurchaseOrderId(null);
    }
  };

  // 🖨️ 打印采购单
  const printPurchaseOrder = (order: PurchaseOrder) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert(t('purchase.alert.popupBlocked'));
      return;
    }

    const content = `
      <!DOCTYPE html>
      <html lang="${language}">
      <head>
        <title>${t('purchase.print.title')} - ${order.orderNumber}</title>
        <style>
          body { font-family: 'Microsoft YaHei', Arial, sans-serif; padding: 20px; max-width: 800px; margin: 0 auto; }
          .header { text-align: center; border-bottom: 3px solid #333; padding-bottom: 15px; margin-bottom: 20px; }
          .company-name { font-size: 28px; font-weight: bold; margin-bottom: 5px; }
          .title { font-size: 20px; color: #666; margin-top: 10px; }
          .info-section { margin-bottom: 20px; background: #f9fafb; padding: 15px; border-radius: 5px; }
          .info-row { display: flex; justify-content: space-between; margin-bottom: 8px; }
          .info-label { font-weight: bold; color: #666; }
          .info-value { color: #333; }
          h3 { border-left: 4px solid #3b82f6; padding-left: 10px; margin-top: 25px; margin-bottom: 15px; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 13px; }
          th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
          th { background-color: #f5f5f5; font-weight: bold; }
          .amount { text-align: right; }
          .total-row { font-weight: bold; background-color: #f9f9f9; font-size: 14px; }
          .status-badge { padding: 3px 8px; border-radius: 3px; font-size: 12px; font-weight: bold; }
          .status-completed { background: #d1fae5; color: #059669; }
          .status-partial { background: #dbeafe; color: #2563eb; }
          .status-pending { background: #fef3c7; color: #d97706; }
          .signature { margin-top: 50px; display: flex; justify-content: space-between; }
          .signature-item { text-align: center; }
          .signature-line { border-top: 1px solid #333; width: 180px; margin-top: 40px; padding-top: 5px; }
          @media print { 
            body { padding: 0; }
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="company-name">${t('purchase.print.systemName')}</div>
          <div class="title">${t('purchase.print.title')}</div>
        </div>

        <div class="info-section">
          <div class="info-row">
            <span class="info-label">${t('purchase.print.orderNumber')}:</span>
            <span class="info-value" style="font-size: 16px; font-weight: bold;">${order.orderNumber}</span>
          </div>
          <div class="info-row">
            <span class="info-label">${t('purchase.supplier')}:</span>
            <span class="info-value">${order.supplierName}</span>
            <span class="info-label">${t('purchase.purchaseDate')}:</span>
            <span class="info-value">${formatPurchaseDate(order, dateLocale, t('purchase.noDate'))}</span>
          </div>
          <div class="info-row">
            <span class="info-label">${t('purchase.paymentMethod')}:</span>
            <span class="info-value">${order.paymentType === 'cash' ? `💵 ${t('purchase.payment.cash')}` : `💳 ${t('purchase.payment.credit')}`}</span>
            <span class="info-label">${t('purchase.status')}:</span>
            <span class="info-value">
              <span class="status-badge status-${order.status}">
                ${order.status === 'completed' ? `✅ ${t('purchase.status.completed')}` : `⏸️ ${t('purchase.status.pending')}`}
              </span>
            </span>
          </div>
          ${order.notes ? `
          <div class="info-row">
            <span class="info-label">${t('purchase.notes')}:</span>
            <span class="info-value" style="color: #dc2626;">${order.notes}</span>
          </div>
          ` : ''}
        </div>

        <h3>📋 ${t('purchase.print.itemDetails')}</h3>
        <table>
          <thead>
            <tr>
              <th style="width: 50px;">${t('purchase.table.index')}</th>
              <th>${t('purchase.table.itemName')}</th>
              <th class="amount">${t('purchase.table.quantity')}</th>
              <th class="amount">${t('purchase.table.unitPrice')}</th>
              <th class="amount">${t('purchase.table.subtotal')}</th>
            </tr>
          </thead>
          <tbody>
            ${order.items.map((item, idx) => `
              <tr>
                <td>${idx + 1}</td>
                <td>${item.itemName}</td>
                <td class="amount">${item.quantity}</td>
          <td class="amount">C$ ${item.unitPrice.toFixed(2)}</td>
          <td class="amount" style="font-weight: bold;">C$ ${item.subtotal.toFixed(2)}</td>
              </tr>
            `).join('')}
          </tbody>
          <tfoot>
            <tr class="total-row">
              <td colspan="4" style="text-align: right;">${t('purchase.totalAmount')}:</td>
          <td class="amount" style="font-size: 16px; color: #dc2626;">C$ ${order.totalAmount.toFixed(0)}</td>
            </tr>
            <tr class="total-row">
              <td colspan="4" style="text-align: right;">${t('purchase.paidAmount')}:</td>
          <td class="amount" style="color: #059669;">C$ ${order.paidAmount.toFixed(0)}</td>
            </tr>
            <tr class="total-row">
              <td colspan="4" style="text-align: right;">${t('purchase.remainingDebt')}:</td>
              <td class="amount" style="color: ${order.totalAmount - order.paidAmount > 0 ? '#dc2626' : '#059669'};">
            C$ ${(order.totalAmount - order.paidAmount).toFixed(0)}
              </td>
            </tr>
          </tfoot>
        </table>

        <div class="signature">
          <div class="signature-item">
            <div>${t('purchase.print.buyerSignature')}</div>
            <div class="signature-line"></div>
          </div>
          <div class="signature-item">
            <div>${t('purchase.print.supplierConfirmation')}</div>
            <div class="signature-line"></div>
          </div>
          <div class="signature-item">
            <div>${t('purchase.print.warehouseAcceptance')}</div>
            <div class="signature-line"></div>
          </div>
        </div>

        <div class="no-print" style="text-align: center; margin-top: 30px;">
          <button onclick="window.print()" style="padding: 12px 30px; background: #3b82f6; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 16px; font-weight: bold;">
            🖨️ ${t('purchase.print.click')}
          </button>
        </div>
      </body>
      </html>
    `;

    printWindow.document.write(content);
    printWindow.document.close();
  };

  // 🔍 筛选订单
  const filteredOrders = purchaseOrders.filter(order => {
    // 订单号筛选
    if (searchFilters.orderNumber && !order.orderNumber.toLowerCase().includes(searchFilters.orderNumber.toLowerCase())) {
      return false;
    }
    
    // 供应商筛选
    if (searchFilters.supplierId && order.supplierId !== searchFilters.supplierId) {
      return false;
    }
    
    // 支付方式筛选
    if (searchFilters.paymentType !== 'all' && order.paymentType !== searchFilters.paymentType) {
      return false;
    }
    
    // 状态筛选
    if (searchFilters.status !== 'all' && order.status !== searchFilters.status) {
      return false;
    }
    
    // 日期范围筛选
    if (searchFilters.startDate) {
      const orderDate = getPurchaseOrderDateKey(order);
      if (orderDate < searchFilters.startDate) {
        return false;
      }
    }
    if (searchFilters.endDate) {
      const orderDate = getPurchaseOrderDateKey(order);
      if (orderDate > searchFilters.endDate) {
        return false;
      }
    }
    
    return true;
  }).sort((a, b) => getPurchaseOrderTime(b) - getPurchaseOrderTime(a));

  return (
    <div style={{ flex: 1, backgroundColor: 'white', borderRadius: '0.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {/* 顶部工具栏 */}
      <div style={{ padding: '0.75rem', borderBottom: '1px solid #e5e7eb', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: '600', margin: 0 }}>🛒 {t('purchase.title')}</h2>
          <button
            onClick={() => setShowNewOrderModal(true)}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: '#10b981',
              color: 'white',
              border: 'none',
              borderRadius: '0.25rem',
              fontWeight: '600',
              cursor: 'pointer',
              fontSize: '0.85rem'
            }}
          >
            ➕ {t('purchase.new')}
          </button>
        </div>
        
        {/* 🔍 筛选工具栏 */}
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder={t('purchase.search.orderNumber')}
            value={searchFilters.orderNumber}
            onChange={(e) => setSearchFilters({...searchFilters, orderNumber: e.target.value})}
            style={{ padding: '0.4rem 0.6rem', border: '1px solid #d1d5db', borderRadius: '0.25rem', fontSize: '0.85rem', minWidth: '120px' }}
          />
          <select
            value={searchFilters.supplierId}
            onChange={(e) => setSearchFilters({...searchFilters, supplierId: e.target.value})}
            style={{ padding: '0.4rem', border: '1px solid #d1d5db', borderRadius: '0.25rem', fontSize: '0.85rem' }}
          >
            <option value="">{t('purchase.filter.allSuppliers')}</option>
            {suppliers.map(sup => (
              <option key={sup.id} value={sup.id}>{sup.name}</option>
            ))}
          </select>
          <select
            value={searchFilters.paymentType}
            onChange={(e) => setSearchFilters({...searchFilters, paymentType: e.target.value as any})}
            style={{ padding: '0.4rem', border: '1px solid #d1d5db', borderRadius: '0.25rem', fontSize: '0.85rem' }}
          >
            <option value="all">{t('purchase.filter.allPayments')}</option>
            <option value="cash">💵 {t('purchase.payment.cash')}</option>
            <option value="credit">💳 {t('purchase.payment.credit')}</option>
          </select>
          <select
            value={searchFilters.status}
            onChange={(e) => setSearchFilters({...searchFilters, status: e.target.value as any})}
            style={{ padding: '0.4rem', border: '1px solid #d1d5db', borderRadius: '0.25rem', fontSize: '0.85rem' }}
          >
            <option value="all">{t('purchase.filter.allStatuses')}</option>
            <option value="completed">✅ {t('purchase.status.completed')}</option>
          </select>
          <input
            type="date"
            value={searchFilters.startDate}
            onChange={(e) => setSearchFilters({...searchFilters, startDate: e.target.value})}
            style={{ padding: '0.4rem', border: '1px solid #d1d5db', borderRadius: '0.25rem', fontSize: '0.85rem' }}
          />
          <span style={{ lineHeight: '2rem', color: '#6b7280' }}>{t('purchase.rangeTo')}</span>
          <input
            type="date"
            value={searchFilters.endDate}
            onChange={(e) => setSearchFilters({...searchFilters, endDate: e.target.value})}
            style={{ padding: '0.4rem', border: '1px solid #d1d5db', borderRadius: '0.25rem', fontSize: '0.85rem' }}
          />
          <button
            onClick={() => setSearchFilters({
              orderNumber: '',
              supplierId: '',
              startDate: getLocalDateString(),
              endDate: getLocalDateString(),
              paymentType: 'all',
              status: 'all'
            })}
            style={{
              padding: '0.4rem 0.8rem',
              backgroundColor: '#6b7280',
              color: 'white',
              border: 'none',
              borderRadius: '0.25rem',
              cursor: 'pointer',
              fontSize: '0.85rem'
            }}
          >
            🔄 {t('purchase.reset')}
          </button>
        </div>
        
        {/* 统计信息 */}
        <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: '#6b7280' }}>
          {t('purchase.count.prefix')} {filteredOrders.length} {t('purchase.count.orders')} ({t('purchase.count.totalPrefix')} {purchaseOrders.length})
        </div>
      </div>

      {/* 采购订单列表 */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '1rem' }}>
          <div style={{ display: 'grid', gap: '1rem' }}>
            {filteredOrders.map(order => (
              <div key={order.id} style={{
                padding: '1rem',
                border: '1px solid #e5e7eb',
                borderRadius: '0.5rem',
                backgroundColor: order.status === 'completed' ? '#f9fafb' : 'white'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <div>
                    <div style={{ fontWeight: 'bold', fontSize: '1rem' }}>{order.orderNumber}</div>
                    <div style={{ fontSize: '0.85rem', color: '#6b7280', marginTop: '0.25rem' }}>
                      {t('purchase.supplier')}: {order.supplierName} | {formatPurchaseDate(order, dateLocale, t('purchase.noDate'))}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{
                      padding: '0.25rem 0.5rem',
                      backgroundColor: order.paymentType === 'cash' ? '#d1fae5' : '#fef3c7',
                      color: order.paymentType === 'cash' ? '#059669' : '#d97706',
                      borderRadius: '0.25rem',
                      fontSize: '0.75rem',
                      fontWeight: '600',
                      display: 'inline-block',
                      marginBottom: '0.25rem'
                    }}>
                      {order.paymentType === 'cash' ? `💵 ${t('purchase.payment.cash')}` : `📝 ${t('purchase.payment.credit')}`}
                    </div>
                    <div style={{
                      padding: '0.25rem 0.5rem',
                      backgroundColor: order.status === 'completed' ? '#d1fae5' : (order.status === 'partial' ? '#dbeafe' : '#fef3c7'),
                      color: order.status === 'completed' ? '#059669' : (order.status === 'partial' ? '#2563eb' : '#d97706'),
                      borderRadius: '0.25rem',
                      fontSize: '0.75rem',
                      fontWeight: '600',
                      display: 'inline-block',
                      marginLeft: '0.5rem'
                    }}>
                      {order.status === 'completed' ? `✅ ${t('purchase.status.completed')}` : `⏸️ ${t('purchase.status.pending')}`}
                    </div>
                  </div>
                </div>

                <div style={{ fontSize: '0.85rem', marginBottom: '0.75rem' }}>
                  {order.items.map((item, idx) => (
                    <div key={idx} style={{ padding: '0.35rem 0', borderBottom: '1px solid #f3f4f6' }}>
                      {item.itemName} × {item.quantity} @ C$ {item.unitPrice.toFixed(2)} = C$ {item.subtotal.toFixed(2)}
                    </div>
                  ))}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '0.75rem', borderTop: '2px solid #e5e7eb' }}>
                  <div>
                    <div style={{ fontSize: '0.85rem', color: '#6b7280' }}>
                    {t('purchase.total')}: C$ {order.totalAmount.toFixed(0)} | {t('purchase.paid')}: C$ {order.paidAmount.toFixed(0)} |
                      <span style={{ color: order.totalAmount - order.paidAmount > 0 ? '#dc2626' : '#059669', fontWeight: '600' }}>
                    {' '}{t('purchase.debt')}: C$ {(order.totalAmount - order.paidAmount).toFixed(0)}
                      </span>
                    </div>
                  {order.notes && <div style={{ fontSize: '0.8rem', color: '#dc2626', marginTop: '0.25rem' }}>{t('purchase.notes')}: {order.notes}</div>}
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      onClick={() => {
                        setSelectedOrder(order);
                        setShowDetailModal(true);
                      }}
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
                      📋 {t('purchase.details')}
                    </button>
                    <button
                      onClick={() => printPurchaseOrder(order)}
                      style={{
                        padding: '0.4rem 0.8rem',
                        backgroundColor: '#f59e0b',
                        color: 'white',
                        border: 'none',
                        borderRadius: '0.25rem',
                        fontWeight: '600',
                        cursor: 'pointer',
                        fontSize: '0.8rem'
                      }}
                    >
                      🖨️ {t('purchase.print')}
                    </button>
                    <button
                      onClick={() => deletePurchaseOrder(order)}
                      disabled={deletingPurchaseOrderId === order.id}
                      style={{
                        padding: '0.4rem 0.8rem',
                        backgroundColor: deletingPurchaseOrderId === order.id ? '#9ca3af' : '#dc2626',
                        color: 'white',
                        border: 'none',
                        borderRadius: '0.25rem',
                        fontWeight: '600',
                        cursor: deletingPurchaseOrderId === order.id ? 'not-allowed' : 'pointer',
                        fontSize: '0.8rem'
                      }}
                    >
                      {deletingPurchaseOrderId === order.id ? t('purchase.deleting') : t('purchase.delete')}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

      {/* 📋 详情弹窗 */}
      {showDetailModal && selectedOrder && (
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
        }} onClick={() => setShowDetailModal(false)}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '0.5rem',
            padding: '1.5rem',
            width: '700px',
            maxHeight: '90vh',
            overflow: 'auto'
          }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: '600', margin: 0 }}>
              📋 {t('purchase.detailTitle')} - {selectedOrder.orderNumber}
              </h3>
              <button
                onClick={() => setShowDetailModal(false)}
                style={{
                  padding: '0.3rem 0.6rem',
                  backgroundColor: '#f3f4f6',
                  border: 'none',
                  borderRadius: '0.25rem',
                  cursor: 'pointer',
                  fontSize: '0.85rem'
                }}
              >
              ✕ {t('purchase.close')}
              </button>
            </div>
            
            {/* 基本信息 */}
            <div style={{ backgroundColor: '#f9fafb', padding: '1rem', borderRadius: '0.375rem', marginBottom: '1rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', fontSize: '0.9rem' }}>
              <div><span style={{ color: '#6b7280' }}>{t('purchase.supplier')}:</span> <strong>{selectedOrder.supplierName}</strong></div>
              <div><span style={{ color: '#6b7280' }}>{t('purchase.purchaseDate')}:</span> {formatPurchaseDate(selectedOrder, dateLocale, t('purchase.noDate'))}</div>
              <div><span style={{ color: '#6b7280' }}>{t('purchase.paymentMethod')}:</span> {selectedOrder.paymentType === 'cash' ? `💵 ${t('purchase.payment.cash')}` : `💳 ${t('purchase.payment.credit')}`}</div>
                <div>
                  <span style={{ color: '#6b7280' }}>{t('purchase.status')}:</span>
                  <span style={{
                    padding: '0.2rem 0.5rem',
                    backgroundColor: selectedOrder.status === 'completed' ? '#d1fae5' : (selectedOrder.status === 'partial' ? '#dbeafe' : '#fef3c7'),
                    color: selectedOrder.status === 'completed' ? '#059669' : (selectedOrder.status === 'partial' ? '#2563eb' : '#d97706'),
                    borderRadius: '0.25rem',
                    fontSize: '0.8rem',
                    fontWeight: '600'
                  }}>
                    {selectedOrder.status === 'completed' ? `✅ ${t('purchase.status.completed')}` : `⏸️ ${t('purchase.status.pending')}`}
                  </span>
                </div>
              {selectedOrder.receivedDate && <div><span style={{ color: '#6b7280' }}>{t('purchase.receivedDate')}:</span> {formatPurchaseDate(selectedOrder.receivedDate, dateLocale, t('purchase.noDate'))}</div>}
              </div>
              {selectedOrder.notes && (
                <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid #e5e7eb' }}>
                  <span style={{ color: '#6b7280' }}>{t('purchase.notes')}:</span>
                  <span style={{ color: '#dc2626' }}>{selectedOrder.notes}</span>
                </div>
              )}
            </div>

            {/* 商品明细 */}
            <div style={{ marginBottom: '1rem' }}>
              <h4 style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '0.75rem' }}>📦 {t('purchase.itemsTitle')}</h4>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f9fafb' }}>
                    <th style={{ padding: '0.6rem', textAlign: 'left', borderBottom: '2px solid #e5e7eb' }}>{t('purchase.table.index')}</th>
                    <th style={{ padding: '0.6rem', textAlign: 'left', borderBottom: '2px solid #e5e7eb' }}>{t('purchase.table.itemName')}</th>
                    <th style={{ padding: '0.6rem', textAlign: 'right', borderBottom: '2px solid #e5e7eb' }}>{t('purchase.table.quantity')}</th>
                    <th style={{ padding: '0.6rem', textAlign: 'right', borderBottom: '2px solid #e5e7eb' }}>{t('purchase.table.unitPrice')}</th>
                    <th style={{ padding: '0.6rem', textAlign: 'right', borderBottom: '2px solid #e5e7eb' }}>{t('purchase.table.subtotal')}</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedOrder.items.map((item, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '0.6rem' }}>{idx + 1}</td>
                      <td style={{ padding: '0.6rem' }}>{item.itemName}</td>
                      <td style={{ padding: '0.6rem', textAlign: 'right' }}>{item.quantity}</td>
                      <td style={{ padding: '0.6rem', textAlign: 'right' }}>C$ {item.unitPrice.toFixed(2)}</td>
                      <td style={{ padding: '0.6rem', textAlign: 'right', fontWeight: '600' }}>C$ {item.subtotal.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 金额汇总 */}
            <div style={{ backgroundColor: '#fef3c7', padding: '1rem', borderRadius: '0.375rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.95rem' }}>
                <span>{t('purchase.totalAmount')}:</span>
              <strong style={{ fontSize: '1.1rem', color: '#dc2626' }}>C$ {selectedOrder.totalAmount.toFixed(0)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.95rem' }}>
                <span>{t('purchase.paidAmount')}:</span>
              <strong style={{ color: '#059669' }}>C$ {selectedOrder.paidAmount.toFixed(0)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.95rem', paddingTop: '0.5rem', borderTop: '2px solid #fcd34d' }}>
                <span>{t('purchase.remainingDebt')}:</span>
                <strong style={{ color: selectedOrder.totalAmount - selectedOrder.paidAmount > 0 ? '#dc2626' : '#059669' }}>
                  C$ {(selectedOrder.totalAmount - selectedOrder.paidAmount).toFixed(0)}
                </strong>
              </div>
            </div>

            {/* 操作按钮 */}
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
              <button
                onClick={() => printPurchaseOrder(selectedOrder)}
                style={{
                  padding: '0.6rem 1.2rem',
                  backgroundColor: '#f59e0b',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.375rem',
                  cursor: 'pointer',
                  fontWeight: '600'
                }}
              >
                🖨️ {t('purchase.printOrder')}
              </button>
              <button
                onClick={() => setShowDetailModal(false)}
                style={{
                  padding: '0.6rem 1.2rem',
                  backgroundColor: '#6b7280',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.375rem',
                  cursor: 'pointer',
                  fontWeight: '600'
                }}
              >
                {t('purchase.close')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 新建采购单弹窗 */}
      {showNewOrderModal && (
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
            width: '900px',
            maxHeight: '90vh',
            overflow: 'auto'
          }}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: '600', marginBottom: '1rem' }}>
              📝 {t('purchase.new')}
            </h3>
            
            <div style={{ display: 'grid', gap: '1rem' }}>
              {/* 基本信息 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.35rem', fontWeight: '600', fontSize: '0.85rem' }}>
                    {t('purchase.supplier')} <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <select
                    value={newOrder.supplierId}
                    onChange={(e) => setNewOrder({...newOrder, supplierId: e.target.value})}
                    style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '0.25rem' }}
                  >
                    <option value="">{t('purchase.selectSupplier')}</option>
                    {suppliers.map(sup => (
                      <option key={sup.id} value={sup.id}>{sup.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.35rem', fontWeight: '600', fontSize: '0.85rem' }}>
                    🎫 {t('purchase.invoiceNumber')}<span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="text"
                    value={newOrder.orderNumber}
                    onChange={(e) => setNewOrder({...newOrder, orderNumber: e.target.value})}
                    placeholder={t('purchase.invoiceExample')}
                    style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '0.25rem', fontWeight: '600' }}
                  />
                  <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                    💡 {t('purchase.invoiceHint')}
                  </div>
                </div>
              </div>

              {/* 支付方式 */}
              <div>
                <label style={{ display: 'block', marginBottom: '0.35rem', fontWeight: '600', fontSize: '0.85rem' }}>
                  {t('purchase.paymentMethod')}
                </label>
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      checked={newOrder.paymentType === 'cash'}
                      onChange={() => setNewOrder({...newOrder, paymentType: 'cash'})}
                    />
                    <span>💵 {t('purchase.payment.cashHint')}</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      checked={newOrder.paymentType === 'credit'}
                      onChange={() => setNewOrder({...newOrder, paymentType: 'credit'})}
                    />
                    <span>📝 {t('purchase.payment.creditHint')}</span>
                  </label>
                </div>
              </div>

              {/* 物品列表 */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <label style={{ fontWeight: '600', fontSize: '0.85rem' }}>{t('purchase.itemList')}</label>
                  <button
                    onClick={addOrderItem}
                    style={{
                      padding: '0.35rem 0.7rem',
                      backgroundColor: '#3b82f6',
                      color: 'white',
                      border: 'none',
                      borderRadius: '0.25rem',
                      cursor: 'pointer',
                      fontSize: '0.8rem',
                      fontWeight: '600'
                    }}
                  >
                    ➕ {t('purchase.addItem')}
                  </button>
                </div>
                
                <div style={{ border: '1px solid #e5e7eb', borderRadius: '0.375rem', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead style={{ backgroundColor: '#f9fafb' }}>
                      <tr>
                        <th style={{ padding: '0.5rem', textAlign: 'left', fontSize: '0.8rem', borderBottom: '1px solid #e5e7eb', width: '120px' }}>{t('purchase.table.category')}</th>
                        <th style={{ padding: '0.5rem', textAlign: 'left', fontSize: '0.8rem', borderBottom: '1px solid #e5e7eb' }}>{t('purchase.table.item')}</th>
                        <th style={{ padding: '0.5rem', textAlign: 'right', fontSize: '0.8rem', borderBottom: '1px solid #e5e7eb', width: '100px' }}>{t('purchase.table.quantity')}</th>
                    <th style={{ padding: '0.5rem', textAlign: 'right', fontSize: '0.8rem', borderBottom: '1px solid #e5e7eb', width: '120px' }}>{t('purchase.table.unitPrice')} (C$)</th>
                    <th style={{ padding: '0.5rem', textAlign: 'right', fontSize: '0.8rem', borderBottom: '1px solid #e5e7eb', width: '120px' }}>{t('purchase.table.subtotal')} (C$)</th>
                        <th style={{ padding: '0.5rem', textAlign: 'center', fontSize: '0.8rem', borderBottom: '1px solid #e5e7eb', width: '60px' }}>{t('purchase.table.action')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {newOrder.items.map((item, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid #f3f4f6' }}>
                          <td style={{ padding: '0.5rem' }}>
                            <select
                              value={itemCategoryFilters[idx] || 'all'}
                              onChange={(e) => {
                                const newFilters = {...itemCategoryFilters};
                                newFilters[idx] = e.target.value;
                                setItemCategoryFilters(newFilters);
                                // 切换类别时清空已选物品
                                const newItems = [...newOrder.items];
                                newItems[idx] = { ...newItems[idx], itemId: '', itemName: '', quantity: 0, unitPrice: 0, subtotal: 0 };
                                setNewOrder({...newOrder, items: newItems});
                              }}
                              style={{ width: '100%', padding: '0.4rem', border: '1px solid #d1d5db', borderRadius: '0.25rem', fontSize: '0.8rem' }}
                            >
                              <option value="all">{t('purchase.all')}</option>
                              {(() => {
                                // 🔥 实时从 inventoryItems 提取所有唯一类别
                                const uniqueCategories = Array.from(
                                  new Set(
                                    inventoryItems
                                      .map(inv => inv.category)
                                      .filter(cat => cat && cat.trim() !== '')
                                  )
                                );
                                return uniqueCategories.map(cat => {
                                  const categoryInfo = inventoryCategories.find(c => c.key === cat);
                                  const displayName = categoryInfo ? `${categoryInfo.icon} ${categoryInfo.name}` : cat;
                                  return (
                                    <option key={`${cat}-${inventoryItems.length}`} value={cat}>
                                      {displayName}
                                    </option>
                                  );
                                });
                              })()}
                            </select>
                          </td>
                          <td style={{ padding: '0.5rem' }}>
                            <select
                              value={item.itemId}
                              onChange={(e) => updateOrderItem(idx, 'itemId', e.target.value)}
                              style={{ width: '100%', padding: '0.4rem', border: '1px solid #d1d5db', borderRadius: '0.25rem', fontSize: '0.85rem' }}
                            >
                              <option value="">{t('purchase.selectItem')}</option>
                              {inventoryItems
                                .filter(inv => {
                                  const categoryFilter = itemCategoryFilters[idx] || 'all';
                                  // 如果选择了特定类别，只显示该类别的物品
                                  if (categoryFilter !== 'all') {
                                    return inv.category === categoryFilter;
                                  }
                                  // 否则显示所有物品
                                  return true;
                                })
                                .map(inv => (
                                  <option key={inv.id} value={inv.id}>
                                {inv.name} ({t('purchase.currentStock')}: {inv.currentStock}{inv.unit}) C$ {inv.costPrice}/{inv.unit}
                                  </option>
                                ))
                              }
                            </select>
                          </td>
                          <td style={{ padding: '0.5rem' }}>
                            <input
                              type="number"
                              value={item.quantity || ''}
                              onChange={(e) => updateOrderItem(idx, 'quantity', parseFloat(e.target.value) || 0)}
                              placeholder="0"
                              style={{ width: '100%', padding: '0.4rem', border: '1px solid #d1d5db', borderRadius: '0.25rem', textAlign: 'right' }}
                            />
                          </td>
                          <td style={{ padding: '0.5rem' }}>
                            <input
                              type="number"
                              step="0.01"
                              value={item.unitPrice || ''}
                              onChange={(e) => updateOrderItem(idx, 'unitPrice', parseFloat(e.target.value) || 0)}
                              placeholder="0.00"
                              style={{ width: '100%', padding: '0.4rem', border: '1px solid #d1d5db', borderRadius: '0.25rem', textAlign: 'right' }}
                            />
                          </td>
                          <td style={{ padding: '0.5rem', textAlign: 'right', fontWeight: '600' }}>
                          C$ {item.subtotal.toFixed(2)}
                          </td>
                          <td style={{ padding: '0.5rem', textAlign: 'center' }}>
                            <button
                              onClick={() => removeOrderItem(idx)}
                              style={{
                                padding: '0.25rem 0.5rem',
                                backgroundColor: '#ef4444',
                                color: 'white',
                                border: 'none',
                                borderRadius: '0.25rem',
                                cursor: 'pointer',
                                fontSize: '0.75rem'
                              }}
                            >
                              🗑️
                            </button>
                          </td>
                        </tr>
                      ))}
                      {newOrder.items.length === 0 && (
                        <tr>
                          <td colSpan={5} style={{ padding: '2rem', textAlign: 'center', color: '#9ca3af' }}>
                            {t('purchase.emptyItems')}
                          </td>
                        </tr>
                      )}
                    </tbody>
                    <tfoot style={{ backgroundColor: '#f9fafb' }}>
                      <tr>
                        <td colSpan={3} style={{ padding: '0.75rem', textAlign: 'right', fontWeight: '600' }}>{t('purchase.totalLabel')}:</td>
                        <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 'bold', fontSize: '1.1rem', color: '#2563eb' }}>
                  C$ {calculateTotal().toFixed(0)}
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* 备注 */}
              <div>
                <label style={{ display: 'block', marginBottom: '0.35rem', fontWeight: '600', fontSize: '0.85rem' }}>
                  {t('purchase.notes')}
                </label>
                <textarea
                  value={newOrder.notes}
                  onChange={(e) => setNewOrder({...newOrder, notes: e.target.value})}
                  placeholder={t('purchase.notesPlaceholder')}
                  rows={3}
                  style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '0.25rem', resize: 'vertical' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1.5rem', paddingTop: '1rem', borderTop: '2px solid #e5e7eb' }}>
              <button
                onClick={() => {
                  setShowNewOrderModal(false);
                  setNewOrder({
                    supplierId: '',
                    orderNumber: '',
                    paymentType: 'cash',
                    notes: '',
                    source: 'manual',
                    reorderSuggestionItemIds: [],
                    items: [],
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
                {t('purchase.cancel')}
              </button>
              <button
                onClick={submitPurchaseOrder}
                disabled={isSubmittingPurchaseOrder}
                style={{
                  padding: '0.6rem 1.2rem',
                  backgroundColor: isSubmittingPurchaseOrder ? '#9ca3af' : '#10b981',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.375rem',
                  cursor: isSubmittingPurchaseOrder ? 'not-allowed' : 'pointer',
                  fontWeight: '600'
                }}
              >
                {isSubmittingPurchaseOrder ? t('purchase.submitting') : `✅ ${t('purchase.submit')}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PurchaseManagement;
