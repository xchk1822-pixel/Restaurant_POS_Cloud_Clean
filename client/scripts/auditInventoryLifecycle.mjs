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

const username = args.get('username') || process.env.INVENTORY_AUDIT_USERNAME || 'admin';
const password = args.get('password') || process.env.INVENTORY_AUDIT_PASSWORD || '';
const hours = Number(args.get('hours') || process.env.INVENTORY_AUDIT_HOURS || 96);

if (!password) {
  console.error('Usage: npm run audit:inventory-lifecycle -- --password <password> [--username admin] [--hours 96]');
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

const toNumber = value => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
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

const getPurchaseMillis = order => Math.max(
  toMillis(order.orderDate),
  toMillis(order.receivedDate),
  toMillis(order.createdAt),
  toMillis(order.lastModified)
);

const summarizeItem = item => ({
  id: item.id || item.docId,
  name: item.name || item.itemName || '',
  category: item.category || '',
  unit: item.unit || '',
  currentStock: toNumber(item.currentStock),
  minStock: toNumber(item.minStock),
});

const summarizeFridgeRecord = record => ({
  id: record.id || record.docId,
  fridgeId: record.fridgeId || '',
  fridgeName: record.fridgeName || '',
  itemId: record.itemId || '',
  itemName: record.itemName || '',
  quantity: toNumber(record.quantity),
  sortOrder: record.sortOrder ?? null,
});

const summarizePurchase = order => ({
  id: order.id || order.docId,
  orderNumber: order.orderNumber || '',
  supplierId: order.supplierId || '',
  supplierName: order.supplierName || '',
  paymentType: order.paymentType || '',
  totalAmount: toNumber(order.totalAmount),
  paidAmount: toNumber(order.paidAmount),
  itemCount: Array.isArray(order.items) ? order.items.length : 0,
  managuaTime: toManaguaDateTime(getPurchaseMillis(order)),
});

const pushIssue = (issues, type, severity, details) => {
  issues.push({ type, severity, ...details });
};

const auditStore = ({
  store,
  inventoryItems,
  fridges,
  fridgeInventory,
  transferRecords,
  inventoryStockRecords,
  warehouseStocktakeHistory,
  fridgeStocktakeHistory,
  purchaseOrders,
  expenses,
  cutoff,
}) => {
  const issues = [];
  const itemsById = new Map(inventoryItems.map(item => [item.id || item.docId, item]));
  const fridgesById = new Map(fridges.map(fridge => [fridge.id || fridge.docId, fridge]));

  inventoryItems.forEach(item => {
    if (toNumber(item.currentStock) < 0) {
      pushIssue(issues, 'negative_warehouse_stock', 'critical', { item: summarizeItem(item) });
    }
  });

  fridgeInventory.forEach(record => {
    if (toNumber(record.quantity) < 0) {
      pushIssue(issues, 'negative_fridge_stock', 'critical', { record: summarizeFridgeRecord(record) });
    }
    if (!itemsById.has(record.itemId)) {
      pushIssue(issues, 'fridge_record_missing_item', 'high', { record: summarizeFridgeRecord(record) });
    }
    if (!fridgesById.has(record.fridgeId)) {
      pushIssue(issues, 'fridge_record_missing_fridge', 'high', { record: summarizeFridgeRecord(record) });
    }
  });

  const fridgeItemGroups = new Map();
  fridgeInventory.forEach(record => {
    const key = `${record.fridgeId || ''}:${record.itemId || ''}`;
    fridgeItemGroups.set(key, [...(fridgeItemGroups.get(key) || []), record]);
  });
  fridgeItemGroups.forEach((records, key) => {
    if (records.length > 1) {
      pushIssue(issues, 'duplicate_fridge_item_record', 'critical', {
        key,
        records: records.map(summarizeFridgeRecord),
      });
    }
  });

  const transferGroups = new Map();
  transferRecords.forEach(record => {
    const key = record.operationId || record.id || record.docId;
    if (!key) return;
    transferGroups.set(key, [...(transferGroups.get(key) || []), record]);
  });
  transferGroups.forEach((records, operationId) => {
    if (records.length > 1) {
      pushIssue(issues, 'duplicate_transfer_operation_id', 'critical', {
        operationId,
        recordIds: records.map(record => record.id || record.docId),
      });
    }
  });

  const expensePurchaseIds = new Set();
  expenses.forEach(expense => {
    [expense.purchaseOrderId, expense.orderId].filter(Boolean).forEach(id => expensePurchaseIds.add(String(id)));
  });
  purchaseOrders
    .filter(order => getPurchaseMillis(order) >= cutoff)
    .forEach(order => {
      const totalAmount = toNumber(order.totalAmount);
      const paidAmount = toNumber(order.paidAmount);
      const isCashPurchase = order.paymentType === 'cash' || (totalAmount > 0 && paidAmount >= totalAmount - 0.001);
      if (isCashPurchase && !expensePurchaseIds.has(String(order.id || order.docId))) {
        pushIssue(issues, 'cash_purchase_missing_expense_link', 'high', { purchaseOrder: summarizePurchase(order) });
      }
    });

  return {
    storeId: store.id || store.docId,
    storeName: store.name || store.storeName || store.id || store.docId,
    inventoryItemCount: inventoryItems.length,
    fridgeCount: fridges.length,
    fridgeInventoryCount: fridgeInventory.length,
    transferRecordCount: transferRecords.length,
    inventoryStockRecordCount: inventoryStockRecords.length,
    warehouseStocktakeCount: warehouseStocktakeHistory.length,
    fridgeStocktakeCount: fridgeStocktakeHistory.length,
    purchaseOrderCount: purchaseOrders.length,
    issueCount: issues.length,
    criticalCount: issues.filter(issue => issue.severity === 'critical').length,
    highCount: issues.filter(issue => issue.severity === 'high').length,
    mediumCount: issues.filter(issue => issue.severity === 'medium').length,
    issues: issues.slice(0, 120),
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
      const [
        inventoryItems,
        fridges,
        fridgeInventory,
        transferRecords,
        inventoryStockRecords,
        warehouseStocktakeHistory,
        fridgeStocktakeHistory,
        purchaseOrders,
        expenses,
      ] = await Promise.all([
        getRows(`stores/${storeId}/inventory_items`),
        getRows(`stores/${storeId}/fridges`),
        getRows(`stores/${storeId}/fridge_inventory`),
        getRows(`stores/${storeId}/stock_transfer_records`),
        getRows(`stores/${storeId}/inventory_stock_records`),
        getRows(`stores/${storeId}/warehouse_stocktake_history`),
        getRows(`stores/${storeId}/fridge_stocktake_history`),
        getRows(`stores/${storeId}/purchase_orders`),
        getRows(`stores/${storeId}/expenses`),
      ]);

      report.push(auditStore({
        store,
        inventoryItems,
        fridges,
        fridgeInventory,
        transferRecords,
        inventoryStockRecords,
        warehouseStocktakeHistory,
        fridgeStocktakeHistory,
        purchaseOrders,
        expenses,
        cutoff,
      }));
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
