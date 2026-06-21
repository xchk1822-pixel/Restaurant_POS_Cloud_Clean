import React, { useCallback, useEffect, useState } from 'react';
import { smartGetDocuments, smartSetDocument } from '../../services/smartSyncService';
import { getExchangeRateStorageKey } from '../../utils/exchangeRate';
import { useAuth } from '../../contexts/AuthContext';
import { colors, font, radii, shadows } from '../../styles/uiTokens';

interface ExchangeRateConfig {
  id: string;
  usdToNio: number;
  pointsToCurrency: number;
  lastUpdated: string;
  updatedBy?: string;
}

interface StoreOption {
  id: string;
  name: string;
  code?: string;
}

const dedupeStoreOptions = (stores: StoreOption[]): StoreOption[] => {
  const map = new Map<string, StoreOption>();
  stores.forEach(store => {
    const code = String(store.code || '').trim().toLowerCase();
    const key = code ? `code:${code}` : `id:${store.id}`;
    if (!map.has(key)) {
      map.set(key, store);
    }
  });
  return Array.from(map.values());
};

const COLLECTION = 'exchange_rate';
const DOC_ID = 'global';

const defaultConfig = (): ExchangeRateConfig => ({
  id: DOC_ID,
  usdToNio: 36.5,
  pointsToCurrency: 100,
  lastUpdated: new Date().toISOString(),
});

const readLocalConfig = (storeId?: string): ExchangeRateConfig => {
  try {
    const saved = localStorage.getItem(getExchangeRateStorageKey(storeId));
    if (saved) {
      return { ...defaultConfig(), ...JSON.parse(saved), id: DOC_ID };
    }
  } catch (error) {
    console.error('读取本地汇率配置失败:', error);
  }
  return defaultConfig();
};

const saveLocalConfig = (config: ExchangeRateConfig, storeId?: string) => {
  localStorage.setItem(getExchangeRateStorageKey(storeId), JSON.stringify(config));
  window.dispatchEvent(new CustomEvent('exchangeRateUpdated', { detail: config }));
};

const ExchangeRateSettings: React.FC = () => {
  const { user } = useAuth();
  const [config, setConfig] = useState<ExchangeRateConfig>(() => readLocalConfig());
  const [tempConfig, setTempConfig] = useState<ExchangeRateConfig>(() => readLocalConfig());
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const targetStoreId = user?.storeId || selectedStoreId;

  const loadStores = useCallback(async () => {
    if (user?.role !== 'super_admin') return;
    try {
      const cloudStores = await smartGetDocuments('stores', true);
      const activeStores = dedupeStoreOptions(cloudStores
        .filter((store: any) => store?.id && store?.status !== 'inactive')
        .map((store: any) => ({
          id: String(store.id),
          name: String(store.name || store.id),
          code: store.code,
        })));
      setStores(activeStores);
      if (!selectedStoreId && activeStores[0]?.id) {
        setSelectedStoreId(activeStores[0].id);
      }
    } catch (error) {
      console.error('读取分店列表失败:', error);
    }
  }, [selectedStoreId, user?.role]);

  const refreshConfig = useCallback(async () => {
    setIsRefreshing(true);
    try {
      if (!targetStoreId) {
        const localConfig = readLocalConfig();
        setConfig(localConfig);
        setTempConfig(localConfig);
        setLastSyncedAt(new Date());
        return;
      }

      const collectionPath = `stores/${targetStoreId}/${COLLECTION}`;
      const cloudConfigs = await smartGetDocuments(collectionPath, true);
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
        saveLocalConfig(nextConfig, targetStoreId);
      } else {
        const localConfig = readLocalConfig(targetStoreId);
        setConfig(localConfig);
        setTempConfig(localConfig);
      }
      setLastSyncedAt(new Date());
    } catch (error) {
      console.error('刷新云端汇率失败:', error);
      const localConfig = readLocalConfig(targetStoreId);
      setConfig(localConfig);
      setTempConfig(localConfig);
      alert('刷新云端汇率失败，请检查网络后重试');
    } finally {
      setIsRefreshing(false);
    }
  }, [targetStoreId]);

  useEffect(() => {
    loadStores();
  }, [loadStores]);

  useEffect(() => {
    if (user?.role !== 'super_admin' || targetStoreId) {
      refreshConfig();
    }
  }, [refreshConfig, targetStoreId, user?.role]);

  const saveConfig = async () => {
    if (tempConfig.usdToNio <= 0 || tempConfig.pointsToCurrency <= 0) {
      alert('汇率和积分兑换比例必须大于 0');
      return;
    }

    if (!targetStoreId) {
      alert('请先选择分店后再保存汇率配置');
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

      await smartSetDocument(`stores/${targetStoreId}/${COLLECTION}`, DOC_ID, updatedConfig);
      saveLocalConfig(updatedConfig, targetStoreId);
      setConfig(updatedConfig);
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
      padding: '1.1rem 1.25rem',
      maxWidth: '820px',
      margin: '0 auto',
      color: colors.textPrimary,
      fontFamily: font.family,
    },
    header: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: '1rem',
      marginBottom: '1rem',
      flexWrap: 'wrap' as const,
    },
    title: {
      fontSize: font.title,
      fontWeight: 720,
      margin: 0,
      color: colors.textPrimary,
      letterSpacing: 0,
    },
    subtitle: {
      color: colors.textSecondary,
      margin: '0.5rem 0 0 0',
      fontSize: font.body,
    },
    actions: {
      display: 'flex',
      alignItems: 'center',
      gap: '0.5rem',
      flexWrap: 'wrap' as const,
    },
    syncInfo: {
      fontSize: font.caption,
      color: colors.textSecondary,
      whiteSpace: 'nowrap' as const,
      padding: '0.45rem 0.7rem',
      background: colors.surface,
      border: `1px solid ${colors.border}`,
      borderRadius: radii.pill,
    },
    card: {
      background: colors.surface,
      borderRadius: radii.lg,
      boxShadow: shadows.soft,
      border: `1px solid ${colors.border}`,
      padding: '1.25rem',
      marginBottom: '1rem',
    },
    formGroup: {
      marginBottom: '1.1rem',
    },
    label: {
      display: 'block',
      fontWeight: 700,
      marginBottom: '0.5rem',
      color: colors.textPrimary,
      fontSize: font.body,
    },
    input: {
      width: '100%',
      padding: '0.7rem 0.8rem',
      border: `1px solid ${colors.border}`,
      borderRadius: radii.md,
      fontSize: font.body,
      outline: 'none',
      color: colors.textPrimary,
      background: colors.surface,
    },
    helpText: {
      fontSize: font.caption,
      color: colors.textSecondary,
      marginTop: '0.5rem',
    },
    infoBox: {
      backgroundColor: colors.blueSoft,
      border: `1px solid ${colors.border}`,
      borderLeft: `4px solid ${colors.blue}`,
      padding: '1rem',
      borderRadius: radii.lg,
      marginBottom: '1rem',
      color: colors.textPrimary,
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
      backgroundColor: colors.blue,
      color: 'white',
      border: `1px solid ${colors.blue}`,
      borderRadius: radii.md,
      cursor: 'pointer',
      fontWeight: 700,
      fontSize: font.body,
      boxShadow: '0 10px 22px rgba(37, 99, 235, 0.18)',
    },
    btnSecondary: {
      padding: '0.75rem 1.5rem',
      backgroundColor: colors.surfaceMuted,
      color: colors.textPrimary,
      border: `1px solid ${colors.border}`,
      borderRadius: radii.md,
      cursor: 'pointer',
      fontWeight: 700,
      fontSize: font.body,
    },
    btnRefresh: {
      padding: '0.55rem 1rem',
      backgroundColor: isRefreshing ? colors.textMuted : colors.blue,
      color: 'white',
      border: `1px solid ${isRefreshing ? colors.textMuted : colors.blue}`,
      borderRadius: radii.md,
      cursor: isRefreshing ? 'not-allowed' : 'pointer',
      fontWeight: 700,
      fontSize: font.caption,
    },
    lastUpdated: {
      fontSize: font.caption,
      color: colors.textMuted,
      marginTop: '1rem',
      textAlign: 'right' as const,
    },
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>分店汇率设置</h1>
          <p style={styles.subtitle}>每个分店独立保存汇率和积分兑换规则。</p>
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
        {user?.role === 'super_admin' && (
          <div style={styles.formGroup}>
            <label style={styles.label}>选择分店</label>
            <select
              value={selectedStoreId}
              onChange={(event) => setSelectedStoreId(event.target.value)}
              style={styles.input}
            >
              <option value="">请选择分店</option>
              {stores.map(store => (
                <option key={store.id} value={store.id}>
                  {store.name}{store.code ? ` (${store.code})` : ''}
                </option>
              ))}
            </select>
            <div style={styles.helpText}>
              老板账号需要先选择分店，再查看或保存该分店的汇率配置。
            </div>
          </div>
        )}
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
