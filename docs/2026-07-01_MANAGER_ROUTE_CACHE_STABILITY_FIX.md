# 2026-07-01 店长模块页面返回数据跳变修复

## 问题

店长模块中，点击“刷新云端数据”后同步时间会更新，但历史订单、财务报表、数据概览等页面在强制刷新浏览器时显示正确，切换页面再返回后又会显示旧数据或混乱数据。

## 根因

这些页面的云端刷新是只读报表刷新，但刷新后仍调用 `dataManager.saveData(...)` 写入共享内存缓存。多个店长页面共用同一个 `dataManager` 单例，页面切换返回时又从这个共享缓存初始化或计算，导致 A 页面刚拉到的云端快照可能被 B 页面旧快照覆盖。

## 修复

- `Dashboard.tsx`：数据概览刷新结果只进入当前页面 state；订单、开支、采购、菜品、库存、开支类别都不再写入共享 `dataManager` 缓存。
- `FinancialReports.tsx`：财务报表改用当前页面 state 计算订单、开支、采购、交班和供应商欠款；刷新不再写共享缓存。
- `ExpenseRecords.tsx`：开支记录刷新只更新页面 state；真实新增、删除、票据上传等保存逻辑保持不变。
- `OrderHistoryPage.tsx`：历史订单刷新只更新 `allOrders` 页面 state，不再写全局订单缓存。
- `ShiftHandover.tsx`：交班历史进入页面时从云端读取，不再用旧缓存初始化；提交/清空保存逻辑保持不变。
- `dataSafety.test.ts`：新增/更新防回归规则，店长只读刷新函数不得调用 `dataManager.saveData(...)` 或 `persistLocal: false` 快照写入。

## 验证

- `npm test -- --runTestsByPath src/utils/dataSafety.test.ts --runInBand`
  - 211 passed.
- `npm run build`
  - Compiled successfully.
- 真实可见 Chrome 验证本地生产 build：
  - 页面切换路径：数据概览 -> 历史订单 -> 财务报表 -> 返回数据概览 -> 返回历史订单。
  - 历史订单保持：筛选订单数 `36`，筛选已收金额 `C$ 9650.00`，完成 `35`，取消 `1`。
  - 财务报表保持：营业额 `C$ 9650.00`，完成 `35`，取消整单 `1`。
  - 数据概览保持：营业额 `C$ 9650.00`，完成 `35`，堂食 `8`，Barra `27`，Delivery `0`，取消 `1`。
  - 点击三处“刷新云端数据”按钮后数据保持一致，无弹窗、无控制台 error。

## 证据文件

- `client/output/playwright/manager-cache-route-verify.json`
- `client/output/playwright/manager-refresh-button-verify.json`
- `client/output/playwright/manager-cache-dashboard-1.png`
- `client/output/playwright/manager-cache-dashboard-2-return.png`
- `client/output/playwright/manager-cache-history-1.png`
- `client/output/playwright/manager-cache-history-2-return.png`
- `client/output/playwright/manager-cache-finance-1.png`

## 后续

这次只修复店长模块只读刷新缓存污染，不改 POS 同步链路和真实业务保存逻辑。后续仍按 `COMMERCIAL_ROLLOUT_PLAN.md` 的执行队列继续。
