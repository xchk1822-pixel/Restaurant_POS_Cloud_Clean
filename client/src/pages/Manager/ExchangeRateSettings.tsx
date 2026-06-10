import React, { useCallback, useEffect, useState } from 'react';
import { smartGetDocuments, smartSetDocument } from '../../services/smartSyncService';

interface ExchangeRateConfig {
  id: string;
  usdToNio: number;
  pointsToCurrency: number;
  lastUpdated: string;
  updatedBy?: string;
}

const STORAGE_KEY = 'global_exchange_rate';
const COLLECTION = 'exchange_rate';
const DOC_ID = 'global';

const defaultConfig = (): ExchangeRateConfig => ({
  id: DOC_ID,
  usdToNio: 36.5,
  pointsToCurrency: 100,
  lastUpdated: new Date().toISOString(),
});

const readLocalConfig = (): ExchangeRateConfig => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      return { ...defaultConfig(), ...JSON.parse(saved), id: DOC_ID };
    }
  } catch (error) {
    console.error('读取本地汇率配置失败:', error);
  }
  return defaultConfig();
};

const saveLocalConfig = (config: ExchangeRateConfig) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  window.dispatchEvent(new CustomEvent('exchangeRateUpdated', { detail: config }));
};

const ExchangeRateSettings: React.FC = () => {
  const [config, setConfig] = useState<ExchangeRateConfig>(() => readLocalConfig());
  const [tempConfig, setTempConfig] = useState<ExchangeRateConfig>(() => readLocalConfig());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);

  const refreshConfig = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const cloudConfigs = await smartGetDocuments(COLLECTION, true);
      const cloudConfig = cloudConfigs.find((item: any) => item.id === DOC_ID) || cloudConfigs[0];
      if (cloudConfig) {
        const nextConfig: ExchangeRateConfig = {
          ...defaultConfig(),
          ...cloudConfig,
          id: DOC_ID,
          usdToNio: Number(cloudConfig.usdToNio) || defaultConfig().usdToNio,
          pointsToCurrency: Number(cloudConfig.pointsToCurrency) || defaultConfig().pointsToCurrency,
        };
        setConfig(nextConfig);
        setTempConfig(nextConfig);
        saveLocalConfig(nextConfig);
      } else {
        const localConfig = readLocalConfig();
        setConfig(localConfig);
        setTempConfig(localConfig);
      }
      setLastSyncedAt(new Date());
    } catch (error) {
      console.error('刷新云端汇率失败:', error);
      const localConfig = readLocalConfig();
      setConfig(localConfig);
      setTempConfig(localConfig);
      alert('刷新云端汇率失败，请检查网络后重试');
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    refreshConfig();
  }, [refreshConfig]);

  const saveConfig = async () => {
    if (tempConfig.usdToNio <= 0 || tempConfig.pointsToCurrency <= 0) {
      alert('汇率和积分兑换比例必须大于 0');
      return;
    }

    try {
      const updatedConfig: ExchangeRateConfig = {
        ...tempConfig,
        id: DOC_ID,
        usdToNio: Number(tempConfig.usdToNio),
        pointsToCurrency: Number(tempConfig.pointsToCurrency),
        lastUpdated: new Date().toISOString(),
      };

      saveLocalConfig(updatedConfig);
      setConfig(updatedConfig);
      await smartSetDocument(COLLECTION, DOC_ID, updatedConfig);
      setLastSyncedAt(new Date());

      alert('汇率配置已保存，并同步到云端');
    } catch (error) {
      console.error('保存汇率配置失败:', error);
      alert('保存失败，请检查网络后重试');
    }
  };

  const resetToDefault = () => {
    if (window.confirm('确定要恢复默认汇率吗？')) {
      setTempConfig(defaultConfig());
    }
  };

  const styles = {
    container: {
      padding: '2rem',
      maxWidth: '820px',
      margin: '0 auto',
    },
    header: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: '1rem',
      marginBottom: '1.5rem',
      flexWrap: 'wrap' as const,
    },
    title: {
      fontSize: '1.875rem',
      fontWeight: 'bold',
      margin: 0,
      color: '#1f2937',
    },
    subtitle: {
      color: '#6b7280',
      margin: '0.5rem 0 0 0',
    },
    actions: {
      display: 'flex',
      alignItems: 'center',
      gap: '0.5rem',
      flexWrap: 'wrap' as const,
    },
    syncInfo: {
      fontSize: '0.8rem',
      color: '#6b7280',
      whiteSpace: 'nowrap' as const,
    },
    card: {
      background: 'white',
      borderRadius: '0.75rem',
      boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
      padding: '2rem',
      marginBottom: '1.5rem',
    },
    formGroup: {
      marginBottom: '1.5rem',
    },
    label: {
      display: 'block',
      fontWeight: '600',
      marginBottom: '0.5rem',
      color: '#374151',
    },
    input: {
      width: '100%',
      padding: '0.75rem',
      border: '1px solid #d1d5db',
      borderRadius: '0.375rem',
      fontSize: '1rem',
      outline: 'none',
    },
    helpText: {
      fontSize: '0.875rem',
      color: '#6b7280',
      marginTop: '0.5rem',
    },
    infoBox: {
      backgroundColor: '#eff6ff',
      borderLeft: '4px solid #3b82f6',
      padding: '1rem',
      borderRadius: '0.375rem',
      marginBottom: '1.5rem',
    },
    buttonGroup: {
      display: 'flex',
      gap: '1rem',
      marginTop: '2rem',
      flexWrap: 'wrap' as const,
    },
    btnPrimary: {
      flex: 1,
      minWidth: '180px',
      padding: '0.75rem 1.5rem',
      backgroundColor: '#3b82f6',
      color: 'white',
      border: 'none',
      borderRadius: '0.5rem',
      cursor: 'pointer',
      fontWeight: '600',
      fontSize: '1rem',
    },
    btnSecondary: {
      padding: '0.75rem 1.5rem',
      backgroundColor: '#6b7280',
      color: 'white',
      border: 'none',
      borderRadius: '0.5rem',
      cursor: 'pointer',
      fontWeight: '600',
      fontSize: '1rem',
    },
    btnRefresh: {
      padding: '0.55rem 1rem',
      backgroundColor: isRefreshing ? '#9ca3af' : '#6366f1',
      color: 'white',
      border: 'none',
      borderRadius: '0.5rem',
      cursor: isRefreshing ? 'not-allowed' : 'pointer',
      fontWeight: '600',
      fontSize: '0.875rem',
    },
    lastUpdated: {
      fontSize: '0.875rem',
      color: '#9ca3af',
      marginTop: '1rem',
      textAlign: 'right' as const,
    },
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>全局汇率设置</h1>
          <p style={styles.subtitle}>配置全系统通用汇率，保存后写入本地和云端。</p>
        </div>
        <div style={styles.actions}>
          {lastSyncedAt && (
            <span style={styles.syncInfo}>
              最后同步 {lastSyncedAt.toLocaleTimeString('es-NI', { hour12: false })}
            </span>
          )}
          <button
            type="button"
            onClick={refreshConfig}
            disabled={isRefreshing}
            style={styles.btnRefresh}
          >
            {isRefreshing ? '同步中...' : '刷新云端数据'}
          </button>
        </div>
      </div>

      <div style={styles.infoBox}>
        <strong>提示：</strong>
        <ul style={{ margin: '0.5rem 0 0 0', paddingLeft: '1.5rem' }}>
          <li>汇率会保存到浏览器本地缓存，并同步到 Firebase。</li>
          <li>POS 收银、交班对账、客户积分等页面会读取本地最新汇率。</li>
          <li>其他设备需要点击刷新云端数据后获取最新配置。</li>
        </ul>
      </div>

      <div style={styles.card}>
        <div style={styles.formGroup}>
          <label style={styles.label}>美元兑换尼加拉瓜科多巴 (USD 到 NIO)</label>
          <input
            type="number"
            step="0.01"
            value={tempConfig.usdToNio}
            onChange={(event) =>
              setTempConfig({ ...tempConfig, usdToNio: Number(event.target.value) || 0 })
            }
            style={styles.input}
            placeholder="例如：36.5"
          />
          <div style={styles.helpText}>
            1 美元 = C${tempConfig.usdToNio} 尼加拉瓜科多巴
          </div>
        </div>

        <div style={styles.formGroup}>
          <label style={styles.label}>积分兑换比例</label>
          <input
            type="number"
            step="1"
            value={tempConfig.pointsToCurrency}
            onChange={(event) =>
              setTempConfig({ ...tempConfig, pointsToCurrency: Number(event.target.value) || 0 })
            }
            style={styles.input}
            placeholder="例如：100"
          />
          <div style={styles.helpText}>
            {tempConfig.pointsToCurrency} 积分 = C$1
          </div>
        </div>

        <div style={styles.buttonGroup}>
          <button onClick={saveConfig} style={styles.btnPrimary}>
            保存配置
          </button>
          <button onClick={resetToDefault} style={styles.btnSecondary}>
            恢复默认
          </button>
        </div>

        <div style={styles.lastUpdated}>
          当前配置更新时间：{new Date(config.lastUpdated).toLocaleString('es-NI', { hour12: false })}
        </div>
      </div>
    </div>
  );
};

export default ExchangeRateSettings;
