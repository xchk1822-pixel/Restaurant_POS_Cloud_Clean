import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { canAccessPermission } from '../../utils/permissions';
import { colors, font, radii, shadows } from '../../styles/uiTokens';
import logo from '../../logo.svg';
import { useI18n } from '../../i18n/I18nContext';
import type { TranslationKey, UiLanguage } from '../../i18n/translations';
import type { UserRole } from '../../contexts/AuthContext';

interface MainLayoutProps {
  children: React.ReactNode;
}

interface NavItem {
  path: string;
  icon: string;
  labelKey: TranslationKey;
  roles?: string[];
  children?: Array<{
    path: string;
    icon: string;
    labelKey: TranslationKey;
  }>;
}

const roleLabelKey: Record<string, TranslationKey> = {
  super_admin: 'role.superAdmin',
  multi_store_manager: 'role.multiStoreManager',
  store_manager: 'role.storeManager',
  cashier: 'role.cashier',
  waiter: 'role.waiter',
  chef: 'role.chef',
};

const menuItems: NavItem[] = [
  { path: '/dashboard', icon: 'DS', labelKey: 'nav.ownerDashboard', roles: ['super_admin'] },
  { path: '/pos', icon: 'POS', labelKey: 'nav.pos', roles: ['store_manager', 'cashier'] },
  { path: '/waiter', icon: 'WT', labelKey: 'nav.waiter', roles: ['store_manager', 'waiter'] },
  { path: '/kitchen', icon: 'KDS', labelKey: 'nav.kitchen', roles: ['store_manager', 'chef'] },
  {
    path: '/inventory',
    icon: 'ST',
    labelKey: 'nav.inventory',
    roles: ['store_manager'],
    children: [
      { path: '/inventory', icon: 'IT', labelKey: 'nav.inventory.items' },
      { path: '/inventory/menu', icon: 'MN', labelKey: 'nav.inventory.menu' },
      { path: '/inventory/purchase', icon: 'PO', labelKey: 'nav.inventory.purchase' },
      { path: '/inventory/warehouse', icon: 'WH', labelKey: 'nav.inventory.warehouse' },
      { path: '/inventory/fridge', icon: 'FR', labelKey: 'nav.inventory.fridge' },
    ],
  },
  {
    path: '/employees',
    icon: 'HR',
    labelKey: 'nav.employees',
    roles: ['store_manager'],
    children: [
      { path: '/employees', icon: 'EP', labelKey: 'nav.employees.profile' },
      { path: '/employees/attendance', icon: 'AT', labelKey: 'nav.employees.attendance' },
      { path: '/employees/attendance-records', icon: 'AR', labelKey: 'nav.employees.attendanceRecords' },
      { path: '/employees/loans', icon: 'LN', labelKey: 'nav.employees.loans' },
      { path: '/employees/salary', icon: 'PY', labelKey: 'nav.employees.salary' },
    ],
  },
  {
    path: '/manager',
    icon: 'MG',
    labelKey: 'nav.manager',
    roles: ['store_manager'],
    children: [
      { path: '/manager/expense-records', icon: 'EX', labelKey: 'nav.manager.expenses' },
      { path: '/manager/shift-handover', icon: 'SH', labelKey: 'nav.manager.shift' },
      { path: '/manager/order-history', icon: 'OH', labelKey: 'nav.manager.orders' },
      { path: '/manager/financial-reports', icon: 'FR', labelKey: 'nav.manager.finance' },
      { path: '/manager', icon: 'DA', labelKey: 'nav.manager.overview' },
    ],
  },
  { path: '/suppliers', icon: 'SP', labelKey: 'nav.suppliers', roles: ['store_manager'] },
  {
    path: '/customers',
    icon: 'CU',
    labelKey: 'nav.customers',
    roles: ['store_manager'],
    children: [
      { path: '/customers', icon: 'CR', labelKey: 'nav.customers.records' },
      { path: '/customers/promotion', icon: 'RW', labelKey: 'nav.customers.promotion' },
      { path: '/customers/promotion/settings', icon: 'PS', labelKey: 'nav.customers.promotionSettings' },
    ],
  },
  {
    path: '/settings',
    icon: 'SE',
    labelKey: 'nav.settings',
    roles: ['super_admin'],
    children: [
      { path: '/settings/stores', icon: 'BR', labelKey: 'nav.settings.stores' },
      { path: '/settings/exchange-rate', icon: 'FX', labelKey: 'nav.settings.exchange' },
      { path: '/settings/permissions', icon: 'PM', labelKey: 'nav.settings.permissions' },
      { path: '/settings/backup', icon: 'BK', labelKey: 'nav.settings.backup' },
    ],
  },
];

export const getPermissionIdForPath = (path: string): string => {
  if (path === '/settings') return 'settings';
  if (path === '/settings/exchange-rate') return 'settings:exchange';
  if (path === '/inventory') return 'inventory:items';
  if (path === '/employees') return 'employees:profile';
  if (path === '/manager') return 'manager:overview';
  if (path === '/manager/expense-records') return 'manager:expenses';
  if (path === '/manager/shift-handover') return 'manager:handover';
  if (path === '/manager/order-history') return 'manager:orders';
  if (path === '/manager/financial-reports') return 'manager:reports';
  if (path === '/suppliers') return 'suppliers:manage';
  if (path === '/customers') return 'customers:manage';
  if (path === '/customers/promotion/settings') return 'customers:promotion-settings';
  if (path === '/customers/promotion') return 'customers:promotion';
  return path.replace('/', '').replace('/', ':');
};

export const getAccessibleMenuItems = (role: UserRole): NavItem[] => menuItems.flatMap(item => {
  const children = item.children?.filter(child =>
    canAccessPermission(role, getPermissionIdForPath(child.path))
  );
  const canOpenParent = canAccessPermission(role, getPermissionIdForPath(item.path));
  return canOpenParent || (children && children.length > 0)
    ? [{ ...item, children }]
    : [];
});

const MainLayout: React.FC<MainLayoutProps> = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout, switchStore } = useAuth();
  const { language, setLanguage, t } = useI18n();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showFullscreenMenu, setShowFullscreenMenu] = useState(false);
  const [isNarrowViewport, setIsNarrowViewport] = useState(false);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 720px)');
    const update = () => setIsNarrowViewport(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  const filteredMenuItems = user ? getAccessibleMenuItems(user.role) : [];

  const getMenuTargetPath = (item: NavItem): string => {
    if (user && canAccessPermission(user.role, getPermissionIdForPath(item.path))) {
      return item.path;
    }
    return item.children?.[0]?.path || item.path;
  };

  const shouldHideSidebar = location.pathname === '/pos' || location.pathname === '/kitchen' || location.pathname === '/waiter';
  const shouldUseFullscreenMenu = shouldHideSidebar || isNarrowViewport;
  const shouldAllowPageScroll = location.pathname === '/dashboard';

  const renderIcon = (icon: string, active = false) => (
    <span style={{
      minWidth: sidebarCollapsed ? '2.15rem' : '2rem',
      width: sidebarCollapsed ? '2.15rem' : '2rem',
      height: '2rem',
      borderRadius: radii.md,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: active ? colors.teal : colors.surfaceMuted,
      color: active ? colors.surface : colors.textSecondary,
      fontSize: icon.length > 2 ? '0.66rem' : '0.72rem',
      fontWeight: 800,
      letterSpacing: 0,
      flexShrink: 0,
    }}>
      {icon}
    </span>
  );

  const navigateAndClose = (path: string) => {
    setShowFullscreenMenu(false);
    if (path === location.pathname) {
      return;
    }
    if (shouldUseFullscreenMenu) {
      window.location.assign(path);
      return;
    }
    navigate(path);
  };

  return (
    <div style={{
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      background: colors.page,
      color: colors.textPrimary,
      fontFamily: font.family,
    }}>
      {shouldHideSidebar && (
        <button
          onClick={() => setShowFullscreenMenu(!showFullscreenMenu)}
          style={{
            position: 'fixed',
            top: '1rem',
            left: '1rem',
            zIndex: 1000002,
            width: '3.1rem',
            height: '3.1rem',
            borderRadius: radii.lg,
            background: `linear-gradient(135deg, ${colors.teal}, ${colors.blue})`,
            color: colors.surface,
            border: `1px solid rgba(255,255,255,0.35)`,
            fontSize: '1.25rem',
            cursor: 'pointer',
            boxShadow: shadows.lift,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          title={t('layout.switchMenu')}
        >
          ☰
        </button>
      )}

      {shouldUseFullscreenMenu && showFullscreenMenu && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.48)',
            zIndex: 1000001,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
            boxSizing: 'border-box',
          }}
          onClick={() => setShowFullscreenMenu(false)}
        >
          <div
            style={{
              background: colors.surface,
              borderRadius: '18px',
              padding: '1.1rem',
              maxWidth: '420px',
              width: '100%',
              maxHeight: '82vh',
              overflowY: 'auto',
              boxShadow: '0 28px 80px rgba(15, 23, 42, 0.32)',
              border: `1px solid ${colors.border}`,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.9rem' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '1.05rem', color: colors.textPrimary }}>{t('layout.menu')}</h2>
                <div style={{ color: colors.textSecondary, fontSize: font.caption, marginTop: '0.25rem' }}>
                  {user?.storeName || 'Restaurant POS'}
                </div>
              </div>
              <button
                onClick={() => setShowFullscreenMenu(false)}
                style={{
                  background: colors.surfaceMuted,
                  border: `1px solid ${colors.border}`,
                  borderRadius: radii.md,
                  width: '2.25rem',
                  height: '2.25rem',
                  cursor: 'pointer',
                  color: colors.textSecondary,
                  fontSize: '1.15rem',
                }}
                aria-label={t('layout.close')}
              >
                ×
              </button>
            </div>

            <div style={{ display: 'grid', gap: '0.5rem' }}>
              {filteredMenuItems.map(item => {
                const isActive = location.pathname === item.path || Boolean(item.children?.some(child => location.pathname === child.path));
                return (
                  <button
                    key={item.path}
                    onClick={() => navigateAndClose(getMenuTargetPath(item))}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      padding: '0.72rem',
                      border: `1px solid ${isActive ? colors.teal : colors.border}`,
                      borderRadius: radii.lg,
                      background: isActive ? colors.tealSoft : colors.surface,
                      cursor: 'pointer',
                      fontSize: font.body,
                      fontWeight: isActive ? 700 : 600,
                      color: isActive ? colors.teal : colors.textPrimary,
                      textAlign: 'left',
                    }}
                  >
                    {renderIcon(item.icon, isActive)}
                    <span>{t(item.labelKey)}</span>
                  </button>
                );
              })}
            </div>

            <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: `1px solid ${colors.border}` }}>
              <button
                onClick={() => {
                  logout();
                  setShowFullscreenMenu(false);
                }}
                style={{
                  width: '100%',
                  padding: '0.72rem',
                  backgroundColor: colors.dangerSoft,
                  color: colors.danger,
                  border: `1px solid ${colors.dangerSoft}`,
                  borderRadius: radii.lg,
                  fontSize: font.body,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {t('layout.logout')}
              </button>
            </div>
          </div>
        </div>
      )}

      <header style={{
        background: 'rgba(255,255,255,0.94)',
        borderBottom: `1px solid ${colors.border}`,
        flexShrink: 0,
        boxShadow: '0 1px 0 rgba(15, 23, 42, 0.03)',
        backdropFilter: 'blur(12px)',
      }}>
        <div style={{ padding: '0 1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', height: '4.25rem', alignItems: 'center', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.9rem', minWidth: 0 }}>
              {!shouldHideSidebar && (
                <button
                  onClick={() => {
                    if (isNarrowViewport) {
                      setShowFullscreenMenu(true);
                    } else {
                      setSidebarCollapsed(!sidebarCollapsed);
                    }
                  }}
                  style={{
                    background: colors.surfaceMuted,
                    border: `1px solid ${colors.border}`,
                    color: colors.textPrimary,
                    fontSize: '1.05rem',
                    cursor: 'pointer',
                    width: '2.45rem',
                    height: '2.45rem',
                    borderRadius: radii.md,
                  }}
                  title={isNarrowViewport ? t('layout.openMenu') : sidebarCollapsed ? t('layout.expandMenu') : t('layout.collapseMenu')}
                >
                  {isNarrowViewport ? '☰' : sidebarCollapsed ? '→' : '←'}
                </button>
              )}
              <div style={{
                width: '2.55rem',
                height: '2.55rem',
                borderRadius: radii.lg,
                background: colors.surface,
                border: `1px solid ${colors.border}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                boxShadow: shadows.soft,
              }}>
                <img
                  src={logo}
                  alt="Restaurant POS Panda"
                  style={{ width: '82%', height: '82%', objectFit: 'contain', display: 'block' }}
                />
              </div>
              <div style={{ minWidth: 0 }}>
                <h1 style={{ fontSize: '1.08rem', fontWeight: 800, color: colors.textPrimary, margin: 0, letterSpacing: 0 }}>
                  Restaurant POS
                </h1>
                {user?.storeId && (
                  <div style={{ fontSize: font.caption, color: colors.textSecondary, marginTop: '0.2rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {user.storeName}
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
              {!isNarrowViewport && (
                <select
                  aria-label={t('language.label')}
                  value={language}
                  onChange={(event) => setLanguage(event.target.value as UiLanguage)}
                  style={{
                    height: '2.45rem',
                    padding: '0 0.55rem',
                    border: `1px solid ${colors.border}`,
                    borderRadius: radii.md,
                    background: colors.surface,
                    color: colors.textPrimary,
                    fontSize: font.caption,
                    fontWeight: 650,
                  }}
                >
                  <option value="zh-CN">中文</option>
                  <option value="es-NI">Español</option>
                </select>
              )}
              {user?.role === 'multi_store_manager' && user.assignedStores && user.assignedStores.length > 0 && (
                <select
                  aria-label={t('layout.selectStore')}
                  value={user.storeId || ''}
                  onChange={(event) => {
                    const target = user.assignedStores?.find(store => store.id === event.target.value);
                    if (!target || target.id === user.storeId) return;
                    try {
                      switchStore(target.id, target.name);
                      window.location.assign(location.pathname || '/manager');
                    } catch (error) {
                      alert(error instanceof Error ? error.message : t('layout.switchStoreError'));
                    }
                  }}
                  style={{
                    minWidth: isNarrowViewport ? '7.5rem' : '11rem',
                    maxWidth: isNarrowViewport ? '9rem' : '15rem',
                    height: '2.45rem',
                    padding: '0 0.65rem',
                    border: `1px solid ${colors.border}`,
                    borderRadius: radii.md,
                    background: colors.surface,
                    color: colors.textPrimary,
                    fontSize: font.caption,
                    fontWeight: 650,
                  }}
                >
                  {user.assignedStores.map(store => (
                    <option key={store.id} value={store.id}>{store.name}</option>
                  ))}
                </select>
              )}
              {user && (
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: font.body, fontWeight: 700, color: colors.textPrimary }}>{user.username}</div>
                  <div style={{ fontSize: font.caption, color: colors.textSecondary }}>
                    {roleLabelKey[user.role] ? t(roleLabelKey[user.role]) : user.role}
                  </div>
                </div>
              )}
              <button
                onClick={logout}
                style={{
                  padding: '0.55rem 0.82rem',
                  borderRadius: radii.md,
                  fontSize: font.body,
                  fontWeight: 650,
                  color: colors.danger,
                  cursor: 'pointer',
                  border: `1px solid ${colors.dangerSoft}`,
                  backgroundColor: '#fff7f7',
                }}
              >
                {t('layout.exit')}
              </button>
            </div>
          </div>
        </div>
      </header>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}>
        {!shouldUseFullscreenMenu && (
          <aside style={{
            width: sidebarCollapsed ? '4.6rem' : '17rem',
            backgroundColor: colors.surface,
            borderRight: `1px solid ${colors.border}`,
            transition: 'width 0.22s ease',
            overflow: 'hidden',
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
          }}>
            <nav style={{ marginTop: '0.85rem', padding: '0 0.7rem 1rem', flex: 1, overflowY: 'auto' }}>
              {filteredMenuItems.map(item => {
                const isActive = location.pathname === item.path ||
                  Boolean(item.children?.some(child => location.pathname === child.path));

                return (
                  <div key={item.path} style={{ marginBottom: '0.35rem' }}>
                    <button
                      onClick={() => navigate(getMenuTargetPath(item))}
                      title={sidebarCollapsed ? t(item.labelKey) : ''}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
                        gap: sidebarCollapsed ? 0 : '0.72rem',
                        padding: sidebarCollapsed ? '0.55rem' : '0.55rem 0.62rem',
                        fontSize: font.body,
                        fontWeight: isActive ? 750 : 650,
                        borderRadius: radii.lg,
                        width: '100%',
                        cursor: 'pointer',
                        border: `1px solid ${isActive ? colors.tealSoft : 'transparent'}`,
                        backgroundColor: isActive ? colors.tealSoft : 'transparent',
                        color: isActive ? colors.teal : colors.textPrimary,
                        transition: 'background-color 0.16s, color 0.16s',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {renderIcon(item.icon, isActive)}
                      {!sidebarCollapsed && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{t(item.labelKey)}</span>}
                    </button>

                    {!sidebarCollapsed && item.children && (
                      <div style={{ marginLeft: '2.55rem', marginTop: '0.3rem', display: 'grid', gap: '0.18rem' }}>
                        {item.children.map(child => {
                          const isChildActive = location.pathname === child.path;
                          return (
                            <button
                              key={child.path}
                              onClick={() => navigate(child.path)}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.42rem',
                                padding: '0.42rem 0.55rem',
                                fontSize: '0.83rem',
                                fontWeight: isChildActive ? 700 : 600,
                                borderRadius: radii.md,
                                width: '100%',
                                cursor: 'pointer',
                                border: 'none',
                                backgroundColor: isChildActive ? colors.blueSoft : 'transparent',
                                color: isChildActive ? colors.blue : colors.textSecondary,
                                textAlign: 'left',
                              }}
                            >
                              <span style={{ fontSize: '0.68rem', fontWeight: 800 }}>{child.icon}</span>
                              <span>{t(child.labelKey)}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </nav>
          </aside>
        )}

        <main style={{
          flex: 1,
          minHeight: 0,
          padding: shouldUseFullscreenMenu ? '0' : '1.2rem',
          maxWidth: shouldUseFullscreenMenu ? '100%' : undefined,
          width: shouldUseFullscreenMenu ? '100%' : undefined,
          overflowX: 'hidden',
          overflowY: shouldAllowPageScroll ? 'auto' : 'hidden',
          WebkitOverflowScrolling: shouldAllowPageScroll ? 'touch' : undefined,
          display: 'flex',
          flexDirection: 'column',
          background: shouldUseFullscreenMenu ? colors.surface : colors.page,
        }}>
          {children}
        </main>
      </div>
    </div>
  );
};

export default MainLayout;
