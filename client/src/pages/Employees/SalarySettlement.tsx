import React, { useState } from 'react';
import { dataManager } from '../../services/dataManager';
import { getLocalDateString } from '../../utils/exchangeRate'; // 濠碘槅鍋撶徊浠嬪疮椤栫偛姹?闂備浇顕уù鐑藉极閹间礁鍌ㄧ憸鏂跨暦閿濆骞㈡繛鎴灻悵妯侯渻閵堝棗鍧婇柛瀣尰缁绘繈鍩€椤掑嫬绠绘い鏃囧亹閻嫰姊洪棃娑辨闂傚嫬瀚板畷娲磼濠ф儳浜鹃悷娆忓閸嬬娀鏌涙惔銊ゆ喚鐎?
import { smartAddDocument, smartSetDocument, smartUpdateDocument } from '../../services/smartSyncService';
import { getVisibleLoanRecords } from '../../utils/employeeLoans';
import { getSingleSalaryDefaultPeriod } from '../../utils/employeeRecords';
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

interface AttendanceRecord {
  id: string;
  employeeId: string;
  date: string;
  checkIn?: string;
  checkOut?: string;
  workHours: number;
  status: 'normal' | 'late' | 'early_leave' | 'absent' | 'leave' | 'rest' | 'empty';
  notes?: string;
  settledSalaryId?: string;
  settledSalaryPeriod?: string;
  settledAt?: string;
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
  benefits: number; // 闂佽崵鍠愮划搴㈡櫠濡ゅ懎绠伴悹鍥嚋閼板潡鏌嶈閸撴稓妲愰幒妤€纾兼慨妯夸含椤斿洭姊虹化鏇熸珔閻庢矮鍗冲顐㈩吋婢跺﹪鍞跺┑鐘绘涧閺屽﹤螖閸涱喚鍘靛銈嗗灱濞夋洜绮佃箛鏇犵＜?
  subsidy: number; // 闂佽崵鍠愮划搴㈡櫠濡ゅ懎绠伴悹鍥嚋閼板潡鏌嶈閸撶喖骞冪捄琛℃闁哄诞鍐ㄐ撻梻浣告啞鐢鎯勯鐐叉瀬鐎广儱顦柋鍥ㄧ節闂堟稒鐓€婵°倕鎳忛悡娆愩亜閹达絾纭剁紒娑樼箳缁?
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

interface SalarySettlementProps {
  employees: Employee[];
  attendanceRecords: AttendanceRecord[];
  setAttendanceRecords: React.Dispatch<React.SetStateAction<AttendanceRecord[]>>;
  salaryRecords: SalaryRecord[];
  setSalaryRecords: React.Dispatch<React.SetStateAction<SalaryRecord[]>>;
  loanRecords: LoanRecord[];
  setLoanRecords: React.Dispatch<React.SetStateAction<LoanRecord[]>>;
  loanExpenseRecords: LoanExpenseRecord[];
  cashFlowRecords: CashFlowRecord[];
  setCashFlowRecords: React.Dispatch<React.SetStateAction<CashFlowRecord[]>>;
}

const SalarySettlement: React.FC<SalarySettlementProps> = ({
  employees,
  attendanceRecords,
  setAttendanceRecords,
  salaryRecords,
  setSalaryRecords,
  loanRecords,
  setLoanRecords,
  loanExpenseRecords,
  cashFlowRecords,
  setCashFlowRecords,
}) => {
  const [settlementMode, setSettlementMode] = useState<'single' | 'batch'>('single');
  const [salaryHistoryStartDate, setSalaryHistoryStartDate] = useState(getLocalDateString(new Date(Date.now() - 15 * 24 * 60 * 60 * 1000)));
  const [salaryHistoryEndDate, setSalaryHistoryEndDate] = useState(getLocalDateString());
  
  const [batchPeriod, setBatchPeriod] = useState({
    startDate: getLocalDateString(new Date(new Date().getFullYear(), new Date().getMonth(), 1)), // 濠碘槅鍋撶徊浠嬪疮椤栫偛姹?婵犵數鍋犻幓顏嗙礊閳ь剚绻涙径瀣鐎殿噮鍋婃俊鑸靛緞婵犲倻褰夋俊鐐€栧濠氬磻閹惧绡€闁逞屽墴楠炴﹢顢欓懖鈺冩綁闂備礁澹婇崑鍛哄鈧弫?
    endDate: getLocalDateString(), // 濠碘槅鍋撶徊浠嬪疮椤栫偛姹?婵犵數鍋犻幓顏嗙礊閳ь剚绻涙径瀣鐎殿噮鍋婃俊鑸靛緞婵犲倻褰夋俊鐐€栧濠氬磻閹惧绡€闁逞屽墴楠炴﹢顢欓懖鈺冩綁闂備礁澹婇崑鍛哄鈧弫?
    periodType: 'second_half' as 'first_half' | 'second_half',
  });
  
  // 闂傚倷绀侀幉锟犮€冮崱妞曟椽骞嬪顑嫬绶炵€光偓閳ь剛澹曟總鍛婄厵闁诡垎鍐炬殺闂佸搫妫崜鐔煎蓟閿熺姴绀冮柕濞垮労閺嗐垹鈹戦悙鑼闁搞劌鐏濋悾宄扳攽鐎ｎ€晠鏌ㄩ弮鍌涘殌濞存粍鍎抽湁闁挎繂瀚鐔哥箾閹绘帗鍋ラ柡?闂備浇宕甸崑鐐电矙韫囨稑纾块柟缁㈠枛缁€?缂傚倸鍊风拋鏌ュ磻閹剧粯鐓曟繛鍡楃Т閸斻倗绱?
  const [dynamicBenefits, setDynamicBenefits] = useState<Record<string, number>>({});
  const [dynamicSubsidy, setDynamicSubsidy] = useState<Record<string, number>>({});
  const [dynamicSocialSecurity, setDynamicSocialSecurity] = useState<Record<string, number>>({});



  const recordCashFlow = async (flow: Omit<CashFlowRecord, 'id'> & { id?: string }) => {
    const newFlow: CashFlowRecord = {
      ...flow,
      id: flow.id || `cash_flow_${Date.now()}`,
    };
    
    try {
      await smartAddDocument('cash_flow_records', newFlow);
    } catch (error) {
      console.error('闂傚倷绀侀幉锟犳嚌妤ｅ啫瀚夋い鎺戝閺佸棝鏌ｉ幇顒佲枙闁哥喎鎳橀弻鏇熷緞閸繂顬嬮梺闈涚墱閸嬪﹪寮婚敐鍜佺叆闁逞屽墴瀹曪繝骞庨挊澶愭７闂佽鍨奸悘鎰喆閸曨剙顎撻柣鐔哥懃鐎氼剟鎯佺紒妯肩瘈闁靛繆鈧啿濮哥紓渚囧枛婢т粙骞?', error);
      throw error;
    }

    const updated = [...cashFlowRecords, newFlow];
    setCashFlowRecords(updated);
  };

  const getActiveLoansForEmployee = (employeeId: string): LoanRecord[] => {
    return getVisibleLoanRecords(loanRecords, loanExpenseRecords)
      .filter(loan => loan.employeeId === employeeId);
  };

  const getRemainingLoan = (employeeId: string): number => {
    const activeLoans = getActiveLoansForEmployee(employeeId);
    return activeLoans.reduce((sum, loan) => sum + loan.remainingAmount, 0);
  };

  const getSalaryRecordId = (employeeId: string, startDate: string, endDate: string) =>
    `salary_${employeeId}_${startDate}_${endDate}`;

  const getSalaryExpenseId = (salaryRecordId: string) =>
    `expense_${salaryRecordId}`;

  const markAttendanceRecordsSettled = async (employeeId: string, startDate: string, endDate: string, salaryRecordId: string) => {
    const salaryPeriod = `${startDate}_${endDate}`;
    const settledAt = getLocalDateString();
    const recordsToSettle = attendanceRecords
      .filter(record => record.employeeId === employeeId && record.date >= startDate && record.date <= endDate)
      .map(record => ({
        ...record,
        settledSalaryId: salaryRecordId,
        settledSalaryPeriod: salaryPeriod,
        settledAt
      }));

    if (recordsToSettle.length === 0) return attendanceRecords;

    const settledRecordMap = new Map(recordsToSettle.map(record => [record.id, record]));
    const nextAttendanceRecords = attendanceRecords.map(record => settledRecordMap.get(record.id) || record);

    await Promise.all(recordsToSettle.map(record => smartSetDocument('attendance_records', record.id, record)));
    setAttendanceRecords(nextAttendanceRecords);
    return nextAttendanceRecords;
  };

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
    
    // 缂傚倸鍊搁崐鐑芥嚄閸洖绐楅柡鍥ュ焺閺佸洭鏌熼梻瀵割槮閻熸瑱绠撻弻娑㈠即閵娿儱瀛ｅ┑鐐插悑瀹€鎼佸蓟閿濆憘鐔煎垂椤旀儳甯块梻渚€鈧偛鑻崢鎼佹煠鐎圭姵纭鹃柍缁樻崌楠炲鎮欓懠顒傜嵁闂備礁鍟块幖顐﹀磹閻熸壋鏋?
    const workDays = attendances.filter(r => r.status === 'normal').length;
    const restDays = attendances.filter(r => r.status === 'rest').length;
    const absentDays = attendances.filter(r => r.status === 'absent').length;
    const leaveDays = attendances.filter(r => r.status === 'leave').length;
    
    // 闂佽姘﹂～澶愬箖閸洖纾块柟娈垮枤缁€濠囨煛閸愩劎澧曠紒顐㈢Ч閺屾洘寰勯崼婵嗩瀴闂?= 闂傚倷绀侀幖顐﹀疮閵娾晛纾块柟缁㈠枛閽?闂?(婵犵數鍋為崹鍫曞箰閹间焦鏅濋柨鏇氶檷娴滆銇勯弮鍥棄缂佸墎鍋ら弻宥夊传閸曨偀鍋撻悷鎵虫灁?+ 婵犵數鍋炲娆撳触鐎ｎ喖鍨傞柤鎼佹涧椤曢亶鏌涘☉鍗炴灈缂佸墎鍋ら弻宥夊传閸曨偀鍋撻悷鎵虫灁?
    const paidDays = workDays + restDays;
    const basePay = employee.dailyRate * paidDays;
    
    let overtimeHours = 0;
    attendances.filter(r => r.status === 'normal').forEach(r => {
      if (r.workHours > 9) {
        overtimeHours += (r.workHours - 9);
      }
    });
    
    const overtimePay = overtimeHours * employee.overtimeRate;

    // 婵犵數鍋犻幓顏嗙礊閳ь剚绻涙径瀣鐎殿噮鍋婃俊鑸靛緞婵犲嫷妲烽梻渚€娼ч…顓㈡嚈瑜版帒纾婚柟鎯х摠婵挳鏌ｉ敐鍛伇闁绘劖娲熷铏圭矙鐠恒劎鐤勯梺绋块閸熷潡鍩㈤幘璇茬闁绘鏁搁悞鍧楁椤愩垺澶勯柟鍛婃倐閹偛煤椤忓懐鍘梺绯曞墲濞叉绮婃导瀛樺癄闁绘柨鍚嬮崑锝夋煙闁箑骞楃紓宥嗗灴閺岀喖鏌ㄧ€ｎ亶妫嗙紓渚囧枛閻楁挸鐣烽敐澶娢ㄧ憸蹇涱敊?
    const benefits = monthBenefits !== undefined ? monthBenefits : 0;
    const subsidy = monthSubsidy !== undefined ? monthSubsidy : 0;

    // 缂傚倸鍊风拋鏌ュ磻閹剧粯鐓曟繛鍡楃Т閸斻倗绱掗悩杈╃煓闁哄被鍔岄埥澶娾枎閹烘埈妫熸俊鐐€愰弫顏堝炊瑜嶉崵鎴濃攽閻樿宸ラ悗姘煎墴璺〒姘ｅ亾闁哄本鐩顒傛嫚閹绘帩娼婄紓鍌欑窔椤ゅ倿宕ｉ崘銊ф殾婵°倕鎳庡敮闂侀潧鐗嗗ú銈夊疾閳哄懏鈷戦柛娑橈工缁楁岸鏌ｉ悢鏉戔偓鏍崲濞戙垹鐐婃い鎺嶇娴犳椽姊洪棃娑辩劸闁告柨娴风槐娆愮節濮橆厾鍘遍棅顐㈡搐椤戝懘宕濆鑸电厓鐟滄粓宕滃☉銏犖ラ悗锝庡墯椤洘绻濋棃娑卞剰閻熸瑱绠撻弻銊╁即濡も偓娴滈箖姊洪崜鑼帥闁搞劏娉涢锝夋偩鐏炴儳鏋傞梺鍛婃处閸嬪棝濡堕敃鍌涒拺闁告稑锕﹂幊鍕煕閵娿儯鍋㈢€殿喖顭峰畷鎺戭煥閸涱厽娈梺鑽ゅТ濞测晝浜稿▎鎾崇劦妞ゆ帒鍊搁崢瀵糕偓瑙勬礃閿曘垹鐣峰鈧幊鐘活敆娴ｅ湱妲?
    let socialSecurityEmployee = 0;
    if (monthSocialSecurity !== undefined) {
      socialSecurityEmployee = monthSocialSecurity;
    } else if (periodType === 'second_half') {
      // 婵犵數鍋為崹鍫曞箰閹间緡鏁勯柛娑卞幘閺嗭箓鏌熼悧鍫熺凡閻庢艾顦甸弻娑㈩敃閿濆洨鐓傞梺鑽ゅ櫏閸撶喖寮婚敓鐘查唶妞ゆ劧绱曢崙瑙勭節閳封偓閸曨厾鐓夐悗瑙勬礃缁诲牊淇婇幖浣肝╃憸蹇涙倷閺囥垺鈷戠紒瀣硶缁犵偤鏌涙惔銈呭惞婵″弶鍔曢埞鎴﹀炊閼稿吀绮繝纰樻閸ㄩ亶顢栧▎鎾宠Е闁搞儜鈧Σ?闂傚倷鐒︾€笛呯矙閹达附鍋嬮柛鈩冾樅閸濆嫷鐓ラ柛鏇ㄥ幐閺嬫牠姊洪崨濠勭畵閻庢凹鍙冨畷浼村川椤栨浜鹃悷娆忓閸嬬娀鏌涙惔銏㈠弨濠碘剝鎸冲畷鎺戭潩閸忚偐顩梻浣稿閸嬪懐鍒掕箛娑樺偍妞ゆ帒鍊甸崑鎾舵喆閸曨厽鎲欓柣蹇撶箲閻熴倗鑺卞ú顏呪拻闁稿本鑹鹃銉╂煕婵炑冩噺椤?
      socialSecurityEmployee = 0;
    }

    const socialSecurity = {
      employee: socialSecurityEmployee,
      company: 0, // 闂傚倷鑳堕…鍫澝瑰璺虹婵炲棗娴氶崵妤呮煕閹伴潧鏋熼柣鎺楃畺閺屾洘绻涢崹顔煎闂佽楠搁…鐑藉蓟閿熺姴骞㈡俊銈傚亾闁逞屽墴椤ユ挾鍒掗鐔风窞閻庯綆鍋勯鎾绘煟閻樺厖鑸柛鏂跨Ч瀵?
    };

    // 闂傚倷绀侀崥瀣磿閹惰棄搴婇柤鑹扮堪娴滃綊鏌涢妷顔煎缂佲偓閸儲鐓冮悶娑掆偓鍏呭缂傚倸鍊哥粔鐢稿垂閸喚鏆﹂柟鎵閸嬪嫰鏌涢幘鏉戠祷闁?
    const remainingLoan = getRemainingLoan(employee.id);
    // 闂傚倷鑳堕…鍫ユ晝閿曞倸绐楅柟浼村亰閺佸嫭绻涢崱妯诲碍缂佺姰鍎甸弻銊モ攽閸♀晜效闂佺粯绻勯崰鏍蓟閿熺姴閱囨慨姗嗗厸婢规洖鈹戦悩顔肩伇闁糕晜鐗犻幆宀勵敊閻愵剙顏搁梺缁樻煥椤ㄥ酣宕崨瀛樼厪濠㈣泛鐗嗘俊鍧楁煏閸偄浜伴柡?0%
    const maxLoanDeduction = basePay * 0.3;
    const loanRepayment = Math.min(remainingLoan, maxLoanDeduction);

    // 闂備浇顕ф绋匡耿闁秴纾婚柕鍫濇媼閻庤埖銇勯弽顐粶缂佲偓閸℃稒鐓熸俊銈傚亾闁绘妫濊矾濞达綀銆€閸嬫挾鎲撮崟顒€浠╅梺绋块椤曨厾鍒?= 闂佽姘﹂～澶愬箖閸洖纾块柟娈垮枤缁€濠囨煛閸愩劎澧曠紒顐㈢Ч閺屾洘寰勯崼婵嗩瀴闂?+ 闂傚倷绀侀幉鈥愁潖缂佹ɑ鍙忛柣銈庡灛娴滆銇勯弮鍌氫壕閻?+ 缂傚倸鍊风粈渚€宕愰崫銉﹀床闁圭増婢橀弰?+ 闂備浇宕甸崑鐐电矙韫囨稑纾块柟缁㈠枛缁€?- 闂傚倷鑳堕…鍫ユ晝閿曞倸绐楅柟浼村亰閺佸嫭绻涢崱妯诲碍缂佺姰鍎甸弻銊モ攽閸♀晜效闂?- 缂傚倸鍊风拋鏌ュ磻閹剧粯鐓曟繛鍡楃Т閸斻倗绱?
    const grossSalary = basePay + overtimePay + benefits + subsidy;
    const totalDeductions = socialSecurity.employee + loanRepayment;
    const actualSalary = grossSalary - totalDeductions;

    return {
      id: getSalaryRecordId(employee.id, startDate, endDate),
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
      paidDate: getLocalDateString(),
      status: 'paid',
      notes: `Total ${totalDays} days | Work ${workDays} | Rest ${restDays} | Absent ${absentDays} | Leave ${leaveDays}`,
    };
  };

  // 婵犵數濮伴崹鐓庘枖濞戞埃鍋撳鐓庢珝妤犵偛鍟换婵嬪炊瑜忛、鍛存⒑閸濆嫭澶勭€光偓閹间礁鍚归悗锝庡枟閻撴洘绻涢幋鐑嗕痪妞ゅ繐鎳庨閬嶆煙闁箑鏋ょ痪鎯с偢閺岀喖骞嗚椤ｆ娊鏌?
  const handleSingleSettlement = async (employeeId: string, period: string, options: { showSlip?: boolean } = {}): Promise<SalaryRecord | null> => {
    const employee = employees.find(e => e.id === employeeId);
    if (!employee) return null;

    const [startDate, endDate] = period.split('_');
    if (!startDate || !endDate) {
      alert('Formato de fecha invalido');
      return null;
    }

    const existingSalary = salaryRecords.find(record =>
      record.employeeId === employeeId &&
      record.startDate === startDate &&
      record.endDate === endDate
    );
    if (existingSalary) {
      alert(`Este empleado ya tiene salario cerrado entre ${startDate} y ${endDate}`);
      return null;
    }

    const startDay = new Date(startDate).getDate();
    const periodType: 'first_half' | 'second_half' = startDay <= 15 ? 'first_half' : 'second_half';

    // 闂傚倷绀侀崥瀣磿閹惰棄搴婇柤鑹扮堪娴滃綊鏌涢妷顔煎缂佲偓婢舵劖鐓忓┑鐘茬箺閸氬倿鏌涚€ｎ偅灏伴柟宄版嚇閹儳鐣濋埀顒勬倷閺囥垺鈷戠紒瀣硶缁犵偤鏌涙惔鈥虫毐闁崇粯鎹囬獮瀣偐閻㈢數鍔归梻濠庡亜濞诧箓骞愰幖浣瑰€挎繛宸簼閻撳繘鏌涢埄鍐╃缂佷椒鍗抽幐濠囨偄閸忕厧浠梺褰掑亰閸樼晫绱為幋锔界厵闂佸灝顑呴ˉ瀣磼椤旇偐澧︾€规洩缍佹俊鐤槾妞?
    const monthBenefits = dynamicBenefits[employeeId] || 0;
    const monthSubsidy = dynamicSubsidy[employeeId] || 0;
    const monthSocialSecurity = dynamicSocialSecurity[employeeId] || 0;

    const salaryRecord = calculateSalary(employee, startDate, endDate, periodType, monthBenefits, monthSubsidy, monthSocialSecurity);
    
    // 婵犵數濮伴崹鐓庘枖濞戞埃鍋撳鐓庢珝妤犵偛鍟换婵嬪炊瑜忛敍娆撴⒑缂佹ɑ鐓ュ鐟帮躬瀹曟洟濡烽埡鍌滃幍缂佺偓婢橀ˇ杈╃矓椤旂晫绠?
    const activeLoans = getActiveLoansForEmployee(employeeId);

    const maxDeduction = salaryRecord.baseSalary * 0.3;
    let totalDeduction = 0;
    const loansToDeduct: Array<{ loanId: string; amount: number }> = [];

    for (const loan of activeLoans) {
      if (totalDeduction >= maxDeduction) break;
      
      const deductAmount = Math.min(loan.remainingAmount, maxDeduction - totalDeduction);
      loansToDeduct.push({ loanId: loan.id, amount: deductAmount });
      totalDeduction += deductAmount;
    }

    // 闂傚倷绀侀幖顐⒚洪妶澶嬪仱闁靛ň鏅涢拑鐔封攽閻樺弶鎼愮痪鎯х秺閺岋綁寮崹顕呮闂佺绨洪崕鐢稿箖鐟欏嫭濯撮悷娆忓閸戯紕绱?
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

    // 闂傚倷绀侀幖顐⒚洪妶澶嬪仱闁靛ň鏅涢拑鐔封攽閻樺弶澶勯悗鍨戦妵鍕疀閹炬潙绐涢梺闈涚墱閸嬪﹪骞冪憴鍕閻熸瑥瀚崙锛勭磽?
    salaryRecord.loanRepayment = totalDeduction;
    salaryRecord.remainingLoan = activeLoans.reduce((sum, l) => sum + l.remainingAmount, 0) - totalDeduction;
    salaryRecord.actualSalary = salaryRecord.baseSalary + salaryRecord.overtimePay + salaryRecord.benefits + salaryRecord.subsidy - salaryRecord.socialSecurityEmployee - totalDeduction;
    

    // 濠碘槅鍋撶徊浠嬪疮椤栫偛鏋?闂傚倷绀侀幉锟犳嚌妤ｅ啫瀚夋い鎺戝閺佸棝鏌ｉ幇顒佹儓缂佲偓閸℃绠鹃柟瀵稿剱閻掔晫绱掗幉瀣洭闁逞屽墯椤旀牠宕伴幒妤€纾婚柟鍓х帛閻撴盯鏌嶈閸撶喖銆佸☉妯锋斀闁归偊鍓氶弳顏堟煟閻斿摜鐭屽褎顨呯叅闁冲搫鍟～鏇熺箾閸℃ê濮夋い鈺冨厴楠炴牕菐椤掆偓閳ь剚鐗犲畷鏇熷緞婵炵偓顫嶉梺鍦亾濞兼瑩宕悜妯镐簻闁靛牆鎳庨埀顒€娼￠悰顔碱吋婢跺娅滄繝銏ｆ硾椤戝洩銇愰幋锔解拺? 婵犵數鍋犻幓顏嗙礊閳ь剚绻涙径瀣鐎?dataManager
    const expenseDate = getLocalDateString(); // 濠碘槅鍋撶徊浠嬪疮椤栫偛姹?婵犵數鍋犻幓顏嗙礊閳ь剚绻涙径瀣鐎殿噮鍋婃俊鑸靛緞婵犲倻褰夋俊鐐€栧濠氬磻閹惧绡€闁逞屽墴楠炴﹢顢欓懖鈺冩綁闂備礁澹婇崑鍛哄鈧弫?
    
    const salaryExpense = {
      id: getSalaryExpenseId(salaryRecord.id),
      date: expenseDate,
      categoryId: 'employee_salary',
      categoryName: 'Employee Salary',
      amount: salaryRecord.actualSalary,
      description: `Salary settlement - ${employee.name} (${salaryRecord.startDate} - ${salaryRecord.endDate})`,
      employeeId: employee.id,
      employeeName: employee.name,
      relatedType: 'salary',
      salaryPeriod: `${salaryRecord.startDate}_${salaryRecord.endDate}`,
      createdAt: getLocalDateString(), // 濠碘槅鍋撶徊浠嬪疮椤栫偛姹?婵犵數鍋犻幓顏嗙礊閳ь剚绻涙径瀣鐎殿噮鍋婃俊鑸靛緞婵犲倻褰夋俊鐐€栧濠氬磻閹惧绡€闁逞屽墴楠炴﹢顢欓懖鈺冩綁闂備礁澹婇崑鍛哄鈧弫?
    };

    try {
      await Promise.all(
        updatedLoans
          .filter(loan => loansToDeduct.some(deduction => deduction.loanId === loan.id))
          .map(loan => smartUpdateDocument('loan_records', loan.id, loan))
      );
      await smartAddDocument('salary_records', salaryRecord);
      await smartAddDocument('expenses', salaryExpense);
      if (totalDeduction > 0) {
        await recordCashFlow({
          id: `cash_${salaryRecord.id}_loan_deduction`,
          type: 'salary_deduction',
          amount: totalDeduction,
          employeeId: employeeId,
          employeeName: employee.name,
          date: expenseDate,
          description: 'Salary loan deduction - ' + period,
          salaryPeriod: period,
        });
      }
    } catch (error) {
      console.error('Failed to save salary settlement:', error);
      alert('No se pudo guardar el cierre de salario. Revise la red e intente otra vez');
      return null;
    }

    await markAttendanceRecordsSettled(employeeId, startDate, endDate, salaryRecord.id);
    setLoanRecords(updatedLoans);
    setSalaryRecords(records => records.some(record => record.id === salaryRecord.id) ? records : [...records, salaryRecord]);
    const nextExpenses = [...dataManager.getData('expenses'), salaryExpense];
    await dataManager.saveData('expenses', nextExpenses, { syncFirestore: false });

    // 闂傚倷绀侀幖顐も偓姘煎墯閺呰埖绂掔€ｎ€附鎱ㄥΟ澶稿惈缁炬儳銈搁弻鐔煎箚瑜嶉。鎶芥煛閸♀晛澧扮紒杈ㄦ尰閹峰懐鎲撮崟顐︾€洪梻?
    if (options.showSlip !== false) {
      showSalarySlip(salaryRecord, employee);
    }
    return salaryRecord;
  };

  // 闂傚倷绀佺紞濠傤焽瑜忕槐鐐寸節閸パ囨７闂佹儳绻愬﹢杈╁婵傚憡鐓欓柟顖嗗喚鏆㈤梺?
  const handleBatchSettlement = async () => {
    const { startDate, endDate, periodType } = batchPeriod;

    if (!startDate || !endDate) {
                        alert('Seleccione el rango de fechas');
      return;
    }

    const activeEmployees = employees.filter(e => e.status === 'active');
    if (activeEmployees.length === 0) {
      alert('No hay empleados activos');
      return;
    }

    const periodLabel = periodType === 'first_half' ? 'Primera quincena' : 'Segunda quincena';
    const confirmMessage =
      'Confirmar cierre de salario para ' + activeEmployees.length + ' empleados?' +
      '\n\nPeriodo: ' + startDate + ' - ' + endDate +
      '\nTipo: ' + periodLabel;
    if (!window.confirm(confirmMessage)) {
      return;
    }

    let successCount = 0;
    for (const emp of activeEmployees) {
      try {
        const period = startDate + '_' + endDate;
        const result = await handleSingleSettlement(emp.id, period, { showSlip: false });
        if (result) successCount++;
      } catch (error) {
        console.error('Salary settlement failed for ' + emp.name, error);
      }
    }

    alert('Cierre de salario terminado.\n\nExitosos: ' + successCount);
  };

  const printSalarySlip = (salaryRecord: SalaryRecord, employee: Employee) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Permita ventanas emergentes para imprimir');
      return;
    }

    const grossSalary = salaryRecord.baseSalary + salaryRecord.overtimePay + salaryRecord.benefits + salaryRecord.subsidy;
    const totalDeductions = salaryRecord.socialSecurityEmployee + salaryRecord.loanRepayment;
    const content = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Comprobante de salario - ${employee.name}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; max-width: 800px; margin: 0 auto; color: #111827; }
          .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 20px; }
          .company-name { font-size: 24px; font-weight: bold; margin-bottom: 5px; }
          .title { font-size: 18px; color: #666; }
          .info-section { margin-bottom: 20px; }
          .info-row { display: flex; justify-content: space-between; gap: 12px; margin-bottom: 8px; }
          .info-label { font-weight: bold; color: #666; }
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
          <div class="company-name">Restaurant POS</div>
          <div class="title">Comprobante de salario</div>
        </div>
        <div class="info-section">
          <div class="info-row">-</span> ${employee.name}</span>-</span> ${employee.position}</span></div>
          <div class="info-row">-</span> ${salaryRecord.startDate} - ${salaryRecord.endDate}</span>-</span> ${salaryRecord.paidDate || '-'}</span></div>
        </div>
        <h3>Ingresos</h3>
        <table>
          <tr><th>Concepto</th><th class="amount">Monto (C$)</th></tr>
          <tr><td>Salario base</td><td class="amount">${salaryRecord.baseSalary.toFixed(2)}</td></tr>
          <tr><td>Horas extra (${salaryRecord.overtimeHours.toFixed(1)}h)</td><td class="amount">${salaryRecord.overtimePay.toFixed(2)}</td></tr>
          <tr><td>Beneficios</td><td class="amount">${salaryRecord.benefits.toFixed(2)}</td></tr>
          <tr><td>Subsidio</td><td class="amount">${salaryRecord.subsidy.toFixed(2)}</td></tr>
          <tr class="total-row"><td>Total ingresos</td><td class="amount">${grossSalary.toFixed(2)}</td></tr>
        </table>
        <h3>Deducciones</h3>
        <table>
          <tr><th>Concepto</th><th class="amount">Monto (C$)</th></tr>
          <tr><td>Seguro social</td><td class="amount">${salaryRecord.socialSecurityEmployee.toFixed(2)}</td></tr>
          <tr><td>Deduccion prestamo</td><td class="amount">${salaryRecord.loanRepayment.toFixed(2)}</td></tr>
          <tr class="total-row"><td>Total deducciones</td><td class="amount">${totalDeductions.toFixed(2)}</td></tr>
        </table>
        <h3>Neto a pagar</h3>
        <table><tr class="total-row" style="font-size: 18px;"><td>Salario neto</td><td class="amount" style="color: #10b981;">C$ ${salaryRecord.actualSalary.toFixed(2)}</td></tr></table>
        <div class="signature">
          <div class="signature-item"><div>Firma empleado</div><div class="signature-line"></div></div>
          <div class="signature-item"><div>Revision</div><div class="signature-line"></div></div>
          <div class="signature-item"><div>Fecha</div><div class="signature-line">${new Date().toLocaleDateString('es-NI')}</div></div>
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

  const showSalarySlip = (salaryRecord: SalaryRecord, employee: Employee) => {
    const grossSalary = salaryRecord.baseSalary + salaryRecord.overtimePay + salaryRecord.benefits + salaryRecord.subsidy;
    const result = window.confirm(
      `Cierre de salario terminado.\n\n` +
      `Empleado: ${employee.name}\n` +
      `Periodo: ${salaryRecord.startDate} - ${salaryRecord.endDate}\n\n` +
      `Ingresos: C$ ${grossSalary.toFixed(2)}\n` +
      `Seguro social: C$ ${salaryRecord.socialSecurityEmployee.toFixed(2)}\n` +
      `Deduccion prestamo: C$ ${salaryRecord.loanRepayment.toFixed(2)}\n\n` +
      `Neto a pagar: C$ ${salaryRecord.actualSalary.toFixed(2)}\n\n` +
      `Desea imprimir el comprobante?`
    );

    if (result) {
      printSalarySlip(salaryRecord, employee);
    }
  };

  const printBatchSummary = (records: SalaryRecord[]) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Permita ventanas emergentes para imprimir');
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
        <title>Resumen de salarios</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; color: #111827; }
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
          <div class="title">Resumen de salarios</div>
          <div class="period">${records[0]?.startDate || ''} - ${records[0]?.endDate || ''}</div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Empleado</th><th>Puesto</th><th class="amount">Base</th><th class="amount">Extra</th><th class="amount">Beneficios</th><th class="amount">Subsidio</th><th class="amount">Seguro</th><th class="amount">Prestamo</th><th class="amount">Neto</th>
            </tr>
          </thead>
          <tbody>
            ${records.map(record => {
              const emp = employees.find(e => e.id === record.employeeId);
              return `<tr>
                <td>${emp?.name || '-'}</td>
                <td>${emp?.position || '-'}</td>
                <td class="amount">${record.baseSalary.toFixed(2)}</td>
                <td class="amount">${record.overtimePay.toFixed(2)}</td>
                <td class="amount">${record.benefits.toFixed(2)}</td>
                <td class="amount">${record.subsidy.toFixed(2)}</td>
                <td class="amount">${record.socialSecurityEmployee.toFixed(2)}</td>
                <td class="amount">${record.loanRepayment.toFixed(2)}</td>
                <td class="amount">${record.actualSalary.toFixed(2)}</td>
              </tr>`;
            }).join('')}
            <tr class="total-row"><td colspan="2">Total</td><td class="amount">${totalBaseSalary.toFixed(2)}</td><td class="amount">${totalOvertimePay.toFixed(2)}</td><td class="amount">${totalBenefits.toFixed(2)}</td><td class="amount">${totalSubsidy.toFixed(2)}</td><td class="amount">${totalSocialSecurity.toFixed(2)}</td><td class="amount">${totalLoanRepayment.toFixed(2)}</td><td class="amount">${totalActualSalary.toFixed(2)}</td></tr>
          </tbody>
        </table>
        <div style="margin-top: 20px; text-align: right; font-size: 12px; color: #666;">Impreso: ${new Date().toLocaleString('es-NI')}</div>
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
    input: {
      width: '100%',
      padding: '0.58rem 0.68rem',
      border: `1px solid ${colors.borderStrong}`,
      borderRadius: radii.md,
      fontSize: font.body,
      color: colors.textPrimary,
      boxSizing: 'border-box' as const,
    },
    select: {
      width: '100%',
      padding: '0.58rem 0.68rem',
      border: `1px solid ${colors.borderStrong}`,
      borderRadius: radii.md,
      fontSize: font.body,
      color: colors.textPrimary,
      background: colors.surface,
      boxSizing: 'border-box' as const,
    },
  };

  const filteredSalaryRecords = salaryRecords.filter(record => record.endDate >= salaryHistoryStartDate && record.startDate <= salaryHistoryEndDate);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ marginBottom: '1rem', flexShrink: 0 }}>
        <h2 style={{ fontSize: font.section, fontWeight: 750, margin: 0, color: colors.textPrimary }}>Cierre de salarios</h2>
        <p style={{ color: colors.textSecondary, marginTop: '0.35rem', marginBottom: 0, fontSize: font.body }}>
          Calculo de salarios, prestamos y cierre por rango de fechas.
        </p>
      </div>

      {/* 缂傚倸鍊搁崐鐑芥倿閿曞倸绠板Δ锝呭暞閸嬧晠鎮归崶褍妫橀柣鏃傚帶閻忓磭鈧娲栧ú銊┿€侀崨瀛樷拺闁告稑锕ょ粭鎺撶箾鐠囇呯暠闁?- 闂傚倷鐒﹂幃鍫曞磿闁秴绠规い鎰堕檮閸嬧晛螖閿濆懎鏆欓柟鐟扮埣閺屾洘绻涢悙顒佹緭闂侀€炲苯澧柨鏇ㄤ邯瀵?*/}
      <div style={{ ...styles.card, flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button
            onClick={() => setSettlementMode('single')}
            style={{
              ...styles.btn(settlementMode === 'single' ? colors.teal : colors.textSecondary),
              flex: 1,
            }}
          >
            Cierre individual
          </button>
          <button
            onClick={() => setSettlementMode('batch')}
            style={{
              ...styles.btn(settlementMode === 'batch' ? colors.teal : colors.textSecondary),
              flex: 1,
            }}
          >
            Cierre masivo
          </button>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>

      {/* 闂傚倷绀侀幉锟犮€冮崱妞曟椽骞嬪顑嫬绶炵€光偓閳ь剛澹曟總鍛婄厵闁诡垎鍐炬殺闂?*/}
      {settlementMode === 'single' && (
        <div style={styles.card}>
          <h3 style={{ fontSize: font.section, fontWeight: 750, marginBottom: '0.85rem', color: colors.textPrimary }}>Seleccionar empleado y rango</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '0.85rem' }}>
            {employees.filter(e => e.status === 'active').map((emp) => {
              const activeLoans = getActiveLoansForEmployee(emp.id);
              const totalLoan = activeLoans.reduce((sum, l) => sum + l.remainingAmount, 0);
              const defaultPeriod = getSingleSalaryDefaultPeriod(emp, salaryRecords, getLocalDateString());
              
              return (
                <div key={emp.id} style={{
                  padding: '0.9rem',
                  background: colors.surfaceMuted,
                  borderRadius: radii.lg,
                  border: `1px solid ${colors.border}`,
                }}>
                  <div style={{ fontWeight: 750, marginBottom: '0.35rem', color: colors.textPrimary }}>{emp.name}</div>
                  <div style={{ fontSize: font.caption, color: colors.textSecondary, marginBottom: '0.5rem' }}>
                    {emp.position} - Dia C$ {(emp.dailyRate || 0).toFixed(2)}
                  </div>
                  {totalLoan > 0 && (
                    <div style={{ fontSize: font.caption, color: colors.amber, marginBottom: '0.75rem' }}>
                      Prestamo pendiente: C$ {totalLoan.toFixed(2)}
                    </div>
                  )}
                  
                  {/* 闂傚倷绀侀幉锟犲蓟閿濆绀夌€广儱顦悞鍨亜閹达絽鍔甸柛蹇撴湰閵囧嫰鍩￠崒娑樺攭閻庤娲樺畝鎼佸春閻愬瓨鍎熼柟鎯у帠婢规洘绻涙潏鍓у埌濠㈣鐟﹀鍕沪閹屼紩闂備礁鎼ˇ浼村垂閸撲讲鍋撳鍐茬毢缂佽鲸甯￠崺鈧い鎺戝閻鏌曟竟顖氭媼閸熷秹姊洪崫鍕垫Ц闁绘锕獮鎰板箹娴ｅ摜鐓?*/}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem', marginBottom: '0.75rem' }}>
                    <div>
                        <div style={{ fontSize: font.caption, color: colors.textSecondary, marginBottom: '0.25rem' }}>Beneficios</div>
                      <input
                        type="number"
                        placeholder="0.00"
                        value={dynamicBenefits[emp.id] || ''}
                        onChange={(e) => setDynamicBenefits({ ...dynamicBenefits, [emp.id]: parseFloat(e.target.value) || 0 })}
                        style={styles.input}
                      />
                    </div>
                    <div>
                        <div style={{ fontSize: font.caption, color: colors.textSecondary, marginBottom: '0.25rem' }}>Subsidio</div>
                      <input
                        type="number"
                        placeholder="0.00"
                        value={dynamicSubsidy[emp.id] || ''}
                        onChange={(e) => setDynamicSubsidy({ ...dynamicSubsidy, [emp.id]: parseFloat(e.target.value) || 0 })}
                        style={styles.input}
                      />
                    </div>
                    <div>
                        <div style={{ fontSize: font.caption, color: colors.textSecondary, marginBottom: '0.25rem' }}>Seguro social</div>
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
                        <div style={{ fontSize: font.caption, color: colors.textSecondary, marginBottom: '0.25rem' }}>Rango de pago</div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <input
                        type="date"
                        id={`start-${emp.id}`}
                        defaultValue={defaultPeriod.startDate}
                        style={{ ...styles.input, flex: 1, fontSize: font.caption }}
                      />
                      <span style={{ lineHeight: '2rem' }}>-</span>
                      <input
                        type="date"
                        id={`end-${emp.id}`}
                        defaultValue={defaultPeriod.endDate}
                        style={{ ...styles.input, flex: 1, fontSize: font.caption }}
                      />
                    </div>
                  </div>
                  
                  <button
                    onClick={() => {
                      const startDate = (document.getElementById(`start-${emp.id}`) as HTMLInputElement)?.value;
                      const endDate = (document.getElementById(`end-${emp.id}`) as HTMLInputElement)?.value;
                      if (!startDate || !endDate) {
                        alert('Seleccione el rango de fechas');
                        return;
                      }
                      handleSingleSettlement(emp.id, `${startDate}_${endDate}`);
                    }}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      background: colors.success,
                      color: colors.surface,
                      border: 'none',
                      borderRadius: radii.md,
                      cursor: 'pointer',
                      fontWeight: 700,
                      fontSize: font.body,
                    }}
                  >
                    Cerrar salario
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 闂傚倷绀佺紞濠傤焽瑜忕槐鐐寸節閸パ囨７闂佹儳绻愬﹢杈╁婵傚憡鐓欓柟顖嗗喚鏆㈤梺?*/}
      {settlementMode === 'batch' && (
        <div style={styles.card}>
          <h3 style={{ fontSize: font.section, fontWeight: 750, marginBottom: '0.85rem', color: colors.textPrimary }}>Cierre masivo de salarios</h3>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1rem' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 700, fontSize: font.body, color: colors.textPrimary }}>Fecha inicio</label>
              <input
                type="date"
                value={batchPeriod.startDate}
                onChange={(e) => setBatchPeriod({ ...batchPeriod, startDate: e.target.value })}
                style={styles.input}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 700, fontSize: font.body, color: colors.textPrimary }}>Fecha fin</label>
              <input
                type="date"
                value={batchPeriod.endDate}
                onChange={(e) => setBatchPeriod({ ...batchPeriod, endDate: e.target.value })}
                style={styles.input}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 700, fontSize: font.body, color: colors.textPrimary }}>Tipo</label>
              <select
                value={batchPeriod.periodType}
                onChange={(e) => setBatchPeriod({ ...batchPeriod, periodType: e.target.value as 'first_half' | 'second_half' })}
                style={styles.select}
              >
                <option value="first_half">Primera quincena</option>
                <option value="second_half">Segunda quincena</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '1rem' }}>
            <button
              onClick={handleBatchSettlement}
              style={{ ...styles.btn(colors.success), flex: 1 }}
            >
              Iniciar cierre masivo
            </button>
            <button
              onClick={() => {
                const recentRecords = salaryRecords.slice(-employees.length);
                if (recentRecords.length > 0) {
                  printBatchSummary(recentRecords);
                } else {
                  alert('No hay registros de salario para imprimir');
                }
              }}
              style={{ ...styles.btn(colors.blue), flex: 1 }}
            >
              Imprimir resumen
            </button>
          </div>
        </div>
      )}

      {/* 闂傚倷娴囨慨銈夋偋椤掍胶顩查柨婵嗘川閻牊銇勯幇鍓佺暠闁稿被鍔戦弻娑㈠焺閸愮偓鐣堕梺鑺ュ灥椤︾敻骞冪憴鍕閻熸瑥瀚崙锛勭磽?*/}
      <div style={styles.card}>
          <h3 style={{ fontSize: font.section, fontWeight: 750, marginBottom: '0.85rem', color: colors.textPrimary }}>Historial de salarios</h3>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap' }}>
          <input
            type="date"
            value={salaryHistoryStartDate}
            onChange={(e) => setSalaryHistoryStartDate(e.target.value)}
            style={styles.input}
          />
          <span style={{ color: colors.textSecondary, fontSize: font.body }}>-</span>
          <input
            type="date"
            value={salaryHistoryEndDate}
            onChange={(e) => setSalaryHistoryEndDate(e.target.value)}
            style={styles.input}
          />
        </div>
        {filteredSalaryRecords.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: colors.textMuted }}>
            Sin registros de salario
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Empleado</th>
                  <th style={styles.th}>Periodo</th>
                  <th style={styles.th}>Base</th>
                  <th style={styles.th}>Extra</th>
                  <th style={styles.th}>Beneficios</th>
                  <th style={styles.th}>Subsidio</th>
                  <th style={styles.th}>Seguro</th>
                  <th style={styles.th}>Prestamo</th>
                  <th style={styles.th}>Neto</th>
                  <th style={styles.th}>Accion</th>
                </tr>
              </thead>
              <tbody>
                {filteredSalaryRecords.slice().reverse().map((record) => {
                  const emp = employees.find(e => e.id === record.employeeId);
                  return (
                    <tr key={record.id}>
                      <td style={{ ...styles.td, fontWeight: '600' }}>{emp?.name || '-'}</td>
                      <td style={styles.td}>{record.startDate} - {record.endDate}</td>
                      <td style={styles.td}>C$ {record.baseSalary.toFixed(2)}</td>
                      <td style={styles.td}>C$ {record.overtimePay.toFixed(2)}</td>
                      <td style={styles.td}>C$ {record.benefits.toFixed(2)}</td>
                      <td style={styles.td}>C$ {record.subsidy.toFixed(2)}</td>
                      <td style={{ ...styles.td, color: colors.danger }}>C$ {record.socialSecurityEmployee.toFixed(2)}</td>
                      <td style={{ ...styles.td, color: colors.amber, fontWeight: '600' }}>
                        C$ {record.loanRepayment.toFixed(2)}
                      </td>
                      <td style={{ ...styles.td, fontWeight: 'bold', color: colors.success }}>
                        C$ {record.actualSalary.toFixed(2)}
                      </td>
                      <td style={styles.td}>
                        <button
                          onClick={() => emp && printSalarySlip(record, emp)}
                          style={{
                            padding: '0.25rem 0.5rem',
                            backgroundColor: colors.blue,
                            color: colors.surface,
                            border: 'none',
                            borderRadius: '0.25rem',
                            cursor: 'pointer',
                            fontSize: '0.75rem',
                          }}
                        >
                          Imprimir
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
