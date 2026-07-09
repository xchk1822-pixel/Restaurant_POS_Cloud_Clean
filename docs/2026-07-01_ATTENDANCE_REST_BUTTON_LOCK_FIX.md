# 2026-07-01 Attendance Rest Button Lock Fix

Date: 2026-07-01, America/Managua.

## Scope

Emergency fix for Employee Management / Attendance. The reported symptoms:

- `Descanso` button did not respond.
- After clicking an attendance action, the button must lock so it cannot be clicked repeatedly.

## Root Cause

The quick attendance marker function was damaged by an old mojibake comment line that contained `const handleQuickMark` inside the comment. The real handler was missing/broken in the active code path.

The quick rest/absent record also used `Date.now().toString()` as the new document id. That made it inconsistent with the normal deterministic attendance id `${employeeId}-${date}`.

## Completed

- Restored a real `handleQuickMark(employeeId, status)` function for `Descanso` and `Ausente`.
- Added an immediate `useRef` based click lock so a fast double-click cannot submit twice before React re-renders.
- Added visible pending state tracking through `attendanceActionKeys`.
- Changed quick rest/absent record id to `${employeeId}-${date}`.
- Changed quick rest/absent buttons to lock once the employee already has a record for that date.
- Kept writes as deterministic single-document `smartSetDocument('attendance_records', recordToSave.id, recordToSave)`.
- Replaced broken Chinese/mojibake alert strings in the check-in flow with Spanish text so production build compiles cleanly.

## Verification

- Targeted regression passed:
  - `npm test -- --watchAll=false --runTestsByPath src/utils/dataSafety.test.ts --testNamePattern="attendance quick rest"`
- Production build passed:
  - `npm run build`
  - Bundle: `main.d9cc3a6c.js`
- Firebase Hosting deployed successfully:
  - `https://restaurant-pos-1b420.web.app`
- Live HTML points to:
  - `main.d9cc3a6c.js`
- Production browser verification:
  - Logged in with `zeng / 123456`.
  - Opened `/employees/attendance`.
  - Confirmed the attendance page renders.
  - Confirmed employees with existing same-day attendance records have `Descanso` and `Ausente` disabled, so the same-day quick action is locked.
  - Console/page errors: none.
  - Screenshot: `client/output/playwright/attendance-rest-before.png`.

## Notes

No new real attendance record was created during browser verification, to avoid polluting today's payroll/attendance data.
