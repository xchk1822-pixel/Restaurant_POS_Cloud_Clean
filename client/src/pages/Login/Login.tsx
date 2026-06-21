import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { firebaseLogin, createFirebaseUser } from '../../services/FirebaseAuthService';
import { colors, font, radii, shadows } from '../../styles/uiTokens';

const Login: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const redirectUrl = searchParams.get('redirect') || '';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      let appUser;

      try {
        appUser = await firebaseLogin(username, password);
      } catch (firebaseError: any) {
        if (process.env.REACT_APP_ENABLE_LOCAL_LOGIN_FALLBACK !== 'true') {
          throw firebaseError;
        }
        console.warn('Firebase Auth 登录失败，尝试本地验证', firebaseError.message);

        const localUser = await tryLocalLogin(username, password);
        if (localUser) {
          appUser = localUser;
        } else {
          throw firebaseError;
        }
      }

      const loggedInUser = {
        id: appUser.id,
        username: appUser.username,
        name: appUser.name,
        role: appUser.role,
        storeId: appUser.storeId,
        storeName: appUser.storeName,
      };

      login(loggedInUser);

      if (redirectUrl) {
        navigate(redirectUrl);
      } else {
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
      console.error('登录失败:', err);
      setError(err.message || '登录失败，请重试');
    } finally {
      setIsLoading(false);
    }
  };

  const tryLocalLogin = async (username: string, password: string): Promise<any | null> => {
    try {
      const usersStr = localStorage.getItem('users');
      if (!usersStr) {
        console.warn('localStorage 中没有用户数据');
        return null;
      }

      const users = JSON.parse(usersStr);
      const user = users.find((u: any) =>
        u.username === username &&
        u.password === password &&
        u.status !== 'inactive'
      );

      if (!user) {
        console.warn('本地验证失败：用户不存在或密码错误');
        return null;
      }

      try {
        const migratedUser = await createFirebaseUser(
          user.username,
          user.password,
          {
            username: user.username,
            name: user.name,
            role: user.role,
            storeId: user.storeId,
            storeName: user.storeName,
          }
        );
        return migratedUser;
      } catch (migrateError: any) {
        console.error('自动迁移失败:', migrateError.message);
        return {
          id: user.id,
          username: user.username,
          name: user.name,
          role: user.role,
          storeId: user.storeId,
          storeName: user.storeName,
        };
      }
    } catch (error) {
      console.error('本地验证异常:', error);
      return null;
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 360px), 1fr))',
      background: colors.page,
      fontFamily: font.family,
      color: colors.textPrimary,
    }}>
      <section style={{
        position: 'relative',
        padding: '3rem',
        background: `linear-gradient(135deg, ${colors.teal} 0%, #12343b 55%, ${colors.blue} 100%)`,
        color: colors.surface,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute',
          inset: 'auto -8rem -10rem auto',
          width: '28rem',
          height: '28rem',
          borderRadius: '50%',
          background: 'rgba(255,255,255,0.12)',
        }} />
        <div style={{
          position: 'absolute',
          left: '3rem',
          bottom: '9rem',
          width: '12rem',
          height: '12rem',
          borderRadius: '2rem',
          border: '1px solid rgba(255,255,255,0.18)',
          transform: 'rotate(12deg)',
        }} />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{
            width: '3.4rem',
            height: '3.4rem',
            borderRadius: '1rem',
            background: 'rgba(255,255,255,0.16)',
            border: '1px solid rgba(255,255,255,0.25)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 800,
            marginBottom: '1.5rem',
          }}>
            POS
          </div>
          <h1 style={{ margin: 0, fontSize: '2.4rem', lineHeight: 1.08, letterSpacing: 0 }}>
            Restaurant POS
          </h1>
          <p style={{ marginTop: '1rem', maxWidth: '32rem', color: 'rgba(255,255,255,0.78)', fontSize: '1rem', lineHeight: 1.65 }}>
            连锁餐厅运营管理系统。收银、厨房、库存、财务、员工和分店数据统一管理。
          </p>
        </div>
        <div style={{
          position: 'relative',
          zIndex: 1,
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          gap: '0.85rem',
          maxWidth: '34rem',
        }}>
          {['POS 收银', '库存管理', '财务报表'].map(item => (
            <div key={item} style={{
              padding: '0.85rem',
              borderRadius: radii.lg,
              background: 'rgba(255,255,255,0.12)',
              border: '1px solid rgba(255,255,255,0.16)',
              fontSize: font.body,
              fontWeight: 700,
            }}>
              {item}
            </div>
          ))}
        </div>
      </section>

      <main style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
        background: `linear-gradient(180deg, ${colors.surface} 0%, ${colors.page} 100%)`,
      }}>
        <div style={{
          maxWidth: '27rem',
          width: '100%',
          padding: '2rem',
          backgroundColor: colors.surface,
          borderRadius: '20px',
          boxShadow: shadows.soft,
          border: `1px solid ${colors.border}`,
        }}>
          <div>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.45rem',
              padding: '0.28rem 0.65rem',
              borderRadius: radii.pill,
              background: colors.tealSoft,
              color: colors.teal,
              fontSize: font.caption,
              fontWeight: 750,
              marginBottom: '1rem',
            }}>
              Secure access
            </div>
            <h2 style={{ fontSize: '1.55rem', fontWeight: 800, color: colors.textPrimary, margin: 0 }}>
              登录系统
            </h2>
            <p style={{ marginTop: '0.45rem', fontSize: font.body, color: colors.textSecondary }}>
              请输入门店账号继续操作。
            </p>
          </div>

          <form onSubmit={handleSubmit} style={{ marginTop: '1.5rem' }}>
            {error && (
              <div style={{
                marginBottom: '1rem',
                padding: '0.8rem',
                backgroundColor: colors.dangerSoft,
                border: `1px solid #fecaca`,
                borderRadius: radii.md,
                color: colors.danger,
                fontSize: font.body,
                lineHeight: 1.45,
              }}>
                {error}
              </div>
            )}

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: font.body, fontWeight: 700, color: colors.textPrimary, marginBottom: '0.45rem' }}>
                用户名
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="例如：admin 或 zeng"
                required
                style={{
                  width: '100%',
                  padding: '0.72rem 0.85rem',
                  border: `1px solid ${colors.borderStrong}`,
                  borderRadius: radii.md,
                  outline: 'none',
                  fontSize: font.body,
                  boxSizing: 'border-box',
                  background: colors.surface,
                }}
              />
            </div>

            <div style={{ marginBottom: '1.35rem' }}>
              <label style={{ display: 'block', fontSize: font.body, fontWeight: 700, color: colors.textPrimary, marginBottom: '0.45rem' }}>
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
                  padding: '0.72rem 0.85rem',
                  border: `1px solid ${colors.borderStrong}`,
                  borderRadius: radii.md,
                  outline: 'none',
                  fontSize: font.body,
                  boxSizing: 'border-box',
                  background: colors.surface,
                }}
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              style={{
                width: '100%',
                padding: '0.82rem 1rem',
                background: isLoading ? colors.textMuted : `linear-gradient(135deg, ${colors.teal}, ${colors.blue})`,
                color: colors.surface,
                borderRadius: radii.md,
                fontWeight: 750,
                fontSize: '1rem',
                cursor: isLoading ? 'not-allowed' : 'pointer',
                border: 'none',
                boxShadow: isLoading ? 'none' : '0 12px 24px rgba(15, 118, 110, 0.22)',
              }}
            >
              {isLoading ? '登录中...' : '登录系统'}
            </button>

            <div style={{
              marginTop: '1rem',
              padding: '0.85rem',
              background: colors.surfaceMuted,
              borderRadius: radii.lg,
              fontSize: font.caption,
              color: colors.textSecondary,
              lineHeight: 1.55,
              border: `1px solid ${colors.border}`,
            }}>
              <div style={{ fontWeight: 750, color: colors.textPrimary, marginBottom: '0.35rem' }}>账号说明</div>
              <div>老板账号用于查看分店数据；店长账号进入门店经营管理。</div>
              <div style={{ marginTop: '0.35rem' }}>如需新建门店账号，请在老板后台的分店和权限管理中维护。</div>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
};

export default Login;
