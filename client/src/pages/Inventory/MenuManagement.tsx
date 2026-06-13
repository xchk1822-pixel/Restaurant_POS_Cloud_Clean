import React, { useState, useEffect } from 'react';
import { useAppContext } from '../../contexts/AppContext';
import { smartDeleteDocument, smartGetDocuments, smartSetDocument, smartUpdateDocument } from '../../services/smartSyncService';
import { getRecordVersion, mergeRecordsByVersion } from '../../utils/syncMerge';
import MenuImage from '../../components/MenuImage';
import { processAndUploadMenuImage } from '../../services/menuImageService';

interface RecipeIngredient {
  itemId: string;
  itemName: string;
  quantity: number;
  unit: string;
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

const MenuManagement: React.FC = () => {
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
  
  // 从 localStorage 加载分类配置
  useEffect(() => {
    try {
      const saved = localStorage.getItem('inventory_categories');
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
        localStorage.setItem('inventory_categories', JSON.stringify(mergedCategories));
      }
      setLastSyncedAt(new Date());
    } catch (error) {
      console.error('刷新菜品数据失败:', error);
      alert('刷新菜品数据失败，请检查网络后重试');
    } finally {
      setIsRefreshing(false);
    }
  };

  const saveMenuCategories = async (nextCategories: string[]) => {
    setCategories(nextCategories);
    localStorage.setItem('inventory_categories', JSON.stringify(nextCategories));
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

  return (
    <div style={{ 
      padding: '1.5rem', 
      height: '100vh', 
      maxHeight: '100vh',
      display: 'flex', 
      flexDirection: 'column', 
      gap: '1rem', 
      overflow: 'hidden',
      boxSizing: 'border-box'
    }}>
      {/* 标题栏 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 'bold' }}>🍽️ 菜品管理</h2>
          <div style={{ marginTop: '0.5rem', fontSize: '0.9rem', color: '#6b7280' }}>
            共 <span style={{ fontWeight: 'bold', color: '#3b82f6' }}>{menuItems.length}</span> 个菜品 · 
            可售 <span style={{ fontWeight: 'bold', color: '#10b981' }}>{menuItems.filter(m => m.available).length}</span> 个 · 
            停售 <span style={{ fontWeight: 'bold', color: '#ef4444' }}>{menuItems.filter(m => !m.available).length}</span> 个
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          {lastSyncedAt && (
            <span style={{ fontSize: '0.75rem', color: '#6b7280', whiteSpace: 'nowrap' }}>
              最后同步 {lastSyncedAt.toLocaleTimeString('es-NI', { hour12: false })}
            </span>
          )}
          <button
            onClick={refreshMenuData}
            disabled={isRefreshing}
            style={{
              padding: '0.6rem 1.2rem',
              backgroundColor: isRefreshing ? '#9ca3af' : '#0ea5e9',
              color: 'white',
              border: 'none',
              borderRadius: '0.375rem',
              cursor: isRefreshing ? 'not-allowed' : 'pointer',
              fontWeight: '600'
            }}
          >
            {isRefreshing ? '同步中...' : '刷新菜品'}
          </button>
          <button
            onClick={() => setShowCategoryModal(true)}
            style={{
              padding: '0.6rem 1.2rem',
              backgroundColor: '#8b5cf6',
              color: 'white',
              border: 'none',
              borderRadius: '0.375rem',
              cursor: 'pointer',
              fontWeight: '600'
            }}
          >
            🏷️ 分类管理
          </button>
          <button
            onClick={() => {
              setSelectedImageFile(null);
              setIsProcessingImage(false);
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
            style={{
              padding: '0.6rem 1.2rem',
              backgroundColor: '#10b981',
              color: 'white',
              border: 'none',
              borderRadius: '0.375rem',
              cursor: 'pointer',
              fontWeight: '600'
            }}
          >
            ➕ 添加菜品
          </button>
        </div>
      </div>

      {/* 菜品卡片列表 */}
      <div style={{ flex: 1, backgroundColor: 'white', borderRadius: '0.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{
          padding: '0.85rem 1rem',
          borderBottom: '1px solid #e5e7eb',
          display: 'grid',
          gridTemplateColumns: 'minmax(240px, 1fr) minmax(180px, 240px) auto',
          gap: '0.75rem',
          alignItems: 'center',
          backgroundColor: '#f9fafb'
        }}>
          <input
            type="text"
            value={menuSearchTerm}
            onChange={(e) => setMenuSearchTerm(e.target.value)}
            placeholder="搜索菜品名称、分类或价格"
            style={{
              width: '100%',
              padding: '0.6rem 0.75rem',
              border: '1px solid #d1d5db',
              borderRadius: '0.375rem',
              fontSize: '0.9rem',
              boxSizing: 'border-box'
            }}
          />
          <select
            value={selectedMenuCategory}
            onChange={(e) => setSelectedMenuCategory(e.target.value)}
            style={{
              width: '100%',
              padding: '0.6rem 0.75rem',
              border: '1px solid #d1d5db',
              borderRadius: '0.375rem',
              fontSize: '0.9rem',
              backgroundColor: 'white',
              boxSizing: 'border-box'
            }}
          >
            <option value="all">全部类别</option>
            {menuCategoryOptions.map(categoryName => (
              <option key={categoryName} value={categoryName}>
                {categoryName} ({menuItems.filter(menu => menu.category === categoryName).length})
              </option>
            ))}
          </select>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontSize: '0.85rem', color: '#6b7280', whiteSpace: 'nowrap' }}>
              显示 {filteredMenuItems.length} / {menuItems.length}
            </span>
            {(menuSearchTerm || selectedMenuCategory !== 'all') && (
              <button
                onClick={() => {
                  setMenuSearchTerm('');
                  setSelectedMenuCategory('all');
                }}
                style={{
                  padding: '0.5rem 0.75rem',
                  backgroundColor: '#e5e7eb',
                  color: '#374151',
                  border: 'none',
                  borderRadius: '0.375rem',
                  cursor: 'pointer',
                  fontWeight: '600',
                  fontSize: '0.85rem',
                  whiteSpace: 'nowrap'
                }}
              >
                清空
              </button>
            )}
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '1rem' }}>
          {menuItems.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: '#9ca3af' }}>
              <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🍽️</div>
              <p>暂无菜品，点击"添加菜品"开始创建</p>
            </div>
          ) : filteredMenuItems.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: '#9ca3af' }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔎</div>
              <p>没有找到匹配的菜品</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1rem' }}>
              {filteredMenuItems.map(menu => (
                <div key={menu.id} style={{
                  padding: '1rem',
                  border: '1px solid #e5e7eb',
                  borderRadius: '0.5rem',
                  backgroundColor: menu.available ? 'white' : '#fee2e2'
                }}>
                  <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.75rem' }}>
                    {/* 菜品图片 */}
                    <div style={{
                      width: '80px',
                      height: '80px',
                      borderRadius: '0.375rem',
                      backgroundColor: '#f3f4f6',
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
                          <div style={{ fontWeight: 'bold', fontSize: '1.05rem' }}>{menu.name}</div>
                          <div style={{ fontSize: '0.85rem', color: '#6b7280', marginTop: '0.25rem' }}>
                            {menu.category} · C$ {menu.price.toFixed(2)}
                          </div>
                        </div>
                        <span style={{
                          padding: '0.25rem 0.5rem',
                          backgroundColor: menu.available ? '#d1fae5' : '#fee2e2',
                          color: menu.available ? '#059669' : '#dc2626',
                          borderRadius: '0.25rem',
                          fontSize: '0.75rem',
                          fontWeight: '600'
                        }}>
                          {menu.available ? '✓ 可售' : '✗ 停售'}
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  <div style={{ marginBottom: '0.75rem', paddingLeft: '90px' }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: '600', marginBottom: '0.5rem', color: '#374151' }}>
                      配方原料：
                    </div>
                    {menu.ingredients?.map((ing, idx) => (
                      <div key={idx} style={{ 
                        padding: '0.35rem 0', 
                        borderBottom: idx < (menu.ingredients?.length || 0) - 1 ? '1px solid #f3f4f6' : 'none',
                        fontSize: '0.85rem',
                        color: '#6b7280'
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
                      ✏️ 编辑
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
                      {menu.available ? '⏸️ 停售' : '▶️ 上架'}
                    </button>
                    <button
                      onClick={async () => {
                        if (window.confirm(`确定要删除菜品 ${menu.name} 吗？`)) {
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
              {editingMenu.id ? '编辑菜品' : '添加菜品'}
            </h3>
            
            <div style={{ display: 'grid', gap: '1rem' }}>
              {/* 菜品图片上传 */}
              <div>
                <label style={{ display: 'block', marginBottom: '0.35rem', fontWeight: '600', fontSize: '0.9rem' }}>
                  菜品图片
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
                        保存时压缩上传
                      </div>
                    </>
                  ) : (editingMenu.imageThumbUrl || editingMenu.imageUrl || editingMenu.image || editingMenu.imageUpdatedAt || editingMenu.imageUploadPending) ? (
                    <MenuImage
                      menuId={editingMenu.id || 'new-menu'}
                      name={editingMenu.name || '菜品'}
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
                      <div style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: '0.5rem' }}>点击上传</div>
                    </>
                  )}
                </label>
              </div>

              {/* 菜品名称 */}
              <div>
                <label style={{ display: 'block', marginBottom: '0.35rem', fontWeight: '600', fontSize: '0.9rem' }}>
                  菜品名称 <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="text"
                  value={editingMenu.name || ''}
                  onChange={(e) => setEditingMenu({...editingMenu, name: e.target.value})}
                  placeholder="输入菜品名称"
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
                    分类 <span style={{ color: '#ef4444' }}>*</span>
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
                    价格 (C$) <span style={{ color: '#ef4444' }}>*</span>
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
                  库存扣减方式 <span style={{ color: '#ef4444' }}>*</span>
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
                      <div style={{ fontWeight: '600', fontSize: '0.9rem' }}>📝 配方扣减</div>
                      <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>需要配置原料清单</div>
                    </div>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', padding: '0.5rem', border: editingMenu.type === 'direct' ? '2px solid #3b82f6' : '1px solid #d1d5db', borderRadius: '0.375rem', flex: 1 }}>
                    <input
                      type="radio"
                      checked={editingMenu.type === 'direct'}
                      onChange={() => setEditingMenu({...editingMenu, type: 'direct', ingredients: []})}
                      style={{ marginRight: '0.5rem' }}
                    />
                    <div>
                      <div style={{ fontWeight: '600', fontSize: '0.9rem' }}>📦 直接扣减</div>
                      <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>关联单个库存物品</div>
                    </div>
                  </label>
                </div>
              </div>

              {/* 直接扣减时选择库存物品 */}
              {editingMenu.type === 'direct' && (
                <div>
                  <label style={{ display: 'block', marginBottom: '0.35rem', fontWeight: '600', fontSize: '0.9rem' }}>
                    关联库存物品 <span style={{ color: '#ef4444' }}>*</span>
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
                    <option value="">请选择库存物品</option>
                    {directDeductionInventoryItems.map(item => (
                      <option key={item.id} value={item.id}>{item.name} (当前库存: {item.currentStock} {item.unit})</option>
                    ))}
                  </select>
                </div>
              )}

              {/* 配方原料 */}
              <div>
                <label style={{ display: 'block', marginBottom: '0.35rem', fontWeight: '600', fontSize: '0.9rem' }}>
                  配方原料
                </label>
                <div style={{ display: 'grid', gap: '0.5rem' }}>
                  {(editingMenu.ingredients || []).map((ing, idx) => (
                    <div key={idx} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <select
                        value={ing.itemId}
                        onChange={(e) => {
                          const selectedItem = inventoryItems.find(item => item.id === e.target.value);
                          const newIngredients = [...(editingMenu.ingredients || [])];
                          newIngredients[idx] = {
                            ...ing,
                            itemId: e.target.value,
                            itemName: selectedItem?.name || ''
                          };
                          setEditingMenu({...editingMenu, ingredients: newIngredients});
                        }}
                        style={{
                          flex: 2,
                          padding: '0.5rem',
                          border: '1px solid #d1d5db',
                          borderRadius: '0.25rem',
                          fontSize: '0.85rem'
                        }}
                      >
                        <option value="">选择物品</option>
                        {recipeIngredientInventoryItems.map(item => (
                          <option key={item.id} value={item.id}>{item.name}</option>
                        ))}
                      </select>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={ing.quantity || ''}
                        onChange={(e) => {
                          const newIngredients = [...(editingMenu.ingredients || [])];
                          newIngredients[idx] = { ...ing, quantity: e.target.value ? parseFloat(e.target.value) : 0 };
                          setEditingMenu({...editingMenu, ingredients: newIngredients});
                        }}
                        placeholder="0.5"
                        style={{
                          flex: 1,
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
                        placeholder="单位"
                        style={{
                          flex: 1,
                          padding: '0.5rem',
                          border: '1px solid #d1d5db',
                          borderRadius: '0.25rem',
                          fontSize: '0.85rem'
                        }}
                      />
                      <button
                        onClick={() => {
                          const newIngredients = (editingMenu.ingredients || []).filter((_, i) => i !== idx);
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
                  ))}
                  <button
                    onClick={() => {
                      const newIngredients = [...(editingMenu.ingredients || []), { itemId: '', itemName: '', quantity: 0, unit: '磅' }];
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
                    ➕ 添加原料
                  </button>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
              <button
                onClick={() => {
                  setSelectedImageFile(null);
                  setIsProcessingImage(false);
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
                取消
              </button>
              <button
                disabled={isProcessingImage}
                onClick={async () => {
                  if (!editingMenu.name || !editingMenu.price) {
                    alert('请填写菜品名称和价格');
                    return;
                  }
                  
                  // 直接扣减模式必须选择库存物品
                  if (editingMenu.type === 'direct' && !editingMenu.stockItemId) {
                    alert('直接扣减模式必须选择关联的库存物品');
                    return;
                  }
                  
                  // 配方模式必须有原料
                  if (editingMenu.type === 'recipe' && (!editingMenu.ingredients || editingMenu.ingredients.length === 0)) {
                    alert('配方模式至少需要添加一个原料');
                    return;
                  }
                  
                  try {
                    setIsProcessingImage(true);
                    let imageFields: Partial<MenuItem> = {};
                    const menuIdForSave = editingMenu.id || `menu-${Date.now()}`;

                    if (selectedImageFile) {
                      imageFields = await processAndUploadMenuImage(menuIdForSave, selectedImageFile);
                      if (imageFields.imageUploadPending) {
                        alert('图片已压缩并保存在本机，但还没有上传到云端。当前终端可显示，其他终端需要等网络/权限恢复后自动同步。');
                      }
                    }

                    if (editingMenu.id) {
                      const updatedMenu = {
                        ...menuItems.find(m => m.id === editingMenu.id),
                        ...editingMenu,
                        ...imageFields,
                        image: selectedImageFile ? undefined : editingMenu.image,
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
                    alert(error?.message || '保存失败，请检查网络后重试');
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
                {isProcessingImage ? '图片处理中...' : '确认保存'}
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
              🏷️ 菜品分类管理
            </h3>
            
            {/* 添加新分类 */}
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.35rem', fontWeight: '600', fontSize: '0.9rem' }}>
                添加新分类
              </label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  type="text"
                  value={editingCategory.name}
                  onChange={(e) => setEditingCategory({ name: e.target.value })}
                  placeholder="输入分类名称"
                  onKeyDown={async (e) => {
                    if (e.key === 'Enter' && editingCategory.name.trim()) {
                      if (categories.includes(editingCategory.name.trim())) {
                        alert('该分类已存在');
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
                      alert('请输入分类名称');
                      return;
                    }
                    if (categories.includes(editingCategory.name.trim())) {
                      alert('该分类已存在');
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
                  ➕ 添加
                </button>
              </div>
            </div>

            {/* 分类列表 */}
            <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '1rem' }}>
              <div style={{ fontSize: '0.9rem', fontWeight: '600', marginBottom: '0.75rem', color: '#374151' }}>
                现有分类 ({categories.length})
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
                          const newName = prompt('修改分类名称:', cat);
                          if (newName && newName.trim() && newName.trim() !== cat) {
                            if (categories.includes(newName.trim())) {
                              alert('该分类名称已存在');
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
                        ✏️ 编辑
                      </button>
                      <button
                        onClick={async () => {
                          const usedCount = menuItems.filter(m => m.category === cat).length;
                          if (usedCount > 0) {
                            if (!window.confirm(`该分类下有 ${usedCount} 个菜品，删除后这些菜品将保留原分类名称。确定要删除吗？`)) {
                              return;
                            }
                          } else {
                            if (!window.confirm(`确定要删除分类"${cat}"吗？`)) {
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
                        🗑️ 删除
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
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MenuManagement;
