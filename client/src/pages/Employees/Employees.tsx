import React, { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { smartGetDocuments } from '../../services/smartSyncService';
import { dataManager } from '../../services/dataManager';
import EmployeeList from './EmployeeList';
import AttendanceManagement from './AttendanceManagement';
import LoanManagement from './LoanManagement';
import SalarySettlement from './SalarySettlement';

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
  localStorage.setItem(getScopedStorageKey(collectionName), JSON.stringify(records));
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
      ] = await Promise.all([
        smartGetDocuments('employees', true),
        smartGetDocuments('employee_deletions', true),
        smartGetDocuments('attendance_records', true),
        smartGetDocuments('salary_records', true),
        smartGetDocuments('loan_records', true),
        smartGetDocuments('cash_flow_records', true),
      ]);

      const deletedEmployeeIds = new Set(
        employeeDeletionsData.map((record: any) => String(record.employeeId || record.id))
      );
      const activeEmployees = employeesData.filter((employee: any) =>
        !employee?.isDeleted && !deletedEmployeeIds.has(String(employee.id))
      );
      setEmployees(activeEmployees);
      setAttendanceRecords(attendanceData);
      setSalaryRecords(salaryData);
      setLoanRecords(loanData);
      setCashFlowRecords(cashFlowData);
      await dataManager.saveData('employees', activeEmployees, { syncFirestore: false, notify: false });
      saveLocalCollection('attendance_records', attendanceData);
      saveLocalCollection('salary_records', salaryData);
      saveLocalCollection('loan_records', loanData);
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
      padding: '1.5rem',
      background: '#f3f4f6',
    },
    header: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '1rem',
      marginBottom: '1rem',
      flexShrink: 0 as const,
    },
    title: {
      margin: 0,
      fontSize: '1.5rem',
      fontWeight: 700,
      color: '#1f2937',
    },
    refreshButton: {
      padding: '0.6rem 1rem',
      border: 'none',
      borderRadius: '0.5rem',
      background: isRefreshing ? '#9ca3af' : '#2563eb',
      color: 'white',
      fontWeight: 600,
      cursor: isRefreshing ? 'not-allowed' : 'pointer',
    },
    syncInfo: {
      fontSize: '0.8rem',
      color: '#6b7280',
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
            cashFlowRecords={cashFlowRecords}
            setCashFlowRecords={setCashFlowRecords}
          />
        )}
        {activeTab === 'salary' && (
          <SalarySettlement
            employees={employees}
            attendanceRecords={attendanceRecords}
            salaryRecords={salaryRecords}
            setSalaryRecords={setSalaryRecords}
            loanRecords={loanRecords}
            setLoanRecords={setLoanRecords}
            cashFlowRecords={cashFlowRecords}
            setCashFlowRecords={setCashFlowRecords}
          />
        )}
      </div>
    </div>
  );
};

export default EmployeesModule;
