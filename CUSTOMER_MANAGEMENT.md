# 客户管理系统完整文档

## 📋 概述

客户管理系统实现了完整的客户关系管理（CRM）功能，包括客户信息管理、会员等级、积分系统、社交账号管理，并与 POS 收银台实现**实时数据互通**。

---

## 🎯 核心功能

### 1. **客户 CRUD 操作**
- ✅ 添加客户（姓名、电话、备注、社交账号）
- ✅ 编辑客户信息
- ✅ 删除客户（带确认提示）
- ✅ 搜索筛选（按姓名/电话）
- ✅ 排序功能（5种方式）

### 2. **会员等级系统**
| 等级 | 积分范围 | 颜色 |
|------|---------|------|
| 🥉 青铜 (Bronze) | 0 - 1,999 | #cd7f32 |
| 🥈 白银 (Silver) | 2,000 - 4,999 | #c0c0c0 |
| 🥇 黄金 (Gold) | 5,000 - 9,999 | #ffd700 |
| 💎 铂金 (Platinum) | 10,000+ | #e5e4e2 |

### 3. **积分管理**
- ✅ 手动增加积分
- ✅ 积分兑换现金（可配置兑换率）
- ✅ 重置积分
- ✅ 积分交易记录

### 4. **社交账号管理**
- 💬 WhatsApp
- 👥 Facebook
- 📷 Instagram
- ✈️ Telegram

### 5. **数据互通**
- ✅ POS 收银台 ↔ 客户管理 实时同步
- ✅ 使用 DataManager 统一数据源
- ✅ 发布/订阅模式自动更新

---

## 🏗️ 技术架构

### 数据模型

```typescript
interface Customer {
  id: string;
  name: string;
  phone: string;
  points: number;
  totalSpent: number;
  visitCount: number;
  createdAt: string;          // ISO 格式
  lastVisitAt?: string;       // ISO 格式
  notes?: string;
  level?: 'bronze' | 'silver' | 'gold' | 'platinum';
  socialAccounts?: {
    whatsapp?: string;
    facebook?: string;
    instagram?: string;
    telegram?: string;
  };
}

interface PointsTransaction {
  id: string;
  customerId: string;
  type: 'earn' | 'redeem' | 'adjust';
  points: number;
  description: string;
  createdAt: string;
}
```

### 数据存储

```typescript
// localStorage 键名
STORAGE_KEYS = {
  CUSTOMERS: 'pos_customers',     // 与 POS 共享
}

// 积分交易记录
localStorage.getItem('points_transactions')
```

### 数据流

```
POS 创建客户
    ↓
dataManager.addData('customers', customer)
    ↓
┌─────────────────────────────┐
│  DataManager                │
│  1. 更新内存缓存             │
│  2. 保存 localStorage       │
│  3. 触发自定义事件           │
│  4. 通知所有订阅者           │
└──────┬──────────┬───────────┘
       │          │
       ↓          ↓
  POS收银台   客户管理
  (自动更新)  (自动更新)
```

---

## 💻 代码实现

### 核心文件

```
client/src/
├── services/
│   └── dataManager.ts              # 统一数据管理服务
├── pages/
│   ├── Manager/
│   │   ├── CustomersModule.tsx     # 客户管理主组件
│   │   └── ManagerCustomers.tsx    # 包装组件
│   └── POS/
│       └── POS.tsx                 # POS收银台（已集成DataManager）
```

### DataManager 使用示例

```typescript
import { dataManager } from '../../services/dataManager';

// 读取数据
const customers = dataManager.getData('customers');

// 订阅变化
useEffect(() => {
  const unsubscribe = dataManager.subscribe('customers', setCustomers);
  return () => unsubscribe();
}, []);

// 添加客户
dataManager.addData('customers', newCustomer);

// 更新客户
dataManager.updateData('customers', customerId, updates);

// 删除客户
dataManager.deleteData('customers', customerId);
```

### POS 集成

```typescript
// POS.tsx
import { dataManager } from '../../services/dataManager';

const [customers, setCustomers] = useState(() => {
  return dataManager.getData('customers');
});

useEffect(() => {
  const unsubscribe = dataManager.subscribe('customers', setCustomers);
  return () => unsubscribe();
}, []);

// 创建客户时使用 DataManager
const handleCreateCustomer = () => {
  const newCustomer = { /* ... */ };
  dataManager.addData('customers', newCustomer);
};
```

---

## 🎨 界面设计

### 统计卡片

```
┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
│总客户数   │ │总积分     │ │总消费     │ │总消费次数 │
│   25     │ │  12,500   │ │C$ 5,680  │ │   156    │
└──────────┘ └──────────┘ └──────────┘ └──────────┘
```

### 客户列表

```
姓名        | 电话      | 等级 | 积分  | 总消费  | 次数 | 最后访问 | 操作
─────────────────────────────────────────────────────────────────────
张三        | 123...    | 黄金 | ⭐5000| C$500  | 10   | 2024/1/15| ✏️⭐💰🔄🗑️
            |           |      |       |         |      |           | 💬👥📷
```

### 操作按钮

| 图标 | 功能 | 颜色 |
|------|------|------|
| ✏️ | 编辑客户 | 蓝色 |
| ⭐ | 管理积分 | 橙色 |
| 💰 | 积分兑换 | 绿色 |
| 🔄 | 重置积分 | 红色 |
| 🗑️ | 删除客户 | 深红 |

---

## 📊 积分系统

### 兑换配置

```typescript
// utils/exchangeRate.ts
export const getPointsExchangeRate = (): number => {
  return 100; // 100 积分 = C$ 1.00
};
```

### 兑换流程

```
1. 点击"💰 积分兑换"
2. 输入兑换积分：3000
3. 自动计算：3000 ÷ 100 = C$ 30.00
4. 确认后：
   - 客户积分：5000 → 2000
   - 记录交易：TXN-xxx
   - 显示成功提示
```

### 交易记录

```typescript
{
  id: "TXN-1234567890",
  customerId: "CUST-xxx",
  type: "redeem",
  points: -3000,
  description: "兑换现金 C$ 30.00 (3000 积分)",
  createdAt: "2024-01-15T14:30:00.000Z"
}
```

---

## 🔄 数据互通机制

### 统一数据源

所有模块通过 **DataManager** 访问客户数据：

```typescript
// ✅ 正确：使用 DataManager
const customers = dataManager.getData('customers');

// ❌ 错误：直接操作 localStorage
const customers = JSON.parse(localStorage.getItem('pos_customers'));
```

### 实时同步

```typescript
// 任何模块的数据变化都会自动通知其他模块
dataManager.subscribe('customers', (newCustomers) => {
  console.log('客户数据已更新', newCustomers.length);
  setCustomers(newCustomers);
});
```

### 测试场景

**场景1：POS 创建 → 客户管理同步**
1. POS 收银台创建新客户
2. 立即切换到客户管理
3. ✅ 看到新客户

**场景2：客户管理添加 → POS 同步**
1. 客户管理添加新客户
2. 立即切换到 POS
3. ✅ 在搜索列表中看到新客户

---

## 🚀 使用指南

### 添加客户

1. 点击"➕ 添加客户"
2. 填写基本信息：
   - 姓名（必填）
   - 电话
   - 备注
3. 填写社交账号（选填）：
   - WhatsApp
   - Facebook
   - Instagram
   - Telegram
4. 点击"保存"

### 管理积分

1. 点击客户行的"⭐"按钮
2. 输入要增加的积分数量
3. 点击"确认添加"
4. ✅ 积分立即更新

### 积分兑换

1. 点击客户行的"💰"按钮
2. 查看当前积分和兑换比例
3. 输入要兑换的积分
4. 系统自动计算可兑换金额
5. 点击"确认兑换"
6. ✅ 积分扣除，记录交易

### 编辑客户

1. 点击客户行的"✏️"按钮
2. 修改信息（包括社交账号）
3. 点击"保存"
4. ✅ 信息更新

---

## 🔍 调试工具

### 控制台命令

```javascript
// 导入 DataManager
import { dataManager } from './services/dataManager';

// 查看客户数据
console.log(dataManager.getData('customers'));

// 查看数据统计
console.log(dataManager.getStats());
// { orders: 25, customers: 5, expenses: 3, ... }

// 查看所有数据
console.log(dataManager.exportAll());

// 清空缓存
dataManager.clearCache();
```

### 日志输出

```
👥 客户管理 - 初始化数据监听
🔄 客户管理：客户数据已更新 5 条
✅ 数据已同步: customers (5 条记录)

🔄 POS收银台：客户数据已更新 6 条
```

---

## ⚠️ 注意事项

### 1. 不要直接操作 localStorage

```typescript
// ❌ 错误
localStorage.setItem('pos_customers', JSON.stringify(customers));

// ✅ 正确
dataManager.saveData('customers', customers);
```

### 2. 日期格式统一

```typescript
// ✅ 正确：ISO 字符串
createdAt: new Date().toISOString()

// ❌ 错误：Date 对象
createdAt: new Date()
```

### 3. 及时取消订阅

```typescript
// ✅ 正确
useEffect(() => {
  const unsubscribe = dataManager.subscribe('customers', callback);
  return () => unsubscribe();
}, []);

// ❌ 错误：可能导致内存泄漏
useEffect(() => {
  dataManager.subscribe('customers', callback);
}, []);
```

---

## 📈 性能优化

### 1. 缓存策略

- 首次读取从 localStorage 加载到内存
- 后续读取直接从内存缓存获取
- 写入时同步更新缓存和 localStorage

### 2. 防抖处理

对于频繁变化的数据，可以添加防抖：

```typescript
let timeoutId: NodeJS.Timeout;

function debouncedSave(key: keyof DataStore, data: any[]) {
  clearTimeout(timeoutId);
  timeoutId = setTimeout(() => {
    dataManager.saveData(key, data);
  }, 300);
}
```

---

## 🔮 未来扩展

### 1. 更多社交平台

```typescript
socialAccounts?: {
  whatsapp?: string;
  facebook?: string;
  instagram?: string;
  telegram?: string;
  tiktok?: string;      // 新增
  wechat?: string;      // 新增
  line?: string;        // 新增
};
```

### 2. 客户分组

```typescript
interface Customer {
  // ...
  tags?: string[];      // 标签：VIP、常客、新客
  group?: string;       // 分组：个人、企业
}
```

### 3. 消费分析

```typescript
interface CustomerAnalytics {
  avgOrderValue: number;     // 平均订单金额
  favoriteCategory: string;  // 偏好品类
  peakVisitHour: number;     // 高峰时段
  churnRisk: 'low' | 'medium' | 'high'; // 流失风险
}
```

### 4. 营销自动化

- 生日优惠自动发送
- 积分到期提醒
- 久未消费唤醒
- 个性化推荐

---

## 📞 技术支持

如有问题，请检查：

1. **浏览器控制台日志** - 查看数据同步状态
2. **DataManager 状态** - `dataManager.getStats()`
3. **localStorage 数据** - 检查 `pos_customers`
4. **订阅是否正确** - 确保组件卸载时取消订阅

---

## 📝 版本历史

### v1.0.0 (2024-01-15)
- ✅ 基础客户管理（CRUD）
- ✅ 会员等级系统
- ✅ 积分管理与兑换
- ✅ 社交账号管理
- ✅ POS 数据互通
- ✅ DataManager 集成

---

**最后更新**: 2024-01-15  
**维护者**: Development Team
