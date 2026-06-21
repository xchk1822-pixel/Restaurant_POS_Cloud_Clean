import React, { useState, useEffect } from 'react';
import { dataManager } from '../../services/dataManager';
import { dataService } from '../../services/DataService';
import { smartGetDocuments } from '../../services/smartSyncService';
import { getLocalDateString } from '../../utils/exchangeRate';
import { buildDailyExpenseBreakdown, calculateFinancialReportTotals, calculateOrderStatusSummary, getExpenseDateKey, getLatestHandoverAmountForDate, getOrderCollectedAmount, getOrderFinancialDateKey, getOrderPaymentBreakdown, isPurchaseRelatedExpense } from '../../utils/financeMetrics';
import { colors, font, radii, shadows } from '../../styles/uiTokens';

interface DailyReport {
  date: string;
  totalSales: number;
  orderCount: number;
  completedOrders: number;
  cancelledOrders: number;
  cancelledItems: number;
  cashPayment: number;
  cardPayment: number;
  purchaseAmount: number;
  expenseAmount: number;
  profit: number;
  handoverAmount?: number;
  difference?: number;
}

interface FinancialReportsModuleProps {
  orders?: any[];
}

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

const formatTodayOrders = (report: Pick<DailyReport, 'completedOrders' | 'cancelledOrders' | 'cancelledItems'>): string =>
  `\u5b8c\u6210 ${report.completedOrders} \u5355 / \u53d6\u6d88\u6574\u5355 ${report.cancelledOrders} \u5355 / \u53d6\u6d88\u83dc\u54c1 ${report.cancelledItems} \u9053`;

const htmlEscape = (value: any): string => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

const FinancialReportsModule: React.FC<FinancialReportsModuleProps> = ({ orders: propOrders }) => {
  const expenseCategoryStorageKey = dataService.getStoreKey('expense_categories');
  const [orders, setOrders] = useState<any[]>(() => {
    return propOrders || dataManager.getData('orders');
  });
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
  const [startDate, setStartDate] = useState(getLocalDateString(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)));
  const [endDate, setEndDate] = useState(getLocalDateString());
  const [dailyReports, setDailyReports] = useState<DailyReport[]>([]);
  const loading = false;
  const [dataVersion, setDataVersion] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);

  // Low-frequency manager data: fetch once on entry, then manual refresh.
  const refreshFinancialData = React.useCallback(async () => {
    setIsRefreshing(true);
    try {
      const [cloudOrders, cloudExpenses, cloudPurchases, cloudHandovers, cloudExpenseCategories] = await Promise.all([
        smartGetDocuments('pos_orders', true),
        smartGetDocuments('expenses', true),
        smartGetDocuments('purchase_orders', true),
        smartGetDocuments('handovers', true),
        smartGetDocuments('expense_categories', true),
      ]);

      await Promise.all([
        dataManager.saveData('orders', cloudOrders, { syncFirestore: false, notify: false }),
        dataManager.saveData('expenses', cloudExpenses, { syncFirestore: false, notify: false }),
        dataManager.saveData('purchases', cloudPurchases, { syncFirestore: false, notify: false }),
        dataManager.saveData('handovers', cloudHandovers, { syncFirestore: false, notify: false }),
      ]);

      dataManager.clearCache();
      setOrders(cloudOrders);
      if (cloudExpenseCategories.length > 0) {
        setExpenseCategories(cloudExpenseCategories);
        localStorage.setItem(expenseCategoryStorageKey, JSON.stringify(cloudExpenseCategories));
      }
      setDataVersion(version => version + 1);
      setLastSyncedAt(new Date());
    } catch (error) {
      console.error('\u5237\u65b0\u8d22\u52a1\u62a5\u8868\u6570\u636e\u5931\u8d25:', error);
      alert('\u5237\u65b0\u8d22\u52a1\u62a5\u8868\u6570\u636e\u5931\u8d25\uff0c\u8bf7\u68c0\u67e5\u7f51\u7edc\u540e\u91cd\u8bd5');
    } finally {
      setIsRefreshing(false);
    }
  }, [expenseCategoryStorageKey]);

  useEffect(() => {
    refreshFinancialData();
  }, [refreshFinancialData]);

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

    const expenses = dataManager.getData('expenses');

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
        return sum + (exp.amount || 0);
      }
      return sum;
    }, 0);

    // Read shift handover records.
    const handovers = dataManager.getData('handovers');
    const handoverAmount = getLatestHandoverAmountForDate(handovers, date);
    const { totalSales, profit, difference } = calculateFinancialReportTotals({
      cashPayment,
      cardPayment,
      purchaseAmount,
      expenseAmount,
      handoverAmount,
    });

    return {
      date,
      totalSales,
      orderCount,
      completedOrders: orderStatusSummary.completedOrders,
      cancelledOrders: orderStatusSummary.cancelledOrders,
      cancelledItems: orderStatusSummary.cancelledItems,
      cashPayment,
      cardPayment,
      purchaseAmount,
      expenseAmount,
      profit,
      handoverAmount,
      difference
    };
  }, [orders]);

  // Load report data.
  const loadReports = React.useCallback(() => {
    if (reportType === 'daily') {
      setDailyReports([generateDailyReport(selectedDate)]);
    } else if (reportType === 'weekly' || reportType === 'monthly' || reportType === 'custom') {
      const reports: DailyReport[] = [];
      const start = new Date(reportType === 'custom' ? startDate :
        reportType === 'weekly' ? Date.now() - 7 * 24 * 60 * 60 * 1000 :
        Date.now() - 30 * 24 * 60 * 60 * 1000);
      const end = new Date(reportType === 'custom' ? endDate : Date.now());

      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dateStr = getLocalDateString(d);
        reports.push(generateDailyReport(dateStr));
      }
      setDailyReports(reports);
    }
  }, [reportType, selectedDate, startDate, endDate, generateDailyReport]);

  useEffect(() => {
    loadReports();
  }, [loadReports, dataVersion]);

  const supplierDebtTotal = getSupplierDebtTotal(dataManager.getData('purchases'));

  // Calculate summary totals.
  const summary = dailyReports.reduce((acc, report) => ({
    totalSales: acc.totalSales + report.totalSales,
    orderCount: acc.orderCount + report.orderCount,
    completedOrders: acc.completedOrders + report.completedOrders,
    cancelledOrders: acc.cancelledOrders + report.cancelledOrders,
    cancelledItems: acc.cancelledItems + report.cancelledItems,
    cashPayment: acc.cashPayment + report.cashPayment,
    cardPayment: acc.cardPayment + report.cardPayment,
    purchaseAmount: acc.purchaseAmount + report.purchaseAmount,
    expenseAmount: acc.expenseAmount + report.expenseAmount,
    profit: acc.profit + report.profit,
    difference: acc.difference + (report.difference || 0),
    handoverAmount: acc.handoverAmount + (report.handoverAmount || 0),
    hasHandover: acc.hasHandover || report.handoverAmount !== undefined,
    supplierDebt: supplierDebtTotal
  }), { totalSales: 0, orderCount: 0, completedOrders: 0, cancelledOrders: 0, cancelledItems: 0, cashPayment: 0, cardPayment: 0, purchaseAmount: 0, expenseAmount: 0, profit: 0, difference: 0, handoverAmount: 0, hasHandover: false, supplierDebt: supplierDebtTotal });
  const dailyExpenseBreakdown = reportType === 'daily'
    ? buildDailyExpenseBreakdown(dataManager.getData('expenses'), selectedDate, expenseCategories, dataManager.getData('purchases'))
    : { summaries: [], details: [], groups: [] };

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
    const title = isDaily ? `\u8d22\u52a1\u65e5\u62a5 ${selectedDate}` : `\u8d22\u52a1\u6c47\u603b\u62a5\u8868 ${firstDate} - ${lastDate}`;
    const reportRows = dailyReports.map(report => `
      <tr>
        <td>${htmlEscape(report.date)}</td>
        <td class="num">${money(report.totalSales)}</td>
        <td>${htmlEscape(formatTodayOrders(report))}</td>
        <td class="num">${money(report.cashPayment)}</td>
        <td class="num">${money(report.cardPayment)}</td>
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
        <td colspan="5"><strong>${htmlEscape(group.typeLabel)} - ${htmlEscape(group.title)}</strong></td>
        <td class="num"><strong>${group.count}</strong></td>
        <td class="num"><strong>${money(group.amount)}</strong></td>
      </tr>
      ${group.details.map((expense, index) => `
      <tr class="detail-row">
        <td>${index + 1}</td>
        <td>${htmlEscape(expense.typeLabel)}</td>
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
      alert('\u8bf7\u5141\u8bb8\u5f39\u51fa\u7a97\u53e3\u4ee5\u6253\u5370\u8d22\u52a1\u62a5\u8868');
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
        <div class="meta">\u6253\u5370\u65f6\u95f4: ${new Date().toLocaleString('es-NI', { hour12: false })}</div>
        <div class="summary">
          <div class="box"><div class="label">\u8425\u4e1a\u989d</div><div class="value">${money(summary.totalSales)}</div></div>
          <div class="box"><div class="label">\u73b0\u91d1</div><div class="value">${money(summary.cashPayment)}</div></div>
          <div class="box"><div class="label">\u5237\u5361</div><div class="value">${money(summary.cardPayment)}</div></div>
          <div class="box"><div class="label">\u8ba2\u5355</div><div class="value">${htmlEscape(formatTodayOrders(summary))}</div></div>
          <div class="box"><div class="label">\u76c8\u4e8f\uff08\u542b\u8bef\u5dee\uff09</div><div class="value">${money(summary.profit)}</div></div>
          <div class="box"><div class="label">\u5b9e\u4ea4\u73b0\u91d1</div><div class="value">${summary.hasHandover ? money(summary.handoverAmount) : '-'}</div></div>
          <div class="box difference-box"><div class="label">\u4ea4\u73ed\u8bef\u5dee\uff08\u5b9e\u4ea4-\u5e94\u4ea4\u73b0\u91d1\uff09</div><div class="value difference-value">${summary.hasHandover ? signedMoney(summary.difference) : '\u672a\u4ea4\u73ed'}</div></div>
          <div class="box"><div class="label">\u65e5\u5e38\u5f00\u652f</div><div class="value">${money(summary.expenseAmount)}</div></div>
          <div class="box"><div class="label">\u91c7\u8d2d\u4ed8\u6b3e</div><div class="value">${money(summary.purchaseAmount)}</div></div>
          <div class="box"><div class="label">\u4f9b\u5e94\u5546\u8d27\u6b3e\uff08\u5f53\u524d\u5269\u4f59\u6b20\u6b3e\uff09</div><div class="value">${money(summary.supplierDebt)}</div></div>
        </div>
        <h2>${isDaily ? '\u5f53\u65e5\u4ea4\u73ed\u5bf9\u8d26' : '\u65e5\u671f\u6c47\u603b'}</h2>
        <table>
          <thead><tr><th>\u65e5\u671f</th><th>\u8425\u4e1a\u989d</th><th>\u8ba2\u5355</th><th>\u73b0\u91d1</th><th>\u5237\u5361</th><th>\u91c7\u8d2d\u4ed8\u6b3e</th><th>\u65e5\u5e38\u5f00\u652f</th><th>\u76c8\u4e8f</th><th>\u5b9e\u4ea4</th><th>\u8bef\u5dee</th></tr></thead>
          <tbody>${reportRows}</tbody>
        </table>
        ${isDaily ? `
          <h2>\u5f53\u5929\u5f00\u652f\u548c\u91c7\u8d2d\u5355\u660e\u7ec6</h2>
          <table>
            <thead><tr><th style="width: 32px;">#</th><th style="width: 78px;">\u7c7b\u578b</th><th style="width: 96px;">\u5355\u53f7/\u7c7b\u522b</th><th>\u5546\u54c1/\u8bf4\u660e</th><th style="width: 58px;">\u6570\u91cf</th><th style="width: 76px;">\u5355\u4ef7</th><th style="width: 88px;">\u91d1\u989d</th></tr></thead>
            <tbody>${expenseGroupRows || '<tr><td colspan="7" style="text-align:center;color:#6b7280;">\u5f53\u5929\u6ca1\u6709\u5f00\u652f\u8bb0\u5f55</td></tr>'}</tbody>
          </table>
        ` : ''}
        <div class="footer"><div class="sign">\u5236\u8868\u4eba</div><div class="sign">\u5ba1\u6838\u4eba</div></div>
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
        <h1 style={styles.title}>{'\u8d22\u52a1\u62a5\u8868'}</h1>
        <div style={styles.controls}>
          <select value={reportType} onChange={(e) => setReportType(e.target.value as any)} style={styles.select}>
            <option value="daily">{'\u65e5\u62a5\u8868'}</option>
            <option value="weekly">{'\u5468\u62a5\u8868'}</option>
            <option value="monthly">{'\u6708\u62a5\u8868'}</option>
            <option value="custom">{'\u81ea\u5b9a\u4e49'}</option>
          </select>

          {reportType === 'daily' && (
            <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} style={styles.input} />
          )}

          {reportType === 'custom' && (
            <>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={styles.input} />
              <span>{'\u81f3'}</span>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={styles.input} />
            </>
          )}

          {lastSyncedAt && (
            <span style={styles.syncBadge}>
              {'\u6700\u540e\u540c\u6b65 '} {lastSyncedAt.toLocaleTimeString('es-NI', { hour12: false })}
            </span>
          )}

          <button onClick={refreshFinancialData} disabled={isRefreshing} style={{ ...styles.btn(isRefreshing ? colors.textMuted : colors.blue, 'white'), cursor: isRefreshing ? 'not-allowed' : 'pointer' }}>
            {isRefreshing ? '\u540c\u6b65\u4e2d...' : '\u5237\u65b0\u4e91\u7aef\u6570\u636e'}
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: colors.textSecondary }}>{'\u52a0\u8f7d\u4e2d...'}</div>
      ) : (
        <div style={styles.content}>
          <div style={styles.statsGrid}>
            <div style={styles.statCard(colors.blue, colors.blue)}><div style={styles.statLabel}>{'\u8425\u4e1a\u989d'}</div><div style={styles.statValue(colors.blue)}>{money(summary.totalSales)}</div><div style={styles.statSub}>{'\u5b8c\u6210'} {summary.completedOrders} {'\u5355'}</div></div>
            <div style={styles.statCard(colors.success, colors.success)}><div style={styles.statLabel}>{'\u73b0\u91d1\u6536\u5165'}</div><div style={styles.statValue(colors.success)}>{money(summary.cashPayment)}</div><div style={styles.statSub}>{'\u5360\u6bd4'} {summary.totalSales > 0 ? ((summary.cashPayment / summary.totalSales) * 100).toFixed(1) : 0}%</div></div>
            <div style={styles.statCard('#7c3aed', '#7c3aed')}><div style={styles.statLabel}>{'\u5237\u5361\u6536\u5165'}</div><div style={styles.statValue('#7c3aed')}>{money(summary.cardPayment)}</div><div style={styles.statSub}>{'\u5360\u6bd4'} {summary.totalSales > 0 ? ((summary.cardPayment / summary.totalSales) * 100).toFixed(1) : 0}%</div></div>
            <div style={styles.statCard(colors.teal, colors.teal)}><div style={styles.statLabel}>{'\u8ba2\u5355'}</div><div style={{ ...styles.statValue(colors.teal), fontSize: '1rem' }}>{'\u5b8c\u6210'} {summary.completedOrders} {'\u5355'}</div><div style={styles.statSub}>{'\u53d6\u6d88\u6574\u5355'} {summary.cancelledOrders} {'\u5355'} / {'\u53d6\u6d88\u83dc\u54c1'} {summary.cancelledItems} {'\u9053'}</div></div>
            <div style={styles.statCard(summary.profit >= 0 ? colors.success : colors.danger, summary.profit >= 0 ? colors.success : colors.danger)}><div style={styles.statLabel}>{'\u76c8\u4e8f'}</div><div style={styles.statValue(summary.profit >= 0 ? colors.success : colors.danger)}>{money(summary.profit)}</div><div style={styles.statSub}>{'\u8425\u4e1a\u989d - \u91c7\u8d2d\u4ed8\u6b3e - \u65e5\u5e38\u5f00\u652f + \u8bef\u5dee'} | {'\u76c8\u4e8f\u7387'} {summary.totalSales > 0 ? ((summary.profit / summary.totalSales) * 100).toFixed(1) : 0}%</div></div>
            <div style={styles.statCard(colors.textSecondary, colors.textSecondary)}><div style={styles.statLabel}>{'\u5b9e\u4ea4\u73b0\u91d1'}</div><div style={styles.statValue(colors.textSecondary)}>{summary.hasHandover ? money(summary.handoverAmount) : '-'}</div><div style={styles.statSub}>{'\u4ea4\u73ed\u5bf9\u8d26\u586b\u5199\u91d1\u989d'}</div></div>
            <div style={styles.statCard(summary.hasHandover && summary.difference !== 0 ? (summary.difference > 0 ? colors.amber : colors.danger) : colors.success, summary.hasHandover && summary.difference !== 0 ? (summary.difference > 0 ? colors.amber : colors.danger) : colors.success)}><div style={styles.statLabel}>{'\u4ea4\u73ed\u8bef\u5dee'}</div><div style={styles.statValue(summary.hasHandover && summary.difference !== 0 ? (summary.difference > 0 ? colors.amber : colors.danger) : colors.success)}>{summary.hasHandover ? signedMoney(summary.difference) : '-'}</div><div style={styles.statSub}>{'\u5b9e\u4ea4 - \u5e94\u4ea4\u73b0\u91d1'}</div></div>
            <div style={styles.statCard(colors.danger, colors.danger)}><div style={styles.statLabel}>{'\u65e5\u5e38\u5f00\u652f'}</div><div style={styles.statValue(colors.danger)}>{money(summary.expenseAmount)}</div><div style={styles.statSub}>{'\u8fd0\u8425\u652f\u51fa'}</div></div>
            <div style={styles.statCard(colors.amber, colors.amber)}><div style={styles.statLabel}>{'\u91c7\u8d2d\u4ed8\u6b3e'}</div><div style={styles.statValue(colors.amber)}>{money(summary.purchaseAmount)}</div><div style={styles.statSub}>{'\u5df2\u4ed8\u6b3e\u8d27\u6b3e'}</div></div>
            <div style={styles.statCard(colors.amber, colors.amber)}><div style={styles.statLabel}>{'\u4f9b\u5e94\u5546\u8d27\u6b3e'}</div><div style={styles.statValue(colors.amber)}>{money(summary.supplierDebt)}</div><div style={styles.statSub}>{'\u5f53\u524d\u5269\u4f59\u6b20\u6b3e'}</div></div>
          </div>

          <div style={styles.card}>
            <div style={styles.cardTitle}>{'\u62a5\u8868\u660e\u7ec6'}</div>
            {dailyReports.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem', color: colors.textMuted }}>{'\u6682\u65e0\u6570\u636e'}</div>
            ) : (
              <div style={styles.tableWrap}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>{'\u65e5\u671f'}</th>
                      <th style={{ ...styles.th, textAlign: 'right' }}>{'\u8425\u4e1a\u989d'}</th>
                      <th style={styles.th}>{'\u8ba2\u5355'}</th>
                      <th style={{ ...styles.th, textAlign: 'right' }}>{'\u73b0\u91d1'}</th>
                      <th style={{ ...styles.th, textAlign: 'right' }}>{'\u5237\u5361'}</th>
                      <th style={{ ...styles.th, textAlign: 'right' }}>{'\u91c7\u8d2d\u4ed8\u6b3e'}</th>
                      <th style={{ ...styles.th, textAlign: 'right' }}>{'\u5f00\u652f'}</th>
                      <th style={{ ...styles.th, textAlign: 'right' }}>{'\u76c8\u4e8f'}</th>
                      <th style={{ ...styles.th, textAlign: 'right' }}>{'\u5b9e\u4ea4'}</th>
                      <th style={{ ...styles.th, textAlign: 'right' }}>{'\u8bef\u5dee'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dailyReports.map((report, index) => (
                      <tr key={index}>
                        <td style={styles.td}>{report.date}</td>
                        <td style={{ ...styles.td, textAlign: 'right', fontWeight: '600' }}>{money(report.totalSales)}</td>
                        <td style={styles.td}>{formatTodayOrders(report)}</td>
                        <td style={{ ...styles.td, textAlign: 'right', color: colors.success }}>{money(report.cashPayment)}</td>
                        <td style={{ ...styles.td, textAlign: 'right', color: '#7c3aed' }}>{money(report.cardPayment)}</td>
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
                <div style={styles.cardTitle}>{'\u5f53\u5929\u5f00\u652f\u548c\u91c7\u8d2d\u5355\u660e\u7ec6'}</div>
                {dailyExpenseBreakdown.groups.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '2rem', color: colors.textMuted }}>{'\u5f53\u5929\u6ca1\u6709\u5f00\u652f\u8bb0\u5f55'}</div>
                ) : (
                  <div style={styles.tableWrap}>
                    <table style={styles.table}>
                      <thead>
                        <tr>
                          <th style={{ ...styles.th, width: '4rem' }}>#</th>
                          <th style={styles.th}>{'\u7c7b\u578b'}</th>
                          <th style={styles.th}>{'\u5355\u53f7/\u7c7b\u522b'}</th>
                          <th style={styles.th}>{'\u5546\u54c1/\u8bf4\u660e'}</th>
                          <th style={{ ...styles.th, textAlign: 'right' }}>{'\u6570\u91cf'}</th>
                          <th style={{ ...styles.th, textAlign: 'right' }}>{'\u5355\u4ef7'}</th>
                          <th style={{ ...styles.th, textAlign: 'right' }}>{'\u91d1\u989d'}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dailyExpenseBreakdown.groups.map((group, groupIndex) => (
                          <React.Fragment key={`${group.type}-${group.category}-${groupIndex}`}>
                            <tr>
                              <td style={{ ...styles.td, ...styles.groupCell }} colSpan={5}>
                                <strong>{group.typeLabel} - {group.title}</strong>
                              </td>
                              <td style={{ ...styles.td, ...styles.groupCell, color: colors.textSecondary }}>
                                {group.count} {'\u7b14'}
                              </td>
                              <td style={{ ...styles.td, ...styles.groupCell, textAlign: 'right', fontWeight: '700', color: group.type === 'purchase' ? colors.amber : colors.danger }}>
                                {money(group.amount)}
                              </td>
                            </tr>
                            {group.details.map((expense, index) => (
                              <tr key={expense.id || `${groupIndex}-${index}`}>
                                <td style={styles.td}>{index + 1}</td>
                                <td style={styles.td}>{expense.typeLabel}</td>
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

          <button onClick={handlePrint} style={styles.printBtn}>{'\u6253\u5370\u62a5\u8868'}</button>
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
