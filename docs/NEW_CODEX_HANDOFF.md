# New Codex Handoff - Restaurant POS Cloud Clean

Last updated: 2026-06-26, America/Managua.

## Read This First

This is the handoff document for reinstalling Codex or starting a new Codex chat.

The official project is:

```text
C:\Users\华为\Desktop\Restaurant_POS_Cloud_Clean
```

Do not continue work from old folders, even if they still exist on the Desktop:

```text
C:\Users\华为\Desktop\Restaurant_System_V2
C:\Users\华为\Desktop\POS
C:\Users\华为\Desktop\restaurant
C:\Users\华为\Desktop\RestoPOS
C:\Users\华为\Desktop\营业款POS
```

Those folders may contain old versions and can pollute decisions. Use `Restaurant_POS_Cloud_Clean` only.

## Current Production URL

Firebase Hosting:

```text
https://restaurant-pos-1b420.web.app
```

Firebase project id:

```text
restaurant-pos-1b420
```

## Common Accounts For Manual Testing

These were provided by the owner for this local project:

```text
Owner/admin: admin / admin123
Store manager: zeng / 123456
```

## How To Continue In A New Codex Chat

In the new Codex window, send this:

```text
请先读取并遵守：
C:\Users\华为\Desktop\Restaurant_POS_Cloud_Clean\docs\NEW_CODEX_HANDOFF.md
C:\Users\华为\Desktop\Restaurant_POS_Cloud_Clean\docs\2026-06-15_PROGRESS.md

正式项目只以 C:\Users\华为\Desktop\Restaurant_POS_Cloud_Clean 为准，不要使用 Restaurant_System_V2 或其他旧目录。
继续时先检查 git status，然后按文档里的计划继续，一个任务完成后必须测试、构建、部署、归档。
```

## Project Commands

Frontend app:

```powershell
cd C:\Users\华为\Desktop\Restaurant_POS_Cloud_Clean\client
npm start
```

Targeted regression tests:

```powershell
cd C:\Users\华为\Desktop\Restaurant_POS_Cloud_Clean\client
npm test -- --watchAll=false --runTestsByPath src/utils/dataSafety.test.ts
```

Production build:

```powershell
cd C:\Users\华为\Desktop\Restaurant_POS_Cloud_Clean\client
npm run build
```

Deploy hosting:

```powershell
cd C:\Users\华为\Desktop\Restaurant_POS_Cloud_Clean
firebase deploy --only hosting --project restaurant-pos-1b420
```

Deploy Firestore rules when rules changed:

```powershell
cd C:\Users\华为\Desktop\Restaurant_POS_Cloud_Clean
firebase deploy --only firestore:rules --project restaurant-pos-1b420
```

Quick production URL check:

```powershell
try { $r = Invoke-WebRequest -Uri https://restaurant-pos-1b420.web.app -UseBasicParsing -TimeoutSec 20; "STATUS=$($r.StatusCode) LENGTH=$($r.Content.Length)" } catch { "ERROR=$($_.Exception.Message)" }
```

## Non-Negotiable Product Rules

- Multi-branch data must be isolated by store key. Inventory, menu items, orders, employees, customers, suppliers, expenses, stocktake history, table layout, and settings must not leak across stores.
- Production data is more important than code convenience. Avoid bulk overwrites. Prefer deterministic single-document writes and explicit cloud acknowledgements before mutating local UI for high-risk data.
- Low-frequency modules usually use manual refresh, not realtime subscription: inventory management, employees, suppliers, customers, manager back office, owner dashboards.
- High-frequency front-of-house modules need realtime behavior when online: POS active orders, table status, waiter shared tables, kitchen order state.
- Offline/weak-network behavior must be designed for Nicaragua. If offline, local pending state is allowed only where conflict risk is acceptable and must be clearly marked and retried.
- POS stock deduction happens on order completion, not payment. Payment can happen before dining and customers can add items later.
- Wine/drink inventory logic: sales deduct fridge first, then warehouse only when fridge stock is insufficient. Transfers from warehouse to fridge must deduct warehouse and add fridge together.
- Never let stale local data overwrite newer cloud data.
- After every completed task: test, build, deploy if user-facing, update docs.
- Keep code simple. If 10 lines can solve it clearly, do not write 20 lines.

## Important Architecture Notes

- Main app source lives under:

```text
C:\Users\华为\Desktop\Restaurant_POS_Cloud_Clean\client\src
```

- Central data/sync service:

```text
client\src\services\smartSyncService.ts
```

- Safety regression tests:

```text
client\src\utils\dataSafety.test.ts
```

- Firestore rules:

```text
firestore.rules
```

- Ongoing progress archive:

```text
docs\2026-06-15_PROGRESS.md
```

## Recent Completed Work

Detailed archives exist in `docs\`.

- `docs\2026-06-26_POS_PENDING_COMPLETION_ECHO_GUARD.md`
  - Investigated order `0626031` multi-terminal mismatch.
  - Firestore showed the order still `served/paid`, not `completed`; B terminal was showing the cloud state correctly.
  - Fixed POS global order merge so older cloud snapshots cannot clear pending local completion retries before cloud echoes the same completed order state.
  - Verified targeted POS sync tests, production build, and Firebase Hosting deployment.
  - Note: existing order `0626031` remained `served/paid` in Firestore after deployment and needs separate business handling before marking it complete, because stock deduction status is also false.

- `docs\2026-06-26_POS_MULTITERMINAL_ORDER_SYNC_GUARD.md`
  - Fixed POS incremental publishing so weak-network pending writes are not marked as cloud-synced.
  - Removed duplicate POS table status reconciliation effect.
  - Added kitchen terminal-order guard to prevent completed/cancelled orders from being regressed by stale kitchen writes.
  - Fixed waiter add-on payment-status recalculation.
  - Added store-scoped Firestore transaction daily order counters under `order_counters` while keeping the visible date-plus-sequence order number format.
  - Deployed Hosting and Firestore rules to Firebase project `restaurant-pos-1b420`.

- `docs\2026-06-25_ATTENDANCE_CHECKIN_STATE_FIX.md`
  - Fixed attendance check-in date mismatch.
  - Attendance check-in now uses selected attendance date.
  - Existing daily rows without check-in can be filled in place.
  - Attendance printout is A4 portrait, one employee per page, latest 15 attendance rows, Spanish labels.
  - Verified tests, build, and Firebase Hosting deployment.

- `docs\2026-06-25_FRIDGE_TRANSFER_AUDIT_GUARD.md`
  - Fridge transfer now uses audited transaction.
  - Prevents insufficient-stock transfer.
  - Adds transfer record visibility and enlarged stocktake/history modals.

- `docs\2026-06-24_POS_ORDER_TERMINAL_SYNC_RETRY.md`
  - POS terminal completion/clear sync retry behavior improved for weak networks.

- `docs\2026-06-24_NEW_SUPPLIER_MODULE.md`
  - Supplier module rebuilt as independent module.

- `docs\2026-06-24_CUSTOMER_MODULE_SPLIT.md`
  - Customer module separated from manager module.

- `docs\2026-06-24_MANAGER_DASHBOARD_LAYOUT_REDESIGN.md`
  - Manager dashboard redesigned into five top cards and grouped analytics.

- `docs\2026-06-24_OWNER_DASHBOARD_ORDER_EXPENSE.md`
  - Owner dashboard added store selection, order type split, expense ranking.

## Current Git State Warning

There are many uncommitted modifications and untracked files from the recent work. A new Codex must not run destructive cleanup such as:

```text
git reset --hard
git checkout -- .
```

unless the owner explicitly asks for it.

Start every new task with:

```powershell
cd C:\Users\华为\Desktop\Restaurant_POS_Cloud_Clean
git status --short
```

Then only edit the files needed for the specific task.

## Last Verified State

Last successful validation before this handoff:

```powershell
cd C:\Users\华为\Desktop\Restaurant_POS_Cloud_Clean\client
npm test -- --watchAll=false --runTestsByPath src/utils/dataSafety.test.ts -t "POS incremental publisher|kitchen display cannot regress|waiter add-on recalculates|POS order numbers keep|POS table status is reconciled"
npm run build
```

Last deployment:

```powershell
cd C:\Users\华为\Desktop\Restaurant_POS_Cloud_Clean
firebase deploy --only hosting,firestore:rules
```

Production check returned:

```text
STATUS=200
```

## Suggested Next Work Order

Continue one task at a time. For each task:

1. Reproduce or inspect the exact symptom.
2. Add or update a targeted regression test when possible.
3. Make the smallest safe code change.
4. Run targeted test.
5. Run `npm run build`.
6. Deploy if user-facing.
7. Update `docs\2026-06-15_PROGRESS.md` and create a dated detailed archive if the task is meaningful.

Likely next areas based on recent work:

- Continue stabilizing employee management and attendance printing/manual test flow.
- Continue high-risk submit button guards across purchase, stocktake, supplier, POS actions.
- Continue POS multi-device realtime sync verification under online and weak-network conditions.
- Continue inventory correctness audit using stocktake history, sales completion records, and transfer records.
- Continue UI polish only when explicitly requested, and avoid changing business logic during UI-only tasks.
