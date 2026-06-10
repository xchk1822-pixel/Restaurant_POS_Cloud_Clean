import React, { useState } from 'react';
import { dataManager } from '../../services/dataManager';
import { getLocalDateString } from '../../utils/exchangeRate'; // 🔥 导入本地日期工具
import { smartAddDocument } from '../../services/smartSyncService';
import { dataService } from '../../services/DataService';

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
  periodType: 'first_half' | 'second_half'; // 上半月/下半月
  baseSalary: number;
  overtimeHours: number;
  overtimePay: number;
  benefits: number; // 当月福利（动态）
  subsidy: number; // 当月补贴（动态）
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

interface SalarySettlementProps {
  employees: Employee[];
  attendanceRecords: AttendanceRecord[];
  salaryRecords: SalaryRecord[];
  setSalaryRecords: React.Dispatch<React.SetStateAction<SalaryRecord[]>>;
  loanRecords: LoanRecord[];
  setLoanRecords: React.Dispatch<React.SetStateAction<LoanRecord[]>>;
  cashFlowRecords: CashFlowRecord[];
  setCashFlowRecords: React.Dispatch<React.SetStateAction<CashFlowRecord[]>>;
}

const SalarySettlement: React.FC<SalarySettlementProps> = ({
  employees,
  attendanceRecords,
  salaryRecords,
  setSalaryRecords,
  loanRecords,
  setLoanRecords,
  cashFlowRecords,
  setCashFlowRecords,
}) => {
  const [settlementMode, setSettlementMode] = useState<'single' | 'batch'>('single');
  
  // 批量结算状态
  const [batchPeriod, setBatchPeriod] = useState({
    startDate: getLocalDateString(new Date(new Date().getFullYear(), new Date().getMonth(), 1)), // 🔥 使用本地时间
    endDate: getLocalDateString(), // 🔥 使用本地时间
    periodType: 'second_half' as 'first_half' | 'second_half',
  });
  
  // 单人结算时的动态福利/补贴/社保
  const [dynamicBenefits, setDynamicBenefits] = useState<Record<string, number>>({});
  const [dynamicSubsidy, setDynamicSubsidy] = useState<Record<string, number>>({});
  const [dynamicSocialSecurity, setDynamicSocialSecurity] = useState<Record<string, number>>({});

  const saveData = (key: string, data: any) => {
    dataService.saveData(key, data);
  };

  const recordCashFlow = (flow: Omit<CashFlowRecord, 'id'>) => {
    const newFlow: CashFlowRecord = {
      id: Date.now().toString(),
      ...flow,
    };
    
    const updated = [...cashFlowRecords, newFlow];
    setCashFlowRecords(updated);
    saveData('cash_flow_records', updated);
  };

  const getRemainingLoan = (employeeId: string): number => {
    const activeLoans = loanRecords.filter(
      loan => loan.employeeId === employeeId && loan.status === 'active'
    );
    return activeLoans.reduce((sum, loan) => sum + loan.remainingAmount, 0);
  };

  // 计算薪资（核心逻辑）
  const calculateSalary = (
    employee: Employee, 
    startDate: string, 
    endDate: string,
    periodType: 'first_half' | 'second_half',
    monthBenefits?: number,
    monthSubsidy?: number,
    monthSocialSecurity?: number
  ): SalaryRecord => {
    const attendances = attendanceRecords.filter(r => 
      r.employeeId === employee.id && 
      r.date >= startDate && 
      r.date <= endDate
    );

    const start = new Date(startDate);
    const end = new Date(endDate);
    const totalDays = Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    
    // 统计各种状态的天数
    const workDays = attendances.filter(r => r.status === 'normal').length;
    const restDays = attendances.filter(r => r.status === 'rest').length;
    const absentDays = attendances.filter(r => r.status === 'absent').length;
    const leaveDays = attendances.filter(r => r.status === 'leave').length;
    
    // 工作日薪 = 日薪 × (上班天数 + 休息天数)
    const paidDays = workDays + restDays;
    const basePay = employee.dailyRate * paidDays;
    
    // 计算加班（超过9小时/天的部分）
    let overtimeHours = 0;
    attendances.filter(r => r.status === 'normal').forEach(r => {
      if (r.workHours > 9) {
        overtimeHours += (r.workHours - 9);
      }
    });
    
    const overtimePay = overtimeHours * employee.overtimeRate;

    // 使用动态输入的福利、补贴和社保
    const benefits = monthBenefits !== undefined ? monthBenefits : 0;
    const subsidy = monthSubsidy !== undefined ? monthSubsidy : 0;

    // 社保：如果手动输入了则使用输入值，否则根据发薪类型决定
    let socialSecurityEmployee = 0;
    if (monthSocialSecurity !== undefined) {
      // 如果手动输入了社保，则使用输入值
      socialSecurityEmployee = monthSocialSecurity;
    } else if (periodType === 'second_half') {
      // 下半月且未手动输入，默认为0（因为员工档案中已移除）
      socialSecurityEmployee = 0;
    }

    const socialSecurity = {
      employee: socialSecurityEmployee,
      company: 0, // 公司部分暂不使用
    };

    // 获取剩余借款
    const remainingLoan = getRemainingLoan(employee.id);
    // 借款扣除最多为工资的30%
    const maxLoanDeduction = basePay * 0.3;
    const loanRepayment = Math.min(remainingLoan, maxLoanDeduction);

    // 实际到手工资 = 工作日薪 + 加班费 + 福利 + 补贴 - 借款扣除 - 社保
    const grossSalary = basePay + overtimePay + benefits + subsidy;
    const totalDeductions = socialSecurity.employee + loanRepayment;
    const actualSalary = grossSalary - totalDeductions;

    return {
      id: Date.now().toString(),
      employeeId: employee.id,
      month: startDate.slice(0, 7),
      startDate,
      endDate,
      periodType,
      baseSalary: basePay,
      overtimeHours,
      overtimePay: Math.round(overtimePay * 100) / 100,
      benefits,
      subsidy,
      socialSecurityEmployee: socialSecurity.employee,
      socialSecurityCompany: socialSecurity.company,
      loanAmount: remainingLoan,
      loanRepayment: Math.round(loanRepayment * 100) / 100,
      remainingLoan: Math.round((remainingLoan - loanRepayment) * 100) / 100,
      actualSalary: Math.round(actualSalary * 100) / 100,
      status: 'pending',
      notes: `总计${totalDays}天 | 上班${workDays}天 | 休息${restDays}天 | 缺勤${absentDays}天 | 请假${leaveDays}天`,
    };
  };

  // 处理单个员工结算
  const handleSingleSettlement = async (employeeId: string, period: string) => {
    const employee = employees.find(e => e.id === employeeId);
    if (!employee) return;

    const [startDate, endDate] = period.split('_');
    if (!startDate || !endDate) {
      alert('日期格式错误');
      return;
    }

    // 判断是上半月还是下半月
    const startDay = new Date(startDate).getDate();
    const periodType: 'first_half' | 'second_half' = startDay <= 15 ? 'first_half' : 'second_half';

    // 获取动态输入的福利、补贴和社保
    const monthBenefits = dynamicBenefits[employeeId] || 0;
    const monthSubsidy = dynamicSubsidy[employeeId] || 0;
    const monthSocialSecurity = dynamicSocialSecurity[employeeId] || 0;

    const salaryRecord = calculateSalary(employee, startDate, endDate, periodType, monthBenefits, monthSubsidy, monthSocialSecurity);
    
    // 处理借款扣除
    const activeLoans = loanRecords.filter(
      loan => loan.employeeId === employeeId && loan.status === 'active'
    );

    const maxDeduction = salaryRecord.baseSalary * 0.3;
    let totalDeduction = 0;
    const loansToDeduct: Array<{ loanId: string; amount: number }> = [];

    for (const loan of activeLoans) {
      if (totalDeduction >= maxDeduction) break;
      
      const deductAmount = Math.min(loan.remainingAmount, maxDeduction - totalDeduction);
      loansToDeduct.push({ loanId: loan.id, amount: deductAmount });
      totalDeduction += deductAmount;
    }

    // 更新借款记录
    const updatedLoans = loanRecords.map(loan => {
      const deduction = loansToDeduct.find(d => d.loanId === loan.id);
      if (deduction) {
        const newRemaining = loan.remainingAmount - deduction.amount;
        return {
          ...loan,
          remainingAmount: newRemaining,
          status: newRemaining <= 0 ? 'deducted' as const : 'active' as const,
          deductionPeriod: newRemaining <= 0 ? period : loan.deductionPeriod,
        };
      }
      return loan;
    });

    setLoanRecords(updatedLoans);
    saveData('loan_records', updatedLoans);

    // 更新薪资记录
    salaryRecord.loanRepayment = totalDeduction;
    salaryRecord.remainingLoan = activeLoans.reduce((sum, l) => sum + l.remainingAmount, 0) - totalDeduction;
    salaryRecord.actualSalary = salaryRecord.baseSalary + salaryRecord.overtimePay + salaryRecord.benefits + salaryRecord.subsidy - salaryRecord.socialSecurityEmployee - totalDeduction;
    
    const updatedSalaries = [...salaryRecords, salaryRecord];
    setSalaryRecords(updatedSalaries);
    saveData('salary_records', updatedSalaries);

    // 🔥 同步到 Firestore
    try {
      await smartAddDocument('salary_records', salaryRecord);
      console.log('✅ 工资结算记录已同步到 Firestore');
    } catch (error) {
      console.error('❌ 同步工资结算记录失败:', error);
    }

    // 🔄 同步创建开支记录（从营业额扣除）- 使用 dataManager
    const expenseDate = getLocalDateString(); // 🔥 使用本地时间
    
    const salaryExpense = {
      id: `salary_${Date.now()}`,
      date: expenseDate,
      categoryId: 'employee_salary',
      categoryName: '员工薪资',
      amount: salaryRecord.actualSalary,
      description: `薪资结算 - ${employee.name} (${salaryRecord.startDate} 至 ${salaryRecord.endDate})`,
      employeeId: employee.id,
      employeeName: employee.name,
      relatedType: 'salary',
      salaryPeriod: `${salaryRecord.startDate}_${salaryRecord.endDate}`,
      createdAt: getLocalDateString(), // 🔥 使用本地时间
    };
    
    // ✅ 通过 dataManager 保存，自动触发所有订阅者（包括财务模块）
    dataManager.addData('expenses', salaryExpense);
    
    console.log('💰 已创建薪资开支记录:', salaryExpense);

    // 记录现金流
    if (totalDeduction > 0) {
      recordCashFlow({
        type: 'salary_deduction',
        amount: totalDeduction,
        employeeId: employeeId,
        employeeName: employee.name,
        date: expenseDate,
        description: `${period} 薪资结算扣除借款`,
        salaryPeriod: period,
      });
    }

    // 显示结算结果
    showSalarySlip(salaryRecord, employee);
  };

  // 批量结算
  const handleBatchSettlement = () => {
    const { startDate, endDate, periodType } = batchPeriod;
    
    if (!startDate || !endDate) {
      alert('请选择日期范围');
      return;
    }

    const activeEmployees = employees.filter(e => e.status === 'active');
    if (activeEmployees.length === 0) {
      alert('没有在职员工');
      return;
    }

    if (!window.confirm(`确认为 ${activeEmployees.length} 名员工结算工资吗？\n\n期间：${startDate} 至 ${endDate}\n类型：${periodType === 'first_half' ? '上半月' : '下半月'}`)) {
      return;
    }

    let successCount = 0;
    activeEmployees.forEach(emp => {
      try {
        const period = `${startDate}_${endDate}`;
        handleSingleSettlement(emp.id, period);
        successCount++;
      } catch (error) {
        console.error(`结算失败：${emp.name}`, error);
      }
    });

    alert(`✅ 批量结算完成！\n\n成功：${successCount} 人`);
  };

  // 打印薪资单
  const printSalarySlip = (salaryRecord: SalaryRecord, employee: Employee) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('请允许弹出窗口以打印薪资单');
      return;
    }

    const content = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>薪资单 - ${employee.name}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; max-width: 800px; margin: 0 auto; }
          .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 20px; }
          .company-name { font-size: 24px; font-weight: bold; margin-bottom: 5px; }
          .title { font-size: 18px; color: #666; }
          .info-section { margin-bottom: 20px; }
          .info-row { display: flex; justify-content: space-between; margin-bottom: 8px; }
          .info-label { font-weight: bold; color: #666; }
          .info-value { color: #333; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
          th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
          th { background-color: #f5f5f5; font-weight: bold; }
          .amount { text-align: right; }
          .total-row { font-weight: bold; background-color: #f9f9f9; }
          .signature { margin-top: 40px; display: flex; justify-content: space-between; }
          .signature-item { text-align: center; }
          .signature-line { border-top: 1px solid #333; width: 150px; margin-top: 30px; }
          @media print { body { padding: 0; } }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="company-name">餐厅管理系统</div>
          <div class="title">薪资单</div>
        </div>

        <div class="info-section">
          <div class="info-row">
            <span class="info-label">员工姓名：</span>
            <span class="info-value">${employee.name}</span>
            <span class="info-label">职位：</span>
            <span class="info-value">${employee.position}</span>
          </div>
          <div class="info-row">
            <span class="info-label">结算周期：</span>
            <span class="info-value">${salaryRecord.startDate} 至 ${salaryRecord.endDate}</span>
            <span class="info-label">类型：</span>
            <span class="info-value">${salaryRecord.periodType === 'first_half' ? '上半月' : '下半月'}</span>
          </div>
        </div>

        <h3>收入明细</h3>
        <table>
          <tr>
            <th>项目</th>
            <th class="amount">金额 (C$)</th>
          </tr>
          <tr>
            <td>工作日薪 (${salaryRecord.notes?.match(/上班(\d+)天/)?.[1] || 0}天 + 休息${salaryRecord.notes?.match(/休息(\d+)天/)?.[1] || 0}天)</td>
            <td class="amount">${salaryRecord.baseSalary.toFixed(2)}</td>
          </tr>
          <tr>
            <td>加班费 (${salaryRecord.overtimeHours.toFixed(1)}小时)</td>
            <td class="amount">${salaryRecord.overtimePay.toFixed(2)}</td>
          </tr>
          <tr>
            <td>福利</td>
            <td class="amount">${salaryRecord.benefits.toFixed(2)}</td>
          </tr>
          <tr>
            <td>补贴</td>
            <td class="amount">${salaryRecord.subsidy.toFixed(2)}</td>
          </tr>
          <tr class="total-row">
            <td>应发总额</td>
            <td class="amount">${(salaryRecord.baseSalary + salaryRecord.overtimePay + salaryRecord.benefits + salaryRecord.subsidy).toFixed(2)}</td>
          </tr>
        </table>

        <h3>扣款明细</h3>
        <table>
          <tr>
            <th>项目</th>
            <th class="amount">金额 (C$)</th>
          </tr>
          <tr>
            <td>社保个人部分${salaryRecord.periodType === 'first_half' ? ' (上半月不扣)' : ''}</td>
            <td class="amount">${salaryRecord.socialSecurityEmployee.toFixed(2)}</td>
          </tr>
          <tr>
            <td>借款扣除</td>
            <td class="amount">${salaryRecord.loanRepayment.toFixed(2)}</td>
          </tr>
          <tr class="total-row">
            <td>扣款总额</td>
            <td class="amount">${(salaryRecord.socialSecurityEmployee + salaryRecord.loanRepayment).toFixed(2)}</td>
          </tr>
        </table>

        <h3>实发工资</h3>
        <table>
          <tr class="total-row" style="font-size: 18px;">
            <td>实际到手工资</td>
            <td class="amount" style="color: #10b981;">C$ ${salaryRecord.actualSalary.toFixed(2)}</td>
          </tr>
        </table>

        <div class="signature">
          <div class="signature-item">
            <div>员工签字</div>
            <div class="signature-line"></div>
          </div>
          <div class="signature-item">
            <div>财务审核</div>
            <div class="signature-line"></div>
          </div>
          <div class="signature-item">
            <div>日期</div>
            <div class="signature-line">${new Date().toLocaleDateString('zh-CN')}</div>
          </div>
        </div>
      </body>
      </html>
    `;

    printWindow.document.write(content);
    printWindow.document.close();
    setTimeout(() => {
      printWindow.print();
    }, 250);
  };

  // 显示薪资单（弹窗）
  const showSalarySlip = (salaryRecord: SalaryRecord, employee: Employee) => {
    const result = window.confirm(
      `✅ 薪资结算完成！\n\n` +
      `员工：${employee.name}\n` +
      `期间：${salaryRecord.startDate} 至 ${salaryRecord.endDate}\n\n` +
      `【收入明细】\n` +
      `工作日薪：C$ ${salaryRecord.baseSalary.toFixed(2)}\n` +
      `加班费：C$ ${salaryRecord.overtimePay.toFixed(2)}\n` +
      `福利：C$ ${salaryRecord.benefits.toFixed(2)}\n` +
      `补贴：C$ ${salaryRecord.subsidy.toFixed(2)}\n\n` +
      `应发总额：C$ ${(salaryRecord.baseSalary + salaryRecord.overtimePay + salaryRecord.benefits + salaryRecord.subsidy).toFixed(2)}\n\n` +
      `【扣款明细】\n` +
      `社保个人：C$ ${salaryRecord.socialSecurityEmployee.toFixed(2)}${salaryRecord.periodType === 'first_half' ? ' (上半月不扣)' : ''}\n` +
      `借款扣除：C$ ${salaryRecord.loanRepayment.toFixed(2)}\n\n` +
      `💰 实发工资：C$ ${salaryRecord.actualSalary.toFixed(2)}\n\n` +
      `是否打印薪资单？`
    );
    
    if (result) {
      printSalarySlip(salaryRecord, employee);
    }
  };

  // 打印全员汇总表
  const printBatchSummary = (records: SalaryRecord[]) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('请允许弹出窗口以打印汇总表');
      return;
    }

    const totalBaseSalary = records.reduce((sum, r) => sum + r.baseSalary, 0);
    const totalOvertimePay = records.reduce((sum, r) => sum + r.overtimePay, 0);
    const totalBenefits = records.reduce((sum, r) => sum + r.benefits, 0);
    const totalSubsidy = records.reduce((sum, r) => sum + r.subsidy, 0);
    const totalSocialSecurity = records.reduce((sum, r) => sum + r.socialSecurityEmployee, 0);
    const totalLoanRepayment = records.reduce((sum, r) => sum + r.loanRepayment, 0);
    const totalActualSalary = records.reduce((sum, r) => sum + r.actualSalary, 0);

    const content = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>薪资汇总表</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; }
          .header { text-align: center; margin-bottom: 20px; }
          .title { font-size: 24px; font-weight: bold; }
          .period { font-size: 16px; color: #666; margin-top: 5px; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          th, td { padding: 8px; text-align: left; border: 1px solid #ddd; }
          th { background-color: #f5f5f5; font-weight: bold; }
          .amount { text-align: right; }
          .total-row { font-weight: bold; background-color: #f9f9f9; }
          @media print { body { padding: 0; } }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="title">员工薪资汇总表</div>
          <div class="period">${records[0]?.startDate || ''} 至 ${records[0]?.endDate || ''} (${records[0]?.periodType === 'first_half' ? '上半月' : '下半月'})</div>
        </div>

        <table>
          <thead>
            <tr>
              <th>员工姓名</th>
              <th>职位</th>
              <th class="amount">工作日薪</th>
              <th class="amount">加班费</th>
              <th class="amount">福利</th>
              <th class="amount">补贴</th>
              <th class="amount">社保</th>
              <th class="amount">借款扣除</th>
              <th class="amount">实发工资</th>
            </tr>
          </thead>
          <tbody>
            ${records.map(record => {
              const emp = employees.find(e => e.id === record.employeeId);
              return `
                <tr>
                  <td>${emp?.name || '未知'}</td>
                  <td>${emp?.position || '-'}</td>
                  <td class="amount">${record.baseSalary.toFixed(2)}</td>
                  <td class="amount">${record.overtimePay.toFixed(2)}</td>
                  <td class="amount">${record.benefits.toFixed(2)}</td>
                  <td class="amount">${record.subsidy.toFixed(2)}</td>
                  <td class="amount">${record.socialSecurityEmployee.toFixed(2)}</td>
                  <td class="amount">${record.loanRepayment.toFixed(2)}</td>
                  <td class="amount"><strong>${record.actualSalary.toFixed(2)}</strong></td>
                </tr>
              `;
            }).join('')}
            <tr class="total-row">
              <td colspan="2">合计</td>
              <td class="amount">${totalBaseSalary.toFixed(2)}</td>
              <td class="amount">${totalOvertimePay.toFixed(2)}</td>
              <td class="amount">${totalBenefits.toFixed(2)}</td>
              <td class="amount">${totalSubsidy.toFixed(2)}</td>
              <td class="amount">${totalSocialSecurity.toFixed(2)}</td>
              <td class="amount">${totalLoanRepayment.toFixed(2)}</td>
              <td class="amount">${totalActualSalary.toFixed(2)}</td>
            </tr>
          </tbody>
        </table>

        <div style="margin-top: 20px; text-align: right; font-size: 12px; color: #666;">
          打印时间：${new Date().toLocaleString('zh-CN')}
        </div>
      </body>
      </html>
    `;

    printWindow.document.write(content);
    printWindow.document.close();
    setTimeout(() => {
      printWindow.print();
    }, 250);
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
    input: {
      width: '100%',
      padding: '0.5rem',
      border: '1px solid #d1d5db',
      borderRadius: '0.375rem',
      fontSize: '0.875rem',
    },
    select: {
      width: '100%',
      padding: '0.5rem',
      border: '1px solid #d1d5db',
      borderRadius: '0.375rem',
      fontSize: '0.875rem',
    },
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ marginBottom: '1.5rem', flexShrink: 0 }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: '700', margin: 0 }}>💰 薪资结算</h2>
        <p style={{ color: '#6b7280', marginTop: '0.5rem' }}>
          支持单人结算和批量结算，半月发薪制
        </p>
      </div>

      {/* 结算模式切换 - 固定在顶部 */}
      <div style={{ ...styles.card, flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button
            onClick={() => setSettlementMode('single')}
            style={{
              ...styles.btn(settlementMode === 'single' ? '#3b82f6' : '#6b7280'),
              flex: 1,
            }}
          >
            👤 单人结算
          </button>
          <button
            onClick={() => setSettlementMode('batch')}
            style={{
              ...styles.btn(settlementMode === 'batch' ? '#3b82f6' : '#6b7280'),
              flex: 1,
            }}
          >
            👥 批量结算
          </button>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>

      {/* 单人结算 */}
      {settlementMode === 'single' && (
        <div style={styles.card}>
          <h3 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '1rem' }}>📅 选择员工和日期范围</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '1rem' }}>
            {employees.filter(e => e.status === 'active').map((emp) => {
              const activeLoans = loanRecords.filter(
                loan => loan.employeeId === emp.id && loan.status === 'active'
              );
              const totalLoan = activeLoans.reduce((sum, l) => sum + l.remainingAmount, 0);
              
              return (
                <div key={emp.id} style={{
                  padding: '1rem',
                  background: '#f9fafb',
                  borderRadius: '0.75rem',
                  border: '2px solid #e5e7eb',
                }}>
                  <div style={{ fontWeight: '600', marginBottom: '0.5rem' }}>{emp.name}</div>
                  <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem' }}>
                    {emp.position} · 日薪 C$ {(emp.dailyRate || 0).toFixed(2)}
                  </div>
                  {totalLoan > 0 && (
                    <div style={{ fontSize: '0.75rem', color: '#f59e0b', marginBottom: '0.75rem' }}>
                      ⚠️ 剩余借款: C$ {totalLoan.toFixed(2)}
                    </div>
                  )}
                  
                  {/* 动态福利、补贴和社保输入 */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem', marginBottom: '0.75rem' }}>
                    <div>
                      <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>本月福利 (C$)</div>
                      <input
                        type="number"
                        placeholder="0.00"
                        value={dynamicBenefits[emp.id] || ''}
                        onChange={(e) => setDynamicBenefits({ ...dynamicBenefits, [emp.id]: parseFloat(e.target.value) || 0 })}
                        style={styles.input}
                      />
                    </div>
                    <div>
                      <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>本月补贴 (C$)</div>
                      <input
                        type="number"
                        placeholder="0.00"
                        value={dynamicSubsidy[emp.id] || ''}
                        onChange={(e) => setDynamicSubsidy({ ...dynamicSubsidy, [emp.id]: parseFloat(e.target.value) || 0 })}
                        style={styles.input}
                      />
                    </div>
                    <div>
                      <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>本月社保 (C$)</div>
                      <input
                        type="number"
                        placeholder="0.00"
                        value={dynamicSocialSecurity[emp.id] || ''}
                        onChange={(e) => setDynamicSocialSecurity({ ...dynamicSocialSecurity, [emp.id]: parseFloat(e.target.value) || 0 })}
                        style={styles.input}
                      />
                    </div>
                  </div>
                  
                  <div style={{ marginBottom: '0.75rem' }}>
                    <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>结算日期范围：</div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <input
                        type="date"
                        id={`start-${emp.id}`}
                        defaultValue={getLocalDateString(new Date(Date.now() - 15 * 24 * 60 * 60 * 1000))} // 🔥 使用本地时间
                        style={{ flex: 1, padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', fontSize: '0.75rem' }}
                      />
                      <span style={{ lineHeight: '2rem' }}>至</span>
                      <input
                        type="date"
                        id={`end-${emp.id}`}
                        defaultValue={getLocalDateString()} // 🔥 使用本地时间
                        style={{ flex: 1, padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', fontSize: '0.75rem' }}
                      />
                    </div>
                  </div>
                  
                  <button
                    onClick={() => {
                      const startDate = (document.getElementById(`start-${emp.id}`) as HTMLInputElement)?.value;
                      const endDate = (document.getElementById(`end-${emp.id}`) as HTMLInputElement)?.value;
                      if (!startDate || !endDate) {
                        alert('请选择日期范围');
                        return;
                      }
                      handleSingleSettlement(emp.id, `${startDate}_${endDate}`);
                    }}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      background: '#10b981',
                      color: 'white',
                      border: 'none',
                      borderRadius: '0.5rem',
                      cursor: 'pointer',
                      fontWeight: '600',
                      fontSize: '0.875rem',
                    }}
                  >
                    💵 立即结算
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 批量结算 */}
      {settlementMode === 'batch' && (
        <div style={styles.card}>
          <h3 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '1rem' }}>👥 批量结算配置</h3>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1rem' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.875rem' }}>开始日期</label>
              <input
                type="date"
                value={batchPeriod.startDate}
                onChange={(e) => setBatchPeriod({ ...batchPeriod, startDate: e.target.value })}
                style={styles.input}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.875rem' }}>结束日期</label>
              <input
                type="date"
                value={batchPeriod.endDate}
                onChange={(e) => setBatchPeriod({ ...batchPeriod, endDate: e.target.value })}
                style={styles.input}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.875rem' }}>发薪类型</label>
              <select
                value={batchPeriod.periodType}
                onChange={(e) => setBatchPeriod({ ...batchPeriod, periodType: e.target.value as 'first_half' | 'second_half' })}
                style={styles.select}
              >
                <option value="first_half">上半月 (1-15号)</option>
                <option value="second_half">下半月 (16号-月底)</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '1rem' }}>
            <button
              onClick={handleBatchSettlement}
              style={{ ...styles.btn('#10b981'), flex: 1 }}
            >
              ✅ 开始批量结算
            </button>
            <button
              onClick={() => {
                const recentRecords = salaryRecords.slice(-employees.length);
                if (recentRecords.length > 0) {
                  printBatchSummary(recentRecords);
                } else {
                  alert('暂无薪资记录可打印');
                }
              }}
              style={{ ...styles.btn('#3b82f6'), flex: 1 }}
            >
              🖨️ 打印汇总表
            </button>
          </div>
        </div>
      )}

      {/* 薪资历史记录 */}
      <div style={styles.card}>
        <h3 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '1rem' }}>📊 薪资历史记录</h3>
        {salaryRecords.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#9ca3af' }}>
            暂无薪资记录
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>员工</th>
                  <th style={styles.th}>周期</th>
                  <th style={styles.th}>类型</th>
                  <th style={styles.th}>基本工资</th>
                  <th style={styles.th}>加班费</th>
                  <th style={styles.th}>福利</th>
                  <th style={styles.th}>补贴</th>
                  <th style={styles.th}>社保</th>
                  <th style={styles.th}>借款扣除</th>
                  <th style={styles.th}>实发工资</th>
                  <th style={styles.th}>操作</th>
                </tr>
              </thead>
              <tbody>
                {salaryRecords.slice().reverse().map((record) => {
                  const emp = employees.find(e => e.id === record.employeeId);
                  return (
                    <tr key={record.id}>
                      <td style={{ ...styles.td, fontWeight: '600' }}>{emp?.name || '未知'}</td>
                      <td style={styles.td}>{record.month}</td>
                      <td style={styles.td}>
                        <span style={{
                          padding: '0.25rem 0.5rem',
                          borderRadius: '0.25rem',
                          fontSize: '0.75rem',
                          backgroundColor: record.periodType === 'first_half' ? '#dbeafe' : '#fef3c7',
                          color: record.periodType === 'first_half' ? '#1e40af' : '#92400e',
                        }}>
                          {record.periodType === 'first_half' ? '上半月' : '下半月'}
                        </span>
                      </td>
                      <td style={styles.td}>C$ {record.baseSalary.toFixed(2)}</td>
                      <td style={styles.td}>C$ {record.overtimePay.toFixed(2)}</td>
                      <td style={styles.td}>C$ {record.benefits.toFixed(2)}</td>
                      <td style={styles.td}>C$ {record.subsidy.toFixed(2)}</td>
                      <td style={{ ...styles.td, color: '#ef4444' }}>C$ {record.socialSecurityEmployee.toFixed(2)}</td>
                      <td style={{ ...styles.td, color: '#f59e0b', fontWeight: '600' }}>
                        C$ {record.loanRepayment.toFixed(2)}
                      </td>
                      <td style={{ ...styles.td, fontWeight: 'bold', color: '#10b981' }}>
                        C$ {record.actualSalary.toFixed(2)}
                      </td>
                      <td style={styles.td}>
                        <button
                          onClick={() => emp && printSalarySlip(record, emp)}
                          style={{
                            padding: '0.25rem 0.5rem',
                            backgroundColor: '#3b82f6',
                            color: 'white',
                            border: 'none',
                            borderRadius: '0.25rem',
                            cursor: 'pointer',
                            fontSize: '0.75rem',
                          }}
                        >
                          🖨️ 打印
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      </div>
    </div>
  );
};

export default SalarySettlement;
