# 2026-07-08 POS 订单列表空白保护

## 问题
- 用户反馈另一终端 POS 订单列表空白，且多设备同步异常。
- 线上真实浏览器登录 `zeng/123456` 验证，Bluefields 云端订单仍可读取，当前日订单 22 单显示正常，说明 Firestore 订单数据未丢失。

## 根因
- POS 当前日订单订阅收到空快照时，会把本地当前日订单替换为空。
- 同样逻辑存在两层：
  1. `smartSubscribeToPosOrdersByDatePrefix` 会用空 `activeData` 覆盖本地当前日订单缓存。
  2. `POS.tsx` 和 `AppContext.tsx` 收到空数组后会清掉当前日订单状态。
- 在多终端、刷新、网络波动、订阅瞬间空返回时，会出现某台终端订单列表空白。

## 修复
- 空的当前日订单快照不再覆盖本地 POS 订单缓存。
- POS 页面收到空当前日快照时保留本地订单。
- AppContext 收到空当前日快照时保留本地订单。

## 验证
- 线上真实浏览器登录 `zeng/123456` 到 POS：
  - 分店：Bluefields
  - storeId：`store_1776725610354`
  - 本地缓存键：`store_store_1776725610354_pos_orders`
  - 当前订单数：22
  - 页面订单列表显示 0708001 至 0708022
- 自动化回归：
  - `npm test -- --runTestsByPath src/utils/dataSafety.test.ts --watchAll=false --testNamePattern "current-day|POS page subscribes|app context subscribes"`
  - 6 个相关用例通过。
- `npm run build` 成功。

## 操作建议
- 部署后空白终端刷新页面或退出重登即可从云端重新读取当前日订单。
- 该修复不会改订单、支付、库存、小票打印逻辑。

## 2026-07-08 follow-up: Firestore cache assertion and empty POS order list recovery

Symptoms verified:
- User terminal could show an empty POS `Pedidos` list after refresh or cache clearing.
- Browser error included `FIRESTORE (12.14.0) INTERNAL ASSERTION FAILED` from the Firestore persistent local cache path.
- A real browser check on production confirmed cloud orders still existed for the active store; the failure was local session/cache/query recovery, not deleted orders.

Precise fixes:
- Firestore initialization now uses `memoryLocalCache()` instead of IndexedDB persistent cache. The app's offline durability remains in store-scoped `localStorage` plus `pending_firestore_changes` in `smartSyncService`.
- POS current-day order subscription still refuses to replace local orders with an empty cloud snapshot.
- When the current-day snapshot is empty, `smartSubscribeToPosOrdersByDatePrefix` performs a one-time recent-orders server fallback and repopulates the latest day prefix instead of leaving the POS list blank.

Verification:
- `npm test -- --runTestsByPath src/utils/dataSafety.test.ts --watchAll=false --testNamePattern "firebase initialization|current-day|POS page subscribes|app context subscribes"`
- `npm run build`

## 2026-07-08 follow-up: POS menu route return cleared today's order list

Reproduction:
- Open production POS with `zeng/123456`: `Total pedidos: 22`, local 0708 orders present.
- Open the POS full-screen function menu, click `库存管理`, then open the menu and click `POS 收银`.
- Before the fix, POS returned with `Total pedidos: 0`, `Sin pedidos`, and local 0708 cached orders had been removed.

Root cause:
- `filterCachedOrdersForStartup` removed current-day non-pending orders during POS mount.
- On route return, the POS local save effect immediately persisted that filtered historical-only list back to store-scoped localStorage before the cloud snapshot restored the current day.

Precise fix:
- `filterCachedOrdersForStartup` now preserves cached orders on POS mount. Current-day deletion/reconciliation remains the responsibility of the cloud current-day subscription after it arrives.
- Added regression coverage so POS route return cannot delete current-day cached orders before a cloud snapshot arrives.

Verification:
- `npm test -- --runTestsByPath src/utils/dataSafety.test.ts --watchAll=false --testNamePattern "route return|startup cache merge|current-day|POS page subscribes|app context subscribes"`
- `npm run build`
