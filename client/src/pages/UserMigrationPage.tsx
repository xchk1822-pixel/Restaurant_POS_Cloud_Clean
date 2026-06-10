import React, { useState } from 'react';
import { migrateAllUsers } from '../services/UserMigration';
import { useNavigate } from 'react-router-dom';

const UserMigrationPage: React.FC = () => {
  const navigate = useNavigate();
  const [isMigrating, setIsMigrating] = useState(false);
  const [result, setResult] = useState<{
    total: number;
    success: number;
    failed: number;
    errors: Array<{ username: string; error: string }>;
  } | null>(null);

  const handleMigrate = async () => {
    if (!window.confirm('⚠️ 确定要迁移所有用户到 Firebase Auth 吗？\n\n此操作不可逆！')) {
      return;
    }

    setIsMigrating(true);
    setResult(null);

    try {
      const migrationResult = await migrateAllUsers();
      setResult(migrationResult);
      
      if (migrationResult.failed === 0) {
        alert('✅ 用户迁移成功！\n\n现在可以使用新系统登录了。');
      } else {
        alert(`⚠️ 迁移完成，但有 ${migrationResult.failed} 个用户失败。\n\n请查看错误详情。`);
      }
    } catch (error) {
      console.error('❌ 迁移失败:', error);
      alert('❌ 迁移失败，请查看控制台错误信息');
    } finally {
      setIsMigrating(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      padding: '2rem',
      background: '#f3f4f6'
    }}>
      <div style={{
        maxWidth: '800px',
        margin: '0 auto',
        backgroundColor: 'white',
        borderRadius: '0.75rem',
        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
        padding: '2rem'
      }}>
        <h1 style={{ fontSize: '1.875rem', fontWeight: '800', color: '#111827', marginBottom: '1rem' }}>
          🔐 用户迁移工具
        </h1>
        
        <div style={{ marginBottom: '2rem', padding: '1rem', background: '#fef3c7', borderRadius: '0.5rem', border: '1px solid #fcd34d' }}>
          <h3 style={{ fontWeight: '600', color: '#92400e', marginBottom: '0.5rem' }}>⚠️ 重要提示</h3>
          <ul style={{ fontSize: '0.875rem', color: '#78350f', paddingLeft: '1.5rem' }}>
            <li>此工具将把 localStorage 中的用户迁移到 Firebase Authentication</li>
            <li>迁移后，用户将使用 Firebase Auth 进行登录验证</li>
            <li>用户名保持不变，密码也保持不变</li>
            <li>迁移过程可能需要几分钟时间</li>
            <li>建议在非营业时间执行此操作</li>
          </ul>
        </div>

        <button
          onClick={handleMigrate}
          disabled={isMigrating}
          style={{
            width: '100%',
            padding: '1rem',
            backgroundColor: isMigrating ? '#9ca3af' : '#2563eb',
            color: 'white',
            borderRadius: '0.5rem',
            fontWeight: '600',
            fontSize: '1rem',
            cursor: isMigrating ? 'not-allowed' : 'pointer',
            border: 'none',
            marginBottom: '2rem'
          }}
        >
          {isMigrating ? '🔄 迁移中...' : '🚀 开始迁移用户'}
        </button>

        {result && (
          <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '2rem' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: '700', marginBottom: '1rem' }}>
              📊 迁移结果
            </h2>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '2rem' }}>
              <div style={{ padding: '1rem', background: '#dbeafe', borderRadius: '0.5rem', textAlign: 'center' }}>
                <div style={{ fontSize: '2rem', fontWeight: '800', color: '#1e40af' }}>{result.total}</div>
                <div style={{ fontSize: '0.875rem', color: '#1e40af' }}>总用户数</div>
              </div>
              <div style={{ padding: '1rem', background: '#d1fae5', borderRadius: '0.5rem', textAlign: 'center' }}>
                <div style={{ fontSize: '2rem', fontWeight: '800', color: '#065f46' }}>{result.success}</div>
                <div style={{ fontSize: '0.875rem', color: '#065f46' }}>成功</div>
              </div>
              <div style={{ padding: '1rem', background: result.failed > 0 ? '#fee2e2' : '#d1fae5', borderRadius: '0.5rem', textAlign: 'center' }}>
                <div style={{ fontSize: '2rem', fontWeight: '800', color: result.failed > 0 ? '#991b1b' : '#065f46' }}>{result.failed}</div>
                <div style={{ fontSize: '0.875rem', color: result.failed > 0 ? '#991b1b' : '#065f46' }}>失败</div>
              </div>
            </div>

            {result.errors.length > 0 && (
              <div>
                <h3 style={{ fontWeight: '600', marginBottom: '1rem', color: '#dc2626' }}>❌ 错误详情</h3>
                <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                  {result.errors.map((err, index) => (
                    <div key={index} style={{
                      padding: '0.75rem',
                      marginBottom: '0.5rem',
                      background: '#fee2e2',
                      borderRadius: '0.375rem',
                      border: '1px solid #fecaca'
                    }}>
                      <div style={{ fontWeight: '600', color: '#991b1b' }}>{err.username}</div>
                      <div style={{ fontSize: '0.875rem', color: '#7f1d1d' }}>{err.error}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div style={{ marginTop: '2rem', paddingTop: '2rem', borderTop: '1px solid #e5e7eb' }}>
          <button
            onClick={() => navigate('/login')}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: '#6b7280',
              color: 'white',
              borderRadius: '0.375rem',
              fontWeight: '600',
              cursor: 'pointer',
              border: 'none'
            }}
          >
            ← 返回登录页面
          </button>
        </div>
      </div>
    </div>
  );
};

export default UserMigrationPage;
