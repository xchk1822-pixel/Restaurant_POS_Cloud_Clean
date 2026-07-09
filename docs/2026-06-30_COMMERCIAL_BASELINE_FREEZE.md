# 2026-06-30 Commercial Baseline Freeze

Date: 2026-06-30, America/Managua.

## Scope

This pass starts the commercial rollout hardening process. It does not change business logic.

## Completed

- Created `docs/COMMERCIAL_ROLLOUT_PLAN.md` as the single progress board for commercial rollout.
- Confirmed the official project path is `C:\Users\华为\Desktop\Restaurant_POS_Cloud_Clean`.
- Confirmed the production Firebase project remains `restaurant-pos-1b420`.
- Added generated verification output folders to `.gitignore`:
  - `/.playwright-cli/`
  - `/output/`
  - `client/output/`
- Confirmed those paths are now ignored by Git.

## Current Worktree Snapshot

After ignoring generated output folders:

- Modified tracked files: 59.
- Deleted tracked files: 3.
- Untracked source/docs/scripts entries: 51.

High-risk large files:

- `client/src/pages/POS/POS.tsx`: about 4709 lines.
- `client/src/pages/Inventory/Inventory.tsx`: about 2596 lines.
- `client/src/pages/Inventory/FridgeStocktake.tsx`: about 2275 lines.
- `client/src/services/smartSyncService.ts`: about 1434 lines.

## Commercial Risk

The current codebase contains many valid but uncommitted historical fixes. This is risky because future regressions are hard to trace. The next commercial step should not be another feature. It should be a baseline consolidation.

## Recommended Commit Strategy

1. Run targeted tests for the recent critical areas:
   - `dataSafety.test.ts`
   - `ownerDashboardData.test.ts`
   - expense, finance, stocktake, customer, permission tests if time allows.
2. Run a production build.
3. If the build is clean, commit the current project as a commercial hardening baseline.
4. Push to GitHub.
5. Tag the baseline, for example:

```text
v0.9-commercial-baseline-2026-06-30
```

6. Continue commercial hardening from this baseline one task at a time.

## Next Task

Data safety baseline:

- Inventory all Firestore store-scoped collections.
- Document which module owns each collection.
- Identify legacy/global paths that can still pollute data.
- Define backup and restore rehearsal steps.
- Prepare role and rules hardening plan.
