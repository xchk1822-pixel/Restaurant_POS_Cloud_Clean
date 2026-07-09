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

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

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
const hours = Number(args.get('hours') || 48);

if (!password) {
  console.error('Usage: node scripts/auditPosOrderAnomalies.mjs --username admin --password <password> [--hours 48]');
  process.exit(1);
}

const toMillis = value => {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  return 0;
};

const toManaguaDate = millis => {
  if (!millis) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Managua',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(millis));
};

const describeTime = value => {
  const millis = toMillis(value);
  return {
    present: value !== undefined && value !== null,
    type: value === null ? 'null' : typeof value,
    millis,
    iso: millis ? new Date(millis).toISOString() : '',
  };
};

const getRows = async path => {
  const snapshot = await getDocs(collection(db, path));
  return snapshot.docs.map(row => ({ docId: row.id, ...row.data() }));
};

const getOrderMillis = order => Math.max(
  toMillis(order.createdAt),
  toMillis(order.preparingAt),
  toMillis(order.cancelledAt),
  toMillis(order.completedAt),
  toMillis(order.lastModified),
  toMillis(order.updatedAt)
);

const main = async () => {
  await signInWithEmailAndPassword(auth, `${username}@restaurant.local`, password);
  const cutoff = Date.now() - hours * 60 * 60 * 1000;
  const stores = await getRows('stores');
  const report = [];

  for (const store of stores) {
    const storeId = store.id || store.docId;
    const orders = await getRows(`stores/${storeId}/pos_orders`);
    const relevant = orders
      .map(order => ({ ...order, orderMillis: getOrderMillis(order) }))
      .filter(order =>
        order.orderMillis >= cutoff ||
        order.status === 'cancelled' ||
        (order.orderType === 'dine_in' && !order.tableId)
      )
      .sort((a, b) => b.orderMillis - a.orderMillis);

    const anomalies = relevant.filter(order =>
      order.status === 'cancelled' ||
      (order.orderType === 'dine_in' && !order.tableId) ||
      (!order.tableId && order.paymentStatus !== 'paid' && order.status !== 'completed')
    );

    report.push({
      storeId,
      storeName: store.name || store.storeName || storeId,
      anomalyCount: anomalies.length,
      anomalies: anomalies.slice(0, 30).map(order => ({
        id: order.id || order.docId,
        orderNumber: order.orderNumber,
        orderType: order.orderType,
        tableId: order.tableId || '',
        tableNumber: order.tableNumber || '',
        status: order.status,
        paymentStatus: order.paymentStatus,
        totalAmount: Number(order.totalAmount) || 0,
        paidAmount: Number(order.paidAmount) || 0,
        settledAmount: Number(order.settledAmount) || 0,
        cancelReason: order.cancelReason || '',
        managuaDate: toManaguaDate(order.orderMillis),
        itemCount: Array.isArray(order.items) ? order.items.length : 0,
        times: {
          createdAt: describeTime(order.createdAt),
          preparingAt: describeTime(order.preparingAt),
          cancelledAt: describeTime(order.cancelledAt),
          completedAt: describeTime(order.completedAt),
          lastModified: describeTime(order.lastModified),
          updatedAt: describeTime(order.updatedAt),
        },
      })),
    });
  }

  console.log(JSON.stringify({ hours, report }, null, 2));
  process.exit(0);
};

main().catch(error => {
  console.error(error);
  process.exit(1);
});
