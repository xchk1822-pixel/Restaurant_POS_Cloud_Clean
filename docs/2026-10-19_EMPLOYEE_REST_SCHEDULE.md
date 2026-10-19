# Employee Rest Schedule - 2026-10-19

## Scope

- Production checkout: `Restaurant_POS_Cloud_Clean`
- Firebase project: `restaurant-pos-1b420`
- Added one independent employee child module named `休假安排` / `Plan de descansos`.

## Business Rule

- Each active employee is assigned exactly one rest day in a Monday-to-Sunday week.
- The schedule records no work start or end time.
- Past weeks are read-only; current and future weeks can be maintained.
- Attendance displays a read-only planned-rest hint only. It does not create attendance, lock attendance actions, or change salary calculations.

## Data Safety

- Records are isolated under `stores/{storeId}/employee_rest_schedules`.
- One stable document ID is used for each employee and week, so retries update the same record instead of creating duplicates.
- Writes use the existing smart-sync queue and retain offline pending behavior.
- Reads are limited to the selected week or month; the collection is not added to full login preload.
- Firestore rules require store access and the dedicated `employees:rest-schedule` permission or manager access.
- The collection is included in system backup exports and the bounded local cache.

## Features

- Weekly employee-by-day table with one selectable rest day per employee.
- Daily rest-count totals and incomplete-assignment warning.
- A4 landscape printing with store, week, employee, position, daily totals, print time, and manager signature.
- Monthly historical lookup with employee filtering.
- Chinese and Nicaragua Spanish interface text.

## Verification

- Full client test suite passed: 41 suites, 540 tests.
- Production build passed with bundle `main.11f15b6b.js`.
- Real-browser local verification covered week navigation, one-choice radio behavior, daily totals, history filters, and A4 print layout.
- No rest schedule was saved during browser verification.
- Final production verification is recorded after Firestore rules and Hosting deployment.
