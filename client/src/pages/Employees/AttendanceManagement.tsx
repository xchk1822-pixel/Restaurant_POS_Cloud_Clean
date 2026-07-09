import React, { useCallback, useEffect, useRef, useState } from 'react';
import { getLocalDateString } from '../../utils/exchangeRate';
import { smartSetDocument } from '../../services/smartSyncService';
import { useAuth } from '../../contexts/AuthContext';

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
  const { user } = useAuth();
  const getCurrentMonthAttendanceDefaultRange = useCallback((records: AttendanceRecord[] = attendanceRecords) => {
    const today = getLocalDateString();
    const monthPrefix = today.slice(0, 8);
    const monthStart = `${monthPrefix}01`;
    const firstHalfEnd = `${monthPrefix}15`;
    const secondHalfStart = `${monthPrefix}16`;
    const hasSettledFirstHalf = today >= secondHalfStart && records.some(record =>
      record.settledSalaryId &&
      record.date >= monthStart &&
      record.date <= firstHalfEnd
    );

    return {
      startDate: hasSettledFirstHalf ? secondHalfStart : monthStart,
      endDate: today
    };
  }, [attendanceRecords]);
  const attendanceDefaultRange = getCurrentMonthAttendanceDefaultRange();
  const attendanceRangeTouchedRef = useRef(false);
  const [activeTab, setActiveTab] = useState<'checkin' | 'records'>('checkin');
  const [selectedDate, setSelectedDate] = useState(getLocalDateString());
  const [printStartDate, setPrintStartDate] = useState(attendanceDefaultRange.startDate);
  const [printEndDate, setPrintEndDate] = useState(getLocalDateString());
  const [repairForm, setRepairForm] = useState({
    employeeId: '',
    date: getLocalDateString(),
    checkIn: '',
    checkOut: '',
    status: 'normal' as AttendanceRecord['status'],
    notes: ''
  });
  const canRepairAttendance = user?.role === 'store_manager' || user?.role === 'super_admin';
  const attendanceActionLocksRef = useRef<Set<string>>(new Set());
  const [attendanceActionKeys, setAttendanceActionKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (attendanceRangeTouchedRef.current) {
      return;
    }

    const nextRange = getCurrentMonthAttendanceDefaultRange(attendanceRecords);
    setPrintStartDate(current => current === nextRange.startDate ? current : nextRange.startDate);
    setPrintEndDate(current => current === nextRange.endDate ? current : nextRange.endDate);
  }, [attendanceRecords, getCurrentMonthAttendanceDefaultRange]);

  const handlePrintStartDateChange = (value: string) => {
    attendanceRangeTouchedRef.current = true;
    setPrintStartDate(value);
  };

  const handlePrintEndDateChange = (value: string) => {
    attendanceRangeTouchedRef.current = true;
    setPrintEndDate(value);
  };

  const lockAttendanceAction = (key: string) => {
    if (attendanceActionLocksRef.current.has(key)) {
      return false;
    }
    attendanceActionLocksRef.current.add(key);
    setAttendanceActionKeys(prev => {
      const next = new Set(prev);
      next.add(key);
      return next;
    });
    return true;
  };

  const unlockAttendanceAction = (key: string) => {
    attendanceActionLocksRef.current.delete(key);
    setAttendanceActionKeys(prev => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  };

  const isAttendanceActionPending = (key: string) => attendanceActionKeys.has(key);

  const handleCheckIn = async (employeeId: string, type: 'in' | 'out') => {
    const now = new Date();
    const attendanceDate = selectedDate || getLocalDateString(now);
    const timeStr = now.toTimeString().slice(0, 5);

    const existingRecord = attendanceRecords.find(
      r => r.employeeId === employeeId && r.date === attendanceDate
    );

    let updatedRecords;
    let recordToSave: AttendanceRecord;
    if (existingRecord) {
      if (type === 'in' && existingRecord.checkIn) {
        alert('Entrada ya marcada');
        return;
      }

      if (type === 'out') {
        if (!existingRecord.checkIn) {
          alert('Primero marque entrada');
          return;
        }
        if (existingRecord.checkOut) {
          alert('Salida ya marcada');
          return;
        }
        recordToSave = {
          ...existingRecord,
          checkOut: timeStr,
          workHours: calculateWorkHours(existingRecord.checkIn, timeStr),
          status: 'normal' as const
        };
      } else {
        recordToSave = {
          ...existingRecord,
          checkIn: type === 'in' ? timeStr : existingRecord.checkIn,
          workHours: existingRecord.checkOut ? calculateWorkHours(timeStr, existingRecord.checkOut) : existingRecord.workHours,
          status: 'normal' as const
        };
      }
      updatedRecords = attendanceRecords.map(r =>
        r.id === existingRecord.id ? recordToSave : r
      );
    } else {
      if (type === 'out') {
        alert('Primero marque entrada');
        return;
      }
      recordToSave = {
        id: `${employeeId}-${attendanceDate}`,
        employeeId,
        date: attendanceDate,
        checkIn: timeStr,
        workHours: 0,
        status: 'normal',
      };
      updatedRecords = [...attendanceRecords, recordToSave];
    }

    const actionKey = `${employeeId}-${attendanceDate}-${type}`;
    if (!lockAttendanceAction(actionKey)) {
      return;
    }

    try {
      await smartSetDocument('attendance_records', recordToSave.id, recordToSave);
      setAttendanceRecords(updatedRecords);
    } catch (error) {
      console.error('Guardar asistencia fallo:', error);
      alert('Guardar asistencia fallo, revise la red e intente otra vez');
    } finally {
      unlockAttendanceAction(actionKey);
    }
  };

  const calculateWorkHours = (checkIn?: string, checkOut?: string): number => {
    if (!checkIn || !checkOut) return 0;
    const [inH, inM] = checkIn.split(':').map(Number);
    const [outH, outM] = checkOut.split(':').map(Number);
    return (outH * 60 + outM - inH * 60 - inM) / 60;
  };

  const openRepairAttendance = (employeeId: string) => {
    if (!canRepairAttendance) {
      alert('Solo gerente puede corregir asistencia');
      return;
    }

    const existingRecord = attendanceRecords.find(
      r => r.employeeId === employeeId && r.date === selectedDate
    );

    setRepairForm({
      employeeId,
      date: existingRecord?.date || selectedDate,
      checkIn: existingRecord?.checkIn || '',
      checkOut: existingRecord?.checkOut || '',
      status: existingRecord?.status || 'normal',
      notes: existingRecord?.notes || ''
    });
  };

  const saveAttendanceRepair = async () => {
    if (!canRepairAttendance) {
      alert('Solo gerente puede corregir asistencia');
      return;
    }

    if (!repairForm.employeeId || !repairForm.date) {
      alert('Seleccione empleado y fecha');
      return;
    }

    const recordToSave: AttendanceRecord = {
      id: `${repairForm.employeeId}-${repairForm.date}`,
      employeeId: repairForm.employeeId,
      date: repairForm.date,
      checkIn: repairForm.checkIn || undefined,
      checkOut: repairForm.checkOut || undefined,
      workHours: calculateWorkHours(repairForm.checkIn, repairForm.checkOut),
      status: repairForm.status,
      notes: repairForm.notes || undefined
    };

    const recordExists = attendanceRecords.some(record => record.id === recordToSave.id);
    const updatedRecords = recordExists
      ? attendanceRecords.map(record => record.id === recordToSave.id ? recordToSave : record)
      : [...attendanceRecords, recordToSave];

    try {
      await smartSetDocument('attendance_records', recordToSave.id, recordToSave);
      setAttendanceRecords(updatedRecords);
      setRepairForm({
        employeeId: '',
        date: getLocalDateString(),
        checkIn: '',
        checkOut: '',
        status: 'normal',
        notes: ''
      });
    } catch (error) {
      console.error('Guardar correccion de asistencia fallo:', error);
      alert('Guardar correccion fallo, revise la red e intente otra vez');
    }
  };

  const handleQuickMark = async (employeeId: string, status: 'rest' | 'absent') => {
    const today = selectedDate;
    const actionKey = `${employeeId}-${today}-${status}`;
    if (!lockAttendanceAction(actionKey)) {
      return;
    }
    
    const existingRecord = attendanceRecords.find(
      r => r.employeeId === employeeId && r.date === today
    );

    let updatedRecords;
    let recordToSave: AttendanceRecord;
    if (existingRecord) {
      recordToSave = {
        ...existingRecord,
        status,
        workHours: status === 'rest' ? 0 : existingRecord.workHours
      };
      updatedRecords = attendanceRecords.map(r =>
        r.id === existingRecord.id ? recordToSave : r
      );
    } else {
      recordToSave = {
        id: `${employeeId}-${today}`,
        employeeId,
        date: today,
        checkIn: undefined,
        checkOut: undefined,
        workHours: 0,
        status,
      };
      updatedRecords = [...attendanceRecords, recordToSave];
    }

    try {
      await smartSetDocument('attendance_records', recordToSave.id, recordToSave);
      setAttendanceRecords(updatedRecords);
    } catch (error) {
      console.error('Guardar asistencia fallo:', error);
      alert('Guardar asistencia fallo, revise la red e intente otra vez');
    } finally {
      unlockAttendanceAction(actionKey);
    }
  };

  // 鎵撳嵃鍗曚釜鍛樺伐鐨勮€冨嫟璁板綍锛堢敤浜庡彂钖‘璁わ級
  const printEmployeeAttendance = (employeeId: string) => {
    const emp = employees.find(e => e.id === employeeId);
    if (!emp) return;

    const employeeRecords = attendanceRecords
      .filter(r => r.employeeId === employeeId && r.date >= printStartDate && r.date <= printEndDate)
      .sort((a, b) => a.date.localeCompare(b.date));
    
    if (employeeRecords.length === 0) {
      alert('Este empleado no tiene registros de asistencia');
      return;
    }

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Permita las ventanas emergentes para imprimir el registro de asistencia');
      return;
    }

    const printableRecords = employeeRecords;

    // 璁＄畻缁熻淇℃伅
    const totalDays = printableRecords.length;
    const workDays = printableRecords.filter(r => r.status === 'normal').length;
    const restDays = printableRecords.filter(r => r.status === 'rest').length;
    const absentDays = printableRecords.filter(r => r.status === 'absent').length;
    const leaveDays = printableRecords.filter(r => r.status === 'leave').length;
    const totalWorkHours = printableRecords.reduce((sum, r) => sum + r.workHours, 0);

    const content = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Registro de asistencia - ${emp.name}</title>
        <style>
          @page { size: A4 portrait; margin: 9mm; }
          * { box-sizing: border-box; }
          body { font-family: Arial, "Microsoft YaHei", sans-serif; width: 192mm; margin: 0 auto; padding: 0; color: #111827; }
          .print-sheet { min-height: 279mm; display: flex; flex-direction: column; }
          .header { text-align: center; border-bottom: 1.5px solid #111827; padding-bottom: 5px; margin-bottom: 8px; }
          .title { font-size: 20px; font-weight: bold; margin-bottom: 2px; }
          .subtitle { font-size: 12px; color: #4b5563; }
          .info-section { margin-bottom: 8px; background: #f9fafb; padding: 8px 10px; border: 1px solid #e5e7eb; border-radius: 6px; }
          .info-row { display: grid; grid-template-columns: 72px 1fr 72px 1fr; gap: 4px 8px; margin-bottom: 4px; font-size: 11px; align-items: center; }
          .info-row:last-child { margin-bottom: 0; }
          .info-label { font-weight: bold; color: #4b5563; }
          .info-value { color: #333; }
          .stats { display: grid; grid-template-columns: repeat(6, 1fr); gap: 5px; margin-bottom: 8px; }
          .stat-box { background: #f3f4f6; padding: 6px 4px; border-radius: 5px; text-align: center; border: 1px solid #e5e7eb; }
          .stat-label { font-size: 9px; color: #6b7280; margin-bottom: 2px; }
          .stat-value { font-size: 14px; font-weight: bold; color: #1f2937; line-height: 1.1; }
          .section-title { margin: 5px 0 5px; font-size: 12px; font-weight: 700; color: #111827; display: flex; justify-content: space-between; }
          .range-note { font-size: 10px; font-weight: 400; color: #6b7280; }
          table { width: 100%; border-collapse: collapse; font-size: 10.5px; table-layout: fixed; }
          th, td { padding: 4px 5px; text-align: left; border: 1px solid #e5e7eb; line-height: 1.2; height: 21px; }
          th { background-color: #f3f4f6; font-weight: bold; color: #374151; }
          th:nth-child(1), td:nth-child(1) { width: 26%; }
          th:nth-child(2), td:nth-child(2),
          th:nth-child(3), td:nth-child(3) { width: 18%; }
          th:nth-child(4), td:nth-child(4) { width: 18%; }
          th:nth-child(5), td:nth-child(5) { width: 20%; }
          .status-normal { color: #10b981; font-weight: 600; }
          .status-late { color: #f59e0b; font-weight: 600; }
          .status-absent { color: #ef4444; font-weight: 600; }
          .status-rest { color: #8b5cf6; font-weight: 600; }
          .status-leave { color: #6b7280; font-weight: 600; }
          .signature { margin-top: auto; padding-top: 12px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; font-size: 11px; }
          .signature-item { text-align: center; }
          .signature-line { border-top: 1px solid #333; width: 100%; margin-top: 22px; padding-top: 3px; min-height: 16px; }
          .notice { margin-top: 8px; padding: 6px 8px; background: #fef3c7; border-left: 3px solid #f59e0b; font-size: 10px; color: #92400e; line-height: 1.35; }
          @media print {
            html, body { width: 192mm; height: 279mm; }
            body { padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .print-sheet { page-break-after: always; overflow: hidden; }
          }
        </style>
      </head>
      <body>
        <div class="print-sheet">
          <div class="header">
            <div class="title">Registro de Asistencia</div>
            <div class="subtitle">${emp.name} - ${emp.position}</div>
          </div>

          <div class="info-section">
            <div class="info-row">
              <span class="info-label">Empleado:</span>
              <span class="info-value">${emp.name}</span>
              <span class="info-label">Puesto:</span>
              <span class="info-value">${emp.position}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Area:</span>
              <span class="info-value">${emp.department || '-'}</span>
              <span class="info-label">Salario dia:</span>
              <span class="info-value">C$ ${emp.dailyRate.toFixed(2)}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Periodo:</span>
              <span class="info-value">${printableRecords[0].date} a ${printableRecords[printableRecords.length - 1].date}</span>
              <span class="info-label">Rango:</span>
              <span class="info-value">Ultimos ${printableRecords.length} dias / Total ${employeeRecords.length}</span>
            </div>
          </div>

          <div class="stats">
            <div class="stat-box">
              <div class="stat-label">Dias</div>
              <div class="stat-value">${totalDays}</div>
            </div>
            <div class="stat-box">
              <div class="stat-label">Trabajo</div>
              <div class="stat-value" style="color: #10b981;">${workDays}</div>
            </div>
            <div class="stat-box">
              <div class="stat-label">Descanso</div>
              <div class="stat-value" style="color: #8b5cf6;">${restDays}</div>
            </div>
            <div class="stat-box">
              <div class="stat-label">Ausente</div>
              <div class="stat-value" style="color: #ef4444;">${absentDays}</div>
            </div>
            <div class="stat-box">
              <div class="stat-label">Permiso</div>
              <div class="stat-value" style="color: #6b7280;">${leaveDays}</div>
            </div>
            <div class="stat-box">
              <div class="stat-label">Horas</div>
              <div class="stat-value" style="color: #3b82f6;">${totalWorkHours.toFixed(1)}h</div>
            </div>
          </div>

          <div class="section-title">
            <span>Detalle de Asistencia</span>
            <span class="range-note">Una hoja A4 imprime maximo 15 dias</span>
          </div>
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Entrada</th>
                <th>Salida</th>
                <th>Horas</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              ${printableRecords.map(record => {
                const statusText = {
                  normal: 'Normal',
                  late: 'Tarde',
                  early_leave: 'Salida temprano',
                  absent: 'Ausente',
                  leave: 'Permiso',
                  rest: 'Descanso',
                  empty: 'Sin marcar'
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
              <div>Firma del empleado</div>
              <div class="signature-line"></div>
            </div>
            <div class="signature-item">
              <div>Revision del supervisor</div>
              <div class="signature-line"></div>
            </div>
            <div class="signature-item">
              <div>Fecha de impresion</div>
              <div class="signature-line">${new Date().toLocaleDateString('es-NI')}</div>
            </div>
          </div>

          <div class="notice">
            Revise cuidadosamente este registro de asistencia. Cualquier diferencia debe reportarse dentro de 3 dias. La firma confirma que el registro se usara como base para el calculo de salario.
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
      {/* Tab鍒囨崲 */}
      <div style={styles.tabs}>
        <button
          onClick={() => setActiveTab('checkin')}
          style={styles.tab(activeTab === 'checkin')}
        >
          Marcar asistencia
        </button>
        <button
          onClick={() => setActiveTab('records')}
          style={styles.tab(activeTab === 'records')}
        >
          Registro
        </button>
      </div>

      {/* 蹇€熸墦鍗?*/}
      {activeTab === 'checkin' && (
        <div style={styles.card}>
          <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: '700', margin: 0 }}>Marcar asistencia</h2>
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
              const checkInPending = isAttendanceActionPending(`${emp.id}-${selectedDate}-in`);
              const checkOutPending = isAttendanceActionPending(`${emp.id}-${selectedDate}-out`);
              const restPending = isAttendanceActionPending(`${emp.id}-${selectedDate}-rest`);
              const absentPending = isAttendanceActionPending(`${emp.id}-${selectedDate}-absent`);
              const quickMarkLocked = Boolean(todayRecord) || restPending || absentPending;
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
                    {/* 鎵撳崱鎸夐挳 */}
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        onClick={() => handleCheckIn(emp.id, 'in')}
                        disabled={!!todayRecord?.checkIn || checkInPending}
                        style={{
                          flex: 1,
                          padding: '0.5rem',
                          background: todayRecord?.checkIn || checkInPending ? '#9ca3af' : '#3b82f6',
                          color: 'white',
                          border: 'none',
                          borderRadius: '0.5rem',
                          cursor: todayRecord?.checkIn || checkInPending ? 'not-allowed' : 'pointer',
                          fontWeight: '600',
                          fontSize: '0.75rem',
                        }}
                      >
                        {todayRecord?.checkIn ? 'Entrada marcada' : 'Marcar entrada'}
                      </button>
                      <button
                        onClick={() => handleCheckIn(emp.id, 'out')}
                        disabled={!todayRecord?.checkIn || !!todayRecord?.checkOut || checkOutPending}
                        style={{
                          flex: 1,
                          padding: '0.5rem',
                          background: !todayRecord?.checkIn || checkOutPending ? '#9ca3af' : todayRecord?.checkOut ? '#10b981' : '#f59e0b',
                          color: 'white',
                          border: 'none',
                          borderRadius: '0.5rem',
                          cursor: (!todayRecord?.checkIn || todayRecord?.checkOut || checkOutPending) ? 'not-allowed' : 'pointer',
                          fontWeight: '600',
                          fontSize: '0.75rem',
                        }}
                      >
                        {todayRecord?.checkOut ? 'Salida marcada' : 'Marcar salida'}
                      </button>
                    </div>
                    
                    {/* 蹇嵎鏍囪鎸夐挳 */}
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        onClick={() => handleQuickMark(emp.id, 'rest')}
                        disabled={quickMarkLocked}
                        style={{
                          flex: 1,
                          padding: '0.4rem',
                          background: todayRecord?.status === 'rest' || restPending ? '#8b5cf6' : '#e5e7eb',
                          color: todayRecord?.status === 'rest' || restPending ? 'white' : '#374151',
                          border: 'none',
                          borderRadius: '0.375rem',
                          cursor: quickMarkLocked ? 'not-allowed' : 'pointer',
                          fontWeight: '600',
                          fontSize: '0.7rem',
                        }}
                      >
                        Descanso
                      </button>
                      <button
                        onClick={() => handleQuickMark(emp.id, 'absent')}
                        disabled={quickMarkLocked}
                        style={{
                          flex: 1,
                          padding: '0.4rem',
                          background: todayRecord?.status === 'absent' || absentPending ? '#ef4444' : '#e5e7eb',
                          color: todayRecord?.status === 'absent' || absentPending ? 'white' : '#374151',
                          border: 'none',
                          borderRadius: '0.375rem',
                          cursor: quickMarkLocked ? 'not-allowed' : 'pointer',
                          fontWeight: '600',
                          fontSize: '0.7rem',
                        }}
                      >
                        Ausente
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 鑰冨嫟璁板綍 - 鎸夊憳宸ユ樉绀猴紝姣忎汉鍙墦鍗?*/}
      {activeTab === 'records' && (
        <div style={styles.card}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: '700', marginBottom: '1.5rem' }}>Registro de asistencia</h2>

          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap' }}>
            <input
              type="date"
              value={printStartDate}
              onChange={(e) => handlePrintStartDateChange(e.target.value)}
              style={{ padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', fontSize: '0.875rem' }}
            />
            <span style={{ color: '#6b7280', fontSize: '0.875rem' }}>a</span>
            <input
              type="date"
              value={printEndDate}
              onChange={(e) => handlePrintEndDateChange(e.target.value)}
              style={{ padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', fontSize: '0.875rem' }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
            {employees.filter(e => e.status === 'active').map((emp) => {
              const empRecords = attendanceRecords.filter(r => r.employeeId === emp.id && r.date >= printStartDate && r.date <= printEndDate);
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
                      <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>Dias</div>
                      <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#1f2937' }}>{totalDays}</div>
                    </div>
                    <div style={{ textAlign: 'center', padding: '0.5rem', background: 'white', borderRadius: '0.5rem' }}>
                      <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>Trabajo</div>
                      <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#10b981' }}>{workDays}</div>
                    </div>
                    <div style={{ textAlign: 'center', padding: '0.5rem', background: 'white', borderRadius: '0.5rem' }}>
                      <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>Descanso</div>
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
                    Imprimir asistencia
                  </button>
                  
                  {canRepairAttendance && (
                    <button
                      onClick={() => openRepairAttendance(emp.id)}
                      style={{
                        width: '100%',
                        padding: '0.7rem',
                        marginTop: '0.5rem',
                        background: '#f59e0b',
                        color: 'white',
                        border: 'none',
                        borderRadius: '0.5rem',
                        cursor: 'pointer',
                        fontWeight: '600',
                        fontSize: '0.875rem',
                      }}
                    >
                      Corregir hora
                    </button>
                  )}

                  {totalDays === 0 && (
                    <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: '#9ca3af', textAlign: 'center' }}>
                      Sin registros de asistencia
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {repairForm.employeeId && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(17, 24, 39, 0.45)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '1rem'
        }}>
          <div style={{
            background: 'white',
            borderRadius: '0.75rem',
            padding: '1rem',
            width: 'min(480px, 100%)',
            boxShadow: '0 20px 40px rgba(15, 23, 42, 0.25)'
          }}>
            <h3 style={{ marginTop: 0, marginBottom: '0.85rem', fontSize: '1.1rem' }}>Corregir asistencia</h3>
            <div style={{ display: 'grid', gap: '0.75rem' }}>
              <label style={{ display: 'grid', gap: '0.25rem', fontSize: '0.85rem', fontWeight: 600 }}>
                Fecha
                <input
                  type="date"
                  value={repairForm.date}
                  onChange={(e) => setRepairForm({ ...repairForm, date: e.target.value })}
                  style={{ padding: '0.55rem', border: '1px solid #d1d5db', borderRadius: '0.375rem' }}
                />
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <label style={{ display: 'grid', gap: '0.25rem', fontSize: '0.85rem', fontWeight: 600 }}>
                  Entrada
                  <input
                    type="time"
                    value={repairForm.checkIn}
                    onChange={(e) => setRepairForm({ ...repairForm, checkIn: e.target.value })}
                    style={{ padding: '0.55rem', border: '1px solid #d1d5db', borderRadius: '0.375rem' }}
                  />
                </label>
                <label style={{ display: 'grid', gap: '0.25rem', fontSize: '0.85rem', fontWeight: 600 }}>
                  Salida
                  <input
                    type="time"
                    value={repairForm.checkOut}
                    onChange={(e) => setRepairForm({ ...repairForm, checkOut: e.target.value })}
                    style={{ padding: '0.55rem', border: '1px solid #d1d5db', borderRadius: '0.375rem' }}
                  />
                </label>
              </div>
              <label style={{ display: 'grid', gap: '0.25rem', fontSize: '0.85rem', fontWeight: 600 }}>
                Estado
                <select
                  value={repairForm.status}
                  onChange={(e) => setRepairForm({ ...repairForm, status: e.target.value as AttendanceRecord['status'] })}
                  style={{ padding: '0.55rem', border: '1px solid #d1d5db', borderRadius: '0.375rem' }}
                >
                  <option value="normal">Normal</option>
                  <option value="rest">Descanso</option>
                  <option value="absent">Ausente</option>
                  <option value="leave">Permiso</option>
                  <option value="late">Tarde</option>
                  <option value="early_leave">Salida temprano</option>
                </select>
              </label>
              <label style={{ display: 'grid', gap: '0.25rem', fontSize: '0.85rem', fontWeight: 600 }}>
                Nota
                <input
                  value={repairForm.notes}
                  onChange={(e) => setRepairForm({ ...repairForm, notes: e.target.value })}
                  placeholder="Motivo de correccion"
                  style={{ padding: '0.55rem', border: '1px solid #d1d5db', borderRadius: '0.375rem' }}
                />
              </label>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
              <button
                onClick={() => setRepairForm({ employeeId: '', date: getLocalDateString(), checkIn: '', checkOut: '', status: 'normal', notes: '' })}
                style={{ padding: '0.6rem 1rem', border: '1px solid #d1d5db', borderRadius: '0.5rem', background: 'white', cursor: 'pointer' }}
              >
                Cancelar
              </button>
              <button
                onClick={saveAttendanceRepair}
                style={{ padding: '0.6rem 1rem', border: 'none', borderRadius: '0.5rem', background: '#10b981', color: 'white', fontWeight: 700, cursor: 'pointer' }}
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AttendanceManagement;
