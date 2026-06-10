# 多店数据隔离与同步方案

## 📋 概述

本系统实现了**按店铺/账号隔离数据**的完整方案。每个店铺（storeId）拥有独立的数据空间，同一店铺下的所有用户共享相同的数据。

---

## 🏗️ 架构设计

### Firestore 数据结构

```
Firestore Database
├── stores/{storeId1}           # 店铺 A
│   ├── pos_orders              # 订单
│   ├── pos_tables              # 桌台配置
│   ├── pos_held_orders         # 挂单
│   ├── inventory_items         # 库存商品
│   ├── menu_items              # 菜单
│   ├── customers               # 客户
│   ├── expenses                # 开支
│   ├── purchases               # 采购
│   └── ...                     # 其他数据
│
├── stores/{storeId2}           # 店铺 B
│   ├── pos_orders
│   ├── pos_tables
│   └── ...
│
└── users                       # 用户信息（全局）
    ├── user1 (storeId: storeId1)
    ├── user2 (storeId: storeId1)
    └── user3 (storeId: storeId2)
```

### 数据路径规则

- **有 storeId**：`stores/{storeId}/{collectionName}`
- **无 storeId（超级管理员）**：`{collectionName}`（全局集合）

---

## ✅ 已实现的功能

### 1. smartSyncService 增强

**文件**: `client/src/services/smartSyncService.ts`

#### 新增功能

```typescript
// 🔥 获取当前用户的 storeId
const getCurrentStoreId = (): string | null

// 🔥 构建带 storeId 的集合路径
const getStoreCollectionPath = (collectionName: string): string
```

#### 修改的函数

所有 CRUD 函数都已更新为自动使用 storeId 路径：
- ✅ `smartAddDocument()`
- ✅ `smartSetDocument()`
- ✅ `smartUpdateDocument()`
- ✅ `smartDeleteDocument()`
- ✅ `smartGetDocuments()`
- ✅ `smartSubscribeToCollection()`

### 2. POS 收银界面数据同步

**文件**: `client/src/pages/POS/POS.tsx`

#### 已同步的数据

| 数据类型 | localStorage | Firestore | 实时订阅 | 状态 |
|---------|-------------|-----------|---------|------|
| 订单 (pos_orders) | ✅ | ✅ | ✅ | ✅ 完成 |
| 桌台 (pos_tables) | ✅ | ✅ | ✅ | ✅ 完成 |
| 挂单 (pos_held_orders) | ✅ | ✅ | ✅ | ✅ 完成 |
| 取消记录 (pos_cancel_records) | ✅ | ❌ | ❌ | ⏳ 待实现 |

#### 同步机制

```typescript
// 1. 初始化时从 Firestore 加载
useEffect(() => {
  const unsubscribe = smartSubscribeToCollection('pos_orders', (cloudData) => {
    // 合并本地和云端数据
    setOrders(mergedData);
  });
  return () => unsubscribe();
}, []);

// 2. 数据变化时同步到 Firestore
useEffect(() => {
  saveToStorage('pos_orders', orders); // 本地备份
  
  // 同步到云端
  orders.forEach(async (order) => {
    await smartUpdateDocument('pos_orders', order.id, orderData);
  });
}, [orders]);
```

---

## ⏳ 待实现的功能

### 1. AppContext 数据同步

**文件**: `client/src/contexts/AppContext.tsx`

需要同步的数据：
- ❌ 库存商品 (inventory_items)
- ❌ 菜单项 (menu_items)
- ❌ 冰箱库存 (fridge_inventory)
- ❌ 冰箱列表 (fridges)

**实现步骤**：
1. 在 AppContext 中添加 Firestore 订阅
2. 修改保存逻辑，同步到 Firestore
3. 确保所有组件使用统一的数据源

### 2. DataManager 数据同步

**文件**: `client/src/services/dataManager.ts`

需要同步的数据：
- ❌ 客户 (customers)
- ❌ 员工 (employees)
- ❌ 供应商 (suppliers)
- ❌ 开支 (expenses)
- ❌ 采购 (purchases)

**实现步骤**：
1. 修改 DataManager，支持 Firestore 后端
2. 添加实时订阅功能
3. 保持向后兼容（localStorage 作为离线缓存）

### 3. 其他模块

- ❌ 库存管理 (Inventory.tsx)
- ❌ 菜单管理 (MenuManagement.tsx)
- ❌ 供应商管理 (SupplierManagement.tsx)
- ❌ 员工管理 (Employees.tsx)
- ❌ 客户管理 (Customers.tsx)
- ❌ 店长仪表板 (Manager/Dashboard.tsx)
- ❌ 老板仪表板 (Dashboard/OwnerDashboard.tsx)

---

## 🚀 使用方法

### 1. 登录系统

```typescript
// 用户登录后，storeld 会自动设置
const user = {
  id: 'user123',
  username: 'manager1',
  name: '张三',
  role: 'store_manager',
  storeId: 'store_001',  // ← 关键字段
  storeName: '北京分店'
};

authContext.login(user);
```

### 2. 数据自动隔离

```typescript
// 所有使用 smartSyncService 的操作都会自动按 storeId 隔离
await smartAddDocument('pos_orders', orderData);
// → 实际保存到: stores/store_001/pos_orders

await smartUpdateDocument('inventory_items', itemId, itemData);
// → 实际保存到: stores/store_001/inventory_items
```

### 3. 切换店铺

```typescript
// 超级管理员可以切换查看不同店铺
authContext.switchStore('store_002', '上海分店');
// → 所有数据自动切换到 store_002 的空间
```

---

## 📊 数据流图

```
用户操作
  ↓
组件 State 更新
  ↓
├─→ localStorage (立即保存，离线可用)
└─→ Firestore (异步同步)
     ↓
  stores/{storeId}/collection
     ↓
  实时订阅推送
     ↓
  其他设备收到更新
     ↓
  合并本地和云端数据
     ↓
  UI 自动刷新
```

---

## 🔍 调试技巧

### 1. 查看当前 storeId

```javascript
// 浏览器控制台
const user = JSON.parse(localStorage.getItem('current_user'));
console.log('当前店铺:', user.storeId, user.storeName);
```

### 2. 查看 Firestore 数据

访问 Firebase Console：
1. https://console.firebase.google.com
2. 选择项目：restaurant-pos-1b420
3. Firestore Database
4. 展开 `stores` → `{storeId}` → 查看集合

### 3. 检查同步日志

```javascript
// 控制台会显示详细的同步日志
🔄 开始订阅 Firestore 订单数据...
☁️ 收到云端订单更新: 5 个
📊 订单合并完成: { 本地: 3, 云端: 5, 合并后: 5 }
✅ 订单已同步到 Firestore: order-xxx
```

---

## ⚠️ 注意事项

### 1. 首次使用

- 新用户/新店铺需要先创建默认数据
- 可以使用"同步历史订单"按钮迁移旧数据

### 2. 网络要求

- 需要联网才能同步到 Firestore
- 离线时仍可使用（保存到 localStorage）
- 恢复网络后自动同步

### 3. 数据冲突

- 以云端数据为准
- 本地和云端合并，避免丢失
- 最后写入优先（updatedAt 时间戳）

### 4. 性能优化

- 只在数据变化时同步
- 批量更新减少请求次数
- 使用实时订阅代替轮询

---

## 📝 开发指南

### 添加新的数据同步

```typescript
// 1. 在组件中添加订阅
useEffect(() => {
  const unsubscribe = smartSubscribeToCollection('my_collection', (data) => {
    setState(data);
  });
  return () => unsubscribe();
}, []);

// 2. 在数据变化时同步
useEffect(() => {
  data.forEach(async (item) => {
    await smartUpdateDocument('my_collection', item.id, item);
  });
}, [data]);
```

### 迁移现有代码

**之前**：
```typescript
localStorage.setItem('my_data', JSON.stringify(data));
const data = JSON.parse(localStorage.getItem('my_data'));
```

**现在**：
```typescript
// 自动同步到 Firestore + localStorage
await smartUpdateDocument('my_collection', id, data);
const data = await smartGetDocuments('my_collection');
```

---

## 🎯 完成清单

### Phase 1: POS 收银 ✅
- [x] 订单同步
- [x] 桌台同步
- [x] 挂单同步
- [ ] 取消记录同步

### Phase 2: 核心数据 ⏳
- [ ] 库存商品同步
- [ ] 菜单同步
- [ ] 客户同步
- [ ] 员工同步

### Phase 3: 财务数据 ⏳
- [ ] 开支同步
- [ ] 采购同步
- [ ] 交班记录同步

### Phase 4: 其他模块 ⏳
- [ ] 冰箱库存同步
- [ ] 盘点记录同步
- [ ] 报表数据同步

---

## 📞 技术支持

如有问题，请检查：
1. 用户是否正确登录（有 storeId）
2. Firestore 规则是否允许访问
3. 网络连接是否正常
4. 控制台是否有错误日志

---

**最后更新**: 2026-04-16
**版本**: v1.0 (Phase 1 完成)
