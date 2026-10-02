import React, { useEffect, useMemo, useState } from 'react';
import { smartGetPosOrdersByCreatedDateRange } from '../../services/smartSyncService';
import {
  formatNicaraguaDate,
  formatNicaraguaDateTime,
  formatNicaraguaTime,
  toTimestampMillis,
} from '../../utils/localTime';
import { getLocalDateString } from '../../utils/exchangeRate';
import {
  filterAndSortOrders,
  getOrderCancellationRecords,
  getOrderCancellationSummary,
  getOrderTimestamp,
  groupOrdersByDate,
  normalizeOrderType,
} from '../../utils/orderHistory';
import { calculateOrderStatusSummary, getOrderCollectedAmount } from '../../utils/financeMetrics';
import { useI18n } from '../../i18n/I18nContext';
import type { TranslationKey } from '../../i18n/translations';

const STATUS_LABEL_KEYS: Record<string, TranslationKey> = {
  all: 'orderHistory.filter.allStatuses',
  draft: 'pos.status.draft',
  confirmed: 'pos.status.confirmed',
  preparing: 'pos.status.preparing',
  served: 'pos.status.served',
  paid: 'pos.status.paid',
  completed: 'pos.status.completed',
  cancelled: 'pos.status.cancelled',
};

const ORDER_TYPE_LABEL_KEYS: Record<string, TranslationKey> = {
  all: 'orderHistory.filter.allTypes',
  dine_in: 'pos.orderType.dineIn',
  takeout: 'pos.orderType.takeout',
  delivery: 'pos.orderType.delivery',
};

const getStatusStyle = (status: string) => {
  const colors: Record<string, { bg: string; color: string }> = {
    completed: { bg: '#d1fae5', color: '#065f46' },
    paid: { bg: '#ffedd5', color: '#9a3412' },
    cancelled: { bg: '#fee2e2', color: '#991b1b' },
    draft: { bg: '#fef3c7', color: '#92400e' },
    confirmed: { bg: '#dbeafe', color: '#1e40af' },
    preparing: { bg: '#e0e7ff', color: '#3730a3' },
    served: { bg: '#fce7f3', color: '#9d174d' },
  };
  return colors[status] || { bg: '#f3f4f6', color: '#374151' };
};

const getDateRange = (range: string) => {
  const today = new Date();
  let start = new Date(today);

  if (range === 'yesterday') {
    start.setDate(today.getDate() - 1);
    return {
      startDate: getLocalDateString(start),
      endDate: getLocalDateString(start),
    };
  }

  if (range === 'week') {
    start.setDate(today.getDate() - 7);
  }

  if (range === 'month') {
    start.setMonth(today.getMonth() - 1);
  }

  return {
    startDate: getLocalDateString(start),
    endDate: getLocalDateString(today),
  };
};

const formatOrderTime = (value: any) => {
  const timestamp = toTimestampMillis(value);
  return timestamp ? formatNicaraguaTime(timestamp) : '--:--';
};

const calculateStageDurations = (order: any) => {
  const createdAt = toTimestampMillis(order.createdAt);
  const servedAt = toTimestampMillis(order.servedAt);
  const completedAt = toTimestampMillis(order.completedAt);

  return {
    prepTime: createdAt && servedAt ? Math.floor((servedAt - createdAt) / 60000) : null,
    payTime: servedAt && completedAt ? Math.floor((completedAt - servedAt) / 60000) : null,
    totalTime: createdAt && completedAt ? Math.floor((completedAt - createdAt) / 60000) : null,
  };
};

const escapeHtml = (value: any) => {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

const OrderHistoryPage: React.FC = () => {
  const { t } = useI18n();
  const [allOrders, setAllOrders] = useState<any[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [hasLoadedCloud, setHasLoadedCloud] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterOrderType, setFilterOrderType] = useState('all');
  const [filterDate, setFilterDate] = useState('today');
  const [startDate, setStartDate] = useState(() => getLocalDateString());
  const [endDate, setEndDate] = useState(() => getLocalDateString());
  const [selectedOrder, setSelectedOrder] = useState<any>(null);

  const getStatusLabel = React.useCallback((status: string) => (
    STATUS_LABEL_KEYS[status] ? t(STATUS_LABEL_KEYS[status]) : status
  ), [t]);
  const getOrderTypeLabel = React.useCallback((order: any) => {
    const type = normalizeOrderType(order);
    return ORDER_TYPE_LABEL_KEYS[type] ? t(ORDER_TYPE_LABEL_KEYS[type]) : type;
  }, [t]);
  const formatDuration = React.useCallback((minutes: number | null) => {
    if (minutes === null || minutes < 0) return '--';
    if (minutes < 60) return `${minutes} ${t('orderHistory.minutes')}`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours} ${t('orderHistory.hours')} ${mins.toString().padStart(2, '0')} ${t('orderHistory.minutes')}`;
  }, [t]);

  const refreshOrderHistoryData = React.useCallback(async () => {
    setIsRefreshing(true);
    try {
      const cloudOrders = await smartGetPosOrdersByCreatedDateRange(startDate, endDate, true);
      setAllOrders(cloudOrders);
      setHasLoadedCloud(true);
      setLastSyncedAt(new Date());
    } catch (error) {
      console.error('刷新历史订单失败:', error);
      alert(t('orderHistory.alert.refreshFailed'));
    } finally {
      setIsRefreshing(false);
    }
  }, [endDate, startDate, t]);

  useEffect(() => {
    refreshOrderHistoryData();
  }, [refreshOrderHistoryData]);

  const handleDateRangeChange = (range: string) => {
    setFilterDate(range);
    if (range === 'custom') return;
    const nextRange = getDateRange(range);
    setStartDate(nextRange.startDate);
    setEndDate(nextRange.endDate);
  };

  const sortedOrders = useMemo(() => {
    return filterAndSortOrders(allOrders, {
      searchKeyword,
      status: filterStatus,
      orderType: filterOrderType,
      startDate,
      endDate,
    });
  }, [allOrders, searchKeyword, filterStatus, filterOrderType, startDate, endDate]);

  const groupedOrders = useMemo(
    () => groupOrdersByDate(sortedOrders, formatNicaraguaDate),
    [sortedOrders]
  );

  const todayOrderSummary = useMemo(() => {
    const today = getLocalDateString();
    return calculateOrderStatusSummary(allOrders, today);
  }, [allOrders]);

  const filteredTotal = sortedOrders.reduce(
    (sum: number, order: any) => sum + getOrderCollectedAmount(order),
    0
  );

  const selectedCancellationSummary = useMemo(
    () => selectedOrder ? getOrderCancellationSummary(selectedOrder) : null,
    [selectedOrder]
  );
  const selectedCancellationRecords = useMemo(
    () => selectedOrder ? getOrderCancellationRecords(selectedOrder) : [],
    [selectedOrder]
  );
  const hasSelectedCancellationInfo = Boolean(
    selectedOrder && (
      selectedOrder.status === 'cancelled' ||
      selectedCancellationSummary?.reason ||
      selectedCancellationSummary?.cancelledBy ||
      selectedCancellationSummary?.cancelledAt ||
      selectedCancellationRecords.length > 0
    )
  );

  const handleExportOrders = () => {
    const header = [
      t('orderHistory.orderNumber'),
      t('orderHistory.table'),
      t('orderHistory.type'),
      t('orderHistory.status'),
      t('orderHistory.amount'),
      t('orderHistory.itemCount'),
      t('orderHistory.createdAt'),
    ].join(',');
    const rows = sortedOrders.map((order: any) => [
      order.orderNumber || order.id,
      order.tableNumber || '',
      getOrderTypeLabel(order),
      getStatusLabel(order.status || ''),
      Number(order.totalAmount || 0).toFixed(2),
      order.items?.length || 0,
      formatNicaraguaDateTime(getOrderTimestamp(order)),
    ].map(value => `"${String(value ?? '').replace(/"/g, '""')}"`).join(','));

    const csvContent = `data:text/csv;charset=utf-8,\ufeff${[header, ...rows].join('\n')}`;
    const link = document.createElement('a');
    link.setAttribute('href', encodeURI(csvContent));
    link.setAttribute('download', `orders_${getLocalDateString()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrintOrders = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert(t('orderHistory.alert.allowPopup'));
      return;
    }

    const groupedRows = Object.entries(groupedOrders).map(([date, orders]: [string, any[]]) => `
      <tr class="date-row">
        <td colspan="7">${escapeHtml(date)} - ${orders.length} ${escapeHtml(t('orderHistory.ordersUnit'))}</td>
      </tr>
      ${orders.map((order: any) => `
        <tr>
          <td>${escapeHtml(order.orderNumber || order.id)}</td>
          <td>${escapeHtml(order.tableNumber || '-')}</td>
          <td>${escapeHtml(getOrderTypeLabel(order))}</td>
          <td>${escapeHtml(getStatusLabel(order.status || ''))}</td>
          <td class="right">C$ ${Number(order.totalAmount || 0).toFixed(2)}</td>
          <td class="center">${order.items?.length || 0}</td>
          <td>${escapeHtml(formatNicaraguaDateTime(getOrderTimestamp(order)))}</td>
        </tr>
      `).join('')}
    `).join('');

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(t('orderHistory.title'))}</title>
        <style>
          body { font-family: Arial, "Microsoft YaHei", sans-serif; padding: 20px; color: #111827; }
          h1 { text-align: center; margin: 0 0 8px; }
          .info { text-align: center; color: #6b7280; margin-bottom: 18px; font-size: 13px; }
          table { width: 100%; border-collapse: collapse; }
          th { background: #f3f4f6; padding: 8px; text-align: left; font-size: 12px; border-bottom: 2px solid #d1d5db; }
          td { padding: 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px; }
          .date-row td { background: #f9fafb; font-weight: 700; color: #374151; }
          .right { text-align: right; }
          .center { text-align: center; }
          .total { text-align: right; margin-top: 16px; font-size: 16px; font-weight: 700; }
          .no-print { text-align: center; margin-top: 24px; }
          button { padding: 10px 18px; border: 0; border-radius: 4px; background: #2563eb; color: white; cursor: pointer; }
          @media print { .no-print { display: none; } body { padding: 10px; } }
        </style>
      </head>
      <body>
        <h1>${escapeHtml(t('orderHistory.title'))}</h1>
        <div class="info">
          ${escapeHtml(t('orderHistory.printTime'))}：${escapeHtml(formatNicaraguaDateTime(new Date()))}
          | ${escapeHtml(t('orderHistory.orderCount'))}：${sortedOrders.length}
          | ${escapeHtml(t('orderHistory.collected'))}：C$ ${filteredTotal.toFixed(2)}
        </div>
        <table>
          <thead>
            <tr>
              <th>${escapeHtml(t('orderHistory.orderNumber'))}</th>
              <th>${escapeHtml(t('orderHistory.table'))}</th>
              <th>${escapeHtml(t('orderHistory.type'))}</th>
              <th>${escapeHtml(t('orderHistory.status'))}</th>
              <th class="right">${escapeHtml(t('orderHistory.amount'))}</th>
              <th class="center">${escapeHtml(t('orderHistory.itemCount'))}</th>
              <th>${escapeHtml(t('orderHistory.createdAt'))}</th>
            </tr>
          </thead>
          <tbody>${groupedRows || `<tr><td colspan="7" class="center">${escapeHtml(t('orderHistory.empty'))}</td></tr>`}</tbody>
        </table>
        <div class="total">${escapeHtml(t('orderHistory.collected'))}：C$ ${filteredTotal.toFixed(2)}</div>
        <div class="no-print"><button onclick="window.print()">${escapeHtml(t('orderHistory.print'))}</button></div>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  const styles = {
    container: {
      display: 'flex',
      flexDirection: 'column' as const,
      height: '100%',
      padding: '1.5rem',
      background: '#f5f7fa',
      boxSizing: 'border-box' as const,
      overflow: 'hidden',
    },
    header: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: '1rem',
      marginBottom: '1rem',
      flexShrink: 0,
    },
    title: {
      fontSize: '1.5rem',
      fontWeight: 700,
      color: '#1f2937',
      margin: 0,
    },
    button: (bg: string, color = 'white') => ({
      padding: '0.55rem 0.95rem',
      background: bg,
      color,
      border: 'none',
      borderRadius: '0.375rem',
      cursor: 'pointer',
      fontWeight: 600,
      fontSize: '0.875rem',
      whiteSpace: 'nowrap' as const,
    }),
    stats: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
      gap: '1rem',
      marginBottom: '1rem',
      flexShrink: 0,
    },
    stat: (bg: string, color: string) => ({
      background: bg,
      color,
      borderRadius: '0.5rem',
      padding: '1rem',
      textAlign: 'center' as const,
      boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
    }),
    toolbar: {
      display: 'flex',
      gap: '0.5rem',
      marginBottom: '1rem',
      flexWrap: 'wrap' as const,
      flexShrink: 0,
    },
    input: {
      padding: '0.55rem',
      border: '1px solid #d1d5db',
      borderRadius: '0.375rem',
      fontSize: '0.875rem',
      minWidth: 0,
    },
    card: {
      background: 'white',
      borderRadius: '0.5rem',
      padding: '1rem',
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      flex: 1,
      minHeight: 0,
      display: 'flex',
      flexDirection: 'column' as const,
      overflow: 'hidden',
    },
    tableScroll: {
      flex: 1,
      minHeight: 0,
      overflow: 'auto',
    },
    table: {
      width: '100%',
      borderCollapse: 'collapse' as const,
      fontSize: '0.875rem',
    },
    th: {
      position: 'sticky' as const,
      top: 0,
      zIndex: 2,
      background: '#f9fafb',
      padding: '0.75rem',
      textAlign: 'left' as const,
      color: '#6b7280',
      borderBottom: '2px solid #e5e7eb',
      whiteSpace: 'nowrap' as const,
    },
    td: {
      padding: '0.75rem',
      borderBottom: '1px solid #e5e7eb',
      verticalAlign: 'middle' as const,
    },
    modal: {
      position: 'fixed' as const,
      inset: 0,
      background: 'rgba(0,0,0,0.45)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 50,
      padding: '1rem',
    },
    modalContent: {
      background: 'white',
      borderRadius: '0.5rem',
      width: 'min(760px, 100%)',
      maxHeight: '86vh',
      display: 'flex',
      flexDirection: 'column' as const,
      overflow: 'hidden',
    },
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>{t('orderHistory.title')}</h1>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {lastSyncedAt && (
            <span style={{ fontSize: '0.8rem', color: '#6b7280', whiteSpace: 'nowrap' }}>
              {t('orderHistory.lastSync')} {lastSyncedAt.toLocaleTimeString('es-NI', { hour12: false })}
            </span>
          )}
          <button
            onClick={refreshOrderHistoryData}
            disabled={isRefreshing}
            style={styles.button(isRefreshing ? '#9ca3af' : '#6366f1')}
          >
            {isRefreshing ? t('orderHistory.refreshing') : t('orderHistory.refresh')}
          </button>
          <button onClick={handlePrintOrders} style={styles.button('#2563eb')}>
            {t('orderHistory.printOrders')}
          </button>
          <button onClick={handleExportOrders} style={styles.button('#059669')}>
            {t('orderHistory.exportCsv')}
          </button>
        </div>
      </div>

      <div style={styles.stats}>
        <div style={styles.stat('#dbeafe', '#1e40af')}>
          <div style={{ fontSize: '0.8rem' }}>{t('orderHistory.filteredOrders')}</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700 }}>{sortedOrders.length}</div>
        </div>
        <div style={styles.stat('#fef3c7', '#92400e')}>
          <div style={{ fontSize: '0.8rem' }}>{t('orderHistory.filteredCollected')}</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700 }}>C$ {filteredTotal.toFixed(2)}</div>
        </div>
        <div style={styles.stat('#fce7f3', '#9d174d')}>
          <div style={{ fontSize: '0.8rem' }}>{t('orderHistory.todayOrders')}</div>
          <div style={{ fontSize: '1.05rem', fontWeight: 700 }}>
            {t('orderHistory.completed')} {todayOrderSummary.completedOrders} / {t('orderHistory.cancelled')} {todayOrderSummary.cancelledOrders}
          </div>
          <div style={{ fontSize: '0.78rem', marginTop: '0.25rem' }}>
            {t('orderHistory.cancelledItems')} {todayOrderSummary.cancelledItems}
          </div>
        </div>
      </div>

      <div style={styles.toolbar}>
        <input
          type="text"
          placeholder={t('orderHistory.searchPlaceholder')}
          value={searchKeyword}
          onChange={(event) => setSearchKeyword(event.target.value)}
          style={{ ...styles.input, flex: '1 1 220px' }}
        />
        <select
          value={filterOrderType}
          onChange={(event) => setFilterOrderType(event.target.value)}
          style={styles.input}
        >
          {Object.entries(ORDER_TYPE_LABEL_KEYS).map(([value, key]) => (
            <option key={value} value={value}>{t(key)}</option>
          ))}
        </select>
        <select
          value={filterStatus}
          onChange={(event) => setFilterStatus(event.target.value)}
          style={styles.input}
        >
          {Object.entries(STATUS_LABEL_KEYS).map(([value, key]) => (
            <option key={value} value={value}>{t(key)}</option>
          ))}
        </select>
        <select
          value={filterDate}
          onChange={(event) => handleDateRangeChange(event.target.value)}
          style={styles.input}
        >
          <option value="today">{t('orderHistory.date.today')}</option>
          <option value="yesterday">{t('orderHistory.date.yesterday')}</option>
          <option value="week">{t('orderHistory.date.week')}</option>
          <option value="month">{t('orderHistory.date.month')}</option>
          <option value="custom">{t('orderHistory.date.custom')}</option>
        </select>
        {filterDate === 'custom' && (
          <>
            <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} style={styles.input} />
            <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} style={styles.input} />
          </>
        )}
      </div>

      <div style={styles.card}>
        {!hasLoadedCloud && isRefreshing ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>
            {t('orderHistory.loading')}
          </div>
        ) : sortedOrders.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#9ca3af' }}>
            {t('orderHistory.empty')}
          </div>
        ) : (
          <div style={styles.tableScroll}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>{t('orderHistory.orderNumber')}</th>
                  <th style={styles.th}>{t('orderHistory.table')}</th>
                  <th style={styles.th}>{t('orderHistory.type')}</th>
                  <th style={styles.th}>{t('orderHistory.status')}</th>
                  <th style={{ ...styles.th, textAlign: 'right' }}>{t('orderHistory.amount')}</th>
                  <th style={{ ...styles.th, textAlign: 'center' }}>{t('orderHistory.itemCount')}</th>
                  <th style={styles.th}>{t('orderHistory.createdAt')}</th>
                  <th style={styles.th}>{t('orderHistory.duration')}</th>
                  <th style={{ ...styles.th, textAlign: 'center' }}>{t('orderHistory.action')}</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(groupedOrders).map(([date, orders]: [string, any[]]) => (
                  <React.Fragment key={date}>
                    <tr>
                      <td colSpan={9} style={{ ...styles.td, background: '#f9fafb', fontWeight: 700, color: '#374151' }}>
                        {date} - {orders.length} {t('orderHistory.ordersUnit')}
                      </td>
                    </tr>
                    {orders.map((order: any) => {
                      const statusStyle = getStatusStyle(order.status);
                      const durations = calculateStageDurations(order);
                      return (
                        <tr key={order.id} style={{ cursor: 'pointer' }} onClick={() => setSelectedOrder(order)}>
                          <td style={{ ...styles.td, fontWeight: 700 }}>{order.orderNumber || order.id}</td>
                          <td style={styles.td}>{order.tableNumber || '-'}</td>
                          <td style={styles.td}>{getOrderTypeLabel(order)}</td>
                          <td style={styles.td}>
                            <span style={{
                              display: 'inline-block',
                              padding: '0.25rem 0.55rem',
                              borderRadius: '999px',
                              fontWeight: 700,
                              background: statusStyle.bg,
                              color: statusStyle.color,
                            }}>
                              {getStatusLabel(order.status || '') || '-'}
                            </span>
                          </td>
                          <td style={{ ...styles.td, textAlign: 'right', fontWeight: 700, color: '#dc2626' }}>
                            C$ {Number(order.totalAmount || 0).toFixed(2)}
                          </td>
                          <td style={{ ...styles.td, textAlign: 'center' }}>{order.items?.length || 0}</td>
                          <td style={styles.td}>{formatNicaraguaDateTime(getOrderTimestamp(order))}</td>
                          <td style={styles.td}>{formatDuration(durations.totalTime)}</td>
                          <td style={{ ...styles.td, textAlign: 'center' }}>
                            <button
                              onClick={(event) => {
                                event.stopPropagation();
                                setSelectedOrder(order);
                              }}
                              style={styles.button('#2563eb')}
                            >
                              {t('orderHistory.viewDetails')}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedOrder && (
        <div style={styles.modal} onClick={() => setSelectedOrder(null)}>
          <div style={styles.modalContent} onClick={(event) => event.stopPropagation()}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '1rem 1.5rem',
              borderBottom: '1px solid #e5e7eb',
            }}>
              <h3 style={{ margin: 0 }}>{t('orderHistory.details')}</h3>
              <button onClick={() => setSelectedOrder(null)} style={styles.button('#e5e7eb', '#111827')}>{t('orderHistory.close')}</button>
            </div>
            <div style={{ padding: '1.5rem', overflow: 'auto' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                <div><strong>{t('orderHistory.orderNumber')}</strong><div>{selectedOrder.orderNumber || selectedOrder.id}</div></div>
                <div><strong>{t('orderHistory.table')}</strong><div>{selectedOrder.tableNumber || '-'}</div></div>
                <div><strong>{t('orderHistory.type')}</strong><div>{getOrderTypeLabel(selectedOrder)}</div></div>
                <div><strong>{t('orderHistory.status')}</strong><div>{getStatusLabel(selectedOrder.status || '') || '-'}</div></div>
                <div><strong>{t('orderHistory.orderTime')}</strong><div>{formatNicaraguaDateTime(getOrderTimestamp(selectedOrder))}</div></div>
                <div><strong>{t('orderHistory.totalAmount')}</strong><div>C$ {Number(selectedOrder.totalAmount || 0).toFixed(2)}</div></div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '1rem', marginBottom: '1.5rem', background: '#f9fafb', padding: '1rem', borderRadius: '0.5rem' }}>
                <div><strong>{t('orderHistory.placed')}</strong><div>{formatOrderTime(selectedOrder.createdAt)}</div></div>
                <div><strong>{t('orderHistory.served')}</strong><div>{formatOrderTime(selectedOrder.servedAt)}</div></div>
                <div><strong>{t('orderHistory.finished')}</strong><div>{formatOrderTime(selectedOrder.completedAt)}</div></div>
                <div><strong>{t('orderHistory.duration')}</strong><div>{formatDuration(calculateStageDurations(selectedOrder).totalTime)}</div></div>
              </div>
              {hasSelectedCancellationInfo && (
                <div style={{
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  borderRadius: '0.5rem',
                  padding: '1rem',
                  marginBottom: '1.5rem',
                }}>
                  <h4 style={{ margin: '0 0 0.75rem', color: '#991b1b' }}>{t('orderHistory.cancellationRecords')}</h4>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                    gap: '0.75rem',
                    marginBottom: selectedCancellationRecords.length > 0 ? '1rem' : 0,
                  }}>
                    <div><strong>{t('orderHistory.cancelReason')}</strong><div>{selectedCancellationSummary?.reason || '-'}</div></div>
                    <div><strong>{t('orderHistory.operator')}</strong><div>{selectedCancellationSummary?.cancelledBy || '-'}</div></div>
                    <div><strong>{t('orderHistory.cancelTime')}</strong><div>{selectedCancellationSummary?.cancelledAt ? formatNicaraguaDateTime(toTimestampMillis(selectedCancellationSummary.cancelledAt)) : '-'}</div></div>
                  </div>
                  {selectedCancellationRecords.length > 0 && (
                    <table style={styles.table}>
                      <thead>
                        <tr>
                          <th style={styles.th}>{t('orderHistory.cancelledItemRecords')}</th>
                          <th style={{ ...styles.th, textAlign: 'center' }}>{t('orderHistory.quantity')}</th>
                          <th style={styles.th}>{t('orderHistory.reason')}</th>
                          <th style={styles.th}>{t('orderHistory.operator')}</th>
                          <th style={styles.th}>{t('orderHistory.time')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedCancellationRecords.map((record: any, index: number) => (
                          <tr key={record.id || `${record.itemName || 'cancel'}-${index}`}>
                            <td style={styles.td}>{record.itemName || '-'}</td>
                            <td style={{ ...styles.td, textAlign: 'center' }}>{Number(record.quantity || 0)}</td>
                            <td style={styles.td}>{record.reason || '-'}</td>
                            <td style={styles.td}>{record.cancelledBy || '-'}</td>
                            <td style={styles.td}>{record.cancelledAt ? formatNicaraguaDateTime(toTimestampMillis(record.cancelledAt)) : '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>{t('orderHistory.item')}</th>
                    <th style={{ ...styles.th, textAlign: 'center' }}>{t('orderHistory.quantity')}</th>
                    <th style={{ ...styles.th, textAlign: 'right' }}>{t('orderHistory.unitPrice')}</th>
                    <th style={{ ...styles.th, textAlign: 'right' }}>{t('orderHistory.subtotal')}</th>
                  </tr>
                </thead>
                <tbody>
                  {(selectedOrder.items || []).map((item: any, index: number) => (
                    <tr key={`${item.id || item.name}-${index}`}>
                      <td style={styles.td}>{item.name}</td>
                      <td style={{ ...styles.td, textAlign: 'center' }}>{item.quantity}</td>
                      <td style={{ ...styles.td, textAlign: 'right' }}>C$ {Number(item.price || 0).toFixed(2)}</td>
                      <td style={{ ...styles.td, textAlign: 'right', fontWeight: 700 }}>C$ {Number(item.subtotal || item.price * item.quantity || 0).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OrderHistoryPage;
