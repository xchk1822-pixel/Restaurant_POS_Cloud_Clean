import React, { useState } from 'react';
import { dataManager } from '../../services/dataManager';
import { useAppContext } from '../../contexts/AppContext';
import { getLocalDateString } from '../../utils/exchangeRate'; // 🔥 导入本地日期工具
import { smartAddDocument, smartUpdateDocument } from '../../services/smartSyncService';

interface Supplier {
  id: string;
  name: string;
  contact: string;
  phone: string;
  address: string;
  balance: number; // 当前欠款余额
  status: 'active' | 'inactive';
  lastUpdated: Date;
}

interface PaymentRecord {
  id: string;
  orderId: string; // 关联的采购单ID
  orderNumber: string; // 采购单号
  supplierId: string;
  supplierName: string;
  amount: number; // 本次还款金额
  paymentDate: Date;
  paymentMethod: 'cash' | 'transfer' | 'check'; // 支付方式
  notes?: string;
  // ❌ voucherImage 已移除，避免超出localStorage配额
}

interface SupplierManagementProps {
  // 不再需要props，从 AppContext 获取
}

const SupplierManagement: React.FC<SupplierManagementProps> = () => {
  const { suppliers, setSuppliers, purchaseOrders, setPurchaseOrders } = useAppContext();
  const [showAddModal, setShowAddModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null); // 选中的采购单
  const [editingSupplier, setEditingSupplier] = useState<Partial<Supplier>>({});
  
  // 📄 业务流水弹窗
  const [showTransactionModal, setShowTransactionModal] = useState(false);
  const [selectedSupplierForTransaction, setSelectedSupplierForTransaction] = useState<Supplier | null>(null);
  
  // 还款表单
  const [paymentForm, setPaymentForm] = useState({
    amount: '',
    paymentMethod: 'cash' as 'cash' | 'transfer' | 'check',
    notes: ''
  });

  // 筛选状态
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'has_debt'>('all');
  const [searchKeyword, setSearchKeyword] = useState('');

  // 保存数据
  const saveData = (key: string, data: any) => {
    localStorage.setItem(key, JSON.stringify(data));
  };

  // 获取供应商的采购订单
  const getSupplierOrders = (supplierId: string) => {
    return purchaseOrders.filter(order => order.supplierId === supplierId);
  };

  // 获取供应商的还款记录
  const getSupplierPayments = (supplierId: string): PaymentRecord[] => {
    const saved = localStorage.getItem(`payments_${supplierId}`);
    return saved ? JSON.parse(saved) : [];
  };

  // 保存还款记录
  const savePaymentRecord = async (supplierId: string, record: PaymentRecord) => {
    const payments = getSupplierPayments(supplierId);
    payments.push(record);
    saveData(`payments_${supplierId}`, payments);
    
    // 🔥 同步到 Firestore
    try {
      await smartAddDocument('supplier_payments', record);
      console.log('✅ 还款记录已同步到 Firestore');
    } catch (error) {
      console.error('❌ 同步还款记录失败:', error);
    }
  };

  // 添加/编辑供应商
  const handleSaveSupplier = async () => {
    if (!editingSupplier.name || !editingSupplier.contact || !editingSupplier.phone) {
      alert('请填写必填项（名称、联系人、电话）');
      return;
    }

    if (editingSupplier.id) {
      // 编辑现有供应商
      const updatedSupplier = {
        ...suppliers.find(s => s.id === editingSupplier.id)!,
        name: editingSupplier.name!,
        contact: editingSupplier.contact!,
        phone: editingSupplier.phone!,
        address: editingSupplier.address || '',
        status: editingSupplier.status || 'active',
        lastUpdated: new Date()
      };
      
      setSuppliers(suppliers.map(sup => 
        sup.id === editingSupplier.id ? updatedSupplier : sup
      ));
      alert('✅ 供应商信息已更新！');
      
      // 🔥 同步到 Firestore
      try {
        await smartUpdateDocument('suppliers', editingSupplier.id, updatedSupplier);
        console.log('✅ 供应商信息已同步到 Firestore');
      } catch (error) {
        console.error('❌ 同步供应商信息失败:', error);
      }
    } else {
      // 添加新供应商
      const newSupplier: Supplier = {
        id: `sup-${Date.now()}`,
        name: editingSupplier.name!,
        contact: editingSupplier.contact!,
        phone: editingSupplier.phone!,
        address: editingSupplier.address || '',
        balance: 0,
        status: editingSupplier.status || 'active',
        lastUpdated: new Date()
      };
      setSuppliers([...suppliers, newSupplier]);
      alert('✅ 供应商添加成功！');
      
      // 🔥 同步到 Firestore
      try {
        await smartAddDocument('suppliers', newSupplier);
        console.log('✅ 新供应商已同步到 Firestore');
      } catch (error) {
        console.error('❌ 同步新供应商失败:', error);
      }
    }

    setShowAddModal(false);
    setEditingSupplier({});
  };

  // 删除供应商
  const handleDeleteSupplier = (supplierId: string) => {
    const supplier = suppliers.find(s => s.id === supplierId);
    if (!supplier) return;

    if (supplier.balance > 0) {
      alert(`该供应商还有欠款 C$ ${supplier.balance.toFixed(2)}，无法删除！`);
      return;
    }

    if (window.confirm(`确定要删除供应商"${supplier.name}"吗？`)) {
      setSuppliers(suppliers.filter(s => s.id !== supplierId));
      alert('✅ 供应商已删除！');
    }
  };

  // 处理还款（按单据）
  const handlePayment = () => {
    if (!selectedOrder || !paymentForm.amount) {
      alert('请选择采购单并填写还款金额');
      return;
    }

    const amount = parseFloat(paymentForm.amount);
    if (amount <= 0) {
      alert('请输入有效的还款金额');
      return;
    }

    // 计算该订单的剩余欠款
    const orderRemaining = selectedOrder.totalAmount - selectedOrder.paidAmount;
    if (amount > orderRemaining) {
      alert(`还款金额不能超过该订单剩余欠款 C$ ${orderRemaining.toFixed(2)}`);
      return;
    }

    // 更新采购单的已付金额
    const newPaidAmount = selectedOrder.paidAmount + amount;
    const newOrderStatus = newPaidAmount >= selectedOrder.totalAmount ? 'completed' : 'partial';
    
    // 更新采购单
    setPurchaseOrders(orders => {
      const updatedOrders = orders.map(order => 
        order.id === selectedOrder.id ? {
          ...order,
          paidAmount: newPaidAmount,
          status: newOrderStatus as 'completed' | 'partial'
        } : order
      );
      
      // 🔄 同时更新供应商的欠款余额
      setSuppliers(suppliers => suppliers.map(sup => {
        if (sup.id === selectedOrder.supplierId) {
          // 重新计算该供应商的总欠款（使用更新后的订单数据）
          const totalDebt = updatedOrders.filter(o => o.supplierId === sup.id).reduce((sum, order) => {
            return sum + (order.totalAmount - order.paidAmount);
          }, 0);
          return { ...sup, balance: totalDebt, lastUpdated: new Date() };
        }
        return sup;
      }));
      
      return updatedOrders;
    });

    // 创建还款记录（关联到具体订单）
    const paymentRecord: PaymentRecord = {
      id: `pay-${Date.now()}`,
      orderId: selectedOrder.id,
      orderNumber: selectedOrder.orderNumber,
      supplierId: selectedOrder.supplierId,
      supplierName: selectedOrder.supplierName,
      amount: amount,
      paymentDate: new Date(),
      paymentMethod: paymentForm.paymentMethod,
      notes: paymentForm.notes
      // ❌ 不存储 voucherImage 到 localStorage，避免超出配额
    };

    savePaymentRecord(selectedOrder.supplierId, paymentRecord);

    // 🔄 同步创建开支记录
    const expenseDate = getLocalDateString(); // 🔥 使用本地时间
    const paymentExpense = {
      id: `supplier_pay_${Date.now()}`,
      date: expenseDate,
      categoryId: 'supplier_payment',
      categoryName: '供应商货款',
      amount: amount,
      description: `供应商还款 - ${selectedOrder.supplierName} (${selectedOrder.orderNumber})`,
      supplierId: selectedOrder.supplierId,
      supplierName: selectedOrder.supplierName,
      relatedType: 'supplier_repayment',
      orderNumber: selectedOrder.orderNumber,
      createdAt: getLocalDateString(), // 🔥 使用本地时间
    };

    dataManager.addData('expenses', paymentExpense);
    console.log('💰 已创建供应商还款开支记录:', paymentExpense);

    alert(`✅ 还款成功！\n\n票号：${selectedOrder.orderNumber}\n还款金额：C$ ${amount.toFixed(2)}\n剩余欠款：C$ ${(orderRemaining - amount).toFixed(2)}`);

    setShowPaymentModal(false);
    setSelectedOrder(null);
    setPaymentForm({
      amount: '',
      paymentMethod: 'cash',
      notes: ''
    });
  };

  // 打印对账单（带票号选择）
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [selectedSupplierForPrint, setSelectedSupplierForPrint] = useState<Supplier | null>(null);
  const [printOrderNumber, setPrintOrderNumber] = useState<string>('all'); // 'all' 或具体票号
  
  const openPrintModal = (supplier: Supplier) => {
    setSelectedSupplierForPrint(supplier);
    setPrintOrderNumber('all');
    setShowPrintModal(true);
  };
  
  const executePrint = () => {
    if (!selectedSupplierForPrint) return;
    
    const orders = getSupplierOrders(selectedSupplierForPrint.id);
    const payments = getSupplierPayments(selectedSupplierForPrint.id);
    
    // 如果选择了指定票号，过滤数据
    let filteredOrders = orders;
    let filteredPayments = payments;
    
    if (printOrderNumber !== 'all') {
      filteredOrders = orders.filter(o => o.orderNumber === printOrderNumber);
      filteredPayments = payments.filter(p => p.orderNumber === printOrderNumber);
    }
    
    if (filteredOrders.length === 0 && filteredPayments.length === 0) {
      alert('没有可打印的记录');
      return;
    }
    
    // 计算统计
    const totalPurchases = filteredOrders.reduce((sum, order) => sum + order.totalAmount, 0);
    const totalPaid = filteredPayments.reduce((sum, pay) => sum + pay.amount, 0);
    const currentBalance = totalPurchases - totalPaid;

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('请允许弹出窗口以打印对账单');
      return;
    }

    const content = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>供应商对账单 - ${selectedSupplierForPrint.name}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Microsoft YaHei', Arial, sans-serif; padding: 20px; font-size: 13px; }
          .header { text-align: center; margin-bottom: 20px; }
          .title { font-size: 20px; font-weight: bold; color: #333; margin-bottom: 5px; }
          .subtitle { font-size: 14px; color: #666; }
          .section { margin-bottom: 20px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; overflow: hidden; }
          .section-title { background: #f3f4f6; padding: 10px 15px; font-weight: 600; font-size: 14px; color: #374151; border-bottom: 1px solid #e5e7eb; }
          table { width: 100%; border-collapse: collapse; }
          th, td { padding: 8px 12px; text-align: left; border-bottom: 1px solid #e5e7eb; }
          th { background: #f9fafb; font-weight: 600; color: #374151; font-size: 12px; }
          td { font-size: 13px; color: #4b5563; }
          .amount { text-align: right; font-weight: 600; font-family: 'Consolas', monospace; }
          .type-badge { display: inline-block; padding: 2px 8px; border-radius: 3px; font-size: 12px; font-weight: 600; }
          .type-repayment { background: #d1fae5; color: #059669; }
          .type-purchase { background: #fef3c7; color: #d97706; }
          .voucher-cell { color: #3b82f6; cursor: pointer; text-decoration: underline; }
          .voucher-cell:hover { color: #2563eb; }
          @media print {
            body { padding: 0; }
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="title">供应商对账单</div>
          <div class="subtitle">${selectedSupplierForPrint.name} | 打印日期：${new Date().toLocaleDateString('zh-CN')}</div>
        </div>

        <!-- 供应商对账明细 -->
        <div class="section">
          <div class="section-title">📋 供应商对账明细（按单据号归类）</div>
          <table>
            <thead>
              <tr>
                <th style="width: 20%;">供应商</th>
                <th style="width: 20%;">单据号</th>
                <th class="amount" style="width: 20%;">应付额</th>
                <th class="amount" style="width: 20%;">已付额</th>
                <th class="amount" style="width: 20%;">剩余欠款</th>
              </tr>
            </thead>
            <tbody>
              ${filteredOrders.length > 0 ? filteredOrders.map(order => {
                const orderPayments = filteredPayments.filter(p => p.orderNumber === order.orderNumber);
                const orderPaid = orderPayments.reduce((sum, p) => sum + p.amount, 0);
                const remaining = order.totalAmount - orderPaid;
                return `
                  <tr>
                    <td>${selectedSupplierForPrint.name}</td>
                    <td>${order.orderNumber}</td>
                    <td class="amount">C$ ${order.totalAmount.toFixed(1)}</td>
                    <td class="amount" style="color: #059669;">C$ ${orderPaid.toFixed(1)}</td>
                    <td class="amount" style="color: ${remaining > 0 ? '#dc2626' : '#059669'};">C$ ${remaining.toFixed(1)}</td>
                  </tr>
                `;
              }).join('') : '<tr><td colspan="5" style="text-align: center; padding: 20px; color: #9ca3af;">暂无采购记录</td></tr>'}
            </tbody>
          </table>
        </div>

        <!-- 业务流水明细 -->
        <div class="section">
          <div class="section-title">📊 业务流水明细</div>
          <table>
            <thead>
              <tr>
                <th style="width: 12%;">日期</th>
                <th style="width: 10%;">类型</th>
                <th style="width: 45%;">明细详情（上收下支）</th>
                <th class="amount" style="width: 15%;">总金额</th>
                <th style="width: 10%;">凭证</th>
              </tr>
            </thead>
            <tbody>
              ${(() => {
                // 合并采购和还款记录，按日期排序
                const allTransactions: any[] = [];
                
                // 添加采购记录（挂账）
                filteredOrders.forEach(order => {
                  const items = order.items || [];
                  const detailText = items.map(item => `${item.itemName}C$ ${item.subtotal.toFixed(0)}`).join(',');
                  allTransactions.push({
                    date: order.orderDate,
                    type: 'purchase',
                    typeLabel: '挂账',
                    detail: `[${selectedSupplierForPrint.name}] ${detailText} (单:${order.orderNumber})`,
                    amount: order.totalAmount,
                    voucher: null
                  });
                });
                
                // 添加还款记录
                filteredPayments.forEach(payment => {
                  allTransactions.push({
                    date: payment.paymentDate,
                    type: 'repayment',
                    typeLabel: '还款',
                    detail: `[${selectedSupplierForPrint.name}] 还款支付 (单:${payment.orderNumber})`,
                    amount: payment.amount,
                    voucher: null // ❌ 不再存储凭证图片到localStorage
                  });
                });
                
                // 按日期排序
                allTransactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
                
                return allTransactions.map((trans, idx) => {
                  const date = new Date(trans.date);
                  const dateStr = date.getFullYear() + '-' + 
                    String(date.getMonth() + 1).padStart(2, '0') + '-' + 
                    String(date.getDate()).padStart(2, '0');
                  
                  return `
                    <tr>
                      <td>${dateStr}</td>
                      <td><span class="type-badge ${trans.type === 'repayment' ? 'type-repayment' : 'type-purchase'}">${trans.typeLabel}</span></td>
                      <td style="font-size: 12px; line-height: 1.6;">${trans.detail}</td>
                      <td class="amount" style="color: ${trans.type === 'repayment' ? '#059669' : '#dc2626'};">C$ ${trans.amount.toFixed(1)}</td>
                      <td>${trans.voucher ? '<span style="color: #3b82f6; cursor: pointer; text-decoration: underline;">查看</span>' : '-'}</td>
                    </tr>
                  `;
                }).join('');
              })()}
            </tbody>
          </table>
        </div>

        <div class="no-print" style="text-align: center; margin-top: 20px;">
          <button onclick="window.print()" style="padding: 10px 30px; background: #3b82f6; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 14px; font-weight: bold;">
            🖨️ 点击打印
          </button>
        </div>
      </body>
      </html>
    `;

    printWindow.document.write(content);
    printWindow.document.close();
    setShowPrintModal(false);
  };

  // 筛选供应商
  const filteredSuppliers = suppliers.filter(sup => {
    // 状态筛选
    if (filterStatus === 'active' && sup.status !== 'active') return false;
    if (filterStatus === 'has_debt' && sup.balance <= 0) return false;

    // 关键词搜索
    if (searchKeyword) {
      const keyword = searchKeyword.toLowerCase();
      return sup.name.toLowerCase().includes(keyword) || 
             sup.contact.toLowerCase().includes(keyword) ||
             sup.phone.includes(keyword);
    }

    return true;
  });

  const styles = {
    container: {
      height: '100%',
      display: 'flex',
      flexDirection: 'column' as const,
    },
    header: {
      padding: '1rem',
      borderBottom: '1px solid #e5e7eb',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      flexShrink: 0 as const,
    },
    toolbar: {
      display: 'flex',
      gap: '0.75rem',
      marginBottom: '1rem',
      flexWrap: 'wrap' as const,
      flexShrink: 0 as const,
    },
    input: {
      padding: '0.5rem',
      border: '1px solid #d1d5db',
      borderRadius: '0.375rem',
      fontSize: '0.875rem',
    },
    select: {
      padding: '0.5rem',
      border: '1px solid #d1d5db',
      borderRadius: '0.375rem',
      fontSize: '0.875rem',
    },
    btn: (bg: string) => ({
      padding: '0.5rem 1rem',
      background: bg,
      color: 'white',
      border: 'none',
      borderRadius: '0.375rem',
      cursor: 'pointer',
      fontWeight: '600',
      fontSize: '0.875rem',
    }),
    card: {
      background: 'white',
      borderRadius: '0.5rem',
      padding: '1rem',
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      marginBottom: '1rem',
    },
    modal: {
      position: 'fixed' as const,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
    },
    modalContent: {
      backgroundColor: 'white',
      borderRadius: '0.5rem',
      padding: '1.5rem',
      width: '600px',
      maxHeight: '90vh',
      overflow: 'auto',
    },
  };

  return (
    <div style={styles.container}>
      {/* 头部 */}
      <div style={styles.header}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: '700', margin: 0 }}>👥 供应商管理</h2>
          <p style={{ color: '#6b7280', marginTop: '0.25rem', fontSize: '0.875rem' }}>
            管理供应商信息、欠款追踪、还款记录
          </p>
        </div>
        <button onClick={() => {
          setEditingSupplier({ status: 'active' });
          setShowAddModal(true);
        }} style={styles.btn('#10b981')}>
          ➕ 添加供应商
        </button>
      </div>

      {/* 工具栏 */}
      <div style={{ padding: '1rem', flexShrink: 0 }}>
        <div style={styles.toolbar}>
          <input
            type="text"
            placeholder="🔍 搜索供应商名称/联系人/电话..."
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            style={{ ...styles.input, flex: 1, minWidth: '200px' }}
          />
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as any)}
            style={styles.select}
          >
            <option value="all">全部供应商</option>
            <option value="active">合作中</option>
            <option value="has_debt">有欠款</option>
          </select>
        </div>

        {/* 统计卡片 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
          <div style={{ ...styles.card, textAlign: 'center', borderLeft: '4px solid #3b82f6' }}>
            <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>供应商总数</div>
            <div style={{ fontSize: '1.75rem', fontWeight: 'bold', color: '#3b82f6' }}>{suppliers.length}</div>
          </div>
          <div style={{ ...styles.card, textAlign: 'center', borderLeft: '4px solid #f59e0b' }}>
            <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>有欠款供应商</div>
            <div style={{ fontSize: '1.75rem', fontWeight: 'bold', color: '#f59e0b' }}>
              {suppliers.filter(s => s.balance > 0).length}
            </div>
          </div>
          <div style={{ ...styles.card, textAlign: 'center', borderLeft: '4px solid #ef4444' }}>
            <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>总欠款金额</div>
            <div style={{ fontSize: '1.75rem', fontWeight: 'bold', color: '#ef4444' }}>
              C$ {suppliers.reduce((sum, s) => sum + s.balance, 0).toFixed(2)}
            </div>
          </div>
        </div>
      </div>

      {/* 供应商列表 */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 1rem 1rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: '1rem' }}>
          {filteredSuppliers.map(supplier => (
            <div key={supplier.id} style={{
              ...styles.card,
              border: supplier.balance > 0 ? '2px solid #f59e0b' : '1px solid #e5e7eb'
            }}>
              {/* 供应商基本信息 */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '1rem' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 'bold', fontSize: '1.1rem', marginBottom: '0.25rem' }}>
                    {supplier.name}
                  </div>
                  <div style={{ fontSize: '0.85rem', color: '#6b7280' }}>
                    👤 {supplier.contact} | 📱 {supplier.phone}
                  </div>
                  {supplier.address && (
                    <div style={{ fontSize: '0.8rem', color: '#9ca3af', marginTop: '0.25rem' }}>
                      📍 {supplier.address}
                    </div>
                  )}
                </div>
                <span style={{
                  padding: '0.25rem 0.5rem',
                  backgroundColor: supplier.status === 'active' ? '#d1fae5' : '#fee2e2',
                  color: supplier.status === 'active' ? '#059669' : '#dc2626',
                  borderRadius: '0.25rem',
                  fontSize: '0.75rem',
                  fontWeight: '600',
                  whiteSpace: 'nowrap'
                }}>
                  {supplier.status === 'active' ? '✓ 合作中' : '✗ 已停用'}
                </span>
              </div>

              {/* 欠款信息 */}
              <div style={{ 
                backgroundColor: supplier.balance > 0 ? '#fef3c7' : '#f9fafb', 
                padding: '0.75rem', 
                borderRadius: '0.375rem', 
                marginBottom: '1rem' 
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '0.85rem', color: '#6b7280' }}>总欠款余额</span>
                  <span style={{ 
                    fontSize: '1.25rem', 
                    fontWeight: 'bold', 
                    color: supplier.balance > 0 ? '#dc2626' : '#059669' 
                  }}>
                    C$ {supplier.balance.toFixed(2)}
                  </span>
                </div>
              </div>

              {/* 📋 未结清单据列表 */}
              {(() => {
                const unpaidOrders = purchaseOrders.filter(order => 
                  order.supplierId === supplier.id && 
                  order.paymentType === 'credit' &&
                  order.paidAmount < order.totalAmount
                );
                
                if (unpaidOrders.length > 0) {
                  return (
                    <div style={{ marginBottom: '1rem' }}>
                      <div style={{ fontSize: '0.85rem', fontWeight: '600', marginBottom: '0.5rem', color: '#374151' }}>
                        📋 未结清采购单（按票号） ({unpaidOrders.length})
                      </div>
                      <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                        {unpaidOrders.map(order => {
                          const remaining = order.totalAmount - order.paidAmount;
                          const isFullyPaid = remaining <= 0;
                          return (
                            <div key={order.id} style={{
                              padding: '0.6rem',
                              marginBottom: '0.4rem',
                              backgroundColor: isFullyPaid ? '#f0fdf4' : '#fefce8',
                              border: `1px solid ${isFullyPaid ? '#86efac' : '#fde047'}`,
                              borderRadius: '0.375rem',
                              fontSize: '0.8rem'
                            }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' }}>
                                <span style={{ fontWeight: '600', color: '#1f2937' }}>🎫 {order.orderNumber}</span>
                                <div style={{ display: 'flex', gap: '0.3rem' }}>
                                  {!isFullyPaid && (
                                    <button
                                      onClick={() => {
                                        setSelectedOrder(order);
                                        setShowPaymentModal(true);
                                      }}
                                      style={{
                                        padding: '0.2rem 0.5rem',
                                        backgroundColor: '#10b981',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: '0.25rem',
                                        cursor: 'pointer',
                                        fontSize: '0.7rem',
                                        fontWeight: '600'
                                      }}
                                    >
                                      💰 还款
                                    </button>
                                  )}
                                  <button
                                    onClick={() => {
                                      setSelectedSupplierForTransaction(supplier);
                                      setShowTransactionModal(true);
                                    }}
                                    style={{
                                      padding: '0.2rem 0.5rem',
                                      backgroundColor: '#3b82f6',
                                      color: 'white',
                                      border: 'none',
                                      borderRadius: '0.25rem',
                                      cursor: 'pointer',
                                      fontSize: '0.7rem',
                                      fontWeight: '600'
                                    }}
                                  >
                                    📄 流水
                                  </button>
                                </div>
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#6b7280' }}>
                                <span>总额: C$ {order.totalAmount.toFixed(2)}</span>
                                <span>已付: C$ {order.paidAmount.toFixed(2)}</span>
                              </div>
                              {!isFullyPaid && (
                                <div style={{ marginTop: '0.2rem', color: '#dc2626', fontWeight: '600' }}>
                                  剩余: C$ {remaining.toFixed(2)}
                                </div>
                              )}
                              {isFullyPaid && (
                                <div style={{ marginTop: '0.2rem', color: '#059669', fontWeight: '600' }}>
                                  ✅ 已结清
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                }
                return null;
              })()}

              {/* 操作按钮 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
                <button
                  onClick={() => {
                    // 这个按钮已废弃，因为现在按单据还款
                    alert('请点击具体订单的“💰 还款”按钮');
                  }}
                  disabled={supplier.balance <= 0}
                  style={{
                    padding: '0.5rem',
                    backgroundColor: supplier.balance > 0 ? '#10b981' : '#d1d5db',
                    color: 'white',
                    border: 'none',
                    borderRadius: '0.25rem',
                    fontWeight: '600',
                    cursor: supplier.balance > 0 ? 'pointer' : 'not-allowed',
                    fontSize: '0.85rem'
                  }}
                >
                  💰 还款
                </button>
                <button
                  onClick={() => openPrintModal(supplier)}
                  style={{
                    padding: '0.5rem',
                    backgroundColor: '#3b82f6',
                    color: 'white',
                    border: 'none',
                    borderRadius: '0.25rem',
                    fontWeight: '600',
                    cursor: 'pointer',
                    fontSize: '0.85rem'
                  }}
                >
                  📄 对账单
                </button>
                <button
                  onClick={() => {
                    setEditingSupplier({ ...supplier });
                    setShowAddModal(true);
                  }}
                  style={{
                    padding: '0.5rem',
                    backgroundColor: '#6b7280',
                    color: 'white',
                    border: 'none',
                    borderRadius: '0.25rem',
                    fontWeight: '600',
                    cursor: 'pointer',
                    fontSize: '0.85rem'
                  }}
                >
                  ✏️ 编辑
                </button>
              </div>

              {/* 删除按钮（单独一行） */}
              <button
                onClick={() => handleDeleteSupplier(supplier.id)}
                style={{
                  width: '100%',
                  marginTop: '0.5rem',
                  padding: '0.4rem',
                  backgroundColor: '#fee2e2',
                  color: '#dc2626',
                  border: '1px solid #fecaca',
                  borderRadius: '0.25rem',
                  fontWeight: '600',
                  cursor: 'pointer',
                  fontSize: '0.8rem'
                }}
              >
                🗑️ 删除供应商
              </button>
            </div>
          ))}
        </div>

        {filteredSuppliers.length === 0 && (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#9ca3af' }}>
            <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>👥</div>
            <div>暂无供应商数据</div>
          </div>
        )}
      </div>

      {/* 添加/编辑供应商弹窗 */}
      {showAddModal && (
        <div style={styles.modal} onClick={() => setShowAddModal(false)}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: '600', marginBottom: '1rem' }}>
              {editingSupplier.id ? '✏️ 编辑供应商' : '➕ 添加供应商'}
            </h3>
            
            <div style={{ display: 'grid', gap: '1rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.35rem', fontWeight: '600', fontSize: '0.85rem' }}>
                    供应商名称 <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="text"
                    value={editingSupplier.name || ''}
                    onChange={(e) => setEditingSupplier({...editingSupplier, name: e.target.value})}
                    placeholder="例如：粮油批发公司"
                    style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '0.25rem' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.35rem', fontWeight: '600', fontSize: '0.85rem' }}>
                    联系人 <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="text"
                    value={editingSupplier.contact || ''}
                    onChange={(e) => setEditingSupplier({...editingSupplier, contact: e.target.value})}
                    placeholder="联系人姓名"
                    style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '0.25rem' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.35rem', fontWeight: '600', fontSize: '0.85rem' }}>
                    联系电话 <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="text"
                    value={editingSupplier.phone || ''}
                    onChange={(e) => setEditingSupplier({...editingSupplier, phone: e.target.value})}
                    placeholder="手机号码"
                    style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '0.25rem' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.35rem', fontWeight: '600', fontSize: '0.85rem' }}>
                  地址
                </label>
                <input
                  type="text"
                  value={editingSupplier.address || ''}
                  onChange={(e) => setEditingSupplier({...editingSupplier, address: e.target.value})}
                  placeholder="详细地址"
                  style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '0.25rem' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.35rem', fontWeight: '600', fontSize: '0.85rem' }}>
                  状态
                </label>
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      checked={editingSupplier.status === 'active'}
                      onChange={() => setEditingSupplier({...editingSupplier, status: 'active'})}
                    />
                    <span>✅ 合作中</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      checked={editingSupplier.status === 'inactive'}
                      onChange={() => setEditingSupplier({...editingSupplier, status: 'inactive'})}
                    />
                    <span>⏸️ 已停用</span>
                  </label>
                </div>
              </div>

              {editingSupplier.id && editingSupplier.balance !== undefined && (
                <div style={{ padding: '0.75rem', backgroundColor: '#f9fafb', borderRadius: '0.375rem' }}>
                  <div style={{ fontSize: '0.85rem', color: '#6b7280', marginBottom: '0.25rem' }}>当前欠款余额</div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: editingSupplier.balance > 0 ? '#dc2626' : '#059669' }}>
                    ¥{editingSupplier.balance.toFixed(2)}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.25rem' }}>
                    欠款余额不可直接修改，请通过采购单或还款操作调整
                  </div>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setEditingSupplier({});
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
                onClick={handleSaveSupplier}
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
                {editingSupplier.id ? '💾 保存修改' : '✅ 确认添加'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 还款弹窗 */}
      {showPaymentModal && selectedOrder && (
        <div style={styles.modal} onClick={() => setShowPaymentModal(false)}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: '600', marginBottom: '1rem' }}>
              💰 按票号还款
            </h3>
            
            <div style={{ marginBottom: '1rem', padding: '1rem', backgroundColor: '#f9fafb', borderRadius: '0.375rem' }}>
              <div style={{ fontSize: '0.9rem', color: '#6b7280', marginBottom: '0.5rem' }}>
                供应商：{selectedOrder.supplierName}
              </div>
              <div style={{ fontSize: '0.9rem', color: '#6b7280', marginBottom: '0.5rem' }}>
                票号/订单号：<span style={{ fontWeight: '600', color: '#1f2937', fontSize: '1.1rem' }}>🎫 {selectedOrder.orderNumber}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem', marginTop: '0.75rem' }}>
                <div style={{ textAlign: 'center', padding: '0.5rem', backgroundColor: 'white', borderRadius: '0.25rem' }}>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>订单总额</div>
                  <div style={{ fontSize: '1rem', fontWeight: 'bold', color: '#1f2937' }}>¥{selectedOrder.totalAmount.toFixed(2)}</div>
                </div>
                <div style={{ textAlign: 'center', padding: '0.5rem', backgroundColor: 'white', borderRadius: '0.25rem' }}>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>已付金额</div>
                  <div style={{ fontSize: '1rem', fontWeight: 'bold', color: '#059669' }}>¥{selectedOrder.paidAmount.toFixed(2)}</div>
                </div>
                <div style={{ textAlign: 'center', padding: '0.5rem', backgroundColor: '#fef3c7', borderRadius: '0.25rem' }}>
                  <div style={{ fontSize: '0.75rem', color: '#92400e' }}>剩余欠款</div>
                  <div style={{ fontSize: '1rem', fontWeight: 'bold', color: '#dc2626' }}>¥{(selectedOrder.totalAmount - selectedOrder.paidAmount).toFixed(2)}</div>
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.35rem', fontWeight: '600', fontSize: '0.85rem' }}>
                  还款金额 (¥) <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={paymentForm.amount}
                  onChange={(e) => setPaymentForm({...paymentForm, amount: e.target.value})}
                  placeholder="输入还款金额"
                  max={selectedOrder.totalAmount - selectedOrder.paidAmount}
                  style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '0.25rem', fontSize: '1rem' }}
                />
                <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                  最大可还：¥{(selectedOrder.totalAmount - selectedOrder.paidAmount).toFixed(2)}
                </div>
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.35rem', fontWeight: '600', fontSize: '0.85rem' }}>
                  支付方式
                </label>
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      checked={paymentForm.paymentMethod === 'cash'}
                      onChange={() => setPaymentForm({...paymentForm, paymentMethod: 'cash'})}
                    />
                    <span>💵 现金</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      checked={paymentForm.paymentMethod === 'transfer'}
                      onChange={() => setPaymentForm({...paymentForm, paymentMethod: 'transfer'})}
                    />
                    <span>🏦 转账</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      checked={paymentForm.paymentMethod === 'check'}
                      onChange={() => setPaymentForm({...paymentForm, paymentMethod: 'check'})}
                    />
                    <span>📝 支票</span>
                  </label>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.35rem', fontWeight: '600', fontSize: '0.85rem' }}>
                  备注
                </label>
                <textarea
                  value={paymentForm.notes}
                  onChange={(e) => setPaymentForm({...paymentForm, notes: e.target.value})}
                  placeholder="可选填写备注信息"
                  rows={3}
                  style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '0.25rem', resize: 'vertical' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
              <button
                onClick={() => {
                  setShowPaymentModal(false);
                  setPaymentForm({
                    amount: '',
                    paymentMethod: 'cash',
                    notes: ''
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
                onClick={handlePayment}
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
                ✅ 确认还款
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* 🖨️ 打印选择弹窗 */}
      {showPrintModal && selectedSupplierForPrint && (
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
        }} onClick={() => setShowPrintModal(false)}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '0.5rem',
            padding: '1.5rem',
            width: '500px'
          }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: '600', marginBottom: '1rem' }}>
              🖨️ 打印对账单
            </h3>
            
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>
                供应商：{selectedSupplierForPrint.name}
              </label>
            </div>
            
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>
                请选择要打印的票号：
              </label>
              
              <div style={{ marginBottom: '0.75rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    checked={printOrderNumber === 'all'}
                    onChange={() => setPrintOrderNumber('all')}
                  />
                  <span>📋 全部票号</span>
                </label>
              </div>
              
              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', marginBottom: '0.5rem' }}>
                  <input
                    type="radio"
                    checked={printOrderNumber !== 'all'}
                    onChange={() => {
                      const orders = getSupplierOrders(selectedSupplierForPrint.id);
                      if (orders.length > 0) {
                        setPrintOrderNumber(orders[0].orderNumber);
                      }
                    }}
                  />
                  <span>🎫 指定票号</span>
                </label>
                
                {printOrderNumber !== 'all' && (
                  <select
                    value={printOrderNumber}
                    onChange={(e) => setPrintOrderNumber(e.target.value)}
                    style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '0.25rem', marginTop: '0.5rem' }}
                  >
                    {getSupplierOrders(selectedSupplierForPrint.id).map(order => (
                      <option key={order.id} value={order.orderNumber}>{order.orderNumber}</option>
                    ))}
                  </select>
                )}
              </div>
            </div>
            
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowPrintModal(false)}
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
                onClick={executePrint}
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
                🖨️ 打印
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SupplierManagement;
