# 2026-07-02 POS 多设备同步稳定化归档

## 目标
- 今日只处理 POS 主链路，不扩散修改其他业务模块。
- 重点修复：A 设备下单/支付/完成后，B 设备长时间仍停留在旧状态；清台、完成卡住；旧本地缓存导致 POS 列表偶发乱入历史订单。

## 现场证据
- 订单 `0702013` 云端读取结果仍是 `confirmed/unpaid`，没有 `completedAt/clearedAt`。这说明该订单当时的完成/支付动作没有成功写入云端，并不是 Firestore 自身 10 分钟延迟。
- 直接 Firestore 实时测试结果为毫秒级：
  - `confirmed/unpaid`: 写入确认约 527ms，订阅回调约 76ms。
  - `served/paid`: 写入确认约 144ms，订阅回调约 2ms。
  - `completed/paid`: 写入确认约 131ms，订阅回调约 2ms。
- 结论：当前网络/Firestore 并不慢，问题主要在 POS 客户端写入、pending 队列和本地缓存合并链路。

## 本次修改
- `client/src/pages/POS/POS.tsx`
  - POS 页面直接订阅当前日 `pos_orders`，不再只依赖 AppContext 中转，减少多设备状态分段延迟。
  - 下单确认、加菜确认、支付、完成等关键订单动作调用即时发布函数，避免等待批量副作用再同步。
  - 当前日云端订阅返回空数组时，清理本地非待同步的当天旧订单，防止旧缓存把历史/旧状态重新带回 POS 列表。
  - 保留本机 pending 订单，不破坏离线可用规则。
- `client/src/services/smartSyncService.ts`
  - pending 队列对同一订单的 `pos_orders update` 做合并，只保留最新状态，避免旧状态按顺序回放造成“先红、再橙、很久后才完成”的分段延迟。
  - 读取历史 pending 队列时也会自动合并并回写，处理旧版本设备留下的污染队列。
- `client/scripts/serveBuildSpa.mjs`
  - 新增本地生产构建验证用 SPA 静态服务，方便部署前浏览器验证 `/login`、`/pos` 等前端路由。
- `client/src/utils/dataSafety.test.ts`
  - 增加 POS 直接当前日订阅、pending 合并、空云端快照清理旧缓存、即时发布等回归保护。

## 验证结果
- `npm test -- --runTestsByPath src/utils/dataSafety.test.ts --runInBand --watchAll=false`
  - 222 passed。
- `npm run build`
  - Compiled successfully。
  - 构建包：`static/js/main.3b5c676c.js`。
- 本地生产包浏览器验证：
  - `zeng / 123456` 登录 POS 成功。
  - 页面包含 `Mesas`、`Pedidos`。
  - 控制台错误数：0。
- 本地双终端浏览器验证：
  - 临时订单 `0702998`，两个独立浏览器上下文同时接收。
  - 确认状态：A 269ms，B 266ms。
  - 支付状态：A 258ms，B 257ms。
  - 完成状态：A 15ms，B 12ms。
  - 控制台错误数：0。
- Firebase Hosting 已部署：
  - Hosting URL: `https://restaurant-pos-1b420.web.app`
  - 线上加载包：`static/js/main.3b5c676c.js`。
- 线上双终端浏览器验证：
  - 临时订单 `0702998`，两个独立浏览器上下文同时接收。
  - 确认状态：A 272ms，B 272ms。
  - 支付状态：A 264ms，B 264ms。
  - 完成状态：A 5ms，B 6ms。
  - 控制台错误数：0。
- 云端诊断订单清理：
  - `diag leftovers 0`。

## 注意事项
- `0702013` 这类历史卡住单不会被系统自动改写。它的云端状态缺少完成字段，若需要修正，必须按真实业务授权单独处理，避免误改营业数据。
- POS 仍坚持离线可用：本机关键动作先更新本地体验，再排队/发布云端；云端恢复后通过版本和 pending 合并同步。
- 后续如果再出现单张订单卡住，优先读取该订单云端字段：`status/paymentStatus/paidAmount/settledAmount/completedAt/clearedAt/lastModified/version/stockDeduction*`，再判断是历史残留、pending 队列、还是新的写入链路问题。
