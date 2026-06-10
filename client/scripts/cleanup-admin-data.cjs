const firebaseConfig = {
  apiKey: 'AIzaSyCLXao2R2XHvxmU2QiEK0SlfkqkbXS14Lw',
  projectId: 'restaurant-pos-1b420',
};

const firestoreBaseUrl = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents`;

const canonicalRoles = [
  {
    id: 'store_manager',
    name: '店长',
    description: '分店经营管理权限',
    permissions: [
      'pos', 'waiter', 'kitchen', 'inventory', 'inventory:items', 'inventory:menu',
      'inventory:warehouse', 'inventory:fridge', 'inventory:suppliers',
      'employees', 'employees:profile', 'employees:attendance', 'employees:loans',
      'employees:salary', 'manager', 'manager:expenses', 'manager:handover',
      'manager:orders', 'manager:reports', 'manager:overview', 'manager:customers',
    ],
    color: '#2563eb',
    icon: '🏢',
  },
  { id: 'cashier', name: '收银', description: 'POS收银权限', permissions: ['pos'], color: '#16a34a', icon: '💰' },
  { id: 'waiter', name: '服务生', description: '服务生点餐权限', permissions: ['waiter'], color: '#f59e0b', icon: '🍽️' },
  { id: 'chef', name: '厨师', description: '厨房显示权限', permissions: ['kitchen'], color: '#ef4444', icon: '👨‍🍳' },
];

const roleAlias = {
  store_manager: 'store_manager',
  manager: 'store_manager',
  店长: 'store_manager',
  cashier: 'cashier',
  收银: 'cashier',
  waiter: 'waiter',
  服务生: 'waiter',
  chef: 'chef',
  厨师: 'chef',
};

const preferredUserDocIds = new Set([
  'XleVmJIyILUkEOTI9jurFO6k8Pn2',
  'CKUzlSxrYMgzTUlHKaPVHbgkv6l2',
  'PYPEFCuPJnMXSHXtrJHAkFBwYxT2',
]);

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`${response.status}: ${payload?.error?.message || text}`);
  }
  return payload;
}

function encodeValue(value) {
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'number') return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encodeValue) } };
  if (value && typeof value === 'object') {
    return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encodeValue(item)])) } };
  }
  return { nullValue: null };
}

function encodeDocument(data) {
  return { fields: Object.fromEntries(Object.entries(data).map(([key, value]) => [key, encodeValue(value)])) };
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
    _path: document.name,
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

async function setDoc(path, data, token) {
  await requestJson(`${firestoreBaseUrl}/${path}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(encodeDocument(data)),
  });
}

async function deleteDoc(path, token) {
  await requestJson(`${firestoreBaseUrl}/${path}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
}

function canonicalRoleId(role) {
  for (const value of [role.id, role.name]) {
    const key = String(value || '').trim();
    if (roleAlias[key]) return roleAlias[key];
    if (roleAlias[key.toLowerCase()]) return roleAlias[key.toLowerCase()];
  }
  return null;
}

(async () => {
  const auth = await signIn('admin', 'admin123');
  const users = await list('users', auth.idToken);
  const roles = await list('system_roles', auth.idToken);

  const usersByName = new Map();
  users.forEach(user => {
    const username = String(user.username || '').toLowerCase();
    if (!username) return;
    if (!usersByName.has(username)) usersByName.set(username, []);
    usersByName.get(username).push(user);
  });

  const deletedUsers = [];
  for (const group of usersByName.values()) {
    if (group.length < 2) continue;
    const keep = group.find(user => preferredUserDocIds.has(user._id)) || group.sort((a, b) => String(b._id).length - String(a._id).length)[0];
    for (const user of group) {
      if (user._id === keep._id) continue;
      await deleteDoc(`users/${user._id}`, auth.idToken);
      deletedUsers.push({ id: user._id, username: user.username });
    }
  }

  const roleByCanonical = new Map();
  roles.forEach(role => {
    const id = canonicalRoleId(role);
    if (id && !roleByCanonical.has(id)) roleByCanonical.set(id, role);
  });

  const writtenRoles = [];
  for (const defaultRole of canonicalRoles) {
    const existing = roleByCanonical.get(defaultRole.id);
    const data = {
      ...defaultRole,
      permissions: Array.isArray(existing?.permissions) && existing.permissions.length > 0 ? existing.permissions : defaultRole.permissions,
      updatedAt: new Date().toISOString(),
    };
    await setDoc(`system_roles/${defaultRole.id}`, data, auth.idToken);
    writtenRoles.push(defaultRole.id);
  }

  const deletedRoles = [];
  for (const role of roles) {
    if (canonicalRoles.some(item => item.id === role._id)) continue;
    await deleteDoc(`system_roles/${role._id}`, auth.idToken);
    deletedRoles.push({ docId: role._id, id: role.id, name: role.name });
  }

  console.log(JSON.stringify({ deletedUsers, writtenRoles, deletedRoles }, null, 2));
})().catch(error => {
  console.error(error.message || error);
  process.exit(1);
});
