import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { collection, getDocs, getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyCLXao2R2XHvxmU2QiEK0SlfkqkbXS14Lw',
  authDomain: 'restaurant-pos-1b420.firebaseapp.com',
  projectId: 'restaurant-pos-1b420',
  storageBucket: 'restaurant-pos-1b420.firebasestorage.app',
  messagingSenderId: '1033394792448',
  appId: '1:1033394792448:web:415d1b1438bd72133a90e5',
  measurementId: 'G-P4SF3XSJLN',
};

const args = new Map();
for (let i = 2; i < process.argv.length; i += 1) {
  const key = process.argv[i];
  const next = process.argv[i + 1];
  if (key.startsWith('--')) {
    args.set(key.slice(2), next && !next.startsWith('--') ? next : true);
    if (next && !next.startsWith('--')) i += 1;
  }
}

const username = args.get('username') || process.env.POS_AUDIT_USERNAME || 'admin';
const password = args.get('password') || process.env.POS_AUDIT_PASSWORD || '';
const hours = Number(args.get('hours') || process.env.POS_AUDIT_HOURS || 72);

if (!password) {
  console.error('Usage: npm run audit:pos-lifecycle -- --password <password> [--username admin] [--hours 72]');
  process.exit(1);
}

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

const toMillis = value => {
  if (!value) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  if (typeof value.seconds === 'number') return value.seconds * 1000 + Math.floor((value.nanoseconds || 0) / 1000000);
  return 0;
};

const toManaguaDateTime = millis => {
  if (!millis) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Managua',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(millis));
};

const getRows = async path => {
  const snapshot = await getDocs(collection(db, path));
  return snapshot.docs.map(row => ({ docId: row.id, id: row.id, ...row.data() }));
};

const isTerminal = order => order.status === 'completed' || order.status === 'cancelled';
const isEditableActive = order => order && !['completed', 'cancelled', 'draft'].includes(String(order.status || ''));
const isDisplayable = order => {
  const hasOrderNumber = Boolean(String(order.orderNumber || '').trim());
  const hasItems = Array.isArray(order.items) && order.items.length > 0;
  const hasMoney = Number(order.totalAmount || 0) > 0 ||
    Number(order.paidAmount || 0) > 0 ||
    Number(order.settledAmount || 0) > 0;
  const hasCancellationRecord = order.status === 'cancelled' && Boolean(order.cancelledAt || hasItems);
  return hasOrderNumber && (hasItems || hasMoney || hasCancellationRecord);
};

const getOrderMillis = order => Math.max(
  toMillis(order.createdAt),
  toMillis(order.preparingAt),
  toMillis(order.servedAt),
  toMillis(order.lastPaidAt),
  toMillis(order.cancelledAt),
  toMillis(order.completedAt),
  toMillis(order.clearedAt),
  toMillis(order.lastModified),
  toMillis(order.updatedAt)
);

const getOrderBusinessMillis = order => {
  if (order.status === 'completed') return toMillis(order.completedAt) || toMillis(order.createdAt);
  if (order.status === 'cancelled') return toMillis(order.cancelledAt) || toMillis(order.createdAt);
  return getOrderMillis(order);
};

const summarizeOrder = order => ({
  id: order.id || order.docId,
  orderNumber: order.orderNumber || '',
  orderType: order.orderType || '',
  tableId: order.tableId || '',
  tableNumber: order.tableNumber || '',
  status: order.status || '',
  paymentStatus: order.paymentStatus || '',
  totalAmount: Number(order.totalAmount || 0),
  paidAmount: Number(order.paidAmount || 0),
  settledAmount: Number(order.settledAmount || 0),
  stockDeducted: Boolean(order.stockDeducted),
  itemCount: Array.isArray(order.items) ? order.items.length : 0,
  businessTime: toManaguaDateTime(getOrderBusinessMillis(order)),
  activityTime: toManaguaDateTime(getOrderMillis(order)),
});

const pushIssue = (issues, type, severity, details) => {
  issues.push({ type, severity, ...details });
};

const auditStore = (store, orders, tables, cutoff) => {
  const issues = [];
  const tablesById = new Map(tables.map(table => [table.id || table.docId, table]));
  const ordersById = new Map(orders.map(order => [order.id || order.docId, order]));
  const activeOrders = orders.filter(isEditableActive);
  const activeDineInOrders = activeOrders.filter(order => order.orderType === 'dine_in');

  const activeByTable = new Map();
  activeDineInOrders.forEach(order => {
    const tableId = String(order.tableId || '');
    if (!tableId) {
      pushIssue(issues, 'dine_in_active_order_missing_table', 'high', { order: summarizeOrder(order) });
      return;
    }
    activeByTable.set(tableId, [...(activeByTable.get(tableId) || []), order]);
  });

  activeByTable.forEach((tableOrders, tableId) => {
    if (tableOrders.length > 1) {
      pushIssue(issues, 'multiple_active_orders_on_same_table', 'critical', {
        tableId,
        orders: tableOrders.map(summarizeOrder),
      });
    }
  });

  activeDineInOrders.forEach(order => {
    if (!order.tableId) return;
    const table = tablesById.get(order.tableId);
    if (!table) {
      pushIssue(issues, 'active_order_table_not_found', 'high', { order: summarizeOrder(order) });
      return;
    }

    const shouldBeCleaning = order.paymentStatus === 'paid' && !order.clearedAt;
    const expectedStatus = shouldBeCleaning ? 'needs_cleaning' : 'occupied';
    if (table.status !== expectedStatus || table.currentOrderId !== order.id) {
      pushIssue(issues, 'active_order_table_state_mismatch', 'high', {
        expectedStatus,
        table: {
          id: table.id || table.docId,
          number: table.number || '',
          status: table.status || '',
          currentOrderId: table.currentOrderId || '',
        },
        order: summarizeOrder(order),
      });
    }
  });

  tables.forEach(table => {
    if (!['occupied', 'needs_cleaning'].includes(String(table.status || ''))) return;
    const linkedOrder = table.currentOrderId ? ordersById.get(table.currentOrderId) : null;
    if (!linkedOrder) {
      pushIssue(issues, 'busy_table_points_to_missing_order', 'high', {
        table: {
          id: table.id || table.docId,
          number: table.number || '',
          status: table.status || '',
          currentOrderId: table.currentOrderId || '',
        },
      });
      return;
    }
    if (isTerminal(linkedOrder)) {
      pushIssue(issues, 'busy_table_points_to_terminal_order', 'critical', {
        table: {
          id: table.id || table.docId,
          number: table.number || '',
          status: table.status || '',
          currentOrderId: table.currentOrderId || '',
        },
        order: summarizeOrder(linkedOrder),
      });
    }
  });

  orders
    .forEach(order => {
      const activityIsRecent = getOrderMillis(order) >= cutoff;
      const businessIsRecent = getOrderBusinessMillis(order) >= cutoff;

      if (activityIsRecent && !isDisplayable(order) && String(order.orderNumber || '').trim()) {
        pushIssue(issues, 'numbered_placeholder_order', 'medium', { order: summarizeOrder(order) });
      }
      if (activityIsRecent && order.status === 'completed' && !order.completedAt) {
        pushIssue(issues, 'completed_order_missing_completed_at', 'medium', { order: summarizeOrder(order) });
      }
      if (businessIsRecent && order.status === 'completed' && !order.stockDeducted) {
        pushIssue(issues, 'completed_order_missing_stock_deduction_flag', 'critical', { order: summarizeOrder(order) });
      }
    });

  return {
    storeId: store.id || store.docId,
    storeName: store.name || store.storeName || store.id || store.docId,
    orderCount: orders.length,
    tableCount: tables.length,
    activeOrderCount: activeOrders.length,
    issueCount: issues.length,
    criticalCount: issues.filter(issue => issue.severity === 'critical').length,
    highCount: issues.filter(issue => issue.severity === 'high').length,
    mediumCount: issues.filter(issue => issue.severity === 'medium').length,
    issues: issues.slice(0, 80),
  };
};

const main = async () => {
  await signInWithEmailAndPassword(auth, `${username}@restaurant.local`, password);
  const stores = await getRows('stores');
  const cutoff = Date.now() - hours * 60 * 60 * 1000;
  const report = [];

  for (const store of stores) {
    const storeId = store.id || store.docId;
    try {
      const [orders, tables] = await Promise.all([
        getRows(`stores/${storeId}/pos_orders`),
        getRows(`stores/${storeId}/pos_tables`),
      ]);
      report.push(auditStore(store, orders, tables, cutoff));
    } catch (error) {
      report.push({
        storeId,
        storeName: store.name || store.storeName || storeId,
        readError: error?.message || String(error),
      });
    }
  }

  const summary = report.reduce((acc, storeReport) => {
    acc.issueCount += storeReport.issueCount || 0;
    acc.criticalCount += storeReport.criticalCount || 0;
    acc.highCount += storeReport.highCount || 0;
    acc.mediumCount += storeReport.mediumCount || 0;
    return acc;
  }, { issueCount: 0, criticalCount: 0, highCount: 0, mediumCount: 0 });

  console.log(JSON.stringify({
    generatedAt: new Date().toISOString(),
    timezone: 'America/Managua',
    hours,
    summary,
    report,
  }, null, 2));

  process.exit(summary.criticalCount > 0 ? 2 : 0);
};

main().catch(error => {
  console.error(error);
  process.exit(1);
});
