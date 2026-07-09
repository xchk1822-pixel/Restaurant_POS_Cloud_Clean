# POS Order Completion Weak-Network UX

Date: 2026-06-21
Project: `C:\Users\华为\Desktop\Restaurant_POS_Cloud_Clean`

## Root Cause

- POS完成订单慢的主要原因不是单纯按钮代码卡死，而是完成订单链路必须等待安全库存扣减完成。
- 当前安全链路包括:
  - 先用 Firestore transaction 获取订单库存扣减锁，防止多设备重复扣减。
  - 再强制读取云端 `menu_items`, `inventory_items`, `fridge_inventory` 三个集合，确保用最新库存计算扣减。
  - 再写入冰箱和仓库库存扣减。
  - 最后才把订单标记为 `completed`。
- 这个链路数据更安全，但在尼加拉瓜弱网环境下可能等待 7-8 秒。

## Completed

- Added a visible local finalizing state for POS completion actions.
- Order cards now show `Finalizando inventario...` while stock deduction and cloud work are running.
- Completion buttons are disabled while finalizing, preventing repeated clicks and duplicate operations.
- Changed `completeOrderWithStockDeduction` so `completedOrder` is created only after `deductStockForOrder(order)` returns successfully. This keeps the rule: no successful stock deduction, no completed order status.
- Kept existing offline local queue behavior:
  - Offline stock increments are written locally and saved into pending sync.
  - Offline order updates remain in the POS pending order sync queue.

## Important Offline Boundary

- A single offline device can continue operating with local pending sync.
- Two fully offline devices cannot know each other's newest changes in real time. Absolute multi-device uniqueness is only possible when they can reach the cloud lock.
- The safe design is: local offline queue first, cloud lock/final validation when online, and visible pending-sync state.

## Verification

- RED verified with a failing guard for missing finalizing state.
- GREEN verified with `npm test -- --watchAll=false --runTestsByPath src/utils/dataSafety.test.ts`: 131 tests passed.
- Production build verified with `npm run build`.
- Live browser check: `https://restaurant-pos-1b420.web.app/pos`, login `zeng/123456`, POS loaded with tables and order list; browser console reported 0 errors.

## Deployment

- Deployed Firebase Hosting project `restaurant-pos-1b420`.
- Live URL: `https://restaurant-pos-1b420.web.app`.

## 2026-06-21 Update: Weak-Network Timeout And Conflict Guard

Completed:
- Added weak-network timeout handling in `smartSyncService.ts` for forced cloud reads and POS stock-deduction claim transactions.
- POS completion can now fall back to local pending sync when the cloud lock/read path times out, reducing the 7-8 second stuck feeling on weak Nicaragua networks.
- Inventory field increments now carry a `syncOperationId` and replay through an idempotent transaction, so a late cloud success plus later pending replay should not double-apply the same increment.
- Pending POS order sync now detects a stock deduction operation mismatch and stores a local conflict record under `local_pending_sync_conflicts` instead of silently overwriting the remote terminal state.
- Confirmed business rule from operations: when offline, staff will physically prevent multiple devices from operating the same order. The software still keeps conflict detection as a final safety guard when cloud sync returns.

Verification:
- RED/GREEN regression added in `client/src/utils/dataSafety.test.ts`.
- `npm test -- --watchAll=false --runTestsByPath src/utils/dataSafety.test.ts`: 133 passed.
- `npm run build`: compiled successfully.
- Static production build browser check at `http://127.0.0.1:52341/`: HTTP 200, login content visible, 0 console errors.

Remaining:
- Later cleanup recommended: `smartSyncService.ts` has legacy mojibake comments/log strings from earlier encoding passes. Runtime build is clean, but source readability should be cleaned in a separate controlled pass.

Deployment:
- `firebase deploy --only hosting`: deployed to `https://restaurant-pos-1b420.web.app`.
- Live browser check: HTTP 200, login content visible, 0 console errors.

## 2026-06-21 Update: Table State Publish After Payment Cancel Clear

Problem:
- Device A could clear or cancel an order locally, but Device B could remain on the old table state even after refresh.
- Root cause: POS table changes for `needs_cleaning` and `available` were using local `setTables(...)` without calling `markTableUserEdit()`. The existing table cloud publisher intentionally ignores non-user edits unless this flag is set, so the changed table state was not written to `pos_tables`.

Completed:
- Added `markTableUserEdit()` before table release after completed dine-in clear.
- Added `markTableUserEdit()` and `lastModified` when a fully paid dine-in order moves the table to `needs_cleaning`.
- Added `markTableUserEdit()` before table release after full order cancellation.
- Added `reconcileTableStatusFromOrders(...)` so stale cloud table documents can be corrected from authoritative order status. This handles older stuck states created before this fix.
- Added a table/order reconciliation effect that runs when either orders or tables change. If cloud tables arrive after orders, the client can still release or mark the table correctly and publish the corrected table state.
- Added a regression guard in `client/src/utils/dataSafety.test.ts` so future edits cannot silently skip cloud publishing for these terminal table states.

Verification:
- RED: `npm test -- --watchAll=false --runTestsByPath src/utils/dataSafety.test.ts -t "POS table status changes"` failed before the POS fix because the clear-table block lacked `markTableUserEdit()`.
- GREEN: same targeted test passed after the POS fix.
- Full guard suite: `npm test -- --watchAll=false --runTestsByPath src/utils/dataSafety.test.ts` passed, 134 tests.
- Production build: `npm run build` compiled successfully.
- Firebase deploy: `firebase deploy --only hosting` completed for `restaurant-pos-1b420`.
- Live browser check: `https://restaurant-pos-1b420.web.app/pos` opened after `zeng/123456` login, POS tables and order list rendered, console reported 0 errors.

Additional self-heal verification:
- RED: `npm test -- --watchAll=false --runTestsByPath src/utils/dataSafety.test.ts -t "POS table status changes|cancelled orders are frozen"` failed until the reconciliation helper/effect existed.
- GREEN: same targeted test passed.
- Full guard suite passed again, 134 tests.
- Production build passed again after the self-heal update.
- Firebase Hosting deployed again after self-heal update.
- Live POS browser check passed again: login `zeng/123456`, `/pos` rendered tables and order list, browser console reported 0 errors.

Scope:
- This pass only fixes table-state publishing for payment, cancellation, and clear-table terminal states.
- It does not change inventory formulas, order status rules, or UI layout.
