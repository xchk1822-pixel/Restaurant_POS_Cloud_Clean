import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAppContext } from '../contexts/AppContext';
import type { MenuItem as AppMenuItem } from '../contexts/AppContext';
import MenuImage from './MenuImage';
import { colors, font, radii, shadows } from '../styles/uiTokens';
import { useI18n } from '../i18n/I18nContext';

interface MenuItem extends AppMenuItem {}

const menuInputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.72rem 0.85rem',
  border: `1px solid ${colors.borderStrong}`,
  borderRadius: radii.md,
  fontSize: font.body,
  outline: 'none',
  boxSizing: 'border-box',
  background: colors.surface,
};

interface OrderDetailProps {
  items: Array<{ menuItemId: string; name: string; quantity: number; price: number; subtotal: number }>;
  onAddItem: (item: MenuItem) => void;
  onRemoveItem: (itemId: string) => void;
  onUpdateQuantity: (itemId: string, quantity: number) => void;
}

const MenuSelection: React.FC<OrderDetailProps> = ({ items, onAddItem, onRemoveItem, onUpdateQuantity }) => {
  const { menuItems: contextMenuItems, categories } = useAppContext();
  const { t } = useI18n();
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const focusSearchInput = useCallback(() => {
    window.setTimeout(() => {
      searchInputRef.current?.focus();
    }, 0);
  }, []);

  useEffect(() => {
    focusSearchInput();
  }, [focusSearchInput]);

  // 使用 Context 中的菜单数据和分类
  const menuItems = contextMenuItems;
  
  // 添加 'all' 选项到分类列表
  const categoryList = ['all', ...categories];

  const filteredItems = menuItems.filter(item => {
    const matchCategory = selectedCategory === 'all' || item.category === selectedCategory;
    const matchSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                       (item.nameEs && item.nameEs.toLowerCase().includes(searchTerm.toLowerCase()));
    return matchCategory && matchSearch; // 不过滤 available，全部显示
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, background: colors.surface, fontFamily: font.family }}>
      {/* 搜索框 */}
      <div style={{ padding: '0.75rem', borderBottom: `1px solid ${colors.border}`, background: colors.surface }}>
        <input
          ref={searchInputRef}
          type="text"
          autoFocus
          placeholder={t('pos.menu.search')}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={menuInputStyle}
        />
      </div>

      {/* 分类标签 */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignContent: 'flex-start',
        gap: '0.45rem',
        padding: '0.65rem 0.75rem',
        borderBottom: `1px solid ${colors.border}`,
        background: colors.surfaceMuted,
        flexShrink: 0
      }}>
        {categoryList.map(category => (
          <button
            key={category}
            onClick={() => {
              setSelectedCategory(category);
              focusSearchInput();
            }}
            style={{
              padding: '0.42rem 0.78rem',
              borderRadius: radii.pill,
              fontSize: '0.75rem',
              fontWeight: '750',
              whiteSpace: 'nowrap',
              cursor: 'pointer',
              border: selectedCategory === category ? `1px solid ${colors.blue}` : `1px solid ${colors.border}`,
              backgroundColor: selectedCategory === category ? colors.blue : colors.surface,
              color: selectedCategory === category ? colors.surface : colors.textSecondary,
              boxShadow: selectedCategory === category ? '0 8px 18px rgba(37, 99, 235, 0.2)' : 'none'
            }}
          >
            {category === 'all' ? t('pos.menu.all') : category}
          </button>
        ))}
      </div>

      {/* 菜品网格 */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0.65rem', minHeight: 0, background: colors.surfaceMuted }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '0.6rem' }}>
          {filteredItems.map(item => {
            const isAvailable = item.available !== false;
            return (
              <button
                key={item.id}
                onClick={() => {
                  if (!isAvailable) return;
                  onAddItem(item);
                  focusSearchInput();
                }}
                disabled={!isAvailable}
                style={{
                  padding: 0,
                  backgroundColor: !isAvailable ? colors.surfaceMuted : colors.surface,
                  border: item.type === 'recipe' ? `1px solid ${colors.border}` : `1px solid ${colors.blue}`,
                  borderColor: !isAvailable ? colors.borderStrong : (item.type === 'recipe' ? colors.border : colors.blue),
                  borderRadius: radii.md,
                  cursor: isAvailable ? 'pointer' : 'not-allowed',
                  textAlign: 'left',
                  transition: 'all 0.2s',
                  position: 'relative',
                  opacity: isAvailable ? 1 : 0.5,
                  minHeight: '154px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'flex-start',
                  overflow: 'hidden',
                  boxShadow: shadows.soft
                }}
                onMouseEnter={(e) => {
                  if (isAvailable) {
                    e.currentTarget.style.borderColor = item.type === 'recipe' ? colors.blue : colors.teal;
                    e.currentTarget.style.boxShadow = shadows.lift;
                  }
                }}
                onMouseLeave={(e) => {
                  if (isAvailable) {
                    e.currentTarget.style.borderColor = item.type === 'recipe' ? colors.border : colors.blue;
                    e.currentTarget.style.boxShadow = shadows.soft;
                  }
                }}
              >
              {/* 菜品图片 */}
                <div style={{
                  width: '100%',
                  aspectRatio: '4 / 3',
                  minHeight: '104px',
                  overflow: 'hidden',
                  backgroundColor: colors.surfaceMuted,
                  position: 'relative'
                }}>
                  <MenuImage
                    menuId={item.id}
                    name={item.name}
                    src={item.imageThumbUrl || item.imageUrl}
                    legacySrc={item.image}
                    cacheVersion={item.imageUpdatedAt}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'contain',
                      display: 'block'
                    }}
                  />
                </div>

                {/* 使用图片下方空间完整显示菜名和价格 */}
                <div style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  minHeight: '4.35rem',
                  padding: '0.48rem 0.55rem 0.52rem',
                  background: colors.surface,
                  color: colors.textPrimary,
                  borderTop: `1px solid ${colors.border}`,
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '0.28rem',
                  textShadow: 'none'
                }}>
                  <div
                    title={item.name}
                    style={{
                      fontWeight: 700,
                      fontSize: '0.82rem',
                      lineHeight: 1.22,
                      color: colors.blue,
                      whiteSpace: 'normal',
                      overflowWrap: 'anywhere',
                      wordBreak: 'break-word'
                    }}
                  >
                    {item.name}
                  </div>
                  <div style={{ color: colors.danger, fontSize: '0.95rem', fontWeight: 800, lineHeight: 1.1 }}>
                    C${item.price}
                  </div>
                </div>
              
              {/* 类型标签 */}
              <div style={{
                position: 'absolute',
                top: '0.3rem',
                right: '0.3rem',
                padding: '0.1rem 0.3rem',
                backgroundColor: item.type === 'recipe' ? colors.success : colors.blue,
                color: 'white',
                borderRadius: radii.sm,
                fontSize: '0.6rem',
                fontWeight: '600'
              }}>
                {item.type === 'recipe' ? '🍽️' : '📦'}
              </div>
              
              {item.nameEs && (
                <div style={{ fontSize: '0.68rem', color: '#6b7280', padding: '0.25rem 0.45rem 0', lineHeight: '1.2' }}>{item.nameEs}</div>
              )}
              {item.type !== 'recipe' && (
                <div style={{ fontSize: '0.68rem', color: '#6b7280', padding: '0.2rem 0.45rem 0.4rem' }}>
                  ✓ {t('pos.menu.directStock')}
                </div>
              )}
              
              {/* 停售标签 */}
              {!isAvailable && (
                <div style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  backgroundColor: 'rgba(0, 0, 0, 0.7)',
                  color: 'white',
                  padding: '0.25rem 0.75rem',
                  borderRadius: '0.25rem',
                  fontSize: '0.85rem',
                  fontWeight: 'bold',
                  zIndex: 10
                }}>
                  {t('pos.menu.unavailable')}
                </div>
              )}
            </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default MenuSelection;
