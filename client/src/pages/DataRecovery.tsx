import React, { useState, useEffect } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';

const DataRecovery: React.FC = () => {
  const [status, setStatus] = useState<string>('准备中...');
  const [logs, setLogs] = useState<string[]>([]);
  const [recoveredData, setRecoveredData] = useState<any>({});

  const addLog = (msg: string) => {
    setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
    console.log(msg);
  };

  const recoverFromFirestore = async () => {
    setStatus('正在从 Firestore 恢复数据...');
    addLog('🔄 开始恢复数据');

    const collections = [
      'stores',
      'users',
      'employees',
      'inventory_items',
      'menu_items',
      'pos_orders',
      'expenses',
      'purchase_orders',
      'suppliers'
    ];

    const recovered: any = {};

    for (const colName of collections) {
      try {
        addLog(`📥 读取 ${colName}...`);
        
        // 尝试全局集合
        const globalRef = collection(db, colName);
        const globalSnap = await getDocs(globalRef);
        
        if (!globalSnap.empty) {
          const data = globalSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          recovered[colName] = data;
          addLog(`✅ ${colName}: 找到 ${data.length} 条记录（全局）`);
        } else {
          addLog(`⚠️ ${colName}: 全局集合为空`);
        }

        // 尝试分店专属集合（如果有当前用户）
        const currentUser = localStorage.getItem('current_user');
        if (currentUser) {
          const user = JSON.parse(currentUser);
          if (user.storeId) {
            const storePath = `stores/${user.storeId}/${colName}`;
            const storeRef = collection(db, storePath);
            const storeSnap = await getDocs(storeRef);
            
            if (!storeSnap.empty) {
              const data = storeSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
              recovered[`${colName}_store`] = data;
              addLog(`✅ ${colName}: 找到 ${data.length} 条记录（分店 ${user.storeId}）`);
            }
          }
        }
      } catch (error) {
        addLog(`❌ ${colName} 读取失败: ${error}`);
      }
    }

    setRecoveredData(recovered);
    setStatus('恢复完成！请查看下方数据并手动保存到 localStorage');
    addLog('✅ 数据恢复完成');
  };

  const saveToLocalStorage = (key: string, data: any) => {
    localStorage.setItem(key, JSON.stringify(data));
    addLog(`💾 已保存 ${key} 到 localStorage (${data.length} 条)`);
  };

  const saveAllToLocalStorage = () => {
    addLog('🔄 开始批量保存所有数据...');
    Object.entries(recoveredData).forEach(([key, data]: any) => {
      const cleanKey = key.replace('_store', '');
      localStorage.setItem(cleanKey, JSON.stringify(data));
      addLog(`💾 已保存 ${cleanKey} (${(data as any[]).length} 条)`);
    });
    addLog('✅ 所有数据已保存到 localStorage！3秒后自动刷新页面');
    setStatus('✅ 所有数据已保存！3秒后自动刷新页面');
    
    // 🔥 3秒后自动刷新页面
    setTimeout(() => {
      window.location.href = '/settings/stores';
    }, 3000);
  };

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      <h1>🔥 数据恢复工具</h1>
      
      <div style={{ marginBottom: '2rem' }}>
        <button 
          onClick={recoverFromFirestore}
          style={{
            padding: '1rem 2rem',
            fontSize: '1.2rem',
            backgroundColor: '#3b82f6',
            color: 'white',
            border: 'none',
            borderRadius: '0.5rem',
            cursor: 'pointer'
          }}
        >
          🔄 从 Firestore 恢复数据
        </button>
        <p style={{ marginTop: '1rem', color: '#6b7280' }}>状态: {status}</p>
      </div>

      <div style={{ 
        backgroundColor: '#1f2937', 
        color: '#10b981', 
        padding: '1rem', 
        borderRadius: '0.5rem',
        fontFamily: 'monospace',
        maxHeight: '400px',
        overflowY: 'auto',
        marginBottom: '2rem'
      }}>
        {logs.map((log, i) => (
          <div key={i}>{log}</div>
        ))}
      </div>

      {Object.keys(recoveredData).length > 0 && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2>📊 恢复的数据</h2>
            <button 
              onClick={saveAllToLocalStorage}
              style={{
                padding: '1rem 2rem',
                fontSize: '1.1rem',
                backgroundColor: '#10b981',
                color: 'white',
                border: 'none',
                borderRadius: '0.5rem',
                cursor: 'pointer',
                fontWeight: 'bold'
              }}
            >
              💾 一键保存所有数据到 localStorage
            </button>
          </div>
          {Object.entries(recoveredData).map(([key, data]: any) => (
            <div key={key} style={{ marginBottom: '1rem', padding: '1rem', backgroundColor: '#f3f4f6', borderRadius: '0.5rem' }}>
              <h3>{key} ({(data as any[]).length} 条)</h3>
              <button 
                onClick={() => saveToLocalStorage(key.replace('_store', ''), data)}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: '#10b981',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.375rem',
                  cursor: 'pointer',
                  marginRight: '0.5rem'
                }}
              >
                💾 保存到 localStorage
              </button>
              <pre style={{ fontSize: '0.8rem', overflow: 'auto', maxHeight: '200px' }}>
                {JSON.stringify(data.slice(0, 3), null, 2)}
                {(data as any[]).length > 3 && `\n... 还有 ${(data as any[]).length - 3} 条`}
              </pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default DataRecovery;
