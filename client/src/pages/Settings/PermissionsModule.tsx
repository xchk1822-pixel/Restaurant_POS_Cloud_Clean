import React, { useCallback, useState, useEffect } from 'react';
import { smartGetDocuments, smartUpdateDocument } from '../../services/smartSyncService';
import { DEFAULT_ROLE_PERMISSIONS, PERMISSION_SCHEMA_VERSION, migrateRolePermissions } from '../../utils/permissions';
import { colors, font, radii, shadows } from '../../styles/uiTokens';

interface PermissionNode {
  id: string;
  name: string;
  icon: string;
  children?: PermissionNode[];
}

const PERMISSION_TREE: PermissionNode[] = [
  { id: 'dashboard', name: '老板仪表板', icon: '📊' },
  { id: 'pos', name: 'POS收银台', icon: '💰' },
  { id: 'waiter', name: '服务生点餐', icon: '🍽️' },
  { id: 'kitchen', name: '厨房显示', icon: '🍳' },
  {
    id: 'inventory', name: '库存管理', icon: '🏪',
    children: [
      { id: 'inventory:items', name: '物品管理', icon: '📋' },
      { id: 'inventory:menu', name: '菜品管理', icon: '🍽️' },
      { id: 'inventory:warehouse', name: '仓库盘点', icon: '🏪' },
      { id: 'inventory:fridge', name: '冰箱盘点', icon: '🧊' },
    ]
  },
  { id: 'suppliers:manage', name: '供应商管理', icon: 'SP' },
  { id: 'customers:manage', name: '客户管理', icon: 'CU' },
  {
    id: 'employees', name: '员工管理', icon: '👥',
    children: [
      { id: 'employees:profile', name: '员工档案', icon: '👤' },
      { id: 'employees:attendance', name: '考勤管理', icon: '📅' },
      { id: 'employees:loans', name: '借款管理', icon: '💸' },
      { id: 'employees:salary', name: '薪资结算', icon: '💰' },
    ]
  },
  {
    id: 'manager', name: '店长管理', icon: '🏢',
    children: [
      { id: 'manager:expenses', name: '开支记录', icon: '💸' },
      { id: 'manager:handover', name: '交班对账', icon: '🔄' },
      { id: 'manager:orders', name: '历史订单', icon: '📋' },
      { id: 'manager:reports', name: '财务报表', icon: '📈' },
      { id: 'manager:overview', name: '数据概览', icon: '📊' },
    ]
  },
  {
    id: 'settings', name: '系统设置', icon: '⚙️',
    children: [
      { id: 'settings:stores', name: '分店管理', icon: '🏪' },
      { id: 'settings:exchange', name: '汇率设置', icon: '💱' },
      { id: 'settings:permissions', name: '权限管理', icon: '🔐' },
      { id: 'settings:backup', name: '数据备份', icon: '💾' },
    ]
  },
  { id: 'reports', name: '报表中心', icon: '📈' }
];

interface Role {
  id: string;
  name: string;
  description: string;
  permissions: string[];
  permissionSchemaVersion?: number;
  color: string;
  icon: string;
}

const CANONICAL_ROLES: Role[] = [
  {
    id: 'store_manager',
    name: '店长',
    description: '分店经营管理权限',
    permissions: DEFAULT_ROLE_PERMISSIONS.store_manager,
    permissionSchemaVersion: PERMISSION_SCHEMA_VERSION,
    color: '#2563eb',
    icon: '🏢',
  },
  {
    id: 'cashier',
    name: '收银',
    description: 'POS收银权限',
    permissions: DEFAULT_ROLE_PERMISSIONS.cashier,
    permissionSchemaVersion: PERMISSION_SCHEMA_VERSION,
    color: '#16a34a',
    icon: '💰',
  },
  {
    id: 'waiter',
    name: '服务生',
    description: '服务生点餐权限',
    permissions: DEFAULT_ROLE_PERMISSIONS.waiter,
    permissionSchemaVersion: PERMISSION_SCHEMA_VERSION,
    color: '#f59e0b',
    icon: '🍽️',
  },
  {
    id: 'chef',
    name: '厨师',
    description: '厨房显示权限',
    permissions: DEFAULT_ROLE_PERMISSIONS.chef,
    permissionSchemaVersion: PERMISSION_SCHEMA_VERSION,
    color: '#ef4444',
    icon: '👨‍🍳',
  },
];

const ROLE_ALIAS: Record<string, string> = {
  store_manager: 'store_manager',
  manager: 'store_manager',
  店长: 'store_manager',
  cashier: 'cashier',
  收银: 'cashier',
  waiter: 'waiter',
  服务生: 'waiter',
  chef: 'chef',
  厨师: 'chef',
};

const getCanonicalRoleId = (role: any): string | null => {
  const candidates = [role?.id, role?.name].map(value => String(value || '').trim());
  for (const candidate of candidates) {
    if (ROLE_ALIAS[candidate]) return ROLE_ALIAS[candidate];
    const lower = candidate.toLowerCase();
    if (ROLE_ALIAS[lower]) return ROLE_ALIAS[lower];
  }
  return null;
};

const normalizeRoles = (cloudRoles: any[]): Role[] => {
  return CANONICAL_ROLES.map(defaultRole => {
    const matched = cloudRoles.find(role => getCanonicalRoleId(role) === defaultRole.id);
    const permissions = Array.isArray(matched?.permissions) && matched.permissions.length > 0
      ? migrateRolePermissions(defaultRole.id as any, matched.permissions, matched.permissionSchemaVersion)
      : defaultRole.permissions;

    return {
      ...defaultRole,
      permissionSchemaVersion: PERMISSION_SCHEMA_VERSION,
      permissions,
    };
  });
};

const ALL_PERMISSION_IDS: string[] = [];
const collectIds = (nodes: PermissionNode[]) => {
  nodes.forEach(n => {
    ALL_PERMISSION_IDS.push(n.id);
    if (n.children) collectIds(n.children);
  });
};
collectIds(PERMISSION_TREE);

const findNode = (nodes: PermissionNode[], id: string): PermissionNode | null => {
  for (const n of nodes) {
    if (n.id === id) return n;
    if (n.children) {
      const found = findNode(n.children, id);
      if (found) return found;
    }
  }
  return null;
};

const findParentNode = (nodes: PermissionNode[], childId: string): PermissionNode | null => {
  for (const node of nodes) {
    if (node.children?.some(child => child.id === childId)) {
      return node;
    }
    if (node.children) {
      const found = findParentNode(node.children, childId);
      if (found) return found;
    }
  }
  return null;
};

const areAllChildPermissionsSelected = (node: PermissionNode, selectedPermissions: string[]): boolean => {
  return Boolean(node.children?.every(child => selectedPermissions.includes(child.id)));
};

const PermissionsModule: React.FC = () => {
  const [roles, setRoles] = useState<Role[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState<string>('');
  const [showForm, setShowForm] = useState(false);
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(
    new Set(['inventory', 'employees', 'manager', 'settings'])
  );

  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formIcon, setFormIcon] = useState('👤');
  const [formColor, setFormColor] = useState('#3b82f6');
  const [formPerms, setFormPerms] = useState<string[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);

  const refreshRoles = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const cloudRoles = await smartGetDocuments('system_roles', true);
      const normalized = normalizeRoles(cloudRoles);
      localStorage.setItem('system_roles', JSON.stringify(normalized));
      setRoles(normalized);
      setLastSyncedAt(new Date());
    } catch (error) {
      console.error('\u5237\u65b0\u6743\u9650\u89d2\u8272\u5931\u8d25:', error);
      const saved = localStorage.getItem('system_roles');
      setRoles(saved ? normalizeRoles(JSON.parse(saved)) : normalizeRoles([]));
      alert('\u5237\u65b0\u6743\u9650\u89d2\u8272\u5931\u8d25\uff0c\u8bf7\u68c0\u67e5\u7f51\u7edc\u540e\u91cd\u8bd5');
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    refreshRoles();
  }, [refreshRoles]);

  const togglePerm = (permId: string) => {
    setFormPerms(prev => {
      const isChecked = prev.includes(permId);
      
      let next: string[];
      
      if (!isChecked) {
        // ✅ 勾选：添加该节点及其所有子节点
        next = [...prev];
        
        const addNodeAndChildren = (nodeId: string) => {
          if (!next.includes(nodeId)) {
            next.push(nodeId);
          }
          const node = findNode(PERMISSION_TREE, nodeId);
          if (node && node.children) {
            node.children.forEach(child => addNodeAndChildren(child.id));
          }
        };
        addNodeAndChildren(permId);

        // ✅ 检查父节点是否应该自动勾选（所有子节点都已勾选）
        let currentNode = permId;
        while (true) {
          const parent = findParentNode(PERMISSION_TREE, currentNode);
          if (!parent) break;
          
          const allChildrenChecked = areAllChildPermissionsSelected(parent, next);
          if (allChildrenChecked && !next.includes(parent.id)) {
            next.push(parent.id);
          }
          currentNode = parent.id;
        }
      } else {
        // ❌ 取消勾选：移除该节点及其所有子节点
        next = prev.filter(id => id !== permId);
        
        const removeNodeAndChildren = (nodeId: string) => {
          const node = findNode(PERMISSION_TREE, nodeId);
          if (node && node.children) {
            node.children.forEach(child => {
              const idx = next.indexOf(child.id);
              if (idx >= 0) {
                next.splice(idx, 1);
              }
            });
          }
        };
        removeNodeAndChildren(permId);

        // ❌ 取消父节点
        let currentNode = permId;
        while (true) {
          const parent = findParentNode(PERMISSION_TREE, currentNode);
          if (!parent) break;
          
          const idx = next.indexOf(parent.id);
          if (idx >= 0) {
            next.splice(idx, 1);
          }
          
          currentNode = parent.id;
        }
      }

      return next;
    });
  };

  const handleSelectRole = (role: Role) => {
    setSelectedRoleId(role.id);
    setEditingRoleId(role.id); // ✅ 确保设置 editingRoleId
    setFormName(role.name);
    setFormDesc(role.description);
    setFormIcon(role.icon);
    setFormColor(role.color);
    setFormPerms([...role.permissions]);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!formName.trim()) {
      alert('\u8bf7\u8f93\u5165\u89d2\u8272\u540d\u79f0');
      return;
    }

    if (!editingRoleId) {
      alert('\u89d2\u8272\u5df2\u56fa\u5b9a\u4e3a\u5e97\u957f\u3001\u6536\u94f6\u3001\u670d\u52a1\u751f\u3001\u53a8\u5e08\uff0c\u8bf7\u9009\u62e9\u5df2\u6709\u89d2\u8272\u4fee\u6539\u6743\u9650\u3002');
      return;
    }

    const roleData: Role = {
      id: editingRoleId,
      name: formName.trim(),
      description: formDesc.trim(),
      icon: formIcon,
      color: formColor,
      permissionSchemaVersion: PERMISSION_SCHEMA_VERSION,
      permissions: formPerms,
    };

    try {
      const newRoles = roles.map(r => r.id === editingRoleId ? roleData : r);
      await smartUpdateDocument('system_roles', editingRoleId, roleData);
      localStorage.setItem('system_roles', JSON.stringify(newRoles));
      setRoles(newRoles);
      setLastSyncedAt(new Date());
      setShowForm(false);
      setEditingRoleId(null);
      setSelectedRoleId('');
    } catch (error) {
      console.error('save role failed:', error);
      alert('\u4fdd\u5b58\u5931\u8d25: ' + (error as Error).message);
    }
  };

  const toggleExpand = (nodeId: string) => {
    setExpandedNodes(prev => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  };

  const renderTree = (nodes: PermissionNode[], level: number) => {
    return nodes.map(node => {
      const hasChild = !!(node.children && node.children.length > 0);
      const isExpanded = expandedNodes.has(node.id);
      const isChecked = formPerms.includes(node.id);

      return (
        <div key={node.id} style={{ marginBottom: '0.25rem' }}>
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              padding: level === 0 ? '0.5rem 0.75rem' : '0.4rem 0.75rem 0.4rem 2.5rem',
              backgroundColor: level === 0 ? '#f9fafb' : 'transparent',
              borderRadius: '0.375rem',
              cursor: hasChild ? 'pointer' : 'default',
              userSelect: 'none',
            }}
            onClick={() => hasChild && toggleExpand(node.id)}
          >
            {hasChild ? (
              <span style={{ fontSize: '0.7rem', color: '#9ca3af', width: '0.8rem' }}>{isExpanded ? '-' : '+'}</span>
            ) : (
              <span style={{ width: '0.8rem' }} />
            )}
            <input
              type="checkbox"
              checked={isChecked}
              onChange={() => togglePerm(node.id)}
              onClick={(e) => e.stopPropagation()}
              style={{ cursor: 'pointer', width: '16px', height: '16px' }}
            />
            <span style={{ fontSize: '1.1rem' }}>{node.icon}</span>
            <span style={{ fontWeight: level === 0 ? 600 : 400, fontSize: '0.875rem', color: '#374151' }}>
              {node.name}
            </span>
          </div>
          {hasChild && isExpanded && (
            <div>{renderTree(node.children!, level + 1)}</div>
          )}
        </div>
      );
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '1.1rem 1.25rem', background: colors.page, color: colors.textPrimary, fontFamily: font.family }}>
      {/* 头部 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem', flexShrink: 0, gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: font.title, fontWeight: 720, color: colors.textPrimary, margin: 0, letterSpacing: 0 }}>权限管理</h1>
          <div style={{ color: colors.textSecondary, fontSize: font.caption, marginTop: '0.35rem' }}>
            固定角色：店长 / 收银 / 服务生 / 厨师
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          {lastSyncedAt && (
            <span style={{ fontSize: font.caption, color: colors.textSecondary, whiteSpace: 'nowrap', padding: '0.45rem 0.7rem', background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: radii.pill }}>
              最后同步 {lastSyncedAt.toLocaleTimeString('es-NI', { hour12: false })}
            </span>
          )}
          <button
            onClick={refreshRoles}
            disabled={isRefreshing}
            style={{
              padding: '0.45rem 0.9rem',
              backgroundColor: isRefreshing ? colors.textMuted : colors.blue,
              color: 'white',
              border: `1px solid ${isRefreshing ? colors.textMuted : colors.blue}`,
              borderRadius: radii.md,
              cursor: isRefreshing ? 'not-allowed' : 'pointer',
              fontWeight: 700,
              fontSize: font.caption,
              boxShadow: isRefreshing ? 'none' : '0 10px 22px rgba(37, 99, 235, 0.18)',
            }}
          >
            {isRefreshing ? '同步中...' : '刷新云端数据'}
          </button>
        </div>
      </div>

      {/* 主体：左侧角色列表 + 右侧权限配置 */}
      <div style={{ display: 'flex', gap: '1rem', flex: 1, overflow: 'hidden' }}>
        {/* 左侧 */}
        <div style={{ width: '280px', flexShrink: 0, background: colors.surface, borderRadius: radii.lg, boxShadow: shadows.soft, border: `1px solid ${colors.border}`, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '1rem 1.25rem', borderBottom: `1px solid ${colors.border}`, fontWeight: 700, fontSize: font.body }}>
            角色列表 ({roles.length})
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '0.75rem' }}>
            {roles.length === 0 && (
              <div style={{ textAlign: 'center', padding: '2rem', color: colors.textMuted }}>
                暂无角色数据，请点击刷新云端数据
              </div>
            )}
            {roles.map(role => (
              <div
                key={role.id}
                onClick={() => handleSelectRole(role)}
                style={{
                  padding: '0.75rem',
                  marginBottom: '0.5rem',
                  borderRadius: radii.md,
                  cursor: 'pointer',
                  border: selectedRoleId === role.id ? `2px solid ${colors.blue}` : `1px solid ${colors.border}`,
                  borderLeftWidth: '4px',
                  borderLeftStyle: 'solid',
                  borderLeftColor: role.color,
                  backgroundColor: selectedRoleId === role.id ? colors.blueSoft : colors.surface,
                  transition: 'all 0.15s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                  <span style={{ fontSize: '1.25rem' }}>{role.icon}</span>
                  <span style={{ fontWeight: 700, fontSize: font.body }}>{role.name}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: font.caption, color: colors.textSecondary }}>{role.description}</span>
                  <span style={{ fontSize: '0.7rem', color: colors.textSecondary, backgroundColor: colors.surfaceMuted, padding: '0.15rem 0.5rem', borderRadius: radii.pill }}>
                    {role.permissions.length} 项
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 右侧 */}
        <div style={{ flex: 1, background: colors.surface, borderRadius: radii.lg, boxShadow: shadows.soft, border: `1px solid ${colors.border}`, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {!showForm ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: colors.textMuted }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>👈</div>
                <div style={{ fontSize: '1rem' }}>请点击左侧角色修改权限</div>
              </div>
            </div>
          ) : (
            <>
              {/* 表单区 */}
              <div style={{ padding: '1.25rem 1.5rem', borderBottom: `1px solid ${colors.border}`, flexShrink: 0, background: colors.surfaceMuted }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <span style={{ fontWeight: 600, fontSize: '1rem' }}>
                    编辑: {formName}
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 80px 50px', gap: '0.75rem', alignItems: 'end' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: font.caption, fontWeight: 700, color: colors.textSecondary, marginBottom: '0.25rem' }}>角色名称 *</label>
                    <input value={formName} onChange={e => setFormName(e.target.value)} placeholder="例如：服务员" style={{ width: '100%', padding: '0.5rem 0.65rem', border: `1px solid ${colors.border}`, borderRadius: radii.sm, fontSize: font.caption }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: font.caption, fontWeight: 700, color: colors.textSecondary, marginBottom: '0.25rem' }}>描述</label>
                    <input value={formDesc} onChange={e => setFormDesc(e.target.value)} placeholder="角色职责" style={{ width: '100%', padding: '0.5rem 0.65rem', border: `1px solid ${colors.border}`, borderRadius: radii.sm, fontSize: font.caption }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: font.caption, fontWeight: 700, color: colors.textSecondary, marginBottom: '0.25rem' }}>图标</label>
                    <input value={formIcon} onChange={e => setFormIcon(e.target.value)} style={{ width: '100%', padding: '0.5rem 0.65rem', border: `1px solid ${colors.border}`, borderRadius: radii.sm, fontSize: font.caption, textAlign: 'center' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: font.caption, fontWeight: 700, color: colors.textSecondary, marginBottom: '0.25rem' }}>色</label>
                    <input type="color" value={formColor} onChange={e => setFormColor(e.target.value)} style={{ width: '100%', height: '2.15rem', padding: 0, border: `1px solid ${colors.border}`, borderRadius: radii.sm, cursor: 'pointer' }} />
                  </div>
                </div>
              </div>

              {/* 权限树 */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.5rem' }}>
                {renderTree(PERMISSION_TREE, 0)}
              </div>

              {/* 底部按钮 */}
              <div style={{ padding: '1rem 1.5rem', borderTop: `1px solid ${colors.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                <span style={{ fontSize: font.caption, color: colors.textSecondary }}>
                  已选 {formPerms.length} 项权限
                </span>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    onClick={() => { setShowForm(false); setSelectedRoleId(''); setEditingRoleId(null); }}
                    style={{ padding: '0.5rem 1rem', backgroundColor: colors.surfaceMuted, color: colors.textPrimary, border: `1px solid ${colors.border}`, borderRadius: radii.md, cursor: 'pointer', fontWeight: 650, fontSize: font.caption }}
                  >
                    取消
                  </button>
                  <button
                    onClick={handleSave}
                    style={{ padding: '0.5rem 1.5rem', backgroundColor: colors.success, color: 'white', border: `1px solid ${colors.success}`, borderRadius: radii.md, cursor: 'pointer', fontWeight: 700, fontSize: font.caption }}
                  >
                    💾 保存
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default PermissionsModule;
