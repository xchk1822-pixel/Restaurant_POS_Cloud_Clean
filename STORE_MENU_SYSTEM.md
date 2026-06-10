# 🍽️ 连锁店菜单管理系统

## 🎯 **设计思路**

### **核心问题**
连锁餐厅的每个分店可能有：
- ✅ 不同的菜品（地区特色）
- ✅ 不同的价格（消费水平差异）
- ✅ 不同的 availability（库存情况）

### **解决方案**
采用**模板 + 分店自定义**的架构：

```
┌─────────────────────────────────────┐
│      总部菜单模板 (Global)          │
│  - 标准菜品库                        │
│  - 建议价格                          │
│  - 标准配方                          │
└──────────────┬──────────────────────┘
               │
     ┌─────────┼─────────┐
     ▼         ▼         ▼
  分店A      分店B      分店C
  (可自定义) (可自定义) (可自定义)
  - 价格调整  - 价格调整  - 价格调整
  - 停售菜品  - 添加特色  - 全部使用模板
```

---

## 📋 **数据结构**

### **MenuItem 接口扩展**

```typescript
interface MenuItem {
  id: string;
  name: string;
  nameEs?: string;
  price: number;
  category: string;
  image?: string;
  type?: 'dish' | 'beverage' | 'alcohol';
  
  // 连锁店支持
  storeId?: string;        // 分店ID，undefined表示全局模板
  isTemplate?: boolean;    // 是否为总部模板
  basePrice?: number;      // 基础价格（模板价格）
  templateId?: string;     // 关联的模板ID
}
```

---

## 🔧 **使用方法**

### **1. 创建总部菜单模板**

超级管理员在总部创建标准菜单：

```typescript
import { createMenuTemplate } from '../services/menuManagementService';

// 创建模板
await createMenuTemplate({
  name: '宫保鸡丁',
  nameEs: 'Pollo Kung Pao',
  price: 85,
  category: '主菜',
  type: 'dish',
  available: true,
});
```

### **2. 为分店分配菜单**

#### **方法A：从模板批量复制**

```typescript
import { copyTemplatesToStore } from '../services/menuManagementService';

// 将所有模板复制到分店
const templateIds = ['template_001', 'template_002', ...];
await copyTemplatesToStore('store_mn001', templateIds);
```

#### **方法B：单个添加**

在管理界面点击"从总部模板添加菜品"即可。

### **3. 分店自定义价格**

```typescript
import { updateStoreMenuPrice } from '../services/menuManagementService';

// 分店调整价格
await updateStoreMenuPrice('store_mn001', 'menu_item_id', 95);
// 该分店宫保鸡丁价格为C$95，其他分店仍为C$85
```

### **4. 分店停售菜品**

```typescript
import { setMenuAvailability } from '../services/menuManagementService';

// 分店停售某菜品
await setMenuAvailability('store_mn001', 'menu_item_id', false);
```

---

## 🖥️ **管理界面**

访问：**http://localhost:3000/store-menu**

### **功能特性**

1. **分店选择器**
   - 下拉选择要管理的分店
   - 显示分店代码和名称

2. **统计卡片**
   - 菜品总数
   - 在售菜品数
   - 自定义价格数量

3. **模板添加区**
   - 显示所有总部模板
   - 点击即可添加到当前分店

4. **菜单列表**
   - 显示当前分店所有菜品
   - 可修改价格
   - 可停售/上架
   - 显示与模板价格的差异

---

## 📊 **数据流示例**

### **场景1：新开业分店**

```
1. 总部创建标准菜单模板（100个菜品）
2. 为新分店"马那瓜分店"复制所有模板
3. 分店经理根据当地情况：
   - 调整20个菜品价格（±10%）
   - 停售5个不受欢迎的菜品
   - 保持75个菜品使用模板价格
```

### **场景2：价格调整**

```
1. 总部更新模板价格：宫保鸡丁 C$85 → C$90
2. 同步到所有分店（可选）
3. 分店可以选择：
   - 接受新价格
   - 保持自己的价格（如果已自定义）
```

### **场景3：地区特色**

```
分店A（旅游区）：
- 添加海鲜特色菜（本地独有）
- 价格比模板高20%

分店B（居民区）：
- 保持标准菜单
- 价格与模板一致

分店C（商务区）：
- 添加商务套餐
- 部分菜品价格更高
```

---

## 🔍 **查询和比较**

### **查看分店菜单**

```typescript
import { getStoreMenu } from '../services/menuManagementService';

const menu = await getStoreMenu('store_mn001');
// 返回：分店自定义菜单 + 未覆盖的模板菜品
```

### **比较不同分店价格**

```typescript
import { comparePricesAcrossStores } from '../services/menuManagementService';

const comparison = await comparePricesAcrossStores('宫保鸡丁');
console.log(comparison.variants);
// [
//   { storeId: 'store_mn001', price: 95, difference: '+C$10 (+11.76%)' },
//   { storeId: 'store_mn002', price: 85, difference: '相同' },
//   { storeId: 'store_mn003', price: 90, difference: '+C$5 (+5.88%)' }
// ]
```

### **获取价格统计**

```typescript
import { getStorePriceStats } from '../services/menuManagementService';

const stats = await getStorePriceStats('store_mn001');
console.log(stats);
// {
//   totalItems: 95,
//   avgPrice: 67.5,
//   minPrice: 15,
//   maxPrice: 150,
//   customizedCount: 20  // 20个菜品自定义了价格
// }
```

---

## 🔄 **同步机制**

### **总部更新模板**

```typescript
import { syncMenuChangesToStores } from '../services/menuManagementService';

// 将模板变更同步到指定分店
await syncMenuChangesToStores('template_001', [
  'store_mn001',
  'store_mn002',
]);
```

**同步规则：**
- ✅ 更新菜品名称、分类、图片等基本信息
- ✅ 更新配方和库存关联
- ❌ **不覆盖分店自定义价格**（保留分店自主权）
- ✅ 如果分店没有该菜品，则创建新菜品

---

## 💡 **最佳实践**

### **1. 价格策略**

```
建议做法：
- 总部设置基准价格（基于成本+标准利润）
- 允许分店±15%的价格浮动
- 高价区分店可以更高
- 促销时分店可以临时降价
```

### **2. 菜品管理**

```
建议做法：
- 核心菜品（80%）由总部统一管理
- 特色菜品（20%）由分店自主决定
- 季节性菜品定期更新
- 停售菜品保留记录，不要删除
```

### **3. 数据维护**

```
建议做法：
- 每月审查各分店菜单差异
- 分析销售数据，优化菜单
- 统一更新常见菜品的模板
- 保留分店的历史价格记录
```

---

## 🎨 **UI展示逻辑**

### **POS收银台**

POS系统自动加载当前分店的菜单：

```typescript
// 根据用户所在分店加载菜单
const { user } = useAuth();
const menu = await getStoreMenu(user.storeId);

// 显示该分店的菜品和价格
<MenuSelection items={menu} />
```

### **价格显示**

```
正常菜品：
  宫保鸡丁  C$95

自定义价格的菜品：
  宫保鸡丁  C$95
  (模板价: C$85)  ← 提示收银员
  
停售菜品：
  宫保鸡丁  [已停售]  ← 置灰显示
```

---

## 📈 **数据分析**

### **可以分析的指标**

1. **价格差异分析**
   - 哪些分店价格最高/最低
   - 平均价格偏离度
   - 价格与销量的关系

2. **菜品流行度**
   - 各分店畅销菜品对比
   - 地区口味偏好
   - 季节性变化

3. **菜单效率**
   - 每个分店的SKU数量
   - 停售菜品比例
   - 自定义程度

---

## 🚀 **未来扩展**

### **短期优化**
- [ ] 批量价格调整工具
- [ ] 价格审批流程
- [ ] 菜单版本控制

### **中期功能**
- [ ] AI推荐定价
- [ ] 竞争对手价格监控
- [ ] 动态定价（按时段）

### **长期规划**
- [ ] 多语言菜单支持
- [ ] 营养成分管理
- [ ]  allergen过敏原标识

---

## 📝 **总结**

### **优势**
✅ **灵活性** - 每个分店可以独立定价
✅ **一致性** - 总部可以统一管理核心菜单
✅ **可扩展** - 轻松添加新分店
✅ **数据隔离** - 分店之间互不影响
✅ **云端同步** - 实时数据同步

### **适用场景**
- 🏪 连锁餐厅（5-100+分店）
- 🌍 跨地区/跨国连锁
- 💰 不同消费水平的市场
- 🎯 需要本地化运营的 brand

---

**现在你的连锁餐厅系统可以完美支持每个分店独立的菜单和价格了！** 🎉
