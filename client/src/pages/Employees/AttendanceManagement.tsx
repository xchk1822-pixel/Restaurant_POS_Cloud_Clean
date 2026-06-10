import React, { useState } from 'react';
import { getLocalDateString } from '../../utils/exchangeRate';
import { smartAddDocument, smartUpdateDocument } from '../../services/smartSyncService';

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

interface AttendanceManagementProps {
  employees: Employee[];
  attendanceRecords: AttendanceRecord[];
  setAttendanceRecords: React.Dispatch<React.SetStateAction<AttendanceRecord[]>>;
}

const AttendanceManagement: React.FC<AttendanceManagementProps> = ({
  employees,
  attendanceRecords,
  setAttendanceRecords,
}) => {
  const [activeTab, setActiveTab] = useState<'checkin' | 'records'>('checkin');
  const [selectedDate, setSelectedDate] = useState(getLocalDateString());



  const handleCheckIn = (employeeId: string, type: 'in' | 'out') => {
    const now = new Date();
    const today = getLocalDateString(now); // ✅ 使用本地日期
    const timeStr = now.toTimeString().slice(0, 5);

    const existingRecord = attendanceRecords.find(
      r => r.employeeId === employeeId && r.date === today
    );

    let updatedRecords;
    if (existingRecord) {
      if (type === 'out') {
        updatedRecords = attendanceRecords.map(r =>
          r.id === existingRecord.id
            ? { ...r, checkOut: timeStr, workHours: calculateWorkHours(existingRecord.checkIn, timeStr), status: 'normal' as const }
            : r
        );
      } else {
        alert('已经打过上班卡了！');
        return;
      }
    } else {
      const newRecord: AttendanceRecord = {
        id: Date.now().toString(),
        employeeId,
        date: today,
        checkIn: timeStr,
        workHours: 0,
        status: 'normal',
      };
      updatedRecords = [...attendanceRecords, newRecord];
    }

    setAttendanceRecords(updatedRecords);
    // 🔥 同步到 Firestore
    if (existingRecord) {
      smartUpdateDocument('attendance_records', existingRecord.id, updatedRecords.find(r => r.id === existingRecord.id)!);
    } else {
      smartAddDocument('attendance_records', updatedRecords[updatedRecords.length - 1]);
    }
  };

  const calculateWorkHours = (checkIn?: string, checkOut?: string): number => {
    if (!checkIn || !checkOut) return 0;
    const [inH, inM] = checkIn.split(':').map(Number);
    const [outH, outM] = checkOut.split(':').map(Number);
    return (outH * 60 + outM - inH * 60 - inM) / 60;
  };

  // 快速标记考勤状态
  const handleQuickMark = (employeeId: string, status: 'rest' | 'absent') => {
    const today = selectedDate;
    
    const existingRecord = attendanceRecords.find(
      r => r.employeeId === employeeId && r.date === today
    );

    let updatedRecords;
    if (existingRecord) {
      updatedRecords = attendanceRecords.map(r =>
        r.id === existingRecord.id
          ? { ...r, status, workHours: status === 'rest' ? 0 : r.workHours }
          : r
      );
    } else {
      const newRecord: AttendanceRecord = {
        id: Date.now().toString(),
        employeeId,
        date: today,
        checkIn: undefined,
        checkOut: undefined,
        workHours: 0,
        status,
      };
      updatedRecords = [...attendanceRecords, newRecord];
    }

    setAttendanceRecords(updatedRecords);
    // 🔥 同步到 Firestore
    if (existingRecord) {
      smartUpdateDocument('attendance_records', existingRecord.id, updatedRecords.find(r => r.id === existingRecord.id)!);
    } else {
      smartAddDocument('attendance_records', updatedRecords[updatedRecords.length - 1]);
    }
  };

  // 打印单个员工的考勤记录（用于发薪确认）
  const printEmployeeAttendance = (employeeId: string) => {
    const emp = employees.find(e => e.id === employeeId);
    if (!emp) return;

    const employeeRecords = attendanceRecords
      .filter(r => r.employeeId === employeeId)
      .sort((a, b) => a.date.localeCompare(b.date));
    
    if (employeeRecords.length === 0) {
      alert('该员工暂无考勤记录');
      return;
    }

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('请允许弹出窗口以打印考勤记录');
      return;
    }

    // 计算统计信息
    const totalDays = employeeRecords.length;
    const workDays = employeeRecords.filter(r => r.status === 'normal').length;
    const restDays = employeeRecords.filter(r => r.status === 'rest').length;
    const absentDays = employeeRecords.filter(r => r.status === 'absent').length;
    const leaveDays = employeeRecords.filter(r => r.status === 'leave').length;
    const totalWorkHours = employeeRecords.reduce((sum, r) => sum + r.workHours, 0);

    const content = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>考勤记录 - ${emp.name}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; max-width: 800px; margin: 0 auto; }
          .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 20px; }
          .title { font-size: 24px; font-weight: bold; margin-bottom: 5px; }
          .subtitle { font-size: 14px; color: #666; }
          .info-section { margin-bottom: 20px; background: #f9fafb; padding: 15px; border-radius: 8px; }
          .info-row { display: flex; justify-content: space-between; margin-bottom: 8px; }
          .info-label { font-weight: bold; color: #666; }
          .info-value { color: #333; }
          .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 20px; }
          .stat-box { background: #f3f4f6; padding: 10px; border-radius: 6px; text-align: center; }
          .stat-label { font-size: 12px; color: #6b7280; margin-bottom: 5px; }
          .stat-value { font-size: 20px; font-weight: bold; color: #1f2937; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 12px; }
          th, td { padding: 8px; text-align: left; border-bottom: 1px solid #ddd; }
          th { background-color: #f5f5f5; font-weight: bold; position: sticky; top: 0; }
          .status-normal { color: #10b981; font-weight: 600; }
          .status-late { color: #f59e0b; font-weight: 600; }
          .status-absent { color: #ef4444; font-weight: 600; }
          .status-rest { color: #8b5cf6; font-weight: 600; }
          .status-leave { color: #6b7280; font-weight: 600; }
          .signature { margin-top: 40px; display: flex; justify-content: space-between; }
          .signature-item { text-align: center; }
          .signature-line { border-top: 1px solid #333; width: 150px; margin-top: 30px; }
          @media print { body { padding: 0; } }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="title">员工考勤记录</div>
          <div class="subtitle">${emp.name} - ${emp.position}</div>
        </div>

        <div class="info-section">
          <div class="info-row">
            <span class="info-label">员工姓名：</span>
            <span class="info-value">${emp.name}</span>
            <span class="info-label">职位：</span>
            <span class="info-value">${emp.position}</span>
          </div>
          <div class="info-row">
            <span class="info-label">部门：</span>
            <span class="info-value">${emp.department || '-'}</span>
            <span class="info-label">日薪：</span>
            <span class="info-value">C$ ${emp.dailyRate.toFixed(2)}</span>
          </div>
          <div class="info-row">
            <span class="info-label">记录期间：</span>
            <span class="info-value">${employeeRecords[0].date} 至 ${employeeRecords[employeeRecords.length - 1].date}</span>
          </div>
        </div>

        <div class="stats">
          <div class="stat-box">
            <div class="stat-label">总天数</div>
            <div class="stat-value">${totalDays}</div>
          </div>
          <div class="stat-box">
            <div class="stat-label">上班天数</div>
            <div class="stat-value" style="color: #10b981;">${workDays}</div>
          </div>
          <div class="stat-box">
            <div class="stat-label">休息天数</div>
            <div class="stat-value" style="color: #8b5cf6;">${restDays}</div>
          </div>
          <div class="stat-box">
            <div class="stat-label">缺勤天数</div>
            <div class="stat-value" style="color: #ef4444;">${absentDays}</div>
          </div>
          <div class="stat-box">
            <div class="stat-label">请假天数</div>
            <div class="stat-value" style="color: #6b7280;">${leaveDays}</div>
          </div>
          <div class="stat-box">
            <div class="stat-label">总工时</div>
            <div class="stat-value" style="color: #3b82f6;">${totalWorkHours.toFixed(1)}h</div>
          </div>
        </div>

        <h3 style="margin-top: 30px; margin-bottom: 15px;">📋 详细考勤记录</h3>
        <table>
          <thead>
            <tr>
              <th>日期</th>
              <th>上班打卡</th>
              <th>下班打卡</th>
              <th>工作时长</th>
              <th>状态</th>
            </tr>
          </thead>
          <tbody>
            ${employeeRecords.map(record => {
              const statusText = {
                normal: '正常',
                late: '迟到',
                early_leave: '早退',
                absent: '缺勤',
                leave: '请假',
                rest: '休息',
                empty: '未打卡'
              }[record.status];
              
              const statusClass = {
                normal: 'status-normal',
                late: 'status-late',
                early_leave: 'status-late',
                absent: 'status-absent',
                rest: 'status-rest',
                leave: 'status-leave',
                empty: ''
              }[record.status] || '';

              return `
                <tr>
                  <td>${record.date}</td>
                  <td>${record.checkIn || '-'}</td>
                  <td>${record.checkOut || '-'}</td>
                  <td>${record.workHours > 0 ? record.workHours.toFixed(1) + 'h' : '-'}</td>
                  <td class="${statusClass}">${statusText}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>

        <div class="signature">
          <div class="signature-item">
            <div>员工签字确认</div>
            <div class="signature-line"></div>
          </div>
          <div class="signature-item">
            <div>主管审核</div>
            <div class="signature-line"></div>
          </div>
          <div class="signature-item">
            <div>打印日期</div>
            <div class="signature-line">${new Date().toLocaleDateString('zh-CN')}</div>
          </div>
        </div>

        <div style="margin-top: 20px; padding: 10px; background: #fef3c7; border-left: 4px solid #f59e0b; font-size: 12px; color: #92400e;">
          ⚠️ 请仔细核对以上考勤记录，如有异议请在3日内提出。签字确认后作为薪资结算依据。
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
    container: {
      display: 'flex',
      flexDirection: 'column' as const,
      height: '100%',
    },
    tabs: {
      display: 'flex',
      gap: '0.5rem',
      marginBottom: '1rem',
    },
    tab: (active: boolean) => ({
      flex: 1,
      padding: '0.75rem',
      background: active ? '#3b82f6' : 'white',
      color: active ? 'white' : '#6b7280',
      border: 'none',
      borderRadius: '0.5rem',
      cursor: 'pointer',
      fontWeight: '600',
      fontSize: '0.875rem',
      transition: 'all 0.2s',
    }),
    card: {
      background: 'white',
      borderRadius: '1rem',
      padding: '1.5rem',
      boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
      flex: 1,
      overflowY: 'auto' as const,
    },
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
      position: 'sticky' as const,
      top: 0,
    },
    td: {
      padding: '1rem',
      borderBottom: '1px solid #f3f4f6',
    },
    badge: (color: string) => ({
      display: 'inline-block',
      padding: '0.25rem 0.75rem',
      borderRadius: '9999px',
      fontSize: '0.75rem',
      fontWeight: '600',
      background: color + '20',
      color: color,
    }),
  };

  return (
    <div style={styles.container}>
      {/* Tab切换 */}
      <div style={styles.tabs}>
        <button
          onClick={() => setActiveTab('checkin')}
          style={styles.tab(activeTab === 'checkin')}
        >
          ⏰ 快速打卡
        </button>
        <button
          onClick={() => setActiveTab('records')}
          style={styles.tab(activeTab === 'records')}
        >
          📋 考勤记录
        </button>
      </div>

      {/* 快速打卡 */}
      {activeTab === 'checkin' && (
        <div style={styles.card}>
          <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: '700', margin: 0 }}>⏰ 快速打卡</h2>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              style={{
                padding: '0.5rem',
                border: '1px solid #d1d5db',
                borderRadius: '0.375rem',
                fontSize: '0.875rem',
              }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
            {employees.filter(e => e.status === 'active').map((emp) => {
              const todayRecord = attendanceRecords.find(
                r => r.employeeId === emp.id && r.date === selectedDate
              );
              return (
                <div key={emp.id} style={{
                  padding: '1rem',
                  background: '#f9fafb',
                  borderRadius: '0.75rem',
                  border: '2px solid #e5e7eb',
                }}>
                  <div style={{ fontWeight: '600', marginBottom: '0.5rem' }}>{emp.name}</div>
                  <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.75rem' }}>
                    {emp.position}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {/* 打卡按钮 */}
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        onClick={() => handleCheckIn(emp.id, 'in')}
                        disabled={!!todayRecord?.checkIn}
                        style={{
                          flex: 1,
                          padding: '0.5rem',
                          background: todayRecord?.checkIn ? '#9ca3af' : '#3b82f6',
                          color: 'white',
                          border: 'none',
                          borderRadius: '0.5rem',
                          cursor: todayRecord?.checkIn ? 'not-allowed' : 'pointer',
                          fontWeight: '600',
                          fontSize: '0.75rem',
                        }}
                      >
                        {todayRecord?.checkIn ? '✅ 已上班' : '上班打卡'}
                      </button>
                      <button
                        onClick={() => handleCheckIn(emp.id, 'out')}
                        disabled={!todayRecord?.checkIn || !!todayRecord?.checkOut}
                        style={{
                          flex: 1,
                          padding: '0.5rem',
                          background: !todayRecord?.checkIn ? '#9ca3af' : todayRecord?.checkOut ? '#10b981' : '#f59e0b',
                          color: 'white',
                          border: 'none',
                          borderRadius: '0.5rem',
                          cursor: (!todayRecord?.checkIn || todayRecord?.checkOut) ? 'not-allowed' : 'pointer',
                          fontWeight: '600',
                          fontSize: '0.75rem',
                        }}
                      >
                        {todayRecord?.checkOut ? '✅ 已下班' : '下班打卡'}
                      </button>
                    </div>
                    
                    {/* 快捷标记按钮 */}
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        onClick={() => handleQuickMark(emp.id, 'rest')}
                        disabled={!!todayRecord?.checkIn}
                        style={{
                          flex: 1,
                          padding: '0.4rem',
                          background: todayRecord?.status === 'rest' ? '#8b5cf6' : '#e5e7eb',
                          color: todayRecord?.status === 'rest' ? 'white' : '#374151',
                          border: 'none',
                          borderRadius: '0.375rem',
                          cursor: todayRecord?.checkIn ? 'not-allowed' : 'pointer',
                          fontWeight: '600',
                          fontSize: '0.7rem',
                        }}
                      >
                        😴 休息
                      </button>
                      <button
                        onClick={() => handleQuickMark(emp.id, 'absent')}
                        disabled={!!todayRecord?.checkIn}
                        style={{
                          flex: 1,
                          padding: '0.4rem',
                          background: todayRecord?.status === 'absent' ? '#ef4444' : '#e5e7eb',
                          color: todayRecord?.status === 'absent' ? 'white' : '#374151',
                          border: 'none',
                          borderRadius: '0.375rem',
                          cursor: todayRecord?.checkIn ? 'not-allowed' : 'pointer',
                          fontWeight: '600',
                          fontSize: '0.7rem',
                        }}
                      >
                        ❌ 缺勤
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 考勤记录 - 按员工显示，每人可打印 */}
      {activeTab === 'records' && (
        <div style={styles.card}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: '700', marginBottom: '1.5rem' }}>📋 考勤记录</h2>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
            {employees.filter(e => e.status === 'active').map((emp) => {
              const empRecords = attendanceRecords.filter(r => r.employeeId === emp.id);
              const totalDays = empRecords.length;
              const workDays = empRecords.filter(r => r.status === 'normal').length;
              const restDays = empRecords.filter(r => r.status === 'rest').length;
              
              return (
                <div key={emp.id} style={{
                  padding: '1.5rem',
                  background: '#f9fafb',
                  borderRadius: '0.75rem',
                  border: '2px solid #e5e7eb',
                }}>
                  <div style={{ fontWeight: '600', fontSize: '1.125rem', marginBottom: '0.5rem' }}>
                    {emp.name}
                  </div>
                  <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '1rem' }}>
                    {emp.position}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', marginBottom: '1rem' }}>
                    <div style={{ textAlign: 'center', padding: '0.5rem', background: 'white', borderRadius: '0.5rem' }}>
                      <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>总天数</div>
                      <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#1f2937' }}>{totalDays}</div>
                    </div>
                    <div style={{ textAlign: 'center', padding: '0.5rem', background: 'white', borderRadius: '0.5rem' }}>
                      <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>上班</div>
                      <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#10b981' }}>{workDays}</div>
                    </div>
                    <div style={{ textAlign: 'center', padding: '0.5rem', background: 'white', borderRadius: '0.5rem' }}>
                      <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>休息</div>
                      <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#8b5cf6' }}>{restDays}</div>
                    </div>
                  </div>

                  <button
                    onClick={() => printEmployeeAttendance(emp.id)}
                    disabled={totalDays === 0}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      background: totalDays === 0 ? '#9ca3af' : '#3b82f6',
                      color: 'white',
                      border: 'none',
                      borderRadius: '0.5rem',
                      cursor: totalDays === 0 ? 'not-allowed' : 'pointer',
                      fontWeight: '600',
                      fontSize: '0.875rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.5rem',
                    }}
                  >
                    🖨️ 打印考勤记录
                  </button>
                  
                  {totalDays === 0 && (
                    <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: '#9ca3af', textAlign: 'center' }}>
                      暂无考勤记录
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default AttendanceManagement;
