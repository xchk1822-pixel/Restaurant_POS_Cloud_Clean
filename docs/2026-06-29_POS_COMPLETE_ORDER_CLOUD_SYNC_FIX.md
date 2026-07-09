# 2026-06-29 POS 完成订单云端同步修复

## 问题

前端 POS 偶发出现 A 设备点击完成订单后，B 设备长期仍显示橙色待完成状态。

已核对订单 `0629048`、`0629049`、`0629050`、`0629051` 的 Firestore 云端记录：这些订单云端仍停留在 `confirmed/unpaid`，没有 `completedAt`、`clearedAt`、`lastPaidAt`、`stockDeductedAt` 等终态字段。因此问题不是整体实时订阅失效，而是这几单当时完成后的最终订单状态没有稳定写入云端。

## 根因

完成订单链路原来是：

1. 扣减库存。
2. 本地订单先改成 `completed`。
3. 桌台本地释放。
4. 使用后台异步 `queueOrderPublish(completedOrder)` 写云端。

这会导致弱网或写入超时时，本机界面已经显示完成，但云端仍是旧订单状态，其他设备刷新也只能读到旧状态。

## 修改

- `client/src/pages/POS/POS.tsx`
  - 完成订单改为显式 `await publishOrderImmediately(completedOrder)`。
  - 云端写入返回 pending/失败时抛出错误，不再静默提示完成。
  - 删除未使用的 `queueOrderPublish` 后台发布函数，避免以后误用。
  - 客户积分后续处理只在订单终态已确认写云端后继续执行。

- `client/src/utils/dataSafety.test.ts`
  - 更新回归测试，锁定完成订单必须先写云端终态。
  - 保留 pending 写入不能被错误标记为已同步的保护。

## 验证

- `npm test -- --runTestsByPath src/utils/dataSafety.test.ts --watchAll=false`
  - 189 passed
- `npm run build`
  - Compiled successfully

## 注意

本修复防止后续订单再次静默分叉。已经卡住的 `0629048` 到 `0629051` 属于历史云端状态缺失，需要确认真实收款/完成信息后再单独修正云端记录，不能在没有确认支付方式和金额的情况下自动改账。
