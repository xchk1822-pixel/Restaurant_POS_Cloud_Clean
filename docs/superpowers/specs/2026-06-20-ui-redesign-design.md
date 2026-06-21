# Restaurant POS UI Redesign Design Spec

## Goal

把当前餐厅 POS 系统的界面升级为更像商业软件的视觉质量，同时严格限制为 UI 层改造，不改订单、库存、权限、同步、财务计算、分店隔离等业务逻辑。

## Confirmed Direction

采用组合方案：

- 后台管理主系统：使用 `A. 运营后台专业版`。
- 老板手机端：吸收 `B. 老板移动数据版`。
- POS 前台和服务生端：使用 `C. POS 前台效率版`。

## Non-Goals

本轮不做：

- 不改 Firestore 路径。
- 不改 localStorage key。
- 不改库存扣减。
- 不改订单状态。
- 不改权限判断。
- 不改报表计算公式。
- 不改实时订阅策略。
- 不做大重构。

如果为了 UI 需要抽组件，只允许抽纯展示组件或 CSS token，不改变 props 的业务含义。

## Design Principles

### 1. Commercial Operations UI

后台界面应该像成熟的餐饮 SaaS 管理系统：

- 高信息密度，但层级清楚。
- 少用纯黑粗边框。
- 少用大块高饱和颜色。
- 卡片阴影轻，边框清淡。
- 表格和列表适合长期使用，不做营销页风格。

### 2. POS Efficiency UI

POS 给当地员工使用：

- 西语优先。
- 按钮大、状态明确。
- 桌台和订单状态颜色强：红色占用，橙色已支付待清台，自然色空闲。
- 不牺牲速度，不增加复杂动画。

### 3. Owner Mobile Readability

老板后台需要适合手机查看：

- KPI 摘要优先。
- 图表和分店卡片在手机上纵向排列。
- 不把移动端塞满小表格。
- 关键金额、订单、盈亏、欠款要一眼看到。

## Visual Tokens

建议新增轻量 UI token 文件：

```text
client/src/styles/uiTokens.ts
```

只导出常量，不包含业务逻辑。

核心 token：

- Page background: `#f5f7fb`
- Surface: `#ffffff`
- Surface muted: `#f8fafc`
- Border: `#dbe3ee`
- Text primary: `#1f2937`
- Text secondary: `#64748b`
- Accent teal: `#0f766e`
- Accent blue: `#2563eb`
- Accent amber: `#d97706`
- Danger: `#dc2626`
- Success: `#16a34a`
- Radius small: `6`
- Radius medium: `10`
- Radius large: `14`
- Shadow soft: `0 12px 32px rgba(15, 23, 42, 0.08)`

## Component Direction

### App Shell / Navigation

Applicable screen:

- `client/src/components/Layout/MainLayout.tsx`

Rules:

- Keep the current permission-driven menu filtering.
- Replace heavy white header/sidebar with a more deliberate operations shell:
  - slim top bar,
  - calm sidebar,
  - clearer active states,
  - less visual noise.
- Fullscreen pages such as POS, waiter, and kitchen should keep the floating menu pattern, but the floating trigger and modal should look more polished.
- Navigation labels should be cleaned only where the intended Chinese/Spanish text is already clear. Do not guess missing text if mojibake hides business meaning.

### Login

Applicable screen:

- `client/src/pages/Login/Login.tsx`

Rules:

- Use a professional restaurant operations login page, not a generic gradient demo.
- Keep existing credential flow and redirects.
- Make store/account context clearer.
- Do not add SSO, forgot password, or new authentication paths.

### Shared Admin Shell

Applicable screens:

- Inventory
- Menu Management
- Employees
- Manager Dashboard
- Financial Reports
- Settings
- Owner Dashboard

Rules:

- Page container: light gray background, 20-24px padding.
- Header: title, subtitle, right actions in one row.
- Toolbars: compact, one row on desktop, wrap on mobile.
- Cards: 10-14px radius, soft border, subtle shadow.
- Tables/lists: sticky-looking header style, smaller row height, clear hover.
- Buttons:
  - Primary: teal or blue filled.
  - Secondary: white surface with border.
  - Danger: red filled only for destructive action.

### POS Screen

Applicable screens:

- `client/src/pages/POS/POS.tsx`
- `client/src/components/MenuSelection.tsx`
- `client/src/pages/WaiterInterface/WaiterInterface.tsx`

Rules:

- Keep current layout structure unless a specific UI issue requires adjustment.
- Order buttons should remain fast and prominent.
- Use Spanish labels for employee-facing actions where already agreed.
- Avoid decorative cards inside cards.
- Tables retain real image asset and image-tint state model.
- Menu category controls should be fixed-height and not cause layout jump.

### Kitchen Display

Applicable screens:

- `client/src/pages/Kitchen/Kitchen.tsx`
- `client/src/pages/POS/KitchenDisplay.tsx`

Rules:

- Kitchen cards should emphasize order age, table/channel, and item status.
- High contrast is acceptable because this is an operational screen.
- Do not change kitchen order filtering, status update, or order timing logic.

### Employee Management

Applicable screens:

- `client/src/pages/Employees/Employees.tsx`
- `client/src/pages/Employees/EmployeeList.tsx`
- `client/src/pages/Employees/AttendanceManagement.tsx`
- `client/src/pages/Employees/LoanManagement.tsx`
- `client/src/pages/Employees/SalarySettlement.tsx`

Rules:

- Use the same admin shell style as inventory and manager pages.
- Employee lists should be compact and scan-friendly.
- Loan and salary screens should visually separate active debt, settled records, and action forms.
- Do not change loan offset, salary settlement, or expense linkage logic.

### Manager Analytics

Applicable screen:

- `client/src/pages/Manager/Dashboard.tsx`

Rules:

- Keep the existing analytics logic.
- Refine typography and contrast: less black bold text, more slate hierarchy.
- Keep 5 KPI cards in one desktop row when possible.
- Mobile layout stacks KPI cards and charts cleanly.
- Monthly calendar remains visually prominent.

### Financial Reports

Applicable screen:

- `client/src/pages/Manager/FinancialReports.tsx`

Rules:

- UI view: compact filter area, KPI summary grid, then details.
- Print view: A4 density, clear hierarchy, no excessive spacing.
- Do not change financial formulas.
- Keep daily detail vs weekly/monthly summary behavior.

### Settings / Permissions

Applicable screens:

- `client/src/pages/Settings/PermissionsModule.tsx`
- `client/src/pages/Settings/DataBackup.tsx`
- `client/src/pages/Manager/Stores.tsx`
- `client/src/pages/Manager/ExchangeRateSettings.tsx`

Rules:

- Settings should feel calmer than POS: clean forms, clear destructive buttons, grouped permission sections.
- Do not change role permission defaults or save paths.
- Store management must keep current branch data behavior.

### Inventory / Menu Management

Applicable screens:

- `client/src/pages/Inventory/Inventory.tsx`
- `client/src/pages/Inventory/MenuManagement.tsx`
- `client/src/pages/Inventory/WarehouseStocktake.tsx`
- `client/src/pages/Inventory/FridgeStocktake.tsx`
- `client/src/pages/Inventory/SupplierManagement.tsx`

Rules:

- Toolbars must not occupy too much vertical space.
- Lists and cards must be visible without excessive scrolling.
- Search and category filters should sit in a compact filter band.
- Sync time should remain visible near refresh buttons.
- Menu images should stay readable and not be blurred by styling.

## Implementation Order

1. Shared UI token layer and admin utility styles.
2. App shell and login polish.
3. POS, waiter, and kitchen operation screens.
4. Inventory and menu management polish.
5. Employee management polish.
6. Manager dashboard polish pass.
7. Financial report UI and print polish.
8. Settings, permissions, store management polish.
9. Owner dashboard mobile pass.

## Verification

Every implementation batch must run:

```powershell
cd C:\Users\华为\Desktop\Codex_Projects\Restaurant_POS_Cloud_Clean\client
npm test -- --watchAll=false --runInBand src/utils/dataSafety.test.ts
npm run build
```

For visible UI work, also inspect in browser:

- `/pos`
- `/inventory`
- `/inventory/menu`
- `/manager`
- `/manager/financial-reports`
- `/dashboard`

Use accounts:

```text
admin / admin123
zeng / 123456
```

## Acceptance Criteria

- Existing functional tests still pass.
- No changes to sync, stock, permission, financial formula, or order status logic.
- Screens look coherent as one product.
- Desktop does not overflow horizontally.
- Mobile owner dashboard remains readable.
- POS remains fast and direct.
- Documentation updated after each batch.
