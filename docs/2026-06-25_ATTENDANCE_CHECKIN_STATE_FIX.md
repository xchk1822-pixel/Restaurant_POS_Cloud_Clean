# 2026-06-25 Attendance Check-In State Fix

## Problem

In Employee Attendance, some employees showed "already checked in" after clicking the check-in button, but the button still looked pending and no matching attendance record appeared in the current attendance list.

## Root Cause

- The quick attendance cards render state from `selectedDate`, but check-in creation used the current system date from `getLocalDateString(now)`.
- If the attendance screen was viewing a selected date that differed from the current date, the UI and save logic were checking different days.
- Existing attendance rows without `checkIn` were treated as already checked in. This blocked employees that had a rest/absent/empty daily row from filling the real check-in time.

## Fix

- `handleCheckIn` now uses `selectedDate || getLocalDateString(now)` as the authoritative attendance date.
- Existing same-day records only block check-in when `existingRecord.checkIn` already exists.
- Existing same-day records without `checkIn` are updated in place with the new check-in time and `status: 'normal'`.
- New check-in record ids are deterministic by employee and date: `${employeeId}-${attendanceDate}`.
- The previous single-document save behavior is preserved; no bulk overwrite path was added.
- Employee attendance printout now uses a compact A4 portrait sheet.
- One employee printout is designed to fit on one A4 page, with the latest 15 attendance rows on the page.
- Print labels and employee-facing text were changed from Chinese to Spanish.
- Print date now uses Nicaragua Spanish locale: `es-NI`.
- Attendance management action buttons were changed to Spanish: check-in, check-out, rest, absent, and print.
- The side navigation label for `/employees/attendance` was changed from Chinese to `Asistencia`.

## Verification

- `npm test -- --watchAll=false --runTestsByPath src/utils/dataSafety.test.ts --testNamePattern="attendance check-in uses|attendance changes"`
- `npm test -- --watchAll=false --runTestsByPath src/utils/dataSafety.test.ts --testNamePattern="attendance check-in uses|attendance changes|attendance employee printout"`
- `npm test -- --watchAll=false --runTestsByPath src/utils/dataSafety.test.ts --testNamePattern="attendance check-in uses|attendance changes|attendance employee printout|attendance management navigation"`
- `npm run build`

## Deployment

- Firebase Hosting deployment target: `restaurant-pos-1b420`.
- Status: deployed successfully with `firebase deploy --only hosting --project restaurant-pos-1b420`.
