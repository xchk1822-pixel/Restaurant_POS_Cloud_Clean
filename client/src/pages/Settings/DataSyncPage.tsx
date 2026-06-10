import React, { useState } from 'react';
import { manualSyncToFirestore } from '../../services/smartSyncService';

const DataSyncPage: React.FC = () => {
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string>(() => {
    return localStorage.getItem('last_manual_sync_time') || '从未同步';
  });

  const handleManualSync = async () => {
    if (isSyncing) return;
    
    setIsSyncing(true);
    try {
      await manualSyncToFirestore();
      const now = new Date().toLocaleString('zh-CN');
      setLastSyncTime(now);
      localStorage.setItem('last_manual_sync_time', now);
    } catch (error) {
      console.error('同步失败:', error);
    } finally {
      setIsSyncing(false);
    }
  };

  const styles = {
    container: {
      padding: '2rem',
      maxWidth: '800px',
      margin: '0 auto',
    },
    card: {
      backgroundColor: 'white',
      borderRadius: '0.75rem',
      padding: '2rem',
      boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
    },
    title: {
      fontSize: '1.5rem',
      fontWeight: 'bold',
      color: '#1f2937',
      marginBottom: '1rem',
    },
    description: {
      fontSize: '0.95rem',
      color: '#6b7280',
      marginBottom: '1.5rem',
      lineHeight: '1.6',
    },
    infoBox: {
      backgroundColor: '#eff6ff',
      borderLeft: '4px solid #3b82f6',
      padding: '1rem',
      marginBottom: '1.5rem',
      borderRadius: '0.375rem',
    },
    infoText: {
      fontSize: '0.9rem',
      color: '#1e40af',
      margin: '0.25rem 0',
    },
    syncButton: {
      width: '100%',
      padding: '1rem',
      backgroundColor: isSyncing ? '#9ca3af' : '#3b82f6',
      color: 'white',
      border: 'none',
      borderRadius: '0.5rem',
      fontSize: '1rem',
      fontWeight: '600',
      cursor: isSyncing ? 'not-allowed' : 'pointer',
      transition: 'all 0.2s',
    },
    lastSync: {
      marginTop: '1rem',
      textAlign: 'center' as const,
      fontSize: '0.875rem',
      color: '#6b7280',
    },
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h2 style={styles.title}>🔄 数据同步管理</h2>
        
        <p style={styles.description}>
          为了节省 Firebase 配额，系统已禁用实时同步。所有数据保存在本地浏览器中，
          需要手动同步到云端。建议每天同步2次：
        </p>

        <div style={styles.infoBox}>
          <p style={styles.infoText}>
            ☀️ <strong>早上开店前</strong> - 从云端拉取最新数据（待实现）
          </p>
          <p style={styles.infoText}>
            🌙 <strong>晚上关店后</strong> - 将当天数据同步到云端
          </p>
        </div>

        <button 
          onClick={handleManualSync}
          disabled={isSyncing}
          style={styles.syncButton}
        >
          {isSyncing ? '🔄 同步中...' : '📤 立即同步到云端'}
        </button>

        <p style={styles.lastSync}>
          上次同步时间：<strong>{lastSyncTime}</strong>
        </p>
      </div>
    </div>
  );
};

export default DataSyncPage;
