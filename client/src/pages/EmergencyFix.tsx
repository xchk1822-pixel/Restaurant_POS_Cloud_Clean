import React, { useState } from 'react';
import { addDocument } from '../services/firestoreService';

const EmergencyFix: React.FC = () => {
  const [status, setStatus] = useState<'idle' | 'creating' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const handleCreateAdmin = async () => {
    setStatus('creating');
    setMessage('正在创建超级管理员...');

    try {
      await addDocument('users', {
        username: 'admin',
        password: 'admin123',
        name: '系统管理员',
        role: 'super_admin',
        storeId: null,
        storeName: null,
        status: 'active',
        createdAt: new Date().toISOString(),
      });

      setStatus('success');
      setMessage('✅ 超级管理员创建成功！\n\n用户名：admin\n密码：admin123');
    } catch (error) {
      console.error('创建失败:', error);
      setStatus('error');
      setMessage('❌ 创建失败，请检查网络连接');
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#fee2e2',
      padding: '1rem',
    }}>
      <div style={{
        background: 'white',
        borderRadius: '1rem',
        padding: '2rem',
        maxWidth: '500px',
        width: '100%',
        boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🚨</div>
          <h1 style={{ fontSize: '1.5rem', color: '#dc2626', marginBottom: '0.5rem' }}>
            紧急修复 - 创建超级管理员
          </h1>
          <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>
            如果无法登录超级管理员账号，使用此工具恢复
          </p>
        </div>

        {status === 'idle' && (
          <div>
            <div style={{
              background: '#fef3c7',
              border: '1px solid #fcd34d',
              borderRadius: '0.5rem',
              padding: '1rem',
              marginBottom: '1.5rem',
              fontSize: '0.875rem',
              color: '#92400e',
            }}>
              <strong>⚠️ 说明：</strong><br/>
              • 此操作会创建一个默认的超级管理员账号<br/>
              • 用户名：admin<br/>
              • 密码：admin123<br/>
              • 如果已存在则不会重复创建
            </div>

            <button
              onClick={handleCreateAdmin}
              style={{
                width: '100%',
                padding: '0.75rem',
                background: '#dc2626',
                color: 'white',
                border: 'none',
                borderRadius: '0.5rem',
                fontSize: '1rem',
                fontWeight: '600',
                cursor: 'pointer',
              }}
            >
              创建超级管理员
            </button>
          </div>
        )}

        {status === 'creating' && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>⏳</div>
            <p style={{ color: '#6b7280' }}>{message}</p>
          </div>
        )}

        {(status === 'success' || status === 'error') && (
          <div>
            <div style={{
              background: status === 'success' ? '#d1fae5' : '#fee2e2',
              border: `1px solid ${status === 'success' ? '#6ee7b7' : '#fecaca'}`,
              borderRadius: '0.5rem',
              padding: '1rem',
              marginBottom: '1.5rem',
              fontSize: '0.875rem',
              color: status === 'success' ? '#065f46' : '#991b1b',
              whiteSpace: 'pre-line',
            }}>
              {message}
            </div>
            <button
              onClick={() => window.location.href = '/login'}
              style={{
                width: '100%',
                padding: '0.75rem',
                background: status === 'success' ? '#10b981' : '#6b7280',
                color: 'white',
                border: 'none',
                borderRadius: '0.5rem',
                fontSize: '1rem',
                fontWeight: '600',
                cursor: 'pointer',
              }}
            >
              去登录
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default EmergencyFix;
