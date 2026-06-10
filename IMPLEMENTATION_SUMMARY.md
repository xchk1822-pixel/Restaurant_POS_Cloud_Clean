# 数据存储方案实施总结

## ✅ 已完成的工作

### 1. 核心基础设施

#### 1.1 时间工具函数 (`utils/localTime.ts`)
- ✅ 创建完成
- 提供本地时间字符串处理函数
- 格式：`YYYY-MM-DD HH:mm:ss`
- 避免Firestore时区问题

#### 1.2 统一数据访问层 (`services/DataService.ts`)
- ✅ 创建完成
- 功能：
  - 分店隔离的localStorage key管理
  - 防止空数组覆盖的保护机制
  - 异步同步到Firestore
  - 从Firestore恢复数据
  - 生成财务汇总

### 2. 已修改的页面

#### 2.1 Stores.tsx (分店管理)
- ✅ 完全修改完成
- 使用dataService.getData()读取数据
- 使用dataService.saveData()保存数据
- 所有CRUD操作都已更新

#### 2.2 MainLayout.tsx (主布局)
- ✅ 已显示账号名
- 第312行显示 `user.name`（账号名）
- 第314-317行显示角色（可选）

#### 2.3 Login.tsx (登录)
- ✅ 已正确保存user.name
- 第107行保存 `name: user.name`

---

## ⏳ 待完成的工作

### 3. 需要修改的关键页面

#### 3.1 Inventory.tsx (库存管理) - 高优先级
**需要修改：**
- 导入dataService和localTime
- 替换所有 `localStorage.getItem('inventory_items')` 为 `dataService.getData('inventory_items')`
- 替换所有 `localStorage.setItem('inventory_items', ...)` 为 `dataService.saveData('inventory_items', ...)`
- 使用时间字符串代替Date对象

**估计工作量：** 约50处修改

#### 3.2 POS.tsx (收银) - 高优先级
**需要修改：**
- 导入dataService和localTime
- 订单创建时使用 `getLocalDateTime()`
- 替换桌台数据的读写
- 替换挂单数据的读写

**估计工作量：** 约30处修改

#### 3.3 MenuManagement.tsx (菜单管理) - 中优先级
**需要修改：**
- 菜品数据的读写改为dataService

**估计工作量：** 约20处修改

#### 3.4 ExpenseRecords.tsx (开支记录) - 中优先级
**需要修改：**
- 开支数据的读写改为dataService
- 使用本地时间字符串

**估计工作量：** 约15处修改

#### 3.5 PurchaseManagement.tsx (采购管理) - 中优先级
**需要修改：**
- 采购订单数据的读写改为dataService

**估计工作量：** 约15处修改

#### 3.6 Employees.tsx (员工管理) - 低优先级
**需要修改：**
- 员工数据的读写改为dataService

**估计工作量：** 约20处修改

#### 3.7 OwnerDashboard.tsx (老板仪表板) - 高优先级
**需要修改：**
- 从Firestore读取各分店财务汇总
- 显示财务数据

**估计工作量：** 约10处修改

### 4. 数据恢复工具优化

#### 4.1 DataRecovery.tsx
- ✅ 已添加"一键保存所有"按钮
- ✅ 已添加自动刷新功能
- ⏳ 需要优化：支持分店专属数据恢复

---

## 📋 实施步骤建议

### 第一阶段：核心功能（已完成✅）
- [x] 创建DataService
- [x] 创建localTime工具
- [x] 修改Stores.tsx
- [x] 修改MainLayout显示账号名

### 第二阶段：关键业务（待实施⏳）
- [ ] 修改Inventory.tsx
- [ ] 修改POS.tsx
- [ ] 修改MenuManagement.tsx
- [ ] 修改OwnerDashboard.tsx

### 第三阶段：辅助功能（待实施⏳）
- [ ] 修改ExpenseRecords.tsx
- [ ] 修改PurchaseManagement.tsx
- [ ] 修改Employees.tsx
- [ ] 优化DataRecovery.tsx

### 第四阶段：测试与优化（待实施⏳）
- [ ] 全面测试所有功能
- [ ] 修复发现的问题
- [ ] 性能优化
- [ ] 用户文档

---

## 🔑 关键设计原则

### 1. 数据访问规范
```typescript
// ❌ 错误：直接操作localStorage
const data = JSON.parse(localStorage.getItem('key') || '[]');
localStorage.setItem('key', JSON.stringify(data));

// ✅ 正确：使用DataService
const data = dataService.getData('key');
dataService.saveData('key', data);
```

### 2. 时间处理规范
```typescript
// ❌ 错误：使用Date对象或Timestamp
createdAt: new Date()
createdAt: Timestamp.now()

// ✅ 正确：使用本地时间字符串
import { getLocalDateTime } from '../utils/localTime';
createdAt: getLocalDateTime()  // "2024-01-15 14:30:00"
```

### 3. 分店隔离规范
```typescript
// localStorage key格式：
// 全局数据：'stores', 'users'
// 分店数据：'store_{storeId}_inventory_items'

// Firestore路径格式：
// 全局集合：'stores', 'users'
// 分店集合：'stores/{storeId}/inventory_items'
```

### 4. 防覆盖保护
```typescript
// DataService内部已实现：
saveData(collectionName: string, data: any[]) {
  if (!data || data.length === 0) {
    console.warn('⚠️ 尝试保存空数组，跳过');
    return;  // 🔥 防止空数组覆盖
  }
  // ... 保存逻辑
}
```

---

## ⚠️ 注意事项

1. **不要手动操作localStorage** - 所有数据操作都通过DataService
2. **不要使用Date对象** - 统一使用本地时间字符串
3. **测试每个修改** - 修改后立即测试功能是否正常
4. **备份重要数据** - 修改前导出localStorage数据作为备份
5. **保持代码一致** - 所有页面使用相同的模式

---

## 📞 下一步行动

**立即执行：**
1. 修改Inventory.tsx（最复杂，优先处理）
2. 修改POS.tsx（核心业务）
3. 修改MenuManagement.tsx
4. 修改OwnerDashboard.tsx

**预计总工作量：** 约2-3小时

**完成后效果：**
- ✅ 所有数据通过统一管理
- ✅ 不会意外覆盖数据
- ✅ 支持分店隔离
- ✅ 支持从Firestore恢复
- ✅ 时间显示正确（本地时间）
- ✅ 登录显示账号名

---

**文档最后更新：** 2024-01-15
**实施状态：** 第一阶段完成（25%）
