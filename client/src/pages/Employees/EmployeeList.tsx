import React, { useState } from 'react';
import { smartAddDocument, smartUpdateDocument } from '../../services/smartSyncService';
import { dataManager } from '../../services/dataManager';
import { filterActiveEmployees } from '../../utils/employeeRecords';

interface Employee {
  id: string;
  name: string;
  phone: string;
  position: string;
  department: string;
  hireDate: string;
  status: 'active' | 'inactive';
  dailyRate: number;
  overtimeRate: number;
  avatar?: string;
  notes?: string;
}

interface EmployeeListProps {
  employees: Employee[];
  setEmployees: React.Dispatch<React.SetStateAction<Employee[]>>;
}

const EmployeeList: React.FC<EmployeeListProps> = ({ employees, setEmployees }) => {
  const [showAddEmployee, setShowAddEmployee] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [formData, setFormData] = useState<Partial<Employee>>({
    name: '',
    phone: '',
    position: '',
    department: '',
    hireDate: new Date().toISOString().split('T')[0],
    status: 'active',
    dailyRate: 0,
    overtimeRate: 0,
  });

  const handleSaveEmployee = async () => {
    if (!formData.name || !formData.phone || !formData.position) {
      alert('\u8bf7\u586b\u5199\u5fc5\u586b\u9879');
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
      dailyRate: formData.dailyRate || 0,
      overtimeRate: formData.overtimeRate || 0,
      notes: formData.notes,
    };

    let updatedEmployees;
    if (editingEmployee) {
      updatedEmployees = employees.map(emp => emp.id === employee.id ? employee : emp);
    } else {
      updatedEmployees = [...employees, employee];
    }

    setEmployees(updatedEmployees);
    await dataManager.saveData('employees', filterActiveEmployees(updatedEmployees), {
      syncFirestore: false,
      notify: false,
    });
    try {
      if (editingEmployee) {
        await smartUpdateDocument('employees', employee.id, employee);
      } else {
        await smartAddDocument('employees', employee);
      }
    } catch (error) {
      console.error('sync employee to Firestore failed:', error);
      alert('\u5458\u5de5\u5df2\u4fdd\u5b58\u5230\u672c\u673a\uff0c\u4f46\u4e91\u7aef\u540c\u6b65\u5931\u8d25\uff0c\u8bf7\u68c0\u67e5\u7f51\u7edc\u540e\u91cd\u8bd5\u3002');
    }
    setShowAddEmployee(false);
    setEditingEmployee(null);
    setFormData({
      name: '',
      phone: '',
      position: '',
      department: '',
      hireDate: new Date().toISOString().split('T')[0],
      status: 'active',
      dailyRate: 0,
      overtimeRate: 0,
    });
  };

  const handleDeleteEmployee = async (id: string) => {
    if (!window.confirm('\u786e\u5b9a\u8981\u5220\u9664\u8be5\u5458\u5de5\u5417\uff1f')) return;
    
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
      console.log('employee marked deleted in Firestore:', id);
      setEmployees(activeEmployees);
    } catch (error) {
      console.error('delete employee from Firestore failed:', error);
      alert('\u5220\u9664\u5931\u8d25\uff0c\u8bf7\u91cd\u8bd5');
    }
  };

  const styles = {
    card: {
      background: 'white',
      borderRadius: '1rem',
      boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
      marginBottom: '1.5rem',
      display: 'flex',
      flexDirection: 'column' as const,
      height: '100%',
    },
    cardContent: {
      padding: '1.5rem',
      flex: 1,
      display: 'flex',
      flexDirection: 'column' as const,
      overflow: 'hidden' as const,
    },
    btn: (bg: string) => ({
      padding: '0.75rem 1.5rem',
      background: bg,
      color: 'white',
      border: 'none',
      borderRadius: '0.5rem',
      cursor: 'pointer',
      fontWeight: '600',
      fontSize: '0.875rem',
    }),
    table: {
      width: '100%',
      borderCollapse: 'collapse' as const,
      fontSize: '0.875rem',
      background: 'white',
    },
    th: {
      background: '#f9fafb',
      padding: '1rem',
      textAlign: 'left' as const,
      fontSize: '0.75rem',
      fontWeight: '600',
      color: '#6b7280',
      borderBottom: '2px solid #e5e7eb',
      position: 'sticky' as const,
      top: 0,
      zIndex: 10,
    },
    td: {
      padding: '1rem',
      borderBottom: '1px solid #f3f4f6',
    },
    badge: (color: string) => ({
      padding: '0.25rem 0.75rem',
      background: color,
      color: 'white',
      borderRadius: '9999px',
      fontSize: '0.75rem',
      fontWeight: '600',
    }),
    modal: {
      position: 'fixed' as const,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
    },
    modalContent: {
      background: 'white',
      borderRadius: '1rem',
      padding: '2rem',
      maxWidth: '600px',
      width: '90%',
      maxHeight: '80vh',
      overflow: 'auto',
    },
    formGroup: {
      marginBottom: '1rem',
    },
    label: {
      display: 'block',
      marginBottom: '0.5rem',
      fontWeight: '600',
      color: '#374151',
      fontSize: '0.875rem',
    },
    input: {
      width: '100%',
      padding: '0.75rem',
      border: '1px solid #d1d5db',
      borderRadius: '0.5rem',
      fontSize: '0.875rem',
    },
    select: {
      width: '100%',
      padding: '0.75rem',
      border: '1px solid #d1d5db',
      borderRadius: '0.5rem',
      fontSize: '0.875rem',
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexShrink: 0 }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: '700', margin: 0 }}>👥 员工列表</h2>
          <button onClick={() => setShowAddEmployee(true)} style={styles.btn('#3b82f6')}>
            ➕ 添加员工
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto' }}>
        {employees.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#9ca3af' }}>
            <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>👤</div>
            <div>暂无员工数据</div>
          </div>
        ) : (
          <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>姓名</th>
                  <th style={styles.th}>电话</th>
                  <th style={styles.th}>职位</th>
                  <th style={styles.th}>部门</th>
                  <th style={styles.th}>入职日期</th>
                  <th style={styles.th}>基本工资</th>
                  <th style={styles.th}>状态</th>
                  <th style={styles.th}>操作</th>
                </tr>
              </thead>
              <tbody>
                {employees.map((emp) => (
                  <tr key={emp.id}>
                    <td style={{ ...styles.td, fontWeight: '600' }}>{emp.name}</td>
                    <td style={styles.td}>{emp.phone}</td>
                    <td style={styles.td}>{emp.position}</td>
                    <td style={styles.td}>{emp.department || '-'}</td>
                    <td style={styles.td}>{emp.hireDate}</td>
                    <td style={{ ...styles.td, fontWeight: '600' }}>C$ {(emp.dailyRate || 0).toFixed(2)}/天</td>
                    <td style={styles.td}>
                      <span style={styles.badge(emp.status === 'active' ? '#10b981' : '#9ca3af')}>
                        {emp.status === 'active' ? '在职' : '离职'}
                      </span>
                    </td>
                    <td style={styles.td}>
                      <button
                        onClick={() => {
                          setEditingEmployee(emp);
                          setFormData(emp);
                          setShowAddEmployee(true);
                        }}
                        style={{ ...styles.btn('#f59e0b'), marginRight: '0.5rem', padding: '0.5rem 1rem' }}
                      >
                        ✏️
                      </button>
                      <button
                        onClick={() => handleDeleteEmployee(emp.id)}
                        style={{ ...styles.btn('#ef4444'), padding: '0.5rem 1rem' }}
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
            <h2 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '1.5rem' }}>
              {editingEmployee ? '✏️ 编辑员工' : '➕ 添加员工'}
            </h2>
            
            <div style={styles.grid2}>
              <div style={styles.formGroup}>
                <label style={styles.label}>姓名 *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  style={styles.input}
                  placeholder="请输入姓名"
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>电话 *</label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  style={styles.input}
                  placeholder="请输入电话"
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>职位 *</label>
                <select
                  value={formData.position}
                  onChange={(e) => setFormData({ ...formData, position: e.target.value })}
                  style={styles.select}
                >
                  <option value="">请选择职位</option>
                  <option value="收银员">收银员</option>
                  <option value="服务员">服务员</option>
                  <option value="厨师">厨师</option>
                  <option value="帮厨">帮厨</option>
                  <option value="店长">店长</option>
                  <option value="副店长">副店长</option>
                </select>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>部门</label>
                <select
                  value={formData.department}
                  onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                  style={styles.select}
                >
                  <option value="">请选择部门</option>
                  <option value="前厅">前厅</option>
                  <option value="后厨">后厨</option>
                  <option value="管理">管理</option>
                </select>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>入职日期</label>
                <input
                  type="date"
                  value={formData.hireDate}
                  onChange={(e) => setFormData({ ...formData, hireDate: e.target.value })}
                  style={styles.input}
                />
              </div>
            </div>

            <h3 style={{ fontSize: '1rem', fontWeight: '600', margin: '1.5rem 0 1rem 0', color: '#374151' }}>
              💰 薪资配置（每人不同）
            </h3>
            <div style={styles.grid2}>
              <div style={styles.formGroup}>
                <label style={styles.label}>日薪 (C$)</label>
                <input
                  type="number"
                  value={formData.dailyRate || ''}
                  onChange={(e) => setFormData({ ...formData, dailyRate: parseFloat(e.target.value) || 0 })}
                  style={styles.input}
                  placeholder="0.00"
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>加班时薪 (C$)</label>
                <input
                  type="number"
                  value={formData.overtimeRate || ''}
                  onChange={(e) => setFormData({ ...formData, overtimeRate: parseFloat(e.target.value) || 0 })}
                  style={styles.input}
                  placeholder="0.00"
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>状态</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                  style={styles.select}
                >
                  <option value="active">在职</option>
                  <option value="inactive">离职</option>
                </select>
              </div>
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>备注</label>
              <textarea
                value={formData.notes || ''}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                style={{ ...styles.input, minHeight: '80px', resize: 'vertical' }}
                placeholder="选填"
              />
            </div>

            <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
              <button onClick={handleSaveEmployee} style={{ ...styles.btn('#3b82f6'), flex: 1 }}>
                💾 保存
              </button>
              <button
                onClick={() => {
                  setShowAddEmployee(false);
                  setEditingEmployee(null);
                }}
                style={{ ...styles.btn('#6b7280'), flex: 1 }}
              >
                ❌ 取消
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EmployeeList;
