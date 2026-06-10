# 🏪 分店账号管理体系

## 🎯 **设计理念**

超级管理员创建分店时，需要同时创建该分店的各个角色账号，确保每个角色登录后有对应的入口和功能。

---

## 👥 **角色体系**

### **1. 超级管理员 (super_admin)**
- **权限**：管理所有分店、查看所有数据
- **登录入口**：仪表板 → 可切换查看任意分店

### **2. 店长 (store_manager)**
- **权限**：管理单个分店的所有业务
- **登录入口**：仪表板 → 只能看到自己分店的数据
- **功能**：
  - ✅ 查看分店报表
  - ✅ 管理员工
  - ✅ 管理库存
  - ✅ 管理客户
  - ✅ 审批订单修改/取消

### **3. 收银员 (cashier)**
- **权限**：仅POS收银功能
- **登录入口**：直接进入POS页面
- **功能**：
  - ✅ 点餐收银
  - ✅ 查看当日订单
  - ❌ 不能查看报表
  - ❌ 不能管理库存

### **4. 厨师 (chef)**
- **权限**：仅厨房显示功能
- **登录入口**：直接进入厨房页面
- **功能**：
  - ✅ 查看待制作订单
  - ✅ 更新菜品状态
  - ❌ 不能收银
  - ❌ 不能查看报表

---

## 📋 **创建分店流程**

### **步骤1：填写分店信息**
```
分店名称：马那瓜分店A
分店代码：MN001
地址：马那瓜市中心
电话：+505 1234-5678
货币：C$
税率：15%
营业时间：09:00-22:00
```

### **步骤2：创建账号**

#### **店长账号**
```
姓名：张店长
用户名：manager_mn001
密码：******
角色：store_manager
关联分店：MN001
```

#### **收银员账号（可创建多个）**
```
姓名：李收银
用户名：cashier_mn001_01
密码：******
角色：cashier
关联分店：MN001
```

#### **厨师账号（可创建多个）**
```
姓名：王厨师
用户名：chef_mn001_01
密码：******
角色：chef
关联分店：MN001
```

### **步骤3：完成创建**
- 保存分店信息
- 创建用户账号
- 初始化分店菜单（可选）
- 发送账号信息给相关人员

---

## 🔐 **账号数据结构**

```typescript
interface User {
  id: string;
  username: string;
  password: string; // 实际应该加密存储
  name: string;
  role: 'super_admin' | 'store_manager' | 'cashier' | 'chef';
  storeId?: string; // 超级管理员为空，其他有分店ID
  storeName?: string;
  createdAt: Date;
  lastLogin?: Date;
  status: 'active' | 'inactive';
}
```

---

## 🚪 **登录后的路由跳转**

根据角色自动跳转到不同页面：

```typescript
// 登录成功后
if (user.role === 'cashier') {
  navigate('/pos'); // 收银员直接到POS
} else if (user.role === 'chef') {
  navigate('/kitchen'); // 厨师直接到厨房
} else if (user.role === 'store_manager') {
  navigate('/dashboard'); // 店长到仪表板
} else if (user.role === 'super_admin') {
  navigate('/dashboard'); // 超级管理员到仪表板
}
```

---

## 📊 **菜单显示逻辑**

根据角色过滤侧边栏菜单：

```typescript
const menuItems = [
  { path: '/dashboard', label: '仪表板', roles: ['super_admin', 'store_manager'] },
  { path: '/pos', label: 'POS收银', roles: ['super_admin', 'store_manager', 'cashier'] },
  { path: '/kitchen', label: '厨房显示', roles: ['super_admin', 'store_manager', 'chef'] },
  { path: '/inventory', label: '库存管理', roles: ['super_admin', 'store_manager'] },
  { path: '/employees', label: '员工管理', roles: ['super_admin', 'store_manager'] },
  { path: '/customers', label: '客户管理', roles: ['super_admin', 'store_manager'] },
  { path: '/stores', label: '分店管理', roles: ['super_admin'] },
  { path: '/reports', label: '报表中心', roles: ['super_admin', 'store_manager'] },
];

// 过滤当前角色可见的菜单
const visibleMenus = menuItems.filter(item => 
  item.roles.includes(user.role)
);
```

---

## 💡 **实施建议**

### **方案A：在分店管理中集成账号创建**（推荐）

修改 `Stores.tsx`，添加多步骤向导：

```
第1步：分店基本信息
  ↓
第2步：创建店长账号
  ↓
第3步：创建收银员账号（可选，可多个）
  ↓
第4步：创建厨师账号（可选，可多个）
  ↓
第5步：确认并创建
```

### **方案B：独立的账号管理模块**

创建新的 `UserManagement.tsx`：
- 超级管理员可以创建/编辑/删除用户
- 分配角色和分店
- 重置密码
- 查看登录记录

### **方案C：两者结合**

- 创建分店时快速创建基础账号（店长+1收银+1厨师）
- 后续可在账号管理中添加更多账号

---

## 🔧 **需要修改的文件**

### **1. Stores.tsx**
- 添加多步骤表单
- 创建分店后自动创建用户账号
- 保存用户数据到localStorage/Firestore

### **2. AuthContext.tsx**
- 已有用户认证功能
- 需要添加用户CRUD操作

### **3. Login.tsx**
- 已有角色选择
- 需要验证用户名密码
- 从Firestore/localStorage读取用户数据

### **4. MainLayout.tsx**
- 已有基于角色的菜单过滤
- 无需修改

---

## 📝 **示例代码：创建用户**

```typescript
// 在Stores.tsx中添加
const createUser = (userData: {
  username: string;
  password: string;
  name: string;
  role: string;
  storeId?: string;
  storeName?: string;
}) => {
  const users = JSON.parse(localStorage.getItem('users') || '[]');
  
  const newUser = {
    id: `user_${Date.now()}`,
    ...userData,
    createdAt: new Date().toISOString(),
    status: 'active',
  };
  
  users.push(newUser);
  localStorage.setItem('users', JSON.stringify(users));
  
  return newUser;
};

// 创建分店时调用
const handleCreateStore = () => {
  // 1. 创建分店
  const newStore = { /* ... */ };
  setStores([...stores, newStore]);
  
  // 2. 创建店长账号
  createUser({
    username: accounts.manager.username,
    password: accounts.manager.password,
    name: accounts.manager.name,
    role: 'store_manager',
    storeId: newStore.id,
    storeName: newStore.name,
  });
  
  // 3. 创建收银员账号
  if (accounts.cashier.username) {
    createUser({
      username: accounts.cashier.username,
      password: accounts.cashier.password,
      name: accounts.cashier.name,
      role: 'cashier',
      storeId: newStore.id,
      storeName: newStore.name,
    });
  }
  
  // 4. 创建厨师账号
  if (accounts.chef.username) {
    createUser({
      username: accounts.chef.username,
      password: accounts.chef.password,
      name: accounts.chef.name,
      role: 'chef',
      storeId: newStore.id,
      storeName: newStore.name,
    });
  }
  
  alert('✅ 分店及账号创建成功！');
};
```

---

## 🎨 **UI设计建议**

### **多步骤向导界面**

```
┌─────────────────────────────────────┐
│  创建新分店                          │
├─────────────────────────────────────┤
│                                     │
│  步骤指示器：                        │
│  ●━━━●━━━○                         │
│  1    2    3                        │
│ 分店 账号 完成                       │
│                                     │
├─────────────────────────────────────┤
│                                     │
│  [表单内容]                         │
│                                     │
├─────────────────────────────────────┤
│           [< 上一步] [下一步 >]     │
└─────────────────────────────────────┘
```

---

## ✅ **总结**

**核心要点：**
1. ✅ 创建分店时必须创建账号
2. ✅ 每个角色有不同的登录入口
3. ✅ 基于角色显示不同的菜单
4. ✅ 店长只能管理自己的分店
5. ✅ 收银员和厨师直接进入工作页面

**下一步：**
- 完善Stores.tsx的多步骤表单
- 实现用户账号的CRUD
- 测试登录和权限控制

需要我帮你实现完整的多步骤创建向导吗？😊
