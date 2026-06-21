import React, { useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { BackupExport, createFirestoreBackup, downloadBackupFile } from '../../services/backupExportService';
import { colors, font, radii, shadows } from '../../styles/uiTokens';

const cardStyle: React.CSSProperties = {
  background: colors.surface,
  border: `1px solid ${colors.border}`,
  borderRadius: radii.lg,
  padding: '1rem',
  boxShadow: shadows.soft,
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
    <div style={{ height: '100%', overflow: 'auto', padding: '1.1rem 1.25rem', background: colors.page, color: colors.textPrimary, fontFamily: font.family }}>
      <div style={{ maxWidth: '1100px', margin: '0 auto', display: 'grid', gap: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: font.title, color: colors.textPrimary, fontWeight: 720, letterSpacing: 0 }}>数据备份导出</h1>
            <p style={{ margin: '0.5rem 0 0', color: colors.textSecondary, fontSize: font.body, maxWidth: '760px', lineHeight: 1.55 }}>
              只读取 Firestore 云端数据并下载 JSON 文件，不会写入、恢复或覆盖任何数据，也不会把浏览器本地缓存打包成权威备份。
            </p>
          </div>
          <button
            onClick={handleCreateBackup}
            disabled={isExporting || !user}
            style={{
              padding: '0.75rem 1rem',
              border: `1px solid ${isExporting ? colors.textMuted : colors.blue}`,
              borderRadius: radii.md,
              background: isExporting ? colors.textMuted : colors.blue,
              color: 'white',
              fontWeight: 700,
              cursor: isExporting ? 'not-allowed' : 'pointer',
              minWidth: '160px',
              boxShadow: isExporting ? 'none' : '0 10px 22px rgba(37, 99, 235, 0.18)',
            }}
          >
            {isExporting ? '正在导出...' : '导出备份文件'}
          </button>
        </div>

        <div style={{ ...cardStyle, background: colors.amberSoft, borderColor: '#fcd34d', color: '#92400e' }}>
          <strong>备份范围：</strong>
          老板账号会导出全局数据和所有分店业务数据；分店账号只导出当前分店业务数据。图片文件本身不打包，菜品记录会保留 Firebase Storage 图片 URL 和路径。
        </div>

        {error && (
          <div style={{ ...cardStyle, background: colors.dangerSoft, borderColor: '#fecaca', color: '#991b1b' }}>
            导出失败：{error}
          </div>
        )}

        {backup && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.75rem' }}>
              <div style={cardStyle}>
                <div style={{ color: colors.textSecondary, fontSize: font.caption }}>总记录数</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: colors.blue }}>{backup.summary.totalRecords}</div>
              </div>
              <div style={cardStyle}>
                <div style={{ color: colors.textSecondary, fontSize: font.caption }}>分店数</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: colors.teal }}>{backup.summary.storeCount}</div>
              </div>
              <div style={cardStyle}>
                <div style={{ color: colors.textSecondary, fontSize: font.caption }}>分店集合</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: colors.amber }}>{backup.summary.storeCollections}</div>
              </div>
              <div style={cardStyle}>
                <div style={{ color: colors.textSecondary, fontSize: font.caption }}>读取失败</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: failedCollections.length ? colors.danger : colors.success }}>
                  {failedCollections.length}
                </div>
              </div>
            </div>

            <div style={cardStyle}>
              <h2 style={{ margin: '0 0 0.75rem', fontSize: '1.1rem' }}>导出信息</h2>
              <div style={{ display: 'grid', gap: '0.35rem', color: colors.textPrimary, fontSize: font.body }}>
                <div>导出时间：{new Date(backup.metadata.exportedAt).toLocaleString()}</div>
                <div>时区：{backup.metadata.timezone}</div>
                <div>导出账号：{backup.metadata.exportedBy.username} ({backup.metadata.exportedBy.role})</div>
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
                        borderBottom: `1px solid ${colors.border}`,
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
