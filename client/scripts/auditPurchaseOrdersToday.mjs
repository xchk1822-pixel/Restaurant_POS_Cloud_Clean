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
const targetDate = args.get('date') || new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Managua',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date());

if (!password) {
  console.error('Usage: node scripts/auditPurchaseOrdersToday.mjs --username admin --password <password> [--date YYYY-MM-DD]');
  process.exit(1);
}

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

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
  const match = String(id || '').match(/^po-(\d{10,})/);
  return match ? Number(match[1]) : 0;
};

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

const dateKey = millis => {
  if (!millis) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Managua',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(millis));
};

const getRows = async path => {
  const snapshot = await getDocs(collection(db, path));
  return snapshot.docs.map(row => ({ docId: row.id, ...row.data() }));
};

const orderTime = order => Math.max(
  idMillis(order.id || order.docId),
  toMillis(order.orderDate),
  toMillis(order.receivedDate),
  toMillis(order.createdAt),
  toMillis(order.lastModified),
  toMillis(order.lastUpdated)
);

const main = async () => {
  await signInWithEmailAndPassword(auth, `${username}@restaurant.local`, password);
  const stores = await getRows('stores');
  const report = [];

  for (const store of stores) {
    const storeId = store.id || store.docId;
    const basePath = `stores/${storeId}`;
    const [purchaseOrders, expenses, inventoryItems] = await Promise.all([
      getRows(`${basePath}/purchase_orders`),
      getRows(`${basePath}/expenses`),
      getRows(`${basePath}/inventory_items`),
    ]);
    const itemById = new Map(inventoryItems.map(item => [item.id || item.docId, item]));

    const todayOrders = purchaseOrders
      .map(order => ({ ...order, submitMillis: orderTime(order) }))
      .filter(order => dateKey(order.submitMillis) === targetDate)
      .sort((a, b) => b.submitMillis - a.submitMillis);

    report.push({
      storeId,
      storeName: store.name || store.storeName || storeId,
      date: targetDate,
      count: todayOrders.length,
      orders: todayOrders.map(order => {
        const orderNumber = String(order.orderNumber || '').trim();
        const matchingExpenses = expenses.filter(expense => (
          String(expense.orderNumber || '').trim() === orderNumber ||
          String(expense.description || '').includes(`(${orderNumber})`)
        ));
        return {
          id: order.id || order.docId,
          docId: order.docId,
          orderNumber,
          supplierName: order.supplierName || '',
          paymentType: order.paymentType || '',
          status: order.status || '',
          submitTime: formatManagua(order.submitMillis),
          idTime: formatManagua(idMillis(order.id || order.docId)),
          orderDate: formatManagua(toMillis(order.orderDate)),
          receivedDate: formatManagua(toMillis(order.receivedDate)),
          createdAt: formatManagua(toMillis(order.createdAt)),
          lastModified: formatManagua(toMillis(order.lastModified)),
          totalAmount: Number(order.totalAmount) || 0,
          paidAmount: Number(order.paidAmount) || 0,
          expenseCount: matchingExpenses.length,
          expenseTotal: matchingExpenses.reduce((sum, expense) => sum + (Number(expense.amount) || 0), 0),
          items: (Array.isArray(order.items) ? order.items : []).map(item => {
            const inventory = itemById.get(item.itemId);
            return {
              itemId: item.itemId,
              itemName: item.itemName,
              purchasedQuantity: Number(item.quantity) || 0,
              currentStock: inventory ? Number(inventory.currentStock) || 0 : null,
              appliedIncrementOperationCount: Array.isArray(inventory?.appliedIncrementOperationIds)
                ? inventory.appliedIncrementOperationIds.length
                : 0,
            };
          }),
        };
      }),
    });
  }

  console.log(JSON.stringify({ targetDate, report }, null, 2));
};

main().catch(error => {
  console.error(error);
  process.exit(1);
});
