# 🚀 Firebase Authentication 使用指南

## 📋 快速开始

### 第一步：迁移现有用户

1. **访问迁移页面**
   ```
   https://restaurant-pos-1b420.web.app/migrate-users
   ```

2. **执行迁移**
   - 点击"🚀 开始迁移用户"按钮
   - 等待迁移完成（可能需要几分钟）
   - 查看迁移结果

3. **验证迁移**
   - 检查成功/失败统计
   - 如果有失败，查看错误详情
   - 成功后点击"返回登录页面"

---

### 第二步：测试登录

1. **访问登录页面**
   ```
   https://restaurant-pos-1b420.web.app/login
   ```

2. **使用原有账号登录**
   ```
   用户名: admin
   密码: admin123
   ```

3. **验证功能**
   - 成功进入仪表板
   - 刷新页面保持登录状态
   - 尝试删除桌子（应该真正删除）

---

## 🔐 认证机制说明

### 用户名格式

系统自动将用户名转换为邮箱格式：

```
用户输入: admin
实际使用: admin@restaurant.local

用户输入: cashier_mn001_01
实际使用: cashier_mn001_01@restaurant.local
```

**对用户完全透明**，无需关心技术细节。

### 密码要求

- **最小长度**: 6位字符
- **复杂度**: Firebase Auth 默认要求
- **迁移时**: 保持原有密码不变

---

## 👥 用户管理

### 创建新用户（超级管理员）

目前需要通过代码或 Firebase Console 创建：

#### 方法1：Firebase Console（推荐）

1. 访问 https://console.firebase.google.com
2. 选择项目 `restaurant-pos-1b420`
3. 左侧菜单 → Authentication → Users
4. 点击"添加用户"
5. 填写信息：
   ```
   邮箱: username@restaurant.local
   密码: 至少6位
   ```
6. 创建后，在 Firestore 中添加用户详细信息：
   ```
   集合: users
   文档ID: [自动生成的UID]
   字段:
   - id: [UID]
   - username: username
   - name: 显示名称
   - role: cashier/store_manager等
   - storeId: mn001（分店ID）
   - storeName: 马那瓜总店
   ```

#### 方法2：通过代码（开发中）

未来会在系统中添加"用户管理"界面，支持直接创建用户。

---

## 🔒 权限系统

### 角色定义

| 角色 | 权限范围 | 说明 |
|------|---------|------|
| `super_admin` | 所有分店 | 超级管理员，可以管理所有分店 |
| `store_manager` | 单个分店 | 店长，管理本店所有业务 |
| `cashier` | 单个分店 | 收银员，POS点餐、订单管理 |
| `waiter` | 单个分店 | 服务员，点餐、服务 |
| `chef` | 单个分店 | 厨师，厨房管理 |

### 数据隔离

```typescript
// 每个用户只能访问自己分店的数据
user.storeId = 'mn001' 
→ 只能访问 stores/mn001/* 下的数据

// 超级管理员例外
user.role = 'super_admin'
→ 可以访问所有分店数据
```

---

## 🛠️ 故障排查

### 问题1：无法登录

**症状**：提示"用户名或密码错误"

**原因**：
1. 用户未迁移到 Firebase Auth
2. 密码输入错误
3. 用户名拼写错误

**解决**：
```bash
# 1. 确认用户已迁移
访问: https://restaurant-pos-1b420.web.app/migrate-users

# 2. 检查 Firebase Console
Authentication → Users → 查找用户

# 3. 重置密码（如果需要）
Firebase Console → 找到用户 → 三点菜单 → 重置密码
```

---

### 问题2：权限错误

**症状**：控制台显示 "Missing or insufficient permissions"

**原因**：
1. Firestore 安全规则未生效
2. 用户不属于该分店
3. 用户未正确认证

**解决**：
```bash
# 1. 重新部署安全规则
firebase deploy --only firestore:rules

# 2. 检查用户认证状态
浏览器控制台输入:
firebase.auth().currentUser

# 3. 检查用户信息
JSON.parse(localStorage.getItem('current_user'))

# 4. 确认用户 storeId 是否正确
```

---

### 问题3：数据不同步

**症状**：一台设备修改，另一台看不到

**原因**：
1. 网络连接问题
2. Firestore 实时监听失败
3. 权限不足

**解决**：
```bash
# 1. 检查网络连接
ping firebase.google.com

# 2. 查看控制台日志
应该看到: "📡 Firestore实时更新 pos_tables: X条"

# 3. 检查是否有权限错误
查找: "Missing or insufficient permissions"

# 4. 强制刷新页面
Ctrl + Shift + R
```

---

## 📊 监控与维护

### 日常检查清单

**每天**：
- [ ] 检查 Firebase Console 错误日志
- [ ] 监控活跃用户数
- [ ] 检查异常登录活动

**每周**：
- [ ] 审查 Firestore 读写次数
- [ ] 检查存储空间使用
- [ ] 审计用户权限

**每月**：
- [ ] 清理非活跃账户
- [ ] 更新安全规则（如需要）
- [ ] 备份重要数据

---

## 🔍 Firebase Console 使用

### 查看用户列表

1. 访问 https://console.firebase.google.com
2. 选择项目 `restaurant-pos-1b420`
3. 左侧菜单 → Authentication → Users
4. 查看所有注册用户

### 查看 Firestore 数据

1. 左侧菜单 → Firestore Database
2. 浏览数据集合：
   - `users` - 用户信息
   - `stores/{storeId}/pos_tables` - 桌台数据
   - `stores/{storeId}/pos_orders` - 订单数据
   - 等等...

### 监控使用情况

1. 左侧菜单 → Usage
2. 查看：
   - Authentication 使用量
   - Firestore 读写次数
   - Hosting 带宽使用

---

## 🎯 最佳实践

### 1. 密码管理

✅ **推荐**：
- 使用强密码（至少8位，包含大小写字母和数字）
- 定期更换密码
- 不要在不同系统使用相同密码

❌ **避免**：
- 使用简单密码（如 123456）
- 共享密码
- 明文存储密码

### 2. 用户权限

✅ **推荐**：
- 遵循最小权限原则
- 定期审计用户权限
- 及时禁用离职员工账号

❌ **避免**：
- 给普通员工 super_admin 权限
- 长期不审查权限
- 保留已离职员工账号

### 3. 数据安全

✅ **推荐**：
- 定期检查 Firestore 安全规则
- 监控异常访问模式
- 启用 Firebase 安全警报

❌ **避免**：
- 放宽安全规则用于调试
- 忽略安全警告
- 在生产环境使用测试数据

---

## 📞 技术支持

### Firebase 资源

- **官方文档**: https://firebase.google.com/docs/auth
- **控制台**: https://console.firebase.google.com
- **社区论坛**: https://firebase.google.com/support/community
- **状态页面**: https://status.firebase.google.com

### 项目相关

- **部署文档**: FIREBASE_AUTH_INTEGRATION.md
- **一致性方案**: MULTI_DEVICE_CONSISTENCY.md
- **WebSocket移除**: WEBSOCKET_REMOVAL.md

---

## ✅ 检查清单

### 迁移完成后

- [ ] 所有用户已成功迁移
- [ ] 可以使用原有账号登录
- [ ] 多设备数据同步正常
- [ ] 删除操作真正生效
- [ ] 权限控制正常工作
- [ ] 离线功能正常
- [ ] Firestore 安全规则生效

### 生产环境准备

- [ ] 监控系统运行状态
- [ ] 设置配额告警
- [ ] 制定应急预案
- [ ] 培训用户使用
- [ ] 建立维护流程

---

**恭喜！您的系统现已具备生产级别的安全性和可靠性！** 🎉
