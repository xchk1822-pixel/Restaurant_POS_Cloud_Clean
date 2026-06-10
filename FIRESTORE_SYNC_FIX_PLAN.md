# 🔍 Firestore 实时同步全面修复清单

## ✅ 已修复的模块

### 1. POS 模块 ✅
- ✅ pos_tables - 已同步 + 实时监听
- ✅ pos_orders - 已同步 + 实时监听
- ✅ pos_held_orders - 已同步 + 实时监听
- ✅ pos_cancel_records - 已同步

### 2. 客户管理 ✅
- ✅ customers - 已添加同步 + 实时监听

### 3. 服务员界面 ✅
- ✅ pos_tables - 已添加同步

### 4. AppContext（库存/菜单/供应商/采购）✅
- ✅ inventory_items - 已添加实时监听
- ✅ menu_items - 已添加实时监听
- ✅ suppliers - 已添加实时监听
- ✅ purchase_orders - 已添加实时监听
- ✅ 自动保存已存在

### 5. 员工管理 ✅
- ✅ employees - 已有实时监听
- ✅ attendance_records - 已有实时监听
- ✅ salary_records - 已有实时监听
- ✅ loan_records - 已有实时监听
- ✅ cash_flow_records - 已有实时监听

---

## ⚠️ 需要检查的模块

### 6. 权限管理
**文件**: `client/src/pages/Settings/PermissionsModule.tsx`

当前状态：
- 使用 `localStorage.setItem('system_roles', ...)`
- ❌ 没有同步到 Firestore

需要修复：
```typescript
// 添加导入
import { dataService } from '../../services/DataService';

// 修改保存逻辑
dataService.saveData('system_roles', newRoles);
```

---

### 7. 交接班记录
**文件**: `client/src/pages/Manager/ShiftHandover.tsx`

当前状态：
- 使用 `localStorage.setItem('current_inputs', ...)`
- ❌ 没有同步到 Firestore

需要修复：
```typescript
dataService.saveData('handovers', inputs);
```

---

### 8. 冰箱盘点
**文件**: `client/src/pages/Inventory/FridgeStocktake.tsx`

当前状态：
- 使用 `localStorage.setItem('fridge_item_order_...', ...)`
- 使用 `localStorage.setItem('fridge_stocktake_history', ...)`
- ❌ 没有同步到 Firestore

需要修复：
```typescript
dataService.saveData('fridge_inventory', fridgeData);
dataService.saveData('fridge_stocktake_history', history);
```

---

### 9. 仓库盘点
**文件**: `client/src/pages/Inventory/WarehouseStocktake.tsx`

当前状态：
- 使用 `localStorage.setItem('warehouse_stocktake_history', ...)`
- ❌ 没有同步到 Firestore

需要修复：
```typescript
dataService.saveData('warehouse_stocktake_history', history);
```

---

### 10. 数据恢复/测试页面
这些是工具页面，不需要实时同步：
- ❌ OfflineTest.tsx - 测试页面，不需要同步
- ❌ DataRecovery.tsx - 恢复工具，不需要同步
- ❌ DataSyncPage.tsx - 同步控制页面，不需要同步

---

## 🎯 修复优先级

### P0 - 核心业务数据（已完成 ✅）
- ✅ POS 订单、桌台
- ✅ 客户数据
- ✅ 库存、菜单、供应商、采购
- ✅ 员工、考勤、薪资、借款

### P1 - 重要业务数据（待修复）
- ⚠️ 权限角色（system_roles）
- ⚠️ 交接班记录（handovers）

### P2 - 辅助数据（可选）
- ⚠️ 冰箱盘点历史
- ⚠️ 仓库盘点历史

---

## 📝 修复计划

### 立即修复（P1）
1. 权限管理模块
2. 交接班记录模块

### 后续优化（P2）
3. 冰箱盘点
4. 仓库盘点

---

## ✅ 验证清单

修复完成后验证：
- [ ] 所有核心业务数据都有实时监听
- [ ] 所有数据修改都同步到 Firestore
- [ ] 多设备数据实时同步
- [ ] 刷新页面数据不丢失
- [ ] 离线操作后联网自动同步
