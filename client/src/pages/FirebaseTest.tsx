import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, getDocs } from 'firebase/firestore';

const FirebaseTest: React.FC = () => {
  const [status, setStatus] = useState<'checking' | 'connected' | 'error'>('checking');
  const [message, setMessage] = useState('');
  const [collections, setCollections] = useState<string[]>([]);

  useEffect(() => {
    testConnection();
  }, []);

  const testConnection = async () => {
    try {
      setStatus('checking');
      setMessage('正在连接Firebase...');

      // 尝试获取集合列表
      const querySnapshot = await getDocs(collection(db, 'stores'));
      
      setStatus('connected');
      setMessage('✅ Firebase连接成功！');
      
      // 显示已有集合
      const existingCollections = [];
      if (!querySnapshot.empty) {
        existingCollections.push('stores');
      }
      setCollections(existingCollections);
      
    } catch (error) {
      setStatus('error');
      setMessage(`❌ 连接失败: ${error instanceof Error ? error.message : '未知错误'}`);
      console.error('Firebase连接测试失败:', error);
    }
  };

  const styles = {
    container: {
      padding: '2rem',
      maxWidth: '600px',
      margin: '2rem auto',
      background: 'white',
      borderRadius: '0.75rem',
      boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
    },
    status: {
      fontSize: '3rem',
      textAlign: 'center' as const,
      marginBottom: '1rem',
    },
    message: {
      fontSize: '1.25rem',
      textAlign: 'center' as const,
      marginBottom: '1.5rem',
      color: status === 'connected' ? '#10b981' : status === 'error' ? '#ef4444' : '#6b7280',
    },
    button: {
      width: '100%',
      padding: '0.75rem',
      background: '#3b82f6',
      color: 'white',
      border: 'none',
      borderRadius: '0.5rem',
      cursor: 'pointer',
      fontWeight: '600',
      fontSize: '1rem',
    },
    info: {
      marginTop: '1.5rem',
      padding: '1rem',
      background: '#f3f4f6',
      borderRadius: '0.5rem',
      fontSize: '0.875rem',
    },
  };

  return (
    <div style={styles.container}>
      <h2 style={{ textAlign: 'center', marginBottom: '1.5rem' }}>🔥 Firebase连接测试</h2>
      
      <div style={styles.status}>
        {status === 'checking' && '⏳'}
        {status === 'connected' && '✅'}
        {status === 'error' && '❌'}
      </div>
      
      <div style={styles.message}>{message}</div>
      
      <button onClick={testConnection} style={styles.button}>
        🔄 重新测试
      </button>

      {status === 'connected' && (
        <div style={styles.info}>
          <div style={{ fontWeight: '600', marginBottom: '0.5rem' }}>📊 检测到的集合：</div>
          {collections.length > 0 ? (
            <ul style={{ margin: 0, paddingLeft: '1.5rem' }}>
              {collections.map(col => (
                <li key={col}>{col}</li>
              ))}
            </ul>
          ) : (
            <div>暂无数据（这是正常的，首次使用需要添加数据）</div>
          )}
          
          <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #d1d5db' }}>
            <div style={{ fontWeight: '600', marginBottom: '0.5rem' }}>💡 下一步：</div>
            <ol style={{ margin: 0, paddingLeft: '1.5rem' }}>
              <li>配置Firebase项目（见 FIREBASE_SETUP.md）</li>
              <li>更新 client/src/firebase/config.ts</li>
              <li>启用Firestore数据库</li>
              <li>刷新页面重新测试</li>
            </ol>
          </div>
        </div>
      )}

      {status === 'error' && (
        <div style={{ ...styles.info, background: '#fee2e2' }}>
          <div style={{ fontWeight: '600', marginBottom: '0.5rem', color: '#dc2626' }}>⚠️ 检查清单：</div>
          <ul style={{ margin: 0, paddingLeft: '1.5rem', color: '#7f1d1d' }}>
            <li>是否已创建Firebase项目？</li>
            <li>config.ts中的配置是否正确？</li>
            <li>是否已启用Firestore数据库？</li>
            <li>网络连接是否正常？</li>
          </ul>
        </div>
      )}
    </div>
  );
};

export default FirebaseTest;
