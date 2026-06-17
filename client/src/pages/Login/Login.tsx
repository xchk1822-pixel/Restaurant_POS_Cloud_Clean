import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { firebaseLogin, createFirebaseUser } from '../../services/FirebaseAuthService';

const Login: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  // ✅ 获取重定向 URL
  const redirectUrl = searchParams.get('redirect') || '';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      let appUser;
      
      // 🔥 首先尝试 Firebase Auth 登录
      try {
        appUser = await firebaseLogin(username, password);
      } catch (firebaseError: any) {
        if (process.env.REACT_APP_ENABLE_LOCAL_LOGIN_FALLBACK !== 'true') {
          throw firebaseError;
        }
        console.warn('⚠️ Firebase Auth 登录失败，尝试本地验证:', firebaseError.message);
        
        // 🔥 Fallback：尝试旧的本地验证方式
        const localUser = await tryLocalLogin(username, password);
        if (localUser) {
          appUser = localUser;
        } else {
          throw firebaseError; // 重新抛出 Firebase 错误
        }
      }
      
      // 构建登录用户对象
      const loggedInUser = {
        id: appUser.id,
        username: appUser.username,
        name: appUser.name,
        role: appUser.role,
        storeId: appUser.storeId,
        storeName: appUser.storeName,
      };

      // 执行登录（更新 AuthContext）
      login(loggedInUser);

      // ✅ 如果有 redirect 参数，跳转到之前的页面
      if (redirectUrl) {
        navigate(redirectUrl);
      } else {
        // 根据角色跳转到不同页面
        switch (appUser.role) {
          case 'super_admin':
            navigate('/dashboard');
            break;
          case 'store_manager':
            navigate('/manager');
            break;
          case 'cashier':
            navigate('/pos');
            break;
          case 'waiter':
            navigate('/waiter');
            break;
          case 'chef':
            navigate('/kitchen');
            break;
          default:
            navigate('/dashboard');
        }
      }
    } catch (err: any) {
      console.error('❌ 登录失败:', err);
      setError(err.message || '❌ 登录失败，请重试');
    } finally {
      setIsLoading(false);
    }
  };

  // 🔥 本地验证 Fallback（仅用于过渡期）
  const tryLocalLogin = async (username: string, password: string): Promise<any | null> => {
    try {
      const usersStr = localStorage.getItem('users');
      if (!usersStr) {
        console.warn('⚠️ localStorage 中没有用户数据');
        return null;
      }
      
      const users = JSON.parse(usersStr);
      const user = users.find((u: any) => 
        u.username === username && 
        u.password === password && 
        u.status !== 'inactive'
      );
      
      if (!user) {
        console.warn('⚠️ 本地验证失败：用户不存在或密码错误');
        return null;
      }
      
      // 自动迁移用户到 Firebase Auth
      try {
        const migratedUser = await createFirebaseUser(
          user.username,
          user.password,
          {
            username: user.username,
            name: user.name,
            role: user.role,
            storeId: user.storeId,
            storeName: user.storeName
          }
        );
        return migratedUser;
      } catch (migrateError: any) {
        console.error('❌ 自动迁移失败:', migrateError.message);
        // 迁移失败但仍允许本地登录
        return {
          id: user.id,
          username: user.username,
          name: user.name,
          role: user.role,
          storeId: user.storeId,
          storeName: user.storeName
        };
      }
    } catch (error) {
      console.error('❌ 本地验证异常:', error);
      return null;
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(to bottom right, #3b82f6, #9333ea)'
    }}>
      <div style={{
        maxWidth: '28rem',
        width: '100%',
        padding: '2.5rem',
        backgroundColor: 'white',
        borderRadius: '0.75rem',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
      }}>
        <div style={{ textAlign: 'center' }}>
          <h2 style={{ fontSize: '1.875rem', fontWeight: '800', color: '#111827' }}>
            🍽️ Restaurant POS
          </h2>
          <p style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: '#4b5563' }}>
            连锁餐厅管理系统
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ marginTop: '2rem' }}>
          {/* 错误提示 */}
          {error && (
            <div style={{
              marginBottom: '1rem',
              padding: '0.75rem',
              backgroundColor: '#fee2e2',
              border: '1px solid #fecaca',
              borderRadius: '0.375rem',
              color: '#dc2626',
              fontSize: '0.875rem'
            }}>
              {error}
            </div>
          )}

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151', marginBottom: '0.5rem' }}>
              用户名
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="例如：cashier_mn001_01"
              required
              style={{
                width: '100%',
                padding: '0.5rem 0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '0.375rem',
                outline: 'none',
                fontSize: '0.875rem'
              }}
            />
          </div>
          
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151', marginBottom: '0.5rem' }}>
              密码
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="请输入密码"
              required
              style={{
                width: '100%',
                padding: '0.5rem 0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '0.375rem',
                outline: 'none',
                fontSize: '0.875rem'
              }}
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            style={{
              width: '100%',
              padding: '0.75rem 1rem',
              backgroundColor: isLoading ? '#9ca3af' : '#2563eb',
              color: 'white',
              borderRadius: '0.375rem',
              fontWeight: '600',
              fontSize: '1rem',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              border: 'none',
              transition: 'background-color 0.2s'
            }}
          >
            {isLoading ? '登录中...' : '登录系统'}
          </button>

          <div style={{ marginTop: '1rem', padding: '1rem', background: '#f3f4f6', borderRadius: '0.5rem', fontSize: '0.75rem', color: '#6b7280' }}>
            <div style={{ fontWeight: '600', marginBottom: '0.5rem' }}>💡 提示：</div>
            <div>• 用户名格式：{`{角色}_{分店代码}_{序号}`}</div>
            <div>• 示例：cashier_mn001_01（马那瓜总店-收银员01）</div>
            <div style={{ marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid #e5e7eb' }}>
              <strong>📝 如何获取账号：</strong><br/>
              1. 使用超级管理员登录（admin / admin123）<br/>
              2. 进入「系统设置」→「分店管理」<br/>
              3. 创建分店时设置账号信息<br/>
              4. 或使用「添加账号」功能创建
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Login;
