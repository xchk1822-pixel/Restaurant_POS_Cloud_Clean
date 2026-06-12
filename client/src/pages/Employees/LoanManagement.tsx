import React, { useState } from 'react';
import { getLocalDateString } from '../../utils/exchangeRate';
import { dataManager } from '../../services/dataManager';
import { smartAddDocument } from '../../services/smartSyncService';
import { getVisibleLoanRecords } from '../../utils/employeeLoans';

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
}

interface LoanRecord {
  id: string;
  employeeId: string;
  employeeName?: string;
  expenseId?: string;
  relatedExpenseId?: string;
  date: string;
  amount: number;
  approvedBy?: string;
  remainingAmount: number;
  status: 'active' | 'deducted' | 'cancelled';
  deductionPeriod?: string;
  notes?: string;
}

interface CashFlowRecord {
  id: string;
  type: 'loan_out' | 'salary_deduction' | 'other';
  amount: number;
  employeeId?: string;
  employeeName?: string;
  date: string;
  description: string;
  relatedLoanId?: string;
  salaryPeriod?: string;
}

interface LoanManagementProps {
  employees: Employee[];
  loanRecords: LoanRecord[];
  setLoanRecords: React.Dispatch<React.SetStateAction<LoanRecord[]>>;
  cashFlowRecords: CashFlowRecord[];
  setCashFlowRecords: React.Dispatch<React.SetStateAction<CashFlowRecord[]>>;
}

const LoanManagement: React.FC<LoanManagementProps> = ({
  employees,
  loanRecords,
  setLoanRecords,
  cashFlowRecords,
  setCashFlowRecords,
}) => {
  const [showLoanModal, setShowLoanModal] = useState(false);
  const [loanFormData, setLoanFormData] = useState<Partial<LoanRecord>>({
    employeeId: '',
    amount: 0,
    date: getLocalDateString(),
  });



  const recordCashFlow = async (flow: Omit<CashFlowRecord, 'id'>) => {
    const newFlow: CashFlowRecord = {
      id: Date.now().toString(),
      ...flow,
    };
    
    try {
      await smartAddDocument('cash_flow_records', newFlow);
      console.log('✅ 现金流记录已同步到 Firestore');
    } catch (error) {
      console.error('❌ 同步现金流记录失败:', error);
      throw error;
    }

    const updated = [...cashFlowRecords, newFlow];
    setCashFlowRecords(updated);
    console.log('💰 现金流记录:', newFlow);
  };

  const handleAddLoan = async () => {
    if (!loanFormData.employeeId || !loanFormData.amount) {
      alert('请填写完整信息');
      return;
    }

    const employee = employees.find(e => e.id === loanFormData.employeeId);
    const now = Date.now();
    const loanId = now.toString();
    const expenseId = `loan_${now}`;
    
    const newLoan: LoanRecord = {
      id: loanId,
      employeeId: loanFormData.employeeId,
      employeeName: employee?.name || '',
      expenseId,
      date: loanFormData.date || getLocalDateString(),
      amount: loanFormData.amount || 0,
      remainingAmount: loanFormData.amount || 0,
      status: 'active',
      notes: loanFormData.notes,
    };

    const updated = [...loanRecords, newLoan];

    // 🔄 同步创建开支记录（从营业额扣除）- 使用 dataManager
    const expenseDate = loanFormData.date || getLocalDateString();
    
    const newExpense = {
      id: expenseId,
      date: expenseDate,
      categoryId: 'employee_loan', // 员工借款分类
      categoryName: '员工借款',
      amount: loanFormData.amount || 0,
      description: `员工借款 - ${employee?.name}`,
      employeeId: loanFormData.employeeId,
      employeeName: employee?.name,
      relatedType: 'loan',
      relatedLoanId: loanId,
      createdAt: getLocalDateString(),
    };

    try {
      await smartAddDocument('loan_records', newLoan);
      await smartAddDocument('expenses', newExpense);
      await recordCashFlow({
        type: 'loan_out',
        amount: loanFormData.amount || 0,
        employeeId: loanFormData.employeeId,
        employeeName: employee?.name || '',
        date: loanFormData.date || getLocalDateString(),
        description: `借款给${employee?.name}`,
      });
      console.log('✅ 借款记录已同步到 Firestore');
    } catch (error) {
      console.error('❌ 保存借款记录失败:', error);
      alert('保存借款失败，请检查网络后重试');
      return;
    }

    setLoanRecords(updated);
    const nextExpenses = [...dataManager.getData('expenses'), newExpense];
    await dataManager.saveData('expenses', nextExpenses, { syncFirestore: false });
    console.log('💰 已创建开支记录:', newExpense);
    
    setShowLoanModal(false);
    setLoanFormData({
      employeeId: '',
      amount: 0,
      date: getLocalDateString(),
    });
    
    alert(`✅ 借款成功！\n\n员工：${employee?.name}\n金额：C$ ${loanFormData.amount.toFixed(2)}\n\n⚠️ 该借款已从当天营业额中扣除，并将在薪资结算时自动扣回。`);
  };

  const styles = {
    card: {
      background: 'white',
      borderRadius: '1rem',
      padding: '1.5rem',
      boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
      marginBottom: '1.5rem',
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
    },
    th: {
      background: '#f9fafb',
      padding: '1rem',
      textAlign: 'left' as const,
      fontSize: '0.75rem',
      fontWeight: '600',
      color: '#6b7280',
      borderBottom: '2px solid #e5e7eb',
    },
    td: {
      padding: '1rem',
      borderBottom: '1px solid #f3f4f6',
    },
    statCard: (bg: string) => ({
      background: 'white',
      borderRadius: '0.75rem',
      padding: '1.5rem',
      boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
      borderLeft: `4px solid ${bg}`,
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

  const loanExpenses = dataManager.getData('expenses');
  const activeLoans = getVisibleLoanRecords(loanRecords, loanExpenses);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: '700', margin: 0 }}>💸 借款管理</h2>
        <button onClick={() => setShowLoanModal(true)} style={styles.btn('#f59e0b')}>
          ➕ 新增借款
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
        <div style={{ ...styles.statCard('#f59e0b'), textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#f59e0b' }}>
            {activeLoans.length}
          </div>
          <div style={{ color: '#6b7280', marginTop: '0.5rem' }}>活跃借款笔数</div>
        </div>
        <div style={{ ...styles.statCard('#ef4444'), textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#ef4444' }}>
            C$ {activeLoans.reduce((sum, l) => sum + l.amount, 0).toFixed(2)}
          </div>
          <div style={{ color: '#6b7280', marginTop: '0.5rem' }}>借款总额</div>
        </div>
        <div style={{ ...styles.statCard('#3b82f6'), textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#3b82f6' }}>
            C$ {activeLoans.reduce((sum, l) => sum + l.remainingAmount, 0).toFixed(2)}
          </div>
          <div style={{ color: '#6b7280', marginTop: '0.5rem' }}>未还总额</div>
        </div>
      </div>

      <div style={styles.card}>
        {activeLoans.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#9ca3af' }}>
            <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>💰</div>
            <div>暂无活跃借款</div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>员工</th>
                  <th style={styles.th}>借款日期</th>
                  <th style={styles.th}>借款金额</th>
                  <th style={styles.th}>剩余欠款</th>
                  <th style={styles.th}>操作</th>
                </tr>
              </thead>
              <tbody>
                {activeLoans.map((loan) => {
                  const emp = employees.find(e => e.id === loan.employeeId);
                  return (
                    <tr key={loan.id}>
                      <td style={{ ...styles.td, fontWeight: '600' }}>{emp?.name || '未知'}</td>
                      <td style={styles.td}>{loan.date}</td>
                      <td style={{ ...styles.td, fontWeight: '600', color: '#ef4444' }}>
                        C$ {loan.amount.toFixed(2)}
                      </td>
                      <td style={{ ...styles.td, fontWeight: 'bold', color: '#f59e0b' }}>
                        C$ {loan.remainingAmount.toFixed(2)}
                      </td>
                      <td style={styles.td}>
                        <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                          工资中扣除
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showLoanModal && (
        <div style={styles.modal} onClick={() => setShowLoanModal(false)}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '1.5rem' }}>💸 新增借款</h2>
            
            <div style={styles.formGroup}>
              <label style={styles.label}>选择员工 *</label>
              <select
                value={loanFormData.employeeId}
                onChange={(e) => setLoanFormData({ ...loanFormData, employeeId: e.target.value })}
                style={styles.select}
              >
                <option value="">请选择员工</option>
                {employees.filter(e => e.status === 'active').map(emp => (
                  <option key={emp.id} value={emp.id}>{emp.name} - {emp.position}</option>
                ))}
              </select>
            </div>

            <div style={styles.grid2}>
              <div style={styles.formGroup}>
                <label style={styles.label}>借款金额 (C$) *</label>
                <input
                  type="number"
                  value={loanFormData.amount}
                  onChange={(e) => setLoanFormData({ ...loanFormData, amount: parseFloat(e.target.value) || 0 })}
                  style={styles.input}
                  placeholder="0.00"
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>借款日期</label>
                <input
                  type="date"
                  value={loanFormData.date}
                  onChange={(e) => setLoanFormData({ ...loanFormData, date: e.target.value })}
                  style={styles.input}
                />
              </div>
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>备注</label>
              <textarea
                value={loanFormData.notes || ''}
                onChange={(e) => setLoanFormData({ ...loanFormData, notes: e.target.value })}
                style={{ ...styles.input, minHeight: '80px', resize: 'vertical' }}
                placeholder="选填"
              />
            </div>

            <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
              <button onClick={handleAddLoan} style={{ ...styles.btn('#f59e0b'), flex: 1 }}>
                💾 确认借款
              </button>
              <button
                onClick={() => setShowLoanModal(false)}
                style={{ ...styles.btn('#6b7280'), flex: 1 }}
              >
                ❌ 取消
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
};

export default LoanManagement;
