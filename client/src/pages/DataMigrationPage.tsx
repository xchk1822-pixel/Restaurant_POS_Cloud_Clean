import React, { useState, useEffect } from 'react';
import { migrateFromLocalStorage } from '../services/firestoreService';

const DataMigrationPage: React.FC = () => {
  const [status, setStatus] = useState<'idle' | 'migrating' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [progress, setProgress] = useState(0);

  const handleMigrate = async () => {
    setStatus('migrating');
    setMessage('正在迁移数据到 Firestore...');
    setProgress(0);

    try {
      // 模拟进度
      const interval = setInterval(() => {
        setProgress(prev => Math.min(prev + 10, 90));
      }, 500);

      await migrateFromLocalStorage();

      clearInterval(interval);
      setProgress(100);
      setStatus('success');
      setMessage('✅ 数据迁移完成！你现在可以在任何设备上登录了。');
    } catch (error) {
      console.error('迁移失败:', error);
      setStatus('error');
      setMessage('❌ 迁移失败，请检查网络连接或联系管理员');
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      padding: '1rem',
    }}>
      <div style={{
        background: 'white',
        borderRadius: '1rem',
        padding: '2rem',
        maxWidth: '500px',
        width: '100%',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>
            {status === 'idle' && '☁️'}
            {status === 'migrating' && '🔄'}
            {status === 'success' && '✅'}
            {status === 'error' && '❌'}
          </div>
          <h1 style={{ fontSize: '1.5rem', color: '#1f2937', marginBottom: '0.5rem' }}>
            数据迁移到云端
          </h1>
          <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>
            将本地数据同步到 Firebase，实现多设备访问
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
              <strong>⚠️ 重要提示：</strong><br/>
              • 此操作会将你的本地数据上传到云端<br/>
              • 完成后可以在任何设备登录<br/>
              • 建议先备份重要数据
            </div>

            <button
              onClick={handleMigrate}
              style={{
                width: '100%',
                padding: '0.75rem',
                background: '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '0.5rem',
                fontSize: '1rem',
                fontWeight: '600',
                cursor: 'pointer',
              }}
            >
              开始迁移
            </button>
          </div>
        )}

        {status === 'migrating' && (
          <div>
            <div style={{
              width: '100%',
              height: '8px',
              background: '#e5e7eb',
              borderRadius: '4px',
              overflow: 'hidden',
              marginBottom: '1rem',
            }}>
              <div style={{
                width: `${progress}%`,
                height: '100%',
                background: '#3b82f6',
                transition: 'width 0.3s ease',
              }} />
            </div>
            <p style={{ textAlign: 'center', color: '#6b7280' }}>{message}</p>
          </div>
        )}

        {(status === 'success' || status === 'error') && (
          <div>
            <p style={{
              textAlign: 'center',
              color: status === 'success' ? '#10b981' : '#ef4444',
              marginBottom: '1.5rem',
            }}>
              {message}
            </p>
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
              {status === 'success' ? '去登录' : '返回重试'}
            </button>
          </div>
        )}

        <div style={{
          marginTop: '1.5rem',
          paddingTop: '1rem',
          borderTop: '1px solid #e5e7eb',
          fontSize: '0.75rem',
          color: '#9ca3af',
          textAlign: 'center',
        }}>
          💡 迁移后，所有设备的数据将保持同步
        </div>
      </div>
    </div>
  );
};

export default DataMigrationPage;
