const firebaseConfig = {
  apiKey: 'AIzaSyCLXao2R2XHvxmU2QiEK0SlfkqkbXS14Lw',
  projectId: 'restaurant-pos-1b420',
};

const firestoreBaseUrl = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents`;

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`${response.status}: ${payload?.error?.message || text}`);
  }
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
  if ('mapValue' in value) {
    return Object.fromEntries(Object.entries(value.mapValue.fields || {}).map(([key, itemValue]) => [key, decodeValue(itemValue)]));
  }
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

(async () => {
  const auth = await signIn('admin', 'admin123');
  const [users, roles, stores] = await Promise.all([
    list('users', auth.idToken),
    list('system_roles', auth.idToken),
    list('stores', auth.idToken),
  ]);

  const duplicateUsers = Object.values(users.reduce((acc, user) => {
    const key = String(user.username || '').toLowerCase();
    if (!key) return acc;
    acc[key] = acc[key] || [];
    acc[key].push({ id: user._id, username: user.username, role: user.role, storeId: user.storeId, name: user.name });
    return acc;
  }, {})).filter(group => group.length > 1);

  const duplicateRoles = Object.values(roles.reduce((acc, role) => {
    const key = String(role.id || role._id || role.name || '').toLowerCase();
    if (!key) return acc;
    acc[key] = acc[key] || [];
    acc[key].push({ id: role._id, roleId: role.id, name: role.name });
    return acc;
  }, {})).filter(group => group.length > 1);

  console.log(JSON.stringify({
    stores: stores.map(store => ({ id: store._id, name: store.name, status: store.status })),
    userCount: users.length,
    duplicateUsers,
    roleCount: roles.length,
    roles: roles.map(role => ({ docId: role._id, id: role.id, name: role.name })),
    duplicateRoles,
  }, null, 2));
})().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
