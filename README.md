# Restaurant POS Cloud Clean

正式维护项目：餐厅连锁点餐与管理系统。

## 当前准则

- 本仓库是唯一代码来源：`Restaurant_POS_Cloud_Clean`
- 线上地址：`https://restaurant-pos-1b420.web.app`
- 部署目标：Firebase Hosting，发布目录为 `client/build`
- 真实业务数据必须按分店隔离，不能写入裸全局业务集合
- 低频后台模块以手动刷新为主，POS/厨房等高频协作模块保留实时同步
- 修改后必须测试、构建、部署、线上验证并更新进度文档

## 常用命令

```powershell
cd client
npm install
npx.cmd tsc --noEmit --pretty false
npm.cmd test -- --watchAll=false
npm.cmd run build
cd ..
firebase.cmd deploy --only hosting --non-interactive
```

## 当前文档入口

- 执行计划：[docs/2026-06-11_EXECUTION_PLAN.md](docs/2026-06-11_EXECUTION_PLAN.md)
- 最新进度：[docs/2026-06-15_PROGRESS.md](docs/2026-06-15_PROGRESS.md)
- 商用版需求草案：[docs/COMMERCIAL_V3_REQUIREMENTS.md](docs/COMMERCIAL_V3_REQUIREMENTS.md)
- 数据模型草案：[docs/V3_DATA_MODEL_DRAFT.md](docs/V3_DATA_MODEL_DRAFT.md)

旧的根目录历史文档已清理，避免继续误导后续维护。
