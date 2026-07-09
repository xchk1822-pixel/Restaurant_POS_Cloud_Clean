import React, { useState, useEffect } from 'react';
import { dataManager } from '../../services/dataManager';
import { dataService } from '../../services/DataService';
import { getUSDToNioRate } from '../../utils/exchangeRate';
import { smartAddDocument, smartDeleteDocument, smartGetDocuments } from '../../services/smartSyncService';
import { normalizeHandoverRecords } from '../../utils/handoverRecords';

interface CashCount {
  [key: string]: number;
}

interface HistoryRecord {
  id?: string;
  t: string; // 时间
  u: string; // 美金总额
  n: string; // 科多巴总额
  g: string; // 总计(NIO)
  rawG: number; // 原始数值
  diff: string; // 误差
}

const USD_UNITS = [100, 50, 20, 10, 5, 2, 1];
const NIO_UNITS = [1000, 500, 200, 100, 50, 20, 10, 5, 1];

interface ShiftHandoverProps {
  embedded?: boolean; // 是否嵌入模式
}

const ShiftHandoverModule: React.FC<ShiftHandoverProps> = ({ embedded = false }) => {
  const currentInputsStorageKey = dataService.getStoreKey('current_inputs');

  // 使用全局汇率
  const exchangeRate = getUSDToNioRate();
  
  const [usdCount, setUsdCount] = useState<CashCount>(() => {
    const saved = localStorage.getItem(currentInputsStorageKey);
    if (saved) {
      const inputs = JSON.parse(saved);
      const usd: CashCount = {};
      USD_UNITS.forEach(v => {
        usd[v] = inputs[`u_${v}`] ? parseInt(inputs[`u_${v}`]) : 0;
      });
      return usd;
    }
    return USD_UNITS.reduce((acc, v) => ({ ...acc, [v]: 0 }), {});
  });
  
  const [nioCount, setNioCount] = useState<CashCount>(() => {
    const saved = localStorage.getItem(currentInputsStorageKey);
    if (saved) {
      const inputs = JSON.parse(saved);
      const nio: CashCount = {};
      NIO_UNITS.forEach(v => {
        nio[v] = inputs[`n_${v}`] ? parseInt(inputs[`n_${v}`]) : 0;
      });
      return nio;
    }
    return NIO_UNITS.reduce((acc, v) => ({ ...acc, [v]: 0 }), {});
  });
  
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  
  // 一次性读取交班记录，避免低频页面长期监听 Firestore
  const refreshHandovers = React.useCallback(async () => {
    setIsRefreshing(true);
    try {
      const cloudRecords = await smartGetDocuments('handovers', true);
      const normalizedRecords = normalizeHandoverRecords(cloudRecords) as HistoryRecord[];
      setHistory(normalizedRecords);
      setLastSyncedAt(new Date());
    } catch (error) {
      console.error('\u5237\u65b0\u4ea4\u73ed\u8bb0\u5f55\u5931\u8d25:', error);
      alert('\u5237\u65b0\u4ea4\u73ed\u8bb0\u5f55\u5931\u8d25\uff0c\u8bf7\u68c0\u67e5\u7f51\u7edc\u540e\u91cd\u8bd5');
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    refreshHandovers();
  }, [refreshHandovers]);

  const [, setCurrentTime] = useState(new Date());
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  // 保存当前输入
  useEffect(() => {
    const inputs: any = {};
    Object.entries(usdCount).forEach(([k, v]) => {
      if (v > 0) inputs[`u_${k}`] = v.toString();
    });
    Object.entries(nioCount).forEach(([k, v]) => {
      if (v > 0) inputs[`n_${k}`] = v.toString();
    });
    localStorage.setItem(currentInputsStorageKey, JSON.stringify(inputs));
  }, [currentInputsStorageKey, usdCount, nioCount]);

  // 时钟更新
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // 计算总额
  const usdTotal = Object.entries(usdCount).reduce((sum, [denom, count]) => {
    return sum + count * parseInt(denom);
  }, 0);
  
  const nioTotal = Object.entries(nioCount).reduce((sum, [denom, count]) => {
    return sum + count * parseInt(denom);
  }, 0);
  
  const grandTotal = nioTotal + (usdTotal * exchangeRate);

  // 更新美金数量
  const updateUsdCount = (denom: number, value: number) => {
    setUsdCount(prev => ({ ...prev, [denom]: value }));
  };

  // 更新科多巴数量
  const updateNioCount = (denom: number, value: number) => {
    setNioCount(prev => ({ ...prev, [denom]: value }));
  };

  // 保存交班记录
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleSave = async () => {
    if (usdTotal === 0 && nioTotal === 0) {
      alert('当前金额为0，未保存');
      return;
    }

    let diff = '--';
    if (history.length > 0) {
      const lastG = history[0].rawG;
      const d = grandTotal - lastG;
      if (d === 0) diff = '无变动';
      else diff = (d > 0 ? '+' : '') + d.toLocaleString('en-US', { minimumFractionDigits: 2 });
    }

    const now = new Date();
    const dateTimeStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

    const record: HistoryRecord = {
      t: dateTimeStr,
      u: usdTotal.toFixed(2),
      n: nioTotal.toFixed(2),
      g: grandTotal.toLocaleString('en-US', { minimumFractionDigits: 2 }),
      rawG: grandTotal,
      diff
    };

    const newHistory = [record, ...history];
    setHistory(newHistory);
    // Firestore 会通过 useEffect 自动同步

    setSaveStatus('saved');
    setTimeout(() => setSaveStatus('idle'), 1500);
  };

  // 清空当前输入
  const handleSubmitHandover = async () => {
    if (saveStatus === 'saving') return;

    if (usdTotal === 0 && nioTotal === 0) {
      alert('\u5f53\u524d\u91d1\u989d\u4e3a0\uff0c\u672a\u4fdd\u5b58');
      return;
    }

    setSaveStatus('saving');

    try {
      let diff = '--';
      if (history.length > 0) {
        const lastG = history[0].rawG;
        const d = grandTotal - lastG;
        diff = d === 0
          ? '\u65e0\u53d8\u52a8'
          : (d > 0 ? '+' : '') + d.toLocaleString('en-US', { minimumFractionDigits: 2 });
      }

      const now = new Date();
      const createdAt = now.toISOString();
      const dateTimeStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

      const record = {
        id: `handover-${now.getTime()}-${Math.random().toString(36).slice(2)}`,
        t: dateTimeStr,
        u: usdTotal.toFixed(2),
        n: nioTotal.toFixed(2),
        g: grandTotal.toLocaleString('en-US', { minimumFractionDigits: 2 }),
        rawG: grandTotal,
        diff,
        createdAt,
        updatedAt: createdAt,
      } as HistoryRecord & { createdAt: string; updatedAt: string };

      const newHistory = normalizeHandoverRecords([record, ...history]) as HistoryRecord[];
      await smartAddDocument('handovers', record);
      setHistory(newHistory);
      await dataManager.saveData('handovers', newHistory, { syncFirestore: false, notify: false });
      setLastSyncedAt(new Date());

      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 1500);
    } catch (error) {
      console.error('\u4ea4\u73ed\u5bf9\u8d26\u4fdd\u5b58\u5931\u8d25:', error);
      alert('\u4ea4\u73ed\u5bf9\u8d26\u4fdd\u5b58\u5931\u8d25\uff0c\u8bf7\u68c0\u67e5\u7f51\u7edc\u540e\u91cd\u8bd5');
      setSaveStatus('idle');
    }
  };

  const resetInputs = () => {
    if (window.confirm('确定要清空所有输入框吗？')) {
      setUsdCount(USD_UNITS.reduce((acc, v) => ({ ...acc, [v]: 0 }), {}));
      setNioCount(NIO_UNITS.reduce((acc, v) => ({ ...acc, [v]: 0 }), {}));
    }
  };

  // 清空历史记录
  const handleClear = async () => {
    if (window.confirm('清空所有历史记录？')) {
      await Promise.all(history.map(record =>
        record.id ? smartDeleteDocument('handovers', record.id) : Promise.resolve()
      ));
      setHistory([]);
      await dataManager.saveData('handovers', [], { syncFirestore: false, notify: false });
      setLastSyncedAt(new Date());
    }
  };

  const styles = {
    container: {
      display: 'grid',
      gridTemplateRows: '320px minmax(0, 1fr)',
      height: '100%',
      boxSizing: 'border-box' as const,
      padding: '1rem 1.5rem 2rem',
      background: '#f5f7fa',
      overflow: 'hidden',
      gap: '10px',
    },
    header: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      background: '#1a1a2e',
      padding: '10px 25px',
      borderRadius: '12px',
      color: 'white',
      marginBottom: '10px',
      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
      flexShrink: 0 as const,
    },
    clock: {
      fontSize: '16px',
      fontWeight: 'bold',
    },
    rateBox: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      background: 'rgba(255,255,255,0.1)',
      padding: '5px 15px',
      borderRadius: '30px',
    },
    rateInput: {
      background: 'transparent',
      border: 'none',
      borderBottom: '2px solid #f1c40f',
      color: '#f1c40f',
      width: '65px',
      textAlign: 'center' as const,
      fontSize: '1.2rem',
      fontWeight: 'bold',
      outline: 'none',
    },
    mainGrid: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: '15px',
      height: '320px',
      minHeight: 0,
    },
    card: {
      background: 'white',
      borderRadius: '16px',
      padding: '12px',
      display: 'flex',
      flexDirection: 'column' as const,
      boxShadow: '0 4px 15px rgba(0,0,0,0.05)',
      minHeight: 0,
    },
    cardHeader: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: '8px',
      borderBottom: '2px solid #f8f9fa',
      paddingBottom: '8px',
    },
    listContainer: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))',
      gap: '8px 12px',
      overflow: 'visible',
      paddingRight: '8px',
      minHeight: 0,
    },
    rowItem: {
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      marginBottom: '2px',
    },
    labelPill: (color: string, bg: string) => ({
      width: '75px',
      padding: '7px 0',
      textAlign: 'center' as const,
      fontWeight: 900,
      fontSize: '1.1rem',
      borderRadius: '8px',
      flexShrink: 0,
      color,
      background: bg,
    }),
    inputBox: {
      flex: 1,
      border: '2px solid #eee',
      borderRadius: '8px',
      background: '#fff',
      transition: '0.2s',
    },
    input: {
      width: '100%',
      border: 'none',
      padding: '8px',
      textAlign: 'center' as const,
      fontSize: '1.15rem',
      fontWeight: 'bold',
      outline: 'none',
      color: '#333',
    },
    footer: {
      display: 'grid',
      gridTemplateColumns: '300px 1fr',
      gap: '15px',
      marginTop: 0,
      minHeight: 0,
      height: '100%',
    },
    summary: {
      background: '#1a1a2e',
      color: 'white',
      borderRadius: '16px',
      padding: '14px',
      display: 'flex',
      flexDirection: 'column' as const,
      justifyContent: 'space-between',
      minHeight: 0,
      height: '100%',
      boxSizing: 'border-box' as const,
    },
    sumLine: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: '10px',
      fontSize: '1.05rem',
      opacity: 0.9,
    },
    grandTotal: {
      borderTop: '1px solid rgba(255,255,255,0.1)',
      paddingTop: '12px',
      marginBottom: '12px',
      textAlign: 'center' as const,
    },
    grandTotalLabel: {
      display: 'block',
      fontSize: '0.85rem',
      opacity: 0.7,
      marginBottom: '6px',
    },
    grandTotalValue: {
      display: 'block',
      color: '#f1c40f',
      fontSize: '1.65rem',
      fontWeight: 'bold',
    },
    btnSave: (status: 'idle' | 'saving' | 'saved') => ({
      background: status === 'saved' ? '#3498db' : status === 'saving' ? '#f59e0b' : '#27ae60',
      color: 'white',
      border: 'none',
      padding: '12px',
      borderRadius: '10px',
      fontSize: '1rem',
      fontWeight: 'bold',
      cursor: 'pointer',
    }),
    history: {
      background: 'white',
      borderRadius: '16px',
      padding: '15px',
      display: 'flex',
      flexDirection: 'column' as const,
      overflow: 'hidden',
      minHeight: 0,
      height: '100%',
      boxSizing: 'border-box' as const,
    },
    tableScroll: {
      flex: 1,
      overflowY: 'auto' as const,
      marginTop: '10px',
      border: '1px solid #f1f1f1',
      borderRadius: '10px',
    },
    table: {
      width: '100%',
      borderCollapse: 'collapse' as const,
    },
    th: {
      background: '#fbfbfc',
      padding: '12px',
      fontSize: '0.85rem',
      color: '#888',
      position: 'sticky' as const,
      top: 0,
      zIndex: 2,
      borderBottom: '1px solid #eee',
    },
    td: {
      padding: '10px',
      textAlign: 'center' as const,
      borderBottom: '1px solid #f8f9fa',
      fontSize: '0.95rem',
    },
    btnReset: {
      background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
      border: 'none',
      color: 'white',
      padding: '8px 16px',
      borderRadius: '8px',
      cursor: 'pointer',
      fontSize: '0.85rem',
      fontWeight: 'bold',
      boxShadow: '0 2px 8px rgba(245, 87, 108, 0.3)',
      transition: 'all 0.2s',
    },
    diffUp: {
      color: '#27ae60',
      fontWeight: 'bold',
    },
    diffDown: {
      color: '#e74c3c',
      fontWeight: 'bold',
    },
  };

  return (
    <div style={embedded ? {} : styles.container}>
      {/* 主网格 */}
      <div style={{ flexShrink: 0, marginBottom: 0 }}>
        <div style={embedded ? { ...styles.mainGrid, minHeight: 'auto' } : styles.mainGrid}>
        {/* 美金 */}
        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <h2 style={{ color: '#1b5e20', margin: 0 }}>美金 (USD)</h2>
            <div style={{ fontWeight: 900 }}>$ {usdTotal.toLocaleString()}</div>
          </div>
          <div style={styles.listContainer}>
            {USD_UNITS.map(v => (
              <div key={v} style={styles.rowItem}>
                <div style={styles.labelPill('#1b5e20', '#e8f5e9')}>${v}</div>
                <div style={styles.inputBox}>
                  <input
                    type="number"
                    value={usdCount[v] || ''}
                    onChange={(e) => updateUsdCount(v, parseInt(e.target.value) || 0)}
                    onClick={(e) => (e.target as HTMLInputElement).select()}
                    style={styles.input}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 科多巴 */}
        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <h2 style={{ color: '#e67e22', margin: 0 }}>科多巴 (NIO)</h2>
            <div style={{ fontWeight: 900 }}>C$ {nioTotal.toLocaleString()}</div>
          </div>
          <div style={styles.listContainer}>
            {NIO_UNITS.map(v => (
              <div key={v} style={styles.rowItem}>
                <div style={styles.labelPill('#e67e22', '#fff3e0')}>C${v}</div>
                <div style={styles.inputBox}>
                  <input
                    type="number"
                    value={nioCount[v] || ''}
                    onChange={(e) => updateNioCount(v, parseInt(e.target.value) || 0)}
                    onClick={(e) => (e.target as HTMLInputElement).select()}
                    style={styles.input}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 底部区域 */}
      <div style={styles.footer}>
        {/* 汇总 */}
        <div style={styles.summary}>
          <div>
            <div style={styles.sumLine}>
              <span>💵 美金合计:</span>
              <span style={{ color: '#4ade80', fontWeight: 'bold', fontSize: '1.2rem' }}>$ {usdTotal.toFixed(2)}</span>
            </div>
            <div style={styles.sumLine}>
              <span>🪙 科多巴合计:</span>
              <span style={{ color: '#fb923c', fontWeight: 'bold', fontSize: '1.2rem' }}>C$ {nioTotal.toFixed(2)}</span>
            </div>
          </div>
          
          <div style={styles.grandTotal}>
            <span style={styles.grandTotalLabel}>本次对账资产 (NIO)</span>
            <span style={styles.grandTotalValue}>
              {grandTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </span>
          </div>

          <button
            style={styles.btnSave(saveStatus)}
            onClick={handleSubmitHandover}
            disabled={saveStatus === 'saving'}
          >
            {saveStatus === 'saving' ? '\u4fdd\u5b58\u4e2d...' : saveStatus === 'saved' ? '\u5df2\u63d0\u4ea4' : '\u4fdd\u5b58\u63d0\u4ea4'}
          </button>
        </div>

        {/* 历史记录 */}
        <div style={styles.history}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>📊 历史记录</h3>
              <button style={styles.btnReset} onClick={resetInputs}>
                🗑️ 清空输入
              </button>
              {lastSyncedAt && (
                <span style={{ fontSize: '0.8rem', color: '#6b7280', whiteSpace: 'nowrap' }}>
                  {'\u6700\u540e\u540c\u6b65 '} {lastSyncedAt.toLocaleTimeString('es-NI', { hour12: false })}
                </span>
              )}
              <button
                style={{ ...styles.btnReset, background: isRefreshing ? '#9ca3af' : '#6366f1' }}
                onClick={refreshHandovers}
                disabled={isRefreshing}
              >
                {isRefreshing ? '\u540c\u6b65\u4e2d...' : '\u5237\u65b0\u4e91\u7aef\u6570\u636e'}
              </button>
            </div>
            <button
              style={{
                background: 'linear-gradient(135deg, #ff6b6b 0%, #ee5a6f 100%)',
                border: 'none',
                color: 'white',
                padding: '8px 16px',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '0.85rem',
                fontWeight: 'bold',
                boxShadow: '0 2px 8px rgba(238, 90, 111, 0.3)',
                transition: 'all 0.2s',
              }}
              onClick={handleClear}
            >
              🧹 清空历史
            </button>
          </div>
          <div style={styles.tableScroll}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={{ ...styles.td, whiteSpace: 'nowrap' }}>日期时间</th>
                  <th style={styles.th}>美金</th>
                  <th style={styles.th}>科多巴</th>
                  <th style={styles.th}>总计 (NIO)</th>
                  <th style={styles.th}>较上次误差</th>
                </tr>
              </thead>
              <tbody>
                {history.map((record, index) => (
                  <tr key={index}>
                    <td style={{ ...styles.td, whiteSpace: 'nowrap' }}>{record.t}</td>
                    <td style={styles.td}>${record.u}</td>
                    <td style={styles.td}>C${record.n}</td>
                    <td style={{ ...styles.td, fontWeight: 'bold' }}>C${record.g}</td>
                    <td
                      style={{
                        ...styles.td,
                        ...(record.diff.startsWith('+')
                          ? styles.diffUp
                          : record.diff.startsWith('-')
                          ? styles.diffDown
                          : {}),
                      }}
                    >
                      {record.diff}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
};

export default ShiftHandoverModule;
