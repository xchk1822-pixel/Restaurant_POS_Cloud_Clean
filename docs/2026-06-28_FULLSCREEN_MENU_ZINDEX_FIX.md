# 2026-06-28 全屏功能菜单点击无反应修复

## 问题
- 在 POS / 厨房 / 服务生等全屏界面，点击左上角功能菜单后，菜单可以显示。
- 但实际点击菜单里的其他模块时，偶发无法跳转，体验像“所有模块没反应”。
- 复测发现更深一层现象：地址栏已经变成 `/inventory`，但页面仍停留在 POS 主界面，桌台和订单列表没有卸载。

## 根因
- 全屏功能菜单遮罩层使用 `zIndex: 999`，菜单按钮使用 `zIndex: 1000`。
- POS 内部业务弹窗也使用 `zIndex: 1000` 或更高。
- 当 POS 有客户选择、桌台操作、取消授权等弹窗状态时，功能菜单视觉上能出现，但点击事件可能被业务弹窗层拦截。
- 线上 POS 页面数据量较大、实时状态更新频繁时，全屏菜单使用 React Router 的 SPA `navigate(path)` 后，浏览器 URL 会变化，但 POS 路由组件偶发仍保持挂载；手动触发 `popstate` 也不能修复，完整页面导航 `window.location.assign(path)` 可以稳定切换。

## 修改
- 仅修改 `client/src/components/Layout/MainLayout.tsx`：
  - 左上角功能菜单按钮：`zIndex: 1000002`
  - 全屏功能菜单遮罩：`zIndex: 1000001`
  - 全屏功能菜单跳转改为硬导航：`window.location.assign(path)`，避免 URL 改了但 POS 页面继续显示。
- 普通后台左侧菜单仍使用原来的 SPA `navigate(path)`。
- 未修改点餐逻辑。
- 未修改客户选择逻辑，仍保持“点击桌子或新建订单后选择客户 / 新建客户 / 跳过”。
- 未修改订单、库存、支付、云端同步逻辑。

## 回归测试
- 在 `client/src/utils/dataSafety.test.ts` 增加回归测试：
  - `fullscreen function menu stays above POS modal layers`
  - `fullscreen function menu uses hard navigation so POS cannot remain mounted after URL changes`
- 已验证硬导航测试先失败，修改后通过。

## 验证
- `npm test -- --runTestsByPath src/utils/dataSafety.test.ts --watchAll=false -t "fullscreen function menu uses hard navigation|fullscreen function menu stays above"` 通过。
- `npm run build` 通过，生成 `main.b0510649.js`。
- 本地 `http://localhost:52343/pos` 验证：
  - 打开功能菜单后点击“库存管理”跳转 `/inventory`。
  - 页面显示库存内容，POS 的 `Mesas` 桌台内容不再残留。
- 线上 `https://restaurant-pos-1b420.web.app/pos` 验证：
  - 打开功能菜单后点击“库存管理”跳转 `/inventory`。
  - 打开功能菜单后点击“供应商管理”跳转 `/suppliers`。
  - 打开功能菜单后点击“店长管理”跳转 `/manager`。
  - 上述页面均不再残留 POS 的 `Mesas` 桌台内容。
  - 控制台无 error/pageerror。

## 部署
- 已执行 `firebase deploy --only hosting`。
- Firebase Hosting 项目：`restaurant-pos-1b420`。
