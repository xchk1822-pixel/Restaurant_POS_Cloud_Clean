import React, { useState } from 'react';
import { smartAddDocument, smartUpdateDocument } from '../../services/smartSyncService';
import { dataManager } from '../../services/dataManager';
import { filterActiveEmployees } from '../../utils/employeeRecords';
import { resolveMonthlySalary } from '../../utils/employeeSalary';
import { colors, font, radii, shadows } from '../../styles/uiTokens';
import { useI18n } from '../../i18n/I18nContext';

interface Employee {
  id: string;
  name: string;
  phone: string;
  position: string;
  department: string;
  hireDate: string;
  status: 'active' | 'inactive';
  dailyRate: number;
  monthlySalary?: number;
  overtimeRate: number;
  avatar?: string;
  notes?: string;
}

interface EmployeeListProps {
  employees: Employee[];
  setEmployees: React.Dispatch<React.SetStateAction<Employee[]>>;
}

const EmployeeList: React.FC<EmployeeListProps> = ({ employees, setEmployees }) => {
  const { t } = useI18n();
  const [showAddEmployee, setShowAddEmployee] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [formData, setFormData] = useState<Partial<Employee>>({
    name: '',
    phone: '',
    position: '',
    department: '',
    hireDate: new Date().toISOString().split('T')[0],
    status: 'active',
    monthlySalary: 0,
    overtimeRate: 0,
  });

  const handleSaveEmployee = async () => {
    if (!formData.name || !formData.phone || !formData.position) {
      alert(t('employee.alert.required'));
      return;
    }

    const employee: Employee = {
      id: editingEmployee?.id || Date.now().toString(),
      name: formData.name || '',
      phone: formData.phone || '',
      position: formData.position || '',
      department: formData.department || '',
      hireDate: formData.hireDate || new Date().toISOString().split('T')[0],
      status: formData.status || 'active',
      monthlySalary: formData.monthlySalary || 0,
      dailyRate: (formData.monthlySalary || 0) / 30,
      overtimeRate: formData.overtimeRate || 0,
      notes: formData.notes,
    };

    let updatedEmployees;
    if (editingEmployee) {
      updatedEmployees = employees.map(emp => emp.id === employee.id ? employee : emp);
    } else {
      updatedEmployees = [...employees, employee];
    }

    try {
      if (editingEmployee) {
        await smartUpdateDocument('employees', employee.id, employee);
      } else {
        await smartAddDocument('employees', employee);
      }
    } catch (error) {
      console.error('sync employee to Firestore failed:', error);
      alert(t('employee.alert.saveFailed'));
      return;
    }
    setEmployees(updatedEmployees);
    await dataManager.saveData('employees', filterActiveEmployees(updatedEmployees), {
      syncFirestore: false,
      notify: false,
    });
    setShowAddEmployee(false);
    setEditingEmployee(null);
    setFormData({
      name: '',
      phone: '',
      position: '',
      department: '',
      hireDate: new Date().toISOString().split('T')[0],
      status: 'active',
      monthlySalary: 0,
      overtimeRate: 0,
    });
  };

  const handleDeleteEmployee = async (id: string) => {
    if (!window.confirm(t('employee.confirm.delete'))) return;
    
    // 🔥 先计算更新后的数据
    const employee = employees.find(emp => emp.id === id);
    if (!employee) return;
    const deletedEmployee = {
      ...employee,
      status: 'inactive' as const,
      isDeleted: true,
      deletedAt: Date.now(),
    };
    const updated = [...employees.filter(emp => emp.id !== id), deletedEmployee];
    
    // 🔥 先从 Firestore 删除
    try {
      await smartUpdateDocument('employees', id, deletedEmployee);
      await smartUpdateDocument('employee_deletions', id, {
        id,
        employeeId: id,
        deletedAt: deletedEmployee.deletedAt,
      });
      const activeEmployees = filterActiveEmployees(updated);
      await dataManager.saveData('employees', activeEmployees, {
        syncFirestore: false,
        notify: false,
      });
      setEmployees(activeEmployees);
    } catch (error) {
      console.error('delete employee from Firestore failed:', error);
      alert(t('employee.alert.deleteFailed'));
    }
  };

  const positionLabels: Record<string, string> = {
    '收银员': t('employee.position.cashier'),
    '服务员': t('employee.position.waiter'),
    '厨师': t('employee.position.chef'),
    '帮厨': t('employee.position.kitchenAssistant'),
    '店长': t('employee.position.manager'),
    '副店长': t('employee.position.assistantManager'),
  };
  const departmentLabels: Record<string, string> = {
    '前厅': t('employee.department.front'),
    '后厨': t('employee.department.kitchen'),
    '管理': t('employee.department.management'),
  };

  const styles = {
    card: {
      background: colors.surface,
      borderRadius: radii.lg,
      boxShadow: shadows.soft,
      border: `1px solid ${colors.border}`,
      marginBottom: '1rem',
      display: 'flex',
      flexDirection: 'column' as const,
      height: '100%',
    },
    cardContent: {
      padding: '1rem',
      flex: 1,
      display: 'flex',
      flexDirection: 'column' as const,
      overflow: 'hidden' as const,
    },
    btn: (bg: string) => ({
      padding: '0.58rem 1rem',
      background: bg,
      color: colors.surface,
      border: 'none',
      borderRadius: radii.md,
      cursor: 'pointer',
      fontWeight: 700,
      fontSize: font.body,
    }),
    table: {
      width: '100%',
      borderCollapse: 'collapse' as const,
      fontSize: font.body,
      background: colors.surface,
    },
    th: {
      background: colors.surfaceMuted,
      padding: '0.78rem 0.85rem',
      textAlign: 'left' as const,
      fontSize: font.caption,
      fontWeight: 700,
      color: colors.textSecondary,
      borderBottom: `1px solid ${colors.border}`,
      position: 'sticky' as const,
      top: 0,
      zIndex: 10,
    },
    td: {
      padding: '0.82rem 0.85rem',
      borderBottom: `1px solid ${colors.border}`,
      color: colors.textPrimary,
    },
    badge: (color: string) => ({
      padding: '0.25rem 0.75rem',
      background: color,
      color: colors.surface,
      borderRadius: radii.pill,
      fontSize: font.caption,
      fontWeight: 700,
    }),
    modal: {
      position: 'fixed' as const,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(15, 23, 42, 0.45)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
    },
    modalContent: {
      background: colors.surface,
      borderRadius: radii.lg,
      padding: '1.35rem',
      maxWidth: '600px',
      width: '90%',
      maxHeight: '80vh',
      overflow: 'auto',
      boxShadow: shadows.lift,
    },
    formGroup: {
      marginBottom: '1rem',
    },
    label: {
      display: 'block',
      marginBottom: '0.5rem',
      fontWeight: 700,
      color: colors.textPrimary,
      fontSize: font.body,
    },
    input: {
      width: '100%',
      padding: '0.68rem 0.75rem',
      border: `1px solid ${colors.borderStrong}`,
      borderRadius: radii.md,
      fontSize: font.body,
      color: colors.textPrimary,
      boxSizing: 'border-box' as const,
    },
    select: {
      width: '100%',
      padding: '0.68rem 0.75rem',
      border: `1px solid ${colors.borderStrong}`,
      borderRadius: radii.md,
      fontSize: font.body,
      color: colors.textPrimary,
      background: colors.surface,
      boxSizing: 'border-box' as const,
    },
    grid2: {
      display: 'grid',
      gridTemplateColumns: 'repeat(2, 1fr)',
      gap: '1rem',
    },
  };

  return (
    <div style={styles.card}>
      <div style={styles.cardContent}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexShrink: 0, gap: '0.75rem', flexWrap: 'wrap' }}>
          <h2 style={{ fontSize: font.section, fontWeight: 750, margin: 0, color: colors.textPrimary }}>👥 {t('employee.listTitle')}</h2>
          <button onClick={() => setShowAddEmployee(true)} style={styles.btn(colors.teal)}>
            ➕ {t('employee.add')}
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto' }}>
        {employees.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: colors.textMuted }}>
            <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>👤</div>
            <div>{t('employee.empty')}</div>
          </div>
        ) : (
          <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>{t('employee.name')}</th>
                  <th style={styles.th}>{t('employee.phone')}</th>
                  <th style={styles.th}>{t('employee.position')}</th>
                  <th style={styles.th}>{t('employee.department')}</th>
                  <th style={styles.th}>{t('employee.hireDate')}</th>
                  <th style={styles.th}>{t('employee.dailySalary')}</th>
                  <th style={styles.th}>{t('employee.status')}</th>
                  <th style={styles.th}>{t('employee.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {employees.map((emp) => (
                  <tr key={emp.id}>
                    <td style={{ ...styles.td, fontWeight: '600' }}>{emp.name}</td>
                    <td style={styles.td}>{emp.phone}</td>
                    <td style={styles.td}>{positionLabels[emp.position] || emp.position}</td>
                    <td style={styles.td}>{departmentLabels[emp.department] || emp.department || '-'}</td>
                    <td style={styles.td}>{emp.hireDate}</td>
                    <td style={{ ...styles.td, fontWeight: '600' }}>C$ {resolveMonthlySalary(emp).toFixed(0)} {t('employee.perDay')}</td>
                    <td style={styles.td}>
                      <span style={styles.badge(emp.status === 'active' ? colors.success : colors.textMuted)}>
                        {emp.status === 'active' ? t('employee.statusActive') : t('employee.statusInactive')}
                      </span>
                    </td>
                    <td style={styles.td}>
                      <button
                        onClick={() => {
                          setEditingEmployee(emp);
                          setFormData({ ...emp, monthlySalary: resolveMonthlySalary(emp) });
                          setShowAddEmployee(true);
                        }}
                        style={{ ...styles.btn(colors.amber), marginRight: '0.5rem', padding: '0.48rem 0.72rem' }}
                        title={t('employee.edit')}
                      >
                        ✏️
                      </button>
                      <button
                        onClick={() => handleDeleteEmployee(emp.id)}
                        style={{ ...styles.btn(colors.danger), padding: '0.48rem 0.72rem' }}
                        title={t('employee.delete')}
                      >
                        🗑️
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
        )}
      </div>
      </div>

      {/* 添加/编辑员工模态框 */}
      {showAddEmployee && (
        <div style={styles.modal} onClick={() => setShowAddEmployee(false)}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ fontSize: font.title, fontWeight: 750, marginBottom: '1.2rem', color: colors.textPrimary }}>
              {editingEmployee ? `✏️ ${t('employee.edit')}` : `➕ ${t('employee.add')}`}
            </h2>
            
            <div style={styles.grid2}>
              <div style={styles.formGroup}>
                <label style={styles.label}>{t('employee.name')} *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  style={styles.input}
                  placeholder={t('employee.namePlaceholder')}
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>{t('employee.phone')} *</label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  style={styles.input}
                  placeholder={t('employee.phonePlaceholder')}
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>{t('employee.position')} *</label>
                <select
                  value={formData.position}
                  onChange={(e) => setFormData({ ...formData, position: e.target.value })}
                  style={styles.select}
                >
                  <option value="">{t('employee.selectPosition')}</option>
                  <option value="收银员">{t('employee.position.cashier')}</option>
                  <option value="服务员">{t('employee.position.waiter')}</option>
                  <option value="厨师">{t('employee.position.chef')}</option>
                  <option value="帮厨">{t('employee.position.kitchenAssistant')}</option>
                  <option value="店长">{t('employee.position.manager')}</option>
                  <option value="副店长">{t('employee.position.assistantManager')}</option>
                </select>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>{t('employee.department')}</label>
                <select
                  value={formData.department}
                  onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                  style={styles.select}
                >
                  <option value="">{t('employee.selectDepartment')}</option>
                  <option value="前厅">{t('employee.department.front')}</option>
                  <option value="后厨">{t('employee.department.kitchen')}</option>
                  <option value="管理">{t('employee.department.management')}</option>
                </select>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>{t('employee.hireDate')}</label>
                <input
                  type="date"
                  value={formData.hireDate}
                  onChange={(e) => setFormData({ ...formData, hireDate: e.target.value })}
                  style={styles.input}
                />
              </div>
            </div>

            <h3 style={{ fontSize: font.section, fontWeight: 750, margin: '1.3rem 0 0.85rem 0', color: colors.textPrimary }}>
              💰 {t('employee.salaryConfig')}
            </h3>
            <div style={styles.grid2}>
              <div style={styles.formGroup}>
                <label style={styles.label}>{t('employee.dailyRate')} (C$)</label>
                <input
                  type="number"
                  value={formData.monthlySalary || ''}
                  onChange={(e) => setFormData({ ...formData, monthlySalary: parseFloat(e.target.value) || 0 })}
                  style={styles.input}
                  placeholder="0.00"
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>{t('employee.overtimeRate')} (C$)</label>
                <input
                  type="number"
                  value={formData.overtimeRate || ''}
                  onChange={(e) => setFormData({ ...formData, overtimeRate: parseFloat(e.target.value) || 0 })}
                  style={styles.input}
                  placeholder="0.00"
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>{t('employee.status')}</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                  style={styles.select}
                >
                  <option value="active">{t('employee.statusActive')}</option>
                  <option value="inactive">{t('employee.statusInactive')}</option>
                </select>
              </div>
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>{t('employee.notes')}</label>
              <textarea
                value={formData.notes || ''}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                style={{ ...styles.input, minHeight: '80px', resize: 'vertical' }}
                placeholder={t('employee.optional')}
              />
            </div>

            <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
              <button onClick={handleSaveEmployee} style={{ ...styles.btn(colors.teal), flex: 1 }}>
                💾 {t('employee.save')}
              </button>
              <button
                onClick={() => {
                  setShowAddEmployee(false);
                  setEditingEmployee(null);
                }}
                style={{ ...styles.btn(colors.textSecondary), flex: 1 }}
              >
                ❌ {t('employee.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EmployeeList;
