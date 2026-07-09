# 2026-07-05 Attendance Default Range Fix

## Scope
- Precise fix only for employee attendance record date defaults.
- Touched:
  - `client/src/pages/Employees/AttendanceManagement.tsx`
  - `client/src/utils/dataSafety.test.ts`

## Business Rule
- Attendance records default to the current month start through today.
- If the current month first-half attendance records already have salary settlement marks, the default range switches to day 16 through today.
- Manual date selections are preserved. Cloud refresh or attendance record reloads do not overwrite a manager's manually selected range.

## Implementation
- Added `getCurrentMonthAttendanceDefaultRange`.
- Uses `settledSalaryId` on attendance records as the settlement marker written by salary settlement.
- Uses `today >= YYYY-MM-16` guard so the page cannot default to a future day during the first half of a month.
- Added manual date handlers with `attendanceRangeTouchedRef`.

## Verification
- Targeted regression test:
  - `npm test -- --runTestsByPath src/utils/dataSafety.test.ts --runInBand --watchAll=false --testNamePattern="attendance print uses selected date range"`
  - Result: pass.
- Production build:
  - `npm run build`
  - Result: compiled successfully.
- Firebase deploy:
  - `npx firebase deploy --only hosting --project restaurant-pos-1b420`
  - Result: deployed to `https://restaurant-pos-1b420.web.app`.
- Real browser verification:
  - Logged in as `zeng`.
  - Opened `/employees/attendance`.
  - Clicked `Registro`.
  - Date inputs showed `2026-07-01` and `2026-07-05`.
  - Loaded bundle: `main.ca4eab0b.js`.
  - Console error count: 0.
