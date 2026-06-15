# 2026-06-11 Execution Plan

Goal: continue hardening the restaurant POS system module by module, with every change verified, deployed to Firebase Hosting, and pushed to GitHub.

Project source of truth:
- Local: `C:\Users\华为\Desktop\Restaurant_POS_Cloud_Clean`
- Hosting: `https://restaurant-pos-1b420.web.app`
- GitHub: `xchk1822-pixel/Restaurant_POS_Cloud_Clean`, branch `main`

Execution rule for every task:
1. Inspect current data flow and storage keys.
2. Make the smallest scoped code change.
3. Run `npx.cmd tsc --noEmit --pretty false` from `client`.
4. Run `npm.cmd run build` from `client`.
5. Verify the changed screen with Playwright locally or online.
6. Deploy with `firebase.cmd deploy --only hosting --non-interactive`.
7. Verify online.
8. Update progress notes with changed files, completed items, verification, deploy URL, and commit id.
9. Commit and push to GitHub.

Data isolation rule:
- Store business data must always use the current store scope.
- Store-scoped data includes POS orders, tables, inventory, menu items, stocktake history, suppliers, purchases, employees, attendance, loans, salary, expenses, handovers, customers, points, and store settings.
- Only owner/admin metadata such as `stores`, `users`, and `system_roles` may remain global.
- If a business module cannot resolve `storeId`, it must not write to a bare global business key.

## Archived Completed

- Inventory item/category manual refresh is cloud-authoritative and uses store-scoped local cache.
- Warehouse and fridge stocktake active refresh and history use cloud refresh with store-scoped cache.
- Employee records, attendance, loans, and salary settlement use awaited single-document writes and deletion tombstones.
- Manager modules for expenses, handover drafts/history, financial reports, overview metrics, customers, points, and exchange-rate settings have store-scoped cache guards.
- Owner dashboard removed the obsolete data-sync entry and uses collected revenue/date helpers.
- Smart sync blocks global Firestore/localStorage fallback for store business collections when `storeId` is missing.
- Login store sync now treats Firestore as the source of truth and clears stale local store caches when a cloud collection is empty.
- POS table layout cloud persistence is hardened: empty cloud tables clear stale local caches, table edit updates existing records, waiter/tablet devices remain read-only for `pos_tables`, and split merged tables restore the original table positions.
- Legacy global sync entry points `services/dataSync.ts` and `hooks/useFirestoreData.ts` were unused and have been deleted so root collection CRUD and non-store-scoped realtime hooks cannot be accidentally reconnected.
- Confirmed-unused legacy UI leftovers were deleted after import and route checks: `components/OrderDetails.tsx`, `components/OrderList.tsx`, `components/Payment.tsx`, old `pages/Dashboard/Dashboard.tsx`, old `pages/Reports/Reports.tsx`, `pages/Manager/ManagerDashboard.tsx`, `pages/Manager/ShiftHandoverEmbedded.tsx`, and `utils/storeDataIsolation.ts`.
- Backup export is Firestore-only and read-only; it no longer scans browser `localStorage` or includes `localCache` in the backup JSON.
- Owner dashboard branch cards were rechecked online after the data-layer cleanup: branch totals render, card click expands in-page detail instead of navigating blank, and 390px mobile width remains readable.
- Cleanup pass 1 removed confirmed-unreferenced technical leftovers after route/import/package checks: unused `client/src/types/index.ts`, old one-off `client/scripts/*.cjs`, stale `client/test-results`, undeployed reserved `server/` and `shared/`, and the mojibake legacy module overview document. Deployed and archived in commit `c989981`.
- Cleanup pass 2 removed obsolete root-level historical Markdown documents that were mojibake, stale, or contradicted the current Firestore/Firebase Hosting architecture. The root now keeps only a current `README.md` that points to active docs under `docs/`. Deployed and archived in commit `33ede41`.
- Cleanup pass 3 removed superseded docs history files from `docs/`: the 2026-06-09 handoff, 2026-06-10 progress stream, and 2026-06-14 daily wrap-up. Active documentation is now limited to the execution plan, latest progress, commercial V3 requirements, and V3 data model draft. Deployed and archived in commit `280f935`.
- Build warning cleanup pass 1 removed unused-variable warnings across split bill, AppContext, fridge stocktake, supplier management, expense records, shift handover, POS, and waiter screens. Build now only reports Hook dependency warnings. Deployed and archived in commit `f67c277`.
- Build warning cleanup pass 2 resolved the remaining Hook dependency warnings in `AppContext`, fridge stocktake, and warehouse stocktake, while preserving terminal-order merge guards. Build now completes without ESLint warnings and has been deployed to Firebase Hosting.
- Leftover cleanup pass 4 removed four confirmed-unused helper leftovers after source reference checks: fridge stocktake `getOtherFridgeItemIds`, POS `handleTableDragOver`, POS `handleTableDrop`, and POS-local `getWaitTime`. The still-used kitchen `getWaitTime` helper was intentionally kept.
- Leftover cleanup pass 5 removed obsolete commented-out realtime listener blocks from `AppContext`; the active snapshot loading and `pos_orders` realtime subscription remain unchanged.
- Leftover cleanup pass 6 removed seven obsolete redirect-only migration/test routes from `App.tsx` after RED/GREEN data-safety verification. Compatibility redirects `/stores`, `/exchange-rate`, and `/reports` were intentionally kept.
- Leftover cleanup pass 7 removed the remaining short compatibility redirects `/stores`, `/exchange-rate`, and `/reports` after reference/history checks confirmed active navigation uses canonical paths only.

## Remaining Queue

1. Ordered module verification queue
   - Rule: check in this order only, mark each item complete once, and do not repeat completed checks unless a new bug is reported.
   - [x] POS cashier: table/order list render, menu images, payment buttons, order status colors, complete-order stock deduction path.
   - [x] Waiter ordering: shared table layout, order submit to POS/kitchen, no independent table state.
   - [x] Kitchen display: reads shared POS orders, status changes write back to `pos_orders`.
   - [x] Inventory management: item management, menu management, warehouse stocktake, fridge stocktake, supplier management cloud/manual-refresh behavior.
   - [x] Employee management: profiles, attendance, loans, salary settlement persistence and store isolation.
   - [x] Manager management: expense records, shift handover, order history, financial reports, customers.
   - [x] Manager data overview: totals, payment split, order type analysis, sales ranking, trend table, customer profile.
   - [x] Owner dashboard: branch cards, branch detail, mobile layout.
   - [x] System settings: stores, exchange rate, permissions, backup export.

## Current Completed Today

- Supplier manual refresh is cloud-authoritative.
- Credit purchase supplier debt is recalculated from purchase orders instead of incrementing stale local supplier balance.
- Operational local caches were scoped by store and deployed in commit `deabd48`.
- Smart sync now blocks global Firestore/localStorage fallback paths for store-scoped business collections when `storeId` is missing.
- Login store sync is cloud-authoritative and clears stale local store caches, deployed in commit `d010b81`.
- POS table layout persistence now protects against stale local table replay, duplicate table edits, and split-after-merge layout drift; deployed to Firebase Hosting in commit `d8be493`.
- Legacy global sync service and hook were removed after import verification; deployed to Firebase Hosting in commit `e4ef353`.
- Confirmed-unused legacy UI, duplicate page, and old store-isolation leftovers were removed after RED/GREEN data-safety verification; deployed to Firebase Hosting in commit `c416c71`.
- Backup export now reads Firestore only and excludes browser local cache; deployed to Firebase Hosting in commit `d33b0d4`.
- Owner dashboard branch cards and mobile branch detail were verified online with no code change in commit `e40e2f8`.
- POS cashier was verified in order: table layout and right-side order list render online, payment/confirm copy no longer claims early stock deduction, and tests lock stock deduction to complete-order paths only. Deployed to Firebase Hosting in commit `47eb5fb`.
- Waiter ordering was verified in order: waiter orders write to shared `pos_orders`, table display derives occupied state from shared orders, and the waiter table layout is read-only so it cannot create local-only table layouts. Deployed to Firebase Hosting in commit `dd7512e`.
- Kitchen display was verified in order: `pos_orders` is subscribed by AppContext, mirrored into the local order stream for the kitchen display, and kitchen item/order status writes back to shared `pos_orders`. Re-deployed to Firebase Hosting in commit `4440b7b`.
- Inventory management was verified in order: item management, menu management, warehouse stocktake, fridge stocktake, and supplier management screens render online with cloud refresh entry points. Fridge stocktake now performs a one-time cloud refresh on entry and auto-selects a valid fridge so stale local cache cannot show empty or unknown fridge items on first load. Deployed to Firebase Hosting in commit `965eb8c`.
- Employee management was verified in order: employee profiles, attendance, loans, and salary settlement screens render online, use manual cloud refresh with visible sync time, and existing data-safety guards confirm store-scoped refresh, deletion tombstones, and awaited cloud writes for attendance, loans, salary, expenses, and cash flow. Re-deployed to Firebase Hosting in commit `2f57af3`.
- POS terminal order sync hotfix: cancel and complete actions now publish terminal order state directly to `pos_orders` before local state changes, covering dine-in clear-table completion plus takeout/delivery completion. Deployed to Firebase Hosting in commit `ff44168`.
- POS terminal order merge hotfix: a cloud `completed`/`cancelled` order now overrides a local non-terminal cached copy even when the local cache has a newer `lastModified`, preventing one-device stale completed orders. Deployed to Firebase Hosting in commit `b81560f`.
- POS cancelled-order table release hotfix: full-order cancellation now keeps the exact published `cancelledOrder` in local state, uses the order's own `tableId` to release the table, clears `currentOrderId`, and keeps cancelled orders visible in the current-day order list as cancellation records. Deployed to Firebase Hosting in commit `11e3d2a`.
- POS cancelled-order freeze hotfix: cancelled orders now remain visible as read-only audit records, available tables clear stale `currentOrderId`, and confirm-order logic creates a new order when the selected order is cancelled/completed/draft instead of appending items to the old order. Deployed to Firebase Hosting in commit `52311ca`.
- Financial reports now show `今日订单` as one combined business field: completed orders, whole-order cancellations, and cancelled dish quantity. The same field is used in the screen report and A4 print report, with cancellation reasons intentionally omitted from print.
- Financial report summary cards now follow the fixed two-row order requested for real operation: top row revenue/cash/card/order/profit-loss, bottom row handover/difference/daily expenses/purchase payments/supplier debt. The label was changed from `今日订单` to `订单` for date filters beyond today.

- Manager management was verified in order: expense records, shift handover, order history, financial reports, data overview, and customer management render online with 0 console errors. Expense receipt removal and shift handover submit now wait for cloud writes before local state updates. Order history detail now shows available cancellation summary and item-level cancellation records. Deployed to Firebase Hosting; details are recorded in `docs/2026-06-15_PROGRESS.md`.
- System settings were verified in order: store management, exchange-rate settings, permission management, and backup export. Store/account/role/exchange saves now write through cloud paths before local UI/cache mutation. Exchange-rate settings are store-scoped with an admin store selector, and backup export keeps `exchange_rate` under store business data only. Deployed to Firebase Hosting; details are recorded in `docs/2026-06-15_PROGRESS.md`.

## Next Session Start

- Read `docs/2026-06-15_PROGRESS.md` first.
- Ordered module verification queue is complete. Continue with cleanup only after import, route, test, build, deploy, and online checks, or handle newly reported production issues first.
- Next pass, if no production bug is reported first: review remaining stale comments and source references only after source-history checks before any deletion.
