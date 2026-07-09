import React, { useMemo, useState } from 'react';
import { useAppContext } from '../../contexts/AppContext';
import { dataManager } from '../../services/dataManager';
import { dataService } from '../../services/DataService';
import { smartAddDocument, smartDeleteDocument, smartGetDocuments, smartUpdateDocument } from '../../services/smartSyncService';
import { getLocalDateString } from '../../utils/exchangeRate';
import { colors, font, radii, shadows } from '../../styles/uiTokens';
import {
  SupplierRecord,
  PurchaseOrderRecord,
  SupplierPaymentRecord,
  buildSupplierAccountSnapshot,
  buildSupplierLedgerEntries,
  filterSupplierOrdersByDateRange,
  filterSupplierPaymentsByDateRange,
  formatSupplierDate,
  getCurrentMonthSupplierRange,
  getPurchasePaidAmount,
  getPurchaseRemainingDebt,
  getSupplierOrders,
  getSupplierPayments,
  summarizeSupplierLedgerEntries,
  getUnpaidPurchaseOrders
} from './supplierLedger';

type PaymentMethod = 'cash' | 'transfer' | 'check';

const paymentMethodLabels: Record<PaymentMethod, string> = {
  cash: '现金',
  transfer: '转账',
  check: '支票'
};

const saveStoreCollection = (collectionName: string, data: any[]) => {
  const storeId = dataService.getCurrentStoreId();
  const storageKey = storeId ? `store_${storeId}_${collectionName}` : collectionName;
  localStorage.setItem(storageKey, JSON.stringify(data));
};

const money = (value: number): string => `C$ ${value.toFixed(2)}`;

const normalizePayment = (payment: any): SupplierPaymentRecord => ({
  ...payment,
  amount: Number(payment.amount) || 0,
  paymentDate: payment.paymentDate ? new Date(payment.paymentDate) : payment.createdAt || new Date()
});

const getPreviousMonthRange = () => {
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const lastDay = new Date(today.getFullYear(), today.getMonth(), 0);
  return {
    startDate: getLocalDateString(firstDay),
    endDate: getLocalDateString(lastDay)
  };
};

const getLastDaysRange = (days: number) => {
  const today = new Date();
  const start = new Date(today);
  start.setDate(today.getDate() - days + 1);
  return {
    startDate: getLocalDateString(start),
    endDate: getLocalDateString(today)
  };
};

const printSupplierStatement = (
  supplier: SupplierRecord,
  orders: PurchaseOrderRecord[],
  payments: SupplierPaymentRecord[],
  periodLabel: string
) => {
  const snapshot = buildSupplierAccountSnapshot(supplier, orders, payments);
  const ledger = buildSupplierLedgerEntries(orders, payments);
  const printWindow = window.open('', '_blank');

  if (!printWindow) {
    alert('请允许弹出窗口以生成供应商账单');
    return;
  }

  const orderRows = orders.map(order => {
    const remaining = getPurchaseRemainingDebt(order);
    return `
      <tr>
        <td>${formatSupplierDate(order.orderDate || order.receivedDate || order.createdAt)}</td>
        <td>${order.orderNumber || order.id}</td>
        <td>${order.paymentType === 'cash' ? '现付' : '欠款'}</td>
        <td class="amount">${money(Number(order.totalAmount || 0))}</td>
        <td class="amount">${money(getPurchasePaidAmount(order))}</td>
        <td class="amount">${money(remaining)}</td>
      </tr>
    `;
  }).join('');

  const ledgerRows = ledger.map(entry => `
    <tr>
      <td>${entry.dateKey}</td>
      <td><span class="badge ${entry.kind}">${entry.label}</span></td>
      <td>${entry.title}</td>
      <td>${entry.detail}</td>
      <td class="amount">${money(entry.amount)}</td>
      <td class="amount">${money(entry.paidAmount)}</td>
      <td class="amount">${money(entry.remainingDebt)}</td>
    </tr>
  `).join('');

  printWindow.document.write(`
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>供应商对账单 - ${supplier.name}</title>
        <style>
          * { box-sizing: border-box; }
          body { margin: 0; padding: 24px; color: #111827; font-family: "Microsoft YaHei", Arial, sans-serif; font-size: 12px; }
          .header { display: flex; justify-content: space-between; gap: 24px; border-bottom: 2px solid #111827; padding-bottom: 14px; margin-bottom: 16px; }
          h1 { margin: 0; font-size: 22px; }
          .muted { color: #64748b; margin-top: 5px; }
          .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 14px 0; }
          .box { border: 1px solid #dbe3ef; border-radius: 8px; padding: 10px; }
          .label { color: #64748b; font-size: 11px; }
          .value { font-size: 17px; font-weight: 800; margin-top: 4px; }
          .section-title { font-size: 15px; font-weight: 800; margin: 18px 0 8px; }
          table { width: 100%; border-collapse: collapse; }
          th, td { border-bottom: 1px solid #e5e7eb; padding: 7px 8px; text-align: left; vertical-align: top; }
          th { background: #f8fafc; color: #475569; font-size: 11px; }
          .amount { text-align: right; white-space: nowrap; font-family: Consolas, monospace; }
          .badge { display: inline-block; padding: 2px 7px; border-radius: 999px; font-size: 11px; font-weight: 700; }
          .badge.purchase { background: #fff7ed; color: #c2410c; }
          .badge.payment { background: #ecfdf5; color: #047857; }
          .no-print { margin-top: 18px; text-align: center; }
          button { border: 0; border-radius: 8px; background: #2563eb; color: white; padding: 10px 24px; font-weight: 800; cursor: pointer; }
          @media print {
            body { padding: 0; }
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <h1>供应商对账单</h1>
            <div class="muted">${supplier.name} · ${supplier.contact || '-'} · ${supplier.phone || '-'}</div>
            <div class="muted">账单期间：${periodLabel}</div>
          </div>
          <div class="muted">打印日期：${getLocalDateString()}</div>
        </div>
        <div class="summary">
          <div class="box"><div class="label">采购总额</div><div class="value">${money(snapshot.totalPurchase)}</div></div>
          <div class="box"><div class="label">已付金额</div><div class="value">${money(snapshot.totalPaid)}</div></div>
          <div class="box"><div class="label">剩余欠款</div><div class="value">${money(snapshot.totalDebt)}</div></div>
          <div class="box"><div class="label">未清单数</div><div class="value">${snapshot.unpaidOrderCount}</div></div>
        </div>
        <div class="section-title">采购单汇总</div>
        <table>
          <thead>
            <tr><th>日期</th><th>单号</th><th>方式</th><th class="amount">总额</th><th class="amount">已付</th><th class="amount">剩余欠款</th></tr>
          </thead>
          <tbody>${orderRows || '<tr><td colspan="6">暂无采购记录</td></tr>'}</tbody>
        </table>
        <div class="section-title">业务流水</div>
        <table>
          <thead>
            <tr><th>日期</th><th>类型</th><th>单号</th><th>明细</th><th class="amount">总额</th><th class="amount">已付/还款</th><th class="amount">剩余</th></tr>
          </thead>
          <tbody>${ledgerRows || '<tr><td colspan="7">暂无业务流水</td></tr>'}</tbody>
        </table>
        <div class="no-print"><button onclick="window.print()">打印账单</button></div>
      </body>
    </html>
  `);
  printWindow.document.close();
};

const SupplierWorkbench: React.FC = () => {
  const { suppliers, setSuppliers, purchaseOrders, setPurchaseOrders } = useAppContext();
  const [payments, setPayments] = useState<SupplierPaymentRecord[]>([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>('');
  const [searchText, setSearchText] = useState('');
  const [debtFilter, setDebtFilter] = useState<'all' | 'debt' | 'settled'>('all');
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Partial<SupplierRecord> | null>(null);
  const [paymentOrder, setPaymentOrder] = useState<PurchaseOrderRecord | null>(null);
  const [paymentForm, setPaymentForm] = useState({ amount: '', paymentMethod: 'cash' as PaymentMethod, notes: '' });
  const [dateRange, setDateRange] = useState(() => getCurrentMonthSupplierRange());

  const allSuppliers = suppliers as SupplierRecord[];
  const allOrders = purchaseOrders as PurchaseOrderRecord[];

  const supplierSummaries = useMemo(() => {
    return allSuppliers.map(supplier => ({
      supplier,
      summary: buildSupplierAccountSnapshot(supplier, allOrders, payments)
    }));
  }, [allSuppliers, allOrders, payments]);

  const filteredSuppliers = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();
    return supplierSummaries.filter(({ supplier, summary }) => {
      const textMatch = !keyword || [supplier.name, supplier.contact, supplier.phone]
        .filter(Boolean)
        .some(value => String(value).toLowerCase().includes(keyword));
      const debtMatch =
        debtFilter === 'all' ||
        (debtFilter === 'debt' && summary.totalDebt > 0) ||
        (debtFilter === 'settled' && summary.totalDebt <= 0);
      return textMatch && debtMatch;
    });
  }, [supplierSummaries, searchText, debtFilter]);

  const selectedSupplier = filteredSuppliers.find(item => item.supplier.id === selectedSupplierId)?.supplier
    || filteredSuppliers[0]?.supplier
    || null;
  const selectedOrders = selectedSupplier ? getSupplierOrders(selectedSupplier.id, allOrders) : [];
  const selectedPayments = selectedSupplier ? getSupplierPayments(selectedSupplier.id, payments) : [];
  const periodOrders = filterSupplierOrdersByDateRange(selectedOrders, dateRange);
  const periodPayments = filterSupplierPaymentsByDateRange(selectedPayments, dateRange);
  const selectedSummary = selectedSupplier
    ? buildSupplierAccountSnapshot(selectedSupplier, allOrders, payments)
    : null;
  const selectedLedger = buildSupplierLedgerEntries(periodOrders, periodPayments);
  const periodSummary = summarizeSupplierLedgerEntries(selectedLedger);
  const unpaidOrders = getUnpaidPurchaseOrders(selectedOrders);
  const totalDebt = supplierSummaries.reduce((sum, row) => sum + row.summary.totalDebt, 0);
  const suppliersWithDebt = supplierSummaries.filter(row => row.summary.totalDebt > 0).length;
  const periodLabel = `${dateRange.startDate || '不限'} 至 ${dateRange.endDate || '不限'}`;

  const refresh = async () => {
    setIsRefreshing(true);
    try {
      const [cloudSuppliers, cloudOrders, cloudPayments] = await Promise.all([
        smartGetDocuments('suppliers', true),
        smartGetDocuments('purchase_orders', true),
        smartGetDocuments('supplier_payments', true)
      ]);
      const normalizedPayments = cloudPayments.map(normalizePayment);
      setSuppliers(cloudSuppliers as any);
      setPurchaseOrders(cloudOrders as any);
      setPayments(normalizedPayments);
      saveStoreCollection('suppliers', cloudSuppliers);
      saveStoreCollection('purchase_orders', cloudOrders);
      saveStoreCollection('supplier_payments', normalizedPayments);
      setLastSyncedAt(new Date());
    } catch (error) {
      console.error('供应商模块刷新失败:', error);
      alert('刷新供应商数据失败，请检查网络后重试');
    } finally {
      setIsRefreshing(false);
    }
  };

  const openNewSupplier = () => {
    setEditingSupplier({ status: 'active' });
  };

  const saveSupplier = async () => {
    if (!editingSupplier?.name?.trim()) {
      alert('请填写供应商名称');
      return;
    }
    setIsSaving(true);
    try {
      const now = Date.now();
      const supplierData: SupplierRecord = {
        id: editingSupplier.id || `supplier-${now}`,
        name: editingSupplier.name.trim(),
        contact: editingSupplier.contact || '',
        phone: editingSupplier.phone || '',
        address: editingSupplier.address || '',
        status: editingSupplier.status || 'active',
        balance: editingSupplier.id && selectedSummary ? selectedSummary.totalDebt : 0,
        lastUpdated: new Date(),
        lastModified: now
      };

      if (editingSupplier.id) {
        await smartUpdateDocument('suppliers', supplierData.id, supplierData);
        setSuppliers(prev => prev.map(item => item.id === supplierData.id ? supplierData as any : item));
      } else {
        await smartAddDocument('suppliers', supplierData);
        setSuppliers(prev => [...prev, supplierData as any]);
        setSelectedSupplierId(supplierData.id);
      }

      setEditingSupplier(null);
    } catch (error) {
      console.error('保存供应商失败:', error);
      alert('保存供应商失败，请检查网络后重试');
    } finally {
      setIsSaving(false);
    }
  };

  const deleteSupplier = async () => {
    if (!selectedSupplier || !selectedSummary) return;
    if (selectedSummary.totalDebt > 0) {
      alert(`该供应商还有欠款 ${money(selectedSummary.totalDebt)}，不能删除`);
      return;
    }
    if (!window.confirm(`确定删除供应商 ${selectedSupplier.name}？`)) return;

    setIsSaving(true);
    try {
      await smartDeleteDocument('suppliers', selectedSupplier.id);
      setSuppliers(prev => prev.filter(item => item.id !== selectedSupplier.id));
      setSelectedSupplierId('');
    } catch (error) {
      console.error('删除供应商失败:', error);
      alert('删除供应商失败，请检查网络后重试');
    } finally {
      setIsSaving(false);
    }
  };

  const openPayment = (order: PurchaseOrderRecord) => {
    setPaymentOrder(order);
    setPaymentForm({
      amount: getPurchaseRemainingDebt(order).toFixed(2),
      paymentMethod: 'cash',
      notes: ''
    });
  };

  const submitPayment = async () => {
    if (!paymentOrder) return;
    const amount = Number(paymentForm.amount);
    const remaining = getPurchaseRemainingDebt(paymentOrder);
    if (!Number.isFinite(amount) || amount <= 0) {
      alert('请输入正确的还款金额');
      return;
    }
    if (amount > remaining) {
      alert(`还款金额不能超过剩余欠款 ${money(remaining)}`);
      return;
    }

    setIsSaving(true);
    try {
      const now = Date.now();
      const newPaidAmount = getPurchasePaidAmount(paymentOrder) + amount;
      const updatedOrder = {
        ...paymentOrder,
        paidAmount: newPaidAmount,
        status: getPurchaseRemainingDebt({ ...paymentOrder, paidAmount: newPaidAmount }) <= 0 ? 'completed' : 'partial',
        lastModified: now
      };
      const nextOrders = allOrders.map(order => order.id === paymentOrder.id ? updatedOrder : order);
      const paymentId = `supplier-payment-${now}`;
      const paymentRecord: SupplierPaymentRecord = {
        id: paymentId,
        orderId: paymentOrder.id,
        orderNumber: paymentOrder.orderNumber,
        supplierId: paymentOrder.supplierId,
        supplierName: paymentOrder.supplierName,
        amount,
        paymentDate: new Date(),
        paymentMethod: paymentForm.paymentMethod,
        notes: paymentForm.notes
      };
      const relatedSupplier = allSuppliers.find(supplier => supplier.id === paymentOrder.supplierId);
      const updatedSupplier = relatedSupplier ? {
        ...relatedSupplier,
        balance: buildSupplierAccountSnapshot(relatedSupplier, nextOrders, [...payments, paymentRecord]).totalDebt,
        lastUpdated: new Date(),
        lastModified: now
      } : null;
      const paymentExpense = {
        id: `expense_supplier_payment_${now}`,
        date: getLocalDateString(),
        categoryId: 'supplier_payment',
        categoryName: '供应商货款',
        amount,
        description: `供应商还款 - ${paymentOrder.supplierName || ''} (${paymentOrder.orderNumber || paymentOrder.id})`,
        type: 'purchase',
        supplierId: paymentOrder.supplierId,
        supplierName: paymentOrder.supplierName,
        supplierPaymentId: paymentId,
        purchaseOrderId: paymentOrder.id,
        relatedType: 'supplier_repayment',
        orderNumber: paymentOrder.orderNumber,
        createdAt: getLocalDateString()
      };

      await smartUpdateDocument('purchase_orders', paymentOrder.id, updatedOrder);
      await smartAddDocument('supplier_payments', paymentRecord);
      if (updatedSupplier) {
        await smartUpdateDocument('suppliers', updatedSupplier.id, updatedSupplier);
      }
      await smartAddDocument('expenses', paymentExpense);

      setPurchaseOrders(nextOrders as any);
      setPayments(prev => [...prev, paymentRecord]);
      if (updatedSupplier) {
        setSuppliers(prev => prev.map(item => item.id === updatedSupplier.id ? updatedSupplier as any : item));
      }
      const nextExpenses = [...dataManager.getData('expenses'), paymentExpense];
      await dataManager.saveData('expenses', nextExpenses, { syncFirestore: false });
      setPaymentOrder(null);
    } catch (error) {
      console.error('供应商还款失败:', error);
      alert('供应商还款失败，请检查网络后重试');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="supplier-new-module" data-new-supplier-module="true">
      <style>{`
        .supplier-new-module {
          min-height: 100%;
          background: #f5f7fb;
          color: ${colors.textPrimary};
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .supplier-head {
          display: flex;
          justify-content: space-between;
          gap: 16px;
          align-items: flex-start;
          padding: 18px 20px 12px;
          border-bottom: 1px solid ${colors.border};
          background: rgba(255,255,255,0.92);
        }
        .supplier-actions {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          justify-content: flex-end;
        }
        .supplier-metrics {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 12px;
          padding: 14px 20px 0;
        }
        .supplier-layout {
          display: grid;
          grid-template-columns: minmax(280px, 0.9fr) minmax(480px, 1.7fr) minmax(260px, 0.85fr);
          gap: 14px;
          min-height: 0;
          flex: 1;
          padding: 14px 20px 20px;
        }
        .supplier-panel {
          min-height: 0;
          overflow: auto;
          background: ${colors.surface};
          border: 1px solid ${colors.border};
          border-radius: ${radii.lg};
          box-shadow: ${shadows.soft};
          padding: 14px;
        }
        .supplier-card-button {
          width: 100%;
          text-align: left;
          border: 1px solid ${colors.border};
          background: ${colors.surface};
          border-radius: ${radii.lg};
          padding: 12px;
          cursor: pointer;
        }
        .supplier-card-button.selected {
          border-color: ${colors.blue};
          background: ${colors.blueSoft};
          box-shadow: 0 10px 24px rgba(37, 99, 235, 0.12);
        }
        .supplier-button {
          border: 0;
          border-radius: ${radii.md};
          padding: 10px 14px;
          font-weight: 800;
          cursor: pointer;
          color: #fff;
        }
        .supplier-button:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }
        .supplier-outline {
          border: 1px solid ${colors.borderStrong};
          background: ${colors.surface};
          color: ${colors.textPrimary};
        }
        .supplier-input {
          width: 100%;
          border: 1px solid ${colors.border};
          border-radius: ${radii.md};
          padding: 10px 12px;
          font-size: ${font.body};
          background: #fff;
        }
        .supplier-kpi {
          background: ${colors.surface};
          border: 1px solid ${colors.border};
          border-radius: ${radii.lg};
          box-shadow: ${shadows.soft};
          padding: 14px;
          min-height: 76px;
          border-top: 3px solid var(--accent);
        }
        .supplier-datebar {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
          padding: 12px;
          border: 1px solid ${colors.border};
          border-radius: ${radii.lg};
          background: ${colors.surfaceMuted};
        }
        .supplier-quick-range {
          border: 1px solid ${colors.border};
          border-radius: ${radii.pill};
          background: #fff;
          color: ${colors.textPrimary};
          padding: 7px 10px;
          font-weight: 800;
          cursor: pointer;
        }
        .supplier-period-metrics {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 10px;
        }
        .supplier-modal-bg {
          position: fixed;
          inset: 0;
          background: rgba(15, 23, 42, 0.42);
          z-index: 1000;
          display: grid;
          place-items: center;
          padding: 18px;
        }
        .supplier-modal {
          width: min(560px, 100%);
          max-height: 90vh;
          overflow: auto;
          background: white;
          border-radius: ${radii.lg};
          box-shadow: ${shadows.lift};
          padding: 18px;
        }
        @media (max-width: 1180px) {
          .supplier-new-module { overflow: auto; }
          .supplier-head { flex-direction: column; }
          .supplier-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .supplier-layout { grid-template-columns: 1fr; overflow: visible; }
          .supplier-panel { overflow: visible; }
        }
        @media (max-width: 560px) {
          .supplier-metrics { grid-template-columns: 1fr; }
          .supplier-datebar,
          .supplier-period-metrics { grid-template-columns: 1fr; }
          .supplier-head, .supplier-metrics, .supplier-layout { padding-left: 12px; padding-right: 12px; }
        }
      `}</style>

      <header className="supplier-head">
        <div>
          <h2 style={{ margin: 0, fontSize: font.title, fontWeight: 850 }}>供应商账款中心</h2>
          <div style={{ marginTop: 6, color: colors.textSecondary }}>围绕供应商管理采购、欠款、付款流水和账单生成</div>
        </div>
        <div className="supplier-actions">
          {lastSyncedAt && (
            <span style={{ alignSelf: 'center', color: colors.textSecondary, fontSize: font.caption }}>
              已刷新 {lastSyncedAt.toLocaleTimeString('zh-CN', { hour12: false })}
            </span>
          )}
          <button className="supplier-button" style={{ background: colors.blue }} onClick={refresh} disabled={isRefreshing}>
            {isRefreshing ? '刷新中...' : '刷新'}
          </button>
          <button className="supplier-button" style={{ background: colors.teal }} onClick={openNewSupplier}>
            新增供应商
          </button>
        </div>
      </header>

      <section className="supplier-metrics">
        {[
          { label: '供应商', value: String(allSuppliers.length), accent: colors.blue },
          { label: '有欠款', value: String(suppliersWithDebt), accent: colors.amber },
          { label: '总欠款', value: money(totalDebt), accent: colors.danger },
          { label: '付款流水', value: String(payments.length), accent: colors.success }
        ].map(item => (
          <div key={item.label} className="supplier-kpi" style={{ '--accent': item.accent } as React.CSSProperties}>
            <div style={{ color: colors.textSecondary, fontSize: font.caption, fontWeight: 800 }}>{item.label}</div>
            <div style={{ color: item.accent, fontSize: '1.4rem', fontWeight: 900, marginTop: 6 }}>{item.value}</div>
          </div>
        ))}
      </section>

      <main className="supplier-layout">
        <aside className="supplier-panel">
          <div style={{ display: 'grid', gap: 10 }}>
            <div>
              <div style={{ fontSize: font.section, fontWeight: 850 }}>供应商列表</div>
              <div style={{ color: colors.textSecondary, fontSize: font.caption, marginTop: 4 }}>按供应商进入账款视图</div>
            </div>
            <input className="supplier-input" value={searchText} onChange={event => setSearchText(event.target.value)} placeholder="搜索名称、联系人、电话" />
            <select className="supplier-input" value={debtFilter} onChange={event => setDebtFilter(event.target.value as any)}>
              <option value="all">全部供应商</option>
              <option value="debt">只看欠款</option>
              <option value="settled">只看已结清</option>
            </select>
            <div style={{ display: 'grid', gap: 8 }}>
              {filteredSuppliers.map(({ supplier, summary }) => (
                <button
                  key={supplier.id}
                  className={`supplier-card-button ${selectedSupplier?.id === supplier.id ? 'selected' : ''}`}
                  onClick={() => setSelectedSupplierId(supplier.id)}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                    <strong style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{supplier.name}</strong>
                    <span style={{
                      color: summary.totalDebt > 0 ? colors.danger : colors.success,
                      background: summary.totalDebt > 0 ? colors.dangerSoft : colors.successSoft,
                      borderRadius: radii.pill,
                      padding: '2px 8px',
                      fontSize: '0.72rem',
                      fontWeight: 800,
                      whiteSpace: 'nowrap'
                    }}>
                      {summary.totalDebt > 0 ? '欠款' : '结清'}
                    </span>
                  </div>
                  <div style={{ color: colors.textSecondary, fontSize: font.caption, marginTop: 5 }}>{supplier.contact || '-'} · {supplier.phone || '-'}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
                    <span style={{ color: colors.textSecondary }}>余额</span>
                    <strong style={{ color: summary.totalDebt > 0 ? colors.danger : colors.success }}>{money(summary.totalDebt)}</strong>
                  </div>
                </button>
              ))}
              {filteredSuppliers.length === 0 && (
                <div style={{ color: colors.textMuted, textAlign: 'center', padding: '28px 8px' }}>暂无供应商</div>
              )}
            </div>
          </div>
        </aside>

        <section className="supplier-panel" data-supplier-ledger-workspace="true">
          {selectedSupplier && selectedSummary ? (
            <div style={{ display: 'grid', gap: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ color: colors.textSecondary, fontWeight: 800, fontSize: font.caption }}>当前供应商</div>
                  <h3 style={{ margin: '4px 0', fontSize: '1.45rem' }}>{selectedSupplier.name}</h3>
                  <div style={{ color: colors.textSecondary }}>{selectedSupplier.contact || '-'} · {selectedSupplier.phone || '-'}{selectedSupplier.address ? ` · ${selectedSupplier.address}` : ''}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ color: colors.textSecondary, fontWeight: 800, fontSize: font.caption }}>当前剩余欠款</div>
                  <div style={{ fontSize: '2rem', fontWeight: 900, color: selectedSummary.totalDebt > 0 ? colors.danger : colors.success }}>
                    {money(selectedSummary.totalDebt)}
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10 }}>
                {[
                  ['采购单', selectedSummary.purchaseCount],
                  ['挂账单', selectedSummary.creditOrderCount],
                  ['未清单', selectedSummary.unpaidOrderCount],
                  ['还款笔数', selectedSummary.repaymentCount]
                ].map(([label, value]) => (
                  <div key={String(label)} style={{ border: `1px solid ${colors.border}`, borderRadius: radii.md, background: colors.surfaceMuted, padding: 10 }}>
                    <div style={{ color: colors.textSecondary, fontSize: font.caption }}>{label}</div>
                    <strong>{value}</strong>
                  </div>
                ))}
              </div>

              <section className="supplier-datebar" data-supplier-date-filter="true">
                <div>
                  <div style={{ color: colors.textSecondary, fontSize: font.caption, fontWeight: 800, marginBottom: 6 }}>账单开始日期</div>
                  <input
                    className="supplier-input"
                    type="date"
                    value={dateRange.startDate}
                    onChange={event => setDateRange(prev => ({ ...prev, startDate: event.target.value }))}
                  />
                </div>
                <div>
                  <div style={{ color: colors.textSecondary, fontSize: font.caption, fontWeight: 800, marginBottom: 6 }}>账单结束日期</div>
                  <input
                    className="supplier-input"
                    type="date"
                    value={dateRange.endDate}
                    onChange={event => setDateRange(prev => ({ ...prev, endDate: event.target.value }))}
                  />
                </div>
                <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button className="supplier-quick-range" onClick={() => setDateRange({ startDate: getLocalDateString(), endDate: getLocalDateString() })}>今天</button>
                  <button className="supplier-quick-range" onClick={() => setDateRange(getCurrentMonthSupplierRange())}>本月</button>
                  <button className="supplier-quick-range" onClick={() => setDateRange(getPreviousMonthRange())}>上月</button>
                  <button className="supplier-quick-range" onClick={() => setDateRange(getLastDaysRange(30))}>近30天</button>
                </div>
              </section>

              <section className="supplier-period-metrics" data-supplier-period-summary="true">
                {[
                  ['期间采购', money(periodSummary.purchaseAmount)],
                  ['期间付款', money(periodSummary.paymentAmount)],
                  ['采购单数', periodSummary.purchaseCount],
                  ['付款笔数', periodSummary.paymentCount]
                ].map(([label, value]) => (
                  <div key={String(label)} style={{ border: `1px solid ${colors.border}`, borderRadius: radii.md, background: '#fff', padding: 10 }}>
                    <div style={{ color: colors.textSecondary, fontSize: font.caption }}>{label}</div>
                    <strong>{value}</strong>
                  </div>
                ))}
              </section>

              <section>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 8 }}>
                  <h3 style={{ margin: 0, fontSize: font.section }}>未清采购单</h3>
                  <span style={{ color: colors.textSecondary, fontSize: font.caption }}>只显示真正有剩余欠款的单据</span>
                </div>
                <div style={{ display: 'grid', gap: 8 }}>
                  {unpaidOrders.map(order => (
                    <div key={order.id} style={{ border: '1px solid #fed7aa', background: '#fff7ed', borderRadius: radii.lg, padding: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                        <strong>{order.orderNumber || order.id}</strong>
                        <strong style={{ color: colors.danger }}>{money(getPurchaseRemainingDebt(order))}</strong>
                      </div>
                      <div style={{ color: colors.textSecondary, fontSize: font.caption, marginTop: 5 }}>
                        {formatSupplierDate(order.orderDate || order.receivedDate || order.createdAt)} · 总额 {money(Number(order.totalAmount || 0))} · 已付 {money(getPurchasePaidAmount(order))}
                      </div>
                      <button className="supplier-button" style={{ background: colors.teal, marginTop: 8, padding: '7px 10px' }} onClick={() => openPayment(order)}>
                        还款
                      </button>
                    </div>
                  ))}
                  {unpaidOrders.length === 0 && (
                    <div style={{ color: colors.textMuted, background: colors.surfaceMuted, border: `1px solid ${colors.border}`, borderRadius: radii.lg, padding: 14 }}>
                      当前供应商没有未清采购单。
                    </div>
                  )}
                </div>
              </section>

              <section data-supplier-ledger-timeline="true">
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
                  <h3 style={{ margin: 0, fontSize: font.section }}>账务流水</h3>
                  <span style={{ color: colors.textSecondary, fontSize: font.caption }}>{periodLabel}</span>
                </div>
                <div style={{ display: 'grid', gap: 8 }}>
                  {selectedLedger.map(entry => (
                    <div key={entry.id} style={{ display: 'grid', gridTemplateColumns: '82px 1fr auto', gap: 12, alignItems: 'center', border: `1px solid ${colors.border}`, borderRadius: radii.md, padding: 10 }}>
                      <div style={{ color: colors.textSecondary, fontSize: font.caption }}>{entry.dateKey}</div>
                      <div>
                        <strong>{entry.label} · {entry.title}</strong>
                        <div style={{ color: colors.textSecondary, fontSize: font.caption, marginTop: 3 }}>{entry.detail}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ color: entry.kind === 'payment' ? colors.success : colors.textPrimary, fontWeight: 850 }}>{money(entry.amount)}</div>
                        {entry.kind === 'purchase' && <div style={{ color: colors.textSecondary, fontSize: font.caption }}>余 {money(entry.remainingDebt)}</div>}
                      </div>
                    </div>
                  ))}
                  {selectedLedger.length === 0 && (
                    <div style={{ color: colors.textMuted, background: colors.surfaceMuted, border: `1px solid ${colors.border}`, borderRadius: radii.lg, padding: 14 }}>
                      当前日期范围内暂无账务流水。
                    </div>
                  )}
                </div>
              </section>
            </div>
          ) : (
            <div style={{ color: colors.textMuted, minHeight: 300, display: 'grid', placeItems: 'center' }}>请选择或新增供应商</div>
          )}
        </section>

        <aside className="supplier-panel" data-supplier-action-panel="true">
          <div style={{ display: 'grid', gap: 10 }}>
            <div>
              <div style={{ fontSize: font.section, fontWeight: 850 }}>操作区</div>
              <div style={{ color: colors.textSecondary, fontSize: font.caption, marginTop: 4 }}>围绕当前供应商处理资料和账款</div>
            </div>
            <button className="supplier-button" style={{ background: colors.teal }} onClick={openNewSupplier}>新增供应商</button>
            <button className="supplier-button supplier-outline" disabled={!selectedSupplier} onClick={() => selectedSupplier && setEditingSupplier(selectedSupplier)}>编辑资料</button>
            <button className="supplier-button supplier-outline" disabled={!selectedSupplier || unpaidOrders.length === 0} onClick={() => unpaidOrders[0] && openPayment(unpaidOrders[0])}>处理最近欠款</button>
            <button className="supplier-button supplier-outline" disabled={!selectedSupplier} onClick={() => selectedSupplier && printSupplierStatement(selectedSupplier, periodOrders, periodPayments, periodLabel)}>生成账单</button>
            <button className="supplier-button" style={{ background: colors.danger }} disabled={!selectedSupplier || isSaving} onClick={deleteSupplier}>删除供应商</button>
            {selectedSummary && (
              <div style={{ display: 'grid', gap: 8, border: `1px solid ${colors.border}`, borderRadius: radii.lg, padding: 12, background: colors.surfaceMuted }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: colors.textSecondary }}>最近采购</span><strong>{selectedSummary.lastPurchaseDate}</strong></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: colors.textSecondary }}>最近还款</span><strong>{selectedSummary.lastPaymentDate}</strong></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: colors.textSecondary }}>采购总额</span><strong>{money(selectedSummary.totalPurchase)}</strong></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: colors.textSecondary }}>已付金额</span><strong>{money(selectedSummary.totalPaid)}</strong></div>
              </div>
            )}
          </div>
        </aside>
      </main>

      {editingSupplier && (
        <div className="supplier-modal-bg" onClick={() => setEditingSupplier(null)}>
          <div className="supplier-modal" onClick={event => event.stopPropagation()}>
            <h3 style={{ margin: '0 0 14px', fontSize: font.section }}>{editingSupplier.id ? '编辑供应商' : '新增供应商'}</h3>
            <div style={{ display: 'grid', gap: 12 }}>
              <input className="supplier-input" placeholder="供应商名称" value={editingSupplier.name || ''} onChange={event => setEditingSupplier({ ...editingSupplier, name: event.target.value })} />
              <input className="supplier-input" placeholder="联系人" value={editingSupplier.contact || ''} onChange={event => setEditingSupplier({ ...editingSupplier, contact: event.target.value })} />
              <input className="supplier-input" placeholder="电话" value={editingSupplier.phone || ''} onChange={event => setEditingSupplier({ ...editingSupplier, phone: event.target.value })} />
              <input className="supplier-input" placeholder="地址" value={editingSupplier.address || ''} onChange={event => setEditingSupplier({ ...editingSupplier, address: event.target.value })} />
              <select className="supplier-input" value={editingSupplier.status || 'active'} onChange={event => setEditingSupplier({ ...editingSupplier, status: event.target.value as any })}>
                <option value="active">合作中</option>
                <option value="inactive">停用</option>
              </select>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
              <button className="supplier-button supplier-outline" onClick={() => setEditingSupplier(null)}>取消</button>
              <button className="supplier-button" style={{ background: colors.teal }} disabled={isSaving} onClick={saveSupplier}>{isSaving ? '保存中...' : '保存'}</button>
            </div>
          </div>
        </div>
      )}

      {paymentOrder && (
        <div className="supplier-modal-bg" onClick={() => setPaymentOrder(null)}>
          <div className="supplier-modal" onClick={event => event.stopPropagation()}>
            <h3 style={{ margin: '0 0 10px', fontSize: font.section }}>供应商还款</h3>
            <div style={{ color: colors.textSecondary, marginBottom: 12 }}>
              {paymentOrder.supplierName} · {paymentOrder.orderNumber || paymentOrder.id} · 剩余 {money(getPurchaseRemainingDebt(paymentOrder))}
            </div>
            <div style={{ display: 'grid', gap: 12 }}>
              <input className="supplier-input" type="number" min="0" step="0.01" value={paymentForm.amount} onChange={event => setPaymentForm({ ...paymentForm, amount: event.target.value })} />
              <select className="supplier-input" value={paymentForm.paymentMethod} onChange={event => setPaymentForm({ ...paymentForm, paymentMethod: event.target.value as PaymentMethod })}>
                {Object.entries(paymentMethodLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              <textarea className="supplier-input" rows={3} placeholder="备注" value={paymentForm.notes} onChange={event => setPaymentForm({ ...paymentForm, notes: event.target.value })} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
              <button className="supplier-button supplier-outline" onClick={() => setPaymentOrder(null)}>取消</button>
              <button className="supplier-button" style={{ background: colors.teal }} disabled={isSaving} onClick={submitPayment}>{isSaving ? '提交中...' : '确认还款'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SupplierWorkbench;
