import { CompressedImage } from '../utils/imageCompression';

const DB_NAME = 'restaurant_menu_image_cache';
const DB_VERSION = 1;
const STORE_NAME = 'images';

export interface CachedMenuImage {
  menuId: string;
  thumbBlob?: Blob;
  mediumBlob?: Blob;
  thumbDataUrl?: string;
  mediumDataUrl?: string;
  imageUpdatedAt: number;
}

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
  menuId: string,
  images: { thumb: CompressedImage; medium: CompressedImage },
  imageUpdatedAt: number
): Promise<void> => {
  await runStore('readwrite', store => store.put({
    menuId,
    thumbBlob: images.thumb.blob,
    mediumBlob: images.medium.blob,
    thumbDataUrl: images.thumb.dataUrl,
    mediumDataUrl: images.medium.dataUrl,
    imageUpdatedAt
  }));
};

export const getMenuImageCache = async (menuId: string): Promise<CachedMenuImage | null> => {
  const result = await runStore<CachedMenuImage | undefined>('readonly', store => store.get(menuId));
  return result || null;
};

export const deleteMenuImageCache = async (menuId: string): Promise<void> => {
  await runStore('readwrite', store => store.delete(menuId));
};
