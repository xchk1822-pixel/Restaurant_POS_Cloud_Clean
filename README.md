# 🍽️ Restaurant POS System

餐厅连锁POS管理系统 - 支持中西语界面、多店连锁、权限管理

## 📋 功能特性

### 核心功能
- ✅ 多语言支持(中文/西班牙语)
- ✅ 角色权限管理(老板/店长/收银/服务生/厨师/库管)
- ✅ POS收银系统
- ✅ 厨房显示系统(KDS)
- ✅ 库存管理
- ✅ 供应商管理
- ✅ 客户CRM
- ✅ 员工排班
- ✅ 报表分析
- ✅ 离线同步支持
- ✅ 多店连锁管理

### 技术栈
- **Frontend**: React 18 + TypeScript + Redux Toolkit
- **Styling**: TailwindCSS
- **i18n**: i18next
- **Backend**: Node.js + Express
- **Database**: Firebase Firestore
- **Auth**: Firebase Authentication
- **Storage**: Firebase Storage
- **Deployment**: Firebase Hosting

## 🚀 快速开始

### 前置要求
- Node.js >= 18.x
- npm >= 9.x
- Firebase账号

### 1. 安装依赖

#### 前端
```bash
cd client
npm install

后端
cd server
npm install


Restaurant_System_V2/
├── client/                 # React前端应用
│   ├── src/
│   │   ├── components/    # 可复用组件
│   │   │   └── Layout/    # 布局组件
│   │   ├── pages/         # 页面组件
│   │   │   ├── Login/     # 登录页
│   │   │   ├── Dashboard/ # 仪表盘
│   │   │   ├── POS/       # 收银页
│   │   │   ├── Kitchen/   # 厨房显示
│   │   │   └── Inventory/ # 库存管理
│   │   ├── store/         # Redux状态管理
│   │   ├── services/      # API服务
│   │   ├── hooks/         # 自定义Hooks
│   │   ├── locales/       # 国际化文件
│   │   └── types/         # TypeScript类型
│   └── public/            # 静态资源
│
├── server/                # Node.js后端服务
│   └── src/
│       ├── controllers/   # 控制器
│       ├── services/      # 业务逻辑
│       ├── middleware/    # 中间件
│       └── routes/        # 路由
│
├── shared/                # 共享代码
│   └── types/             # 类型定义
│
├── docs/                  # 文档
├── firebase.json          # Firebase配置
├── firestore.rules        # 安全规则
└── README.md

👥 角色权限
角色	权限说明
👑 老板 (Owner)	查看所有店铺、完整管理权限
🏢 区域经理	管理多个店铺、查看报表
🏪 店长	单店完整管理权限
💰 收银员	点餐、收款、查看订单
🍽️ 服务生	点餐、查看订单
👨‍🍳 厨师	厨房订单管理
📦 库管	库存管理
🌍 多语言支持
系统支持中文和西班牙语切换:
中文 (zh-CN)
Español (es-ES)
在右上角点击语言按钮即可切换。
🔐 安全
Firebase Authentication进行用户认证
Firestore安全规则控制数据访问
基于角色的权限控制(RBAC)
HTTPS加密传输
📊 数据库设计
主要集合(Collections):
users - 用户信息
organizations - 组织/公司
stores - 店铺信息
orders - 订单
menuItems - 菜单项
inventory - 库存
suppliers - 供应商
customers - 客户
employees - 员工
shifts - 排班
🚧 开发计划
 项目架构搭建
 用户认证系统
 POS收银界面
 厨房显示系统
 库存管理
 客户CRM完善
 员工排班系统
 高级报表分析
 移动端APP
 外卖平台集成