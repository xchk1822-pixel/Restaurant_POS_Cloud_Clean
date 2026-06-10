import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { storage } from '../firebase';
import { compressMenuImage, MenuImageSet } from '../utils/imageCompression';
import { getMenuImageCache, saveMenuImageCache } from './menuImageCache';

export interface MenuImageUploadResult {
  imageUrl?: string;
  imageThumbUrl?: string;
  imageStoragePath?: string;
  imageThumbStoragePath?: string;
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

const uploadImageSet = async (
  storeId: string,
  menuId: string,
  images: MenuImageSet,
  imageUpdatedAt: number
) => {
  const basePath = `stores/${storeId}/menu-images/${menuId}`;
  const thumbPath = `${basePath}/thumb-${imageUpdatedAt}.webp`;
  const mediumPath = `${basePath}/medium-${imageUpdatedAt}.webp`;

  const [thumbSnapshot, mediumSnapshot] = await Promise.all([
    uploadBytes(ref(storage, thumbPath), images.thumb.blob, {
      contentType: 'image/webp',
      cacheControl: 'public,max-age=31536000,immutable'
    }),
    uploadBytes(ref(storage, mediumPath), images.medium.blob, {
      contentType: 'image/webp',
      cacheControl: 'public,max-age=31536000,immutable'
    })
  ]);

  const [imageThumbUrl, imageUrl] = await Promise.all([
    getDownloadURL(thumbSnapshot.ref),
    getDownloadURL(mediumSnapshot.ref)
  ]);

  return {
    imageUrl,
    imageThumbUrl,
    imageStoragePath: mediumPath,
    imageThumbStoragePath: thumbPath
  };
};

const withUploadTimeout = async <T,>(promise: Promise<T>, timeoutMs = 8000): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      window.setTimeout(() => reject(new Error('图片云端上传超时，已先保存到本机缓存')), timeoutMs);
    })
  ]);
};

export const uploadCachedMenuImage = async (
  menuId: string,
  imageUpdatedAt?: number
): Promise<Omit<MenuImageUploadResult, 'thumbSize' | 'mediumSize'>> => {
  const cache = await getMenuImageCache(menuId);
  if (!cache?.thumbBlob || !cache?.mediumBlob) {
    throw new Error('没有找到本地缓存图片');
  }

  const uploadTime = imageUpdatedAt || cache.imageUpdatedAt || Date.now();
  const uploaded = await withUploadTimeout(uploadImageSet(getCurrentStoreId(), menuId, {
    thumb: {
      blob: cache.thumbBlob,
      dataUrl: cache.thumbDataUrl || '',
      width: 0,
      height: 0,
      size: cache.thumbBlob.size
    },
    medium: {
      blob: cache.mediumBlob,
      dataUrl: cache.mediumDataUrl || '',
      width: 0,
      height: 0,
      size: cache.mediumBlob.size
    }
  }, uploadTime));

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
  const imageUpdatedAt = Date.now();
  const images = await compressMenuImage(file);
  await saveMenuImageCache(menuId, images, imageUpdatedAt);

  if (!navigator.onLine) {
    return {
      imageUpdatedAt,
      imageUploadPending: true,
      thumbSize: images.thumb.size,
      mediumSize: images.medium.size
    };
  }

  try {
    const uploaded = await withUploadTimeout(uploadImageSet(getCurrentStoreId(), menuId, images, imageUpdatedAt));

    return {
      ...uploaded,
      imageUpdatedAt,
      imageUploadPending: false,
      thumbSize: images.thumb.size,
      mediumSize: images.medium.size
    };
  } catch (error) {
    console.error('菜单图片上传失败，已保留本地缓存:', error);
    return {
      imageUpdatedAt,
      imageUploadPending: true,
      thumbSize: images.thumb.size,
      mediumSize: images.medium.size
    };
  }
};
