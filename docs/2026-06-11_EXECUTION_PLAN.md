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

## Remaining Queue

1. POS table layout cloud persistence
   - Verify table create/edit/delete/drag writes every layout change to `stores/{storeId}/pos_tables`.
   - Confirm a clean browser login restores the same table layout from cloud, not from old local cache.

2. Legacy service quarantine
   - Review `client/src/services/dataSync.ts` and `client/src/hooks/useFirestoreData.ts`.
   - Remove or guard any production imports that can read/write root business collections.

3. Backup/export safety
   - Confirm backup export is read-only and does not include stale global business localStorage keys as authoritative data.

4. Remaining UI/data verification
   - Recheck owner mobile branch cards after the data layer is fully quarantined.
   - Continue module-by-module smoke tests without repeating archived completed work.

## Current Completed Today

- Supplier manual refresh is cloud-authoritative.
- Credit purchase supplier debt is recalculated from purchase orders instead of incrementing stale local supplier balance.
- Operational local caches were scoped by store and deployed in commit `deabd48`.
- Smart sync now blocks global Firestore/localStorage fallback paths for store-scoped business collections when `storeId` is missing.
- Login store sync is cloud-authoritative and clears stale local store caches, deployed in commit `d010b81`.
