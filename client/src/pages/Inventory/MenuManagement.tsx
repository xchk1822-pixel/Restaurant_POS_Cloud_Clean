import React, { useState, useEffect } from 'react';
import { useAppContext } from '../../contexts/AppContext';
import { smartDeleteDocument, smartGetDocuments, smartSetDocument, smartUpdateDocument } from '../../services/smartSyncService';
import { getRecordVersion, mergeRecordsByVersion } from '../../utils/syncMerge';
import MenuImage from '../../components/MenuImage';
import { processAndUploadMenuImage } from '../../services/menuImageService';
import { dataService } from '../../services/DataService';
import { colors, font, radii, shadows } from '../../styles/uiTokens';
import { useI18n } from '../../i18n/I18nContext';

interface RecipeIngredient {
  itemId: string;
  itemName: string;
  quantity: number;
  unit: string;
}

interface InventoryCategoryOption {
  key: string;
  name: string;
  icon: string;
  sortOrder: number;
}

interface MenuItem {
  id: string;
  name: string;
  nameEs?: string;
  price: number;
  category: string;
  type?: 'recipe' | 'direct';
  stockItemId?: string;
  ingredients?: RecipeIngredient[];
  available?: boolean;
  image?: string;
  imageUrl?: string;
  imageThumbUrl?: string;
  imageStoragePath?: string;
  imageThumbStoragePath?: string;
  imageUpdatedAt?: number;
  imageUploadPending?: boolean;
  lastModified?: number;
}

const pageStyle: React.CSSProperties = {
  padding: '1.1rem',
  height: '100vh',
  maxHeight: '100vh',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.85rem',
  overflow: 'hidden',
  boxSizing: 'border-box',
  background: colors.page,
  color: colors.textPrimary,
  fontFamily: font.family,
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: '1rem',
  flexWrap: 'wrap',
};

const primaryButtonStyle: React.CSSProperties = {
  padding: '0.58rem 0.95rem',
  backgroundColor: colors.teal,
  color: colors.surface,
  border: 'none',
  borderRadius: radii.md,
  cursor: 'pointer',
  fontWeight: 700,
  fontSize: font.body,
  boxShadow: '0 8px 18px rgba(15, 118, 110, 0.18)',
};

const secondaryButtonStyle: React.CSSProperties = {
  ...primaryButtonStyle,
  backgroundColor: colors.surface,
  color: colors.textPrimary,
  border: `1px solid ${colors.borderStrong}`,
  boxShadow: 'none',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.62rem 0.75rem',
  border: `1px solid ${colors.borderStrong}`,
  borderRadius: radii.md,
  fontSize: font.body,
  backgroundColor: colors.surface,
  color: colors.textPrimary,
  boxSizing: 'border-box',
  outline: 'none',
};

const isValidIngredientQuantityInput = (value: string): boolean => {
  return /^\d*\.?\d*$/.test(value);
};

const MenuManagement: React.FC = () => {
  const { t, language } = useI18n();
  const { 
    menuItems, 
    setMenuItems,
    categories,
    setCategories,
    inventoryItems
  } = useAppContext();
  
  const [showMenuModal, setShowMenuModal] = useState(false);
  const [editingMenu, setEditingMenu] = useState<Partial<MenuItem> & { image?: string }>({
    name: '',
    price: 0,
    category: categories[0] || '主食',
    available: true,
    ingredients: []
  });
  
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<{ id?: string; name: string }>({ name: '' });
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null);
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const [menuSearchTerm, setMenuSearchTerm] = useState('');
  const [selectedMenuCategory, setSelectedMenuCategory] = useState('all');
  const [ingredientQuantityDrafts, setIngredientQuantityDrafts] = useState<Record<number, string>>({});
  const [ingredientCategoryFilters, setIngredientCategoryFilters] = useState<Record<number, string>>({});
  const [inventoryCategoryDefinitions, setInventoryCategoryDefinitions] = useState<InventoryCategoryOption[]>([]);
  const menuCategoryStorageKey = dataService.getStoreKey('menu_categories');
  
  // 从 localStorage 加载分类配置
  useEffect(() => {
    try {
      const saved = localStorage.getItem(menuCategoryStorageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // 如果 AppContext 中的 categories 为空，使用保存的分类
          if (categories.length === 0) {
            setCategories(parsed);
          }
        }
      }
    } catch (error) {
      console.error('加载分类配置失败:', error);
    }
  }, [categories.length, menuCategoryStorageKey, setCategories]);

  useEffect(() => {
    let active = true;
    smartGetDocuments('inventory_categories').then(records => {
      if (!active) return;
      const definitions = records
        .map((category, index) => ({
          key: String(category.key || category.id || ''),
          name: String(category.name || category.key || category.id || ''),
          icon: String(category.icon || '📦'),
          sortOrder: Number(category.sortOrder ?? index),
        }))
        .filter(category => category.key)
        .sort((a, b) => a.sortOrder - b.sortOrder);
      setInventoryCategoryDefinitions(definitions);
    }).catch(error => console.error('读取库存物品分类失败:', error));
    return () => {
      active = false;
    };
  }, []);

  const refreshMenuData = async () => {
    setIsRefreshing(true);
    try {
      const [cloudMenus, cloudCategoryDocs] = await Promise.all([
        smartGetDocuments('menu_items'),
        smartGetDocuments('menu_categories')
      ]);
      setMenuItems(prev => mergeRecordsByVersion(prev, cloudMenus));
      const latestCategoryDoc = cloudCategoryDocs
        .filter(doc => Array.isArray(doc.names))
        .sort((a, b) => getRecordVersion(b) - getRecordVersion(a))[0];
      if (latestCategoryDoc) {
        const menuCategories = cloudMenus.map(item => item.category).filter(Boolean);
        const mergedCategories = Array.from(new Set([...latestCategoryDoc.names, ...menuCategories]));
        setCategories(mergedCategories);
        localStorage.setItem(menuCategoryStorageKey, JSON.stringify(mergedCategories));
      }
      setLastSyncedAt(new Date());
    } catch (error) {
      console.error('刷新菜品数据失败:', error);
      alert(t('menu.alert.refreshFailed'));
    } finally {
      setIsRefreshing(false);
    }
  };

  const saveMenuCategories = async (nextCategories: string[]) => {
    setCategories(nextCategories);
    localStorage.setItem(menuCategoryStorageKey, JSON.stringify(nextCategories));
    await smartSetDocument('menu_categories', 'categories', {
      id: 'categories',
      names: nextCategories,
      lastModified: Date.now()
    });
  };

  const normalizedMenuSearchTerm = menuSearchTerm.trim().toLowerCase();
  const menuCategoryOptions = Array.from(new Set([
    ...categories,
    ...menuItems.map(menu => menu.category).filter(Boolean),
  ]));
  const filteredMenuItems = menuItems.filter(menu => {
    const matchesCategory = selectedMenuCategory === 'all' || menu.category === selectedMenuCategory;
    if (!matchesCategory) return false;
    if (!normalizedMenuSearchTerm) return true;

    return [
      menu.name,
      menu.nameEs,
      menu.category,
      String(menu.price),
      `C$ ${menu.price.toFixed(2)}`,
    ]
      .filter(Boolean)
      .some(value => String(value).toLowerCase().includes(normalizedMenuSearchTerm));
  });

  const directStockItemIds = new Set(
    menuItems
      .filter(menu => (menu.type === 'direct' || (!menu.type && menu.stockItemId)) && menu.stockItemId)
      .map(menu => menu.stockItemId)
  );
  const recipeIngredientItemIds = new Set(
    menuItems
      .filter(menu => menu.type === 'recipe' || (menu.ingredients || []).length > 0)
      .flatMap(menu => (menu.ingredients || []).map(ingredient => ingredient.itemId).filter(Boolean))
  );
  const currentRecipeIngredientIds = new Set(
    (editingMenu?.ingredients || []).map(ingredient => ingredient.itemId).filter(Boolean)
  );
  const directDeductionInventoryItems = inventoryItems.filter(
    item => !recipeIngredientItemIds.has(item.id) || item.id === editingMenu?.stockItemId
  );
  const recipeIngredientInventoryItems = inventoryItems.filter(
    item => !directStockItemIds.has(item.id) || currentRecipeIngredientIds.has(item.id)
  );
  const ingredientCategoryOptions = Array.from(new Set(
    recipeIngredientInventoryItems.map(item => item.category).filter(Boolean)
  ))
    .map(key => {
      const definition = inventoryCategoryDefinitions.find(category => category.key === key);
      return {
        key,
        label: definition ? `${definition.icon} ${definition.name}` : key,
        sortOrder: definition?.sortOrder ?? Number.MAX_SAFE_INTEGER,
      };
    })
    .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label, 'es'));

  return (
    <div style={pageStyle}>
      {/* 标题栏 */}
      <div style={headerStyle}>
        <div>
          <h2 style={{ margin: 0, fontSize: font.title, fontWeight: 750, letterSpacing: 0 }}>🍽️ {t('menu.title')}</h2>
          <div style={{ marginTop: '0.35rem', fontSize: font.body, color: colors.textSecondary }}>
            {t('menu.count.total')} <span style={{ fontWeight: 750, color: colors.blue }}>{menuItems.length}</span> ·
            {t('menu.count.available')} <span style={{ fontWeight: 750, color: colors.success }}>{menuItems.filter(m => m.available).length}</span> ·
            {t('menu.count.unavailable')} <span style={{ fontWeight: 750, color: colors.danger }}>{menuItems.filter(m => !m.available).length}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.55rem', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {lastSyncedAt && (
            <span style={{ fontSize: font.caption, color: colors.textSecondary, whiteSpace: 'nowrap' }}>
              {t('menu.lastSync')} {lastSyncedAt.toLocaleTimeString(language === 'es-NI' ? 'es-NI' : 'zh-CN', { hour12: false })}
            </span>
          )}
          <button
            onClick={refreshMenuData}
            disabled={isRefreshing}
            style={{
              ...secondaryButtonStyle,
              backgroundColor: isRefreshing ? colors.surfaceMuted : colors.surface,
              color: isRefreshing ? colors.textMuted : colors.textPrimary,
              cursor: isRefreshing ? 'not-allowed' : 'pointer',
            }}
          >
            {isRefreshing ? t('menu.syncing') : t('menu.refresh')}
          </button>
          <button
            onClick={() => setShowCategoryModal(true)}
            style={{
              ...secondaryButtonStyle,
              color: colors.teal,
              borderColor: colors.tealSoft,
            }}
          >
            🏷️ {t('menu.category.manage')}
          </button>
          <button
            onClick={() => {
              setSelectedImageFile(null);
              setIsProcessingImage(false);
              setIngredientQuantityDrafts({});
              setIngredientCategoryFilters({});
              setEditingMenu({
                name: '',
                price: 0,
                category: categories[0] || '主食',
                type: 'direct', // 默认直接扣减
                stockItemId: undefined,
                available: true,
                ingredients: [],
                image: undefined
              });
              setShowMenuModal(true);
            }}
            style={primaryButtonStyle}
          >
            ➕ {t('menu.add')}
          </button>
        </div>
      </div>

      {/* 菜品卡片列表 */}
      <div style={{ flex: 1, backgroundColor: colors.surface, borderRadius: radii.lg, boxShadow: shadows.soft, border: `1px solid ${colors.border}`, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{
          padding: '0.85rem 1rem',
          borderBottom: `1px solid ${colors.border}`,
          display: 'grid',
          gridTemplateColumns: 'minmax(240px, 1fr) minmax(180px, 240px) auto',
          gap: '0.75rem',
          alignItems: 'center',
          backgroundColor: colors.surfaceMuted
        }}>
          <input
            type="text"
            value={menuSearchTerm}
            onChange={(e) => setMenuSearchTerm(e.target.value)}
            placeholder={t('menu.search')}
            style={inputStyle}
          />
          <select
            value={selectedMenuCategory}
            onChange={(e) => setSelectedMenuCategory(e.target.value)}
            style={inputStyle}
          >
            <option value="all">{t('menu.filter.allCategories')}</option>
            {menuCategoryOptions.map(categoryName => (
              <option key={categoryName} value={categoryName}>
                {categoryName} ({menuItems.filter(menu => menu.category === categoryName).length})
              </option>
            ))}
          </select>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontSize: font.caption, color: colors.textSecondary, whiteSpace: 'nowrap' }}>
              {t('menu.showing')} {filteredMenuItems.length} / {menuItems.length}
            </span>
            {(menuSearchTerm || selectedMenuCategory !== 'all') && (
              <button
                onClick={() => {
                  setMenuSearchTerm('');
                  setSelectedMenuCategory('all');
                }}
                style={{ ...secondaryButtonStyle, padding: '0.5rem 0.75rem', fontSize: font.caption, whiteSpace: 'nowrap' }}
              >
                {t('menu.clear')}
              </button>
            )}
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '1rem' }}>
          {menuItems.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: '#9ca3af' }}>
              <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🍽️</div>
              <p>{t('menu.empty')}</p>
            </div>
          ) : filteredMenuItems.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: '#9ca3af' }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔎</div>
              <p>{t('menu.noMatch')}</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '0.85rem' }}>
              {filteredMenuItems.map(menu => (
                <div key={menu.id} style={{
                  padding: '0.9rem',
                  border: `1px solid ${menu.available ? colors.border : '#fecaca'}`,
                  borderRadius: radii.lg,
                  backgroundColor: menu.available ? colors.surface : colors.dangerSoft,
                  boxShadow: '0 6px 18px rgba(15, 23, 42, 0.05)'
                }}>
                  <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.75rem' }}>
                    {/* 菜品图片 */}
                    <div style={{
                      width: '80px',
                      height: '80px',
                      borderRadius: radii.md,
                      backgroundColor: colors.surfaceMuted,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '2rem',
                      flexShrink: 0,
                      overflow: 'hidden'
                    }}>
                      <MenuImage
                        menuId={menu.id}
                        name={menu.name}
                        src={menu.imageThumbUrl || menu.imageUrl}
                        legacySrc={menu.image}
                        cacheVersion={menu.imageUpdatedAt}
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover'
                        }}
                        placeholder={'🍽️'}
                      />                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                        <div>
                          <div style={{ fontWeight: 750, fontSize: '1rem', color: colors.textPrimary }}>{menu.name}</div>
                          <div style={{ fontSize: font.caption, color: colors.textSecondary, marginTop: '0.25rem' }}>
                            {menu.category} · C$ {menu.price.toFixed(2)}
                          </div>
                        </div>
                        <span style={{
                          padding: '0.25rem 0.5rem',
                          backgroundColor: menu.available ? colors.successSoft : colors.dangerSoft,
                          color: menu.available ? colors.success : colors.danger,
                          borderRadius: radii.pill,
                          fontSize: font.caption,
                          fontWeight: 700
                        }}>
                          {menu.available ? `✓ ${t('menu.status.available')}` : `✗ ${t('menu.status.unavailable')}`}
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  <div style={{ marginBottom: '0.75rem', paddingLeft: '90px' }}>
                    <div style={{ fontSize: font.caption, fontWeight: 700, marginBottom: '0.5rem', color: colors.textPrimary }}>
                      {t('menu.recipe.ingredients')}:
                    </div>
                    {menu.ingredients?.map((ing, idx) => (
                      <div key={idx} style={{ 
                        padding: '0.35rem 0', 
                        borderBottom: idx < (menu.ingredients?.length || 0) - 1 ? `1px solid ${colors.border}` : 'none',
                        fontSize: font.caption,
                        color: colors.textSecondary
                      }}>
                        {ing.itemName} - {ing.quantity}{ing.unit}
                      </div>
                    ))}
                  </div>

                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      onClick={() => {
                        setSelectedImageFile(null);
                        setIsProcessingImage(false);
                        setIngredientQuantityDrafts({});
                        setIngredientCategoryFilters(Object.fromEntries(
                          (menu.ingredients || []).map((ingredient, index) => [
                            index,
                            inventoryItems.find(item => item.id === ingredient.itemId)?.category || ''
                          ])
                        ));
                        setEditingMenu({ ...menu });
                        setShowMenuModal(true);
                      }}
                      style={{
                        flex: 1,
                        padding: '0.5rem',
                        backgroundColor: '#3b82f6',
                        color: 'white',
                        border: 'none',
                        borderRadius: '0.25rem',
                        fontWeight: '600',
                        cursor: 'pointer',
                        fontSize: '0.8rem'
                      }}
                    >
                      ✏️ {t('menu.edit')}
                    </button>
                    <button
                      onClick={async () => {
                        const updatedMenu = {
                          ...menu,
                          available: !menu.available,
                          lastModified: Date.now()
                        };
                        setMenuItems(menuItems.map(m => 
                          m.id === menu.id ? updatedMenu : m
                        ));
                        await smartUpdateDocument('menu_items', menu.id, updatedMenu);
                      }}
                      style={{
                        flex: 1,
                        padding: '0.5rem',
                        backgroundColor: menu.available ? '#f59e0b' : '#10b981',
                        color: 'white',
                        border: 'none',
                        borderRadius: '0.25rem',
                        fontWeight: '600',
                        cursor: 'pointer',
                        fontSize: '0.8rem'
                      }}
                    >
                      {menu.available ? `⏸️ ${t('menu.pause')}` : `▶️ ${t('menu.activate')}`}
                    </button>
                    <button
                      onClick={async () => {
                        if (window.confirm(`${t('menu.confirm.deleteItem')} ${menu.name}?`)) {
                          setMenuItems(menuItems.filter(m => m.id !== menu.id));
                          await smartDeleteDocument('menu_items', menu.id);
                        }
                      }}
                      style={{
                        padding: '0.5rem 0.75rem',
                        backgroundColor: '#ef4444',
                        color: 'white',
                        border: 'none',
                        borderRadius: '0.25rem',
                        fontWeight: '600',
                        cursor: 'pointer',
                        fontSize: '0.8rem'
                      }}
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 添加/编辑菜品弹窗 */}
      {showMenuModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '0.5rem',
            padding: '1.5rem',
            width: '700px',
            maxHeight: '85vh',
            overflow: 'auto'
          }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '1rem' }}>
              {editingMenu.id ? t('menu.modal.edit') : t('menu.modal.add')}
            </h3>
            
            <div style={{ display: 'grid', gap: '1rem' }}>
              {/* 菜品图片上传 */}
              <div>
                <label style={{ display: 'block', marginBottom: '0.35rem', fontWeight: '600', fontSize: '0.9rem' }}>
                  {t('menu.image.label')}
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setSelectedImageFile(file);
                    }
                  }}
                  style={{ display: 'none' }}
                  id="menu-image-upload"
                />
                <label
                  htmlFor="menu-image-upload"
                  style={{
                    width: '120px',
                    height: '120px',
                    border: '2px dashed #d1d5db',
                    borderRadius: '0.5rem',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    backgroundColor: '#f9fafb',
                    overflow: 'hidden',
                    position: 'relative'
                  }}
                >
                  {selectedImageFile ? (
                    <>
                      <div style={{ fontSize: '2rem' }}>🖼️</div>
                      <div style={{ fontSize: '0.75rem', color: '#2563eb', marginTop: '0.4rem', textAlign: 'center' }}>
                        {t('menu.image.uploadOriginalOnSave')}
                      </div>
                    </>
                  ) : (editingMenu.imageThumbUrl || editingMenu.imageUrl || editingMenu.image || editingMenu.imageUpdatedAt || editingMenu.imageUploadPending) ? (
                    <MenuImage
                      menuId={editingMenu.id || 'new-menu'}
                      name={editingMenu.name || t('menu.itemFallback')}
                      src={editingMenu.imageThumbUrl || editingMenu.imageUrl}
                      legacySrc={editingMenu.image}
                      cacheVersion={editingMenu.imageUpdatedAt}
                      variant="medium"
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover'
                      }}
                    />
                  ) : (
                    <>
                      <div style={{ fontSize: '2.5rem' }}>📷</div>
                      <div style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: '0.5rem' }}>{t('menu.image.clickToUpload')}</div>
                    </>
                  )}
                </label>
              </div>

              {/* 菜品名称 */}
              <div>
                <label style={{ display: 'block', marginBottom: '0.35rem', fontWeight: '600', fontSize: '0.9rem' }}>
                  {t('menu.field.name')} <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="text"
                  value={editingMenu.name || ''}
                  onChange={(e) => setEditingMenu({...editingMenu, name: e.target.value})}
                  placeholder={t('menu.field.namePlaceholder')}
                  style={{
                    width: '100%',
                    padding: '0.6rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.375rem',
                    fontSize: '0.9rem'
                  }}
                />
              </div>

              {/* 分类和价格 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.35rem', fontWeight: '600', fontSize: '0.9rem' }}>
                    {t('menu.field.category')} <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <select
                    value={editingMenu.category}
                    onChange={(e) => setEditingMenu({...editingMenu, category: e.target.value})}
                    style={{
                      width: '100%',
                      padding: '0.6rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '0.375rem',
                      fontSize: '0.9rem'
                    }}
                  >
                    {categories.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.35rem', fontWeight: '600', fontSize: '0.9rem' }}>
                    {t('menu.field.price')} (C$) <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={editingMenu.price || ''}
                    onChange={(e) => setEditingMenu({...editingMenu, price: e.target.value ? parseFloat(e.target.value) : 0})}
                    placeholder="0.00"
                    style={{
                      width: '100%',
                      padding: '0.6rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '0.375rem',
                      fontSize: '0.9rem'
                    }}
                  />
                </div>
              </div>

              {/* 扣减方式 */}
              <div>
                <label style={{ display: 'block', marginBottom: '0.35rem', fontWeight: '600', fontSize: '0.9rem' }}>
                  {t('menu.deduction.label')} <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', padding: '0.5rem', border: editingMenu.type === 'recipe' ? '2px solid #3b82f6' : '1px solid #d1d5db', borderRadius: '0.375rem', flex: 1 }}>
                    <input
                      type="radio"
                      checked={editingMenu.type === 'recipe'}
                      onChange={() => setEditingMenu({...editingMenu, type: 'recipe', stockItemId: undefined})}
                      style={{ marginRight: '0.5rem' }}
                    />
                    <div>
                      <div style={{ fontWeight: '600', fontSize: '0.9rem' }}>📝 {t('menu.deduction.recipe')}</div>
                      <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>{t('menu.deduction.recipeHint')}</div>
                    </div>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', padding: '0.5rem', border: editingMenu.type === 'direct' ? '2px solid #3b82f6' : '1px solid #d1d5db', borderRadius: '0.375rem', flex: 1 }}>
                    <input
                      type="radio"
                      checked={editingMenu.type === 'direct'}
                      onChange={() => {
                        setIngredientQuantityDrafts({});
                        setIngredientCategoryFilters({});
                        setEditingMenu({...editingMenu, type: 'direct', ingredients: []});
                      }}
                      style={{ marginRight: '0.5rem' }}
                    />
                    <div>
                      <div style={{ fontWeight: '600', fontSize: '0.9rem' }}>📦 {t('menu.deduction.direct')}</div>
                      <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>{t('menu.deduction.directHint')}</div>
                    </div>
                  </label>
                </div>
              </div>

              {/* 直接扣减时选择库存物品 */}
              {editingMenu.type === 'direct' && (
                <div>
                  <label style={{ display: 'block', marginBottom: '0.35rem', fontWeight: '600', fontSize: '0.9rem' }}>
                    {t('menu.direct.stockItem')} <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <select
                    value={editingMenu.stockItemId || ''}
                    onChange={(e) => setEditingMenu({...editingMenu, stockItemId: e.target.value})}
                    style={{
                      width: '100%',
                      padding: '0.6rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '0.375rem',
                      fontSize: '0.9rem'
                    }}
                  >
                    <option value="">{t('menu.direct.selectStockItem')}</option>
                    {directDeductionInventoryItems.map(item => (
                      <option key={item.id} value={item.id}>{item.name} ({t('menu.currentStock')}: {item.currentStock} {item.unit})</option>
                    ))}
                  </select>
                </div>
              )}

              {/* 配方原料 */}
              <div>
                <label style={{ display: 'block', marginBottom: '0.35rem', fontWeight: '600', fontSize: '0.9rem' }}>
                  {t('menu.recipe.ingredients')}
                </label>
                <div style={{ display: 'grid', gap: '0.5rem' }}>
                  {(editingMenu.ingredients || []).map((ing, idx) => {
                    const selectedIngredientCategory = ingredientCategoryFilters[idx]
                      ?? inventoryItems.find(item => item.id === ing.itemId)?.category
                      ?? '';
                    const categoryFilteredIngredientItems = recipeIngredientInventoryItems.filter(item =>
                      !selectedIngredientCategory
                      || item.category === selectedIngredientCategory
                      || item.id === ing.itemId
                    );

                    return (
                    <div key={idx} style={{
                      display: 'grid',
                      gridTemplateColumns: 'minmax(145px, 0.95fr) minmax(200px, 1.7fr) minmax(80px, 0.65fr) minmax(75px, 0.65fr) auto',
                      gap: '0.5rem',
                      alignItems: 'center'
                    }}>
                      <select
                        aria-label={`${t('menu.ingredient')} ${idx + 1} ${t('menu.inventoryCategory')}`}
                        value={selectedIngredientCategory}
                        onChange={(e) => {
                          const nextCategory = e.target.value;
                          setIngredientCategoryFilters(prev => ({ ...prev, [idx]: nextCategory }));
                          const selectedItem = inventoryItems.find(item => item.id === ing.itemId);
                          if (nextCategory && selectedItem && selectedItem.category !== nextCategory) {
                            const newIngredients = [...(editingMenu.ingredients || [])];
                            newIngredients[idx] = { ...ing, itemId: '', itemName: '' };
                            setEditingMenu({...editingMenu, ingredients: newIngredients});
                          }
                        }}
                        style={{
                          width: '100%',
                          padding: '0.5rem',
                          border: '1px solid #d1d5db',
                          borderRadius: '0.25rem',
                          fontSize: '0.85rem'
                        }}
                      >
                        <option value="">{t('menu.allInventoryCategories')}</option>
                        {ingredientCategoryOptions.map(category => (
                          <option key={category.key} value={category.key}>{category.label}</option>
                        ))}
                      </select>
                      <select
                        aria-label={`${t('menu.ingredient')} ${idx + 1} ${t('menu.inventoryItem')}`}
                        value={ing.itemId}
                        onChange={(e) => {
                          const selectedItem = inventoryItems.find(item => item.id === e.target.value);
                          if (selectedItem?.category) {
                            setIngredientCategoryFilters(prev => ({ ...prev, [idx]: selectedItem.category }));
                          }
                          const newIngredients = [...(editingMenu.ingredients || [])];
                          newIngredients[idx] = {
                            ...ing,
                            itemId: e.target.value,
                            itemName: selectedItem?.name || ''
                          };
                          setEditingMenu({...editingMenu, ingredients: newIngredients});
                        }}
                        style={{
                          width: '100%',
                          padding: '0.5rem',
                          border: '1px solid #d1d5db',
                          borderRadius: '0.25rem',
                          fontSize: '0.85rem'
                        }}
                      >
                        <option value="">{t('menu.selectItem')}</option>
                        {categoryFilteredIngredientItems.map(item => (
                          <option key={item.id} value={item.id}>{item.name}</option>
                        ))}
                      </select>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={ingredientQuantityDrafts[idx] ?? (ing.quantity ? String(ing.quantity) : '')}
                        onChange={(e) => {
                          const inputValue = e.target.value;
                          if (!isValidIngredientQuantityInput(inputValue)) return;
                          setIngredientQuantityDrafts(prev => ({ ...prev, [idx]: inputValue }));
                          const quantity = inputValue && inputValue !== '.' ? Number(inputValue) : 0;
                          if (!Number.isNaN(quantity)) {
                            const newIngredients = [...(editingMenu.ingredients || [])];
                            newIngredients[idx] = { ...ing, quantity };
                            setEditingMenu({...editingMenu, ingredients: newIngredients});
                          }
                        }}
                        onBlur={() => {
                          setIngredientQuantityDrafts(prev => {
                            const nextDrafts = { ...prev };
                            delete nextDrafts[idx];
                            return nextDrafts;
                          });
                        }}
                        placeholder="0.5"
                        style={{
                          width: '100%',
                          padding: '0.5rem',
                          border: '1px solid #d1d5db',
                          borderRadius: '0.25rem',
                          fontSize: '0.85rem'
                        }}
                      />
                      <input
                        type="text"
                        value={ing.unit}
                        onChange={(e) => {
                          const newIngredients = [...(editingMenu.ingredients || [])];
                          newIngredients[idx] = { ...ing, unit: e.target.value };
                          setEditingMenu({...editingMenu, ingredients: newIngredients});
                        }}
                        placeholder={t('menu.unitPlaceholder')}
                        style={{
                          width: '100%',
                          padding: '0.5rem',
                          border: '1px solid #d1d5db',
                          borderRadius: '0.25rem',
                          fontSize: '0.85rem'
                        }}
                      />
                      <button
                        onClick={() => {
                          const newIngredients = (editingMenu.ingredients || []).filter((_, i) => i !== idx);
                          setIngredientQuantityDrafts({});
                          setIngredientCategoryFilters(Object.fromEntries(
                            newIngredients.map((ingredient, index) => [
                              index,
                              inventoryItems.find(item => item.id === ingredient.itemId)?.category || ''
                            ])
                          ));
                          setEditingMenu({...editingMenu, ingredients: newIngredients});
                        }}
                        style={{
                          padding: '0.5rem',
                          backgroundColor: '#ef4444',
                          color: 'white',
                          border: 'none',
                          borderRadius: '0.25rem',
                          cursor: 'pointer',
                          fontSize: '0.85rem'
                        }}
                      >
                        🗑️
                      </button>
                    </div>
                    );
                  })}
                  <button
                    onClick={() => {
                      const newIngredients = [...(editingMenu.ingredients || []), { itemId: '', itemName: '', quantity: 0, unit: '磅' }];
                      setIngredientQuantityDrafts({});
                      setIngredientCategoryFilters(prev => ({ ...prev, [newIngredients.length - 1]: '' }));
                      setEditingMenu({...editingMenu, ingredients: newIngredients});
                    }}
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      backgroundColor: '#3b82f6',
                      color: 'white',
                      border: 'none',
                      borderRadius: '0.25rem',
                      cursor: 'pointer',
                      fontWeight: '600',
                      fontSize: '0.85rem'
                    }}
                  >
                    ➕ {t('menu.addIngredient')}
                  </button>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
              <button
                onClick={() => {
                  setSelectedImageFile(null);
                  setIsProcessingImage(false);
                  setIngredientQuantityDrafts({});
                  setIngredientCategoryFilters({});
                  setShowMenuModal(false);
                  setEditingMenu({
                    name: '',
                    price: 0,
                    category: categories[0] || '主食',
                    type: 'direct',
                    stockItemId: undefined,
                    available: true,
                    ingredients: []
                  });
                }}
                style={{
                  padding: '0.6rem 1.2rem',
                  backgroundColor: '#f3f4f6',
                  color: '#374151',
                  border: 'none',
                  borderRadius: '0.375rem',
                  cursor: 'pointer',
                  fontWeight: '600'
                }}
              >
                {t('menu.cancel')}
              </button>
              <button
                disabled={isProcessingImage}
                onClick={async () => {
                  if (!editingMenu.name || !editingMenu.price) {
                    alert(t('menu.alert.nameAndPriceRequired'));
                    return;
                  }
                  
                  // 直接扣减模式必须选择库存物品
                  if (editingMenu.type === 'direct' && !editingMenu.stockItemId) {
                    alert(t('menu.alert.directItemRequired'));
                    return;
                  }
                  
                  // 配方模式必须有原料
                  if (editingMenu.type === 'recipe' && (!editingMenu.ingredients || editingMenu.ingredients.length === 0)) {
                    alert(t('menu.alert.recipeIngredientRequired'));
                    return;
                  }
                  
                  try {
                    setIsProcessingImage(true);
                    let imageFields: Partial<MenuItem> = {};
                    const menuIdForSave = editingMenu.id || `menu-${Date.now()}`;

                    if (selectedImageFile) {
                      imageFields = await processAndUploadMenuImage(menuIdForSave, selectedImageFile);
                      if (imageFields.imageUploadPending) {
                        alert(t('menu.alert.imagePending'));
                      }
                    }

                    if (editingMenu.id) {
                      const updatedMenu = {
                        ...menuItems.find(m => m.id === editingMenu.id),
                        ...editingMenu,
                        ...imageFields,
                        image: selectedImageFile ? undefined : editingMenu.image,
                        imageThumbUrl: selectedImageFile ? undefined : editingMenu.imageThumbUrl,
                        imageThumbStoragePath: selectedImageFile ? undefined : editingMenu.imageThumbStoragePath,
                        lastModified: Date.now()
                      } as MenuItem;
                      setMenuItems(menuItems.map(m =>
                        m.id === editingMenu.id ? updatedMenu : m
                      ));
                      await smartUpdateDocument('menu_items', editingMenu.id, updatedMenu);
                    } else {
                      const now = Date.now();
                      const newMenu: MenuItem = {
                        id: menuIdForSave,
                        name: editingMenu.name!,
                        price: editingMenu.price!,
                        category: editingMenu.category || '主食',
                        type: editingMenu.type || 'direct',
                        stockItemId: editingMenu.stockItemId,
                        available: editingMenu.available !== false,
                        ingredients: editingMenu.ingredients || [],
                        ...imageFields,
                        lastModified: now
                      } as MenuItem;

                      setMenuItems([...menuItems, newMenu]);
                      await smartSetDocument('menu_items', newMenu.id, newMenu);
                    }

                    setShowMenuModal(false);
                    setSelectedImageFile(null);
                    setIngredientQuantityDrafts({});
                    setIngredientCategoryFilters({});
                    setEditingMenu({
                      name: '',
                      price: 0,
                      category: categories[0] || '主食',
                      type: 'direct',
                      stockItemId: undefined,
                      available: true,
                      ingredients: []
                    });
                  } catch (error: any) {
                    console.error('保存菜品失败:', error);
                    alert(error?.message || t('menu.alert.saveFailed'));
                  } finally {
                    setIsProcessingImage(false);
                  }                }}
                style={{
                  padding: '0.6rem 1.2rem',
                  backgroundColor: '#10b981',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.375rem',
                  cursor: isProcessingImage ? 'not-allowed' : 'pointer',
                  fontWeight: '600'
                }}
              >
                {isProcessingImage ? t('menu.image.uploading') : t('menu.confirmSave')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 分类管理弹窗 */}
      {showCategoryModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '0.5rem',
            padding: '1.5rem',
            width: '500px',
            maxHeight: '70vh',
            overflow: 'auto'
          }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '1rem' }}>
              🏷️ {t('menu.category.title')}
            </h3>
            
            {/* 添加新分类 */}
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.35rem', fontWeight: '600', fontSize: '0.9rem' }}>
                {t('menu.category.add')}
              </label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  type="text"
                  value={editingCategory.name}
                  onChange={(e) => setEditingCategory({ name: e.target.value })}
                  placeholder={t('menu.category.namePlaceholder')}
                  onKeyDown={async (e) => {
                    if (e.key === 'Enter' && editingCategory.name.trim()) {
                      if (categories.includes(editingCategory.name.trim())) {
                        alert(t('menu.category.exists'));
                        return;
                      }
                      await saveMenuCategories([...categories, editingCategory.name.trim()]);
                      setEditingCategory({ name: '' });
                    }
                  }}
                  style={{
                    flex: 1,
                    padding: '0.6rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.375rem',
                    fontSize: '0.9rem'
                  }}
                />
                <button
                  onClick={async () => {
                    if (!editingCategory.name.trim()) {
                      alert(t('menu.category.nameRequired'));
                      return;
                    }
                    if (categories.includes(editingCategory.name.trim())) {
                      alert(t('menu.category.exists'));
                      return;
                    }
                    await saveMenuCategories([...categories, editingCategory.name.trim()]);
                    setEditingCategory({ name: '' });
                  }}
                  style={{
                    padding: '0.6rem 1rem',
                    backgroundColor: '#10b981',
                    color: 'white',
                    border: 'none',
                    borderRadius: '0.375rem',
                    fontWeight: '600',
                    cursor: 'pointer',
                    fontSize: '0.85rem'
                  }}
                >
                  ➕ {t('menu.category.addAction')}
                </button>
              </div>
            </div>

            {/* 分类列表 */}
            <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '1rem' }}>
              <div style={{ fontSize: '0.9rem', fontWeight: '600', marginBottom: '0.75rem', color: '#374151' }}>
                {t('menu.category.existing')} ({categories.length})
              </div>
              <div style={{ display: 'grid', gap: '0.5rem' }}>
                {categories.map((cat, idx) => (
                  <div key={idx} style={{
                    padding: '0.75rem',
                    backgroundColor: '#f9fafb',
                    borderRadius: '0.375rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    border: '1px solid #e5e7eb'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontSize: '1.2rem' }}>🏷️</span>
                      <span style={{ fontWeight: '600', fontSize: '0.95rem' }}>{cat}</span>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        onClick={async () => {
                          const newName = prompt(t('menu.category.editName'), cat);
                          if (newName && newName.trim() && newName.trim() !== cat) {
                            if (categories.includes(newName.trim())) {
                              alert(t('menu.category.exists'));
                              return;
                            }
                            const newCategories = [...categories];
                            newCategories[idx] = newName.trim();
                            await saveMenuCategories(newCategories);
                            // 同时更新使用该分类的菜品
                            const now = Date.now();
                            const updatedMenus = menuItems.map(menu => 
                              menu.category === cat ? { ...menu, category: newName.trim(), lastModified: now } : menu
                            );
                            setMenuItems(updatedMenus);
                            await Promise.all(updatedMenus
                              .filter(menu => menu.category === newName.trim())
                              .map(menu => smartUpdateDocument('menu_items', menu.id, menu))
                            );
                          }
                        }}
                        style={{
                          padding: '0.35rem 0.6rem',
                          backgroundColor: '#3b82f6',
                          color: 'white',
                          border: 'none',
                          borderRadius: '0.25rem',
                          cursor: 'pointer',
                          fontSize: '0.75rem',
                          fontWeight: '600'
                        }}
                      >
                        ✏️ {t('menu.edit')}
                      </button>
                      <button
                        onClick={async () => {
                          const usedCount = menuItems.filter(m => m.category === cat).length;
                          if (usedCount > 0) {
                            if (!window.confirm(`${t('menu.category.usedPrefix')} ${usedCount} ${t('menu.category.usedSuffix')}`)) {
                              return;
                            }
                          } else {
                            if (!window.confirm(`${t('menu.category.deleteConfirm')} "${cat}"?`)) {
                              return;
                            }
                          }
                          await saveMenuCategories(categories.filter((_, i) => i !== idx));
                        }}
                        style={{
                          padding: '0.35rem 0.6rem',
                          backgroundColor: '#ef4444',
                          color: 'white',
                          border: 'none',
                          borderRadius: '0.25rem',
                          cursor: 'pointer',
                          fontSize: '0.75rem',
                          fontWeight: '600'
                        }}
                      >
                        🗑️ {t('menu.delete')}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
              <button
                onClick={() => {
                  setShowCategoryModal(false);
                  setEditingCategory({ name: '' });
                }}
                style={{
                  padding: '0.6rem 1.2rem',
                  backgroundColor: '#f3f4f6',
                  color: '#374151',
                  border: 'none',
                  borderRadius: '0.375rem',
                  cursor: 'pointer',
                  fontWeight: '600'
                }}
              >
                {t('menu.close')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MenuManagement;
