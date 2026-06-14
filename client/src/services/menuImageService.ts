import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { storage } from '../firebase';
import { getMenuImageCache, saveMenuImageCache } from './menuImageCache';

export interface MenuImageUploadResult {
  imageUrl?: string;
  imageStoragePath?: string;
  imageUpdatedAt: number;
  imageUploadPending?: boolean;
  thumbSize: number;
  mediumSize: number;
}

const getCurrentStoreId = (): string => {
  try {
    const rawUser = localStorage.getItem('current_user');
    if (rawUser) {
      const user = JSON.parse(rawUser);
      if (user?.storeId) return String(user.storeId);
    }
  } catch {
    // Use fallback below.
  }
  return 'default';
};

const getSafeImageExtension = (fileName?: string, type?: string): string => {
  const extension = fileName?.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (extension) return extension;
  if (type === 'image/png') return 'png';
  if (type === 'image/webp') return 'webp';
  if (type === 'image/gif') return 'gif';
  return 'jpg';
};

const fileToDataUrl = (file: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('图片缓存失败'));
    reader.readAsDataURL(file);
  });
};

const uploadOriginalMenuImage = async (
  storeId: string,
  menuId: string,
  file: Blob,
  fileName: string | undefined,
  contentType: string | undefined,
  imageUpdatedAt: number
) => {
  const basePath = `stores/${storeId}/menu-images/${menuId}`;
  const imagePath = `${basePath}/original-${imageUpdatedAt}.${getSafeImageExtension(fileName, contentType)}`;
  const snapshot = await uploadBytes(ref(storage, imagePath), file, {
    contentType: contentType || 'image/jpeg',
    cacheControl: 'public,max-age=31536000,immutable'
  });
  const imageUrl = await getDownloadURL(snapshot.ref);

  return {
    imageUrl,
    imageStoragePath: imagePath
  };
};

const withUploadTimeout = async <T,>(promise: Promise<T>, timeoutMs = 30000): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      window.setTimeout(() => reject(new Error('图片云端上传超时，请检查网络后重试')), timeoutMs);
    })
  ]);
};

export const uploadCachedMenuImage = async (
  menuId: string,
  imageUpdatedAt?: number
): Promise<Omit<MenuImageUploadResult, 'thumbSize' | 'mediumSize'>> => {
  const cache = await getMenuImageCache(menuId);
  const cachedBlob = cache?.originalBlob || cache?.mediumBlob || cache?.thumbBlob;
  if (!cachedBlob) {
    throw new Error('没有找到本地缓存图片');
  }

  const uploadTime = imageUpdatedAt || cache.imageUpdatedAt || Date.now();
  const uploaded = await withUploadTimeout(uploadOriginalMenuImage(
    getCurrentStoreId(),
    menuId,
    cachedBlob,
    cache.originalName,
    cache.originalType || cachedBlob.type,
    uploadTime
  ));

  return {
    ...uploaded,
    imageUpdatedAt: uploadTime,
    imageUploadPending: false
  };
};

export const processAndUploadMenuImage = async (
  menuId: string,
  file: File
): Promise<MenuImageUploadResult> => {
  if (!file.type.startsWith('image/')) {
    throw new Error('请选择图片文件');
  }

  const imageUpdatedAt = Date.now();
  await saveMenuImageCache(menuId, {
    blob: file,
    dataUrl: await fileToDataUrl(file),
    type: file.type,
    name: file.name
  }, imageUpdatedAt);

  if (!navigator.onLine) {
    return {
      imageUpdatedAt,
      imageUploadPending: true,
      thumbSize: file.size,
      mediumSize: file.size
    };
  }

  try {
    const uploaded = await withUploadTimeout(uploadOriginalMenuImage(
      getCurrentStoreId(),
      menuId,
      file,
      file.name,
      file.type,
      imageUpdatedAt
    ));

    return {
      ...uploaded,
      imageUpdatedAt,
      imageUploadPending: false,
      thumbSize: file.size,
      mediumSize: file.size
    };
  } catch (error) {
    console.error('菜单图片上传失败:', error);
    throw new Error('图片没有上传到云端，其他终端不会显示。请检查网络后重新保存。');
  }
};
