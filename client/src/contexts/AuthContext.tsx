import React, { createContext, useContext, useState, useEffect } from 'react';
import { onAuthStateChange } from '../services/FirebaseAuthService';
import { dataService } from '../services/DataService';

export type UserRole = 'super_admin' | 'store_manager' | 'cashier' | 'waiter' | 'chef';

export interface User {
  id: string;
  username: string;
  name: string;
  role: UserRole;
  storeId?: string; // 超级管理员为空，其他有分店ID
  storeName?: string;
  avatar?: string;
}

interface AuthContextType {
  user: User | null;
  login: (user: User) => void;
  logout: () => void;
  switchStore: (storeId: string, storeName: string) => void;
  isAuthenticated: boolean;
  isLoading: boolean; // 🔥 添加加载状态
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true); // 🔥 添加加载状态

  // 🔥 监听 Firebase Auth 状态变化
  useEffect(() => {
    const unsubscribe = onAuthStateChange(async (firebaseUser) => {
      if (firebaseUser) {
        // 从 localStorage 恢复完整的用户信息（包含 role, storeId 等）
        try {
          const savedUser = localStorage.getItem('current_user');
          if (savedUser) {
            const parsed = JSON.parse(savedUser);
            setUser(parsed);
            setIsLoading(false);
            
            // 云端同步放到后台执行，避免阻塞路由恢复导致页面一直停在 loading。
            const syncTask = parsed.storeId
              ? dataService.syncStoreData(parsed.storeId)
              : dataService.syncGlobalDataForAdmin();
            syncTask.catch((error) => {
              console.error('❌ 后台同步用户数据失败:', error);
            });
          }
        } catch (error) {
          console.error('❌ 恢复用户信息失败:', error);
          localStorage.removeItem('current_user');
        }
      } else {
        setUser(null);
      }
      setIsLoading(false);
    });
    
    return () => unsubscribe();
  }, []);

  const login = async (userData: User) => {
    setUser(userData);
    setIsLoading(false);
    localStorage.setItem('current_user', JSON.stringify(userData));
    
    window.dispatchEvent(new Event('userLoggedIn'));
  };

  const logout = async () => {
    setUser(null);
    localStorage.removeItem('current_user');
    
    // 🔥 调用 Firebase Auth 登出
    try {
      const { firebaseLogout } = await import('../services/FirebaseAuthService');
      await firebaseLogout();
    } catch (error) {
      console.error('❌ Firebase Auth 登出失败:', error);
    }
  };

  const switchStore = (storeId: string, storeName: string) => {
    if (user) {
      const updatedUser = { ...user, storeId, storeName };
      setUser(updatedUser);
      localStorage.setItem('current_user', JSON.stringify(updatedUser));
    }
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      login, 
      logout, 
      switchStore,
      isAuthenticated: !!user,
      isLoading // 🔥 暴露加载状态
    }}>
      {children}
    </AuthContext.Provider>
  );
};
