import React, { useEffect, useState } from 'react';
import { getMenuImageCache } from '../services/menuImageCache';

interface MenuImageProps {
  menuId: string;
  name: string;
  src?: string;
  legacySrc?: string;
  variant?: 'thumb' | 'medium';
  style?: React.CSSProperties;
  placeholder?: React.ReactNode;
}

const MenuImage: React.FC<MenuImageProps> = ({
  menuId,
  name,
  src,
  legacySrc,
  variant = 'thumb',
  style,
  placeholder
}) => {
  const [cachedSrc, setCachedSrc] = useState<string | undefined>();
  const displaySrc = src || cachedSrc || legacySrc;

  useEffect(() => {
    let cancelled = false;

    if (!menuId) return;

    getMenuImageCache(menuId)
      .then(cache => {
        if (cancelled || !cache) return;
        const dataUrl = variant === 'medium' ? cache.mediumDataUrl : cache.thumbDataUrl;
        if (dataUrl) setCachedSrc(dataUrl);
      })
      .catch(error => {
        console.warn('读取菜品图片缓存失败:', error);
      });

    return () => {
      cancelled = true;
    };
  }, [menuId, variant]);

  if (!displaySrc) {
    return <>{placeholder || null}</>;
  }

  return (
    <img
      src={displaySrc}
      alt={name}
      loading="lazy"
      decoding="async"
      style={style}
    />
  );
};

export default MenuImage;
