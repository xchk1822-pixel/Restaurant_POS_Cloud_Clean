# 2026-07-02 POS 离线优先完成/支付修复

## 背景
- 实际使用中，POS 点击完成订单或清台后会卡住 8-10 秒，弱网时甚至 5 分钟后仍停留在 `Pagado` 橙色状态。
- 两台设备同时看到同一订单未完成时，说明不是单端刷新问题，而是云端订单本身没有进入 `completed`。
- 系统硬性规则：前台 POS 必须离线可用，不能因为云端、库存扣减、网络抖动而阻塞继续营业。

## 根因
- 原热路径把订单完成、云端发布、库存扣减串在一起，弱网时 UI 会被云端/库存链路拖住。
- 第一次离线优先修复后，完成订单发布与库存扣减仍并发启动；在弱网或竞争条件下，库存失败标记可能先写云端，而完成状态发布未成功，导致云端停在 `served + paid`。
- 现场证据：`0702008` 云端是 `completed/paid`，但 `0702009` 云端仍是 `served/paid`，且没有 `completedAt/clearedAt`。

## 本次修复
- `client/src/pages/POS/POS.tsx`
  - 完成订单/清台继续保持离线优先：先本地标记 `completed`，释放桌台并关闭操作。
  - 后台同步顺序调整为：先发布或排队完整的 `completedOrder`，再开始库存扣减。
  - 库存扣减失败时，失败标记也必须携带 `status/paymentStatus/paidAmount/settledAmount/completedAt/clearedAt`，不能把云端订单留在 `served + paid`。
  - 后台库存成功后继续发布带 `stockDeducted` 的完成订单。
  - 支付按钮保留同步锁 `paymentProcessingRef`，避免弱网下重复点击造成多次支付。
- `client/src/utils/dataSafety.test.ts`
  - 增加/更新回归保护：确认下单不扣库存；完成后必须用 `completedOrder` 扣库存；库存扣减必须在完成订单发布之后。

## 业务规则确认
- POS 前台关键动作不强依赖云端，弱网/离线时先本机可用。
- 订单完成后才扣库存，规则不变。
- 库存扣减继续保留幂等锁和流水，避免重复扣减。
- 已经卡在云端旧状态的历史订单不会被部署自动改写，需要人工确认后重试完成或单独修复云端状态。

## 验证
- `npm test -- --runTestsByPath src/utils/dataSafety.test.ts --runInBand --watchAll=false`
  - 218 passed。
- `npm run build`
  - Compiled successfully。
- 浏览器验证本地构建：
  - `zeng / 123456` 登录成功。
  - 页面加载正常，无控制台错误。
- 部署：
  - `firebase deploy --only hosting`
  - Hosting URL: `https://restaurant-pos-1b420.web.app`
- 部署后线上浏览器验证：
  - 新包 `main.5169879b.js` 已加载。
  - `zeng / 123456` 登录成功。
  - 页面加载正常，无控制台错误。

## 后续注意
- `0702009` 当前云端仍是旧状态：`served/paid`，没有 `completedAt/clearedAt`。这张旧单需要用户确认后再单独处理，不能自动修改历史数据。
- 后续如继续发现单张订单异常，应先读取云端订单状态、`lastModified/version/completedAt/clearedAt/stockDeduction*` 字段，再决定是否是历史残留、弱网待同步，或新链路问题。

## 二次修复：POS 多设备状态分段延迟
- 现象：A 设备下单/支付后，B 设备约 4 分钟后才看到红色状态，再过几分钟才看到橙色待完成状态。
- 判断：不是简单的实时订阅关闭，而是 POS 订单写入超过弱网超时时进入 pending 队列后，同一订单的多个旧状态可能被重复排队，云端恢复时按旧状态逐个重放。
- 修复：
  - `client/src/services/smartSyncService.ts`
    - `savePendingChange` 对 `pos_orders + update + 同一订单 id` 做合并，只保留最新待同步状态。
    - 避免同一订单的 `confirmed -> paid -> completed` 旧状态在 pending 队列里慢慢重放。
  - `client/src/utils/dataSafety.test.ts`
    - 增加回归测试：POS pending 订单更新必须合并，且在 push 新 pending 之前先移除同订单旧 pending。
- 验证：
  - `npm test -- --runTestsByPath src/utils/dataSafety.test.ts --runInBand --watchAll=false`
    - 219 passed。
  - `npm run build`
    - Compiled successfully。
  - `firebase deploy --only hosting`
    - Hosting URL: `https://restaurant-pos-1b420.web.app`
  - 线上浏览器验证：
    - 新包 `main.10fa5bb1.js` 已加载。
    - `zeng / 123456` 登录成功。
    - 控制台无 error/warning。

## 三次验证：当前不是云端弱网
- 用户质疑：当前网络播放视频流畅，订单数据只有几 KB，不能把问题简单归因为弱网。
- 实测方式：
  - 使用 `zeng@restaurant.local / 123456` 登录 Firebase。
  - 在 `stores/store_1776725610354/pos_orders` 写入临时诊断订单 `diag-sync-*`。
  - 依次写入 `confirmed/unpaid`、`served/paid`、`completed/paid`。
  - 同时监听同一个诊断文档的 `onSnapshot`，记录写入确认和订阅回调延迟。
  - 测试完成后删除诊断订单，不影响真实营业数据。
- 实测结果：
  - `confirmed/unpaid`：写入确认 527ms，订阅看到 76ms。
  - `served/paid`：写入确认 144ms，订阅看到 2ms。
  - `completed/paid`：写入确认 131ms，订阅看到 2ms。
- 结论：
  - 当前 Firestore 写入和实时订阅是毫秒级，不支持“云端弱网导致 4 分钟延迟”的判断。
  - `WEAK_NETWORK_TIMEOUT_MS = 4500` 只是代码中的超时兜底定义，不是现场网络诊断结论。

## 三次修复：历史 pending 队列读取即合并
- 风险：如果某台设备旧版本已经留下同一订单多个 pending 状态，单纯修复新增 pending 去重不足以清掉旧队列。
- 修复：
  - `client/src/services/smartSyncService.ts`
    - 新增 `coalescePendingChanges`。
    - `getPendingChanges` 读取历史 pending 时自动合并 `pos_orders + update + 同一订单 id`，只保留最新状态，并回写本地 pending 队列。
    - `savePendingChange` 也复用同一个合并函数。
  - `client/src/utils/dataSafety.test.ts`
    - 回归测试覆盖新增 pending 合并和历史 pending 读取清理。
- 验证：
  - `npm test -- --runTestsByPath src/utils/dataSafety.test.ts --runInBand --watchAll=false`
    - 219 passed。
  - `npm run build`
    - Compiled successfully。
  - `firebase deploy --only hosting`
    - Hosting URL: `https://restaurant-pos-1b420.web.app`
  - 线上浏览器验证：
    - 新包 `main.915e49f8.js` 已加载。
    - `zeng / 123456` 登录成功。
    - 控制台无 error/warning。
