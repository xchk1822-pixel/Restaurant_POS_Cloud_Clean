import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { dataService } from '../../services/DataService';
import { canAccessPermission } from '../../utils/permissions';

interface MainLayoutProps {
  children: React.ReactNode;
}

const MainLayout: React.FC<MainLayoutProps> = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // 🔥 用户登录后，自动迁移数据到分店专属路径
  useEffect(() => {
    if (user) {
      console.log('🔄 检测到用户登录，开始数据迁移...');
      dataService.migrateGlobalDataToStore();
    }
  }, [user]);

  const menuItems = [
    { path: '/dashboard', icon: '📊', label: '老板仪表板', roles: ['super_admin'] },
    { path: '/pos', icon: '💰', label: 'POS收银', roles: ['store_manager', 'cashier'] },
    { path: '/waiter', icon: '🍽️', label: '服务生点餐', roles: ['store_manager', 'waiter'] },
    { path: '/kitchen', icon: '👨‍🍳', label: '厨房显示', roles: ['store_manager', 'chef'] },
    { 
      path: '/inventory', 
      icon: '📦', 
      label: '库存管理', 
      roles: ['store_manager'],
      children: [
        { path: '/inventory', icon: '📋', label: '物品管理' },
        { path: '/inventory/menu', icon: '🍽️', label: '菜品管理' },
        { path: '/inventory/warehouse', icon: '🏪', label: '仓库盘点' },
        { path: '/inventory/fridge', icon: '🧊', label: '冰箱盘点' },
        { path: '/inventory/suppliers', icon: '👥', label: '供应商管理' }
      ]
    },
    { 
      path: '/employees', 
      icon: '👥', 
      label: '员工管理', 
      roles: ['store_manager'],
      children: [
        { path: '/employees', icon: '👤', label: '员工档案' },
        { path: '/employees/attendance', icon: '📅', label: '考勤管理' },
        { path: '/employees/loans', icon: '💸', label: '借款管理' },
        { path: '/employees/salary', icon: '💰', label: '薪资结算' }
      ]
    },
    { 
      path: '/manager', 
      icon: '🏢', 
      label: '店长管理', 
      roles: ['store_manager'],
      children: [
        { path: '/manager/expense-records', icon: '💸', label: '开支记录' },
        { path: '/manager/shift-handover', icon: '🔄', label: '交班对账' },
        { path: '/manager/order-history', icon: '📋', label: '历史订单' },
        { path: '/manager/financial-reports', icon: '📈', label: '财务报表' },
        { path: '/manager', icon: '📊', label: '数据概览' },
        { path: '/manager/customers', icon: '🤝', label: '客户管理' }
      ]
    },
    { 
      path: '/settings', 
      icon: '⚙️', 
      label: '系统设置', 
      roles: ['super_admin'],
      children: [
        { path: '/settings/stores', icon: '🏪', label: '分店管理' },
        { path: '/settings/exchange-rate', icon: '💱', label: '汇率设置' },
        { path: '/settings/permissions', icon: '🔐', label: '权限管理' },
        { path: '/settings/data-sync', icon: '🔄', label: '数据同步' },
        // 未来扩展
        // { path: '/settings/notifications', icon: '🔔', label: '通知设置' },
        // { path: '/settings/print', icon: '🖨️', label: '打印设置' },
        // { path: '/settings/language', icon: '🌐', label: '语言设置' },
        // { path: '/settings/mobile', icon: '📱', label: '移动端设置' },
        // { path: '/settings/security', icon: '🔐', label: '安全设置' }
      ]
    }
  ];

  // 🔥 根据用户角色和权限配置过滤菜单
  const filteredMenuItems = user ? menuItems.filter(item => {
    // 获取当前角色的权限列表
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

  // 判断是否应该隐藏侧边栏
  const shouldHideSidebar = location.pathname === '/pos' || location.pathname === '/kitchen' || location.pathname === '/waiter';
  
  // 🔥 全屏模式下的导航切换状态
  const [showFullscreenMenu, setShowFullscreenMenu] = useState(false);

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* 🔥 全屏模式下的浮动菜单按钮 */}
      {shouldHideSidebar && (
        <button
          onClick={() => setShowFullscreenMenu(!showFullscreenMenu)}
          style={{
            position: 'fixed',
            top: '1rem',
            left: '1rem',
            zIndex: 1000,
            width: '3rem',
            height: '3rem',
            borderRadius: '50%',
            backgroundColor: 'rgba(59, 130, 246, 0.9)',
            color: 'white',
            border: 'none',
            fontSize: '1.5rem',
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(59, 130, 246, 1)';
            e.currentTarget.style.transform = 'scale(1.1)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(59, 130, 246, 0.9)';
            e.currentTarget.style.transform = 'scale(1)';
          }}
          title="切换功能菜单"
        >
          ☰
        </button>
      )}

      {/* 🔥 全屏模式下的菜单面板 */}
      {shouldHideSidebar && showFullscreenMenu && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            zIndex: 999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onClick={() => setShowFullscreenMenu(false)}
        >
          <div
            style={{
              background: 'white',
              borderRadius: '1rem',
              padding: '1.5rem',
              maxWidth: '400px',
              width: '90%',
              maxHeight: '80vh',
              overflowY: 'auto',
              boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h2 style={{ margin: 0, fontSize: '1.25rem', color: '#1f2937' }}>📋 功能菜单</h2>
              <button
                onClick={() => setShowFullscreenMenu(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '1.5rem',
                  cursor: 'pointer',
                  color: '#6b7280',
                }}
              >
                ✕
              </button>
            </div>
            
            <div style={{ display: 'grid', gap: '0.5rem' }}>
              {filteredMenuItems.map((item) => (
                <button
                  key={item.path}
                  onClick={() => {
                    navigate(item.path);
                    setShowFullscreenMenu(false);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    padding: '0.75rem 1rem',
                    border: '1px solid #e5e7eb',
                    borderRadius: '0.5rem',
                    background: location.pathname === item.path ? '#eff6ff' : 'white',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                    fontWeight: location.pathname === item.path ? '600' : '500',
                    color: location.pathname === item.path ? '#2563eb' : '#374151',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    if (location.pathname !== item.path) {
                      e.currentTarget.style.backgroundColor = '#f9fafb';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (location.pathname !== item.path) {
                      e.currentTarget.style.backgroundColor = 'white';
                    }
                  }}
                >
                  <span style={{ fontSize: '1.25rem' }}>{item.icon}</span>
                  <span>{item.label}</span>
                </button>
              ))}
            </div>

            <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #e5e7eb' }}>
              <button
                onClick={() => {
                  logout();
                  setShowFullscreenMenu(false);
                }}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  backgroundColor: '#fee2e2',
                  color: '#dc2626',
                  border: 'none',
                  borderRadius: '0.5rem',
                  fontSize: '0.875rem',
                  fontWeight: '600',
                  cursor: 'pointer',
                }}
              >
                🚪 退出登录
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 顶部导航栏 */}
      <header style={{ 
        backgroundColor: 'white', 
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        flexShrink: 0
      }}>
        <div style={{ maxWidth: '80rem', margin: '0 auto', padding: '0 1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', height: '4rem', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              {!shouldHideSidebar && (
                <button
                  onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                  style={{
                    background: 'none',
                    border: 'none',
                    fontSize: '1.5rem',
                    cursor: 'pointer',
                    padding: '0.25rem',
                    borderRadius: '0.375rem',
                    transition: 'background-color 0.2s',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f3f4f6'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  title={sidebarCollapsed ? '展开菜单' : '折叠菜单'}
                >
                  {sidebarCollapsed ? '☰' : '✕'}
                </button>
              )}
              <div>
                <h1 style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#111827', margin: 0 }}>🍽️ Restaurant POS</h1>
                {user?.storeId && (
                  <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                    📍 {user.storeName}
                  </div>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              {user && (
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '0.875rem', fontWeight: '600', color: '#111827' }}>{user.username}</div>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                    {user.role === 'super_admin' ? '👑 超级管理员' : 
                     user.role === 'store_manager' ? '🏢 店长' :
                     user.role === 'cashier' ? '💰 收银员' :
                     user.role === 'waiter' ? '🍽️ 服务生' : '👨‍🍳 厨师'}
                  </div>
                </div>
              )}
              <button
                onClick={logout}
                style={{
                  padding: '0.5rem 0.75rem',
                  borderRadius: '0.375rem',
                  fontSize: '0.875rem',
                  fontWeight: '500',
                  color: '#dc2626',
                  cursor: 'pointer',
                  border: 'none',
                  backgroundColor: 'transparent'
                }}
              >
                退出登录
              </button>
            </div>
          </div>
        </div>
      </header>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* 侧边栏 - 根据页面类型显示/隐藏 */}
        {!shouldHideSidebar && (
          <aside style={{ 
            width: sidebarCollapsed ? '4rem' : '16rem', 
            backgroundColor: 'white', 
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            transition: 'width 0.3s ease',
            overflow: 'hidden',
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column'
          }}>
            <nav style={{ marginTop: '1.25rem', padding: '0 0.5rem', flex: 1, overflowY: 'auto' }}>
              {filteredMenuItems.map((item) => {
                const isActive = location.pathname === item.path || 
                  (item.children && item.children.some(child => location.pathname === child.path));
                
                return (
                  <div key={item.path}>
                    <button
                      onClick={() => navigate(item.path)}
                      title={sidebarCollapsed ? item.label : ''}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
                        padding: sidebarCollapsed ? '0.75rem' : '0.5rem',
                        fontSize: '1rem',
                        fontWeight: '500',
                        borderRadius: '0.375rem',
                        width: '100%',
                        marginBottom: item.children ? '0.25rem' : '0.25rem',
                        cursor: 'pointer',
                        border: 'none',
                        backgroundColor: isActive ? '#eff6ff' : 'transparent',
                        color: isActive ? '#2563eb' : '#4b5563',
                        transition: 'all 0.2s',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      <span style={{ fontSize: '1.25rem', minWidth: sidebarCollapsed ? 'auto' : '2rem' }}>{item.icon}</span>
                      {!sidebarCollapsed && <span style={{ marginLeft: '0.5rem' }}>{item.label}</span>}
                    </button>
                    
                    {/* 子菜单 */}
                    {!sidebarCollapsed && item.children && (
                      <div style={{ marginLeft: '2.5rem', marginTop: '0.25rem' }}>
                        {item.children.map(child => {
                          const isChildActive = location.pathname === child.path;
                          return (
                            <button
                              key={child.path}
                              onClick={() => navigate(child.path)}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                padding: '0.4rem 0.75rem',
                                fontSize: '0.9rem',
                                fontWeight: '500',
                                borderRadius: '0.375rem',
                                width: '100%',
                                marginBottom: '0.25rem',
                                cursor: 'pointer',
                                border: 'none',
                                backgroundColor: isChildActive ? '#dbeafe' : 'transparent',
                                color: isChildActive ? '#2563eb' : '#6b7280',
                                transition: 'all 0.2s',
                                whiteSpace: 'nowrap'
                              }}
                            >
                              <span style={{ fontSize: '1rem', marginRight: '0.5rem' }}>{child.icon}</span>
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

        {/* 主内容区 */}
        <main style={{ 
          flex: 1, 
          padding: shouldHideSidebar ? '0' : '1.5rem',
          maxWidth: shouldHideSidebar ? '100%' : undefined,
          width: shouldHideSidebar ? '100%' : undefined,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}>
          {children}
        </main>
      </div>
    </div>
  );
};

export default MainLayout;
