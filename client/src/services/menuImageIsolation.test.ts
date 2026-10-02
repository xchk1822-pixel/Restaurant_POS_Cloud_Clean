import fs from 'fs';
import path from 'path';
import { buildMenuImageCacheKey } from './menuImageCache';

describe('menu image store isolation', () => {
  test('uses storeId and menuId together as the local cache identity', () => {
    expect(buildMenuImageCacheKey('store-a', 'menu-1')).toBe('store-a::menu-1');
    expect(buildMenuImageCacheKey('store-a', 'menu-1'))
      .not.toBe(buildMenuImageCacheKey('store-b', 'menu-1'));
    expect(buildMenuImageCacheKey('store::a', 'menu-1'))
      .not.toBe(buildMenuImageCacheKey('store', 'a::menu-1'));
  });

  test('rejects incomplete cache identities', () => {
    expect(() => buildMenuImageCacheKey('', 'menu-1')).toThrow();
    expect(() => buildMenuImageCacheKey('store-a', '')).toThrow();
  });

  test('does not fall back to a default store and authorizes assigned multi-store managers', () => {
    const imageService = fs.readFileSync(path.join(process.cwd(), 'src/services/menuImageService.ts'), 'utf8');
    const storageRules = fs.readFileSync(path.join(process.cwd(), '../storage.rules'), 'utf8');

    expect(imageService).not.toContain("return 'default'");
    expect(imageService).toContain('throw new Error(\'Missing storeId; refusing menu image access\')');
    expect(storageRules).toContain("getUserRole() == 'multi_store_manager' && storeId in getUserStoreIds()");
  });
});
