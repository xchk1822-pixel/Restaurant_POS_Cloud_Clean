import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  getFirestore,
  increment,
  updateDoc,
} from 'firebase/firestore';

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
const orderNumber = String(args.get('order') || '').trim();
const apply = args.has('apply');

if (!password || !orderNumber) {
  console.error('Usage: node scripts/deletePurchaseOrderByNumber.mjs --username admin --password <password> --order 981631 [--apply]');
  process.exit(1);
}

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const getRows = async path => {
  const snapshot = await getDocs(collection(db, path));
  return snapshot.docs.map(row => ({ docId: row.id, ...row.data() }));
};

const toNumber = value => Number(value) || 0;

const main = async () => {
  await signInWithEmailAndPassword(auth, `${username}@restaurant.local`, password);
  const stores = await getRows('stores');
  const matches = [];

  for (const store of stores) {
    const storeId = store.id || store.docId;
    const basePath = `stores/${storeId}`;
    const [purchaseOrders, expenses] = await Promise.all([
      getRows(`${basePath}/purchase_orders`),
      getRows(`${basePath}/expenses`),
    ]);
    const orderMatches = purchaseOrders.filter(order => String(order.orderNumber || '').trim() === orderNumber);

    for (const order of orderMatches) {
      const matchingExpenses = expenses.filter(expense => (
        String(expense.orderNumber || '').trim() === orderNumber ||
        String(expense.description || '').includes(`(${orderNumber})`)
      ));
      const inventoryDelta = new Map();
      for (const item of Array.isArray(order.items) ? order.items : []) {
        const itemId = String(item.itemId || '').trim();
        const quantity = toNumber(item.quantity);
        if (!itemId || quantity <= 0) continue;
        inventoryDelta.set(itemId, (inventoryDelta.get(itemId) || 0) - quantity);
      }

      matches.push({
        storeId,
        storeName: store.name || store.storeName || storeId,
        basePath,
        order,
        matchingExpenses,
        inventoryDelta,
      });
    }
  }

  const preview = matches.map(match => ({
    storeId: match.storeId,
    storeName: match.storeName,
    orderDocId: match.order.docId,
    orderId: match.order.id || match.order.docId,
    orderNumber: match.order.orderNumber,
    supplierName: match.order.supplierName || '',
    totalAmount: toNumber(match.order.totalAmount),
    expenseDocs: match.matchingExpenses.map(expense => ({
      docId: expense.docId,
      id: expense.id || expense.docId,
      amount: toNumber(expense.amount),
      description: expense.description || '',
    })),
    inventoryRollback: Array.from(match.inventoryDelta.entries()).map(([itemId, amount]) => ({
      itemId,
      amount,
    })),
  }));

  console.log(JSON.stringify({
    orderNumber,
    apply,
    matchCount: matches.length,
    preview,
  }, null, 2));

  if (matches.length !== 1) {
    console.error(`Expected exactly one purchase order ${orderNumber}, found ${matches.length}. No changes applied.`);
    process.exit(1);
  }

  if (!apply) {
    console.log('Dry run only. Re-run with --apply to delete and rollback stock/expense.');
    return;
  }

  const [match] = matches;
  await deleteDoc(doc(db, `${match.basePath}/purchase_orders`, match.order.docId));
  for (const expense of match.matchingExpenses) {
    await deleteDoc(doc(db, `${match.basePath}/expenses`, expense.docId));
  }
  for (const [itemId, amount] of match.inventoryDelta.entries()) {
    await updateDoc(doc(db, `${match.basePath}/inventory_items`, itemId), {
      currentStock: increment(amount),
      lastModified: Date.now(),
      lastUpdated: new Date(),
    });
  }

  console.log(JSON.stringify({
    applied: true,
    deletedPurchaseOrder: match.order.docId,
    deletedExpenseCount: match.matchingExpenses.length,
    inventoryRollback: Array.from(match.inventoryDelta.entries()).map(([itemId, amount]) => ({ itemId, amount })),
  }, null, 2));
};

main().catch(error => {
  console.error(error);
  process.exit(1);
});
