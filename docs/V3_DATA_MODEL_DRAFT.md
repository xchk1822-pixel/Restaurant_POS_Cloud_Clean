# V3 Data Model Draft

## 目标

这份文档定义商用 V3 的 Firestore 数据模型草案。后续页面、服务层、权限和同步逻辑都围绕这个模型实现。

设计原则：
- `storeId` 是分店数据隔离核心字段。
- 云端 Firestore 是权威数据源。
- 本地缓存只做离线使用和待同步队列。
- 所有核心业务数据必须有版本、更新时间和操作日志。
- 所有会影响财务、库存、订单状态的操作必须可追溯。
- 不把大图片、base64、临时 UI 状态写进 Firestore 核心文档。

## 通用字段

大多数业务集合建议包含：

```ts
type BaseDoc = {
  id: string;
  storeId?: string;        // 分店隔离字段，跨店公共数据可为空
  createdAt: Timestamp;    // Firestore serverTimestamp
  updatedAt: Timestamp;    // Firestore serverTimestamp
  createdBy?: string;      // userId
  updatedBy?: string;      // userId
  version: number;         // 每次业务更新递增
  isDeleted?: boolean;     // 软删除
  deletedAt?: Timestamp;
  deletedBy?: string;
};
```

客户端本地缓存可额外保留：

```ts
type LocalSyncMeta = {
  localUpdatedAt: number;
  syncStatus: 'synced' | 'pending' | 'failed';
  pendingOperationId?: string;
};
```

## 集合设计

### stores

用途：分店资料。

字段：
- `name`
- `code`
- `address`
- `phone`
- `timezone`: 固定建议 `America/Managua`
- `currency`: 固定建议 `NIO`
- `active`
- `settings`

说明：
- 老板/admin 可以读取所有分店。
- 店长和员工只能读取自己所属分店。

### users

用途：登录账号和身份。

字段：
- `username`
- `displayName`
- `roleId`
- `roleCode`
- `storeId`
- `active`
- `language`: `zh-CN` 或 `es-NI`
- `passwordHash` 或 Firebase Auth UID 映射
- `lastLoginAt`

说明：
- 商用版建议逐步迁移到 Firebase Auth。
- 如果继续使用本地用户名密码，密码不能明文保存。

### roles

用途：固定角色。

固定角色：
- `manager`: 店长
- `cashier`: 收银
- `waiter`: 服务生
- `chef`: 厨师

字段：
- `code`
- `nameKey`
- `descriptionKey`
- `isSystemRole`
- `active`

说明：
- 角色固定，不允许重复创建。
- 权限可配置。

### permissions

用途：角色权限配置。

字段：
- `roleCode`
- `storeId?`
- `permissions`: string[]
- `updatedAt`

示例权限：
- `pos.view`
- `pos.order.create`
- `pos.order.cancel`
- `pos.payment.create`
- `table.clear`
- `inventory.view`
- `inventory.adjust`
- `finance.view`
- `employee.manage`
- `settings.manage`

### tables

用途：分店桌台。

字段：
- `storeId`
- `number`
- `capacity`
- `x`
- `y`
- `width`
- `height`
- `status`: `available` | `occupied` | `needs_cleaning` | `reserved`
- `currentOrderId?`
- `lastOrderId?`
- `area?`
- `version`

规则：
- POS 和服务生端必须读取同一个 `tables` 集合。
- 添加/删除桌台必须按 `storeId + number` 去重。
- 已占用或待清台桌台不能被旧数据覆盖成空闲。

### orders

用途：订单主表。

字段：
- `storeId`
- `orderNumber`
- `businessDate`: 尼加拉瓜本地日期，如 `2026-06-09`
- `tableId?`
- `tableNumber?`
- `orderType`: `dine_in` | `takeout` | `delivery`
- `status`: `draft` | `confirmed` | `preparing` | `served` | `paid` | `completed` | `cancelled`
- `paymentStatus`: `unpaid` | `partial` | `paid` | `refunded`
- `items`
- `subtotal`
- `discountAmount`
- `serviceFeeAmount`
- `taxAmount`
- `deliveryFee`
- `totalAmount`
- `paidAmount`
- `createdAt`
- `confirmedAt?`
- `servedAt?`
- `paidAt?`
- `completedAt?`
- `cancelledAt?`
- `clearedAt?`
- `cancelReason?`
- `cancelledBy?`
- `stockDeducted`
- `stockDeductedAt?`
- `stockDeductionOperationId?`
- `version`

订单商品字段：

```ts
type OrderItem = {
  id: string;
  menuItemId: string;
  name: string;             // 业务数据直接西语
  quantity: number;
  sentQuantity: number;
  cancelledQuantity?: number;
  price: number;
  subtotal: number;
  type?: 'direct' | 'recipe' | 'none';
  stockItemId?: string;
  ingredients?: Array<{
    itemId: string;
    quantity: number;
    unit: string;
  }>;
  status?: 'draft' | 'sent' | 'cancelled';
};
```

规则：
- POS 右侧只查当天 `businessDate` 的订单。
- 历史订单按日期筛选，并按新订单在前排序。
- 订单编号必须按分店和本地日期生成，避免多设备重复。
- 取消、支付、清台必须写日志。
- 支付状态和订单完成状态分开处理。
- 允许顾客先支付后继续用餐，中途继续加菜。
- 支付只写 `payments` 和订单 `paymentStatus`，不扣库存。
- 库存只在订单进入 `completed` 时一次性扣减。
- 完成扣库存必须以整单最终有效数量为准，包含中途加菜，排除已授权取消/减少的数量。
- `stockDeducted` 为 true 的订单不能再次扣库存。

### orderLogs

用途：订单操作日志。

字段：
- `storeId`
- `orderId`
- `action`
- `operatorId`
- `operatorName`
- `authorizedBy?`
- `reason?`
- `before?`
- `after?`
- `createdAt`

常见 action：
- `create`
- `confirm`
- `send_to_kitchen`
- `item_add_after_sent`
- `item_reduce_after_sent`
- `item_cancel`
- `payment`
- `cancel_order`
- `clear_table`

### menuItems

用途：菜品。

字段：
- `storeId`
- `name`: 西语菜名
- `description?`: 西语描述
- `categoryId`
- `categoryName`
- `price`
- `active`
- `sortOrder`
- `type`: `direct` | `recipe` | `none`
- `stockItemId?`
- `ingredients?`
- `imageThumbUrl?`
- `imageMediumUrl?`
- `imageOriginalUrl?`
- `imageStoragePath?`
- `imageHash?`
- `imageUpdatedAt?`
- `version`

规则：
- 菜品和库存物品不做双语字段。
- 图片 URL 存 Firestore，图片文件存 Firebase Storage 或静态资源。
- POS 列表优先使用 `imageThumbUrl`。

### inventoryItems

用途：库存物品。

字段：
- `storeId`
- `name`: 西语名称
- `categoryId`
- `unit`
- `warehouseQty`
- `fridgeQty`
- `totalQty`
- `minQty`
- `costPrice?`
- `active`
- `version`

规则：
- `totalQty = warehouseQty + fridgeQty`。
- 销售优先扣 `fridgeQty`。
- `fridgeQty` 不足时扣 `warehouseQty`。
- 所有变化必须写 `inventoryMovements`。

### inventoryMovements

用途：库存流水。

字段：
- `storeId`
- `itemId`
- `type`: `purchase` | `sale` | `transfer_to_fridge` | `stocktake_adjustment` | `return` | `manual_adjustment`
- `qty`
- `fromLocation?`: `warehouse` | `fridge`
- `toLocation?`: `warehouse` | `fridge`
- `beforeWarehouseQty`
- `beforeFridgeQty`
- `afterWarehouseQty`
- `afterFridgeQty`
- `orderId?`
- `purchaseId?`
- `reason?`
- `operationId`
- `createdAt`
- `createdBy`

规则：
- `operationId` 用于幂等，避免重复扣库存。
- 库存扣减必须事务化。
- POS 下单和支付不生成 `sale` 库存流水。
- 只有订单完成时生成 `sale` 库存流水。
- 订单完成扣减时，先扣 `fridgeQty`，不足部分再扣 `warehouseQty`。
- 未完成订单取消时不生成库存恢复流水，因为库存尚未扣减。
- 已完成订单需要作废、退款或退菜时，必须生成冲正/退货库存流水，不能直接改历史销售流水。

### purchases

用途：采购记录。

字段：
- `storeId`
- `supplierId?`
- `items`
- `totalAmount`
- `paymentStatus`
- `businessDate`
- `createdAt`
- `createdBy`
- `linkedInventoryMovementIds`

规则：
- 采购支出进入财务的采购支出分类。
- 采购入库必须写库存流水。

### expenses

用途：日常开支。

字段：
- `storeId`
- `category`
- `amount`
- `note`
- `businessDate`
- `createdAt`
- `createdBy`

规则：
- 日常开支和采购支出分开。

### payments

用途：支付流水。

字段：
- `storeId`
- `orderId`
- `businessDate`
- `method`: `cash` | `card` | `mixed`
- `cashAmount`
- `cardAmount`
- `currency`
- `exchangeRate?`
- `createdAt`
- `createdBy`

规则：
- 订单支付必须写 payments。
- 财务收入来自 payments 汇总，不只读订单字段。

### employees

用途：员工资料。

字段：
- `storeId`
- `name`
- `phone?`
- `roleCode`
- `userId?`
- `active`
- `hireDate?`
- `salaryConfig?`

### attendance

用途：考勤。

字段：
- `storeId`
- `employeeId`
- `businessDate`
- `clockInAt`
- `clockOutAt?`
- `status`

### loans

用途：员工借款。

字段：
- `storeId`
- `employeeId`
- `amount`
- `remainingAmount`
- `status`
- `createdAt`
- `createdBy`

### customers

用途：顾客和积分。

字段：
- `storeId`
- `name`
- `phone`
- `points`
- `totalSpent`
- `visitCount`
- `lastVisitAt`

### mediaAssets

用途：图片资源元数据。

字段：
- `storeId?`
- `ownerType`: `menuItem` | `inventoryItem` | `store` | `other`
- `ownerId`
- `thumbUrl`
- `mediumUrl`
- `originalUrl?`
- `storagePath`
- `hash`
- `width`
- `height`
- `sizeBytes`
- `mimeType`
- `createdAt`
- `createdBy`

### translations

用途：系统固定文案翻译，不存菜品/库存业务名称。

字段：
- `key`
- `zh-CN`
- `es-NI`
- `module`

## 查询和索引建议

常用查询：
- `orders`: `storeId + businessDate + createdAt desc`
- `orders`: `storeId + status + businessDate`
- `tables`: `storeId + number`
- `menuItems`: `storeId + active + categoryId + sortOrder`
- `inventoryItems`: `storeId + active + categoryId`
- `inventoryMovements`: `storeId + itemId + createdAt desc`
- `payments`: `storeId + businessDate + createdAt`
- `expenses`: `storeId + businessDate + category`
- `purchases`: `storeId + businessDate`

## 同步规则

### 云端优先

- 在线时，读写以 Firestore 为准。
- 本地只保存最近数据和待同步队列。
- 云端数据比本地版本新时，云端覆盖本地。
- 本地有未同步操作时，不允许旧云端快照覆盖本地待同步状态。

### 幂等操作

关键操作必须生成 `operationId`：
- 确认下单
- 支付
- 订单完成库存扣减
- 取消订单
- 清台
- 采购入库
- 库存调拨
- 盘点调整

重复提交同一个 `operationId` 时，不重复执行。

### 冲突处理

优先规则：
1. 已支付、已取消、已完成状态不能被旧状态覆盖。
2. 已占用或待清台桌台不能被旧空闲状态覆盖。
3. 库存数量只能通过库存流水改变，不能直接被旧快照覆盖。
4. 财务流水不能被覆盖，只能新增冲正记录。

## 下一步

需要确认：
- 库存扣减时机：已确认，订单完成时一次性扣减；确认下单和支付都不扣。
- 取消订单是否恢复库存。
- 已支付订单是否允许取消。
- 日结锁账是否必须。
- 图片原图是否长期保留。
- 老板手机端是否只读，还是允许远程审批。
