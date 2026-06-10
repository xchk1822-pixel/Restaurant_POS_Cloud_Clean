# 库存管理模块结构说明

## 📁 文件结构

```
Inventory/
├── Inventory.tsx                 # 主入口文件（库存物品管理 + 出入库记录）
├── PurchaseManagement.tsx        # 采购管理组件（采购订单 + 供应商管理）
├── MenuManagement.tsx            # 菜品管理组件（独立页面）
├── FridgeStocktake.tsx           # 冰箱盘点组件（独立页面）
├── WarehouseStocktake.tsx        # 仓库盘点组件（独立页面）
└── README.md                     # 本说明文档
```

## 🎯 组件职责划分

### 1. **Inventory.tsx** - 库存物品管理主入口
- **职责**：库存物品的增删改查、出入库记录管理
- **功能**：
  - 库存物品列表展示（支持搜索、分类筛选）
  - 添加/编辑库存物品（名称、分类、单位、条形码、安全库存等）
  - 删除库存物品
  - 出入库记录查询和展示
  - 库存调拨（仓库 ↔ 冰箱）
  - 标签页切换（物品管理 / 采购入库 / 出入库记录）

### 2. **PurchaseManagement.tsx** - 采购管理
- **职责**：采购订单管理和供应商管理
- **功能**：
  - 采购订单列表（待审核、已审核、已完成）
  - 创建采购订单（选择供应商、添加商品、设置数量）
  - 审核采购订单
  - 完成采购入库（自动增加库存）
  - 供应商管理（增删改查）
  - 子标签页切换（采购订单 / 供应商管理）

### 3. **MenuManagement.tsx** - 菜品管理（独立页面）
- **职责**：餐厅菜品的完整管理
- **功能**：
  - 菜品列表展示（支持搜索、分类筛选）
  - 添加/编辑菜品（名称、分类、价格、图片、描述）
  - 删除菜品
  - 菜品配方管理（关联库存物品、设置扣减方式）
  - 库存扣减配置（直接扣减 / 配方扣减）
  - 菜品图片上传
  - 分类管理（自定义菜品分类）

### 4. **FridgeStocktake.tsx** - 冰箱盘点（独立页面）
- **职责**：冰箱库存的盘点和管理
- **功能**：
  - 冰箱管理（添加、编辑、删除冰箱）
  - 冰箱库存盘点（扫码录入、手动输入）
  - 库存对比（系统库存 vs 实际盘点）
  - 差异分析（盘盈/盘亏）
  - 盘点历史记录
  - 库存调拨（仓库 → 冰箱）
  - 商品排序（自定义盘点顺序）

### 5. **WarehouseStocktake.tsx** - 仓库盘点（独立页面）
- **职责**：仓库库存的盘点和管理
- **功能**：
  - 仓库库存盘点
  - 库存对比（系统库存 vs 实际盘点）
  - 差异分析
  - 盘点历史记录
  - 批量调整库存

## 🔄 数据流

```
AppContext (全局状态)
  ├─ inventoryItems (库存物品)
  ├─ purchaseOrders (采购订单)
  ├─ suppliers (供应商)
  ├─ fridges (冰箱)
  ├─ fridgeInventory (冰箱库存)
  └─ deductStock / addStock (库存操作方法)

Inventory.tsx
  ├─ 从 AppContext 获取 inventoryItems
  ├─ 管理出入库记录（localStorage）
  └─ 调用 deductStock / addStock 更新库存

PurchaseManagement.tsx
  ├─ 从 AppContext 获取 purchaseOrders, suppliers
  ├─ 创建/审核/完成采购订单
  └─ 完成时调用 addStock 增加库存

MenuManagement.tsx
  ├─ 从 AppContext 获取 menuItems
  ├─ 管理菜品和配方
  └─ 配置库存扣减方式

FridgeStocktake.tsx
  ├─ 从 AppContext 获取 fridges, fridgeInventory, inventoryItems
  ├─ 盘点后更新冰箱库存
  └─ 调拨时减少仓库库存、增加冰箱库存

WarehouseStocktake.tsx
  ├─ 从 AppContext 获取 inventoryItems
  └─ 盘点后更新仓库库存
```

## 💾 数据存储

### AppContext（全局状态）
| 状态 | 类型 | 说明 |
|------|------|------|
| `inventoryItems` | InventoryItem[] | 库存物品列表 |
| `purchaseOrders` | PurchaseOrder[] | 采购订单列表 |
| `suppliers` | Supplier[] | 供应商列表 |
| `fridges` | Fridge[] | 冰箱列表 |
| `fridgeInventory` | FridgeInventory[] | 冰箱库存记录 |

### localStorage（本地存储）
| 键名 | 数据类型 | 说明 |
|------|---------|------|
| `inventory_categories` | Category[] | 库存分类配置 |
| `stock_movement_records` | MovementRecord[] | 出入库记录 |
| `menu_items` | MenuItem[] | 菜品列表 |
| `menu_categories` | MenuCategory[] | 菜品分类 |
| `fridge_stocktake_history` | StocktakeRecord[] | 冰箱盘点历史 |
| `warehouse_stocktake_history` | StocktakeRecord[] | 仓库盘点历史 |

## 🔧 核心业务逻辑

### 1. 库存扣减逻辑（销售订单）
**位置**: `AppContext.tsx` 中的 `deductStock` 函数

**扣减优先级**:
```
销售订单 → 扣减库存
  ↓
1️⃣ 优先从所有冰箱中扣减
  ├─ 遍历所有冰箱
  ├─ 计算可扣数量
  └─ 更新冰箱库存
  ↓
2️⃣ 如果冰箱不够，从仓库扣减剩余部分
  └─ 更新仓库库存
```

**扣减模式**:
- **直接扣减**: 直接扣减菜品关联的库存物品
- **配方扣减**: 根据菜品配方扣减多个原材料

### 2. 库存增加逻辑（采购入库）
**位置**: `AppContext.tsx` 中的 `addStock` 函数

**流程**:
```
采购订单完成 → 调用 addStock
  ↓
增加对应物品的 currentStock
  ↓
记录入库时间
```

### 3. 库存调拨逻辑
**位置**: `FridgeStocktake.tsx` 中的 `handleTransfer` 函数

**流程**:
```
选择商品和数量 → 确认调拨
  ↓
1️⃣ 减少仓库库存（inventoryItems.currentStock）
  ↓
2️⃣ 增加冰箱库存（fridgeInventory.quantity）
  ↓
3️⃣ 记录调拨历史
```

## 📊 关键数据结构

### InventoryItem（库存物品）
```typescript
interface InventoryItem {
  id: string;
  name: string;              // 物品名称
  category: string;          // 分类
  unit: string;              // 单位
  barcode?: string;          // 条形码
  currentStock: number;      // 当前库存
  minStock: number;          // 最低库存（安全库存）
  maxStock: number;          // 最高库存
  costPrice: number;         // 成本价
  conversionRate?: number;   // 换算率
  lastUpdated: Date;         // 最后更新时间
}
```

### MenuItem（菜品）
```typescript
interface MenuItem {
  id: string;
  name: string;              // 菜品名称
  category: string;          // 分类
  price: number;             // 售价
  image?: string;            // 图片URL
  description?: string;      // 描述
  deductionType: 'direct' | 'recipe';  // 扣减方式
  stockItemId?: string;      // 直接扣减时的库存物品ID
  ingredients?: RecipeIngredient[];    // 配方原料
}
```

### FridgeInventory（冰箱库存）
```typescript
interface FridgeInventory {
  fridgeId: string;          // 冰箱ID
  itemId: string;            // 物品ID
  quantity: number;          // 数量
}
```

## 🔧 维护和扩展

### 添加新功能
1. 在对应子组件中添加功能代码
2. 如需新状态，在 `AppContext.tsx` 中添加
3. 如需新页面，创建新组件并在路由中注册

### 修改现有功能
- 每个子组件独立维护，互不影响
- 只需修改对应的 `.tsx` 文件即可
- 库存逻辑修改需同步更新 `AppContext.tsx`

### 示例：添加"库存预警"功能
```typescript
// 1. 在 Inventory.tsx 中添加预警卡片
const lowStockItems = inventoryItems.filter(item => 
  item.currentStock <= item.minStock
);

// 2. 显示预警信息
{lowStockItems.length > 0 && (
  <div style={{ background: '#fef3c7', padding: '1rem' }}>
    ⚠️ 有 {lowStockItems.length} 个物品库存不足
  </div>
)}
```

## ✨ 优势

1. **模块化**：每个功能独立，便于维护
2. **清晰的职责**：库存、采购、菜品、盘点各司其职
3. **统一的状态管理**：通过 AppContext 共享数据
4. **灵活的库存扣减**：支持直接扣减和配方扣减
5. **完整的盘点流程**：支持冰箱和仓库双重盘点

## 📝 注意事项

- 库存扣减优先从冰箱扣减，不足部分从仓库扣减
- 采购入库时直接增加仓库库存
- 冰箱调拨会同时更新仓库和冰箱库存
- 所有库存操作都会记录到出入库记录中
- 菜品管理已独立为单独页面，不在库存管理标签页内

## 🎨 UI布局规范

所有库存管理相关页面都遵循统一的布局规范：

```
外层容器 (height: 100vh, overflow: hidden)
  ├─ 头部区域 (flexShrink: 0, 固定高度)
  │   ├─ 标题
  │   └─ 操作按钮
  └─ 内容区域 (flex: 1, overflowY: auto)
      └─ 表格/列表 (可滚动)
```

**关键点**:
- ✅ 页面整体不滚动
- ✅ 自适应屏幕宽高
- ✅ 只有表格/列表区域可以滚动
- ✅ 头部和按钮区域保持固定
