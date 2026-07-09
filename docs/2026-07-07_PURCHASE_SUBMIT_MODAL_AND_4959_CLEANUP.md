# 2026-07-07 采购提交窗口与 4959 重复单清理

## 本次范围
- 精准修复采购入库提交成功后弹窗仍停留的问题。
- 清理采购单号 `4959` 的重复采购入库单。
- 未修改 POS、库存扣减、财务报表、员工等无关模块逻辑。

## 问题原因
- `PurchaseManagement.tsx` 的采购提交成功路径中，成功 `alert` 在关闭弹窗之前执行。
- 浏览器原生 `alert` 会阻塞后续代码，导致成功提示弹出时采购窗口仍挂着，容易让操作员误判为未关闭并重复操作。

## 修复内容
- 将成功路径调整为先执行：
  - `setShowNewOrderModal(false)`
  - `setNewOrder(...)`
- 再执行成功提示 `alert(...)`。
- 增加回归测试，要求采购提交成功提示必须在关闭弹窗和清空表单之后。

## 数据清理
- dry-run 确认 `4959` 在 Bluefields 分店有两张相同采购单。
- 保留：`po-1783471730275`
- 删除重复：`po-1783471744571`
- 回滚重复入库库存：
  - `Extra8*8 包装盒`
  - itemId `6909876398784`
  - 数量 `-100`
- 开支记录只匹配到一条 `purchase-expense-po-1783471730275`，未删除开支。
- 清理后复查：`4959` 只剩一张采购单，开支 1 条，总额 354。

## 验证
- `npm test -- --runTestsByPath src/utils/dataSafety.test.ts --watchAll=false --testNamePattern="purchase order submit is locked"` 通过。
- `npm run build` 通过。
- `firebase deploy --only hosting` 已部署到 `https://restaurant-pos-1b420.web.app`。
- 浏览器验证：
  - zeng 店长账号进入线上库存页。
  - 采购入库入口可见。
  - 新建采购单弹窗可打开。
  - `提交采购单` 按钮可见。
  - 控制台错误数为 0。
  - 线上包为 `/static/js/main.ee897270.js`。
