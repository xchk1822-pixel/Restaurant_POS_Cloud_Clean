# 🚀 快速开始 - 全系统数据互通测试

## ✅ 已完成的工作

### 1. Firebase云端存储配置
- ✅ Firebase项目已创建：`restaurant-pos-1b420`
- ✅ Firestore数据库已配置
- ✅ 所有集合名称已定义

### 2. 数据同步服务
- ✅ `dataSync.ts` - 统一的CRUD操作服务
- ✅ 离线优先策略（先存本地，再同步云端）
- ✅ 实时监听支持
- ✅ 批量写入支持

### 3. 演示数据初始化
- ✅ `initDemoData.ts` - 数据初始化脚本
- ✅ 包含真实的尼加拉瓜餐厅数据
- ✅ 2个分店、6个用户、20个菜品等

### 4. 全局汇率配置
- ✅ 汇率设置页面 `/exchange-rate`
- ✅ 积分兑换率统一管理
- ✅ 所有模块自动同步

### 5. 测试页面
- ✅ 数据初始化页面 `/data-init`
- ✅ Firebase测试页面 `/firebase-test`
- ✅ 离线测试页面 `/offline-test`

---

## 🎯 立即开始测试

### 步骤1️⃣：访问应用
```
http://localhost:3000
```

### 步骤2️⃣：初始化演示数据
```
http://localhost:3000/data-init
```
点击"🚀 开始初始化演示数据"按钮

### 步骤3️⃣：登录系统

#### 推荐测试账号：

**超级管理员**（管理所有功能）
```
用户名：admin
密码：admin123
```

**收银员**（测试POS收银）
```
用户名：cashier_mn001_01
密码：123456
```

**服务生**（测试移动点餐）
```
用户名：waiter_mn001_01
密码：123456
```

**厨师**（测试厨房管理）
```
用户名：chef_mn001_01
密码：123456
```

---

## 📋 核心测试场景

### 场景1：完整点餐流程

1. **服务生点餐**
   - 登录服务生账号
   - 选择桌台A1
   - 添加菜品：烤鸡套餐 x2、可乐 x2
   - 提交订单

2. **厨房接单**
   - 登录厨师账号
   - 查看待制作订单
   - 标记为"制作中"
   - 完成后标记"已完成"

3. **POS收银**
   - 登录收银员账号
   - 查看桌台A1的订单
   - 点击结账
   - 选择支付方式（现金NIO）
   - 完成支付

4. **验证数据同步**
   - 检查Firebase Console中的orders集合
   - 检查库存是否扣减
   - 检查客户积分是否增加

---

### 场景2：分店管理

1. **创建新分店**
   - 登录admin账号
   - 进入"🏢 分店管理"
   - 点击"➕ 创建分店"
   - 填写分店信息
   - 创建员工账号（店长、收银、服务生、厨师）
   - 保存

2. **验证数据**
   - 在Firebase Console查看stores集合
   - 查看users集合是否有新员工
   - 尝试用新员工账号登录

---

### 场景3：汇率统一配置

1. **修改汇率**
   - 登录admin账号
   - 进入"💱 汇率设置"
   - 修改：1 USD = 37.5 NIO（原来是36.5）
   - 保存

2. **验证同步**
   - 退出登录
   - 登录收银员账号
   - 进入POS支付界面
   - 查看汇率是否已更新为37.5
   - 进入交接班页面
   - 查看汇率是否也是37.5

---

### 场景4：库存联动

1. **查看初始库存**
   - 登录店长账号
   - 进入"📦 库存管理"
   - 记录鸡肉库存：50kg

2. **POS销售**
   - 登录收银员账号
   - 创建订单：烤鸡套餐 x5
   - 完成支付

3. **验证库存扣减**
   - 回到库存管理
   - 查看鸡肉库存是否减少
   - 应该少于50kg

---

### 场景5：客户积分

1. **选择会员**
   - POS收银时
   - 点击"选择客户"
   - 选择"Laura Fernández"（1200积分）

2. **使用积分**
   - 启用积分抵扣
   - 输入使用积分：500
   - 查看抵扣金额

3. **累积积分**
   - 完成支付
   - 查看客户新积分
   - 应该增加（消费金额的10%）

---

## 🔍 数据验证方法

### 方法1：Firebase Console
1. 访问 https://console.firebase.google.com
2. 选择项目：restaurant-pos-1b420
3. 左侧菜单 → Firestore Database
4. 查看各个集合的数据

### 方法2：浏览器控制台
```javascript
// 查看所有分店
import { storeService } from './services/dataSync';
const stores = await storeService.getAll();
console.log('分店列表:', stores);

// 查看所有订单
import { orderService } from './services/dataSync';
const orders = await orderService.getAll();
console.log('订单列表:', orders);

// 查看库存
import { inventoryService } from './services/dataSync';
const inventory = await inventoryService.getAll('store_001');
console.log('库存列表:', inventory);
```

### 方法3：localStorage检查
打开浏览器控制台 → Application → Local Storage
- `local_stores` - 缓存的分店数据
- `local_orders` - 缓存的订单数据
- `pending_sync_orders` - 待同步的订单

---

## 🐛 常见问题快速修复

### 问题：看不到数据
```javascript
// 在控制台运行
localStorage.clear();
location.reload();
```

### 问题：数据不同步
```javascript
// 手动触发同步
import { syncPendingData } from './services/dataSync';
await syncPendingData();
```

### 问题：Firebase连接失败
1. 检查网络
2. 访问 `/firebase-test` 测试连接
3. 检查firebase/config.ts配置

---

## 📊 测试检查清单

### 基础功能
- [ ] 所有账号可以登录
- [ ] 菜单权限正确
- [ ] 数据从Firebase加载
- [ ] 汇率全局同步

### 业务流程
- [ ] 服务生点餐 → 厨房 → POS收银
- [ ] 库存自动扣减
- [ ] 客户积分累积
- [ ] 交接班报表正确

### 数据同步
- [ ] 多设备数据一致
- [ ] 离线模式可用
- [ ] 联网后自动同步
- [ ] 无数据冲突

### 异常处理
- [ ] 网络中断不崩溃
- [ ] 非法输入有提示
- [ ] 权限控制有效
- [ ] 错误日志清晰

---

## 📞 需要帮助？

### 查看详细文档
- [TESTING_GUIDE.md](./TESTING_GUIDE.md) - 完整测试指南
- [FIREBASE_INTEGRATION_COMPLETE.md](./FIREBASE_INTEGRATION_COMPLETE.md) - Firebase集成说明
- [GLOBAL_EXCHANGE_RATE.md](./GLOBAL_EXCHANGE_RATE.md) - 汇率配置说明
- [MULTI_STORE_SYSTEM.md](./MULTI_STORE_SYSTEM.md) - 多分店架构

### 调试技巧
1. 打开浏览器开发者工具（F12）
2. 查看Console标签的错误信息
3. 查看Network标签的网络请求
4. 查看Application标签的本地存储

---

## 🎉 开始测试吧！

现在你可以：
1. 访问 http://localhost:3000/data-init 初始化数据
2. 使用测试账号登录
3. 按照测试场景逐步验证
4. 发现问题及时记录

**祝测试顺利！有任何问题随时告诉我！** 😊
