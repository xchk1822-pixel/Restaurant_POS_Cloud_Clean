import React, { useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { BackupExport, createFirestoreBackup, downloadBackupFile } from '../../services/backupExportService';

const cardStyle: React.CSSProperties = {
  background: 'white',
  border: '1px solid #e5e7eb',
  borderRadius: '0.5rem',
  padding: '1rem',
};

const DataBackup: React.FC = () => {
  const { user } = useAuth();
  const [isExporting, setIsExporting] = useState(false);
  const [backup, setBackup] = useState<BackupExport | null>(null);
  const [error, setError] = useState('');

  const failedCollections = useMemo(() => {
    if (!backup) return [];
    const globalErrors = Object.values(backup.global).filter(item => item.error);
    const storeErrors = Object.values(backup.stores).flatMap(store =>
      Object.values(store.collections).filter(item => item.error)
    );
    return [...globalErrors, ...storeErrors];
  }, [backup]);

  const handleCreateBackup = async () => {
    if (!user) return;
    setIsExporting(true);
    setError('');
    setBackup(null);
    try {
      const nextBackup = await createFirestoreBackup(user);
      setBackup(nextBackup);
      downloadBackupFile(nextBackup);
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div style={{ height: '100%', overflow: 'auto', padding: '0.25rem' }}>
      <div style={{ maxWidth: '1100px', margin: '0 auto', display: 'grid', gap: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.5rem', color: '#111827' }}>数据备份导出</h1>
            <p style={{ margin: '0.5rem 0 0', color: '#6b7280', fontSize: '0.9rem' }}>
              只读取云端和本机缓存并下载 JSON 文件，不会写入、恢复或覆盖任何数据。
            </p>
          </div>
          <button
            onClick={handleCreateBackup}
            disabled={isExporting || !user}
            style={{
              padding: '0.75rem 1rem',
              border: 'none',
              borderRadius: '0.5rem',
              background: isExporting ? '#9ca3af' : '#2563eb',
              color: 'white',
              fontWeight: 700,
              cursor: isExporting ? 'not-allowed' : 'pointer',
              minWidth: '160px',
            }}
          >
            {isExporting ? '正在导出...' : '导出备份文件'}
          </button>
        </div>

        <div style={{ ...cardStyle, background: '#fffbeb', borderColor: '#fcd34d', color: '#92400e' }}>
          <strong>备份范围：</strong>
          老板账号会导出全局数据、所有分店业务数据和当前浏览器里的餐厅本地缓存。图片文件本身不打包，菜品记录会保留 Firebase Storage 图片 URL 和路径。
        </div>

        {error && (
          <div style={{ ...cardStyle, background: '#fef2f2', borderColor: '#fecaca', color: '#991b1b' }}>
            导出失败：{error}
          </div>
        )}

        {backup && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.75rem' }}>
              <div style={cardStyle}>
                <div style={{ color: '#6b7280', fontSize: '0.8rem' }}>总记录数</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800 }}>{backup.summary.totalRecords}</div>
              </div>
              <div style={cardStyle}>
                <div style={{ color: '#6b7280', fontSize: '0.8rem' }}>分店数</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800 }}>{backup.summary.storeCount}</div>
              </div>
              <div style={cardStyle}>
                <div style={{ color: '#6b7280', fontSize: '0.8rem' }}>分店集合</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800 }}>{backup.summary.storeCollections}</div>
              </div>
              <div style={cardStyle}>
                <div style={{ color: '#6b7280', fontSize: '0.8rem' }}>读取失败</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: failedCollections.length ? '#dc2626' : '#059669' }}>
                  {failedCollections.length}
                </div>
              </div>
            </div>

            <div style={cardStyle}>
              <h2 style={{ margin: '0 0 0.75rem', fontSize: '1.1rem' }}>导出信息</h2>
              <div style={{ display: 'grid', gap: '0.35rem', color: '#374151', fontSize: '0.9rem' }}>
                <div>导出时间：{new Date(backup.metadata.exportedAt).toLocaleString()}</div>
                <div>时区：{backup.metadata.timezone}</div>
                <div>导出账号：{backup.metadata.exportedBy.username} ({backup.metadata.exportedBy.role})</div>
                <div>本地缓存键数量：{Object.keys(backup.localCache).length}</div>
              </div>
            </div>

            {failedCollections.length > 0 && (
              <div style={{ ...cardStyle, borderColor: '#fecaca' }}>
                <h2 style={{ margin: '0 0 0.75rem', fontSize: '1.1rem', color: '#991b1b' }}>读取失败集合</h2>
                <div style={{ display: 'grid', gap: '0.5rem' }}>
                  {failedCollections.map(item => (
                    <div key={item.path} style={{ fontSize: '0.85rem', color: '#7f1d1d' }}>
                      <strong>{item.path}</strong>：{item.error}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={cardStyle}>
              <h2 style={{ margin: '0 0 0.75rem', fontSize: '1.1rem' }}>分店摘要</h2>
              <div style={{ display: 'grid', gap: '0.5rem' }}>
                {Object.values(backup.stores).map(store => {
                  const count = Object.values(store.collections).reduce((sum, item) => sum + item.count, 0);
                  return (
                    <div
                      key={store.storeId}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        borderBottom: '1px solid #f3f4f6',
                        paddingBottom: '0.5rem',
                        gap: '1rem',
                      }}
                    >
                      <span>{store.storeId}</span>
                      <strong>{count} 条</strong>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default DataBackup;
