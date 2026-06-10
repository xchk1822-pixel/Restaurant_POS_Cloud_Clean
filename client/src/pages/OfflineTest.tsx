import React, { useState, useEffect } from 'react';
import { getNetworkStatus, syncPendingChanges } from '../services/smartSyncService';

const OfflineTest: React.FC = () => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);
  const [testData, setTestData] = useState<any[]>([]);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    loadPendingChanges();
    loadTestData();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const loadPendingChanges = () => {
    try {
      const changes = localStorage.getItem('pending_firestore_changes');
      if (changes) {
        const parsed = JSON.parse(changes);
        setPendingCount(parsed.length);
      }
    } catch {
      setPendingCount(0);
    }
  };

  const loadTestData = () => {
    const saved = localStorage.getItem('stores');
    if (saved) {
      setTestData(JSON.parse(saved));
    }
  };

  const addTestStore = () => {
    const newStore = {
      name: `测试分店 ${Date.now()}`,
      code: `TEST${Date.now()}`,
      address: '测试地址',
      phone: '123456789',
      status: 'active',
      currency: 'NIO',
      taxRate: 15,
      businessHours: '09:00-22:00',
      storeId: 'store_001',
    };

    const existing = testData;
    const updated = [...existing, { id: `local_${Date.now()}`, ...newStore }];
    setTestData(updated);
    localStorage.setItem('stores', JSON.stringify(updated));

    // 添加到待同步队列
    const changes = [];
    try {
      const saved = localStorage.getItem('pending_firestore_changes');
      if (saved) changes.push(...JSON.parse(saved));
    } catch {}

    changes.push({
      id: `local_${Date.now()}`,
      collection: 'stores',
      operation: 'add',
      data: newStore,
      timestamp: Date.now(),
    });

    localStorage.setItem('pending_firestore_changes', JSON.stringify(changes));
    loadPendingChanges();
  };

  const handleSync = async () => {
    await syncPendingChanges();
    loadPendingChanges();
  };

  const styles = {
    container: {
      padding: '2rem',
      maxWidth: '800px',
      margin: '0 auto',
    },
    card: {
      background: 'white',
      borderRadius: '0.75rem',
      boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
      padding: '1.5rem',
      marginBottom: '1.5rem',
    },
    statusBadge: (online: boolean) => ({
      display: 'inline-block',
      padding: '0.5rem 1rem',
      borderRadius: '9999px',
      backgroundColor: online ? '#d1fae5' : '#fee2e2',
      color: online ? '#065f46' : '#991b1b',
      fontWeight: 'bold',
      fontSize: '1rem',
    }),
    button: {
      padding: '0.75rem 1.5rem',
      backgroundColor: isOnline ? '#3b82f6' : '#6b7280',
      color: 'white',
      border: 'none',
      borderRadius: '0.5rem',
      cursor: isOnline ? 'pointer' : 'not-allowed',
      fontWeight: '600',
      fontSize: '1rem',
      marginRight: '1rem',
      marginBottom: '0.5rem',
    },
    statBox: {
      display: 'inline-block',
      padding: '1rem',
      backgroundColor: '#f3f4f6',
      borderRadius: '0.5rem',
      marginRight: '1rem',
      marginBottom: '1rem',
    },
    statNumber: {
      fontSize: '2rem',
      fontWeight: 'bold',
      color: '#1f2937',
    },
    statLabel: {
      fontSize: '0.875rem',
      color: '#6b7280',
    },
    dataList: {
      maxHeight: '300px',
      overflowY: 'auto' as const,
    },
    dataItem: {
      padding: '0.75rem',
      borderBottom: '1px solid #e5e7eb',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
  };

  return (
    <div style={styles.container}>
      <h1 style={{ marginBottom: '1.5rem' }}>📡 离线功能测试</h1>

      {/* 网络状态 */}
      <div style={styles.card}>
        <h2 style={{ marginBottom: '1rem' }}>网络状态</h2>
        <div style={styles.statusBadge(isOnline)}>
          {isOnline ? '🟢 在线' : '🔴 离线'}
        </div>
        <p style={{ marginTop: '1rem', color: '#6b7280' }}>
          {isOnline 
            ? '✅ 数据将同步到云端' 
            : '⚠️ 数据仅保存在本地，联网后自动同步'}
        </p>
      </div>

      {/* 统计信息 */}
      <div style={styles.card}>
        <h2 style={{ marginBottom: '1rem' }}>同步状态</h2>
        
        <div style={styles.statBox}>
          <div style={styles.statNumber}>{pendingCount}</div>
          <div style={styles.statLabel}>待同步操作</div>
        </div>

        <div style={styles.statBox}>
          <div style={styles.statNumber}>{testData.length}</div>
          <div style={styles.statLabel}>本地分店数</div>
        </div>

        <div style={{ marginTop: '1rem' }}>
          <button 
            onClick={handleSync}
            disabled={!isOnline || pendingCount === 0}
            style={styles.button}
          >
            🔄 立即同步
          </button>
          
          <button 
            onClick={addTestStore}
            style={{ ...styles.button, backgroundColor: '#10b981' }}
          >
            ➕ 添加测试数据
          </button>
        </div>
      </div>

      {/* 测试说明 */}
      <div style={styles.card}>
        <h2 style={{ marginBottom: '1rem' }}>🧪 测试步骤</h2>
        <ol style={{ lineHeight: '2', paddingLeft: '1.5rem' }}>
          <li>点击"添加测试数据"按钮（在线/离线都可以）</li>
          <li>断开网络连接（关闭WiFi或拔掉网线）</li>
          <li>继续添加数据，观察"待同步操作"数量增加</li>
          <li>恢复网络连接</li>
          <li>点击"立即同步"按钮</li>
          <li>查看Firebase控制台，确认数据已上传</li>
        </ol>
      </div>

      {/* 本地数据列表 */}
      <div style={styles.card}>
        <h2 style={{ marginBottom: '1rem' }}>📋 本地数据</h2>
        <div style={styles.dataList}>
          {testData.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#9ca3af', padding: '2rem' }}>
              暂无数据，点击"添加测试数据"开始
            </div>
          ) : (
            testData.map((item, index) => (
              <div key={index} style={styles.dataItem}>
                <div>
                  <div style={{ fontWeight: '600' }}>{item.name}</div>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                    {item.code} • {item.address}
                  </div>
                </div>
                <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
                  {new Date(item.createdAt?.seconds * 1000 || Date.now()).toLocaleString('zh-CN')}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 功能说明 */}
      <div style={styles.card}>
        <h2 style={{ marginBottom: '1rem' }}>✨ 智能同步特性</h2>
        <ul style={{ lineHeight: '2', paddingLeft: '1.5rem' }}>
          <li>✅ <strong>优先云端</strong> - 联网时直接写入Firestore</li>
          <li>✅ <strong>离线降级</strong> - 断网时自动保存到localStorage</li>
          <li>✅ <strong>自动同步</strong> - 网络恢复后自动上传待同步数据</li>
          <li>✅ <strong>实时监听</strong> - 在线时实时接收数据更新</li>
          <li>✅ <strong>冲突处理</strong> - 以最新修改为准</li>
          <li>✅ <strong>分店隔离</strong> - 按storeId过滤数据</li>
        </ul>
      </div>
    </div>
  );
};

export default OfflineTest;
