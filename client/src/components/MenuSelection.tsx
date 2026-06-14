import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAppContext } from '../contexts/AppContext';
import type { MenuItem as AppMenuItem } from '../contexts/AppContext';
import MenuImage from './MenuImage';

interface MenuItem extends AppMenuItem {}

interface OrderDetailProps {
  items: Array<{ menuItemId: string; name: string; quantity: number; price: number; subtotal: number }>;
  onAddItem: (item: MenuItem) => void;
  onRemoveItem: (itemId: string) => void;
  onUpdateQuantity: (itemId: string, quantity: number) => void;
}

const MenuSelection: React.FC<OrderDetailProps> = ({ items, onAddItem, onRemoveItem, onUpdateQuantity }) => {
  const { menuItems: contextMenuItems, categories } = useAppContext();
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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* 搜索框 */}
      <div style={{ padding: '0.5rem', borderBottom: '1px solid #e5e7eb' }}>
        <input
          ref={searchInputRef}
          type="text"
          autoFocus
          placeholder="搜索菜品 / Buscar platos..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{
            width: '100%',
            padding: '0.5rem 0.75rem',
            border: '1px solid #d1d5db',
            borderRadius: '0.375rem',
            fontSize: '0.875rem',
            outline: 'none'
          }}
        />
      </div>

      {/* 分类标签 */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignContent: 'flex-start',
        gap: '0.5rem',
        padding: '0.5rem',
        borderBottom: '1px solid #e5e7eb',
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
              padding: '0.375rem 0.75rem',
              borderRadius: '0.375rem',
              fontSize: '0.75rem',
              fontWeight: '500',
              whiteSpace: 'nowrap',
              cursor: 'pointer',
              border: 'none',
              backgroundColor: selectedCategory === category ? '#3b82f6' : '#f3f4f6',
              color: selectedCategory === category ? 'white' : '#374151'
            }}
          >
            {category === 'all' ? '全部' : category}
          </button>
        ))}
      </div>

      {/* 菜品网格 */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0.4rem', minHeight: 0 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '0.4rem' }}>
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
                  backgroundColor: !isAvailable ? '#f3f4f6' : (item.type === 'recipe' ? 'white' : '#dbeafe'),
                  border: item.type === 'recipe' ? '1px solid #e5e7eb' : '2px solid #3b82f6',
                  borderColor: !isAvailable ? '#d1d5db' : (item.type === 'recipe' ? '#e5e7eb' : '#3b82f6'),
                  borderRadius: '0.375rem',
                  cursor: isAvailable ? 'pointer' : 'not-allowed',
                  textAlign: 'left',
                  transition: 'all 0.2s',
                  position: 'relative',
                  opacity: isAvailable ? 1 : 0.5,
                  minHeight: '142px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  overflow: 'hidden'
                }}
                onMouseEnter={(e) => {
                  if (isAvailable) {
                    e.currentTarget.style.borderColor = item.type === 'recipe' ? '#3b82f6' : '#2563eb';
                    e.currentTarget.style.boxShadow = '0 2px 4px rgba(59, 130, 246, 0.1)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (isAvailable) {
                    e.currentTarget.style.borderColor = item.type === 'recipe' ? '#e5e7eb' : '#3b82f6';
                    e.currentTarget.style.boxShadow = 'none';
                  }
                }}
              >
              {/* 菜品图片 */}
                <div style={{
                  width: '100%',
                  aspectRatio: '4 / 3',
                  minHeight: '104px',
                  overflow: 'hidden',
                  backgroundColor: '#f8fafc',
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
                  <div style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    bottom: 0,
                    padding: '0.35rem 0.45rem',
                    background: 'linear-gradient(180deg, rgba(15,23,42,0.1), rgba(15,23,42,0.88))',
                    color: 'white',
                    textShadow: '0 1px 2px rgba(0,0,0,0.45)'
                  }}>
                    <div style={{
                      fontWeight: 700,
                      fontSize: '0.82rem',
                      lineHeight: 1.15,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }}>
                      {item.name}
                    </div>
                    <div style={{ fontSize: '0.95rem', fontWeight: 800, lineHeight: 1.1 }}>
                      C${item.price}
                    </div>
                  </div>
                </div>
              
              {/* 类型标签 */}
              <div style={{
                position: 'absolute',
                top: '0.3rem',
                right: '0.3rem',
                padding: '0.1rem 0.3rem',
                backgroundColor: item.type === 'recipe' ? '#10b981' : '#3b82f6',
                color: 'white',
                borderRadius: '0.2rem',
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
                  ✓ 直接扣库存
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
                  已停售
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
