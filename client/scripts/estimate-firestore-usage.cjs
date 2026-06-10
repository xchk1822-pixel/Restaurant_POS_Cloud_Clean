const firebaseConfig = {
  apiKey: 'AIzaSyCLXao2R2XHvxmU2QiEK0SlfkqkbXS14Lw',
  projectId: 'restaurant-pos-1b420',
};

const firestoreBaseUrl = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents`;

const storeCollections = [
  'inventory_items',
  'menu_items',
  'pos_orders',
  'expenses',
  'purchase_orders',
  'employees',
  'fridges',
  'fridge_inventory',
  'suppliers',
  'attendance_records',
  'loan_records',
  'salary_records',
  'handovers',
  'customers',
  'expense_categories',
  'points_transactions',
  'exchange_rate',
  'pos_cancel_records',
  'pos_held_orders',
  'pos_tables',
];

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(`${response.status}: ${payload?.error?.message || text}`);
  return payload;
}

function decodeValue(value) {
  if (!value) return undefined;
  if ('stringValue' in value) return value.stringValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('booleanValue' in value) return value.booleanValue;
  if ('timestampValue' in value) return value.timestampValue;
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(decodeValue);
  if ('mapValue' in value) return Object.fromEntries(Object.entries(value.mapValue.fields || {}).map(([key, item]) => [key, decodeValue(item)]));
  return undefined;
}

function decodeDocument(document) {
  return {
    _id: document.name.split('/').pop(),
    ...Object.fromEntries(Object.entries(document.fields || {}).map(([key, value]) => [key, decodeValue(value)])),
  };
}

async function signIn(username, password) {
  return requestJson(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${firebaseConfig.apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `${username}@restaurant.local`, password, returnSecureToken: true }),
  });
}

async function list(path, token) {
  const result = await requestJson(`${firestoreBaseUrl}/${path}?pageSize=1000`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return (result.documents || []).map(decodeDocument);
}

(async () => {
  const auth = await signIn('admin', 'admin123');
  const stores = await list('stores', auth.idToken);
  const users = await list('users', auth.idToken);
  const roles = await list('system_roles', auth.idToken);

  const storeCounts = {};
  for (const store of stores) {
    const storePathId = store.id || store._id;
    const counts = {};
    for (const collectionName of storeCollections) {
      const docs = await list(`stores/${storePathId}/${collectionName}`, auth.idToken);
      counts[collectionName] = docs.length;
    }
    storeCounts[storePathId] = {
      name: store.name,
      storeDocumentId: store._id,
      counts,
      subscribedByAppContext: [
        'inventory_items',
        'menu_items',
        'purchase_orders',
        'suppliers',
        'fridges',
        'fridge_inventory',
        'pos_orders',
      ].reduce((sum, key) => sum + (counts[key] || 0), 0),
      posScreenExtraSubscriptions: [
        'pos_tables',
      ].reduce((sum, key) => sum + (counts[key] || 0), 0),
      employeeScreenExtraSubscriptions: [
        'employees',
        'attendance_records',
        'salary_records',
        'loan_records',
      ].reduce((sum, key) => sum + (counts[key] || 0), 0),
      inventoryPurchaseScreenExtraSubscriptions: [
        'inventory_categories',
      ].reduce((sum, key) => sum + (counts[key] || 0), 0),
      managerFinancialScreenLikelyReads: [
        'pos_orders',
        'expenses',
        'purchase_orders',
      ].reduce((sum, key) => sum + (counts[key] || 0), 0),
    };
  }

  const globalInitialReadsForAdmin = users.length + roles.length + stores.length;
  const allStoreOwnerDashboardReads = Object.values(storeCounts).reduce((sum, store) =>
    sum + ['pos_orders', 'expenses', 'purchase_orders', 'inventory_items', 'employees']
      .reduce((inner, key) => inner + (store.counts[key] || 0), 0)
  , 0);

  console.log(JSON.stringify({
    generatedAt: new Date().toISOString(),
    global: {
      stores: stores.length,
      users: users.length,
      system_roles: roles.length,
      adminGlobalInitialReads: globalInitialReadsForAdmin,
      ownerDashboardStoreReads: allStoreOwnerDashboardReads,
      ownerDashboardInitialReads: globalInitialReadsForAdmin + allStoreOwnerDashboardReads,
    },
    stores: storeCounts,
  }, null, 2));
})().catch(error => {
  console.error(error.message || error);
  process.exit(1);
});
