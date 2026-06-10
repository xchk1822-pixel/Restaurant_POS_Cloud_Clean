# 🔥 Firebase 配置指南

## 📋 步骤1：创建Firebase项目

1. 访问 [Firebase Console](https://console.firebase.google.com/)
2. 点击"添加项目"
3. 输入项目名称：`restaurant-pos-system`
4. 启用Google Analytics（可选）
5. 点击"创建项目"

---

## 📋 步骤2：获取Firebase配置

1. 在Firebase控制台，点击项目设置（齿轮图标）
2. 滚动到"您的应用"部分
3. 点击Web图标 `</>`
4. 注册应用名称：`Restaurant POS`
5. **复制配置对象**

你会看到类似这样的配置：

```javascript
const firebaseConfig = {
  apiKey: "AIzaSyDxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  authDomain: "restaurant-pos-xxxxx.firebaseapp.com",
  projectId: "restaurant-pos-xxxxx",
  storageBucket: "restaurant-pos-xxxxx.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:xxxxxxxxxxxxxxxxxxxx",
  measurementId: "G-XXXXXXXXXX"
};
```

---

## 📋 步骤3：更新配置文件

打开文件：`client/src/firebase/config.ts`

将你的配置替换进去：

```typescript
export const firebaseConfig = {
  apiKey: "你的API_KEY",
  authDomain: "你的PROJECT_ID.firebaseapp.com",
  projectId: "你的PROJECT_ID",
  storageBucket: "你的PROJECT_ID.appspot.com",
  messagingSenderId: "你的MESSAGING_SENDER_ID",
  appId: "你的APP_ID",
  measurementId: "你的MEASUREMENT_ID"
};
```

---

## 📋 步骤4：启用Firestore数据库

1. 在Firebase控制台左侧菜单，点击"Firestore Database"
2. 点击"创建数据库"
3. **选择位置**：选择离你最近的地区（如：asia-east1 台湾）
4. **安全规则**：选择"开始于测试模式"（稍后我们会配置正式规则）
5. 点击"启用"

---

## 📋 步骤5：配置Firestore安全规则

在Firestore控制台的"规则"标签页，粘贴以下规则：

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // 分店集合 - 仅管理员可写，所有人可读
    match /stores/{storeId} {
      allow read: if true;
      allow write: if request.auth != null && 
                     get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'super_admin';
    }
    
    // 用户集合 - 仅本人和管理员可读写
    match /users/{userId} {
      allow read: if request.auth != null && 
                     (request.auth.uid == userId || 
                      get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'super_admin');
      allow write: if request.auth != null && 
                      (request.auth.uid == userId || 
                       get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'super_admin');
    }
    
    // 员工、订单、库存等业务数据 - 按分店隔离
    match /{collection}/{docId} {
      allow read: if request.auth != null &&
                     (get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'super_admin' ||
                      resource.data.storeId == get(/databases/$(database)/documents/users/$(request.auth.uid)).data.storeId);
      
      allow create: if request.auth != null &&
                       request.resource.data.storeId == get(/databases/$(database)/documents/users/$(request.auth.uid)).data.storeId;
      
      allow update, delete: if request.auth != null &&
                               resource.data.storeId == get(/databases/$(database)/documents/users/$(request.auth.uid)).data.storeId;
    }
  }
}
```

---

## 📋 步骤6：启用身份验证（可选）

1. 在Firebase控制台左侧菜单，点击"Authentication"
2. 点击"开始"
3. 启用"电子邮件/密码"登录方式
4. （可选）启用其他登录方式：Google、Facebook等

---

## 📋 步骤7：测试连接

运行项目后，打开浏览器控制台，你应该看到：

```
✅ Firebase已初始化
```

如果没有看到，检查：
1. 配置文件是否正确
2. 网络连接是否正常
3. Firebase项目是否已创建

---

## 📋 步骤8：数据迁移

系统会自动从localStorage迁移数据到Firestore。首次运行时：

1. 打开应用
2. 查看控制台输出：
   ```
   🔄 开始迁移: employees (10条记录)
   ✅ 添加成功: employees/abc123
   ✅ 迁移成功: employees -> employees
   ```

3. 在Firebase控制台 → Firestore Database，查看数据是否已同步

---

## 🔧 离线功能说明

### 已启用的功能：
- ✅ **离线写入** - 无网络时仍可操作，数据保存在本地
- ✅ **自动同步** - 恢复网络后自动同步到云端
- ✅ **实时监听** - 数据变化实时更新UI
- ✅ **多设备同步** - 多个设备同时查看同一数据

### 注意事项：
- 离线数据存储在浏览器IndexedDB中
- 清除浏览器数据会丢失离线缓存
- 建议定期备份重要数据

---

## 💰 Firebase免费额度

Firebase提供免费层级，足够小型餐厅使用：

| 服务 | 免费额度 | 说明 |
|------|---------|------|
| Firestore | 50,000次读/天 | 约1500次读/月/分店 |
| Firestore | 20,000次写/天 | 约600次写/月/分店 |
| 存储 | 5GB | 图片、发票等 |
| 带宽 | 10GB/月 | 数据传输 |
| Auth | 10,000次验证/月 | 用户登录 |

对于单店或少量连锁店，免费额度完全够用！

---

## 🚀 下一步

配置完成后：

1. ✅ 刷新浏览器测试连接
2. ✅ 查看控制台确认Firebase初始化成功
3. ✅ 在Firestore控制台查看数据是否同步
4. ✅ 测试离线功能（断开网络后操作）

---

## 🆘 常见问题

### Q1: 提示"Permission denied"
**A**: 检查Firestore安全规则是否正确配置

### Q2: 数据不同步
**A**: 
- 检查网络连接
- 查看浏览器控制台错误信息
- 确认Firestore已启用

### Q3: 离线功能不工作
**A**: 
- 确认浏览器支持IndexedDB
- 检查是否有多个标签页打开同一应用
- 查看控制台是否有警告信息

### Q4: 如何备份数据？
**A**: 
- 在Firebase控制台 → Firestore → 导出数据
- 或使用第三方工具定期备份

---

**配置完成后，你的系统将拥有：**
- ☁️ 云端数据存储
- 🔄 实时数据同步
- 📱 多设备协同
- 💾 离线工作能力
- 🔒 安全的权限控制
