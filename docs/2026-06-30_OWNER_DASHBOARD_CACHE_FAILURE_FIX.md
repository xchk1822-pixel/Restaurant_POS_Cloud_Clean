# 2026-06-30 老板后台刷新失败修复

## 问题

老板后台打开后提示“刷新老板仪表板失败，请检查网络后重试”，看不到数据。

## 排查结果

- 使用老板账号 `admin` 验证 Firestore：
  - 账号角色为 `super_admin`。
  - 可以读取 `stores`。
  - 可以读取 Bluefields 分店下的 `pos_orders`、`expenses`、`purchase_orders`、`employees` 等集合。
- 因此这次不是 Firestore 权限问题，也不是云端数据不存在。
- Bluefields 当前订单约 1295 条，老板后台一次聚合缓存约 2.68 MB。浏览器如果已有 POS、库存、图片等本地缓存，`owner_dashboard_cache_v1` 写入可能触发 localStorage 配额限制。

## 根因

老板后台原逻辑把“写入本地缓存”和“更新页面状态”放在同一个 `try` 中，并且先写缓存：

1. 云端数据读取成功。
2. `localStorage.setItem(CACHE_KEY, JSON.stringify(nextCache))`。
3. 再 `setStores/setOrders/...` 更新界面。

如果第 2 步因为浏览器本地缓存配额失败，后面的页面状态不会更新，外层捕获后显示网络刷新失败，造成“云端数据明明能读，但页面没数据”。

## 修改

- `client/src/pages/Dashboard/OwnerDashboard.tsx`
  - 新增 `applyOwnerDashboardCache(nextCache)`。
  - 云端数据读取成功后先更新页面状态。
  - 本地缓存写入单独 `try/catch`，失败只 `console.warn`，不阻断页面显示。

- `client/src/utils/dataSafety.test.ts`
  - 新增回归测试：老板后台缓存配额失败不能阻断已经读取成功的云端数据展示。

## 验证

- `npm test -- --runTestsByPath src/utils/ownerDashboardData.test.ts --watchAll=false`
  - 7 passed
- `npm test -- --runTestsByPath src/utils/dataSafety.test.ts --watchAll=false`
  - 190 passed
- `npm run build`
  - Compiled successfully

## 为什么会“改这个破坏那个”

这套系统历史上多个模块共用 `smartSyncService`、`dataManager`、`localStorage`、Firestore 路径和权限逻辑。一个共享层的超时、缓存或路径策略变化，会影响 POS、库存、老板后台等多个界面。后续必须继续坚持小范围修改、先定位链路、加回归测试，再部署验证。
