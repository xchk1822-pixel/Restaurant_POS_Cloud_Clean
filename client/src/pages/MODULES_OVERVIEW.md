# 餐厅管理系统 - 模块架构总览

## 📂 项目整体结构

```
Restaurant_System_V2/
├── client/                          # 前端 React 应用
│   └── src/
│       ├── pages/                   # 页面组件
│       │   ├── Inventory/          # 📦 库存管理模块
│       │   ├── Employees/          # 👥 员工管理模块
│       │   ├── POS/                # 💰 POS收银模块
│       │   ├── Manager/            # 🏢 店长管理模块
│       │   ├── Kitchen/            # 👨‍🍳 厨房显示模块
│       │   ├── Dashboard/          # 📊 仪表盘
│       │   ├── Reports/            # 📈 报表中心
│       │   ├── Customers/          # 🤝 客户管理
│       │   └── Login/              # 🔐 登录页面
│       ├── components/             # 通用组件
│       ├── contexts/               # React Context
│       ├── services/               # 服务层
│       └── types/                  # TypeScript 类型定义
├── server/                         # 后端 Express 应用（预留）
└── shared/                         # 共享代码
```

## 🎯 核心模块说明

### 1. 📦 库存管理模块 (`/client/src/pages/Inventory/`)

**文件结构**:
```
Inventory/
├── Inventory.tsx                 # 库存物品管理 + 出入库记录
├── PurchaseManagement.tsx        # 采购管理（订单 + 供应商）
├── MenuManagement.tsx            # 菜品管理（独立页面）
├── FridgeStocktake.tsx           # 冰箱盘点（独立页面）
├── WarehouseStocktake.tsx        # 仓库盘点（独立页面）
└── README.md                     # 详细说明文档
```

**核心功能**:
- ✅ 库存物品管理（增删改查、分类、条形码）
- ✅ 采购订单管理（创建、审核、入库）
- ✅ 供应商管理
- ✅ 菜品管理（配方、图片、扣减方式配置）
- ✅ 冰箱盘点（扫码录入、差异分析）
- ✅ 仓库盘点
- ✅ 库存调拨（仓库 ↔ 冰箱）
- ✅ 出入库记录查询

**关键特性**:
- 🔄 销售订单优先从冰箱扣减库存，不足部分从仓库扣减
- 📊 完整的盘点流程和历史记录
- 🖼️ 菜品图片上传和管理
- 📱 支持扫码录入（条形码）

**详细文档**: [Inventory/README.md](./Inventory/README.md)

---

### 2. 👥 员工管理模块 (`/client/src/pages/Employees/`)

**文件结构**:
```
Employees/
├── Employees.tsx                 # 主入口（整合所有子组件）
├── EmployeeList.tsx              # 员工档案管理
├── AttendanceManagement.tsx      # 考勤管理
├── LoanManagement.tsx            # 借款管理
├── SalarySettlement.tsx          # 薪资结算
└── README.md                     # 详细说明文档
```

**核心功能**:
- ✅ 员工档案管理（基本信息、薪资配置）
- ✅ 考勤管理（打卡、工时计算）
- ✅ 借款管理（借款记录、现金流）
- ✅ 薪资结算（自定义时间段、自动计算）
- ✅ 社保管理（个人/公司缴纳）
- ✅ 借款自动扣除（不超过工资30%）

**关键特性**:
- 💰 每人不同的薪资配置（日薪、加班费、福利、补贴）
- 📅 支持任意时间段的薪资结算
- 💸 借款与薪资自动关联
- 📊 完整的现金流记录

**详细文档**: [Employees/README.md](./Employees/README.md)

---

### 3. 💰 POS收银模块 (`/client/src/pages/POS/`)

**主要文件**:
- `POS.tsx` - 收银员界面
- `WaiterInterface.tsx` - 服务员点餐界面
- `KitchenDisplay.tsx` - 厨房显示（已移至 Kitchen 模块）

**核心功能**:
- ✅ 桌台管理
- ✅ 点餐下单
- ✅ 多种支付方式（现金、刷卡、混合支付）
- ✅ 多币种支持（NIO、USD）
- ✅ 订单管理（加菜、退菜、改价）
- ✅ 分账功能
- ✅ 实时库存扣减

**关键特性**:
- 🌍 支持尼加拉瓜科多巴（NIO）和美元（USD）
- 💱 实时汇率转换
- 🔄 销售时自动扣减库存（优先冰箱）
- 📱 支持服务员移动点餐

---

### 4. 🏢 店长管理模块 (`/client/src/pages/Manager/`)

**主要文件**:
- `ManagerDashboard.tsx` - 店长数据概览
- `ShiftHandoverPage.tsx` - 交班对账
- `ExpenseRecordsPage.tsx` - 开支记录
- `FinancialReports.tsx` - 财务报表
- `OrderHistoryPage.tsx` - 订单历史
- `StoreMenuManager.tsx` - 分店菜单管理
- `Stores.tsx` - 分店管理
- `ExchangeRateSettings.tsx` - 汇率设置

**核心功能**:
- ✅ 数据概览（今日营收、订单数、客流量）
- ✅ 交班对账（班次交接、现金清点）
- ✅ 开支记录（日常支出管理）
- ✅ 财务报表（营收统计、利润分析）
- ✅ 订单历史查询
- ✅ 分店管理（多店支持）
- ✅ 汇率设置

**关键特性**:
- 📊 实时数据看板
- 💰 完整的财务流程（收款、支出、对账）
- 🏪 多分店统一管理
- 💱 全局汇率配置

---

### 5. 👨‍🍳 厨房显示模块 (`/client/src/pages/Kitchen/`)

**主要文件**:
- `Kitchen.tsx` - 厨房订单显示

**核心功能**:
- ✅ 实时订单显示
- ✅ 订单状态管理（待制作、制作中、已完成）
- ✅ 叫号功能
- ✅ 订单优先级排序

**关键特性**:
- 🖥️ 大屏显示优化
- ⏱️ 制作时长统计
- 🔔 新订单提醒

---

### 6. 📊 其他模块

#### Dashboard（仪表盘）
- 系统概览
- 快捷操作入口
- 关键指标展示

#### Reports（报表中心）
- 销售报表
- 库存报表
- 员工报表
- 财务报表

#### Customers（客户管理）
- 客户档案
- 消费记录
- 会员管理

#### Login（登录）
- 用户认证
- 角色权限管理
- 分店选择

---

## 🔄 数据流架构

```
┌─────────────────────────────────────┐
│         AppContext (全局状态)        │
│  - inventoryItems (库存物品)         │
│  - menuItems (菜品)                  │
│  - orders (订单)                     │
│  - employees (员工)                  │
│  - fridges (冰箱)                    │
│  - deductStock() (库存扣减)          │
│  - addStock() (库存增加)             │
└──────────────┬──────────────────────┘
               │
    ┌──────────┼──────────┬──────────┐
    │          │          │          │
    ▼          ▼          ▼          ▼
┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐
│Inventory│ │  POS   │ │Employees│ │Manager │
│ Module │ │ Module │ │ Module  │ │ Module │
└────────┘ └────────┘ └────────┘ └────────┘
    │          │          │          │
    └──────────┴──────────┴──────────┘
               │
               ▼
    ┌─────────────────────┐
    │   localStorage      │
    │  (数据持久化)        │
    └─────────────────────┘
```

---

## 🎨 UI布局规范

### 标准页面布局
所有模块遵循统一的布局规范：

```tsx
<div style={{ 
  height: '100vh',           // 固定视口高度
  display: 'flex',           // Flexbox 布局
  flexDirection: 'column',   // 垂直排列
  overflow: 'hidden'         // 禁止整体滚动
}}>
  {/* 头部区域 - 固定 */}
  <header style={{ flexShrink: 0 }}>
    标题、按钮等
  </header>
  
  {/* 内容区域 - 可滚动 */}
  <main style={{ flex: 1, overflowY: 'auto' }}>
    表格、列表等
  </main>
</div>
```

**优势**:
- ✅ 页面整体不滚动
- ✅ 自适应屏幕宽高
- ✅ 只有内容区域可以滚动
- ✅ 头部和按钮保持固定

---

## 🔧 技术栈

### 前端
- **React 19.2.4** - UI框架
- **TypeScript** - 类型系统
- **React Router** - 路由管理
- **React Context** - 状态管理
- **localStorage** - 本地数据持久化

### 后端（预留）
- **Express** - Node.js Web框架
- **TypeScript** - 类型系统

### 数据库（预留）
- **Firebase Firestore** - 云数据库

---

## 📝 开发规范

### 1. 组件拆分原则
- 每个功能模块独立文件夹
- 复杂模块拆分为多个子组件
- 主入口文件负责整合和状态管理
- 子组件通过 props 接收数据

### 2. 命名规范
- 文件名：PascalCase（如 `EmployeeList.tsx`）
- 组件名：PascalCase（如 `EmployeeList`）
- 变量名：camelCase（如 `employeeList`）
- 常量名：UPPER_SNAKE_CASE（如 `MAX_STOCK`）

### 3. 数据持久化
- 全局状态使用 `AppContext`
- 需要持久化的数据存储到 `localStorage`
- 键名统一使用 snake_case（如 `inventory_items`）

### 4. 样式规范
- 使用 inline styles（对象形式）
- 统一的颜色值（如 `#3b82f6` 蓝色）
- 统一的间距（如 `1rem`, `1.5rem`）
- 统一的圆角（如 `0.5rem`, `1rem`）

---

## 🚀 快速开始

### 安装依赖
```bash
cd client
npm install
```

### 启动开发服务器
```bash
npm start
```

### 访问地址
- 前端：http://localhost:3000
- 后端：http://localhost:5000（预留）

---

## 📚 模块详细文档

- [库存管理模块](./Inventory/README.md)
- [员工管理模块](./Employees/README.md)

---

## 🎯 后续规划

### 短期目标
- [ ] 完善报表功能
- [ ] 添加数据导出（Excel、PDF）
- [ ] 优化移动端体验
- [ ] 添加打印功能

### 中期目标
- [ ] 接入 Firebase 云端同步
- [ ] 实现多用户协作
- [ ] 添加数据分析功能
- [ ] 集成第三方支付

### 长期目标
- [ ] 开发移动端 App
- [ ] AI 智能推荐（菜品、库存）
- [ ] 供应链管理系统
- [ ] 连锁加盟管理

---

## 💡 最佳实践

### 1. 模块化设计
- 每个模块职责单一
- 组件可复用
- 易于测试和维护

### 2. 状态管理
- 全局状态放在 `AppContext`
- 局部状态使用 `useState`
- 避免 prop drilling

### 3. 性能优化
- 使用 React.memo 优化渲染
- 合理使用 useMemo 和 useCallback
- 懒加载大型组件

### 4. 错误处理
- 统一的错误提示
- 友好的用户反馈
- 完善的日志记录

---

## 🤝 团队协作

### Git 工作流
```bash
# 创建功能分支
git checkout -b feature/新功能名称

# 提交代码
git add .
git commit -m "feat: 添加XXX功能"

# 推送到远程
git push origin feature/新功能名称

# 合并到主分支（通过 Pull Request）
```

### Commit 规范
- `feat:` 新功能
- `fix:` 修复bug
- `docs:` 文档更新
- `style:` 代码格式
- `refactor:` 重构
- `test:` 测试相关
- `chore:` 构建/工具链

---

## 📞 技术支持

如有问题，请查看：
1. 各模块的 README.md 文档
2. 代码注释
3. 控制台日志（Console）

---

**最后更新**: 2024年4月16日
**版本**: v2.0
