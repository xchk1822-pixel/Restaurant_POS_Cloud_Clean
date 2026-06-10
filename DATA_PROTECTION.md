# 数据安全与持久化保障

## 🛡️ 核心原则

**生产环境数据绝对不能因为代码更新而丢失！**

---

## 🔒 数据保护机制

### 1. Firestore 作为唯一数据源

- ✅ **所有业务数据存储在 Firebase Firestore**
- ✅ **本地 localStorage 仅作为离线缓存**
- ✅ **代码更新不会影响云端数据**

### 2. 智能初始化策略

#### 权限角色初始化（PermissionsModule）

```typescript
// 只在以下情况才会初始化默认角色：
1. Firestore 中没有任何角色数据（首次安装）
2. localStorage 中没有 'permissions_initialized' 标记

// 一旦初始化完成，后续任何代码更新都不会：
❌ 删除现有角色
❌ 重置角色权限
❌ 覆盖用户自定义的角色
```

**保护逻辑**：
```typescript
// 检查是否已初始化
const hasInitialized = localStorage.getItem('permissions_initialized');
if (hasInitialized === 'true') {
  console.log('⚠️ 系统已初始化过，跳过默认角色创建');
  return; // 直接返回，不执行任何初始化
}
```

### 3. 数据监听而非覆盖

所有模块使用 **实时订阅模式**：

```typescript
// ✅ 正确做法：监听数据变化
smartSubscribeToCollection('system_roles', (data) => {
  setRoles(data); // 直接使用云端数据
});

// ❌ 错误做法：每次加载都重新创建
useEffect(() => {
  initializeDefaultRoles(); // 这会覆盖用户数据！
}, []);
```

---

## 📊 各模块数据保护状态

| 模块 | 数据来源 | 初始化策略 | 保护状态 |
|------|---------|-----------|---------|
| 权限管理 | Firestore | 仅首次安装 | ✅ 已保护 |
| 订单数据 | Firestore | 无自动初始化 | ✅ 安全 |
| 库存数据 | Firestore | 无自动初始化 | ✅ 安全 |
| 员工数据 | Firestore | 无自动初始化 | ✅ 安全 |
| 支出记录 | Firestore | 无自动初始化 | ✅ 安全 |
| 采购订单 | Firestore | 无自动初始化 | ✅ 安全 |
| 分店信息 | Firestore | 无自动初始化 | ✅ 安全 |

---

## ⚠️ 注意事项

### 开发时

1. **不要手动清空 Firestore 数据库**
   - 测试时使用独立的测试项目
   - 或在 Firestore 控制台手动删除测试数据

2. **不要在代码中硬编码数据重置**
   ```typescript
   // ❌ 禁止这样做
   useEffect(() => {
     await clearAllData();
     await initializeDemoData();
   }, []);
   
   // ✅ 应该这样做
   useEffect(() => {
     const unsubscribe = subscribeToData((data) => {
       setState(data);
     });
     return () => unsubscribe();
   }, []);
   ```

3. **测试数据初始化**
   - 使用 `DataInitTest.tsx` 页面手动触发
   - 或浏览器控制台运行：`initializeDemoData()`
   - **不要在生产环境执行**

### 部署时

1. **Firebase 部署流程**
   ```bash
   npm run build        # 构建前端
   firebase deploy --only hosting  # 只部署静态文件
   ```
   
   **不会触发的操作**：
   - ❌ 不会清空 Firestore
   - ❌ 不会重置任何数据
   - ❌ 不会修改云端配置

2. **版本更新**
   - 代码更新只影响前端逻辑
   - 云端数据保持不变
   - 用户数据完全安全

---

## 🔧 紧急情况处理

### 如果需要重置数据（仅限测试环境）

1. **清除初始化标记**
   ```javascript
   // 浏览器控制台执行
   localStorage.removeItem('permissions_initialized');
   location.reload();
   ```

2. **手动清空 Firestore**
   - 进入 Firebase Console
   - 选择对应集合
   - 手动删除文档

3. **重新初始化**
   - 刷新页面会自动检测并初始化
   - 或访问 `/data-init-test` 页面

### 如果误删了数据

1. **从 Firestore 备份恢复**
   - Firebase 提供自动备份功能
   - 可在 Console 中恢复指定时间点的数据

2. **联系技术支持**
   - 提供项目 ID: `restaurant-pos-1b420`
   - 说明数据丢失的时间和范围

---

## 📝 最佳实践

### 对于开发者

1. **永远假设生产环境有真实数据**
   - 不要写任何会清空数据的代码
   - 添加数据前检查是否存在

2. **使用条件初始化**
   ```typescript
   if (data.length === 0) {
     // 只有在没有数据时才初始化
     await initializeDefaults();
   }
   ```

3. **添加保护标记**
   ```typescript
   localStorage.setItem('module_initialized', 'true');
   ```

4. **详细的日志记录**
   ```typescript
   console.log('✅ 使用现有数据，共', data.length, '条记录');
   console.log('⚠️ 检测到空数据，开始初始化...');
   ```

### 对于运维人员

1. **定期备份 Firestore**
   - 启用 Firebase 自动备份
   - 或设置定时导出任务

2. **监控数据变化**
   - 使用 Firebase Console 查看数据量
   - 设置异常变化警报

3. **灰度发布**
   - 先在测试环境验证
   - 确认数据不受影响后再部署生产

---

## 🎯 总结

**核心原则**：
- ✅ Firestore 是权威数据源
- ✅ 代码更新不影响数据
- ✅ 初始化只在首次安装时执行
- ✅ 所有数据操作都有保护机制

**记住**：
> 生产环境的数据比代码更珍贵！
> 宁可代码出错，不可数据丢失！

---

**最后更新**: 2026-04-16  
**项目**: Restaurant POS System V2  
**数据库**: Firebase Firestore (restaurant-pos-1b420)
