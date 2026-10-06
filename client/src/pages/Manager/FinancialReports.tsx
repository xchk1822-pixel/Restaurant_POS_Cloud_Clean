import React, { useState, useEffect } from 'react';
import { dataService } from '../../services/DataService';
import { smartGetDocuments, smartGetDocumentsByDateRange, smartGetPosOrdersByActivityDateRange, smartSetDocument } from '../../services/smartSyncService';
import { getLocalDateString } from '../../utils/exchangeRate';
import { getInclusiveLocalDateKeys } from '../../utils/localTime';
import { buildMissingPurchaseExpenses, getPurchaseExpenseDate } from '../../utils/purchaseExpenseRepair';
import { buildDailyExpenseBreakdown, calculateFinancialReportTotals, calculateOrderStatusSummary, getExpenseCashAmount, getExpenseDateKey, getExpenseProfitAmount, getLatestHandoverAmountForDate, getOrderCollectedAmount, getOrderFinancialDateKey, getOrderPaymentBreakdown, getReservationCashFlowForDate, getReservationPrepaymentAmountForDate, isPurchaseRelatedExpense } from '../../utils/financeMetrics';
import { colors, font, radii, shadows } from '../../styles/uiTokens';
import { useI18n } from '../../i18n/I18nContext';
import type { TranslationKey } from '../../i18n/translations';
import { getFinancialSourceRevision } from '../../services/dataManager';

interface DailyReport {
  date: string;
  totalSales: number;
  orderCount: number;
  completedOrders: number;
  dineInOrders: number;
  takeoutOrders: number;
  deliveryOrders: number;
  reservationOrders: number;
  cancelledOrders: number;
  cancelledItems: number;
  cashPayment: number;
  cardPayment: number;
  reservationPrepaymentAmount: number;
  purchaseAmount: number;
  expenseAmount: number;
  profit: number;
  handoverAmount?: number;
  difference?: number;
  expectedCashHandover: number;
  fundingGap: number;
}

interface FinancialReportsModuleProps {
  orders?: any[];
}

interface FinancialReportCloudSnapshot {
  orders: any[];
  expenses: any[];
  purchases: any[];
  handovers: any[];
  expenseCategories: any[];
  syncedAt: number;
  sourceRevision: number;
}

const financialReportRangeCache = new Map<string, FinancialReportCloudSnapshot>();

const rememberFinancialSnapshot = (key: string, value: FinancialReportCloudSnapshot): void => {
  financialReportRangeCache.delete(key);
  financialReportRangeCache.set(key, value);
  if (financialReportRangeCache.size > 8) {
    const oldestKey = financialReportRangeCache.keys().next().value;
    if (oldestKey) financialReportRangeCache.delete(oldestKey);
  }
};

const clearFinancialSnapshotsForStore = (storeId: string): void => {
  const prefix = `${storeId}|`;
  Array.from(financialReportRangeCache.keys()).forEach(key => {
    if (key.startsWith(prefix)) financialReportRangeCache.delete(key);
  });
};

const getMonthDateRange = (monthKey: string) => {
  const startDate = `${monthKey}-01`;
  const endDate = new Date(`${startDate}T12:00:00`);
  endDate.setMonth(endDate.getMonth() + 1, 0);
  return { startDate, endDate: getLocalDateString(endDate) };
};

const getSupplierDebtTotal = (purchases: any[]): number => {
  return purchases.reduce((sum: number, purchase: any) => {
    const totalAmount = Number(purchase.totalAmount) || 0;
    const paidAmount = Number(purchase.paidAmount) || 0;
    return sum + Math.max(totalAmount - paidAmount, 0);
  }, 0);
};

const money = (value: number | undefined | null): string => `C$ ${(Number(value) || 0).toFixed(2)}`;
const signedMoney = (value: number | undefined | null): string => {
  const amount = Number(value) || 0;
  return `${amount > 0 ? '+' : ''}${money(amount)}`;
};

const getFinancialCloudDateRange = (
  reportType: 'daily' | 'weekly' | 'monthly' | 'custom',
  selectedDate: string,
  selectedMonth: string,
  startDate: string,
  endDate: string
) => {
  if (reportType === 'daily') return { startDate: selectedDate, endDate: selectedDate };
  if (reportType === 'monthly') return getMonthDateRange(selectedMonth);
  if (reportType === 'custom') {
    return startDate <= endDate
      ? { startDate, endDate }
      : { startDate: endDate, endDate: startDate };
  }
  const days = 7;
  return {
    startDate: getLocalDateString(new Date(Date.now() - days * 24 * 60 * 60 * 1000)),
    endDate: getLocalDateString(),
  };
};

const formatOrderSummary = (
  report: Pick<DailyReport, 'completedOrders' | 'dineInOrders' | 'takeoutOrders' | 'deliveryOrders' | 'reservationOrders' | 'cancelledOrders' | 'cancelledItems'>,
  t: (key: TranslationKey) => string
): string =>
  `${t('finance.orders.completed')} ${report.completedOrders} / Mesa ${report.dineInOrders} / Barra ${report.takeoutOrders} / Delivery ${report.deliveryOrders} / Reserva ${report.reservationOrders} / ${t('finance.orders.cancelled')} ${report.cancelledOrders} / ${t('finance.orders.cancelledItems')} ${report.cancelledItems}`;

const htmlEscape = (value: any): string => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

const FinancialReportsModule: React.FC<FinancialReportsModuleProps> = ({ orders: propOrders }) => {
  const { language, t } = useI18n();
  const expenseCategoryStorageKey = dataService.getStoreKey('expense_categories');
  const [orders, setOrders] = useState<any[]>(() => propOrders || []);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<any[]>([]);
  const [handovers, setHandovers] = useState<any[]>([]);
  const [expenseCategories, setExpenseCategories] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem(expenseCategoryStorageKey);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [reportType, setReportType] = useState<'daily' | 'weekly' | 'monthly' | 'custom'>('daily');
  const [selectedDate, setSelectedDate] = useState(getLocalDateString());
  const [selectedMonth, setSelectedMonth] = useState(getLocalDateString().slice(0, 7));
  const [startDate, setStartDate] = useState(getLocalDateString(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)));
  const [endDate, setEndDate] = useState(getLocalDateString());
  const [dailyReports, setDailyReports] = useState<DailyReport[]>([]);
  const loading = false;
  const [dataVersion, setDataVersion] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);

  // Low-frequency manager data: fetch once on entry, then manual refresh.
  const refreshFinancialData = React.useCallback(async (forceCloud = false) => {
    setIsRefreshing(true);
    try {
      const storeId = dataService.getCurrentStoreId();
      if (!storeId) throw new Error('Missing storeId for financial reports');
      const cloudRange = getFinancialCloudDateRange(reportType, selectedDate, selectedMonth, startDate, endDate);
      const cacheKey = `${storeId}|${cloudRange.startDate}|${cloudRange.endDate}`;
      const sourceRevision = getFinancialSourceRevision(storeId);
      const cachedSnapshot = forceCloud ? undefined : financialReportRangeCache.get(cacheKey);
      const cached = cachedSnapshot?.sourceRevision === sourceRevision ? cachedSnapshot : undefined;
      let cloudOrders = cached?.orders;
      let cloudExpenses = cached?.expenses;
      let cloudPurchases = cached?.purchases;
      let cloudHandovers = cached?.handovers;
      let cloudExpenseCategories = cached?.expenseCategories;

      if (!cached) {
        [cloudOrders, cloudExpenses, cloudPurchases, cloudHandovers, cloudExpenseCategories] = await Promise.all([
          smartGetPosOrdersByActivityDateRange(cloudRange.startDate, cloudRange.endDate, true, undefined, ['completedAt', 'lastPaidAt', 'cancelledAt'], false),
          smartGetDocumentsByDateRange('expenses', 'date', cloudRange.startDate, cloudRange.endDate, true),
          smartGetDocuments('purchase_orders', true),
          smartGetDocumentsByDateRange('handovers', 't', cloudRange.startDate, cloudRange.endDate, true),
          smartGetDocuments('expense_categories', true),
        ]);
      }

      const nextOrders = cloudOrders || [];
      const nextCloudExpenses = cloudExpenses || [];
      const nextPurchases = cloudPurchases || [];
      const nextHandovers = cloudHandovers || [];
      const nextExpenseCategories = cloudExpenseCategories || [];

      const rangePurchases = nextPurchases.filter(purchase => {
        const purchaseDate = getPurchaseExpenseDate(purchase);
        return purchaseDate >= cloudRange.startDate && purchaseDate <= cloudRange.endDate;
      });
      const repairedExpenses = cached ? [] : buildMissingPurchaseExpenses(rangePurchases, nextCloudExpenses);
      if (repairedExpenses.length > 0) {
        await Promise.all(repairedExpenses.map(expense =>
          smartSetDocument('expenses', expense.id, expense)
        ));
      }
      const nextExpenses = [...repairedExpenses, ...nextCloudExpenses];
      const syncedAt = cached?.syncedAt || Date.now();

      if (!cached) {
        rememberFinancialSnapshot(cacheKey, {
          orders: nextOrders,
          expenses: nextExpenses,
          purchases: nextPurchases,
          handovers: nextHandovers,
          expenseCategories: nextExpenseCategories,
          syncedAt,
          sourceRevision,
        });
      }

      setOrders(nextOrders);
      setExpenses(nextExpenses);
      setPurchaseOrders(nextPurchases);
      setHandovers(nextHandovers);
      if (nextExpenseCategories.length > 0) {
        setExpenseCategories(nextExpenseCategories);
        try {
          localStorage.setItem(expenseCategoryStorageKey, JSON.stringify(nextExpenseCategories));
        } catch (cacheError) {
          console.warn('财务报表开支类别缓存写入失败，继续使用云端数据:', cacheError);
        }
      }
      setDataVersion(version => version + 1);
      setLastSyncedAt(new Date(syncedAt));
    } catch (error) {
      console.error('Failed to refresh financial report data:', error);
      alert(t('finance.alert.refreshFailed'));
    } finally {
      setIsRefreshing(false);
    }
  }, [endDate, expenseCategoryStorageKey, reportType, selectedDate, selectedMonth, startDate, t]);

  useEffect(() => {
    refreshFinancialData(false);
  }, [refreshFinancialData]);

  useEffect(() => {
    const handleFinancialSourceUpdated = () => {
      const storeId = dataService.getCurrentStoreId();
      if (storeId) clearFinancialSnapshotsForStore(storeId);
      setDataVersion(version => version + 1);
    };

    window.addEventListener('expensesUpdated', handleFinancialSourceUpdated);
    window.addEventListener('purchasesUpdated', handleFinancialSourceUpdated);
    window.addEventListener('posOrdersUpdated', handleFinancialSourceUpdated);
    return () => {
      window.removeEventListener('expensesUpdated', handleFinancialSourceUpdated);
      window.removeEventListener('purchasesUpdated', handleFinancialSourceUpdated);
      window.removeEventListener('posOrdersUpdated', handleFinancialSourceUpdated);
    };
  }, []);

  const generateDailyReport = React.useCallback((date: string): DailyReport => {
    const dayOrders = orders.filter((order: any) => getOrderFinancialDateKey(order) === date);

    const collectedSales = dayOrders.reduce((sum: number, order: any) => sum + getOrderCollectedAmount(order), 0);
    const orderCount = dayOrders.filter((order: any) => getOrderCollectedAmount(order) > 0).length;
    const orderStatusSummary = calculateOrderStatusSummary(orders, date);

    // Calculate cash and card income from settled orders.
    let cashPayment = 0;
    let cardPayment = 0;

    dayOrders.forEach((order: any) => {
      const breakdown = getOrderPaymentBreakdown(order);
      cashPayment += breakdown.cash;
      cardPayment += breakdown.card;
    });

    const reservationCashFlow = orders.reduce((totals, order: any) => {
      const flow = getReservationCashFlowForDate(order, date);
      totals.total += flow.total;
      totals.cash += flow.cash;
      totals.card += flow.card;
      return totals;
    }, { total: 0, cash: 0, card: 0 });
    const reservationPrepaymentAmount = orders.reduce(
      (sum: number, order: any) => sum + getReservationPrepaymentAmountForDate(order, date),
      0
    );
    const recognizedReservationCash = dayOrders.reduce((sum: number, order: any) => (
      order.orderType === 'reservation' ? sum + getOrderPaymentBreakdown(order).cash : sum
    ), 0);
    const cashForHandover = cashPayment - recognizedReservationCash + reservationCashFlow.cash;

    // Cash plus card should match collected sales.
    const totalPayment = cashPayment + cardPayment;
    if (Math.abs(totalPayment - collectedSales) > 0.01 && collectedSales > 0) {
      console.warn('Cash plus card does not match collected sales', {
        collectedSales,
        cashPayment,
        cardPayment,
        totalPayment,
        difference: totalPayment - collectedSales
      });
    }

    const purchaseAmount = expenses.reduce((sum: number, exp: any) => {
      if (!isPurchaseRelatedExpense(exp)) {
        return sum;
      }
      if (getExpenseDateKey(exp) === date) {
        return sum + (exp.amount || 0);
      }
      return sum;
    }, 0);

    const expenseAmount = expenses.reduce((sum: number, exp: any) => {
      if (isPurchaseRelatedExpense(exp)) {
        return sum;
      }
      if (getExpenseDateKey(exp) === date) {
        return sum + getExpenseProfitAmount(exp);
      }
      return sum;
    }, 0);

    const cashExpenseAmount = expenses.reduce((sum: number, exp: any) => {
      if (isPurchaseRelatedExpense(exp)) return sum;
      return getExpenseDateKey(exp) === date
        ? sum + getExpenseCashAmount(exp)
        : sum;
    }, 0);

    // Read shift handover records.
    const handoverAmount = getLatestHandoverAmountForDate(handovers, date);
    const { totalSales, profit } = calculateFinancialReportTotals({
      cashPayment,
      cardPayment,
      purchaseAmount,
      expenseAmount,
      cashExpenseAmount,
      handoverAmount,
    });
    const { difference, expectedCashHandover, fundingGap } = calculateFinancialReportTotals({
      cashPayment: cashForHandover,
      cardPayment,
      purchaseAmount,
      expenseAmount,
      cashExpenseAmount,
      handoverAmount,
    });

    return {
      date,
      totalSales,
      orderCount,
      completedOrders: orderStatusSummary.completedOrders,
      dineInOrders: orderStatusSummary.dineInOrders,
      takeoutOrders: orderStatusSummary.takeoutOrders,
      deliveryOrders: orderStatusSummary.deliveryOrders,
      reservationOrders: orderStatusSummary.reservationOrders,
      cancelledOrders: orderStatusSummary.cancelledOrders,
      cancelledItems: orderStatusSummary.cancelledItems,
      cashPayment,
      cardPayment,
      reservationPrepaymentAmount,
      purchaseAmount,
      expenseAmount,
      profit,
      handoverAmount,
      difference,
      expectedCashHandover,
      fundingGap,
    };
  }, [orders, expenses, handovers]);

  // Load report data.
  const loadReports = React.useCallback(() => {
    if (reportType === 'daily') {
      setDailyReports([generateDailyReport(selectedDate)]);
    } else if (reportType === 'custom') {
      setDailyReports(getInclusiveLocalDateKeys(startDate, endDate).map(generateDailyReport));
    } else if (reportType === 'monthly') {
      const range = getMonthDateRange(selectedMonth);
      setDailyReports(getInclusiveLocalDateKeys(range.startDate, range.endDate).map(generateDailyReport));
    } else if (reportType === 'weekly') {
      const reports: DailyReport[] = [];
      const start = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const end = new Date();

      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dateStr = getLocalDateString(d);
        reports.push(generateDailyReport(dateStr));
      }
      setDailyReports(reports);
    }
  }, [reportType, selectedDate, selectedMonth, startDate, endDate, generateDailyReport]);

  useEffect(() => {
    loadReports();
  }, [loadReports, dataVersion]);

  const supplierDebtTotal = getSupplierDebtTotal(purchaseOrders);

  // Calculate summary totals.
  const summary = dailyReports.reduce((acc, report) => ({
    totalSales: acc.totalSales + report.totalSales,
    orderCount: acc.orderCount + report.orderCount,
    completedOrders: acc.completedOrders + report.completedOrders,
    dineInOrders: acc.dineInOrders + report.dineInOrders,
    takeoutOrders: acc.takeoutOrders + report.takeoutOrders,
    deliveryOrders: acc.deliveryOrders + report.deliveryOrders,
    reservationOrders: acc.reservationOrders + report.reservationOrders,
    cancelledOrders: acc.cancelledOrders + report.cancelledOrders,
    cancelledItems: acc.cancelledItems + report.cancelledItems,
    cashPayment: acc.cashPayment + report.cashPayment,
    cardPayment: acc.cardPayment + report.cardPayment,
    reservationPrepaymentAmount: acc.reservationPrepaymentAmount + report.reservationPrepaymentAmount,
    purchaseAmount: acc.purchaseAmount + report.purchaseAmount,
    expenseAmount: acc.expenseAmount + report.expenseAmount,
    profit: acc.profit + report.profit,
    difference: acc.difference + (report.difference || 0),
    handoverAmount: acc.handoverAmount + (report.handoverAmount || 0),
    expectedCashHandover: acc.expectedCashHandover + report.expectedCashHandover,
    fundingGap: acc.fundingGap + report.fundingGap,
    hasHandover: acc.hasHandover || report.handoverAmount !== undefined,
    supplierDebt: supplierDebtTotal
  }), { totalSales: 0, orderCount: 0, completedOrders: 0, dineInOrders: 0, takeoutOrders: 0, deliveryOrders: 0, reservationOrders: 0, cancelledOrders: 0, cancelledItems: 0, cashPayment: 0, cardPayment: 0, reservationPrepaymentAmount: 0, purchaseAmount: 0, expenseAmount: 0, profit: 0, difference: 0, handoverAmount: 0, expectedCashHandover: 0, fundingGap: 0, hasHandover: false, supplierDebt: supplierDebtTotal });
  const dailyExpenseBreakdown = reportType === 'daily'
    ? buildDailyExpenseBreakdown(expenses, selectedDate, expenseCategories, purchaseOrders)
    : { summaries: [], details: [], groups: [] };
  const getExpenseTypeLabel = (type: 'purchase' | 'operating') => (
    t(type === 'purchase' ? 'finance.purchasePayment' : 'finance.operatingExpense')
  );
  const getExpenseGroupTitle = (title: string) => (
    language === 'es-NI'
      ? title.replace(/\s*-\s*\u5355\u53f7\s*/g, ` - ${t('finance.invoiceNumber')} `)
      : title
  );

  const styles = {
    container: {
      display: 'flex',
      flexDirection: 'column' as const,
      height: '100%',
      padding: '1.1rem 1.25rem',
      background: colors.page,
      color: colors.textPrimary,
      fontFamily: font.family,
    },
    header: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: '1rem',
      marginBottom: '1rem',
      flexShrink: 0 as const,
      flexWrap: 'wrap' as const,
    },
    title: {
      fontSize: font.title,
      fontWeight: 700,
      color: colors.textPrimary,
      margin: 0,
      letterSpacing: 0,
    },
    controls: {
      display: 'flex',
      gap: '0.55rem',
      alignItems: 'center',
      flexWrap: 'wrap' as const,
      justifyContent: 'flex-end',
    },
    btn: (bg: string, color: string) => ({
      padding: '0.62rem 0.95rem',
      background: bg,
      color: color,
      border: `1px solid ${bg}`,
      borderRadius: radii.md,
      cursor: 'pointer',
      fontWeight: 650,
      fontSize: font.caption,
      boxShadow: bg === colors.blue ? '0 10px 22px rgba(37, 99, 235, 0.18)' : 'none',
    }),
    select: {
      padding: '0.6rem 0.75rem',
      border: `1px solid ${colors.border}`,
      borderRadius: radii.md,
      fontSize: font.caption,
      color: colors.textPrimary,
      background: colors.surface,
      outline: 'none',
    },
    input: {
      padding: '0.6rem 0.75rem',
      border: `1px solid ${colors.border}`,
      borderRadius: radii.md,
      fontSize: font.caption,
      color: colors.textPrimary,
      background: colors.surface,
      outline: 'none',
    },
    syncBadge: {
      padding: '0.45rem 0.7rem',
      borderRadius: radii.pill,
      border: `1px solid ${colors.border}`,
      background: colors.surface,
      color: colors.textSecondary,
      fontSize: font.caption,
      whiteSpace: 'nowrap' as const,
    },
    content: {
      flex: 1,
      overflowY: 'auto' as const,
      paddingRight: '0.15rem',
    },
    statsGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(5, minmax(150px, 1fr))',
      gap: '0.75rem',
      marginBottom: '1rem',
    },
    statCard: (bg: string, color: string) => ({
      background: `linear-gradient(180deg, ${colors.surface} 0%, ${colors.surfaceMuted} 100%)`,
      borderRadius: radii.lg,
      padding: '1rem',
      boxShadow: shadows.soft,
      border: `1px solid ${colors.border}`,
      borderTop: `3px solid ${color}`,
      minHeight: '118px',
      display: 'flex',
      flexDirection: 'column' as const,
      justifyContent: 'space-between',
    }),
    statLabel: {
      fontSize: font.caption,
      color: colors.textSecondary,
      marginBottom: '0.45rem',
      fontWeight: 650,
    },
    statValue: (color: string) => ({
      fontSize: '1.32rem',
      fontWeight: 760,
      color: color,
      marginBottom: '0.3rem',
      letterSpacing: 0,
    }),
    statSub: {
      fontSize: '0.72rem',
      color: colors.textMuted,
      lineHeight: 1.45,
    },
    card: {
      background: colors.surface,
      borderRadius: radii.lg,
      padding: '1rem',
      boxShadow: shadows.soft,
      border: `1px solid ${colors.border}`,
      marginBottom: '1rem',
    },
    cardTitle: {
      fontSize: font.section,
      fontWeight: 720,
      color: colors.textPrimary,
      marginBottom: '1rem',
      display: 'flex',
      alignItems: 'center',
      gap: '0.5rem',
    },
    tableWrap: {
      overflowX: 'auto' as const,
      border: `1px solid ${colors.border}`,
      borderRadius: radii.md,
      background: colors.surface,
    },
    table: {
      width: '100%',
      borderCollapse: 'collapse' as const,
      fontSize: font.caption,
    },
    th: {
      background: colors.surfaceMuted,
      padding: '0.68rem 0.75rem',
      textAlign: 'left' as const,
      fontSize: '0.72rem',
      fontWeight: 720,
      color: colors.textSecondary,
      borderBottom: `1px solid ${colors.border}`,
    },
    td: {
      padding: '0.66rem 0.75rem',
      borderBottom: `1px solid ${colors.border}`,
      color: colors.textPrimary,
      verticalAlign: 'top' as const,
    },
    groupCell: {
      background: colors.surfaceMuted,
      color: colors.textPrimary,
      fontWeight: 720,
    },
    printBtn: {
      position: 'fixed' as const,
      bottom: '1.4rem',
      right: '1.4rem',
      padding: '0.82rem 1.25rem',
      background: colors.blue,
      color: 'white',
      border: `1px solid ${colors.blue}`,
      borderRadius: radii.pill,
      cursor: 'pointer',
      fontWeight: 720,
      fontSize: font.body,
      boxShadow: '0 18px 34px rgba(37, 99, 235, 0.28)',
      zIndex: 1000,
    },
  };

  // Print report in a dedicated A4 document.
  const handlePrint = () => {
    const isDaily = reportType === 'daily';
    const firstDate = dailyReports[0]?.date || selectedDate;
    const lastDate = dailyReports[dailyReports.length - 1]?.date || selectedDate;
    const title = isDaily
      ? `${t('finance.print.dailyTitle')} ${selectedDate}`
      : `${t('finance.print.summaryTitle')} ${firstDate} - ${lastDate}`;
    const reportRows = dailyReports.map(report => `
      <tr>
        <td>${htmlEscape(report.date)}</td>
        <td class="num">${money(report.totalSales)}</td>
        <td>${htmlEscape(formatOrderSummary(report, t))}</td>
        <td class="num">${money(report.cashPayment)}</td>
        <td class="num">${money(report.cardPayment)}</td>
        <td class="num">${money(report.reservationPrepaymentAmount)}</td>
        <td class="num">${money(report.purchaseAmount)}</td>
        <td class="num">${money(report.expenseAmount)}</td>
        <td class="num ${report.profit >= 0 ? 'positive' : 'negative'}">${money(report.profit)}</td>
        <td class="num">${report.handoverAmount !== undefined ? money(report.handoverAmount) : '-'}</td>
        <td class="num ${report.difference === undefined || report.difference === 0 ? '' : report.difference > 0 ? 'warning' : 'negative'}">
          ${report.difference !== undefined ? signedMoney(report.difference) : '-'}
        </td>
      </tr>
    `).join('');

    const expenseGroupRows = dailyExpenseBreakdown.groups.map(group => `
      <tr class="group-row">
        <td colspan="5"><strong>${htmlEscape(getExpenseTypeLabel(group.type))} - ${htmlEscape(getExpenseGroupTitle(group.title))}</strong></td>
        <td class="num"><strong>${group.count}</strong></td>
        <td class="num"><strong>${money(group.amount)}</strong></td>
      </tr>
      ${group.details.map((expense, index) => `
      <tr class="detail-row">
        <td>${index + 1}</td>
        <td>${htmlEscape(getExpenseTypeLabel(expense.type))}</td>
        <td>${htmlEscape(expense.orderNumber || expense.category || '-')}</td>
        <td>${htmlEscape(expense.description || '-')}</td>
        <td class="num">${expense.quantity !== undefined ? expense.quantity : '-'}</td>
        <td class="num">${expense.unitPrice !== undefined ? money(expense.unitPrice) : '-'}</td>
        <td class="num">${money(expense.amount)}</td>
      </tr>
      `).join('')}
    `).join('');

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert(t('finance.alert.allowPopup'));
      return;
    }

    printWindow.document.write(`
      <!doctype html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>${htmlEscape(title)}</title>
        <style>
          @page { size: A4; margin: 10mm; }
          * { box-sizing: border-box; }
          body { font-family: Arial, "Microsoft YaHei", sans-serif; color: #111827; margin: 0; font-size: 10.5px; line-height: 1.18; }
          h1 { font-size: 18px; text-align: center; margin: 0 0 4px; }
          h2 { font-size: 12px; margin: 10px 0 5px; border-bottom: 1px solid #d1d5db; padding-bottom: 3px; }
          .meta { text-align: center; color: #6b7280; margin-bottom: 8px; }
          .summary { display: grid; grid-template-columns: repeat(5, 1fr); gap: 5px; margin-bottom: 8px; }
          .box { border: 1px solid #d1d5db; padding: 4px 5px; min-height: 38px; }
          .difference-box { border: 2px solid #f59e0b; background: #fffbeb; }
          .label { color: #6b7280; font-size: 9px; margin-bottom: 2px; }
          .value { font-size: 12px; font-weight: 700; }
          .difference-value { font-size: 14px; font-weight: 800; }
          table { width: 100%; border-collapse: collapse; }
          th, td { border: 1px solid #d1d5db; padding: 3px 4px; vertical-align: top; }
          th { background: #f3f4f6; font-weight: 700; }
          .num { text-align: right; white-space: nowrap; }
          .group-row td { background: #f9fafb; font-weight: 700; padding-top: 4px; padding-bottom: 4px; }
          .detail-row td { font-size: 10px; padding-top: 2px; padding-bottom: 2px; }
          .positive { color: #047857; }
          .negative { color: #dc2626; }
          .warning { color: #d97706; }
          .footer { margin-top: 18px; display: flex; justify-content: space-between; color: #374151; }
          .sign { width: 160px; border-top: 1px solid #111827; padding-top: 4px; text-align: center; }
          @media print { button { display: none; } }
        </style>
      </head>
      <body>
        <h1>${htmlEscape(title)}</h1>
        <div class="meta">${htmlEscape(t('finance.printTime'))}: ${new Date().toLocaleString(language === 'es-NI' ? 'es-NI' : 'zh-CN', { hour12: false })}</div>
        <div class="summary">
          <div class="box"><div class="label">${htmlEscape(t('finance.sales'))}</div><div class="value">${money(summary.totalSales)}</div></div>
          <div class="box"><div class="label">${htmlEscape(t('finance.cash'))}</div><div class="value">${money(summary.cashPayment)}</div></div>
          <div class="box"><div class="label">${htmlEscape(t('finance.card'))}</div><div class="value">${money(summary.cardPayment)}</div></div>
          <div class="box"><div class="label">${htmlEscape(t('finance.orders'))}</div><div class="value">${htmlEscape(formatOrderSummary(summary, t))}</div></div>
          <div class="box"><div class="label">${htmlEscape(t('finance.profitWithDifference'))}</div><div class="value">${money(summary.profit)}</div></div>
          <div class="box"><div class="label">${htmlEscape(t('finance.handoverCash'))}</div><div class="value">${summary.hasHandover ? money(summary.handoverAmount) : '-'}</div><div class="label">${htmlEscape(t('finance.difference'))}: ${summary.hasHandover ? signedMoney(summary.difference) : htmlEscape(t('finance.notHandedOver'))}</div></div>
          <div class="box"><div class="label">${htmlEscape(t('finance.reservationPrepayment'))}</div><div class="value">${money(summary.reservationPrepaymentAmount)}</div></div>
          <div class="box"><div class="label">${htmlEscape(t('finance.operatingExpense'))}</div><div class="value">${money(summary.expenseAmount)}</div></div>
          <div class="box"><div class="label">${htmlEscape(t('finance.purchasePayment'))}</div><div class="value">${money(summary.purchaseAmount)}</div></div>
          <div class="box"><div class="label">${htmlEscape(t('finance.supplierDebtCurrent'))}</div><div class="value">${money(summary.supplierDebt)}</div></div>
        </div>
        <h2>${htmlEscape(t(isDaily ? 'finance.print.dailyReconciliation' : 'finance.print.dateSummary'))}</h2>
        <table>
          <thead><tr><th>${htmlEscape(t('finance.date'))}</th><th>${htmlEscape(t('finance.sales'))}</th><th>${htmlEscape(t('finance.orders'))}</th><th>${htmlEscape(t('finance.cash'))}</th><th>${htmlEscape(t('finance.card'))}</th><th>${htmlEscape(t('finance.reservationPrepayment'))}</th><th>${htmlEscape(t('finance.purchasePayment'))}</th><th>${htmlEscape(t('finance.operatingExpense'))}</th><th>${htmlEscape(t('finance.profit'))}</th><th>${htmlEscape(t('finance.handover'))}</th><th>${htmlEscape(t('finance.difference'))}</th></tr></thead>
          <tbody>${reportRows}</tbody>
        </table>
        ${isDaily ? `
          <h2>${htmlEscape(t('finance.dailyExpenseDetails'))}</h2>
          <table>
            <thead><tr><th style="width: 32px;">#</th><th style="width: 78px;">${htmlEscape(t('finance.type'))}</th><th style="width: 96px;">${htmlEscape(t('finance.invoiceOrCategory'))}</th><th>${htmlEscape(t('finance.itemOrDescription'))}</th><th style="width: 58px;">${htmlEscape(t('finance.quantity'))}</th><th style="width: 76px;">${htmlEscape(t('finance.unitPrice'))}</th><th style="width: 88px;">${htmlEscape(t('finance.amount'))}</th></tr></thead>
            <tbody>${expenseGroupRows || `<tr><td colspan="7" style="text-align:center;color:#6b7280;">${htmlEscape(t('finance.noDailyExpenses'))}</td></tr>`}</tbody>
          </table>
        ` : ''}
        <div class="footer"><div class="sign">${htmlEscape(t('finance.preparedBy'))}</div><div class="sign">${htmlEscape(t('finance.reviewedBy'))}</div></div>
      </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => printWindow.print(), 300);
  };

  return (
    <div className="financial-report-page" style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>{t('finance.title')}</h1>
        <div style={styles.controls}>
          <select value={reportType} onChange={(e) => setReportType(e.target.value as any)} style={styles.select}>
            <option value="daily">{t('finance.report.daily')}</option>
            <option value="weekly">{t('finance.report.weekly')}</option>
            <option value="monthly">{t('finance.report.monthly')}</option>
            <option value="custom">{t('finance.report.custom')}</option>
          </select>

          {reportType === 'daily' && (
            <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} style={styles.input} />
          )}

          {reportType === 'monthly' && (
            <input type="month" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} style={styles.input} />
          )}

          {reportType === 'custom' && (
            <>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={styles.input} />
              <span>{t('finance.to')}</span>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={styles.input} />
            </>
          )}

          {lastSyncedAt && (
            <span style={styles.syncBadge}>
              {t('finance.lastSync')} {lastSyncedAt.toLocaleTimeString('es-NI', { hour12: false })}
            </span>
          )}

          <button onClick={() => refreshFinancialData(true)} disabled={isRefreshing} style={{ ...styles.btn(isRefreshing ? colors.textMuted : colors.blue, 'white'), cursor: isRefreshing ? 'not-allowed' : 'pointer' }}>
            {isRefreshing ? t('finance.refreshing') : t('finance.refresh')}
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: colors.textSecondary }}>{t('finance.loading')}</div>
      ) : (
        <div style={styles.content}>
          <div style={styles.statsGrid}>
            <div style={styles.statCard(colors.blue, colors.blue)}><div style={styles.statLabel}>{t('finance.sales')}</div><div style={styles.statValue(colors.blue)}>{money(summary.totalSales)}</div><div style={styles.statSub}>{t('finance.orders.completed')} {summary.completedOrders}</div></div>
            <div style={styles.statCard(colors.success, colors.success)}><div style={styles.statLabel}>{t('finance.cashIncome')}</div><div style={styles.statValue(colors.success)}>{money(summary.cashPayment)}</div><div style={styles.statSub}>{t('finance.share')} {summary.totalSales > 0 ? ((summary.cashPayment / summary.totalSales) * 100).toFixed(1) : 0}%</div></div>
            <div style={styles.statCard('#7c3aed', '#7c3aed')}><div style={styles.statLabel}>{t('finance.cardIncome')}</div><div style={styles.statValue('#7c3aed')}>{money(summary.cardPayment)}</div><div style={styles.statSub}>{t('finance.share')} {summary.totalSales > 0 ? ((summary.cardPayment / summary.totalSales) * 100).toFixed(1) : 0}%</div></div>
            <div style={styles.statCard(colors.teal, colors.teal)}><div style={styles.statLabel}>{t('finance.orders')}</div><div style={{ ...styles.statValue(colors.teal), fontSize: '0.86rem', lineHeight: 1.35 }}>{formatOrderSummary(summary, t)}</div><div style={styles.statSub}>Mesa / Barra / Delivery / Reserva</div></div>
            <div style={styles.statCard(summary.profit >= 0 ? colors.success : colors.danger, summary.profit >= 0 ? colors.success : colors.danger)}><div style={styles.statLabel}>{t('finance.profit')}</div><div style={styles.statValue(summary.profit >= 0 ? colors.success : colors.danger)}>{money(summary.profit)}</div><div style={styles.statSub}>{t('finance.profitFormula')} | {t('finance.profitMargin')} {summary.totalSales > 0 ? ((summary.profit / summary.totalSales) * 100).toFixed(1) : 0}%</div></div>
            <div style={styles.statCard(colors.textSecondary, colors.textSecondary)}><div style={styles.statLabel}>{t('finance.handoverCash')}</div><div style={styles.statValue(colors.textSecondary)}>{summary.hasHandover ? money(summary.handoverAmount) : '-'}</div><div style={styles.statSub}>{summary.fundingGap > 0 ? `${t('finance.expected')} ${money(summary.expectedCashHandover)} / ${t('finance.difference')} ${summary.hasHandover ? signedMoney(summary.difference) : '-'} / ${t('finance.fundingGap')} ${money(summary.fundingGap)}` : `${t('finance.expectedCash')} ${money(summary.expectedCashHandover)} / ${t('finance.difference')} ${summary.hasHandover ? signedMoney(summary.difference) : '-'}`}</div></div>
            <div style={styles.statCard('#db2777', '#db2777')}><div style={styles.statLabel}>{t('finance.reservationPrepayment')}</div><div style={styles.statValue('#db2777')}>{money(summary.reservationPrepaymentAmount)}</div><div style={styles.statSub}>{t('finance.reservationPrepaymentHint')}</div></div>
            <div style={styles.statCard(colors.danger, colors.danger)}><div style={styles.statLabel}>{t('finance.operatingExpense')}</div><div style={styles.statValue(colors.danger)}>{money(summary.expenseAmount)}</div><div style={styles.statSub}>{t('finance.operatingOutflow')}</div></div>
            <div style={styles.statCard(colors.amber, colors.amber)}><div style={styles.statLabel}>{t('finance.purchasePayment')}</div><div style={styles.statValue(colors.amber)}>{money(summary.purchaseAmount)}</div><div style={styles.statSub}>{t('finance.paidPurchases')}</div></div>
            <div style={styles.statCard(colors.amber, colors.amber)}><div style={styles.statLabel}>{t('finance.supplierDebt')}</div><div style={styles.statValue(colors.amber)}>{money(summary.supplierDebt)}</div><div style={styles.statSub}>{t('finance.outstandingDebt')}</div></div>
          </div>

          <div style={styles.card}>
            <div style={styles.cardTitle}>{t('finance.reportDetails')}</div>
            {dailyReports.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem', color: colors.textMuted }}>{t('finance.noData')}</div>
            ) : (
              <div style={styles.tableWrap}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>{t('finance.date')}</th>
                      <th style={{ ...styles.th, textAlign: 'right' }}>{t('finance.sales')}</th>
                      <th style={styles.th}>{t('finance.orders')}</th>
                      <th style={{ ...styles.th, textAlign: 'right' }}>{t('finance.cash')}</th>
                      <th style={{ ...styles.th, textAlign: 'right' }}>{t('finance.card')}</th>
                      <th style={{ ...styles.th, textAlign: 'right' }}>{t('finance.reservationPrepayment')}</th>
                      <th style={{ ...styles.th, textAlign: 'right' }}>{t('finance.purchasePayment')}</th>
                      <th style={{ ...styles.th, textAlign: 'right' }}>{t('finance.expense')}</th>
                      <th style={{ ...styles.th, textAlign: 'right' }}>{t('finance.profit')}</th>
                      <th style={{ ...styles.th, textAlign: 'right' }}>{t('finance.handover')}</th>
                      <th style={{ ...styles.th, textAlign: 'right' }}>{t('finance.difference')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dailyReports.map((report, index) => (
                      <tr key={index}>
                        <td style={styles.td}>{report.date}</td>
                        <td style={{ ...styles.td, textAlign: 'right', fontWeight: '600' }}>{money(report.totalSales)}</td>
                        <td style={styles.td}>{formatOrderSummary(report, t)}</td>
                        <td style={{ ...styles.td, textAlign: 'right', color: colors.success }}>{money(report.cashPayment)}</td>
                        <td style={{ ...styles.td, textAlign: 'right', color: '#7c3aed' }}>{money(report.cardPayment)}</td>
                        <td style={{ ...styles.td, textAlign: 'right', color: '#db2777' }}>{money(report.reservationPrepaymentAmount)}</td>
                        <td style={{ ...styles.td, textAlign: 'right', color: colors.amber }}>{money(report.purchaseAmount)}</td>
                        <td style={{ ...styles.td, textAlign: 'right', color: colors.danger }}>{money(report.expenseAmount)}</td>
                        <td style={{ ...styles.td, textAlign: 'right', fontWeight: 'bold', color: report.profit >= 0 ? colors.success : colors.danger }}>{money(report.profit)}</td>
                        <td style={{ ...styles.td, textAlign: 'right' }}>{report.handoverAmount !== undefined ? money(report.handoverAmount) : '-'}</td>
                        <td style={{ ...styles.td, textAlign: 'right', fontWeight: '600', color: report.difference === 0 ? colors.success : report.difference! > 0 ? colors.amber : colors.danger }}>{report.difference !== undefined ? signedMoney(report.difference) : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {reportType === 'daily' && (
            <>
              <div style={styles.card}>
                <div style={styles.cardTitle}>{t('finance.dailyExpenseDetails')}</div>
                {dailyExpenseBreakdown.groups.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '2rem', color: colors.textMuted }}>{t('finance.noDailyExpenses')}</div>
                ) : (
                  <div style={styles.tableWrap}>
                    <table style={styles.table}>
                      <thead>
                        <tr>
                          <th style={{ ...styles.th, width: '4rem' }}>#</th>
                          <th style={styles.th}>{t('finance.type')}</th>
                          <th style={styles.th}>{t('finance.invoiceOrCategory')}</th>
                          <th style={styles.th}>{t('finance.itemOrDescription')}</th>
                          <th style={{ ...styles.th, textAlign: 'right' }}>{t('finance.quantity')}</th>
                          <th style={{ ...styles.th, textAlign: 'right' }}>{t('finance.unitPrice')}</th>
                          <th style={{ ...styles.th, textAlign: 'right' }}>{t('finance.amount')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dailyExpenseBreakdown.groups.map((group, groupIndex) => (
                          <React.Fragment key={`${group.type}-${group.category}-${groupIndex}`}>
                            <tr>
                              <td style={{ ...styles.td, ...styles.groupCell }} colSpan={5}>
                                <strong>{getExpenseTypeLabel(group.type)} - {getExpenseGroupTitle(group.title)}</strong>
                              </td>
                              <td style={{ ...styles.td, ...styles.groupCell, color: colors.textSecondary }}>
                                {group.count} {t('finance.recordsUnit')}
                              </td>
                              <td style={{ ...styles.td, ...styles.groupCell, textAlign: 'right', fontWeight: '700', color: group.type === 'purchase' ? colors.amber : colors.danger }}>
                                {money(group.amount)}
                              </td>
                            </tr>
                            {group.details.map((expense, index) => (
                              <tr key={expense.id || `${groupIndex}-${index}`}>
                                <td style={styles.td}>{index + 1}</td>
                                <td style={styles.td}>{getExpenseTypeLabel(expense.type)}</td>
                                <td style={styles.td}>{expense.orderNumber || expense.category}</td>
                                <td style={styles.td}>{expense.description}</td>
                                <td style={{ ...styles.td, textAlign: 'right' }}>{expense.quantity !== undefined ? expense.quantity : '-'}</td>
                                <td style={{ ...styles.td, textAlign: 'right' }}>{expense.unitPrice !== undefined ? money(expense.unitPrice) : '-'}</td>
                                <td style={{ ...styles.td, textAlign: 'right', fontWeight: '600', color: expense.type === 'purchase' ? colors.amber : colors.danger }}>{money(expense.amount)}</td>
                              </tr>
                            ))}
                          </React.Fragment>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}

          <button onClick={handlePrint} style={styles.printBtn}>{t('finance.printReport')}</button>
        </div>
      )}

      <style>{`
        @media print {
          body * { visibility: hidden; }
          .financial-report-page, .financial-report-page * { visibility: visible; }
          .financial-report-page { position: absolute; left: 0; top: 0; width: 100%; padding: 20mm; background: white; }
          button { display: none !important; }
        }
      `}</style>
    </div>
  );
};
export default FinancialReportsModule;
