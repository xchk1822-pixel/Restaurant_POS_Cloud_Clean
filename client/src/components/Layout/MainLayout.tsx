import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { canAccessPermission } from '../../utils/permissions';
import { colors, font, radii, shadows } from '../../styles/uiTokens';

interface MainLayoutProps {
  children: React.ReactNode;
}

interface NavItem {
  path: string;
  icon: string;
  label: string;
  roles?: string[];
  children?: Array<{
    path: string;
    icon: string;
    label: string;
  }>;
}

const roleLabel: Record<string, string> = {
  super_admin: '超级管理员',
  store_manager: '店长',
  cashier: '收银',
  waiter: '服务生',
  chef: '厨师',
};

const menuItems: NavItem[] = [
  { path: '/dashboard', icon: 'DS', label: '老板仪表板', roles: ['super_admin'] },
  { path: '/pos', icon: 'POS', label: 'POS 收银', roles: ['store_manager', 'cashier'] },
  { path: '/waiter', icon: 'WT', label: '服务生点餐', roles: ['store_manager', 'waiter'] },
  { path: '/kitchen', icon: 'KDS', label: '厨房显示', roles: ['store_manager', 'chef'] },
  {
    path: '/inventory',
    icon: 'ST',
    label: '库存管理',
    roles: ['store_manager'],
    children: [
      { path: '/inventory', icon: 'IT', label: '物品管理' },
      { path: '/inventory/menu', icon: 'MN', label: '菜品管理' },
      { path: '/inventory/warehouse', icon: 'WH', label: '仓库盘点' },
      { path: '/inventory/fridge', icon: 'FR', label: '冰箱盘点' },
      { path: '/inventory/suppliers', icon: 'SP', label: '供应商管理' },
    ],
  },
  {
    path: '/employees',
    icon: 'HR',
    label: '员工管理',
    roles: ['store_manager'],
    children: [
      { path: '/employees', icon: 'EP', label: '员工档案' },
      { path: '/employees/attendance', icon: 'AT', label: '考勤管理' },
      { path: '/employees/loans', icon: 'LN', label: '借款管理' },
      { path: '/employees/salary', icon: 'PY', label: '工资结算' },
    ],
  },
  {
    path: '/manager',
    icon: 'MG',
    label: '店长管理',
    roles: ['store_manager'],
    children: [
      { path: '/manager/expense-records', icon: 'EX', label: '开支记录' },
      { path: '/manager/shift-handover', icon: 'SH', label: '交班对账' },
      { path: '/manager/order-history', icon: 'OH', label: '历史订单' },
      { path: '/manager/financial-reports', icon: 'FR', label: '财务报表' },
      { path: '/manager', icon: 'DA', label: '数据概览' },
      { path: '/manager/customers', icon: 'CU', label: '客户管理' },
    ],
  },
  {
    path: '/settings',
    icon: 'SE',
    label: '系统设置',
    roles: ['super_admin'],
    children: [
      { path: '/settings/stores', icon: 'BR', label: '分店管理' },
      { path: '/settings/exchange-rate', icon: 'FX', label: '汇率设置' },
      { path: '/settings/permissions', icon: 'PM', label: '权限管理' },
      { path: '/settings/backup', icon: 'BK', label: '数据备份' },
    ],
  },
];

const MainLayout: React.FC<MainLayoutProps> = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
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

  const filteredMenuItems = user ? menuItems.filter(item => {
    const permissionId = item.path === '/settings'
      ? 'settings'
      : item.path === '/inventory'
        ? 'inventory:items'
        : item.path === '/employees'
          ? 'employees:profile'
          : item.path === '/manager'
            ? 'manager:overview'
            : item.path.replace('/', '').replace('/', ':');
    return canAccessPermission(user.role, permissionId);
  }) : [];

  const shouldHideSidebar = location.pathname === '/pos' || location.pathname === '/kitchen' || location.pathname === '/waiter';
  const shouldUseFullscreenMenu = shouldHideSidebar || isNarrowViewport;

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
    navigate(path);
    setShowFullscreenMenu(false);
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
            zIndex: 1000,
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
          title="切换功能菜单"
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
            zIndex: 999,
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
                <h2 style={{ margin: 0, fontSize: '1.05rem', color: colors.textPrimary }}>功能菜单</h2>
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
                aria-label="关闭"
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
                    onClick={() => navigateAndClose(item.path)}
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
                    <span>{item.label}</span>
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
                退出登录
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
                  title={isNarrowViewport ? '打开菜单' : sidebarCollapsed ? '展开菜单' : '收起菜单'}
                >
                  {isNarrowViewport ? '☰' : sidebarCollapsed ? '→' : '←'}
                </button>
              )}
              <div style={{
                width: '2.55rem',
                height: '2.55rem',
                borderRadius: radii.lg,
                background: `linear-gradient(135deg, ${colors.teal}, ${colors.blue})`,
                color: colors.surface,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 800,
                fontSize: '0.8rem',
                flexShrink: 0,
              }}>
                POS
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
              {user && (
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: font.body, fontWeight: 700, color: colors.textPrimary }}>{user.username}</div>
                  <div style={{ fontSize: font.caption, color: colors.textSecondary }}>
                    {roleLabel[user.role] || user.role}
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
                退出
              </button>
            </div>
          </div>
        </div>
      </header>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
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
                      onClick={() => navigate(item.path)}
                      title={sidebarCollapsed ? item.label : ''}
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
                      {!sidebarCollapsed && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.label}</span>}
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
                              <span>{child.label}</span>
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
          padding: shouldUseFullscreenMenu ? '0' : '1.2rem',
          maxWidth: shouldUseFullscreenMenu ? '100%' : undefined,
          width: shouldUseFullscreenMenu ? '100%' : undefined,
          overflow: 'hidden',
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
