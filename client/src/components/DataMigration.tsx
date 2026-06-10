import React, { useState, useEffect } from 'react';
import { migrateOldData } from '../services/smartSyncService';

const DataMigration: React.FC<{ onComplete: () => void }> = ({ onComplete }) => {
  const [status, setStatus] = useState<'checking' | 'migrating' | 'complete'>('checking');
  const [message, setMessage] = useState('正在检查数据...');
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    performMigration();
  }, []);

  const performMigration = async () => {
    try {
      setStatus('migrating');
      setMessage('正在同步数据到云端...');
      
      // 模拟进度
      const progressInterval = setInterval(() => {
        setProgress(prev => {
          if (prev >= 90) return prev;
          return prev + 10;
        });
      }, 500);

      await migrateOldData();
      
      clearInterval(progressInterval);
      setProgress(100);
      setStatus('complete');
      setMessage('✅ 数据同步完成！');
      
      // 1秒后继续
      setTimeout(() => {
        onComplete();
      }, 1000);
      
    } catch (error) {
      console.error('数据迁移失败:', error);
      setStatus('complete');
      setMessage('⚠️ 使用本地数据模式');
      
      setTimeout(() => {
        onComplete();
      }, 2000);
    }
  };

  const styles = {
    overlay: {
      position: 'fixed' as const,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
    },
    container: {
      background: 'white',
      padding: '2rem',
      borderRadius: '1rem',
      maxWidth: '400px',
      width: '90%',
      textAlign: 'center' as const,
    },
    icon: {
      fontSize: '3rem',
      marginBottom: '1rem',
    },
    title: {
      fontSize: '1.25rem',
      fontWeight: 'bold',
      marginBottom: '0.5rem',
      color: '#1f2937',
    },
    message: {
      fontSize: '0.875rem',
      color: '#6b7280',
      marginBottom: '1.5rem',
    },
    progressBar: {
      width: '100%',
      height: '8px',
      backgroundColor: '#e5e7eb',
      borderRadius: '4px',
      overflow: 'hidden',
      marginBottom: '1rem',
    },
    progressFill: {
      height: '100%',
      backgroundColor: status === 'complete' ? '#10b981' : '#3b82f6',
      transition: 'width 0.3s ease',
      width: `${progress}%`,
    },
    hint: {
      fontSize: '0.75rem',
      color: '#9ca3af',
      marginTop: '1rem',
    },
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.container}>
        <div style={styles.icon}>
          {status === 'checking' && '🔍'}
          {status === 'migrating' && '☁️'}
          {status === 'complete' && '✅'}
        </div>
        
        <div style={styles.title}>
          {status === 'checking' && '检查数据'}
          {status === 'migrating' && '同步数据到云端'}
          {status === 'complete' && '准备就绪'}
        </div>
        
        <div style={styles.message}>{message}</div>
        
        {(status === 'checking' || status === 'migrating') && (
          <div style={styles.progressBar}>
            <div style={styles.progressFill}></div>
          </div>
        )}
        
        <div style={styles.hint}>
          💡 断网时自动使用本地数据，联网后自动同步
        </div>
      </div>
    </div>
  );
};

export default DataMigration;
