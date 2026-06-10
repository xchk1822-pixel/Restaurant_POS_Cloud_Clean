import React, { useState } from 'react';
import { initializeDemoData } from '../services/initDemoData';

const DataInitTest: React.FC = () => {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const handleInit = async () => {
    if (!window.confirm('⚠️ 确定要初始化演示数据吗？这将向Firebase写入测试数据。')) {
      return;
    }

    setStatus('loading');
    setMessage('正在初始化数据...');

    try {
      const result = await initializeDemoData();
      setStatus('success');
      setMessage(`✅ 数据初始化成功！\n\n创建了:\n- ${result.storeIds.length} 个分店\n- 6 个用户账号\n- 20 个菜品\n- 7 个库存商品\n- 5 个客户\n- 6 个桌台\n\n现在可以开始测试了！`);
    } catch (error: any) {
      setStatus('error');
      setMessage(`❌ 初始化失败: ${error.message}`);
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
      borderRadius: '1rem',
      boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
      padding: '2rem',
      marginBottom: '1.5rem',
    },
    title: {
      fontSize: '2rem',
      fontWeight: 'bold',
      marginBottom: '1rem',
      color: '#1f2937',
    },
    description: {
      color: '#6b7280',
      lineHeight: '1.8',
      marginBottom: '2rem',
    },
    button: {
      width: '100%',
      padding: '1rem',
      backgroundColor: status === 'loading' ? '#9ca3af' : '#3b82f6',
      color: 'white',
      border: 'none',
      borderRadius: '0.5rem',
      cursor: status === 'loading' ? 'not-allowed' : 'pointer',
      fontWeight: '600',
      fontSize: '1.1rem',
      marginBottom: '1.5rem',
    },
    message: (type: string) => ({
      padding: '1rem',
      borderRadius: '0.5rem',
      backgroundColor: type === 'success' ? '#d1fae5' : type === 'error' ? '#fee2e2' : '#f3f4f6',
      color: type === 'success' ? '#065f46' : type === 'error' ? '#991b1b' : '#374151',
      whiteSpace: 'pre-line' as const,
      lineHeight: '1.6',
    }),
    info: {
      marginTop: '2rem',
      padding: '1.5rem',
      backgroundColor: '#eff6ff',
      borderRadius: '0.5rem',
      borderLeft: '4px solid #3b82f6',
    },
    infoTitle: {
      fontWeight: '600',
      marginBottom: '0.5rem',
      color: '#1e40af',
    },
    list: {
      marginLeft: '1.5rem',
      color: '#1e40af',
      lineHeight: '2',
    },
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>🧪 数据初始化测试</h1>
        <p style={styles.description}>
          此页面用于向Firebase Firestore写入真实的模拟数据，以便测试整个系统的功能。
          <br />
          数据包括：分店、用户账号、菜单菜品、库存商品、客户信息、桌台等。
        </p>

        <button 
          onClick={handleInit}
          disabled={status === 'loading'}
          style={styles.button}
        >
          {status === 'loading' ? '⏳ 正在初始化...' : '🚀 开始初始化演示数据'}
        </button>

        {message && (
          <div style={styles.message(status)}>
            {message}
          </div>
        )}
      </div>

      <div style={styles.info}>
        <div style={styles.infoTitle}>📋 将创建的数据：</div>
        <ul style={styles.list}>
          <li><strong>2个分店：</strong>马那瓜总店、莱昂分店</li>
          <li><strong>6个用户账号：</strong>
            <ul style={{ marginLeft: '1.5rem' }}>
              <li>admin / admin123（超级管理员）</li>
              <li>manager_mn001 / 123456（马那瓜店长）</li>
              <li>cashier_mn001_01 / 123456（收银员）</li>
              <li>waiter_mn001_01 / 123456（服务生）</li>
              <li>chef_mn001_01 / 123456（厨师）</li>
              <li>manager_ln002 / 123456（莱昂店长）</li>
            </ul>
          </li>
          <li><strong>20个菜品：</strong>主菜、小吃、汤类、主食、甜点、饮料、酒水</li>
          <li><strong>7个库存商品：</strong>肉类、海鲜、粮食、饮料、酒水</li>
          <li><strong>5个客户：</strong>带积分和消费记录</li>
          <li><strong>6个桌台：</strong>不同容量和状态</li>
        </ul>
      </div>

      <div style={{ ...styles.info, marginTop: '1rem', backgroundColor: '#fef3c7', borderLeftColor: '#f59e0b' }}>
        <div style={{ ...styles.infoTitle, color: '#92400e' }}>⚠️ 注意事项：</div>
        <ul style={{ ...styles.list, color: '#92400e' }}>
          <li>此操作会向Firebase写入数据，请确保网络连接正常</li>
          <li>初始化完成后，可以在各个模块查看和管理这些数据</li>
          <li>所有密码都是简单的测试密码，生产环境需要加密存储</li>
          <li>可以随时重新运行此脚本更新数据</li>
        </ul>
      </div>
    </div>
  );
};

export default DataInitTest;
