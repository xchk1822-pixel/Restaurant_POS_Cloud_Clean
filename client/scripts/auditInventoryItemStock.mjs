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

const username = args.get('username') || 'admin';
const password = args.get('password') || '';
const term = String(args.get('item') || '').trim();
const days = Number(args.get('days') || 5);

if (!password || !term) {
  console.error('Usage: node scripts/auditInventoryItemStock.mjs --username admin --password <password> --item "TOÑA VIDRIO" [--days 5]');
  process.exit(1);
}

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const strip = value => String(value || '')
  .normalize('NFD')
  .replace(/\p{Diacritic}/gu, '')
  .toLowerCase()
  .trim();

const toMillis = value => {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  if (typeof value.seconds === 'number') return value.seconds * 1000 + Math.floor((value.nanoseconds || 0) / 1000000);
  return 0;
};

const idMillis = id => {
  const match = String(id || '').match(/(?:po|stocktake|pending|inc|expense)-(\d{10,})/);
  return match ? Number(match[1]) : 0;
};

const eventMillis = record => Math.max(
  idMillis(record.id || record.docId),
  toMillis(record.orderDate),
  toMillis(record.receivedDate),
  toMillis(record.createdAt),
  toMillis(record.completedAt),
  toMillis(record.cancelledAt),
  toMillis(record.lastModified),
  toMillis(record.lastUpdated),
  toMillis(record.updatedAt),
);

const formatManagua = millis => {
  if (!millis) return '';
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'America/Managua',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(millis));
};

const getRows = async path => {
  const snapshot = await getDocs(collection(db, path));
  return snapshot.docs.map(row => ({ docId: row.id, ...row.data() }));
};

const containsItem = (item, targets) => {
  const normalized = strip(item.itemName || item.name || item.productName || '');
  return targets.some(target => normalized.includes(target) || target.includes(normalized));
};

const summarizeTimeFields = row => ({
  idTime: formatManagua(idMillis(row.id || row.docId)),
  orderDate: formatManagua(toMillis(row.orderDate)),
  receivedDate: formatManagua(toMillis(row.receivedDate)),
  createdAt: formatManagua(toMillis(row.createdAt)),
  completedAt: formatManagua(toMillis(row.completedAt)),
  lastModified: formatManagua(toMillis(row.lastModified)),
  lastUpdated: formatManagua(toMillis(row.lastUpdated)),
});

const main = async () => {
  await signInWithEmailAndPassword(auth, `${username}@restaurant.local`, password);

  const normalizedTerm = strip(term);
  const targets = normalizedTerm.split(/\s+/).filter(Boolean);
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const stores = await getRows('stores');
  const report = [];

  for (const store of stores) {
    const storeId = store.id || store.docId;
    const basePath = `stores/${storeId}`;
    const [
      inventoryItems,
      fridgeInventory,
      fridges,
      warehouseHistory,
      fridgeHistory,
      purchaseOrders,
      posOrders,
    ] = await Promise.all([
      getRows(`${basePath}/inventory_items`),
      getRows(`${basePath}/fridge_inventory`),
      getRows(`${basePath}/fridges`),
      getRows(`${basePath}/warehouse_stocktake_history`),
      getRows(`${basePath}/fridge_stocktake_history`),
      getRows(`${basePath}/purchase_orders`),
      getRows(`${basePath}/pos_orders`),
    ]);

    const matchedItems = inventoryItems.filter(item => {
      const name = strip(item.name);
      return targets.every(part => name.includes(part)) || name.includes(normalizedTerm);
    });

    for (const item of matchedItems) {
      const itemId = item.id || item.docId;
      const fridgeRows = fridgeInventory.filter(row => row.itemId === itemId);
      const fridgeTotal = fridgeRows.reduce((sum, row) => sum + (Number(row.quantity) || 0), 0);

      const purchaseHits = purchaseOrders
        .map(order => ({
          order,
          items: (Array.isArray(order.items) ? order.items : []).filter(line => line.itemId === itemId || containsItem(line, [normalizedTerm])),
          millis: eventMillis(order),
        }))
        .filter(hit => hit.items.length > 0 && hit.millis >= cutoff)
        .sort((a, b) => b.millis - a.millis)
        .map(hit => ({
          id: hit.order.id || hit.order.docId,
          docId: hit.order.docId,
          orderNumber: hit.order.orderNumber || '',
          supplierName: hit.order.supplierName || '',
          paymentType: hit.order.paymentType || '',
          status: hit.order.status || '',
          totalAmount: Number(hit.order.totalAmount) || 0,
          eventTime: formatManagua(hit.millis),
          times: summarizeTimeFields(hit.order),
          items: hit.items.map(line => ({
            itemId: line.itemId,
            itemName: line.itemName,
            quantity: Number(line.quantity) || 0,
            unitPrice: Number(line.unitPrice) || 0,
            subtotal: Number(line.subtotal) || 0,
          })),
        }));

      const warehouseHits = warehouseHistory
        .map(record => ({
          record,
          lines: (Array.isArray(record.items) ? record.items : []).filter(line => line.itemId === itemId || containsItem(line, [normalizedTerm])),
          millis: eventMillis(record),
        }))
        .filter(hit => hit.lines.length > 0 && hit.millis >= cutoff)
        .sort((a, b) => b.millis - a.millis)
        .map(hit => ({
          id: hit.record.id || hit.record.docId,
          docId: hit.record.docId,
          date: hit.record.date || '',
          eventTime: formatManagua(hit.millis),
          totalDiscrepancies: Number(hit.record.totalDiscrepancies) || 0,
          lines: hit.lines.map(line => ({
            itemId: line.itemId,
            itemName: line.itemName,
            systemStock: Number(line.systemStock) || 0,
            actualStock: Number(line.actualStock) || 0,
            difference: Number(line.difference) || 0,
            unit: line.unit || '',
          })),
        }));

      const fridgeHits = fridgeHistory
        .map(record => ({
          record,
          lines: (Array.isArray(record.items) ? record.items : []).filter(line => line.itemId === itemId || containsItem(line, [normalizedTerm])),
          millis: eventMillis(record),
        }))
        .filter(hit => hit.lines.length > 0 && hit.millis >= cutoff)
        .sort((a, b) => b.millis - a.millis)
        .map(hit => ({
          id: hit.record.id || hit.record.docId,
          docId: hit.record.docId,
          date: hit.record.date || '',
          fridgeId: hit.record.fridgeId || '',
          fridgeName: hit.record.fridgeName || '',
          eventTime: formatManagua(hit.millis),
          totalDiscrepancies: Number(hit.record.totalDiscrepancies) || 0,
          lines: hit.lines.map(line => ({
            itemId: line.itemId,
            itemName: line.itemName,
            totalStock: Number(line.totalStock) || 0,
            warehouseStock: Number(line.warehouseStock) || 0,
            systemStock: Number(line.systemStock) || 0,
            actualStock: Number(line.actualStock) || 0,
            difference: Number(line.difference) || 0,
            unit: line.unit || '',
          })),
        }));

      const salesHits = posOrders
        .map(order => ({
          order,
          items: (Array.isArray(order.items) ? order.items : []).filter(line => line.inventoryItemId === itemId || line.itemId === itemId || containsItem(line, [normalizedTerm])),
          millis: eventMillis(order),
        }))
        .filter(hit => hit.items.length > 0 && hit.millis >= cutoff)
        .sort((a, b) => b.millis - a.millis)
        .map(hit => ({
          id: hit.order.id || hit.order.docId,
          orderNumber: hit.order.orderNumber || '',
          status: hit.order.status || '',
          paymentStatus: hit.order.paymentStatus || '',
          orderType: hit.order.orderType || '',
          eventTime: formatManagua(hit.millis),
          items: hit.items.map(line => ({
            itemId: line.itemId,
            inventoryItemId: line.inventoryItemId,
            name: line.name || line.itemName,
            quantity: Number(line.quantity) || 0,
          })),
        }));

      report.push({
        storeId,
        storeName: store.name || store.storeName || storeId,
        item: {
          docId: item.docId,
          id: itemId,
          name: item.name || '',
          category: item.category || '',
          unit: item.unit || '',
          currentStock: Number(item.currentStock) || 0,
          appliedIncrementOperationIdsCount: Array.isArray(item.appliedIncrementOperationIds)
            ? item.appliedIncrementOperationIds.length
            : 0,
          appliedIncrementOperationIdsTail: Array.isArray(item.appliedIncrementOperationIds)
            ? item.appliedIncrementOperationIds.slice(-10)
            : [],
          lastModified: formatManagua(toMillis(item.lastModified)),
          lastUpdated: formatManagua(toMillis(item.lastUpdated)),
        },
        fridge: {
          total: fridgeTotal,
          rows: fridgeRows.map(row => ({
            docId: row.docId,
            id: row.id || row.docId,
            fridgeId: row.fridgeId,
            fridgeName: fridges.find(fridge => (fridge.id || fridge.docId) === row.fridgeId)?.name || '',
            quantity: Number(row.quantity) || 0,
            lastModified: formatManagua(toMillis(row.lastModified)),
          })),
        },
        totalVisibleStock: (Number(item.currentStock) || 0) + fridgeTotal,
        recentPurchaseOrders: purchaseHits,
        recentWarehouseStocktakes: warehouseHits,
        recentFridgeStocktakes: fridgeHits,
        recentSalesOrders: salesHits,
      });
    }
  }

  console.log(JSON.stringify({
    term,
    days,
    generatedAt: formatManagua(Date.now()),
    matchCount: report.length,
    report,
  }, null, 2));
};

main().then(() => process.exit(0)).catch(error => {
  console.error(error);
  process.exit(1);
});
