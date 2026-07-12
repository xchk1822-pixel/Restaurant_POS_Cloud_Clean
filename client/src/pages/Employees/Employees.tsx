import React, { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { smartGetDocuments, smartGetDocumentsWhereEqual } from '../../services/smartSyncService';
import { dataManager } from '../../services/dataManager';
import { filterActiveEmployees } from '../../utils/employeeRecords';
import EmployeeList from './EmployeeList';
import AttendanceManagement from './AttendanceManagement';
import LoanManagement from './LoanManagement';
import SalarySettlement from './SalarySettlement';
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
  avatar?: string;
  notes?: string;
}

interface AttendanceRecord {
  id: string;
  employeeId: string;
  date: string;
  checkIn?: string;
  checkOut?: string;
  workHours: number;
  status: 'normal' | 'late' | 'early_leave' | 'absent' | 'leave' | 'rest' | 'empty';
  notes?: string;
}

interface SalaryRecord {
  id: string;
  employeeId: string;
  month: string;
  startDate: string;
  endDate: string;
  periodType: 'first_half' | 'second_half';
  baseSalary: number;
  overtimeHours: number;
  overtimePay: number;
  benefits: number;
  subsidy: number;
  socialSecurityEmployee: number;
  socialSecurityCompany: number;
  loanAmount: number;
  loanRepayment: number;
  remainingLoan: number;
  actualSalary: number;
  paidDate?: string;
  status: 'pending' | 'paid';
  notes?: string;
}

interface LoanRecord {
  id: string;
  employeeId: string;
  employeeName?: string;
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

const getScopedStorageKey = (collectionName: string): string => {
  try {
    const currentUser = localStorage.getItem('current_user');
    const storeId = currentUser ? JSON.parse(currentUser).storeId : null;
    return storeId ? `store_${storeId}_${collectionName}` : collectionName;
  } catch {
    return collectionName;
  }
};

const saveLocalCollection = (collectionName: string, records: any[]) => {
  try {
    localStorage.setItem(getScopedStorageKey(collectionName), JSON.stringify(records));
  } catch {
    // Auxiliary cache only; cloud data and current React state remain authoritative.
  }
};

const removeLocalCollection = (collectionName: string) => {
  try {
    localStorage.removeItem(getScopedStorageKey(collectionName));
  } catch {
    // Non-critical cleanup only.
  }
};

const mergeById = (records: any[]): any[] => {
  const merged = new Map<string, any>();
  records.forEach(record => {
    if (record?.id) merged.set(String(record.id), record);
  });
  return Array.from(merged.values());
};

const EmployeesModule: React.FC = () => {
  const location = useLocation();

  const getPathTab = (): 'employees' | 'attendance' | 'loans' | 'salary' => {
    const path = location.pathname;
    if (path.includes('/attendance')) return 'attendance';
    if (path.includes('/loans')) return 'loans';
    if (path.includes('/salary')) return 'salary';
    return 'employees';
  };

  const [activeTab, setActiveTab] = useState<'employees' | 'attendance' | 'loans' | 'salary'>(
    getPathTab()
  );
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [salaryRecords, setSalaryRecords] = useState<SalaryRecord[]>([]);
  const [loanRecords, setLoanRecords] = useState<LoanRecord[]>([]);
  const [loanExpenseRecords, setLoanExpenseRecords] = useState<any[]>([]);
  const [cashFlowRecords, setCashFlowRecords] = useState<CashFlowRecord[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);

  useEffect(() => {
    setActiveTab(getPathTab());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  const loadEmployeeModuleData = useCallback(async () => {
    setIsRefreshing(true);
    try {
      localStorage.removeItem('employees');

      const [
        employeesData,
        employeeDeletionsData,
        attendanceData,
        salaryData,
        loanData,
        cashFlowData,
        loanExpensesByType,
        loanExpensesByCategory,
      ] = await Promise.all([
        smartGetDocuments('employees', true),
        smartGetDocuments('employee_deletions', true),
        smartGetDocuments('attendance_records', true),
        smartGetDocuments('salary_records', true),
        smartGetDocuments('loan_records', true),
        smartGetDocuments('cash_flow_records', true),
        smartGetDocumentsWhereEqual('expenses', 'relatedType', 'loan', true, 'employee_loan_expenses'),
        smartGetDocumentsWhereEqual('expenses', 'categoryId', 'employee_loan', true, 'employee_loan_expenses'),
      ]);
      const loanExpenseData = mergeById([...loanExpensesByType, ...loanExpensesByCategory]);

      const activeEmployees = filterActiveEmployees(employeesData, employeeDeletionsData);
      setEmployees(activeEmployees);
      setAttendanceRecords(attendanceData);
      setSalaryRecords(salaryData);
      setLoanRecords(loanData);
      setLoanExpenseRecords(loanExpenseData);
      setCashFlowRecords(cashFlowData);
      await dataManager.saveData('employees', activeEmployees, { syncFirestore: false, notify: false });
      removeLocalCollection('expenses');
      saveLocalCollection('employee_deletions', employeeDeletionsData);
      saveLocalCollection('attendance_records', attendanceData);
      saveLocalCollection('salary_records', salaryData);
      saveLocalCollection('loan_records', loanData);
      saveLocalCollection('employee_loan_expenses', loanExpenseData);
      saveLocalCollection('cash_flow_records', cashFlowData);
      setLastSyncedAt(new Date());
    } catch (error) {
      console.error('加载员工管理数据失败:', error);
      alert('加载员工管理数据失败，请检查网络后重试');
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadEmployeeModuleData();
  }, [loadEmployeeModuleData]);

  const styles = {
    container: {
      display: 'flex',
      flexDirection: 'column' as const,
      height: '100%',
      padding: '1.1rem',
      background: colors.page,
      color: colors.textPrimary,
      fontFamily: font.family,
    },
    header: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '1rem',
      marginBottom: '0.85rem',
      flexShrink: 0 as const,
      padding: '0.85rem 1rem',
      background: colors.surface,
      border: `1px solid ${colors.border}`,
      borderRadius: radii.lg,
      boxShadow: shadows.soft,
      flexWrap: 'wrap' as const,
    },
    title: {
      margin: 0,
      fontSize: font.title,
      fontWeight: 750,
      color: colors.textPrimary,
      letterSpacing: 0,
    },
    refreshButton: {
      padding: '0.58rem 0.95rem',
      border: `1px solid ${colors.borderStrong}`,
      borderRadius: radii.md,
      background: isRefreshing ? colors.surfaceMuted : colors.surface,
      color: isRefreshing ? colors.textMuted : colors.textPrimary,
      fontWeight: 700,
      cursor: isRefreshing ? 'not-allowed' : 'pointer',
      fontSize: font.body,
    },
    syncInfo: {
      fontSize: font.caption,
      color: colors.textSecondary,
      whiteSpace: 'nowrap' as const,
    },
    content: {
      flex: 1,
      overflow: 'hidden' as const,
    },
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>员工管理</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {lastSyncedAt && (
            <span style={styles.syncInfo}>
              最后同步 {lastSyncedAt.toLocaleTimeString('es-NI', { hour12: false })}
            </span>
          )}
          <button
            type="button"
            onClick={loadEmployeeModuleData}
            disabled={isRefreshing}
            style={styles.refreshButton}
          >
            {isRefreshing ? '刷新中...' : '刷新云端数据'}
          </button>
        </div>
      </div>

      <div style={styles.content}>
        {activeTab === 'employees' && (
          <EmployeeList employees={employees} setEmployees={setEmployees} />
        )}
        {activeTab === 'attendance' && (
          <AttendanceManagement
            employees={employees}
            attendanceRecords={attendanceRecords}
            setAttendanceRecords={setAttendanceRecords}
          />
        )}
        {activeTab === 'loans' && (
          <LoanManagement
            employees={employees}
            loanRecords={loanRecords}
            setLoanRecords={setLoanRecords}
            loanExpenseRecords={loanExpenseRecords}
            setLoanExpenseRecords={setLoanExpenseRecords}
            cashFlowRecords={cashFlowRecords}
            setCashFlowRecords={setCashFlowRecords}
          />
        )}
        {activeTab === 'salary' && (
          <SalarySettlement
            employees={employees}
            attendanceRecords={attendanceRecords}
            setAttendanceRecords={setAttendanceRecords}
            salaryRecords={salaryRecords}
            setSalaryRecords={setSalaryRecords}
            loanRecords={loanRecords}
            setLoanRecords={setLoanRecords}
            loanExpenseRecords={loanExpenseRecords}
            cashFlowRecords={cashFlowRecords}
            setCashFlowRecords={setCashFlowRecords}
          />
        )}
      </div>
    </div>
  );
};

export default EmployeesModule;
