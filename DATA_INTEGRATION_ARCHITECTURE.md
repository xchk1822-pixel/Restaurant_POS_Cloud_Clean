# 数据互通架构文档

## 📋 概述

本系统采用**统一数据管理服务（DataManager）**实现全系统数据的一致性、互联性和存储一致性。所有模块通过 DataManager 进行数据交互，确保数据的实时同步。

---

## 🎯 核心原则

### 1. **单一数据源（Single Source of Truth）**
- 所有数据统一存储在 `localStorage`
- 通过 `DataManager` 单例访问
- 避免多处读写导致的不一致

### 2. **实时同步（Real-time Sync）**
- 数据变化自动触发自定义事件
- 所有订阅者即时收到更新通知
- 支持跨组件、跨模块的数据同步

### 3. **一致性保证（Consistency Guarantee）**
- 原子操作：读-改-写在一个事务中完成
- 顺序保证：严格按照操作顺序执行
- 错误处理：失败时回滚，保持数据完整

---

## 🏗️ 架构设计

```
┌─────────────────────────────────────────┐
│         应用层（各业务模块）              │
│  POS / 店长管理 / 库存 / 员工 / 客户    │
└──────────────┬──────────────────────────┘
               │ 订阅/发布
┌──────────────▼──────────────────────────┐
│      DataManager（统一数据管理服务）      │
│  ┌─────────────────────────────────┐   │
│  │  Cache Layer（内存缓存）         │   │
│  │  - 快速读取                      │   │
│  │  - 减少 localStorage 访问        │   │
│  └──────────────┬──────────────────┘   │
│                 │ 同步                  │
│  ┌──────────────▼──────────────────┐   │
│  │  Storage Layer（localStorage）  │   │
│  │  - 持久化存储                    │   │
│  │  - 浏览器关闭后保留              │   │
│  └──────────────┬──────────────────┘   │
│                 │ 事件                  │
│  ┌──────────────▼──────────────────┐   │
│  │  Event Bus（事件总线）           │   │
│  │  - ordersUpdated                │   │
│  │  - customersUpdated             │   │
│  │  - expensesUpdated              │   │
│  │  - purchasesUpdated             │   │
│  └─────────────────────────────────┘   │
└─────────────────────────────────────────┘
```

---

## 📦 数据类型与键名映射

| 数据键 | localStorage 键 | 说明 | 主要使用者 |
|--------|----------------|------|-----------|
| `orders` | `pos_orders` | POS订单数据 | POS、财务报表、数据概览、历史订单 |
| `customers` | `pos_customers` | 客户信息 | POS、客户管理、数据概览 |
| `expenses` | `expense_records` | 开支记录 | 开支记录、财务报表、数据概览 |
| `purchases` | `purchase_records` | 采购入库 | 库存管理、财务报表、数据概览 |
| `handovers` | `rest_v6_final` | 交班记录 | 交班对账、财务报表 |
| `employees` | `employees` | 员工档案 | 员工管理、薪资结算 |
| `menuItems` | `menu_items` | 菜品菜单 | POS、库存管理 |
| `inventory` | `inventory` | 库存数据 | 库存管理、POS扣减 |

---

## 💻 API 参考

### 基础用法

```typescript
import { dataManager } from '../services/dataManager';

// 读取数据
const orders = dataManager.getData('orders');

// 添加数据
dataManager.addData('orders', newOrder);

// 更新数据
dataManager.updateData('orders', orderId, { status: 'completed' });

// 删除数据
dataManager.deleteData('orders', orderId);

// 批量更新
dataManager.batchUpdate('orders', [
  { id: 'ORD-001', data: { status: 'served' } },
  { id: 'ORD-002', data: { status: 'completed' } }
]);
```

### 订阅数据变化

```typescript
import { useEffect } from 'react';
import { dataManager } from '../services/dataManager';

function MyComponent() {
  useEffect(() => {
    // 订阅订单变化
    const unsubscribe = dataManager.subscribe('orders', (newOrders) => {
      console.log('订单已更新:', newOrders.length);
      setOrders(newOrders);
    });

    // 组件卸载时取消订阅
    return () => unsubscribe();
  }, []);

  return <div>...</div>;
}
```

### React Hook 简化用法

```typescript
import { useData } from '../services/dataManager';

function OrderList() {
  const { getData, subscribe } = useData('orders');
  
  const [orders, setOrders] = useState(getData());
  
  useEffect(() => {
    return subscribe(setOrders);
  }, []);
  
  return <div>{/* 渲染订单列表 */}</div>;
}
```

---

## 🔄 数据流示例

### 场景1：POS 提交订单

```typescript
// 1. POS 收银台创建订单
const newOrder = {
  id: 'ORD-001',
  tableNumber: 'T01',
  totalAmount: 150.00,
  paymentMethod: 'cash',
  items: [...],
  createdAt: new Date().toISOString()
};

// 2. 通过 DataManager 保存
dataManager.addData('orders', newOrder);

// 3. DataManager 内部流程：
//    a. 更新内存缓存
//    b. 保存到 localStorage
//    c. 触发自定义事件 'ordersUpdated'
//    d. 通知所有订阅者

// 4. 其他模块自动接收更新：
//    - 财务报表：重新计算营业额
//    - 数据概览：更新统计图表
//    - 历史订单：添加到列表
```

### 场景2：POS 创建客户 → 客户管理同步

```typescript
// POS.tsx
const handleCreateCustomer = () => {
  const newCustomer = {
    id: `cust-${Date.now()}`,
    name: 'Maria Garcia',
    phone: '+505 8888-9999',
    points: 0,
    totalSpent: 0,
    visitCount: 0,
    createdAt: new Date().toISOString()
  };
  
  // 使用 DataManager 添加
  dataManager.addData('customers', newCustomer);
};

// CustomersModule.tsx
useEffect(() => {
  const unsubscribe = dataManager.subscribe('customers', (newCustomers) => {
    console.log('🔄 客户数据已更新', newCustomers.length);
    setCustomers(newCustomers);
  });
  return () => unsubscribe();
}, []);

// 结果：
// ✅ POS 创建客户
// ✅ 客户管理立即看到新客户
// ✅ 无需手动刷新
```

---

## 🔍 调试工具

### 查看数据状态

```typescript
// 在浏览器控制台执行
import { dataManager } from './services/dataManager';

// 查看所有数据统计
console.log(dataManager.getStats());
// 输出: { orders: 25, customers: 5, expenses: 3, ... }

// 导出所有数据（用于备份）
const allData = dataManager.exportAll();
console.log(allData);

// 清空缓存（强制从 localStorage 重新加载）
dataManager.clearCache();

// 清空所有数据（危险操作）
dataManager.clearAll();
```

### 监控数据流

打开浏览器控制台，可以看到：

```
✅ 数据已同步: orders (26 条记录)
🔄 数据概览：订单数据已更新 26 条
📊 加载数据概览: { timeRange: 'today', 订单总数: 26 }
  - 筛选后订单数: 10
  - 开支记录数: 5
  - 采购记录数: 3

👥 客户管理 - 初始化数据监听
🔄 客户管理：客户数据已更新 5 条

🔄 POS收银台：客户数据已更新 6 条
```

---

## ⚠️ 注意事项

### 1. **不要直接操作 localStorage**

```typescript
// ❌ 错误做法
localStorage.setItem('pos_orders', JSON.stringify(orders));

// ✅ 正确做法
dataManager.saveData('orders', orders);
```

### 2. **始终通过 DataManager 访问数据**

```typescript
// ❌ 错误做法
const orders = JSON.parse(localStorage.getItem('pos_orders'));

// ✅ 正确做法
const orders = dataManager.getData('orders');
```

### 3. **及时取消订阅**

```typescript
// ❌ 可能导致内存泄漏
useEffect(() => {
  dataManager.subscribe('orders', callback);
}, []);

// ✅ 正确做法
useEffect(() => {
  const unsubscribe = dataManager.subscribe('orders', callback);
  return () => unsubscribe();
}, []);
```

### 4. **日期格式统一**

```typescript
// ✅ 正确：ISO 字符串
createdAt: new Date().toISOString()

// ❌ 错误：Date 对象（会导致序列化问题）
createdAt: new Date()
```

### 5. **大数据量考虑分页**

```typescript
// 如果订单超过1000条，考虑分页加载
const allOrders = dataManager.getData('orders');
const paginatedOrders = allOrders.slice(0, 50); // 只取前50条
```

---

## 🚀 性能优化

### 1. **缓存策略**

- 首次读取从 localStorage 加载到内存
- 后续读取直接从内存缓存获取
- 写入时同步更新缓存和 localStorage

### 2. **防抖处理**

对于频繁变化的数据，可以添加防抖：

```typescript
let timeoutId: NodeJS.Timeout;

function debouncedSave(key: keyof DataStore, data: any[]) {
  clearTimeout(timeoutId);
  timeoutId = setTimeout(() => {
    dataManager.saveData(key, data);
  }, 300); // 300ms 防抖
}
```

### 3. **懒加载**

只在需要时订阅数据：

```typescript
const [isVisible, setIsVisible] = useState(false);

useEffect(() => {
  if (!isVisible) return;
  
  const unsubscribe = dataManager.subscribe('orders', callback);
  return () => unsubscribe();
}, [isVisible]);
```

---

## 📊 数据一致性检查

定期检查数据一致性：

```typescript
function checkDataConsistency() {
  const stats = dataManager.getStats();
  console.log('数据一致性检查:', stats);
  
  // 检查是否有异常
  if (stats.orders < 0) {
    console.error('❌ 订单数据异常');
  }
  
  // 验证关键数据
  const orders = dataManager.getData('orders');
  const totalAmount = orders.reduce((sum, o) => sum + o.totalAmount, 0);
  console.log('总营业额:', totalAmount);
  
  return stats;
}

// 每小时检查一次
setInterval(checkDataConsistency, 60 * 60 * 1000);
```

---

## 🎓 最佳实践

1. **统一入口** - 所有数据操作都通过 DataManager
2. **及时订阅** - 需要实时数据的组件要订阅变化
3. **清理资源** - 组件卸载时取消订阅
4. **错误处理** - 捕获并处理可能的异常
5. **日志记录** - 关键操作添加日志便于排查
6. **定期备份** - 使用 exportAll 定期备份数据
7. **版本控制** - 数据结构变化时考虑版本迁移

---

## 🔮 未来扩展

### 1. **云端同步**

```typescript
class CloudDataManager extends DataManager {
  async syncToCloud() {
    const data = this.exportAll();
    await fetch('/api/sync', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }
  
  async syncFromCloud() {
    const response = await fetch('/api/sync');
    const data = await response.json();
    this.importAll(data);
  }
}
```

### 2. **离线支持**

```typescript
// Service Worker 离线缓存
navigator.serviceWorker.register('/sw.js');
```

### 3. **数据加密**

```typescript
import CryptoJS from 'crypto-js';

saveData(key: keyof DataStore, data: any[]) {
  const encrypted = CryptoJS.AES.encrypt(
    JSON.stringify(data), 
    SECRET_KEY
  ).toString();
  localStorage.setItem(storageKey, encrypted);
}
```

### 4. **数据版本迁移**

```typescript
interface Migration {
  version: number;
  migrate: (data: any) => any;
}

const migrations: Migration[] = [
  {
    version: 2,
    migrate: (data) => {
      // v1 -> v2: 添加新字段
      return data.map(item => ({
        ...item,
        newField: defaultValue
      }));
    }
  }
];
```

---

## 📞 技术支持

如有数据一致性问题，请检查：

1. **浏览器控制台日志** - 查看数据同步状态
2. **DataManager 的 getStats()** - 检查数据统计
3. **localStorage 中的数据** - 验证原始数据
4. **是否有未取消的订阅** - 防止内存泄漏

---

## 📝 相关文档

- [客户管理系统文档](./CUSTOMER_MANAGEMENT.md)
- [数据一致性架构](./DATA_CONSISTENCY.md)

---

**最后更新**: 2024-01-15  
**维护者**: Development Team
