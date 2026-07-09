import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getFirestore,
  getDocs,
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

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

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
  console.error('Usage: node scripts/repairPurchaseOrderDuplicates.mjs --username admin --password <password> --order 0408 [--apply]');
  process.exit(1);
}

const auth = getAuth();

const toMillis = value => {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  return 0;
};

const itemSignature = order => {
  const items = Array.isArray(order.items) ? order.items : [];
  return items
    .map(item => [
      item.itemId || '',
      item.itemName || '',
      Number(item.quantity) || 0,
      Number(item.unitPrice) || 0,
      Number(item.subtotal) || 0,
    ].join(':'))
    .sort()
    .join('|');
};

const orderSortTime = order => Math.max(
  toMillis(order.createdAt),
  toMillis(order.orderDate),
  toMillis(order.lastModified),
  toMillis(order.lastUpdated)
);

const getCollectionRows = async path => {
  const snapshot = await getDocs(collection(db, path));
  return snapshot.docs.map(row => ({ docId: row.id, ...row.data() }));
};

const main = async () => {
  await signInWithEmailAndPassword(auth, `${username}@restaurant.local`, password);
  const stores = await getCollectionRows('stores');
  const report = [];

  for (const store of stores) {
    const storeId = store.id || store.docId;
    const basePath = `stores/${storeId}`;
    const purchaseOrders = await getCollectionRows(`${basePath}/purchase_orders`);
    const matches = purchaseOrders
      .filter(order => String(order.orderNumber || '').trim() === orderNumber)
      .sort((a, b) => orderSortTime(a) - orderSortTime(b));

    if (matches.length <= 1) {
      const expenses = await getCollectionRows(`${basePath}/expenses`);
      const matchingExpenses = expenses
        .filter(expense => String(expense.orderNumber || '').trim() === orderNumber
          || String(expense.description || '').includes(`(${orderNumber})`));
      report.push({
        storeId,
        storeName: store.name || store.storeName || storeId,
        status: matches.length === 1 ? 'single-order-no-duplicate' : 'no-order',
        count: matches.length,
        expenseCount: matchingExpenses.length,
        expenseTotal: matchingExpenses.reduce((sum, expense) => sum + (Number(expense.amount) || 0), 0),
      });
      continue;
    }

    const groups = new Map();
    for (const order of matches) {
      const key = [
        order.supplierId || '',
        order.supplierName || '',
        Number(order.totalAmount) || 0,
        order.paymentType || '',
        itemSignature(order),
      ].join('||');
      groups.set(key, [...(groups.get(key) || []), order]);
    }

    for (const [signature, orders] of groups.entries()) {
      if (orders.length <= 1) continue;
      const [keep, ...duplicates] = orders;
      const duplicateIds = new Set(duplicates.map(order => order.id || order.docId));
      const expenses = await getCollectionRows(`${basePath}/expenses`);
      const matchingExpenses = expenses
        .filter(expense => String(expense.orderNumber || '').trim() === orderNumber
          || String(expense.description || '').includes(`(${orderNumber})`))
        .sort((a, b) => orderSortTime(a) - orderSortTime(b));
      const expensesToDelete = matchingExpenses.slice(1);
      const inventoryDelta = new Map();
      duplicates.forEach(order => {
        (Array.isArray(order.items) ? order.items : []).forEach(item => {
          const itemId = item.itemId;
          const qty = Number(item.quantity) || 0;
          if (itemId && qty) {
            inventoryDelta.set(itemId, (inventoryDelta.get(itemId) || 0) - qty);
          }
        });
      });

      const entry = {
        storeId,
        storeName: store.name || store.storeName || storeId,
        orderNumber,
        duplicateGroupSize: orders.length,
        keptOrder: keep.id || keep.docId,
        duplicateOrders: duplicates.map(order => ({
          id: order.id || order.docId,
          totalAmount: Number(order.totalAmount) || 0,
          supplierName: order.supplierName,
          paymentType: order.paymentType,
          items: order.items,
        })),
        expensesMatched: matchingExpenses.map(expense => ({
          id: expense.id || expense.docId,
          amount: Number(expense.amount) || 0,
          description: expense.description,
        })),
        expensesToDelete: expensesToDelete.map(expense => expense.id || expense.docId),
        inventoryAdjustments: Array.from(inventoryDelta.entries()).map(([itemId, amount]) => ({ itemId, amount })),
        signature,
      };
      report.push(entry);

      if (!apply) continue;

      for (const order of duplicates) {
        await deleteDoc(doc(db, `${basePath}/purchase_orders`, order.docId));
      }
      for (const expense of expensesToDelete) {
        await deleteDoc(doc(db, `${basePath}/expenses`, expense.docId));
      }
      for (const [itemId, amount] of inventoryDelta.entries()) {
        await updateDoc(doc(db, `${basePath}/inventory_items`, itemId), {
          currentStock: increment(amount),
          lastModified: Date.now(),
          lastUpdated: new Date(),
        });
      }

      const affectedSupplierIds = new Set(orders.map(order => order.supplierId).filter(Boolean));
      if (affectedSupplierIds.size > 0) {
        const remainingOrders = purchaseOrders.filter(order => !duplicateIds.has(order.id || order.docId));
        for (const supplierId of affectedSupplierIds) {
          const balance = remainingOrders
            .filter(order => order.supplierId === supplierId)
            .reduce((sum, order) => sum + Math.max((Number(order.totalAmount) || 0) - (Number(order.paidAmount) || 0), 0), 0);
          await updateDoc(doc(db, `${basePath}/suppliers`, supplierId), {
            balance,
            lastModified: Date.now(),
            lastUpdated: new Date(),
          });
          entry.supplierBalanceRecalculated = {
            ...(entry.supplierBalanceRecalculated || {}),
            [supplierId]: balance,
          };
        }
      }
    }
  }

  console.log(JSON.stringify({ apply, orderNumber, report }, null, 2));
  process.exit(0);
};

main().catch(error => {
  console.error(error);
  process.exit(1);
});
