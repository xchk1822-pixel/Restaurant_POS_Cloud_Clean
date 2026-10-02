const DB_NAME = 'restaurant_menu_image_cache';
const DB_VERSION = 1;
const STORE_NAME = 'images';

export interface CachedMenuImage {
  menuId: string;
  storeId: string;
  originalBlob?: Blob;
  originalDataUrl?: string;
  originalType?: string;
  originalName?: string;
  thumbBlob?: Blob;
  mediumBlob?: Blob;
  thumbDataUrl?: string;
  mediumDataUrl?: string;
  imageUpdatedAt: number;
}

export const getActiveMenuImageStoreId = (): string | null => {
  try {
    const rawUser = localStorage.getItem('current_user');
    if (!rawUser) return null;
    const user = JSON.parse(rawUser);
    return user?.storeId ? String(user.storeId) : null;
  } catch {
    return null;
  }
};

export const buildMenuImageCacheKey = (storeId: string, menuId: string): string => {
  if (!storeId || !menuId) {
    throw new Error('Store ID and menu ID are required for image cache access');
  }
  return `${encodeURIComponent(storeId)}::${encodeURIComponent(menuId)}`;
};

const openDb = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'menuId' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

const runStore = async <T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    const request = action(tx.objectStore(STORE_NAME));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
};

export const saveMenuImageCache = async (
  storeId: string,
  menuId: string,
  image: { blob: Blob; dataUrl: string; type?: string; name?: string },
  imageUpdatedAt: number
): Promise<void> => {
  await runStore('readwrite', store => store.put({
    menuId: buildMenuImageCacheKey(storeId, menuId),
    storeId,
    originalBlob: image.blob,
    originalDataUrl: image.dataUrl,
    originalType: image.type,
    originalName: image.name,
    imageUpdatedAt
  }));
};

export const getMenuImageCache = async (storeId: string, menuId: string): Promise<CachedMenuImage | null> => {
  const cacheKey = buildMenuImageCacheKey(storeId, menuId);
  const result = await runStore<CachedMenuImage | undefined>('readonly', store => store.get(cacheKey));
  return result || null;
};

export const deleteMenuImageCache = async (storeId: string, menuId: string): Promise<void> => {
  await runStore('readwrite', store => store.delete(buildMenuImageCacheKey(storeId, menuId)));
};
