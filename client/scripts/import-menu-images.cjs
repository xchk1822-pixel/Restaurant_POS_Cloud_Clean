const firebaseConfig = {
  apiKey: 'AIzaSyCLXao2R2XHvxmU2QiEK0SlfkqkbXS14Lw',
  authDomain: 'restaurant-pos-1b420.firebaseapp.com',
  projectId: 'restaurant-pos-1b420',
  storageBucket: 'restaurant-pos-1b420.firebasestorage.app',
  messagingSenderId: '1033394792448',
  appId: '1:1033394792448:web:415d1b1438bd72133a90e5',
  measurementId: 'G-P4SF3XSJLN',
};

const projectId = firebaseConfig.projectId;
const firestoreBaseUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;

const username = process.env.MENU_IMPORT_USER || 'zeng';
const password = process.env.MENU_IMPORT_PASSWORD || '123456';

const menuItems = [
  ['Extra', 'Extra Camarones', 80],
  ['Extra', 'Extra Carne', 70],
  ['Extra', 'Extra Pollo', 60],
  ['Extra', 'Extra de Papas fritas', 60],
  ['Extra', 'Extra Arroz Cantone', 45],
  ['Extra', 'Extra Arroz Chino', 45],
  ['Extra', 'Extra Tostones', 40],
  ['Extra', 'Extra de Queso', 40],
  ['Extra', 'Extra Arroz Blanco', 25],
  ['Extra', 'Extra de Pan', 20],

  ['Bebidas / Drinks', 'Te Frio Vaso', 35],
  ['Bebidas / Drinks', 'Te Frio Pichel', 90],
  ['Bebidas / Drinks', 'Agua Pequena 1/2 L.', 35],
  ['Bebidas / Drinks', 'Agua Grande 1 L.', 50],
  ['Bebidas / Drinks', 'Hi-C Fruta', 30],
  ['Bebidas / Drinks', 'Hi-C Te', 35],
  ['Bebidas / Drinks', 'Gaseosa 12 Onza', 35],
  ['Bebidas / Drinks', 'Gaseosa 12 Onza Desechable', 40],
  ['Bebidas / Drinks', 'Gaseosa 1/2 Lt. Desechable', 45],
  ['Bebidas / Drinks', 'Gaseosa 1 Lt. Desechable', 80],
  ['Bebidas / Drinks', 'Gaseosa 1.25L', 100],
  ['Bebidas / Drinks', 'Gaseosa 2 Lt. Desechable', 120],
  ['Bebidas / Drinks', 'Powerade', 50],
  ['Bebidas / Drinks', 'Jugo Lata', 40],
  ['Bebidas / Drinks', 'California Fresa y Coco', 50],
  ['Bebidas / Drinks', 'Gatorade', 50],
  ['Bebidas / Drinks', 'Te Lipton', 50],

  ['Cerveza / Beer', 'Tona', 55],
  ['Cerveza / Beer', 'Frost', 55],
  ['Cerveza / Beer', 'Clasica', 55],
  ['Cerveza / Beer', 'Cerveza Lata 350 ml', 55],
  ['Cerveza / Beer', 'Heineken', 90],
  ['Cerveza / Beer', 'Smirnoff', 90],
  ['Cerveza / Beer', 'Bamboo', 60],
  ['Cerveza / Beer', 'Fuzion', 65],
  ['Cerveza / Beer', 'Adan y Eva', 75],

  ['Sopas y Bocadillos', 'Tacos Chinos / Chinese Tacos', 40],
  ['Sopas y Bocadillos', 'Wantan Frito o Precocido / Fried or Precooked Wantan (10 Uds)', 160],
  ['Sopas y Bocadillos', 'Empanadillas Frita o Precocida / Fried or precooked dumplings (10 Uds)', 200],
  ['Sopas y Bocadillos', 'Sopa de Tallarin / Tallarin Soup', 180],
  ['Sopas y Bocadillos', 'Sopa de Watan', 180],
  ['Sopas y Bocadillos', 'Sopa de Marisco', 380],

  ['Arroz Chino', 'Arroz Chino Especial', 460],
  ['Arroz Chino', 'Arroz Chino Mixto', 380],
  ['Arroz Chino', 'Arroz Chino Res con Camarones', 280],
  ['Arroz Chino', 'Arroz Chino Pollo con camarones', 260],
  ['Arroz Chino', 'Arroz Chino con Res', 210],
  ['Arroz Chino', 'Arroz Chino Pollo', 190],
  ['Arroz Chino', 'Arroz Chino Vegetariano', 140],

  ['Arroz Cantones', 'Arroz Cantones Especial', 460],
  ['Arroz Cantones', 'Arroz Cantone Mixto', 380],
  ['Arroz Cantones', 'Arroz Cantone Res con Camarones', 280],
  ['Arroz Cantones', 'Arroz Cantone Pollo con camarones', 260],
  ['Arroz Cantones', 'Arroz Cantone con Res', 210],
  ['Arroz Cantones', 'Arroz Cantone Pollo', 190],
  ['Arroz Cantones', 'Arroz Cantone Vegetariano', 140],

  ['Chow Ming / Espaguetti', 'Chow Ming Especial', 460],
  ['Chow Ming / Espaguetti', 'Chow Ming Mixto', 380],
  ['Chow Ming / Espaguetti', 'Chow Ming Res con Camarones', 280],
  ['Chow Ming / Espaguetti', 'Chow Ming Pollo con camarones', 260],
  ['Chow Ming / Espaguetti', 'Chow Ming con Res', 210],
  ['Chow Ming / Espaguetti', 'Chow Ming Pollo', 190],
  ['Chow Ming / Espaguetti', 'Chow Ming Vegetariano', 140],

  ['Chop Suey', 'Chop Suey Especial', 460],
  ['Chop Suey', 'Chop Suey Mixto', 380],
  ['Chop Suey', 'Chop Suey Res con Camarones', 280],
  ['Chop Suey', 'Chop Suey Pollo con camarones', 260],
  ['Chop Suey', 'Chop Suey con Res', 210],
  ['Chop Suey', 'Chop Suey Pollo', 190],
  ['Chop Suey', 'Chop Suey Vegetariano', 140],

  ['Chao Mi Fen / Fideo de Arroz', 'Chao Mi Fen Especial', 460],
  ['Chao Mi Fen / Fideo de Arroz', 'Chao Mi Fen Mixto', 380],
  ['Chao Mi Fen / Fideo de Arroz', 'Chao Mi Fen Res con Camarones', 280],
  ['Chao Mi Fen / Fideo de Arroz', 'Chao Mi Fen Pollo con camarones', 260],
  ['Chao Mi Fen / Fideo de Arroz', 'Chao Mi Fen con Res', 210],
  ['Chao Mi Fen / Fideo de Arroz', 'Chao Mi Fen Pollo', 190],
  ['Chao Mi Fen / Fideo de Arroz', 'Chao Mi Fen Vegetariano', 140],

  ['Pollo', 'Pollo Agridulce 1 Lb', 220],
  ['Pollo', 'Pollo Agridulce 2 Lb', 380],
  ['Pollo', 'Pollo Salsa China', 220],
  ['Pollo', 'Pollo con Brocoli', 270],
  ['Pollo', 'Pollo Saltiado con Hongos', 270],
  ['Pollo', 'Pollo Kong Bao', 270],

  ['Cerdo', 'Costilla de Cerdo Agridulce 1 Lb', 240],
  ['Cerdo', 'Costilla de Cerdo Agridulce 2 Lb', 420],
  ['Cerdo', 'Cerdo Agridulce / Sweet and Sour Pork 1 Lb', 220],
  ['Cerdo', 'Cerdo Agridulce / Sweet and Sour Pork 2 Lb', 380],
  ['Cerdo', 'Cerdo Encebollado', 230],
  ['Cerdo', 'Cerdo Salsa China', 230],
  ['Cerdo', 'Cerdo con Jalapeno', 230],
  ['Cerdo', 'Cerdo Empanizado', 230],
  ['Cerdo', 'Costilla de Cerdo Empanizado 1 Lb', 240],
  ['Cerdo', 'Costilla de Cerdo Empanizado 2 Lb', 420],
  ['Cerdo', 'Costilla de Cerdo Salsa China 1 Lb', 240],
  ['Cerdo', 'Costilla de Cerdo Salsa China 2 Lb', 420],

  ['Res', 'Filete Minon con Brocoli', 400],
  ['Res', 'Filete Minon con Hongos', 400],
  ['Res', 'Lomo de Res Salsa China', 270],
  ['Res', 'Lomo de Res Encebollado', 270],

  ['Marisco', 'Pescado Al Vapor Pequeno', 250],
  ['Marisco', 'Pescado Al Vapor Grande', 350],
  ['Marisco', 'Pescado Frito Pequeno', 250],
  ['Marisco', 'Pescado Frito Grande', 350],
  ['Marisco', 'Camarones Agridulce con Arroz Blanco o Espaguetis', 340],
  ['Marisco', 'Camarones al Ajillo', 340],
  ['Marisco', 'Camarones al Vapor', 340],
  ['Marisco', 'Camarones en Salsa China', 340],
  ['Marisco', 'Camarones Empanizada', 340],
  ['Marisco', 'Camarones con Salsa Jalapeno, Papas', 380],

  ['Vegetal', 'Vegetales con Hongos', 190],
  ['Vegetal', 'Brocoli al Ajillo', 190],
  ['Vegetal', 'Repollo Chino al Ajillo', 190],
  ['Vegetal', 'Ensalada Vegetariana Grande', 120],
  ['Vegetal', 'Ensalada Vegetariana Pequena', 80],

  ['Boca', 'Tostones con Queso', 170],
  ['Boca', 'Tostones con Carne', 200],
  ['Boca', 'Churros de Pollo', 200],
  ['Boca', 'Churros de Pescado', 220],
  ['Boca', 'Alitas Picantes', 220],
  ['Boca', 'Alitas Rostizada', 210],

  ['Cocteles y Ceviches', 'Ceviche de Camarones', 240],
  ['Cocteles y Ceviches', 'Ceviche de Pescado', 240],
  ['Cocteles y Ceviches', 'Coctel de Camarones', 240],
  ['Cocteles y Ceviches', 'Coctel de Pescado', 240],
];

function normalize(value) {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function makeId(category, name) {
  const slug = normalize(`${category} ${name}`)
    .replace(/\s+/g, '-')
    .slice(0, 120);
  return `menu_image_${slug}`;
}

function encodeValue(value) {
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'number') {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (typeof value === 'boolean') return { booleanValue: value };
  if (value === null || value === undefined) return { nullValue: null };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encodeValue) } };
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (typeof value === 'object') {
    return {
      mapValue: {
        fields: Object.fromEntries(Object.entries(value).map(([key, itemValue]) => [key, encodeValue(itemValue)])),
      },
    };
  }
  return { stringValue: String(value) };
}

function encodeDocument(data) {
  return {
    fields: Object.fromEntries(Object.entries(data).map(([key, value]) => [key, encodeValue(value)])),
  };
}

function decodeValue(value) {
  if (!value || typeof value !== 'object') return undefined;
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
  return Object.fromEntries(Object.entries(document.fields || {}).map(([key, value]) => [key, decodeValue(value)]));
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }
  if (!response.ok) {
    const message = typeof payload === 'object' && payload?.error?.message ? payload.error.message : text;
    throw new Error(`${response.status} ${response.statusText}: ${message}`);
  }
  return payload;
}

async function signIn() {
  const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${firebaseConfig.apiKey}`;
  return requestJson(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: `${username}@restaurant.local`,
      password,
      returnSecureToken: true,
    }),
  });
}

async function getDocument(path, token) {
  return requestJson(`${firestoreBaseUrl}/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

async function listDocuments(path, token) {
  const result = await requestJson(`${firestoreBaseUrl}/${path}?pageSize=1000`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return result.documents || [];
}

async function setDocument(path, data, token) {
  return requestJson(`${firestoreBaseUrl}/${path}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(encodeDocument(data)),
  });
}

async function main() {
  const authResult = await signIn();
  const userDoc = await getDocument(`users/${authResult.localId}`, authResult.idToken);
  const user = decodeDocument(userDoc);
  if (!user.storeId) {
    throw new Error(`User ${username} has no storeId; refusing to import menu globally`);
  }

  const existingDocs = await listDocuments(`stores/${user.storeId}/menu_items`, authResult.idToken);
  const existingKeys = new Set();
  existingDocs.forEach((document) => {
    const item = decodeDocument(document);
    existingKeys.add(`${normalize(item.category)}|${normalize(item.name)}`);
  });

  let added = 0;
  let skipped = 0;
  const nowIso = new Date().toISOString();

  for (const [category, name, price] of menuItems) {
    const key = `${normalize(category)}|${normalize(name)}`;
    if (existingKeys.has(key)) {
      skipped += 1;
      continue;
    }

    const id = makeId(category, name);
    const item = {
      id,
      name,
      price,
      category,
      type: 'recipe',
      available: true,
      ingredients: [],
      source: 'menu-image-import-2026-06-08',
      createdAt: nowIso,
      updatedAt: nowIso,
      lastModified: Date.now(),
      deviceId: 'codex-menu-import',
      version: 1,
    };

    await setDocument(`stores/${user.storeId}/menu_items/${id}`, item, authResult.idToken);
    existingKeys.add(key);
    added += 1;
  }

  const afterDocs = await listDocuments(`stores/${user.storeId}/menu_items`, authResult.idToken);
  const categories = new Set();
  afterDocs.forEach((document) => categories.add(decodeDocument(document).category));

  console.log(JSON.stringify({
    username,
    storeId: user.storeId,
    storeName: user.storeName || null,
    beforeCount: existingDocs.length,
    importCandidates: menuItems.length,
    added,
    skipped,
    afterCount: afterDocs.length,
    categories: Array.from(categories).sort(),
  }, null, 2));
}

main().catch((error) => {
  console.error(error.code || 'ERROR', error.message || error);
  process.exit(1);
});
