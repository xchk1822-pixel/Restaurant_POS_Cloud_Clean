import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useI18n } from '../../i18n/I18nContext';
import { dataService } from '../../services/DataService';
import {
  smartGetDocumentsByDateRange,
  smartSetDocument,
} from '../../services/smartSyncService';
import { colors, font, radii, shadows } from '../../styles/uiTokens';
import { getLocalDateString } from '../../utils/localTime';
import {
  createRestScheduleId,
  getMonthRange,
  getWeekDates,
  getWeekRange,
  shiftDateKey,
} from '../../utils/employeeRestSchedule';

interface Employee {
  id: string;
  name: string;
  position: string;
  status: 'active' | 'inactive';
}

export interface EmployeeRestScheduleRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  employeePosition: string;
  weekStart: string;
  weekEnd: string;
  restDate: string;
  status: 'saved';
  updatedAt?: string;
  updatedBy?: string;
}

interface WeeklyRestScheduleProps {
  employees: Employee[];
}

const COLLECTION = 'employee_rest_schedules';

const escapeHtml = (value: unknown): string => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

const mergeCachedRecords = (records: EmployeeRestScheduleRecord[]) => {
  if (records.length === 0) return;
  const merged = new Map<string, EmployeeRestScheduleRecord>();
  [...dataService.getData(COLLECTION), ...records].forEach(record => {
    if (record?.id) merged.set(String(record.id), record);
  });
  dataService.saveData(COLLECTION, Array.from(merged.values()));
};

const WeeklyRestSchedule: React.FC<WeeklyRestScheduleProps> = ({ employees }) => {
  const { user } = useAuth();
  const { language, t } = useI18n();
  const today = getLocalDateString();
  const activeEmployees = useMemo(
    () => employees.filter(employee => employee.status === 'active'),
    [employees]
  );
  const [mode, setMode] = useState<'schedule' | 'history'>('schedule');
  const [referenceDate, setReferenceDate] = useState(today);
  const [selectedRestDates, setSelectedRestDates] = useState<Record<string, string>>({});
  const [loadedRecords, setLoadedRecords] = useState<EmployeeRestScheduleRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [historyMonth, setHistoryMonth] = useState(today.slice(0, 7));
  const [historyEmployeeId, setHistoryEmployeeId] = useState('all');
  const [historyRecords, setHistoryRecords] = useState<EmployeeRestScheduleRecord[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const weekRequestRef = useRef(0);
  const historyRequestRef = useRef(0);

  const weekRange = useMemo(() => getWeekRange(referenceDate), [referenceDate]);
  const weekDates = useMemo(() => getWeekDates(referenceDate), [referenceDate]);
  const isPastWeek = weekRange.endDate < today;
  const weekdayLabels = [
    t('restSchedule.weekday.mon'),
    t('restSchedule.weekday.tue'),
    t('restSchedule.weekday.wed'),
    t('restSchedule.weekday.thu'),
    t('restSchedule.weekday.fri'),
    t('restSchedule.weekday.sat'),
    t('restSchedule.weekday.sun'),
  ];

  const loadWeek = useCallback(async () => {
    const requestId = ++weekRequestRef.current;
    setIsLoading(true);
    try {
      const rows = await smartGetDocumentsByDateRange(
        COLLECTION,
        'weekStart',
        weekRange.startDate,
        weekRange.startDate,
        true
      ) as EmployeeRestScheduleRecord[];
      if (requestId !== weekRequestRef.current) return;
      const validRows = rows.filter(row => row.weekStart === weekRange.startDate && row.restDate);
      const nextSelection: Record<string, string> = {};
      validRows.forEach(row => {
        nextSelection[row.employeeId] = row.restDate;
      });
      setLoadedRecords(validRows);
      setSelectedRestDates(nextSelection);
      mergeCachedRecords(validRows);
    } finally {
      if (requestId === weekRequestRef.current) setIsLoading(false);
    }
  }, [weekRange.startDate]);

  useEffect(() => {
    if (mode === 'schedule') loadWeek();
  }, [loadWeek, mode]);

  const loadHistory = useCallback(async () => {
    const requestId = ++historyRequestRef.current;
    const range = getMonthRange(historyMonth);
    setIsHistoryLoading(true);
    try {
      const rows = await smartGetDocumentsByDateRange(
        COLLECTION,
        'restDate',
        range.startDate,
        range.endDate,
        true
      ) as EmployeeRestScheduleRecord[];
      if (requestId !== historyRequestRef.current) return;
      const sorted = [...rows].sort((left, right) => (
        left.restDate.localeCompare(right.restDate)
        || left.employeeName.localeCompare(right.employeeName)
      ));
      setHistoryRecords(sorted);
      mergeCachedRecords(sorted);
    } finally {
      if (requestId === historyRequestRef.current) setIsHistoryLoading(false);
    }
  }, [historyMonth]);

  useEffect(() => {
    if (mode === 'history') loadHistory();
  }, [loadHistory, mode]);

  const loadedByEmployee = useMemo(() => new Map(
    loadedRecords.map(record => [record.employeeId, record.restDate])
  ), [loadedRecords]);

  const unassignedEmployees = activeEmployees.filter(employee => !selectedRestDates[employee.id]);
  const hasChanges = activeEmployees.some(employee => (
    (loadedByEmployee.get(employee.id) || '') !== (selectedRestDates[employee.id] || '')
  ));

  const dailyCounts = weekDates.map(date => activeEmployees.filter(
    employee => selectedRestDates[employee.id] === date
  ).length);

  const handleSave = async () => {
    if (isPastWeek || isSaving) return;
    if (unassignedEmployees.length > 0) {
      alert(`${t('restSchedule.alert.incomplete')}: ${unassignedEmployees.map(employee => employee.name).join(', ')}`);
      return;
    }
    if (!window.confirm(t('restSchedule.confirmSave'))) return;

    const changedEmployees = activeEmployees.filter(employee => (
      loadedByEmployee.get(employee.id) !== selectedRestDates[employee.id]
    ));
    if (changedEmployees.length === 0) return;

    setIsSaving(true);
    try {
      const updatedAt = new Date().toISOString();
      const records = changedEmployees.map<EmployeeRestScheduleRecord>(employee => ({
        id: createRestScheduleId(weekRange.startDate, employee.id),
        employeeId: employee.id,
        employeeName: employee.name,
        employeePosition: employee.position,
        weekStart: weekRange.startDate,
        weekEnd: weekRange.endDate,
        restDate: selectedRestDates[employee.id],
        status: 'saved',
        updatedAt,
        updatedBy: user?.name || user?.username || 'system',
      }));
      const results = await Promise.all(records.map(record => (
        smartSetDocument(COLLECTION, record.id, record)
      )));
      const hardFailure = results.some(result => result?.success === false && !result?.pending);
      if (hardFailure) {
        alert(t('restSchedule.alert.saveFailed'));
        return;
      }
      const pending = results.some(result => result?.pending || result?.offline || result?.localFirst);
      const merged = new Map(loadedRecords.map(record => [record.employeeId, record]));
      records.forEach(record => merged.set(record.employeeId, record));
      const nextRecords = Array.from(merged.values());
      setLoadedRecords(nextRecords);
      mergeCachedRecords(nextRecords);
      alert(pending ? t('restSchedule.alert.savedOffline') : t('restSchedule.alert.saved'));
    } catch (error) {
      console.error('Weekly rest schedule save failed:', error);
      alert(t('restSchedule.alert.saveFailed'));
    } finally {
      setIsSaving(false);
    }
  };

  const printWeek = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert(t('restSchedule.alert.allowPopup'));
      return;
    }
    const locale = language === 'es-NI' ? 'es-NI' : 'zh-CN';
    const printedAt = new Date().toLocaleString(locale);
    const rows = activeEmployees.map(employee => {
      const restDate = selectedRestDates[employee.id];
      return `<tr>
        <td>${escapeHtml(employee.name)}</td>
        <td>${escapeHtml(employee.position || '-')}</td>
        ${weekDates.map((date, index) => `<td class="${restDate === date ? 'rest' : ''}">${restDate === date ? escapeHtml(t('restSchedule.rest')) : ''}</td>`).join('')}
      </tr>`;
    }).join('');

    printWindow.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(t('restSchedule.printTitle'))}</title>
      <style>
        @page { size: A4 landscape; margin: 10mm; }
        * { box-sizing: border-box; }
        body { font-family: Arial, "Microsoft YaHei", sans-serif; color: #111827; margin: 0; }
        h1 { text-align: center; font-size: 20px; margin: 0 0 4px; }
        .meta { text-align: center; font-size: 11px; color: #4b5563; margin-bottom: 10px; }
        table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 11px; }
        th, td { border: 1px solid #9ca3af; padding: 7px 4px; text-align: center; height: 34px; }
        th { background: #f3f4f6; font-weight: 700; }
        th:first-child, td:first-child { width: 17%; text-align: left; }
        th:nth-child(2), td:nth-child(2) { width: 12%; text-align: left; }
        .date { display: block; font-size: 9px; font-weight: 400; color: #6b7280; margin-top: 2px; }
        .rest { background: #ede9fe; color: #6d28d9; font-weight: 700; }
        tfoot td { background: #f8fafc; font-weight: 700; }
        .footer { margin-top: 12px; display: flex; justify-content: space-between; font-size: 10px; }
        .signature { width: 180px; border-top: 1px solid #374151; padding-top: 3px; text-align: center; margin-top: 20px; }
      </style></head><body>
      <h1>${escapeHtml(t('restSchedule.printTitle'))}</h1>
      <div class="meta">${escapeHtml(user?.storeName || '')} · ${weekRange.startDate} - ${weekRange.endDate}</div>
      <table><thead><tr><th>${escapeHtml(t('restSchedule.employee'))}</th><th>${escapeHtml(t('restSchedule.position'))}</th>
      ${weekDates.map((date, index) => `<th>${escapeHtml(weekdayLabels[index])}<span class="date">${date.slice(5)}</span></th>`).join('')}</tr></thead>
      <tbody>${rows || `<tr><td colspan="9">${escapeHtml(t('restSchedule.emptyEmployees'))}</td></tr>`}</tbody>
      <tfoot><tr><td colspan="2">${escapeHtml(t('restSchedule.dailyTotal'))}</td>${dailyCounts.map(count => `<td>${count}</td>`).join('')}</tr></tfoot></table>
      <div class="footer"><span>${escapeHtml(t('restSchedule.printedAt'))}: ${escapeHtml(printedAt)}</span><span class="signature">${escapeHtml(t('restSchedule.managerSignature'))}</span></div>
      </body></html>`);
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 250);
  };

  const historyEmployeeOptions = useMemo(() => {
    const options = new Map<string, string>();
    historyRecords.forEach(record => options.set(record.employeeId, record.employeeName));
    return Array.from(options.entries()).sort((left, right) => left[1].localeCompare(right[1]));
  }, [historyRecords]);
  const filteredHistory = historyRecords.filter(record => (
    historyEmployeeId === 'all' || record.employeeId === historyEmployeeId
  ));

  const buttonStyle = (active = false): React.CSSProperties => ({
    border: `1px solid ${active ? colors.blue : colors.borderStrong}`,
    borderRadius: radii.md,
    padding: '0.58rem 0.85rem',
    background: active ? colors.blueSoft : colors.surface,
    color: active ? colors.blue : colors.textPrimary,
    fontWeight: 700,
    cursor: 'pointer',
  });

  return (
    <section style={{ height: '100%', overflow: 'auto', paddingBottom: '1rem' }}>
      <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: radii.lg, boxShadow: shadows.soft, overflow: 'hidden' }}>
        <header style={{ padding: '1rem', borderBottom: `1px solid ${colors.border}`, display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: font.title, color: colors.textPrimary }}>{t('restSchedule.title')}</h2>
            <p style={{ margin: '0.25rem 0 0', color: colors.textSecondary, fontSize: font.body }}>{t('restSchedule.subtitle')}</p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="button" onClick={() => setMode('schedule')} style={buttonStyle(mode === 'schedule')}>{t('restSchedule.tab.schedule')}</button>
            <button type="button" onClick={() => setMode('history')} style={buttonStyle(mode === 'history')}>{t('restSchedule.tab.history')}</button>
          </div>
        </header>

        {mode === 'schedule' ? (
          <>
            <div style={{ padding: '0.85rem 1rem', display: 'flex', alignItems: 'center', gap: '0.55rem', flexWrap: 'wrap', background: colors.surfaceMuted }}>
              <button type="button" onClick={() => setReferenceDate(shiftDateKey(weekRange.startDate, -7))} style={buttonStyle()} aria-label={t('restSchedule.previousWeek')}>‹</button>
              <input type="date" value={referenceDate} onChange={event => setReferenceDate(event.target.value)} style={{ padding: '0.58rem', border: `1px solid ${colors.borderStrong}`, borderRadius: radii.md }} />
              <button type="button" onClick={() => setReferenceDate(shiftDateKey(weekRange.startDate, 7))} style={buttonStyle()} aria-label={t('restSchedule.nextWeek')}>›</button>
              <button type="button" onClick={() => setReferenceDate(today)} style={buttonStyle()}>{t('restSchedule.thisWeek')}</button>
              <strong style={{ color: colors.textSecondary, fontSize: font.body }}>{weekRange.startDate} - {weekRange.endDate}</strong>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button type="button" onClick={loadWeek} disabled={isLoading} style={buttonStyle()}>{isLoading ? t('restSchedule.loading') : t('restSchedule.refresh')}</button>
                <button type="button" onClick={printWeek} style={buttonStyle()}>{t('restSchedule.print')}</button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={isPastWeek || isSaving || !hasChanges || activeEmployees.length === 0}
                  style={{ ...buttonStyle(), background: isPastWeek || isSaving || !hasChanges ? colors.surfaceMuted : colors.success, color: isPastWeek || isSaving || !hasChanges ? colors.textMuted : '#fff', borderColor: 'transparent', cursor: isPastWeek || isSaving || !hasChanges ? 'not-allowed' : 'pointer' }}
                >
                  {isSaving ? t('restSchedule.saving') : t('restSchedule.save')}
                </button>
              </div>
            </div>

            {isPastWeek && <div style={{ margin: '0.8rem 1rem 0', padding: '0.65rem 0.8rem', background: colors.amberSoft, color: colors.amber, borderRadius: radii.md, fontSize: font.body }}>{t('restSchedule.pastReadOnly')}</div>}
            {!isPastWeek && unassignedEmployees.length > 0 && <div style={{ margin: '0.8rem 1rem 0', padding: '0.65rem 0.8rem', background: colors.amberSoft, color: colors.amber, borderRadius: radii.md, fontSize: font.body }}>{t('restSchedule.unassigned')}: {unassignedEmployees.map(employee => employee.name).join(', ')}</div>}

            <div style={{ overflowX: 'auto', padding: '1rem' }}>
              <table style={{ width: '100%', minWidth: 900, borderCollapse: 'separate', borderSpacing: 0, fontSize: font.body }}>
                <thead><tr>
                  <th style={{ textAlign: 'left', padding: '0.7rem', background: colors.surfaceMuted, borderBottom: `1px solid ${colors.border}`, position: 'sticky', left: 0, zIndex: 2 }}>{t('restSchedule.employee')}</th>
                  <th style={{ textAlign: 'left', padding: '0.7rem', background: colors.surfaceMuted, borderBottom: `1px solid ${colors.border}` }}>{t('restSchedule.position')}</th>
                  {weekDates.map((date, index) => <th key={date} style={{ padding: '0.7rem 0.35rem', background: colors.surfaceMuted, borderBottom: `1px solid ${colors.border}`, textAlign: 'center' }}><div>{weekdayLabels[index]}</div><small style={{ color: colors.textSecondary }}>{date.slice(5)}</small></th>)}
                </tr></thead>
                <tbody>
                  {activeEmployees.map(employee => <tr key={employee.id}>
                    <td style={{ padding: '0.75rem', borderBottom: `1px solid ${colors.border}`, fontWeight: 700, color: colors.textPrimary, background: colors.surface, position: 'sticky', left: 0, zIndex: 1 }}>{employee.name}</td>
                    <td style={{ padding: '0.75rem', borderBottom: `1px solid ${colors.border}`, color: colors.textSecondary }}>{employee.position || '-'}</td>
                    {weekDates.map(date => {
                      const selected = selectedRestDates[employee.id] === date;
                      return <td key={date} style={{ padding: '0.55rem 0.35rem', textAlign: 'center', borderBottom: `1px solid ${colors.border}`, background: selected ? '#f5f3ff' : colors.surface }}>
                        <input
                          type="radio"
                          name={`rest-${employee.id}`}
                          aria-label={`${employee.name} ${date}`}
                          checked={selected}
                          disabled={isPastWeek || isLoading}
                          onChange={() => setSelectedRestDates(current => ({ ...current, [employee.id]: date }))}
                          style={{ width: 18, height: 18, accentColor: '#7c3aed', cursor: isPastWeek ? 'not-allowed' : 'pointer' }}
                        />
                      </td>;
                    })}
                  </tr>)}
                  {activeEmployees.length === 0 && <tr><td colSpan={9} style={{ padding: '2rem', textAlign: 'center', color: colors.textMuted }}>{t('restSchedule.emptyEmployees')}</td></tr>}
                </tbody>
                <tfoot><tr>
                  <td colSpan={2} style={{ padding: '0.75rem', fontWeight: 700, background: colors.surfaceMuted }}>{t('restSchedule.dailyTotal')}</td>
                  {dailyCounts.map((count, index) => <td key={weekDates[index]} style={{ textAlign: 'center', padding: '0.75rem', fontWeight: 800, color: count > 0 ? '#7c3aed' : colors.textMuted, background: colors.surfaceMuted }}>{count}</td>)}
                </tr></tfoot>
              </table>
            </div>
          </>
        ) : (
          <div style={{ padding: '1rem' }}>
            <div style={{ display: 'flex', gap: '0.65rem', alignItems: 'end', flexWrap: 'wrap', marginBottom: '1rem' }}>
              <label style={{ display: 'grid', gap: '0.3rem', color: colors.textSecondary, fontSize: font.caption }}>{t('restSchedule.month')}
                <input type="month" value={historyMonth} onChange={event => setHistoryMonth(event.target.value)} style={{ padding: '0.58rem', border: `1px solid ${colors.borderStrong}`, borderRadius: radii.md }} />
              </label>
              <label style={{ display: 'grid', gap: '0.3rem', color: colors.textSecondary, fontSize: font.caption }}>{t('restSchedule.employeeFilter')}
                <select value={historyEmployeeId} onChange={event => setHistoryEmployeeId(event.target.value)} style={{ minWidth: 190, padding: '0.58rem', border: `1px solid ${colors.borderStrong}`, borderRadius: radii.md, background: colors.surface }}>
                  <option value="all">{t('restSchedule.allEmployees')}</option>
                  {historyEmployeeOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                </select>
              </label>
              <button type="button" onClick={loadHistory} disabled={isHistoryLoading} style={buttonStyle()}>{isHistoryLoading ? t('restSchedule.loading') : t('restSchedule.search')}</button>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: font.body }}>
                <thead><tr>{[t('restSchedule.employee'), t('restSchedule.position'), t('restSchedule.weekRange'), t('restSchedule.restDate'), t('restSchedule.updatedBy'), t('restSchedule.updatedAt')].map(label => <th key={label} style={{ textAlign: 'left', padding: '0.75rem', background: colors.surfaceMuted, borderBottom: `1px solid ${colors.border}` }}>{label}</th>)}</tr></thead>
                <tbody>
                  {filteredHistory.map(record => <tr key={record.id}>
                    <td style={{ padding: '0.75rem', borderBottom: `1px solid ${colors.border}`, fontWeight: 700 }}>{record.employeeName}</td>
                    <td style={{ padding: '0.75rem', borderBottom: `1px solid ${colors.border}` }}>{record.employeePosition || '-'}</td>
                    <td style={{ padding: '0.75rem', borderBottom: `1px solid ${colors.border}` }}>{record.weekStart} - {record.weekEnd}</td>
                    <td style={{ padding: '0.75rem', borderBottom: `1px solid ${colors.border}`, color: '#7c3aed', fontWeight: 700 }}>{record.restDate}</td>
                    <td style={{ padding: '0.75rem', borderBottom: `1px solid ${colors.border}` }}>{record.updatedBy || '-'}</td>
                    <td style={{ padding: '0.75rem', borderBottom: `1px solid ${colors.border}` }}>{record.updatedAt ? new Date(record.updatedAt).toLocaleString(language === 'es-NI' ? 'es-NI' : 'zh-CN') : '-'}</td>
                  </tr>)}
                  {!isHistoryLoading && filteredHistory.length === 0 && <tr><td colSpan={6} style={{ padding: '2rem', textAlign: 'center', color: colors.textMuted }}>{t('restSchedule.emptyHistory')}</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};

export default WeeklyRestSchedule;
