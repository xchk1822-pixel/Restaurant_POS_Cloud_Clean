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

## Task Queue

1. Inventory item/category manual refresh
   - Make refresh pull from Firestore server and update local store cache.
   - Prevent deleted or old local inventory/category data from surviving manual refresh.

2. Warehouse and fridge stocktake refresh
   - Check whether refresh merges stale local records.
   - Preserve stocktake history safely while making active stock data cloud-authoritative when manually refreshed.

3. Employee management
   - Recheck employee, attendance, loan, salary, and cash-flow writes.
   - Confirm deleted employees do not return on another terminal after manual refresh.

4. Manager management
   - Recheck expense records, shift handover, historical orders, financial reports, overview, and customer points.
   - Confirm low-frequency refresh updates local cache and does not revive old records.

5. Owner dashboard
   - Recheck mobile layout, branch cards, data summary, and global collection reads.
   - Remove or hide obsolete sync/admin tools that can confuse production use.

6. Data safety pass
   - Review backup export coverage.
   - Identify any remaining old DataService/localStorage paths that can write stale data back.

## Current Completed Today

- Supplier manual refresh is cloud-authoritative.
- Credit purchase supplier debt is recalculated from purchase orders instead of incrementing stale local supplier balance.
- Operational local caches were scoped by store and deployed in commit `deabd48`.
- Smart sync now blocks global Firestore/localStorage fallback paths for store-scoped business collections when `storeId` is missing.
