import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login/Login';
import OwnerDashboard from './pages/Dashboard/OwnerDashboard';
import POS from './pages/POS/POS';
import Kitchen from './pages/Kitchen/Kitchen';
import WaiterInterface from './pages/WaiterInterface/WaiterInterface';
import Inventory from './pages/Inventory/Inventory';
import MenuManagement from './pages/Inventory/MenuManagement';
import FridgeStocktake from './pages/Inventory/FridgeStocktake';
import WarehouseStocktake from './pages/Inventory/WarehouseStocktake';
import SupplierManagement from './pages/Inventory/SupplierManagement';
import Employees from './pages/Employees/Employees';
import ManagerOverview from './pages/Manager/ManagerOverview';
import ShiftHandoverPage from './pages/Manager/ShiftHandoverPage';
import ExpenseRecordsPage from './pages/Manager/ExpenseRecordsPage';
import OrderHistoryPage from './pages/Manager/OrderHistoryPage';
import FinancialReportsPage from './pages/Manager/FinancialReportsPage';
import ManagerCustomers from './pages/Manager/ManagerCustomers';
import Stores from './pages/Manager/Stores';
import ExchangeRateSettings from './pages/Manager/ExchangeRateSettings';
import PermissionsModule from './pages/Settings/PermissionsModule';
import DataBackup from './pages/Settings/DataBackup';
import MainLayout from './components/Layout/MainLayout';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { AppProvider } from './contexts/AppContext';
import { canAccessPermission, getDefaultPathForRole } from './utils/permissions';

const ProtectedRoute: React.FC<{ children: React.ReactNode; permissionId?: string }> = ({ children, permissionId }) => {
  const { user, isAuthenticated, isLoading } = useAuth();
  
  // 🔥 加载中显示 loading，不跳转
  if (isLoading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(to bottom right, #3b82f6, #9333ea)'
      }}>
        <div style={{
          padding: '2rem',
          backgroundColor: 'white',
          borderRadius: '0.75rem',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>⏳</div>
          <div style={{ fontSize: '1.125rem', fontWeight: '600', color: '#374151' }}>加载中...</div>
          <div style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.5rem' }}>正在恢复会话</div>
        </div>
      </div>
    );
  }
  
  if (!isAuthenticated) {
    // ✅ 保存当前URL，登录后返回
    const currentPath = window.location.pathname + window.location.search;
    console.warn('⚠️ 未认证，跳转到登录页面，之后将返回:', currentPath);
    return <Navigate to={`/login?redirect=${encodeURIComponent(currentPath)}`} replace />;
  }

  if (user && !canAccessPermission(user.role, permissionId)) {
    console.warn('⚠️ 权限不足，拒绝访问:', permissionId, 'role:', user.role);
    return <Navigate to={getDefaultPathForRole(user.role)} replace />;
  }

  return <MainLayout>{children}</MainLayout>;
};

function App() {
  return (
    <AuthProvider>
      <AppProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            {/* 🔥 老板全局仪表板 - 使用真实 Firestore 数据 */}
            <Route path="/dashboard" element={<ProtectedRoute permissionId="dashboard"><OwnerDashboard /></ProtectedRoute>} />
            <Route path="/pos" element={<ProtectedRoute permissionId="pos"><POS /></ProtectedRoute>} />
            <Route path="/kitchen" element={<ProtectedRoute permissionId="kitchen"><Kitchen /></ProtectedRoute>} />
            <Route path="/waiter" element={<ProtectedRoute permissionId="waiter"><WaiterInterface /></ProtectedRoute>} />
            <Route path="/inventory" element={<ProtectedRoute permissionId="inventory:items"><Inventory /></ProtectedRoute>} />
            <Route path="/inventory/menu" element={<ProtectedRoute permissionId="inventory:menu"><MenuManagement /></ProtectedRoute>} />
            <Route path="/inventory/fridge" element={<ProtectedRoute permissionId="inventory:fridge"><FridgeStocktake /></ProtectedRoute>} />
            <Route path="/inventory/warehouse" element={<ProtectedRoute permissionId="inventory:warehouse"><WarehouseStocktake /></ProtectedRoute>} />
            <Route path="/inventory/suppliers" element={<ProtectedRoute permissionId="inventory:suppliers"><SupplierManagement /></ProtectedRoute>} />
            <Route path="/employees" element={<ProtectedRoute permissionId="employees:profile"><Employees /></ProtectedRoute>} />
            <Route path="/employees/attendance" element={<ProtectedRoute permissionId="employees:attendance"><Employees /></ProtectedRoute>} />
            <Route path="/employees/loans" element={<ProtectedRoute permissionId="employees:loans"><Employees /></ProtectedRoute>} />
            <Route path="/employees/salary" element={<ProtectedRoute permissionId="employees:salary"><Employees /></ProtectedRoute>} />
            <Route path="/manager" element={<ProtectedRoute permissionId="manager:overview"><ManagerOverview /></ProtectedRoute>} />
            <Route path="/manager/expense-records" element={<ProtectedRoute permissionId="manager:expenses"><ExpenseRecordsPage /></ProtectedRoute>} />
            <Route path="/manager/shift-handover" element={<ProtectedRoute permissionId="manager:handover"><ShiftHandoverPage /></ProtectedRoute>} />
            <Route path="/manager/order-history" element={<ProtectedRoute permissionId="manager:orders"><OrderHistoryPage /></ProtectedRoute>} />
            <Route path="/manager/financial-reports" element={<ProtectedRoute permissionId="manager:reports"><FinancialReportsPage /></ProtectedRoute>} />
            <Route path="/manager/customers" element={<ProtectedRoute permissionId="manager:customers"><ManagerCustomers /></ProtectedRoute>} />
            {/* 系统设置 */}
            <Route path="/settings/stores" element={<ProtectedRoute permissionId="settings:stores"><Stores /></ProtectedRoute>} />
            <Route path="/settings/exchange-rate" element={<ProtectedRoute permissionId="settings:exchange"><ExchangeRateSettings /></ProtectedRoute>} />
            <Route path="/settings/permissions" element={<ProtectedRoute permissionId="settings:permissions"><PermissionsModule /></ProtectedRoute>} />
            <Route path="/settings/backup" element={<ProtectedRoute permissionId="settings:backup"><DataBackup /></ProtectedRoute>} />
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </BrowserRouter>
      </AppProvider>
    </AuthProvider>
  );
}

export default App;
