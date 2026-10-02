import React, { useEffect, useState } from 'react';
import { getActiveMenuImageStoreId, getMenuImageCache } from '../services/menuImageCache';

interface MenuImageProps {
  menuId: string;
  name: string;
  src?: string;
  legacySrc?: string;
  cacheVersion?: number;
  variant?: 'thumb' | 'medium';
  style?: React.CSSProperties;
  placeholder?: React.ReactNode;
}

const MenuImage: React.FC<MenuImageProps> = ({
  menuId,
  name,
  src,
  legacySrc,
  cacheVersion,
  variant = 'thumb',
  style,
  placeholder
}) => {
  const storeId = getActiveMenuImageStoreId();
  const [cachedSrc, setCachedSrc] = useState<string | undefined>();
  const [remoteFailed, setRemoteFailed] = useState(false);
  const displaySrc = remoteFailed ? (cachedSrc || legacySrc) : (src || cachedSrc || legacySrc);

  useEffect(() => {
    let cancelled = false;
    setRemoteFailed(false);
    setCachedSrc(undefined);

    if (!storeId || !menuId) return;

    getMenuImageCache(storeId, menuId)
      .then(cache => {
        if (cancelled || !cache) return;
        const dataUrl = cache.originalDataUrl || (variant === 'medium' ? cache.mediumDataUrl : cache.thumbDataUrl);
        if (dataUrl) setCachedSrc(dataUrl);
      })
      .catch(error => {
        console.warn('读取菜品图片缓存失败:', error);
      });

    return () => {
      cancelled = true;
    };
  }, [storeId, menuId, variant, cacheVersion]);

  if (!displaySrc) {
    return <>{placeholder || null}</>;
  }

  return (
    <img
      src={displaySrc}
      alt={name}
      loading="lazy"
      decoding="async"
      onError={() => setRemoteFailed(true)}
      style={style}
    />
  );
};

export default MenuImage;
