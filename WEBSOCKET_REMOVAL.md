# 🔄 数据同步架构变更说明

## 📅 变更日期
2026-05-08

## 🎯 变更内容

### ❌ 已移除
- **WebSocket 局域网同步服务** (`LanSyncService.ts`)
- **WebSocket 服务器** (`websocket-server.ts`, `websocket-server-https.ts`)
- **相关依赖** (`ws`, `@types/ws`, `selfsigned`)

### ✅ 当前架构
系统现在**完全使用 Firebase Firestore** 进行数据同步：

```
┌─────────────────────────────────────┐
│         应用层 (React)              │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│    智能同步服务 (smartSyncService)   │
│  ┌───────────┐    ┌──────────────┐  │
│  │ 在线模式  │    │  离线模式     │  │
│  │ Firestore │    │ localStorage │  │
│  └─────┬─────┘    └──────┬───────┘  │
│        │                 │          │
│        └────┬────────────┘          │
│             ▼                       │
│    待同步队列管理                    │
└─────────────┬───────────────────────┘
              │
              ▼
     ┌────────────────┐
     │ Firebase       │
     │ Firestore      │
     └────────────────┘
```

## 🔧 技术细节

### 1. 数据写入流程
```typescript
// DataService.saveData() - 唯一的数据保存入口
1. 保存到 localStorage (主存储)
2. 如果启用备份模式 → 同步到 Firestore
3. ❌ 不再广播到 WebSocket
```

### 2. 数据读取流程
```typescript
// smartSyncService - 智能数据读取
1. 优先从 Firestore 读取（在线）
2. 降级到 localStorage（离线）
3. 网络恢复后自动同步待同步队列
```

### 3. 实时监听
```typescript
// useFirestoreData Hook
- 使用 Firestore onSnapshot 实时监听
- 替代了 WebSocket 的实时更新
- 支持离线持久化
```

## 📦 已删除的文件

### 客户端
- `client/src/services/LanSyncService.ts` - WebSocket 客户端服务

### 服务端
- `server/websocket-server.ts` - HTTP WebSocket 服务器
- `server/websocket-server-https.ts` - HTTPS WebSocket 服务器

### 依赖包
```json
// server/package.json 已移除
{
  "@types/ws": "^8.18.1",
  "ws": "^8.20.0",
  "selfsigned": "^5.5.0"
}
```

## ✨ 优势

### 1. 简化架构
- ❌ 无需维护 WebSocket 服务器
- ❌ 无需处理 SSL 证书
- ❌ 无需配置防火墙端口
- ✅ 直接使用 Firebase 基础设施

### 2. 更好的可靠性
- ✅ Firebase 全球 CDN 加速
- ✅ 自动负载均衡
- ✅ 99.95%+ 可用性保证
- ✅ 内置安全规则

### 3. 更低的成本
- ❌ 无需单独部署 WebSocket 服务器
- ❌ 无需维护服务器基础设施
- ✅ Firebase 免费额度充足（Spark 计划）

### 4. 更好的扩展性
- ✅ 自动扩展到数百万并发用户
- ✅ 无需手动扩容
- ✅ 全球多区域部署

## 🔒 安全性

### Firebase Security Rules
所有数据访问都通过 Firestore 安全规则控制：

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // 根据用户角色和分店隔离数据
    match /{collection}/{document} {
      allow read, write: if isAuthenticated() && hasStoreAccess();
    }
  }
}
```

## 📊 性能对比

| 特性 | WebSocket | Firebase Firestore |
|------|-----------|-------------------|
| 延迟 | ~10-50ms (局域网) | ~50-200ms (全球) |
| 可靠性 | 需自行维护 | 99.95%+ SLA |
| 扩展性 | 有限 | 无限 |
| 运维成本 | 高 | 低 |
| 离线支持 | ❌ | ✅ |
| 实时同步 | ✅ | ✅ |

## 🚀 迁移步骤（已完成）

1. ✅ 移除 `LanSyncService` 导入和使用
2. ✅ 删除 WebSocket 服务器文件
3. ✅ 清理 package.json 依赖
4. ✅ 验证 Firestore 同步正常工作
5. ✅ 测试离线功能

## 📝 注意事项

### 1. 网络要求
- 需要互联网连接才能同步到云端
- 离线时仍可正常使用（localStorage）
- 网络恢复后自动同步

### 2. 配额管理
- Firebase Spark 计划（免费版）：
  - 50,000 次读/天
  - 20,000 次写/天
  - 1 GB 存储空间
- 超出后自动升级到 Blaze 计划（按量付费）

### 3. 数据一致性
- 使用 `updatedAt` 时间戳解决冲突
- 以最新修改为准
- 支持多设备协同

## 🔍 故障排查

### 问题：数据不同步
**检查清单：**
1. 确认网络连接正常
2. 检查 Firebase 控制台是否有错误
3. 查看浏览器控制台日志
4. 检查 Firestore 安全规则
5. 验证 `backupMode` 是否启用

### 问题：离线功能不工作
**解决方案：**
1. 确认浏览器支持 IndexedDB
2. 检查是否启用了离线持久化
3. 查看 `pending_firestore_changes` 队列

## 📞 技术支持

如需帮助，请检查：
1. Firebase 控制台 → Firestore → 使用情况
2. 浏览器控制台 → Network 标签
3. localStorage → `pending_firestore_changes`

---

**总结：**
- ✅ 架构更简洁
- ✅ 运维更简单
- ✅ 可靠性更高
- ✅ 成本更低

**系统现在完全基于 Firebase，无需任何额外的服务器组件！** 🎉
