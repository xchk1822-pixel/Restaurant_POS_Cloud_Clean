# 2026-07-02 New Chat Handoff - Restaurant POS Cloud Clean

## Start Here

Official project folder:

```text
C:\Users\华为\Desktop\Restaurant_POS_Cloud_Clean
```

Production site:

```text
https://restaurant-pos-1b420.web.app
```

Firebase project:

```text
restaurant-pos-1b420
```

Do not use old folders such as:

```text
C:\Users\华为\Desktop\Restaurant_System_V2
```

That old folder is not the active production project.

## Accounts For Testing

```text
Owner/admin: admin / admin123
Store manager: zeng / 123456
```

## New Chat Prompt

Paste this into a new Codex chat:

```text
请先读取并遵守：
C:\Users\华为\Desktop\Restaurant_POS_Cloud_Clean\docs\2026-07-02_NEW_CHAT_HANDOFF.md
C:\Users\华为\Desktop\Restaurant_POS_Cloud_Clean\docs\2026-07-02_POS_DELETED_ORDER_CACHE_FIX.md

正式项目只以 C:\Users\华为\Desktop\Restaurant_POS_Cloud_Clean 为准。
不要使用 Restaurant_System_V2。
每次修改必须先检查现象和代码根因，精准修改，不能大改无关功能。
用户要求：真实浏览器验证、测试、构建、部署、归档后才算完成。
```

## Non-Negotiable Rules

- All business data must be store-scoped by store key.
- POS must work offline or under weak Nicaragua network conditions.
- Online POS must realtime sync active orders and table state across devices.
- Do not let stale local cache overwrite newer cloud data.
- Do not bulk overwrite production data.
- Prefer deterministic single-document writes.
- POS inventory deduction happens when an order is completed, not when paid.
- Inventory may be negative when the real business allows it; do not add hidden "no negative stock" guards without approval.
- Do not change unrelated modules.
- After every meaningful task: test, build, deploy if user-facing, and write a dated docs archive.
- Keep code simple. If 10 clear lines solve it, do not write 20.

## Current Production State

Latest deployed bundle verified on production:

```text
main.c2fd0066.js
```

Latest verified fix:

```text
docs\2026-07-02_POS_DELETED_ORDER_CACHE_FIX.md
```

What was fixed:

- Order `0702044` had been deleted from Firestore, but POS could still show it from local browser cache.
- Cloud path checked: `stores/store_1776725610354/pos_orders`.
- Firestore confirmed `0702044` count was `0`.
- Inventory restore for deleted order had already been completed before this handoff.
- POS now performs a server-authoritative current-day order refresh.
- Online Firestore cache-only snapshots are ignored for current-day POS orders.
- POS startup cache merge skips current-day non-pending cached orders.
- POS order cache save effect now skips unchanged order signatures to reduce repeated writes and flicker risk.

Real browser verification result:

```text
Injected stale local cache order 0702044.
Reloaded production POS.
visible0702044: false
local cache match count: 0
browser console errors: 0
```

Regression result:

```text
npm test -- --runTestsByPath src/utils/dataSafety.test.ts --runInBand --watchAll=false
226 passed
```

Build and deploy:

```text
npm run build
npx firebase deploy --only hosting
```

Both succeeded.

## Current Important Files

POS page:

```text
client\src\pages\POS\POS.tsx
```

Sync service:

```text
client\src\services\smartSyncService.ts
```

Regression tests:

```text
client\src\utils\dataSafety.test.ts
```

POS lifecycle utilities:

```text
client\src\utils\posLifecycle.ts
```

Firestore rules:

```text
firestore.rules
```

## Commands

Check active repo state:

```powershell
cd C:\Users\华为\Desktop\Restaurant_POS_Cloud_Clean
git status --short
```

Run targeted regression:

```powershell
cd C:\Users\华为\Desktop\Restaurant_POS_Cloud_Clean\client
npm test -- --runTestsByPath src/utils/dataSafety.test.ts --runInBand --watchAll=false
```

Build:

```powershell
cd C:\Users\华为\Desktop\Restaurant_POS_Cloud_Clean\client
npm run build
```

Deploy hosting:

```powershell
cd C:\Users\华为\Desktop\Restaurant_POS_Cloud_Clean
npx firebase deploy --only hosting
```

Check deployed bundle:

```powershell
$html=(Invoke-WebRequest -UseBasicParsing 'https://restaurant-pos-1b420.web.app/?verify=handoff').Content
if($html -match 'main\.([a-f0-9]+)\.js'){"bundle=$($Matches[0])"} else {'bundle not found'}
```

## Known Current Situation

- There are many existing uncommitted changes from previous work.
- Do not run destructive git commands.
- Do not reset or revert files unless the user explicitly asks.
- The current environment may open in `Restaurant_System_V2`, but the real active project is `Restaurant_POS_Cloud_Clean`.
- The user expects real browser validation for POS and production-visible fixes.
- Build/test success alone is not enough for POS issues.

## Recent Related Archives

Read these if the next task touches POS sync, offline, or browser cache:

```text
docs\2026-07-02_POS_DELETED_ORDER_CACHE_FIX.md
docs\2026-07-02_POS_REAL_UI_SYNC_FIX.md
docs\2026-07-02_POS_SYNC_STABILIZATION_FINAL.md
docs\2026-07-02_POS_OFFLINE_FIRST_COMPLETION_PAYMENT_FIX.md
docs\2026-07-01_POS_CLEAR_TABLE_PENDING_SYNC_FIX.md
docs\2026-06-29_POS_ORDER_LIFECYCLE_SYNC_FIX.md
docs\2026-06-29_POS_COMPLETE_ORDER_CLOUD_SYNC_FIX.md
```

## Suggested Next Work

Continue from the user's next reported issue. For each task:

1. Reproduce with browser or inspect cloud/local state.
2. Identify root cause before editing.
3. Make the smallest safe change.
4. Add or update a targeted regression test.
5. Run targeted tests.
6. Build.
7. Deploy if user-facing.
8. Verify in production browser.
9. Create a dated docs archive.

Do not start broad cleanup unless the user explicitly asks.
