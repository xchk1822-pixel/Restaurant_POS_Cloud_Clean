import React, { useState, useRef } from 'react';
import { dataManager } from '../../services/dataManager';
import { smartAddDocument, smartIncrementField, smartUpdateDocument } from '../../services/smartSyncService';
import { getLocalDateString } from '../../utils/exchangeRate'; // 🔥 导入本地日期工具

interface Supplier {
  id: string;
  name: string;
  contact: string;
  phone: string;
  address: string;
  balance: number;
  status: 'active' | 'inactive';
  lastUpdated: Date;
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
  invoiceImage?: string; // 发票图片
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

interface PurchaseManagementProps {
  suppliers: Supplier[];
  setSuppliers: React.Dispatch<React.SetStateAction<Supplier[]>>;
  purchaseOrders: PurchaseOrder[];
  setPurchaseOrders: React.Dispatch<React.SetStateAction<PurchaseOrder[]>>;
  inventoryItems: InventoryItem[];
  setInventoryItems: React.Dispatch<React.SetStateAction<InventoryItem[]>>;
  inventoryCategories: Array<{ key: string; name: string; icon: string }>;
}

const PurchaseManagement: React.FC<PurchaseManagementProps> = ({
  suppliers,
  setSuppliers,
  purchaseOrders,
  setPurchaseOrders,
  inventoryItems,
  setInventoryItems,
  inventoryCategories
}) => {
  const [showNewOrderModal, setShowNewOrderModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<PurchaseOrder | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // 查询筛选状态
  const [searchFilters, setSearchFilters] = useState({
    orderNumber: '',
    supplierId: '',
    startDate: '',
    endDate: '',
    paymentType: 'all' as 'all' | 'cash' | 'credit',
    status: 'all' as 'all' | 'pending' | 'partial' | 'completed'
  });

  // 新建采购单状态
  const [newOrder, setNewOrder] = useState({
    supplierId: '',
    orderNumber: '', // 🎫 发票号码（作为订单号）
    paymentType: 'credit' as 'cash' | 'credit',
    notes: '',
    items: [] as Array<{
      itemId: string;
      itemName: string;
      quantity: number;
      unitPrice: number;
      subtotal: number;
    }>,
    invoiceImage: null as string | null
  });
  
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
        newItems[index].unitPrice = item.costPrice; // 使用进价
        newItems[index].subtotal = newItems[index].quantity * item.costPrice;
      }
    }
    
    // 如果修改数量或单价，重新计算小计
    if (field === 'quantity' || field === 'unitPrice') {
      newItems[index].subtotal = newItems[index].quantity * newItems[index].unitPrice;
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
    return newOrder.items.reduce((sum, item) => sum + item.subtotal, 0);
  };

  // 处理发票上传
  const handleInvoiceUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // 模拟上传，实际应该上传到服务器
      const reader = new FileReader();
      reader.onloadend = () => {
        setNewOrder({ ...newOrder, invoiceImage: reader.result as string });
      };
      reader.readAsDataURL(file);
    }
  };

  // 提交采购单
  const submitPurchaseOrder = async () => {
    if (!newOrder.supplierId) {
      alert('请选择供应商');
      return;
    }
    if (newOrder.items.length === 0) {
      alert('请至少添加一个物品');
      return;
    }
    if (newOrder.items.some(item => !item.itemId || item.quantity <= 0)) {
      alert('请完整填写所有物品信息');
      return;
    }
    if (!newOrder.orderNumber || newOrder.orderNumber.trim() === '') {
      alert('请输入发票号码（订单号）');
      return;
    }

    const supplier = suppliers.find(s => s.id === newOrder.supplierId);
    if (!supplier) return;

    const totalAmount = calculateTotal();

    const order: PurchaseOrder = {
      id: `po-${Date.now()}`,
      orderNumber: newOrder.orderNumber,
      supplierId: newOrder.supplierId,
      supplierName: supplier.name,
      items: newOrder.items,
      totalAmount,
      paidAmount: newOrder.paymentType === 'cash' ? totalAmount : 0,
      paymentType: newOrder.paymentType,
      status: 'completed', // ✅ 所有采购单创建后立即入库
      orderDate: new Date(), // ✅ 采购日期使用当前时间
      receivedDate: new Date(), // ✅ 入库日期使用当前时间
      notes: newOrder.notes
    };

    setPurchaseOrders([order, ...purchaseOrders]);
    try {
      await smartAddDocument('purchase_orders', order);
    } catch (error) {
      console.error('同步采购单到 Firestore 失败:', error);
      alert('采购单已保存到本机，但云端同步失败，请检查网络后重试。');
    }

    // ✅ 立即入库（无论现结还是赊账）
    console.log('📦 开始入库，采购单物品:', newOrder.items);
    setInventoryItems(items => items.map(item => {
      const orderItem = newOrder.items.find(oi => oi.itemId === item.id);
      if (orderItem) {
        console.log(`📥 入库: ${item.name}, 原库存: ${item.currentStock}, 采购数量: ${orderItem.quantity}, 新库存: ${item.currentStock + orderItem.quantity}`);
        smartIncrementField('inventory_items', item.id, 'currentStock', orderItem.quantity, {
          lastModified: Date.now(),
          lastUpdated: new Date()
        }).catch(error => {
          console.error(`❌ 同步采购入库失败: ${item.name}`, error);
        });
        return { ...item, currentStock: item.currentStock + orderItem.quantity };
      }
      return item;
    }));
    
    // 🔄 同步创建开支记录（现结采购）- 使用 dataManager
    if (newOrder.paymentType === 'cash') {
      const expenseDate = getLocalDateString(); // 🔥 使用本地当前时间
      const purchaseExpense = {
        id: `purchase_${Date.now()}`,
        date: expenseDate,
        categoryId: 'supplier_payment',
        categoryName: '供应商货款',
        amount: totalAmount,
        description: `采购现结 - ${supplier.name} (${newOrder.orderNumber})`,
        supplierId: newOrder.supplierId,
        supplierName: supplier.name,
        relatedType: 'purchase',
        orderNumber: newOrder.orderNumber,
        createdAt: getLocalDateString(), // 🔥 使用本地时间
      };
      
      const nextExpenses = [...dataManager.getData('expenses'), purchaseExpense];
      await dataManager.saveData('expenses', nextExpenses, { syncFirestore: false });
      await smartAddDocument('expenses', purchaseExpense);
      console.log('💰 已创建采购开支记录:', purchaseExpense);
    }

    // 更新供应商欠款（赊账）
    if (newOrder.paymentType === 'credit') {
      setSuppliers(suppliers => suppliers.map(sup => {
        if (sup.id === newOrder.supplierId) {
          const updatedSupplier = { ...sup, balance: sup.balance + totalAmount };
          smartUpdateDocument('suppliers', sup.id, updatedSupplier).catch(error => {
            console.error('同步供应商欠款到 Firestore 失败:', error);
          });
          return updatedSupplier;
        }
        return sup;
      }));
    }

    alert(`采购单 ${newOrder.orderNumber} 创建成功！`);
    setShowNewOrderModal(false);
    setNewOrder({
      supplierId: '',
      orderNumber: '',
      paymentType: 'credit',
      notes: '',
      items: [],
      invoiceImage: null
    });
  };

  // 入库操作
  // 🖨️ 打印采购单
  const printPurchaseOrder = (order: PurchaseOrder) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('请允许弹出窗口以打印采购单');
      return;
    }

    const content = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>采购单 - ${order.orderNumber}</title>
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
          <div class="company-name">餐厅管理系统</div>
          <div class="title">采购入库单</div>
        </div>

        <div class="info-section">
          <div class="info-row">
            <span class="info-label">订单号：</span>
            <span class="info-value" style="font-size: 16px; font-weight: bold;">${order.orderNumber}</span>
          </div>
          <div class="info-row">
            <span class="info-label">供应商：</span>
            <span class="info-value">${order.supplierName}</span>
            <span class="info-label">采购日期：</span>
            <span class="info-value">${new Date(order.orderDate).toLocaleDateString('zh-CN')}</span>
          </div>
          <div class="info-row">
            <span class="info-label">支付方式：</span>
            <span class="info-value">${order.paymentType === 'cash' ? '💵 现结' : '💳 欠款'}</span>
            <span class="info-label">状态：</span>
            <span class="info-value">
              <span class="status-badge status-${order.status}">
                ${order.status === 'completed' ? '✅ 已完成' : '⏸️ 待处理'}
              </span>
            </span>
          </div>
          ${order.notes ? `
          <div class="info-row">
            <span class="info-label">备注：</span>
            <span class="info-value" style="color: #dc2626;">${order.notes}</span>
          </div>
          ` : ''}
        </div>

        <h3>📋 采购商品明细</h3>
        <table>
          <thead>
            <tr>
              <th style="width: 50px;">序号</th>
              <th>商品名称</th>
              <th class="amount">数量</th>
              <th class="amount">单价</th>
              <th class="amount">小计</th>
            </tr>
          </thead>
          <tbody>
            ${order.items.map((item, idx) => `
              <tr>
                <td>${idx + 1}</td>
                <td>${item.itemName}</td>
                <td class="amount">${item.quantity}</td>
                <td class="amount">¥${item.unitPrice.toFixed(2)}</td>
                <td class="amount" style="font-weight: bold;">¥${item.subtotal.toFixed(2)}</td>
              </tr>
            `).join('')}
          </tbody>
          <tfoot>
            <tr class="total-row">
              <td colspan="4" style="text-align: right;">合计金额：</td>
              <td class="amount" style="font-size: 16px; color: #dc2626;">¥${order.totalAmount.toFixed(2)}</td>
            </tr>
            <tr class="total-row">
              <td colspan="4" style="text-align: right;">已付金额：</td>
              <td class="amount" style="color: #059669;">¥${order.paidAmount.toFixed(2)}</td>
            </tr>
            <tr class="total-row">
              <td colspan="4" style="text-align: right;">剩余欠款：</td>
              <td class="amount" style="color: ${order.totalAmount - order.paidAmount > 0 ? '#dc2626' : '#059669'};">
                ¥${(order.totalAmount - order.paidAmount).toFixed(2)}
              </td>
            </tr>
          </tfoot>
        </table>

        <div class="signature">
          <div class="signature-item">
            <div>采购员签字</div>
            <div class="signature-line"></div>
          </div>
          <div class="signature-item">
            <div>供应商确认</div>
            <div class="signature-line"></div>
          </div>
          <div class="signature-item">
            <div>库管验收</div>
            <div class="signature-line"></div>
          </div>
        </div>

        <div class="no-print" style="text-align: center; margin-top: 30px;">
          <button onclick="window.print()" style="padding: 12px 30px; background: #3b82f6; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 16px; font-weight: bold;">
            🖨️ 点击打印
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
      const orderDate = getLocalDateString(new Date(order.orderDate)); // 🔥 使用本地时间
      if (orderDate < searchFilters.startDate) {
        return false;
      }
    }
    if (searchFilters.endDate) {
      const orderDate = getLocalDateString(new Date(order.orderDate)); // 🔥 使用本地时间
      if (orderDate > searchFilters.endDate) {
        return false;
      }
    }
    
    return true;
  });

  return (
    <div style={{ flex: 1, backgroundColor: 'white', borderRadius: '0.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {/* 顶部工具栏 */}
      <div style={{ padding: '0.75rem', borderBottom: '1px solid #e5e7eb', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: '600', margin: 0 }}>🛒 采购订单管理</h2>
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
            ➕ 新建采购单
          </button>
        </div>
        
        {/* 🔍 筛选工具栏 */}
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="订单号"
            value={searchFilters.orderNumber}
            onChange={(e) => setSearchFilters({...searchFilters, orderNumber: e.target.value})}
            style={{ padding: '0.4rem 0.6rem', border: '1px solid #d1d5db', borderRadius: '0.25rem', fontSize: '0.85rem', minWidth: '120px' }}
          />
          <select
            value={searchFilters.supplierId}
            onChange={(e) => setSearchFilters({...searchFilters, supplierId: e.target.value})}
            style={{ padding: '0.4rem', border: '1px solid #d1d5db', borderRadius: '0.25rem', fontSize: '0.85rem' }}
          >
            <option value="">全部供应商</option>
            {suppliers.map(sup => (
              <option key={sup.id} value={sup.id}>{sup.name}</option>
            ))}
          </select>
          <select
            value={searchFilters.paymentType}
            onChange={(e) => setSearchFilters({...searchFilters, paymentType: e.target.value as any})}
            style={{ padding: '0.4rem', border: '1px solid #d1d5db', borderRadius: '0.25rem', fontSize: '0.85rem' }}
          >
            <option value="all">全部支付</option>
            <option value="cash">💵 现结</option>
            <option value="credit">💳 欠款</option>
          </select>
          <select
            value={searchFilters.status}
            onChange={(e) => setSearchFilters({...searchFilters, status: e.target.value as any})}
            style={{ padding: '0.4rem', border: '1px solid #d1d5db', borderRadius: '0.25rem', fontSize: '0.85rem' }}
          >
            <option value="all">全部状态</option>
            <option value="completed">✅ 已完成</option>
          </select>
          <input
            type="date"
            value={searchFilters.startDate}
            onChange={(e) => setSearchFilters({...searchFilters, startDate: e.target.value})}
            style={{ padding: '0.4rem', border: '1px solid #d1d5db', borderRadius: '0.25rem', fontSize: '0.85rem' }}
          />
          <span style={{ lineHeight: '2rem', color: '#6b7280' }}>至</span>
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
              startDate: '',
              endDate: '',
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
            🔄 重置
          </button>
        </div>
        
        {/* 统计信息 */}
        <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: '#6b7280' }}>
          共 {filteredOrders.length} 个订单（总计 {purchaseOrders.length} 个）
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
                      供应商：{order.supplierName} | {new Date(order.orderDate).toLocaleDateString('zh-CN')}
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
                      {order.paymentType === 'cash' ? '💵 现结' : '📝 欠款'}
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
                      {order.status === 'completed' ? '✅ 已完成' : '⏸️ 待处理'}
                    </div>
                  </div>
                </div>

                <div style={{ fontSize: '0.85rem', marginBottom: '0.75rem' }}>
                  {order.items.map((item, idx) => (
                    <div key={idx} style={{ padding: '0.35rem 0', borderBottom: '1px solid #f3f4f6' }}>
                      {item.itemName} × {item.quantity} @ ¥{item.unitPrice.toFixed(2)} = ¥{item.subtotal.toFixed(2)}
                    </div>
                  ))}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '0.75rem', borderTop: '2px solid #e5e7eb' }}>
                  <div>
                    <div style={{ fontSize: '0.85rem', color: '#6b7280' }}>
                      总额：¥{order.totalAmount.toFixed(2)} | 已付：¥{order.paidAmount.toFixed(2)} | 
                      <span style={{ color: order.totalAmount - order.paidAmount > 0 ? '#dc2626' : '#059669', fontWeight: '600' }}>
                        {' '}欠款：¥{(order.totalAmount - order.paidAmount).toFixed(2)}
                      </span>
                    </div>
                    {order.notes && <div style={{ fontSize: '0.8rem', color: '#dc2626', marginTop: '0.25rem' }}>备注：{order.notes}</div>}
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
                      📋 详情
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
                      🖨️ 打印
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
                📋 采购单详情 - {selectedOrder.orderNumber}
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
                ✕ 关闭
              </button>
            </div>
            
            {/* 基本信息 */}
            <div style={{ backgroundColor: '#f9fafb', padding: '1rem', borderRadius: '0.375rem', marginBottom: '1rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', fontSize: '0.9rem' }}>
                <div><span style={{ color: '#6b7280' }}>供应商：</span><strong>{selectedOrder.supplierName}</strong></div>
                <div><span style={{ color: '#6b7280' }}>采购日期：</span>{new Date(selectedOrder.orderDate).toLocaleDateString('zh-CN')}</div>
                <div><span style={{ color: '#6b7280' }}>支付方式：</span>{selectedOrder.paymentType === 'cash' ? '💵 现结' : '💳 欠款'}</div>
                <div>
                  <span style={{ color: '#6b7280' }}>状态：</span>
                  <span style={{
                    padding: '0.2rem 0.5rem',
                    backgroundColor: selectedOrder.status === 'completed' ? '#d1fae5' : (selectedOrder.status === 'partial' ? '#dbeafe' : '#fef3c7'),
                    color: selectedOrder.status === 'completed' ? '#059669' : (selectedOrder.status === 'partial' ? '#2563eb' : '#d97706'),
                    borderRadius: '0.25rem',
                    fontSize: '0.8rem',
                    fontWeight: '600'
                  }}>
                    {selectedOrder.status === 'completed' ? '✅ 已完成' : '⏸️ 待处理'}
                  </span>
                </div>
                {selectedOrder.receivedDate && <div><span style={{ color: '#6b7280' }}>入库日期：</span>{new Date(selectedOrder.receivedDate).toLocaleDateString('zh-CN')}</div>}
              </div>
              {selectedOrder.notes && (
                <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid #e5e7eb' }}>
                  <span style={{ color: '#6b7280' }}>备注：</span>
                  <span style={{ color: '#dc2626' }}>{selectedOrder.notes}</span>
                </div>
              )}
            </div>

            {/* 商品明细 */}
            <div style={{ marginBottom: '1rem' }}>
              <h4 style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '0.75rem' }}>📦 商品明细</h4>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f9fafb' }}>
                    <th style={{ padding: '0.6rem', textAlign: 'left', borderBottom: '2px solid #e5e7eb' }}>序号</th>
                    <th style={{ padding: '0.6rem', textAlign: 'left', borderBottom: '2px solid #e5e7eb' }}>商品名称</th>
                    <th style={{ padding: '0.6rem', textAlign: 'right', borderBottom: '2px solid #e5e7eb' }}>数量</th>
                    <th style={{ padding: '0.6rem', textAlign: 'right', borderBottom: '2px solid #e5e7eb' }}>单价</th>
                    <th style={{ padding: '0.6rem', textAlign: 'right', borderBottom: '2px solid #e5e7eb' }}>小计</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedOrder.items.map((item, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '0.6rem' }}>{idx + 1}</td>
                      <td style={{ padding: '0.6rem' }}>{item.itemName}</td>
                      <td style={{ padding: '0.6rem', textAlign: 'right' }}>{item.quantity}</td>
                      <td style={{ padding: '0.6rem', textAlign: 'right' }}>¥{item.unitPrice.toFixed(2)}</td>
                      <td style={{ padding: '0.6rem', textAlign: 'right', fontWeight: '600' }}>¥{item.subtotal.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 金额汇总 */}
            <div style={{ backgroundColor: '#fef3c7', padding: '1rem', borderRadius: '0.375rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.95rem' }}>
                <span>合计金额：</span>
                <strong style={{ fontSize: '1.1rem', color: '#dc2626' }}>¥{selectedOrder.totalAmount.toFixed(2)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.95rem' }}>
                <span>已付金额：</span>
                <strong style={{ color: '#059669' }}>¥{selectedOrder.paidAmount.toFixed(2)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.95rem', paddingTop: '0.5rem', borderTop: '2px solid #fcd34d' }}>
                <span>剩余欠款：</span>
                <strong style={{ color: selectedOrder.totalAmount - selectedOrder.paidAmount > 0 ? '#dc2626' : '#059669' }}>
                  ¥{(selectedOrder.totalAmount - selectedOrder.paidAmount).toFixed(2)}
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
                🖨️ 打印采购单
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
                关闭
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
              📝 新建采购单
            </h3>
            
            <div style={{ display: 'grid', gap: '1rem' }}>
              {/* 基本信息 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.35rem', fontWeight: '600', fontSize: '0.85rem' }}>
                    供应商 <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <select
                    value={newOrder.supplierId}
                    onChange={(e) => setNewOrder({...newOrder, supplierId: e.target.value})}
                    style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '0.25rem' }}
                  >
                    <option value="">请选择供应商</option>
                    {suppliers.map(sup => (
                      <option key={sup.id} value={sup.id}>{sup.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.35rem', fontWeight: '600', fontSize: '0.85rem' }}>
                    🎫 发票号码（订单号）<span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="text"
                    value={newOrder.orderNumber}
                    onChange={(e) => setNewOrder({...newOrder, orderNumber: e.target.value})}
                    placeholder="例如：FP-2024-001"
                    style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '0.25rem', fontWeight: '600' }}
                  />
                  <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                    💡 此号码将作为订单号，用于供应商还款和对账
                  </div>
                </div>
              </div>

              {/* 支付方式 */}
              <div>
                <label style={{ display: 'block', marginBottom: '0.35rem', fontWeight: '600', fontSize: '0.85rem' }}>
                  支付方式
                </label>
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      checked={newOrder.paymentType === 'credit'}
                      onChange={() => setNewOrder({...newOrder, paymentType: 'credit'})}
                    />
                    <span>📝 欠款（计入应付账款）</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      checked={newOrder.paymentType === 'cash'}
                      onChange={() => setNewOrder({...newOrder, paymentType: 'cash'})}
                    />
                    <span>💵 现结（立即入库）</span>
                  </label>
                </div>
              </div>

              {/* 物品列表 */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <label style={{ fontWeight: '600', fontSize: '0.85rem' }}>采购物品清单</label>
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
                    ➕ 添加物品
                  </button>
                </div>
                
                <div style={{ border: '1px solid #e5e7eb', borderRadius: '0.375rem', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead style={{ backgroundColor: '#f9fafb' }}>
                      <tr>
                        <th style={{ padding: '0.5rem', textAlign: 'left', fontSize: '0.8rem', borderBottom: '1px solid #e5e7eb', width: '120px' }}>类别</th>
                        <th style={{ padding: '0.5rem', textAlign: 'left', fontSize: '0.8rem', borderBottom: '1px solid #e5e7eb' }}>物品</th>
                        <th style={{ padding: '0.5rem', textAlign: 'right', fontSize: '0.8rem', borderBottom: '1px solid #e5e7eb', width: '100px' }}>数量</th>
                        <th style={{ padding: '0.5rem', textAlign: 'right', fontSize: '0.8rem', borderBottom: '1px solid #e5e7eb', width: '120px' }}>单价(¥)</th>
                        <th style={{ padding: '0.5rem', textAlign: 'right', fontSize: '0.8rem', borderBottom: '1px solid #e5e7eb', width: '120px' }}>小计(¥)</th>
                        <th style={{ padding: '0.5rem', textAlign: 'center', fontSize: '0.8rem', borderBottom: '1px solid #e5e7eb', width: '60px' }}>操作</th>
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
                              <option value="all">全部</option>
                              {(() => {
                                // 🔥 实时从 inventoryItems 提取所有唯一类别
                                const uniqueCategories = Array.from(
                                  new Set(
                                    inventoryItems
                                      .map(inv => inv.category)
                                      .filter(cat => cat && cat.trim() !== '')
                                  )
                                );
                                
                                console.log('📦 当前库存物品数量:', inventoryItems.length);
                                console.log('🏷️ 提取到的类别:', uniqueCategories);
                                
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
                              <option value="">选择物品</option>
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
                                    {inv.name} (库存:{inv.currentStock}{inv.unit}) ¥{inv.costPrice}/{inv.unit}
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
                            ¥{item.subtotal.toFixed(2)}
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
                            点击“➕ 添加物品”开始录入
                          </td>
                        </tr>
                      )}
                    </tbody>
                    <tfoot style={{ backgroundColor: '#f9fafb' }}>
                      <tr>
                        <td colSpan={3} style={{ padding: '0.75rem', textAlign: 'right', fontWeight: '600' }}>合计：</td>
                        <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 'bold', fontSize: '1.1rem', color: '#2563eb' }}>
                          ¥{calculateTotal().toFixed(2)}
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* 发票上传 */}
              <div>
                <label style={{ display: 'block', marginBottom: '0.35rem', fontWeight: '600', fontSize: '0.85rem' }}>
                  📷 发票上传（防止作弊）
                </label>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'start' }}>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleInvoiceUpload}
                    style={{ flex: 1 }}
                  />
                  {newOrder.invoiceImage && (
                    <img
                      src={newOrder.invoiceImage}
                      alt="发票"
                      style={{ width: '100px', height: '100px', objectFit: 'cover', borderRadius: '0.25rem', border: '1px solid #e5e7eb' }}
                    />
                  )}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                  支持JPG、PNG格式，建议拍摄清晰完整的发票照片
                </div>
              </div>

              {/* 备注 */}
              <div>
                <label style={{ display: 'block', marginBottom: '0.35rem', fontWeight: '600', fontSize: '0.85rem' }}>
                  备注
                </label>
                <textarea
                  value={newOrder.notes}
                  onChange={(e) => setNewOrder({...newOrder, notes: e.target.value})}
                  placeholder="可选填写备注信息"
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
                    paymentType: 'credit',
                    notes: '',
                    items: [],
                    invoiceImage: null
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
                onClick={submitPurchaseOrder}
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
                ✅ 提交采购单
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PurchaseManagement;
