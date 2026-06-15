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

## Remaining Queue

1. Ordered module verification queue
   - Rule: check in this order only, mark each item complete once, and do not repeat completed checks unless a new bug is reported.
   - [x] POS cashier: table/order list render, menu images, payment buttons, order status colors, complete-order stock deduction path.
   - [x] Waiter ordering: shared table layout, order submit to POS/kitchen, no independent table state.
   - [x] Kitchen display: reads shared POS orders, status changes write back to `pos_orders`.
   - [ ] Inventory management: item management, menu management, warehouse stocktake, fridge stocktake, supplier management cloud/manual-refresh behavior.
   - [ ] Employee management: profiles, attendance, loans, salary settlement persistence and store isolation.
   - [ ] Manager management: expense records, shift handover, order history, financial reports, customers.
   - [x] Manager data overview: totals, payment split, order type analysis, sales ranking, trend table, customer profile.
   - [x] Owner dashboard: branch cards, branch detail, mobile layout.
   - [ ] System settings: stores, exchange rate, permissions, backup export.

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
- Kitchen display was verified in order: `pos_orders` is subscribed by AppContext, mirrored into the local order stream for the kitchen display, and kitchen item/order status writes back to shared `pos_orders`. Re-deployed to Firebase Hosting in commit `pending`.
