import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { smartSubscribeToCollection, smartAddDocument, smartUpdateDocument, smartDeleteDocument } from '../../services/smartSyncService';
import { dataService } from '../../services/DataService';
import EmployeeList from './EmployeeList';
import AttendanceManagement from './AttendanceManagement';
import LoanManagement from './LoanManagement';
import SalarySettlement from './SalarySettlement';

// ==================== 类型定义 ====================

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

interface Schedule {
  id: string;
  employeeId: string;
  date: string;
  shift: 'morning' | 'afternoon' | 'evening' | 'full_day';
  shiftTime: string;
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

const EmployeesModule: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  
  // 根据路径确定当前Tab
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

  // 当路径变化时，更新activeTab
  useEffect(() => {
    const newTab = getPathTab();
    setActiveTab(newTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  // 切换Tab时更新路径
  const handleTabChange = (tab: 'employees' | 'attendance' | 'loans' | 'salary') => {
    setActiveTab(tab);
    const paths = {
      employees: '/employees',
      attendance: '/employees/attendance',
      loans: '/employees/loans',
      salary: '/employees/salary'
    };
    navigate(paths[tab], { replace: true });
  };
  
  // 员工列表
  const [employees, setEmployees] = useState<Employee[]>([]);
  
  // 考勤相关
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  
  // 薪资相关
  const [salaryRecords, setSalaryRecords] = useState<SalaryRecord[]>([]);
  
  // 借款管理
  const [loanRecords, setLoanRecords] = useState<LoanRecord[]>([]);
  
  // 现金流记录
  const [cashFlowRecords, setCashFlowRecords] = useState<CashFlowRecord[]>([]);

  // 加载数据
  useEffect(() => {
    console.log('🔍 员工管理模块开始加载数据...');
    
    // 🔥 清理旧的全局key employees数据（避免数据冲突）
    try {
      const globalEmployees = localStorage.getItem('employees');
      if (globalEmployees) {
        console.log('🗑️ 清理旧的全局 employees 数据');
        localStorage.removeItem('employees');
      }
    } catch (error) {
      console.error('清理全局 employees 失败:', error);
    }
    
    // 🔥 订阅 Firestore 员工数据
    const unsubscribeEmployees = smartSubscribeToCollection('employees', (data) => {
      console.log('👥 员工数据更新:', data.length);
      setEmployees(data);
    });
    
    // 🔥 订阅考勤记录
    const unsubscribeAttendance = smartSubscribeToCollection('attendance_records', (data) => {
      console.log('📅 考勤记录更新:', data.length);
      setAttendanceRecords(data);
    });
    
    // 🔥 订阅薪资记录
    const unsubscribeSalaries = smartSubscribeToCollection('salary_records', (data) => {
      console.log('💰 薪资记录更新:', data.length);
      setSalaryRecords(data);
    });
    
    // 🔥 订阅借款记录
    const unsubscribeLoans = smartSubscribeToCollection('loan_records', (data) => {
      console.log('💸 借款记录更新:', data.length);
      setLoanRecords(data);
    });
    
    // 🔥 订阅现金流记录
    const unsubscribeCashFlows = smartSubscribeToCollection('cash_flow_records', (data) => {
      console.log('💵 现金流记录更新:', data.length);
      setCashFlowRecords(data);
    });
    
    return () => {
      unsubscribeEmployees();
      unsubscribeAttendance();
      unsubscribeSalaries();
      unsubscribeLoans();
      unsubscribeCashFlows();
    };
  }, []);

  // ✅ 自动保存考勤记录到 DataService（会自动同步到 Firestore）
  useEffect(() => {
    if (attendanceRecords.length > 0) {
      dataService.saveData('attendance_records', attendanceRecords);
    }
  }, [attendanceRecords]);
  
  // ✅ 自动保存薪资记录到 DataService（会自动同步到 Firestore）
  useEffect(() => {
    if (salaryRecords.length > 0) {
      dataService.saveData('salary_records', salaryRecords);
    }
  }, [salaryRecords]);
  
  // ✅ 自动保存借款记录到 DataService（会自动同步到 Firestore）
  useEffect(() => {
    if (loanRecords.length > 0) {
      dataService.saveData('loan_records', loanRecords);
    }
  }, [loanRecords]);

  const loadData = () => {
    try {
      const savedEmployees = localStorage.getItem('employees');
      if (savedEmployees) {
        const parsed = JSON.parse(savedEmployees);
        const migrated = parsed.map((emp: any) => ({
          ...emp,
          dailyRate: emp.dailyRate || emp.baseSalary || 0,
          overtimeRate: emp.overtimeRate || emp.hourlyRate || 0,
          benefits: emp.benefits || 0,
          subsidy: emp.subsidy || 0,
          socialSecurityEmployee: emp.socialSecurityEmployee || 0,
          socialSecurityCompany: emp.socialSecurityCompany || 0,
        }));
        setEmployees(migrated);
      }

      const savedAttendance = localStorage.getItem('attendance_records');
      if (savedAttendance) setAttendanceRecords(JSON.parse(savedAttendance));

      const savedSalaries = localStorage.getItem('salary_records');
      if (savedSalaries) setSalaryRecords(JSON.parse(savedSalaries));
      
      const savedLoans = localStorage.getItem('loan_records');
      if (savedLoans) setLoanRecords(JSON.parse(savedLoans));
      
      const savedCashFlows = localStorage.getItem('cash_flow_records');
      if (savedCashFlows) setCashFlowRecords(JSON.parse(savedCashFlows));
    } catch (e) {
      console.error('加载数据失败:', e);
    }
  };

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
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: '1.5rem',
      flexShrink: 0 as const,
    },
    title: {
      fontSize: '2rem',
      fontWeight: 'bold',
      color: '#1f2937',
      margin: 0,
    },
    content: {
      flex: 1,
      overflow: 'hidden' as const,
    },
  };

  return (
    <div style={styles.container}>
      {/* 内容区 - 根据URL参数显示对应组件 */}
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
