import React, { useMemo, useRef, useState } from 'react';
import { useAppContext } from '../../contexts/AppContext';
import { dataManager } from '../../services/dataManager';
import { dataService } from '../../services/DataService';
import { smartAddDocument, smartDeleteDocument, smartGetDocuments, smartGetDocumentsWhereEqual, smartUpdateDocument } from '../../services/smartSyncService';
import { getLocalDateString } from '../../utils/exchangeRate';
import { colors, font, radii, shadows } from '../../styles/uiTokens';
import { useI18n } from '../../i18n/I18nContext';
import type { TranslationKey } from '../../i18n/translations';
import {
  SupplierRecord,
  PurchaseOrderRecord,
  SupplierPaymentRecord,
  SupplierLedgerEntry,
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

const paymentMethodKeys: Record<PaymentMethod, TranslationKey> = {
  cash: 'supplier.paymentMethod.cash',
  transfer: 'supplier.paymentMethod.transfer',
  check: 'supplier.paymentMethod.check'
};

const getPaymentMethodLabel = (method: string | undefined, t: (key: TranslationKey) => string): string => {
  const key = paymentMethodKeys[method as PaymentMethod];
  return key ? t(key) : (method || t('supplier.repayment'));
};

const getLedgerLabel = (entry: SupplierLedgerEntry, t: (key: TranslationKey) => string): string => {
  if (entry.kind === 'payment') return t('supplier.repayment');
  if (entry.order?.paymentType === 'cash') return t('supplier.ledger.cashPurchase');
  if (entry.remainingDebt <= 0 && entry.amount > 0) return t('supplier.ledger.settledPurchase');
  if (entry.paidAmount > 0 && entry.remainingDebt > 0) return t('supplier.ledger.partialCredit');
  return t('supplier.ledger.creditPurchase');
};

const getLedgerDetail = (entry: SupplierLedgerEntry, t: (key: TranslationKey) => string): string => {
  if (entry.kind !== 'payment' || !entry.payment) return entry.detail;
  const method = getPaymentMethodLabel(entry.payment.paymentMethod, t);
  return `${method}${entry.payment.notes ? ` · ${entry.payment.notes}` : ''}`;
};

const saveStoreCollection = (collectionName: string, data: any[]) => {
  try {
    const storageKey = dataService.getStoreKey(collectionName);
    localStorage.setItem(storageKey, JSON.stringify(data));
  } catch {
    // Auxiliary cache only; never fall back to an unscoped business key.
  }
};

const loadStoreCollection = (collectionName: string): any[] => {
  try {
    const stored = localStorage.getItem(dataService.getStoreKey(collectionName));
    const parsed = stored ? JSON.parse(stored) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const getPurchaseTraceCacheName = (kind: 'stock' | 'expense', orderId: string) =>
  `supplier_purchase_trace_${kind}_${orderId}`;

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
  periodLabel: string,
  t: (key: TranslationKey) => string
) => {
  const snapshot = buildSupplierAccountSnapshot(supplier, orders, payments);
  const ledger = buildSupplierLedgerEntries(orders, payments);
  const printWindow = window.open('', '_blank');

  if (!printWindow) {
    alert(t('supplier.alert.allowPopup'));
    return;
  }

  const orderRows = orders.map(order => {
    const remaining = getPurchaseRemainingDebt(order);
    return `
      <tr>
        <td>${formatSupplierDate(order.orderDate || order.receivedDate || order.createdAt)}</td>
        <td>${order.orderNumber || order.id}</td>
        <td>${order.paymentType === 'cash' ? t('supplier.payment.cash') : t('supplier.payment.credit')}</td>
        <td class="amount">${money(Number(order.totalAmount || 0))}</td>
        <td class="amount">${money(getPurchasePaidAmount(order))}</td>
        <td class="amount">${money(remaining)}</td>
      </tr>
    `;
  }).join('');

  const ledgerRows = ledger.map(entry => `
    <tr>
      <td>${entry.dateKey}</td>
      <td><span class="badge ${entry.kind}">${getLedgerLabel(entry, t)}</span></td>
      <td>${entry.title}</td>
      <td>${getLedgerDetail(entry, t)}</td>
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
        <title>${t('supplier.statement.title')} - ${supplier.name}</title>
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
            <h1>${t('supplier.statement.title')}</h1>
            <div class="muted">${supplier.name} · ${supplier.contact || '-'} · ${supplier.phone || '-'}</div>
            <div class="muted">${t('supplier.statement.period')}：${periodLabel}</div>
          </div>
          <div class="muted">${t('supplier.statement.printDate')}：${getLocalDateString()}</div>
        </div>
        <div class="summary">
          <div class="box"><div class="label">${t('supplier.totalPurchases')}</div><div class="value">${money(snapshot.totalPurchase)}</div></div>
          <div class="box"><div class="label">${t('supplier.totalPaid')}</div><div class="value">${money(snapshot.totalPaid)}</div></div>
          <div class="box"><div class="label">${t('supplier.outstandingDebt')}</div><div class="value">${money(snapshot.totalDebt)}</div></div>
          <div class="box"><div class="label">${t('supplier.unpaidOrders')}</div><div class="value">${snapshot.unpaidOrderCount}</div></div>
        </div>
        <div class="section-title">${t('supplier.statement.purchaseSummary')}</div>
        <table>
          <thead>
            <tr><th>${t('supplier.date')}</th><th>${t('supplier.invoice')}</th><th>${t('supplier.method')}</th><th class="amount">${t('supplier.total')}</th><th class="amount">${t('supplier.paid')}</th><th class="amount">${t('supplier.outstandingDebt')}</th></tr>
          </thead>
          <tbody>${orderRows || `<tr><td colspan="6">${t('supplier.noPurchases')}</td></tr>`}</tbody>
        </table>
        <div class="section-title">${t('supplier.ledger.title')}</div>
        <table>
          <thead>
            <tr><th>${t('supplier.date')}</th><th>${t('supplier.type')}</th><th>${t('supplier.invoice')}</th><th>${t('supplier.details')}</th><th class="amount">${t('supplier.total')}</th><th class="amount">${t('supplier.paidOrRepaid')}</th><th class="amount">${t('supplier.remaining')}</th></tr>
          </thead>
          <tbody>${ledgerRows || `<tr><td colspan="7">${t('supplier.noLedger')}</td></tr>`}</tbody>
        </table>
        <div class="no-print"><button onclick="window.print()">${t('supplier.statement.print')}</button></div>
      </body>
    </html>
  `);
  printWindow.document.close();
};

const SupplierWorkbench: React.FC = () => {
  const { t } = useI18n();
  const { suppliers, setSuppliers, purchaseOrders, setPurchaseOrders } = useAppContext();
  const [payments, setPayments] = useState<SupplierPaymentRecord[]>(() => loadStoreCollection('supplier_payments').map(normalizePayment));
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>('');
  const [searchText, setSearchText] = useState('');
  const [debtFilter, setDebtFilter] = useState<'all' | 'debt' | 'settled'>('all');
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Partial<SupplierRecord> | null>(null);
  const [paymentOrder, setPaymentOrder] = useState<PurchaseOrderRecord | null>(null);
  const [paymentOperationId, setPaymentOperationId] = useState('');
  const [paymentForm, setPaymentForm] = useState({ amount: '', paymentMethod: 'cash' as PaymentMethod, notes: '' });
  const [dateRange, setDateRange] = useState(() => getCurrentMonthSupplierRange());
  const [traceOrder, setTraceOrder] = useState<PurchaseOrderRecord | null>(null);
  const [traceStockRecords, setTraceStockRecords] = useState<any[]>([]);
  const [traceExpenses, setTraceExpenses] = useState<any[]>([]);
  const [isLoadingTrace, setIsLoadingTrace] = useState(false);
  const isSubmittingPaymentRef = useRef(false);

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
  const periodLabel = `${dateRange.startDate || t('supplier.noLimit')} ${t('supplier.to')} ${dateRange.endDate || t('supplier.noLimit')}`;

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
      alert(t('supplier.alert.refreshFailed'));
    } finally {
      setIsRefreshing(false);
    }
  };

  const openNewSupplier = () => {
    setEditingSupplier({ status: 'active' });
  };

  const saveSupplier = async () => {
    if (!editingSupplier?.name?.trim()) {
      alert(t('supplier.alert.nameRequired'));
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
      alert(t('supplier.alert.saveFailed'));
    } finally {
      setIsSaving(false);
    }
  };

  const deleteSupplier = async () => {
    if (!selectedSupplier || !selectedSummary) return;
    if (selectedSummary.totalDebt > 0) {
      alert(`${t('supplier.alert.debtBlocksDelete')} ${money(selectedSummary.totalDebt)}`);
      return;
    }
    if (!window.confirm(`${t('supplier.confirm.delete')} ${selectedSupplier.name}?`)) return;

    setIsSaving(true);
    try {
      await smartDeleteDocument('suppliers', selectedSupplier.id);
      setSuppliers(prev => prev.filter(item => item.id !== selectedSupplier.id));
      setSelectedSupplierId('');
    } catch (error) {
      console.error('删除供应商失败:', error);
      alert(t('supplier.alert.deleteFailed'));
    } finally {
      setIsSaving(false);
    }
  };

  const openPayment = (order: PurchaseOrderRecord) => {
    setPaymentOrder(order);
    setPaymentOperationId(`supplier-payment-${order.id}-${Date.now()}`);
    setPaymentForm({
      amount: getPurchaseRemainingDebt(order).toFixed(2),
      paymentMethod: 'cash',
      notes: ''
    });
  };

  const openPurchaseTrace = async (order: PurchaseOrderRecord) => {
    const stockCacheName = getPurchaseTraceCacheName('stock', order.id);
    const expenseCacheName = getPurchaseTraceCacheName('expense', order.id);
    const cachedStockRecords = loadStoreCollection(stockCacheName);
    const cachedExpenses = loadStoreCollection(expenseCacheName);
    setTraceOrder(order);
    setTraceStockRecords(cachedStockRecords);
    setTraceExpenses(cachedExpenses);
    setIsLoadingTrace(true);
    try {
      const [stockRecords, expenses] = await Promise.all([
        smartGetDocumentsWhereEqual('inventory_stock_records', 'sourceId', order.id, true),
        smartGetDocumentsWhereEqual('expenses', 'purchaseOrderId', order.id, true),
      ]);
      const resolvedStockRecords = stockRecords.length > 0 ? stockRecords : cachedStockRecords;
      const resolvedExpenses = expenses.length > 0 ? expenses : cachedExpenses;
      setTraceStockRecords(resolvedStockRecords);
      setTraceExpenses(resolvedExpenses);
      if (stockRecords.length > 0) saveStoreCollection(stockCacheName, stockRecords);
      if (expenses.length > 0) saveStoreCollection(expenseCacheName, expenses);
    } finally {
      setIsLoadingTrace(false);
    }
  };

  const submitPayment = async () => {
    if (!paymentOrder) return;
    if (isSubmittingPaymentRef.current) return;
    const amount = Number(paymentForm.amount);
    const remaining = getPurchaseRemainingDebt(paymentOrder);
    if (!Number.isFinite(amount) || amount <= 0) {
      alert(t('supplier.alert.invalidRepayment'));
      return;
    }
    if (amount > remaining) {
      alert(`${t('supplier.alert.exceedsDebt')} ${money(remaining)}`);
      return;
    }

    isSubmittingPaymentRef.current = true;
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
      const paymentId = paymentOperationId || `supplier-payment-${paymentOrder.id}-${now}`;
      const paymentRecord: SupplierPaymentRecord = {
        id: paymentId,
        orderId: paymentOrder.id,
        orderNumber: paymentOrder.orderNumber,
        supplierId: paymentOrder.supplierId,
        supplierName: paymentOrder.supplierName,
        amount,
        paymentDate: new Date(),
        paymentMethod: paymentForm.paymentMethod,
        notes: paymentForm.notes,
        createdAt: new Date(),
        lastModified: now,
      };
      const nextPayments = [...payments.filter(payment => payment.id !== paymentId), paymentRecord];
      const relatedSupplier = allSuppliers.find(supplier => supplier.id === paymentOrder.supplierId);
      const updatedSupplier = relatedSupplier ? {
        ...relatedSupplier,
        balance: buildSupplierAccountSnapshot(relatedSupplier, nextOrders, nextPayments).totalDebt,
        lastUpdated: new Date(),
        lastModified: now
      } : null;
      const paymentExpense = {
        id: `expense-${paymentId}`,
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
        createdAt: new Date(),
        lastModified: now,
      };

      await smartUpdateDocument('purchase_orders', paymentOrder.id, updatedOrder);
      await smartAddDocument('supplier_payments', paymentRecord);
      if (updatedSupplier) {
        await smartUpdateDocument('suppliers', updatedSupplier.id, updatedSupplier);
      }
      await smartAddDocument('expenses', paymentExpense);

      setPurchaseOrders(nextOrders as any);
      setPayments(nextPayments);
      saveStoreCollection('supplier_payments', nextPayments);
      if (updatedSupplier) {
        setSuppliers(prev => prev.map(item => item.id === updatedSupplier.id ? updatedSupplier as any : item));
      }
      const nextExpenses = [
        paymentExpense,
        ...dataManager.getData('expenses').filter(expense => expense.id !== paymentExpense.id),
      ];
      await dataManager.saveData('expenses', nextExpenses, { syncFirestore: false });
      setPaymentOrder(null);
      setPaymentOperationId('');
    } catch (error) {
      console.error('供应商还款失败:', error);
      alert(t('supplier.alert.repaymentFailed'));
    } finally {
      isSubmittingPaymentRef.current = false;
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
          <h2 style={{ margin: 0, fontSize: font.title, fontWeight: 850 }}>{t('supplier.title')}</h2>
          <div style={{ marginTop: 6, color: colors.textSecondary }}>{t('supplier.subtitle')}</div>
        </div>
        <div className="supplier-actions">
          {lastSyncedAt && (
            <span style={{ alignSelf: 'center', color: colors.textSecondary, fontSize: font.caption }}>
              {t('supplier.refreshed')} {lastSyncedAt.toLocaleTimeString(undefined, { hour12: false })}
            </span>
          )}
          <button className="supplier-button" style={{ background: colors.blue }} onClick={refresh} disabled={isRefreshing}>
            {isRefreshing ? t('supplier.refreshing') : t('supplier.refresh')}
          </button>
          <button className="supplier-button" style={{ background: colors.teal }} onClick={openNewSupplier}>
            {t('supplier.add')}
          </button>
        </div>
      </header>

      <section className="supplier-metrics">
        {[
          { label: t('supplier.stats.suppliers'), value: String(allSuppliers.length), accent: colors.blue },
          { label: t('supplier.stats.withDebt'), value: String(suppliersWithDebt), accent: colors.amber },
          { label: t('supplier.stats.totalDebt'), value: money(totalDebt), accent: colors.danger },
          { label: t('supplier.stats.payments'), value: String(payments.length), accent: colors.success }
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
              <div style={{ fontSize: font.section, fontWeight: 850 }}>{t('supplier.list.title')}</div>
              <div style={{ color: colors.textSecondary, fontSize: font.caption, marginTop: 4 }}>{t('supplier.list.subtitle')}</div>
            </div>
            <input className="supplier-input" value={searchText} onChange={event => setSearchText(event.target.value)} placeholder={t('supplier.searchPlaceholder')} />
            <select className="supplier-input" value={debtFilter} onChange={event => setDebtFilter(event.target.value as any)}>
              <option value="all">{t('supplier.filter.all')}</option>
              <option value="debt">{t('supplier.filter.debt')}</option>
              <option value="settled">{t('supplier.filter.settled')}</option>
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
                      {summary.totalDebt > 0 ? t('supplier.status.debt') : t('supplier.status.settled')}
                    </span>
                  </div>
                  <div style={{ color: colors.textSecondary, fontSize: font.caption, marginTop: 5 }}>{supplier.contact || '-'} · {supplier.phone || '-'}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
                    <span style={{ color: colors.textSecondary }}>{t('supplier.balance')}</span>
                    <strong style={{ color: summary.totalDebt > 0 ? colors.danger : colors.success }}>{money(summary.totalDebt)}</strong>
                  </div>
                </button>
              ))}
              {filteredSuppliers.length === 0 && (
                <div style={{ color: colors.textMuted, textAlign: 'center', padding: '28px 8px' }}>{t('supplier.empty')}</div>
              )}
            </div>
          </div>
        </aside>

        <section className="supplier-panel" data-supplier-ledger-workspace="true">
          {selectedSupplier && selectedSummary ? (
            <div style={{ display: 'grid', gap: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ color: colors.textSecondary, fontWeight: 800, fontSize: font.caption }}>{t('supplier.current')}</div>
                  <h3 style={{ margin: '4px 0', fontSize: '1.45rem' }}>{selectedSupplier.name}</h3>
                  <div style={{ color: colors.textSecondary }}>{selectedSupplier.contact || '-'} · {selectedSupplier.phone || '-'}{selectedSupplier.address ? ` · ${selectedSupplier.address}` : ''}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ color: colors.textSecondary, fontWeight: 800, fontSize: font.caption }}>{t('supplier.outstandingDebt')}</div>
                  <div style={{ fontSize: '2rem', fontWeight: 900, color: selectedSummary.totalDebt > 0 ? colors.danger : colors.success }}>
                    {money(selectedSummary.totalDebt)}
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10 }}>
                {[
                  [t('supplier.count.purchaseOrders'), selectedSummary.purchaseCount],
                  [t('supplier.count.creditOrders'), selectedSummary.creditOrderCount],
                  [t('supplier.count.unpaidOrders'), selectedSummary.unpaidOrderCount],
                  [t('supplier.count.repayments'), selectedSummary.repaymentCount]
                ].map(([label, value]) => (
                  <div key={String(label)} style={{ border: `1px solid ${colors.border}`, borderRadius: radii.md, background: colors.surfaceMuted, padding: 10 }}>
                    <div style={{ color: colors.textSecondary, fontSize: font.caption }}>{label}</div>
                    <strong>{value}</strong>
                  </div>
                ))}
              </div>

              <section className="supplier-datebar" data-supplier-date-filter="true">
                <div>
                  <div style={{ color: colors.textSecondary, fontSize: font.caption, fontWeight: 800, marginBottom: 6 }}>{t('supplier.period.start')}</div>
                  <input
                    className="supplier-input"
                    type="date"
                    value={dateRange.startDate}
                    onChange={event => setDateRange(prev => ({ ...prev, startDate: event.target.value }))}
                  />
                </div>
                <div>
                  <div style={{ color: colors.textSecondary, fontSize: font.caption, fontWeight: 800, marginBottom: 6 }}>{t('supplier.period.end')}</div>
                  <input
                    className="supplier-input"
                    type="date"
                    value={dateRange.endDate}
                    onChange={event => setDateRange(prev => ({ ...prev, endDate: event.target.value }))}
                  />
                </div>
                <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button className="supplier-quick-range" onClick={() => setDateRange({ startDate: getLocalDateString(), endDate: getLocalDateString() })}>{t('supplier.range.today')}</button>
                  <button className="supplier-quick-range" onClick={() => setDateRange(getCurrentMonthSupplierRange())}>{t('supplier.range.currentMonth')}</button>
                  <button className="supplier-quick-range" onClick={() => setDateRange(getPreviousMonthRange())}>{t('supplier.range.previousMonth')}</button>
                  <button className="supplier-quick-range" onClick={() => setDateRange(getLastDaysRange(30))}>{t('supplier.range.last30Days')}</button>
                </div>
              </section>

              <section className="supplier-period-metrics" data-supplier-period-summary="true">
                {[
                  [t('supplier.period.purchases'), money(periodSummary.purchaseAmount)],
                  [t('supplier.period.payments'), money(periodSummary.paymentAmount)],
                  [t('supplier.period.purchaseCount'), periodSummary.purchaseCount],
                  [t('supplier.period.paymentCount'), periodSummary.paymentCount]
                ].map(([label, value]) => (
                  <div key={String(label)} style={{ border: `1px solid ${colors.border}`, borderRadius: radii.md, background: '#fff', padding: 10 }}>
                    <div style={{ color: colors.textSecondary, fontSize: font.caption }}>{label}</div>
                    <strong>{value}</strong>
                  </div>
                ))}
              </section>

              <section>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 8 }}>
                  <h3 style={{ margin: 0, fontSize: font.section }}>{t('supplier.unpaid.title')}</h3>
                  <span style={{ color: colors.textSecondary, fontSize: font.caption }}>{t('supplier.unpaid.subtitle')}</span>
                </div>
                <div style={{ display: 'grid', gap: 8 }}>
                  {unpaidOrders.map(order => (
                    <div key={order.id} style={{ border: '1px solid #fed7aa', background: '#fff7ed', borderRadius: radii.lg, padding: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                        <strong>{order.orderNumber || order.id}</strong>
                        <strong style={{ color: colors.danger }}>{money(getPurchaseRemainingDebt(order))}</strong>
                      </div>
                      <div style={{ color: colors.textSecondary, fontSize: font.caption, marginTop: 5 }}>
                        {formatSupplierDate(order.orderDate || order.receivedDate || order.createdAt)} · {t('supplier.total')} {money(Number(order.totalAmount || 0))} · {t('supplier.paid')} {money(getPurchasePaidAmount(order))}
                      </div>
                      <button className="supplier-button" style={{ background: colors.teal, marginTop: 8, padding: '7px 10px' }} onClick={() => openPayment(order)}>
                        {t('supplier.repay')}
                      </button>
                    </div>
                  ))}
                  {unpaidOrders.length === 0 && (
                    <div style={{ color: colors.textMuted, background: colors.surfaceMuted, border: `1px solid ${colors.border}`, borderRadius: radii.lg, padding: 14 }}>
                      {t('supplier.unpaid.empty')}
                    </div>
                  )}
                </div>
              </section>

              <section data-supplier-ledger-timeline="true">
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
                  <h3 style={{ margin: 0, fontSize: font.section }}>{t('supplier.ledger.title')}</h3>
                  <span style={{ color: colors.textSecondary, fontSize: font.caption }}>{periodLabel}</span>
                </div>
                <div style={{ display: 'grid', gap: 8 }}>
                  {selectedLedger.map(entry => (
                    <div key={entry.id} style={{ display: 'grid', gridTemplateColumns: '82px 1fr auto', gap: 12, alignItems: 'center', border: `1px solid ${colors.border}`, borderRadius: radii.md, padding: 10 }}>
                      <div style={{ color: colors.textSecondary, fontSize: font.caption }}>{entry.dateKey}</div>
                      <div>
                        <strong>{getLedgerLabel(entry, t)} · {entry.title}</strong>
                        <div style={{ color: colors.textSecondary, fontSize: font.caption, marginTop: 3 }}>{getLedgerDetail(entry, t)}</div>
                        {entry.kind === 'purchase' && entry.order && (
                          <button
                            className="supplier-quick-range"
                            style={{ marginTop: 6 }}
                            onClick={() => void openPurchaseTrace(entry.order!)}
                          >
                            {t('supplier.trace.open')}
                          </button>
                        )}
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ color: entry.kind === 'payment' ? colors.success : colors.textPrimary, fontWeight: 850 }}>{money(entry.amount)}</div>
                        {entry.kind === 'purchase' && <div style={{ color: colors.textSecondary, fontSize: font.caption }}>{t('supplier.remainingShort')} {money(entry.remainingDebt)}</div>}
                      </div>
                    </div>
                  ))}
                  {selectedLedger.length === 0 && (
                    <div style={{ color: colors.textMuted, background: colors.surfaceMuted, border: `1px solid ${colors.border}`, borderRadius: radii.lg, padding: 14 }}>
                      {t('supplier.ledger.empty')}
                    </div>
                  )}
                </div>
              </section>
            </div>
          ) : (
            <div style={{ color: colors.textMuted, minHeight: 300, display: 'grid', placeItems: 'center' }}>{t('supplier.selectPrompt')}</div>
          )}
        </section>

        <aside className="supplier-panel" data-supplier-action-panel="true">
          <div style={{ display: 'grid', gap: 10 }}>
            <div>
              <div style={{ fontSize: font.section, fontWeight: 850 }}>{t('supplier.actions.title')}</div>
              <div style={{ color: colors.textSecondary, fontSize: font.caption, marginTop: 4 }}>{t('supplier.actions.subtitle')}</div>
            </div>
            <button className="supplier-button" style={{ background: colors.teal }} onClick={openNewSupplier}>{t('supplier.add')}</button>
            <button className="supplier-button supplier-outline" disabled={!selectedSupplier} onClick={() => selectedSupplier && setEditingSupplier(selectedSupplier)}>{t('supplier.edit')}</button>
            <button className="supplier-button supplier-outline" disabled={!selectedSupplier || unpaidOrders.length === 0} onClick={() => unpaidOrders[0] && openPayment(unpaidOrders[0])}>{t('supplier.handleLatestDebt')}</button>
            <button className="supplier-button supplier-outline" disabled={!selectedSupplier} onClick={() => selectedSupplier && printSupplierStatement(selectedSupplier, periodOrders, periodPayments, periodLabel, t)}>{t('supplier.statement.generate')}</button>
            <button className="supplier-button" style={{ background: colors.danger }} disabled={!selectedSupplier || isSaving} onClick={deleteSupplier}>{t('supplier.delete')}</button>
            {selectedSummary && (
              <div style={{ display: 'grid', gap: 8, border: `1px solid ${colors.border}`, borderRadius: radii.lg, padding: 12, background: colors.surfaceMuted }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: colors.textSecondary }}>{t('supplier.recentPurchase')}</span><strong>{selectedSummary.lastPurchaseDate}</strong></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: colors.textSecondary }}>{t('supplier.recentPayment')}</span><strong>{selectedSummary.lastPaymentDate}</strong></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: colors.textSecondary }}>{t('supplier.totalPurchases')}</span><strong>{money(selectedSummary.totalPurchase)}</strong></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: colors.textSecondary }}>{t('supplier.totalPaid')}</span><strong>{money(selectedSummary.totalPaid)}</strong></div>
              </div>
            )}
          </div>
        </aside>
      </main>

      {traceOrder && (
        <div className="supplier-modal-bg" onClick={() => setTraceOrder(null)}>
          <div className="supplier-modal" style={{ width: 'min(760px, 100%)' }} onClick={event => event.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: font.section }}>{t('supplier.trace.title')} · {traceOrder.orderNumber || traceOrder.id}</h3>
                <div style={{ color: colors.textSecondary, marginTop: 5 }}>
                  {traceOrder.supplierName || selectedSupplier?.name || '-'} · {formatSupplierDate(traceOrder.orderDate || traceOrder.receivedDate)}
                </div>
              </div>
              <button className="supplier-button supplier-outline" onClick={() => setTraceOrder(null)}>{t('supplier.close')}</button>
            </div>

            {isLoadingTrace && <div style={{ marginTop: 14, color: colors.textSecondary }}>{t('supplier.trace.loading')}</div>}

            <div style={{ display: 'grid', gap: 14, marginTop: 16 }}>
              <section>
                <strong>{t('supplier.trace.stockRecords')} ({traceStockRecords.length})</strong>
                <div style={{ display: 'grid', gap: 7, marginTop: 8 }}>
                  {traceStockRecords.map(record => (
                    <div key={record.id} style={{ border: `1px solid ${colors.border}`, borderRadius: radii.md, padding: 9, display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                      <span>{record.itemName || record.itemId}</span>
                      <span style={{ color: colors.textSecondary }}>
                        +{Number(record.quantity || record.signedQuantity || 0)} · {Number(record.beforeStock || 0)} → {Number(record.afterStock || 0)}
                      </span>
                    </div>
                  ))}
                  {!isLoadingTrace && traceStockRecords.length === 0 && <div style={{ color: colors.textMuted }}>{t('supplier.trace.noStock')}</div>}
                </div>
              </section>

              <section>
                <strong>{t('supplier.trace.expenses')} ({traceExpenses.length})</strong>
                <div style={{ display: 'grid', gap: 7, marginTop: 8 }}>
                  {traceExpenses.map(expense => {
                    const receipt = expense.receipt || expense.receiptImage || expense.invoiceImage;
                    return (
                      <div key={expense.id} style={{ border: `1px solid ${colors.border}`, borderRadius: radii.md, padding: 9, display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                        <div>
                          <div>{expense.description || expense.categoryName || t('supplier.defaultDebtCategory')}</div>
                          <div style={{ color: colors.textSecondary, fontSize: font.caption, marginTop: 3 }}>{formatSupplierDate(expense.date || expense.createdAt)}</div>
                        </div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <strong>{money(Number(expense.amount || 0))}</strong>
                          {receipt && (
                            <button className="supplier-quick-range" onClick={() => window.open(receipt, '_blank', 'noopener,noreferrer')}>{t('supplier.trace.viewReceipt')}</button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {!isLoadingTrace && traceExpenses.length === 0 && (
                    <div style={{ color: colors.textMuted }}>
                      {traceOrder.paymentType === 'credit' ? t('supplier.trace.creditNotPaid') : t('supplier.trace.noExpense')}
                    </div>
                  )}
                </div>
              </section>

              <section>
                <strong>{t('supplier.trace.repayments')}</strong>
                <div style={{ display: 'grid', gap: 7, marginTop: 8 }}>
                  {payments.filter(payment => payment.orderId === traceOrder.id).map(payment => (
                    <div key={payment.id} style={{ border: `1px solid ${colors.border}`, borderRadius: radii.md, padding: 9, display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                      <span>{formatSupplierDate(payment.paymentDate || payment.createdAt)} · {getPaymentMethodLabel(payment.paymentMethod, t)}</span>
                      <strong>{money(Number(payment.amount || 0))}</strong>
                    </div>
                  ))}
                  {payments.filter(payment => payment.orderId === traceOrder.id).length === 0 && <div style={{ color: colors.textMuted }}>{t('supplier.trace.noRepayments')}</div>}
                </div>
              </section>
            </div>
          </div>
        </div>
      )}

      {editingSupplier && (
        <div className="supplier-modal-bg" onClick={() => setEditingSupplier(null)}>
          <div className="supplier-modal" onClick={event => event.stopPropagation()}>
            <h3 style={{ margin: '0 0 14px', fontSize: font.section }}>{editingSupplier.id ? t('supplier.editTitle') : t('supplier.addTitle')}</h3>
            <div style={{ display: 'grid', gap: 12 }}>
              <input className="supplier-input" placeholder={t('supplier.namePlaceholder')} value={editingSupplier.name || ''} onChange={event => setEditingSupplier({ ...editingSupplier, name: event.target.value })} />
              <input className="supplier-input" placeholder={t('supplier.contactPlaceholder')} value={editingSupplier.contact || ''} onChange={event => setEditingSupplier({ ...editingSupplier, contact: event.target.value })} />
              <input className="supplier-input" placeholder={t('supplier.phonePlaceholder')} value={editingSupplier.phone || ''} onChange={event => setEditingSupplier({ ...editingSupplier, phone: event.target.value })} />
              <input className="supplier-input" placeholder={t('supplier.addressPlaceholder')} value={editingSupplier.address || ''} onChange={event => setEditingSupplier({ ...editingSupplier, address: event.target.value })} />
              <select className="supplier-input" value={editingSupplier.status || 'active'} onChange={event => setEditingSupplier({ ...editingSupplier, status: event.target.value as any })}>
                <option value="active">{t('supplier.status.active')}</option>
                <option value="inactive">{t('supplier.status.inactive')}</option>
              </select>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
              <button className="supplier-button supplier-outline" onClick={() => setEditingSupplier(null)}>{t('supplier.cancel')}</button>
              <button className="supplier-button" style={{ background: colors.teal }} disabled={isSaving} onClick={saveSupplier}>{isSaving ? t('supplier.saving') : t('supplier.save')}</button>
            </div>
          </div>
        </div>
      )}

      {paymentOrder && (
        <div className="supplier-modal-bg" onClick={() => setPaymentOrder(null)}>
          <div className="supplier-modal" onClick={event => event.stopPropagation()}>
            <h3 style={{ margin: '0 0 10px', fontSize: font.section }}>{t('supplier.repaymentTitle')}</h3>
            <div style={{ color: colors.textSecondary, marginBottom: 12 }}>
              {paymentOrder.supplierName} · {paymentOrder.orderNumber || paymentOrder.id} · {t('supplier.remaining')} {money(getPurchaseRemainingDebt(paymentOrder))}
            </div>
            <div style={{ display: 'grid', gap: 12 }}>
              <input className="supplier-input" type="number" min="0" step="0.01" value={paymentForm.amount} onChange={event => setPaymentForm({ ...paymentForm, amount: event.target.value })} />
              <select className="supplier-input" value={paymentForm.paymentMethod} onChange={event => setPaymentForm({ ...paymentForm, paymentMethod: event.target.value as PaymentMethod })}>
                {(['cash', 'transfer', 'check'] as PaymentMethod[]).map(value => <option key={value} value={value}>{getPaymentMethodLabel(value, t)}</option>)}
              </select>
              <textarea className="supplier-input" rows={3} placeholder={t('supplier.notesPlaceholder')} value={paymentForm.notes} onChange={event => setPaymentForm({ ...paymentForm, notes: event.target.value })} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
              <button className="supplier-button supplier-outline" onClick={() => setPaymentOrder(null)}>{t('supplier.cancel')}</button>
              <button className="supplier-button" style={{ background: colors.teal }} disabled={isSaving} onClick={submitPayment}>{isSaving ? t('supplier.submitting') : t('supplier.confirmRepayment')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SupplierWorkbench;
