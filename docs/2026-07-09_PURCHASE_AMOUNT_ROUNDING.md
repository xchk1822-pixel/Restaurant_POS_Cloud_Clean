# 2026-07-09 采购单金额两位小数修复

## 问题

采购单金额由数量和单价直接相乘、直接累加。遇到小数单价时，保存到采购单、现金采购开支、供应商欠款余额的原始数值可能带有浮点尾数或超过两位小数。

## 修复

- 新增 `client/src/pages/Inventory/purchaseCalculations.ts`，统一采购金额规则：
  - 物品单价保留小数点后两位。
  - 看小数点后第三位，第三位大于等于 5 进一位，小于 5 舍去。
  - 行小计使用两位单价计算后再保留两位。
  - 整单总额按行小计累加后再保留两位。
- `PurchaseManagement.tsx` 提交采购单前会再次归一化每一行，确保云端采购单、采购开支、供应商欠款使用同一套金额。
- 供应商欠款重算时也对每张采购单剩余欠款和合计余额做两位小数处理。

## 验证

- `npm test -- --watchAll=false --runInBand src/pages/Inventory/purchaseCalculations.test.ts src/utils/dataSafety.test.ts`
  - 通过：2 个测试文件，256 个测试。
- `npm run build`
  - 通过：`main.d21126da.js`。
- `firebase deploy --only hosting`
  - 已部署到 Firebase Hosting：`https://restaurant-pos-1b420.web.app`
- 真实浏览器验证
  - 店长账号进入生产站库存管理。
  - 点击 `采购入库` 正常显示采购订单管理。
  - 控制台无 error/warning。
  - 截图：`client/output/playwright/purchase-rounding-purchase-tab-verify.png`

## 范围

只修改采购单金额计算链路，未触碰 POS 订单、库存扣减、小票打印、员工管理等其他业务逻辑。
