# Restaurant POS UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the Restaurant POS UI to a commercial software standard while preserving all existing business logic.

**Architecture:** Add a lightweight shared UI token layer, then apply it incrementally to individual screens. Keep functional code paths untouched; only adjust style objects, CSS classes, display labels, visual grouping, spacing, typography, and responsive layout.

**Tech Stack:** React 19, TypeScript, react-scripts, Firebase-hosted SPA, inline React styles plus lightweight shared style constants.

---

## File Structure

Create:

```text
client/src/styles/uiTokens.ts
client/src/styles/adminUi.ts
```

Modify by batch:

```text
client/src/components/Layout/MainLayout.tsx
client/src/pages/Login/Login.tsx
client/src/pages/POS/POS.tsx
client/src/pages/WaiterInterface/WaiterInterface.tsx
client/src/pages/Kitchen/Kitchen.tsx
client/src/pages/POS/KitchenDisplay.tsx
client/src/components/MenuSelection.tsx
client/src/pages/Inventory/Inventory.tsx
client/src/pages/Inventory/MenuManagement.tsx
client/src/pages/Employees/Employees.tsx
client/src/pages/Employees/EmployeeList.tsx
client/src/pages/Employees/LoanManagement.tsx
client/src/pages/Employees/SalarySettlement.tsx
client/src/pages/Manager/Dashboard.tsx
client/src/pages/Manager/FinancialReports.tsx
client/src/pages/Manager/Stores.tsx
client/src/pages/Settings/PermissionsModule.tsx
client/src/pages/Dashboard/OwnerDashboard.tsx
client/src/utils/dataSafety.test.ts
docs/2026-06-15_PROGRESS.md
```

Do not modify business services unless a visual-only import is needed:

```text
client/src/services/smartSyncService.ts
client/src/services/dataManager.ts
client/src/contexts/AppContext.tsx
client/src/utils/financeMetrics.ts
```

## Task 1: Shared UI Tokens

**Files:**

- Create: `client/src/styles/uiTokens.ts`
- Create: `client/src/styles/adminUi.ts`
- Test: `client/src/utils/dataSafety.test.ts`

- [ ] **Step 1: Write a source guard test**

Add a test in `client/src/utils/dataSafety.test.ts`:

```ts
test('UI redesign uses shared style tokens without changing business services', () => {
  const fs = require('fs');
  const path = require('path');
  const tokensPath = path.join(process.cwd(), 'src/styles/uiTokens.ts');
  const adminUiPath = path.join(process.cwd(), 'src/styles/adminUi.ts');

  expect(fs.existsSync(tokensPath)).toBe(true);
  expect(fs.existsSync(adminUiPath)).toBe(true);

  const tokens = fs.readFileSync(tokensPath, 'utf8');
  expect(tokens).toContain('colors');
  expect(tokens).toContain('radii');
  expect(tokens).toContain('shadows');
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```powershell
cd C:\Users\华为\Desktop\Codex_Projects\Restaurant_POS_Cloud_Clean\client
npm test -- --watchAll=false --runInBand src/utils/dataSafety.test.ts
```

Expected: fail because `uiTokens.ts` and `adminUi.ts` do not exist.

- [ ] **Step 3: Add token files**

Create `client/src/styles/uiTokens.ts`:

```ts
export const colors = {
  page: '#f5f7fb',
  surface: '#ffffff',
  surfaceMuted: '#f8fafc',
  border: '#dbe3ee',
  textPrimary: '#1f2937',
  textSecondary: '#64748b',
  teal: '#0f766e',
  blue: '#2563eb',
  amber: '#d97706',
  danger: '#dc2626',
  success: '#16a34a',
};

export const radii = {
  sm: '6px',
  md: '10px',
  lg: '14px',
};

export const shadows = {
  soft: '0 12px 32px rgba(15, 23, 42, 0.08)',
};

export const spacing = {
  page: '1.25rem',
  section: '1rem',
};
```

Create `client/src/styles/adminUi.ts`:

```ts
import { colors, radii, shadows } from './uiTokens';

export const adminPageStyle: React.CSSProperties = {
  minHeight: '100vh',
  background: colors.page,
  color: colors.textPrimary,
  padding: '1.25rem',
  boxSizing: 'border-box',
};

export const adminCardStyle: React.CSSProperties = {
  background: colors.surface,
  border: `1px solid ${colors.border}`,
  borderRadius: radii.lg,
  boxShadow: shadows.soft,
};

export const adminMutedTextStyle: React.CSSProperties = {
  color: colors.textSecondary,
};
```

- [ ] **Step 4: Run test and build**

Run:

```powershell
npm test -- --watchAll=false --runInBand src/utils/dataSafety.test.ts
npm run build
```

Expected: tests and build pass.

- [ ] **Step 5: Commit**

```powershell
git add client/src/styles/uiTokens.ts client/src/styles/adminUi.ts client/src/utils/dataSafety.test.ts
git commit -m "Add shared UI style tokens"
```

## Task 2: POS Visual Polish

## Task 2: App Shell and Login Visual Polish

**Files:**

- Modify: `client/src/components/Layout/MainLayout.tsx`
- Modify: `client/src/pages/Login/Login.tsx`
- Test: `client/src/utils/dataSafety.test.ts`

- [ ] **Step 1: Add guard test**

Add:

```ts
test('app shell UI polish keeps permission routing intact', () => {
  const fs = require('fs');
  const path = require('path');
  const layoutSource = fs.readFileSync(path.join(process.cwd(), 'src/components/Layout/MainLayout.tsx'), 'utf8');
  const loginSource = fs.readFileSync(path.join(process.cwd(), 'src/pages/Login/Login.tsx'), 'utf8');

  expect(layoutSource).toContain('canAccessPermission');
  expect(layoutSource).toContain('shouldHideSidebar');
  expect(layoutSource).toContain('logout');
  expect(loginSource).toContain('redirect');
});
```

- [ ] **Step 2: Apply visual-only edits**

Allowed edits:

- Header/sidebar spacing, colors, active states, text hierarchy.
- Fullscreen floating menu button and modal styling.
- Login card layout and background.

Not allowed:

- Changing `canAccessPermission`.
- Changing route paths.
- Changing `logout`.
- Changing login authentication calls or redirect logic.

- [ ] **Step 3: Test and commit**

```powershell
npm test -- --watchAll=false --runInBand src/utils/dataSafety.test.ts
npm run build
git add client/src/components/Layout/MainLayout.tsx client/src/pages/Login/Login.tsx client/src/utils/dataSafety.test.ts
git commit -m "Polish app shell and login UI"
```

## Task 3: POS Visual Polish

**Files:**

- Modify: `client/src/pages/POS/POS.tsx`
- Modify: `client/src/components/MenuSelection.tsx`
- Modify: `client/src/pages/WaiterInterface/WaiterInterface.tsx`
- Modify: `client/src/pages/Kitchen/Kitchen.tsx`
- Modify: `client/src/pages/POS/KitchenDisplay.tsx`
- Test: `client/src/utils/dataSafety.test.ts`

- [ ] **Step 1: Add guard test**

Add source checks to `dataSafety.test.ts`:

```ts
test('POS UI polish remains visual-only', () => {
  const fs = require('fs');
  const path = require('path');
  const posSource = fs.readFileSync(path.join(process.cwd(), 'src/pages/POS/POS.tsx'), 'utf8');
  const menuSource = fs.readFileSync(path.join(process.cwd(), 'src/components/MenuSelection.tsx'), 'utf8');

  expect(posSource).toContain('tableSingleModern');
  expect(posSource).toContain('needs_cleaning');
  expect(menuSource).toContain('MenuImage');
  expect(posSource).toContain("smartSubscribeToCollection('pos_orders'");
});
```

- [ ] **Step 2: Verify test passes before UI edits**

Run:

```powershell
npm test -- --watchAll=false --runInBand src/utils/dataSafety.test.ts
```

- [ ] **Step 3: Apply visual-only edits**

Allowed edits:

- Update panel backgrounds, borders, spacing, and shadows.
- Move order action buttons visually if already present in the same render branch.
- Improve POS typography and button hierarchy.
- Keep all event handlers and data calls unchanged.

Not allowed:

- Changing `smartSubscribeToCollection`.
- Changing `completeOrder`, `clearTable`, stock deduction, payment, or cancel authorization logic.
- Changing order status names.

- [ ] **Step 4: Browser verify**

Open:

```text
http://localhost:3000/pos
```

Check:

- Table area remains visible.
- Table states still show natural/red/orange.
- Order list is visible.
- Menu search and category controls remain usable.

- [ ] **Step 5: Test, build, commit**

```powershell
npm test -- --watchAll=false --runInBand src/utils/dataSafety.test.ts
npm run build
git add client/src/pages/POS/POS.tsx client/src/components/MenuSelection.tsx client/src/utils/dataSafety.test.ts
git commit -m "Polish POS visual layout"
```

## Task 4: Inventory and Menu Management Polish

**Files:**

- Modify: `client/src/pages/Inventory/Inventory.tsx`
- Modify: `client/src/pages/Inventory/MenuManagement.tsx`
- Test: `client/src/utils/dataSafety.test.ts`

- [ ] **Step 1: Add guard test**

Add:

```ts
test('inventory UI polish keeps cloud writes on smart document APIs', () => {
  const fs = require('fs');
  const path = require('path');
  const inventorySource = fs.readFileSync(path.join(process.cwd(), 'src/pages/Inventory/Inventory.tsx'), 'utf8');
  const menuSource = fs.readFileSync(path.join(process.cwd(), 'src/pages/Inventory/MenuManagement.tsx'), 'utf8');

  expect(inventorySource).toContain('smartUpdateDocument');
  expect(inventorySource).toContain('smartDeleteDocument');
  expect(menuSource).toContain("await smartUpdateDocument('menu_items'");
  expect(menuSource).toContain('processAndUploadMenuImage');
});
```

- [ ] **Step 2: Apply visual-only edits**

Allowed edits:

- Compact toolbar height.
- Improve card/list density.
- Use shared admin card style.
- Improve search/category/filter visual grouping.
- Keep sync time near refresh button.

Not allowed:

- Changing item save/delete behavior.
- Changing category save behavior.
- Changing image upload behavior.
- Changing Firestore collection names.

- [ ] **Step 3: Test and build**

```powershell
npm test -- --watchAll=false --runInBand src/utils/dataSafety.test.ts src/utils/syncMerge.test.ts
npm run build
```

- [ ] **Step 4: Commit**

```powershell
git add client/src/pages/Inventory/Inventory.tsx client/src/pages/Inventory/MenuManagement.tsx client/src/utils/dataSafety.test.ts
git commit -m "Polish inventory and menu management UI"
```

## Task 5: Employee Management Polish

**Files:**

- Modify: `client/src/pages/Employees/Employees.tsx`
- Modify: `client/src/pages/Employees/EmployeeList.tsx`
- Modify: `client/src/pages/Employees/LoanManagement.tsx`
- Modify: `client/src/pages/Employees/SalarySettlement.tsx`
- Test: `client/src/utils/employeeRecords.test.ts`
- Test: `client/src/utils/employeeLoans.test.ts`
- Test: `client/src/utils/dataSafety.test.ts`

- [ ] **Step 1: Preserve employee behavior**

Run:

```powershell
npm test -- --watchAll=false --runInBand src/utils/employeeRecords.test.ts src/utils/employeeLoans.test.ts src/utils/dataSafety.test.ts
```

- [ ] **Step 2: Apply UI-only edits**

Allowed edits:

- Employee card/list visual polish.
- Better active tab and filter presentation.
- Loan/salary form spacing and summary cards.

Not allowed:

- Changing employee save/delete paths.
- Changing loan offset behavior.
- Changing salary settlement calculations.

- [ ] **Step 3: Verify and commit**

```powershell
npm test -- --watchAll=false --runInBand src/utils/employeeRecords.test.ts src/utils/employeeLoans.test.ts src/utils/dataSafety.test.ts
npm run build
git add client/src/pages/Employees/Employees.tsx client/src/pages/Employees/EmployeeList.tsx client/src/pages/Employees/LoanManagement.tsx client/src/pages/Employees/SalarySettlement.tsx
git commit -m "Polish employee management UI"
```

## Task 6: Manager Dashboard Polish

**Files:**

- Modify: `client/src/pages/Manager/Dashboard.tsx`
- Test: `client/src/utils/dashboardAnalytics.test.ts`
- Test: `client/src/utils/dataSafety.test.ts`

- [ ] **Step 1: Preserve analytics behavior**

Run:

```powershell
npm test -- --watchAll=false --runInBand src/utils/dashboardAnalytics.test.ts src/utils/dataSafety.test.ts
```

- [ ] **Step 2: Apply UI-only edits**

Allowed edits:

- Refine KPI cards.
- Reduce heavy black text and borders.
- Improve chart spacing.
- Improve responsive stacking.

Not allowed:

- Changing imports from `dashboardAnalytics.ts`.
- Changing filter calculations.
- Changing data refresh collections.

- [ ] **Step 3: Verify**

```powershell
npm test -- --watchAll=false --runInBand src/utils/dashboardAnalytics.test.ts src/utils/dataSafety.test.ts
npm run build
```

- [ ] **Step 4: Commit**

```powershell
git add client/src/pages/Manager/Dashboard.tsx
git commit -m "Refine manager dashboard UI"
```

## Task 7: Financial Reports UI and Print Polish

**Files:**

- Modify: `client/src/pages/Manager/FinancialReports.tsx`
- Test: `client/src/utils/financeMetrics.test.ts`
- Test: `client/src/utils/dataSafety.test.ts`

- [ ] **Step 1: Preserve formulas**

Run:

```powershell
npm test -- --watchAll=false --runInBand src/utils/financeMetrics.test.ts src/utils/dataSafety.test.ts
```

- [ ] **Step 2: Apply UI-only edits**

Allowed edits:

- Compact filter band.
- Refine KPI grid.
- Improve A4 print spacing and typography.
- Improve expense detail readability.

Not allowed:

- Changing `calculateFinancialReportTotals`.
- Changing `buildDailyExpenseBreakdown`.
- Changing order summary calculations.

- [ ] **Step 3: Verify**

```powershell
npm test -- --watchAll=false --runInBand src/utils/financeMetrics.test.ts src/utils/dataSafety.test.ts
npm run build
```

- [ ] **Step 4: Commit**

```powershell
git add client/src/pages/Manager/FinancialReports.tsx
git commit -m "Polish financial report UI"
```

## Task 8: Settings and Permissions Polish

**Files:**

- Modify: `client/src/pages/Settings/PermissionsModule.tsx`
- Modify: `client/src/pages/Settings/DataBackup.tsx`
- Modify: `client/src/pages/Manager/Stores.tsx`
- Modify: `client/src/pages/Manager/ExchangeRateSettings.tsx`
- Test: `client/src/utils/permissions.test.ts`
- Test: `client/src/utils/dataSafety.test.ts`

- [ ] **Step 1: Preserve settings behavior**

Run:

```powershell
npm test -- --watchAll=false --runInBand src/utils/dataSafety.test.ts
```

If `permissions.test.ts` exists, include it:

```powershell
npm test -- --watchAll=false --runInBand src/utils/permissions.test.ts src/utils/dataSafety.test.ts
```

- [ ] **Step 2: Apply UI-only edits**

Allowed edits:

- Permission role cards and toggle layout.
- Store card visual hierarchy.
- Backup screen warning/confirm visual hierarchy.
- Exchange-rate form spacing.

Not allowed:

- Changing role names or permission ids.
- Changing store save/edit/delete behavior.
- Changing backup export contents.

- [ ] **Step 3: Verify and commit**

```powershell
npm test -- --watchAll=false --runInBand src/utils/dataSafety.test.ts
npm run build
git add client/src/pages/Settings/PermissionsModule.tsx client/src/pages/Settings/DataBackup.tsx client/src/pages/Manager/Stores.tsx client/src/pages/Manager/ExchangeRateSettings.tsx
git commit -m "Polish settings UI"
```

## Task 9: Owner Dashboard Mobile Polish

**Files:**

- Modify: `client/src/pages/Dashboard/OwnerDashboard.tsx`
- Test: `client/src/utils/ownerDashboardData.test.ts`
- Test: `client/src/utils/dataSafety.test.ts`

- [ ] **Step 1: Preserve owner aggregation**

Run:

```powershell
npm test -- --watchAll=false --runInBand src/utils/ownerDashboardData.test.ts src/utils/dataSafety.test.ts
```

- [ ] **Step 2: Apply UI-only edits**

Allowed edits:

- Mobile-first card sizing.
- Store card visual hierarchy.
- KPI card spacing.
- Chart card responsive stacking.

Not allowed:

- Changing `smartGetDocuments` collection sequence.
- Changing aggregation helpers.
- Changing cache key.

- [ ] **Step 3: Verify**

```powershell
npm test -- --watchAll=false --runInBand src/utils/ownerDashboardData.test.ts src/utils/dataSafety.test.ts
npm run build
```

- [ ] **Step 4: Commit**

```powershell
git add client/src/pages/Dashboard/OwnerDashboard.tsx
git commit -m "Polish owner dashboard mobile UI"
```

## Final Deployment

After all accepted batches:

```powershell
cd C:\Users\华为\Desktop\Codex_Projects\Restaurant_POS_Cloud_Clean
firebase deploy --only hosting
Invoke-WebRequest -Uri 'https://restaurant-pos-1b420.web.app' -UseBasicParsing -TimeoutSec 30
git status --short
```

Update:

```text
docs/2026-06-15_PROGRESS.md
```
