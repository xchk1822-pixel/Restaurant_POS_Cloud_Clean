import React, { useState, useEffect } from 'react';
import { dataService } from '../../services/DataService';

interface ExchangeRateConfig {
  usdToNio: number; // 1美元 = ? 尼加拉瓜科多巴
  pointsToCurrency: number; // 多少积分 = 1货币单位
  lastUpdated: string;
  updatedBy?: string;
}

const ExchangeRateSettings: React.FC = () => {
  const [config, setConfig] = useState<ExchangeRateConfig>({
    usdToNio: 36.5,
    pointsToCurrency: 100,
    lastUpdated: new Date().toISOString(),
  });

  const [tempConfig, setTempConfig] = useState<ExchangeRateConfig>(config);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = () => {
    try {
      const saved = localStorage.getItem('global_exchange_rate');
      if (saved) {
        const parsed = JSON.parse(saved);
        setConfig(parsed);
        setTempConfig(parsed);
      }
    } catch (e) {
      console.error('加载汇率配置失败:', e);
    }
  };

  const saveConfig = () => {
    try {
      const updatedConfig = {
        ...tempConfig,
        lastUpdated: new Date().toISOString(),
      };
      
      dataService.saveData('exchange_rate', [updatedConfig]);
      setConfig(updatedConfig);
      
      // 通知其他组件更新（通过自定义事件）
      window.dispatchEvent(new CustomEvent('exchangeRateUpdated', { detail: updatedConfig }));
      
      alert('✅ 汇率配置已保存，全系统生效！');
    } catch (e) {
      console.error('保存汇率配置失败:', e);
      alert('❌ 保存失败');
    }
  };

  const resetToDefault = () => {
    if (window.confirm('确定要恢复默认汇率吗？')) {
      const defaultConfig: ExchangeRateConfig = {
        usdToNio: 36.5,
        pointsToCurrency: 100,
        lastUpdated: new Date().toISOString(),
      };
      setTempConfig(defaultConfig);
    }
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
      padding: '2rem',
      marginBottom: '1.5rem',
    },
    title: {
      fontSize: '1.875rem',
      fontWeight: 'bold',
      marginBottom: '0.5rem',
      color: '#1f2937',
    },
    subtitle: {
      color: '#6b7280',
      marginBottom: '2rem',
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
    },
    btnPrimary: {
      flex: 1,
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
    lastUpdated: {
      fontSize: '0.875rem',
      color: '#9ca3af',
      marginTop: '1rem',
      textAlign: 'right' as const,
    },
  };

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>💱 全局汇率设置</h1>
      <p style={styles.subtitle}>配置全系统通用的汇率，所有页面自动同步</p>

      <div style={styles.infoBox}>
        <strong>💡 提示：</strong>
        <ul style={{ margin: '0.5rem 0 0 0', paddingLeft: '1.5rem' }}>
          <li>此处设置的汇率将在整个系统中生效</li>
          <li>POS收银、交接班、客户管理等页面会自动使用此汇率</li>
          <li>修改后无需刷新页面，实时生效</li>
        </ul>
      </div>

      <div style={styles.card}>
        <div style={styles.formGroup}>
          <label style={styles.label}>美元兑尼加拉瓜科多巴 (USD → NIO)</label>
          <input
            type="number"
            step="0.01"
            value={tempConfig.usdToNio}
            onChange={(e) => setTempConfig({ ...tempConfig, usdToNio: parseFloat(e.target.value) || 0 })}
            style={styles.input}
            placeholder="例如：36.5"
          />
          <div style={styles.helpText}>
            1美元 = C${tempConfig.usdToNio} 尼加拉瓜科多巴
          </div>
        </div>

        <div style={styles.formGroup}>
          <label style={styles.label}>积分兑换率</label>
          <input
            type="number"
            step="1"
            value={tempConfig.pointsToCurrency}
            onChange={(e) => setTempConfig({ ...tempConfig, pointsToCurrency: parseInt(e.target.value) || 0 })}
            style={styles.input}
            placeholder="例如：100"
          />
          <div style={styles.helpText}>
            {tempConfig.pointsToCurrency} 积分 = C$1
          </div>
        </div>

        <div style={styles.buttonGroup}>
          <button onClick={saveConfig} style={styles.btnPrimary}>
            💾 保存配置
          </button>
          <button onClick={resetToDefault} style={styles.btnSecondary}>
            🔄 恢复默认
          </button>
        </div>

        <div style={styles.lastUpdated}>
          上次更新：{new Date(config.lastUpdated).toLocaleString('zh-CN')}
        </div>
      </div>

      {/* 使用说明 */}
      <div style={styles.card}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '1rem' }}>📖 使用说明</h2>
        
        <div style={{ lineHeight: '2' }}>
          <h3 style={{ fontWeight: '600', marginTop: '1rem', marginBottom: '0.5rem' }}>1. POS收银台</h3>
          <ul style={{ paddingLeft: '1.5rem', color: '#4b5563' }}>
            <li>混合支付时，美元金额会自动按此汇率转换为科多巴</li>
            <li>显示参考金额帮助收银员核对</li>
          </ul>

          <h3 style={{ fontWeight: '600', marginTop: '1rem', marginBottom: '0.5rem' }}>2. 交接班报表</h3>
          <ul style={{ paddingLeft: '1.5rem', color: '#4b5563' }}>
            <li>统计总收入时，美元部分会按此汇率转换</li>
            <li>确保财务数据准确性</li>
          </ul>

          <h3 style={{ fontWeight: '600', marginTop: '1rem', marginBottom: '0.5rem' }}>3. 客户积分</h3>
          <ul style={{ paddingLeft: '1.5rem', color: '#4b5563' }}>
            <li>积分兑换现金券时按此比率计算</li>
            <li>会员消费累积积分也基于此比率</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default ExchangeRateSettings;
