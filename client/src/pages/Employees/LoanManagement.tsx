import React, { useState } from 'react';
import { getLocalDateString } from '../../utils/exchangeRate';
import { smartAddDocument } from '../../services/smartSyncService';
import { getVisibleLoanRecords } from '../../utils/employeeLoans';
import { parseOptionalMoneyInput } from '../../utils/employeeRecords';
import { colors, font, radii, shadows } from '../../styles/uiTokens';

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

interface LoanExpenseRecord {
  id?: string;
  employeeId?: string;
  date?: string;
  amount?: number;
  categoryId?: string;
  relatedType?: string;
  relatedLoanId?: string;
}

interface LoanManagementProps {
  employees: Employee[];
  loanRecords: LoanRecord[];
  setLoanRecords: React.Dispatch<React.SetStateAction<LoanRecord[]>>;
  loanExpenseRecords: LoanExpenseRecord[];
  setLoanExpenseRecords: React.Dispatch<React.SetStateAction<LoanExpenseRecord[]>>;
  cashFlowRecords: CashFlowRecord[];
  setCashFlowRecords: React.Dispatch<React.SetStateAction<CashFlowRecord[]>>;
}

const LoanManagement: React.FC<LoanManagementProps> = ({
  employees,
  loanRecords,
  setLoanRecords,
  loanExpenseRecords,
  setLoanExpenseRecords,
  cashFlowRecords,
  setCashFlowRecords,
}) => {
  const [showLoanModal, setShowLoanModal] = useState(false);
  const [loanAmountInput, setLoanAmountInput] = useState('');
  const [loanFormData, setLoanFormData] = useState<Partial<LoanRecord>>({
    employeeId: '',
    date: getLocalDateString(),
  });



  const recordCashFlow = async (flow: Omit<CashFlowRecord, 'id'>) => {
    const newFlow: CashFlowRecord = {
      id: Date.now().toString(),
      ...flow,
    };
    
    try {
      await smartAddDocument('cash_flow_records', newFlow);
    } catch (error) {
      console.error('❌ 同步现金流记录失败:', error);
      throw error;
    }

    const updated = [...cashFlowRecords, newFlow];
    setCashFlowRecords(updated);
  };

  const handleAddLoan = async () => {
    const loanAmount = Number(loanFormData.amount || 0);
    if (!loanFormData.employeeId || loanAmount <= 0) {
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
      amount: loanAmount,
      remainingAmount: loanAmount,
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
      amount: loanAmount,
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
        amount: loanAmount,
        employeeId: loanFormData.employeeId,
        employeeName: employee?.name || '',
        date: loanFormData.date || getLocalDateString(),
        description: `借款给${employee?.name}`,
      });
    } catch (error) {
      console.error('❌ 保存借款记录失败:', error);
      alert('保存借款失败，请检查网络后重试');
      return;
    }

    setLoanRecords(updated);
    setLoanExpenseRecords(records => records.some(record => record.id === newExpense.id)
      ? records
      : [...records, newExpense]
    );
    
    setShowLoanModal(false);
    setLoanFormData({
      employeeId: '',
      date: getLocalDateString(),
    });
    setLoanAmountInput('');
    
    alert(`✅ 借款成功！\n\n员工：${employee?.name}\n金额：C$ ${loanAmount.toFixed(2)}\n\n⚠️ 该借款已从当天营业额中扣除，并将在薪资结算时自动扣回。`);
  };

  const styles = {
    card: {
      background: colors.surface,
      borderRadius: radii.lg,
      padding: '1rem',
      boxShadow: shadows.soft,
      border: `1px solid ${colors.border}`,
      marginBottom: '1rem',
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
    },
    th: {
      background: colors.surfaceMuted,
      padding: '0.78rem 0.85rem',
      textAlign: 'left' as const,
      fontSize: font.caption,
      fontWeight: 700,
      color: colors.textSecondary,
      borderBottom: `1px solid ${colors.border}`,
    },
    td: {
      padding: '0.82rem 0.85rem',
      borderBottom: `1px solid ${colors.border}`,
      color: colors.textPrimary,
    },
    statCard: (bg: string) => ({
      background: colors.surface,
      borderRadius: radii.lg,
      padding: '1rem',
      boxShadow: shadows.soft,
      border: `1px solid ${colors.border}`,
      borderTop: `4px solid ${bg}`,
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

  const activeLoans = getVisibleLoanRecords(loanRecords, loanExpenseRecords);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0, gap: '0.75rem', flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: font.section, fontWeight: 750, margin: 0, color: colors.textPrimary }}>💸 借款管理</h2>
        <button onClick={() => setShowLoanModal(true)} style={styles.btn(colors.amber)}>
          ➕ 新增借款
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '0.85rem', marginBottom: '1rem' }}>
        <div style={{ ...styles.statCard(colors.amber), textAlign: 'center' }}>
          <div style={{ fontSize: '1.55rem', fontWeight: 800, color: colors.amber }}>
            {activeLoans.length}
          </div>
          <div style={{ color: colors.textSecondary, marginTop: '0.35rem', fontSize: font.caption }}>活跃借款笔数</div>
        </div>
        <div style={{ ...styles.statCard(colors.danger), textAlign: 'center' }}>
          <div style={{ fontSize: '1.55rem', fontWeight: 800, color: colors.danger }}>
            C$ {activeLoans.reduce((sum, l) => sum + l.amount, 0).toFixed(2)}
          </div>
          <div style={{ color: colors.textSecondary, marginTop: '0.35rem', fontSize: font.caption }}>借款总额</div>
        </div>
        <div style={{ ...styles.statCard(colors.blue), textAlign: 'center' }}>
          <div style={{ fontSize: '1.55rem', fontWeight: 800, color: colors.blue }}>
            C$ {activeLoans.reduce((sum, l) => sum + l.remainingAmount, 0).toFixed(2)}
          </div>
          <div style={{ color: colors.textSecondary, marginTop: '0.35rem', fontSize: font.caption }}>未还总额</div>
        </div>
      </div>

      <div style={styles.card}>
        {activeLoans.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: colors.textMuted }}>
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
                      <td style={{ ...styles.td, fontWeight: '600', color: colors.danger }}>
                        C$ {loan.amount.toFixed(2)}
                      </td>
                      <td style={{ ...styles.td, fontWeight: 'bold', color: colors.amber }}>
                        C$ {loan.remainingAmount.toFixed(2)}
                      </td>
                      <td style={styles.td}>
                        <span style={{ fontSize: font.caption, color: colors.textSecondary }}>
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
            <h2 style={{ fontSize: font.title, fontWeight: 750, marginBottom: '1.2rem', color: colors.textPrimary }}>💸 新增借款</h2>
            
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
                  value={loanAmountInput}
                  onChange={(e) => {
                    const nextValue = e.target.value;
                    setLoanAmountInput(nextValue);
                    setLoanFormData({ ...loanFormData, amount: parseOptionalMoneyInput(nextValue) });
                  }}
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
              <button onClick={handleAddLoan} style={{ ...styles.btn(colors.amber), flex: 1 }}>
                💾 确认借款
              </button>
              <button
                onClick={() => setShowLoanModal(false)}
                style={{ ...styles.btn(colors.textSecondary), flex: 1 }}
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
