# Employee Rest Schedule - 2026-10-19

## Scope

- Production checkout: `Restaurant_POS_Cloud_Clean`
- Firebase project: `restaurant-pos-1b420`
- Added one independent employee child module named `休假安排` / `Plan de descansos`.

## Business Rule

- Rest days are assigned according to the real weekly need; an employee may have zero, one, or multiple selected days.
- The module does not enforce a minimum or maximum and does not warn about employees without a selected rest day.
- The schedule is planning reference only; actual rest is determined by attendance records.
- The schedule records no work start or end time.
- Past weeks are read-only; current and future weeks can be maintained.
- Attendance displays a read-only planned-rest hint only. The schedule does not create attendance, lock attendance actions, establish actual rest, or change salary calculations.

## Data Safety

- Records are isolated under `stores/{storeId}/employee_rest_schedules`.
- One stable document ID is used for each employee and week, with an unrestricted date array and a legacy-compatible primary date, so retries update the same record instead of creating duplicates.
- Writes use the existing smart-sync queue and retain offline pending behavior.
- Reads are limited to the selected week or month; the collection is not added to full login preload.
- Firestore rules require store access and the dedicated `employees:rest-schedule` permission or manager access.
- The collection is included in system backup exports and the bounded local cache.

## Features

- Weekly employee-by-day table with unrestricted date selection per employee.
- Daily rest-count totals without incomplete-assignment warnings.
- A4 landscape printing with store, week, employee, position, daily totals, print time, and manager signature.
- Monthly historical lookup with employee filtering.
- Chinese and Nicaragua Spanish interface text.

## Verification

- Full client test suite passed: 41 suites, 542 tests.
- Production build passed with bundle `main.93e41cbf.js`.
- Real-browser local verification covered week navigation, unrestricted multi-day checkbox behavior, daily totals, history filters, and A4 print layout.
- No rest schedule was saved during browser verification.
- Firestore rules and Hosting deployed successfully to `restaurant-pos-1b420`.
- The unrestricted schedule update was verified locally with three simultaneous dates selected and no unassigned-employee warning.
- Production browser console: 0 errors, 0 warnings.
