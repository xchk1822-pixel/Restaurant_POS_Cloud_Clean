# 2026-07-01 Attendance mojibake button fix

## Scope

Fix visible mojibake on the employee attendance management page after the recent attendance module changes.

## Root Cause

Several attendance page labels contained corrupted emoji/text prefixes:

- `鉁?Entrada marcada`
- `鉁?Salida marcada`
- `馃槾 Descanso`
- `鉂?Ausente`
- `馃枿锔?Imprimir asistencia`
- `鈴?Marcar asistencia`
- `馃搵 Registro`

Two attendance failure messages also still used corrupted Chinese text.

## Changes

- `client/src/pages/Employees/AttendanceManagement.tsx`
  - Replaced corrupted labels with plain Spanish labels.
  - Replaced corrupted attendance save error alerts with Spanish messages.

- `client/src/utils/dataSafety.test.ts`
  - Extended the attendance Spanish-label guard to reject the corrupted strings found in production.

## Verification

Commands:

```powershell
cd C:\Users\华为\Desktop\Restaurant_POS_Cloud_Clean\client
$env:CI='true'; npm test -- --runTestsByPath src/utils/dataSafety.test.ts --runInBand
$env:CI='true'; npm run build

cd C:\Users\华为\Desktop\Restaurant_POS_Cloud_Clean
firebase deploy --only hosting
```

Results:

- `dataSafety.test.ts`: `216 passed`.
- Production build: compiled successfully, `main.2c37ff8a.js`.
- Firebase Hosting deploy: complete.

Browser verification:

- Logged in as `zeng`.
- Opened `/employees/attendance`.
- Button text shows:
  - `Marcar asistencia`
  - `Registro`
  - `Entrada marcada`
  - `Salida marcada`
  - `Descanso`
  - `Ausente`
  - `Marcar entrada`
  - `Marcar salida`
- No matched mojibake strings in the page body.
- No console errors.
