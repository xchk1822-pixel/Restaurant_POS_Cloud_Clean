import React, { createContext, useContext, useState, useEffect } from 'react';
import { onAuthStateChange, getFirebaseUserProfile } from '../services/FirebaseAuthService';
import { dataService } from '../services/DataService';
import { clearAuthenticatedSession, persistAuthenticatedSession } from '../utils/storeSessionIsolation';

export type UserRole = 'super_admin' | 'store_manager' | 'cashier' | 'waiter' | 'chef';

export interface User {
  id: string;
  username: string;
  name: string;
  role: UserRole;
  storeId?: string;
  storeName?: string;
  avatar?: string;
  status?: 'active' | 'inactive';
}

interface AuthContextType {
  user: User | null;
  login: (user: User) => void;
  logout: () => void;
  switchStore: (storeId: string, storeName: string) => void;
  isAuthenticated: boolean;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false;

const syncUserDataInBackground = (userData: User) => {
  const syncTask = userData.storeId
    ? dataService.syncStoreData(userData.storeId)
    : dataService.syncGlobalDataForAdmin();

  syncTask.catch((error) => {
    console.error('Background user data sync failed:', error);
  });
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChange(async (firebaseUser) => {
      if (firebaseUser) {
        try {
          const verifiedUser = await getFirebaseUserProfile(firebaseUser);
          setUser(verifiedUser);
          persistAuthenticatedSession(verifiedUser);
          syncUserDataInBackground(verifiedUser);
        } catch (error) {
          console.error('Firebase user profile verification failed:', error);

          if (isOffline()) {
            const savedUser = localStorage.getItem('current_user');
            if (savedUser) {
              const parsed = JSON.parse(savedUser);
              setUser(parsed);
              syncUserDataInBackground(parsed);
            } else {
              setUser(null);
            }
          } else {
            clearAuthenticatedSession();
            setUser(null);
          }
        } finally {
          setIsLoading(false);
        }
        return;
      }

      if (isOffline()) {
        const savedUser = localStorage.getItem('current_user');
        if (savedUser) {
          setUser(JSON.parse(savedUser));
        } else {
          setUser(null);
        }
      } else {
        clearAuthenticatedSession();
        setUser(null);
      }
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const login = async (userData: User) => {
    setUser(userData);
    setIsLoading(false);
    persistAuthenticatedSession(userData);

    window.dispatchEvent(new Event('userLoggedIn'));
  };

  const logout = async () => {
    setUser(null);
    clearAuthenticatedSession();

    try {
      const { firebaseLogout } = await import('../services/FirebaseAuthService');
      await firebaseLogout();
    } catch (error) {
      console.error('Firebase Auth logout failed:', error);
    }
  };

  const switchStore = (storeId: string, storeName: string) => {
    if (user) {
      const updatedUser = { ...user, storeId, storeName };
      setUser(updatedUser);
      persistAuthenticatedSession(updatedUser);
    }
  };

  return (
    <AuthContext.Provider value={{
      user,
      login,
      logout,
      switchStore,
      isAuthenticated: !!user,
      isLoading
    }}>
      {children}
    </AuthContext.Provider>
  );
};
