# Commercial Rollout Plan

Last updated: 2026-07-01, America/Managua.

Official project:

```text
C:\Users\华为\Desktop\Restaurant_POS_Cloud_Clean
```

Production:

```text
https://restaurant-pos-1b420.web.app
Firebase project: restaurant-pos-1b420
```

## Working Rules

- Use only `Restaurant_POS_Cloud_Clean` as the official codebase.
- Complete one task at a time, then mark it in this file.
- The active task is locked by the "Execution Queue" below. Do not start a later queue item until the current item is tested, deployed when needed, archived, and marked done.
- Emergency user-reported production bugs can interrupt the queue, but the interrupted queue item must stay marked `Paused` with a short reason.
- Every production-visible change needs targeted tests, production build, Firebase deploy, and archive notes.
- Do not make broad unrelated rewrites while fixing a specific issue.
- Store data is business-critical. Never let stale local data overwrite newer cloud data.
- All branch data must be scoped by `storeId`: orders, tables, inventory, menu, employees, suppliers, customers, expenses, stocktake history, reports, and settings.
- Nicaragua weak-network use is a hard requirement. Offline paths must be visible, retryable, and recoverable.
- Keep code simple. If a clear 10-line solution works, do not write 20 lines.

## Progress Board

| Step | Status | Goal | Evidence / Next Check |
| --- | --- | --- | --- |
| 0. Commercial rollout control document | Done | Create a single checklist for commercial hardening and progress tracking. | This file created on 2026-06-30. |
| 1. Project baseline freeze | Done | Record current dirty worktree, confirm official repo, prepare GitHub baseline branch/tag. | Archived in `docs/2026-06-30_COMMERCIAL_BASELINE_FREEZE.md`. |
| 2. Data safety baseline | Done | Document Firestore schema, store isolation, backup/restore, old-path cleanup, and deletion markers. | Archived in `docs/2026-06-30_DATA_SAFETY_BASELINE.md`; backup coverage test passes. |
| 3. POS lifecycle hardening | In progress | Verify dine-in, Barra, Delivery order lifecycle across terminals: create, add, cancel, pay, complete, clear table. | Merge/status audit, weak-network clear-table fix, terminal sync guards, and table release binding fix archived through `docs/2026-07-01_POS_TABLE_RELEASE_BINDING_FIX.md`; still needs controlled two-terminal E2E order tests. |
| 4. Inventory lifecycle hardening | In progress | Verify purchase, warehouse, fridge, transfer, stocktake, stock deduction, and audit records. | Read-only inventory audit, POS negative-stock prevention, purchase stock increment idempotency, stocktake adjustment records, purchase in-ledger records, fridge transfer ledger records, POS sale deduction ledger records, ledger display normalization, negative-stock visibility, and manual item-edit stock audit completed; existing negative stock needs approved stocktake correction. |
| 5. Finance lifecycle hardening | Not started | Verify expenses, purchase expenses, supplier payments, shift handover, financial report, and print output. | Needs daily report E2E and print snapshot checks. |
| 6. Permission and security hardening | Not started | Enforce owner, manager, cashier, waiter, chef permissions in Firestore rules, not only UI. | Needs rule tests and role matrix. |
| 7. Offline and sync productization | Not started | Make pending sync, conflict detection, retry, and manual repair visible and reliable. | Needs queue audit UI and recovery tests. |
| 8. Performance and Firestore cost control | Not started | Replace large full-collection reads with date windows, pagination, summaries, and archives. | Needs read-count estimates and query audit. |
| 9. UI and i18n polish | Not started | Spanish POS/front staff UI, Chinese owner/back office UI, no mojibake, stable mobile layouts. | Needs browser screenshots for key routes. |
| 10. Pilot acceptance | Not started | Run one-store trial with daily reconciliation before multi-store rollout. | Needs daily acceptance checklist. |

## Completed Interruptions

- 2026-06-30 Employee payroll and attendance precision fix: batch salary settlement now awaits each employee, salary/expense ids are deterministic, attendance records are marked settled after salary close, salary history and attendance printouts support date ranges, attendance time repair is manager-only, and the salary page build-breaking mojibake was removed. Archive: `docs/2026-06-30_EMPLOYEE_PAYROLL_ATTENDANCE_FIX.md`.
- 2026-07-01 POS clear-table and negative-stock rule fix: clear table / complete order no longer treats a pending cloud publish as a hard failure, and POS stock deduction again follows the confirmed business rule that fridge is deducted first and warehouse may become negative. Production browser verified Mesa 6 `#0701003` changed from `Pagado` to `Completado` without the red sync error. Archive: `docs/2026-07-01_POS_CLEAR_TABLE_PENDING_SYNC_FIX.md`.
- 2026-07-01 POS table release binding fix: traced same-device table release failures to `currentOrderId: undefined` being skipped by Firestore serialization, leaving old order ids on available tables. Release paths now write `currentOrderId: ""`, stock deduction locks can recover after failure, 11 stale available-table bindings were repaired in cloud data, deployed `main.d98c0487.js`, and production browser/cloud verification confirmed `staleAvailableBindings: 0`. Archive: `docs/2026-07-01_POS_TABLE_RELEASE_BINDING_FIX.md`.
- 2026-07-01 Attendance rest button lock fix: restored the `Descanso` / `Ausente` quick marker handler, changed quick attendance records to deterministic employee-date ids, added immediate click locks, deployed `main.d9cc3a6c.js`, and browser verified the attendance page with no console errors. Archive: `docs/2026-07-01_ATTENDANCE_REST_BUTTON_LOCK_FIX.md`.
- 2026-07-01 POS cancelled partial display fix: investigated order `0701024`; confirmed cloud data was a valid whole-order cancellation with partial payment, fixed the POS card so cancelled whole orders show `Cancelado: cobrado / anulado` instead of `falta`, kept item cancellation/refund logic separate, deployed, and browser verified production. Archive: `docs/2026-07-01_POS_CANCELLED_PARTIAL_DISPLAY_FIX.md`.
- 2026-07-01 Manager refresh false network error fix: traced frequent manager refresh failures to large cloud report snapshots being written back into browser `localStorage`, which could fail on older browsers with stale cached data and then show a misleading network alert. Manager refresh pages now keep cloud snapshots in memory only, while real record saves still persist normally. Deployed `main.7d16674e.js` and browser verified manager overview, expenses, financial reports, order history, and shift handover. Archive: `docs/2026-07-01_MANAGER_REFRESH_FALSE_NETWORK_FIX.md`.
- 2026-07-01 Manager order total consistency fix: directly checked Firestore and confirmed today's cloud orders are all `0701xxx`; the mismatch came from order history summing raw `totalAmount` and including cancelled whole orders. History now shows collected amount, cancellation counts match financial reports, data overview shows the same cancellation summary, deployed `main.c8838d4f.js`, and verified with visible local Chrome. Archive: `docs/2026-07-01_MANAGER_ORDER_TOTAL_CONSISTENCY_FIX.md`.
- 2026-07-01 Manager route cache stability fix: fixed the case where refresh time updated but returning to manager pages showed stale or mixed data. Read-only manager refreshes now update only page state and no longer mutate the shared `dataManager` cache; real saves remain unchanged. Verified in visible Chrome across data overview, order history, and financial reports, including refresh-button clicks. Archive: `docs/2026-07-01_MANAGER_ROUTE_CACHE_STABILITY_FIX.md`.
- 2026-07-01 POS table layout, total, and blank route emergency fix: blocked default POS table placeholders from publishing before cloud hydration, repaired cloud table 1-6 canonical ids and stale terminal order states, excluded whole cancelled orders from the POS right-side revenue total, and redirected legacy manager paths that caused blank pages. Deployed `main.5e456d0e.js`; browser verified POS, manager order history, financial reports, overview, and legacy route redirects all load with consistent `C$14715.00` revenue. Archive: `docs/2026-07-01_POS_TABLE_LAYOUT_TOTAL_BLANK_ROUTE_FIX.md`.
- 2026-07-01 Attendance mojibake button fix: removed corrupted prefixes from attendance tabs, action buttons, print button, and save error alerts, then deployed `main.2c37ff8a.js`. Browser verified `/employees/attendance` shows Spanish labels with no matched mojibake strings and no console errors. Archive: `docs/2026-07-01_ATTENDANCE_MOJIBAKE_BUTTON_FIX.md`.

## Current Baseline Findings

- The current worktree has many modified, deleted, and untracked files. This is a commercial risk because it is hard to isolate which change caused a regression.
- The largest files are high-risk maintenance points:
  - `client/src/pages/POS/POS.tsx`: about 4709 lines.
  - `client/src/pages/Inventory/Inventory.tsx`: about 2596 lines.
  - `client/src/pages/Inventory/FridgeStocktake.tsx`: about 2275 lines.
  - `client/src/services/smartSyncService.ts`: about 1434 lines.
- Firestore rules already use store-scoped paths such as `stores/{storeId}/pos_orders`, `stores/{storeId}/inventory_items`, and `stores/{storeId}/employees`.
- Firestore rules still mostly allow same-store read/write broadly via `hasStoreAccess(storeId)`. Commercial release needs per-role write restrictions.
- Storage rules allow menu image writes under a scoped path, but also have a broad authenticated fallback rule. Commercial release should tighten this.
- Existing regression tests are valuable, but many are source-string guards. Commercial release needs real data-flow tests with Firebase Emulator and browser flows.
- Current docs contain many useful archive notes, but some older sections show mojibake. The handoff path and latest task state should be kept clean and current.

## Definition Of Done For Each Task

For every future completed item:

1. Scope is written before code changes.
2. Targeted tests are added or updated when practical.
3. `npm test` targeted command passes.
4. `npm run build` passes for production-visible changes.
5. Firebase deploy is done when user-facing code or rules changed.
6. Browser verification is done for visible flows.
7. This file is updated with the completed status.
8. A dated archive note is added under `docs/`.

## Execution Queue

This queue is the source of truth for future work. Work proceeds from top to bottom.

| Queue | Status | Task | Acceptance |
| --- | --- | --- | --- |
| Q1 | Active | Finish inventory lifecycle audit coverage. | Every stock-changing entry point is listed as either audited, blocked, or intentionally read-only. Missing audit records are fixed with targeted tests. |
| Q2 | Pending | Inventory correction workflow for existing negative stock. | Existing negative values are not silently rewritten. A manager-approved stocktake/adjustment path can correct values and writes clear `inventory_stock_records`. |
| Q3 | Pending | Controlled POS multi-terminal lifecycle test. | Dine-in, Barra, Delivery create/pay/complete/cancel/clear-table are verified across two browser contexts with evidence. |
| Q4 | Pending | Finance lifecycle hardening. | Expenses, purchase expenses, supplier repayments, shift handover, financial report totals, and A4 print output reconcile against the same order/expense source. |
| Q5 | Pending | Offline and pending-sync visibility. | Pending writes, retry state, conflict state, and manual recovery are visible and testable without blocking normal ordering. |
| Q6 | Pending | Permission and rules hardening. | Owner, store manager, cashier, waiter, and chef write permissions are enforced by Firestore rules and covered by tests. |
| Q7 | Pending | Firestore cost and performance pass. | Large reads are replaced with date windows, pagination, summaries, or manual refresh where appropriate; estimated daily reads are documented. |
| Q8 | Pending | UI and i18n pass. | POS/front staff screens use Spanish, back-office screens stay Chinese where intended, mojibake is removed from visible UI, and key pages pass browser screenshot checks. |
| Q9 | Pending | Pilot acceptance checklist. | One-store daily operating checklist covers opening, ordering, purchase, stocktake, shift handover, reports, backup, and incident recovery. |

## Immediate Next Task

Execution Queue Q1: Finish inventory lifecycle audit coverage.

Deliverables:

- Completed subtask: add read-only inventory lifecycle audit script.
- Completed subtask: audit live cloud inventory and identify current negative warehouse stock records.
- Completed subtask: POS stock deduction uses fridge first and then warehouse, allowing warehouse stock to become negative when sales exceed counted stock, with stock ledger rows preserving the negative after-stock value.
- Completed subtask: make purchase stock increments idempotent with stable operation ids.
- Completed subtask: reuse the existing stock in/out records tab with store-scoped `inventory_stock_records`; warehouse and fridge stocktake discrepancies now write audited adjustment records.
- Completed subtask: purchase order item lines now write `inventory_stock_records` in-ledger records.
- Completed subtask: fridge transfers now write paired warehouse/fridge `inventory_stock_records` records inside the same transaction as the transfer.
- Completed subtask: POS completion stock deductions now write warehouse/fridge `inventory_stock_records` out-ledger records.
- Completed subtask: stock in/out records now normalize Firestore Timestamp/date-only values before sorting and rendering, prefer true operation timestamps, show business labels instead of internal codes, and display stocktake adjustment signs correctly.
- Completed subtask: inventory item list now exposes negative-stock warnings and a negative-stock filter without mutating stock values.
- Completed subtask: manual edits to an existing inventory item's warehouse stock now write an `inventory_stock_records` adjustment row with before/after stock and signed quantity.
- Current subtask: enumerate every remaining stock-changing entry point, then fix only the first missing audit gap found.
- Existing negative stock values must be corrected through an approved stocktake/adjustment flow, not silently overwritten by code.
