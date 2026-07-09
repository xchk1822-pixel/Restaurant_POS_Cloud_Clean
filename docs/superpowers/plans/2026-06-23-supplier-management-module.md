# Supplier Management Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Supplier Management into an independent store-scoped accounts-payable module with supplier profiles, debt orders, payment records, and reconciliation print.

**Architecture:** Keep existing Firestore collection names and store scoping. Add a canonical `/suppliers` route and remove the old `/inventory/suppliers` route because the system is not yet commercially live. Refactor supplier calculations into focused helpers so the page derives debt from `purchase_orders` and reads repayments from `supplier_payments`.

**Tech Stack:** React, TypeScript, React Router, Firebase Firestore through `smartSyncService`, local store cache through `DataService` and `dataManager`, Jest via `react-scripts test`.

---

### Task 1: Route And Navigation

**Files:**
- Modify: `client/src/App.tsx`
- Modify: `client/src/components/Layout/MainLayout.tsx`
- Test: `client/src/utils/dataSafety.test.ts`

- [x] **Step 1: Write the failing route/navigation test**

Add this test near the existing route/navigation guards in `client/src/utils/dataSafety.test.ts`:

```ts
  test('supplier management is a first-level module without legacy inventory route compatibility', () => {
    const appPath = path.join(process.cwd(), 'src/App.tsx');
    const appSource = fs.readFileSync(appPath, 'utf8');
    const layoutPath = path.join(process.cwd(), 'src/components/Layout/MainLayout.tsx');
    const layoutSource = fs.readFileSync(layoutPath, 'utf8');

    expect(appSource).toContain('path="/suppliers"');
    expect(appSource).toContain('permissionId="suppliers:manage"');
    expect(appSource).not.toContain('path="/inventory/suppliers"');
    expect(appSource).not.toContain('<Navigate to="/suppliers" replace />');
    expect(layoutSource).toContain("path: '/suppliers'");
    expect(layoutSource).toContain("label: '供应商管理'");
    expect(layoutSource).toContain("roles: ['store_manager']");
    expect(layoutSource.indexOf("path: '/suppliers'")).toBeGreaterThan(
      layoutSource.indexOf("path: '/manager'")
    );
    expect(layoutSource).not.toContain("{ path: '/inventory/suppliers', icon: 'SP', label: '供应商管理' }");
  });
```

- [x] **Step 2: Run the failing test**

Run:

```powershell
npm test -- --watchAll=false --runTestsByPath src/utils/dataSafety.test.ts -t "supplier management is a first-level module"
```

Expected: FAIL because `/suppliers` does not exist and supplier navigation is still under inventory.

- [x] **Step 3: Add canonical route and remove old supplier route**

In `client/src/App.tsx`, keep the existing import:

```ts
import SupplierManagement from './pages/Inventory/SupplierManagement';
```

Change the supplier route to:

```tsx
            <Route path="/suppliers" element={<ProtectedRoute permissionId="suppliers:manage"><SupplierManagement /></ProtectedRoute>} />
```

Do not keep the old `/inventory/suppliers` route.

- [x] **Step 4: Move supplier navigation to first-level bottom**

In `client/src/components/Layout/MainLayout.tsx`, remove this child from the Inventory group:

```ts
      { path: '/inventory/suppliers', icon: 'SP', label: '供应商管理' },
```

Add a first-level item after the Manager group and before Customer Management:

```ts
  { path: '/suppliers', icon: 'SP', label: '供应商管理', roles: ['store_manager'] },
```

If Customer Management is still under Manager in the current file, do not move it in this task; keep this task scoped to suppliers.

- [x] **Step 5: Map new permission id without breaking old permission data**

In `client/src/components/Layout/MainLayout.tsx`, update `getPermissionId` so `/suppliers` maps to the new permission id:

```ts
      : item.path === '/suppliers'
        ? 'suppliers:manage'
```

In `client/src/utils/permissions.ts`, add a compatibility rule so store managers keep access:

```ts
  'suppliers:manage': ['store_manager'],
```

If the permission file stores defaults in another object shape, add `suppliers:manage` to the default store-manager permissions and do not keep `inventory:suppliers`.

- [x] **Step 6: Verify route/navigation test passes**

Run:

```powershell
npm test -- --watchAll=false --runTestsByPath src/utils/dataSafety.test.ts -t "supplier management is a first-level module"
```

Expected: PASS.

---

### Task 2: Supplier Accounts-Payable Helpers

**Files:**
- Create: `client/src/utils/supplierAccounts.ts`
- Test: `client/src/utils/supplierAccounts.test.ts`
- Modify: `client/src/utils/dataSafety.test.ts`

- [x] **Step 1: Create failing helper tests**

Create `client/src/utils/supplierAccounts.test.ts`:

```ts
import {
  buildSupplierAccountSummary,
  getPurchaseOrderRemainingDebt,
  normalizeSupplierPaymentDate,
  sortNewestFirstBySupplierDate
} from './supplierAccounts';

describe('supplier account helpers', () => {
  test('calculates remaining debt from purchase orders instead of supplier balance cache', () => {
    const supplier = { id: 'sup-1', name: 'Bebidas', balance: 9999 };
    const orders = [
      { id: 'po-1', supplierId: 'sup-1', totalAmount: 1000, paidAmount: 300, orderDate: '2026-06-20' },
      { id: 'po-2', supplierId: 'sup-1', totalAmount: 500, paidAmount: 500, orderDate: '2026-06-21' },
      { id: 'po-3', supplierId: 'sup-2', totalAmount: 800, paidAmount: 0, orderDate: '2026-06-22' }
    ];
    const payments = [
      { id: 'pay-1', supplierId: 'sup-1', amount: 300, paymentDate: '2026-06-21' }
    ];

    const summary = buildSupplierAccountSummary(supplier, orders, payments);

    expect(summary.remainingDebt).toBe(700);
    expect(summary.purchaseCount).toBe(2);
    expect(summary.lastPurchaseDate).toBe('2026-06-21');
    expect(summary.lastPaymentDate).toBe('2026-06-21');
    expect(summary.canDelete).toBe(false);
  });

  test('normalizes remaining debt and dates safely', () => {
    expect(getPurchaseOrderRemainingDebt({ totalAmount: 100, paidAmount: 130 })).toBe(0);
    expect(getPurchaseOrderRemainingDebt({ totalAmount: '100.5', paidAmount: '0.5' })).toBe(100);
    expect(normalizeSupplierPaymentDate({ seconds: 1782170574 })).toBe('2026-06-22');
  });

  test('sorts newest supplier records first', () => {
    const rows = [
      { id: 'a', paymentDate: '2026-06-20' },
      { id: 'b', paymentDate: '2026-06-22' },
      { id: 'c', createdAt: '2026-06-21' }
    ];

    expect(sortNewestFirstBySupplierDate(rows).map(row => row.id)).toEqual(['b', 'c', 'a']);
  });
});
```

- [x] **Step 2: Run failing helper tests**

Run:

```powershell
npm test -- --watchAll=false --runTestsByPath src/utils/supplierAccounts.test.ts
```

Expected: FAIL because `supplierAccounts.ts` does not exist.

- [x] **Step 3: Implement supplier account helpers**

Create `client/src/utils/supplierAccounts.ts`:

```ts
import { getLocalDateString } from './exchangeRate';

export interface SupplierLike {
  id: string;
  name?: string;
  balance?: number;
  status?: string;
}

export interface PurchaseOrderLike {
  id: string;
  supplierId: string;
  supplierName?: string;
  orderNumber?: string;
  totalAmount?: number | string;
  paidAmount?: number | string;
  status?: string;
  orderDate?: any;
  receivedDate?: any;
  createdAt?: any;
  lastModified?: any;
}

export interface SupplierPaymentLike {
  id: string;
  supplierId: string;
  supplierName?: string;
  orderId?: string;
  orderNumber?: string;
  amount?: number | string;
  paymentDate?: any;
  createdAt?: any;
  lastModified?: any;
}

export interface SupplierAccountSummary {
  supplierId: string;
  remainingDebt: number;
  cachedBalance: number;
  purchaseCount: number;
  unpaidOrderCount: number;
  paymentCount: number;
  lastPurchaseDate: string;
  lastPaymentDate: string;
  canDelete: boolean;
}

const toMoney = (value: unknown): number => {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
};

const toTime = (value: any): number => {
  if (!value) return 0;
  if (typeof value?.toDate === 'function') return value.toDate().getTime() || 0;
  if (typeof value?.seconds === 'number') return value.seconds * 1000;
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
};

export const normalizeSupplierDate = (value: any): string => {
  const time = toTime(value);
  return time ? getLocalDateString(new Date(time)) : '';
};

export const normalizeSupplierPaymentDate = (payment: SupplierPaymentLike): string => {
  return normalizeSupplierDate(payment.paymentDate || payment.createdAt || payment.lastModified);
};

export const normalizePurchaseOrderDate = (order: PurchaseOrderLike): string => {
  return normalizeSupplierDate(order.orderDate || order.receivedDate || order.createdAt || order.lastModified);
};

export const getPurchaseOrderRemainingDebt = (order: Pick<PurchaseOrderLike, 'totalAmount' | 'paidAmount'>): number => {
  return Math.max(toMoney(order.totalAmount) - toMoney(order.paidAmount), 0);
};

export const getSupplierPurchaseOrders = (supplierId: string, orders: PurchaseOrderLike[]): PurchaseOrderLike[] => {
  return orders.filter(order => order.supplierId === supplierId);
};

export const getSupplierPaymentRecords = (supplierId: string, payments: SupplierPaymentLike[]): SupplierPaymentLike[] => {
  return payments.filter(payment => payment.supplierId === supplierId);
};

export const sortNewestFirstBySupplierDate = <T extends { orderDate?: any; paymentDate?: any; createdAt?: any; lastModified?: any }>(rows: T[]): T[] => {
  return [...rows].sort((a, b) => {
    const aTime = toTime(a.orderDate || a.paymentDate || a.createdAt || a.lastModified);
    const bTime = toTime(b.orderDate || b.paymentDate || b.createdAt || b.lastModified);
    return bTime - aTime;
  });
};

export const buildSupplierAccountSummary = (
  supplier: SupplierLike,
  purchaseOrders: PurchaseOrderLike[],
  supplierPayments: SupplierPaymentLike[]
): SupplierAccountSummary => {
  const orders = getSupplierPurchaseOrders(supplier.id, purchaseOrders);
  const payments = getSupplierPaymentRecords(supplier.id, supplierPayments);
  const remainingDebt = orders.reduce((sum, order) => sum + getPurchaseOrderRemainingDebt(order), 0);
  const sortedOrders = sortNewestFirstBySupplierDate(orders);
  const sortedPayments = sortNewestFirstBySupplierDate(payments);

  return {
    supplierId: supplier.id,
    remainingDebt,
    cachedBalance: toMoney(supplier.balance),
    purchaseCount: orders.length,
    unpaidOrderCount: orders.filter(order => getPurchaseOrderRemainingDebt(order) > 0).length,
    paymentCount: payments.length,
    lastPurchaseDate: sortedOrders[0] ? normalizePurchaseOrderDate(sortedOrders[0]) : '',
    lastPaymentDate: sortedPayments[0] ? normalizeSupplierPaymentDate(sortedPayments[0]) : '',
    canDelete: remainingDebt <= 0
  };
};
```

- [x] **Step 4: Add data safety guard for helper usage**

Add this test to `client/src/utils/dataSafety.test.ts`:

```ts
  test('supplier management derives debt from purchase orders through supplier account helpers', () => {
    const supplierPath = path.join(process.cwd(), 'src/pages/Inventory/SupplierManagement.tsx');
    const supplierSource = fs.readFileSync(supplierPath, 'utf8');
    const helperPath = path.join(process.cwd(), 'src/utils/supplierAccounts.ts');
    const helperSource = fs.readFileSync(helperPath, 'utf8');

    expect(supplierSource).toContain("from '../../utils/supplierAccounts'");
    expect(supplierSource).toContain('buildSupplierAccountSummary');
    expect(supplierSource).toContain('getPurchaseOrderRemainingDebt');
    expect(helperSource).toContain('remainingDebt = orders.reduce');
    expect(helperSource).toContain('canDelete: remainingDebt <= 0');
    expect(supplierSource).not.toContain('if (supplier.balance > 0)');
  });
```

- [x] **Step 5: Run helper tests**

Run:

```powershell
npm test -- --watchAll=false --runTestsByPath src/utils/supplierAccounts.test.ts
```

Expected: PASS.

---

### Task 3: Supplier Page Data Flow

**Files:**
- Modify: `client/src/pages/Inventory/SupplierManagement.tsx`
- Test: `client/src/utils/dataSafety.test.ts`

- [x] **Step 1: Write failing data-flow test**

Add this test to `client/src/utils/dataSafety.test.ts`:

```ts
  test('supplier management reads supplier payments as one store-scoped collection', () => {
    const supplierPath = path.join(process.cwd(), 'src/pages/Inventory/SupplierManagement.tsx');
    const source = fs.readFileSync(supplierPath, 'utf8');

    expect(source).toContain('const [supplierPayments, setSupplierPayments] = useState<PaymentRecord[]>([])');
    expect(source).toContain("smartGetDocuments('supplier_payments', true)");
    expect(source).toContain('setSupplierPayments(normalizedSupplierPayments)');
    expect(source).not.toContain('getSupplierPaymentStorageKey');
    expect(source).not.toContain('localStorage.setItem(getSupplierPaymentStorageKey');
    expect(source).not.toContain('const savePaymentRecord =');
  });
```

- [x] **Step 2: Run failing test**

Run:

```powershell
npm test -- --watchAll=false --runTestsByPath src/utils/dataSafety.test.ts -t "supplier management reads supplier payments"
```

Expected: FAIL because the page still keeps per-supplier localStorage payment helpers.

- [x] **Step 3: Replace per-supplier local payment storage**

In `client/src/pages/Inventory/SupplierManagement.tsx`, import helpers:

```ts
import {
  buildSupplierAccountSummary,
  getPurchaseOrderRemainingDebt,
  getSupplierPaymentRecords,
  normalizeSupplierPaymentDate,
  normalizePurchaseOrderDate,
  sortNewestFirstBySupplierDate
} from '../../utils/supplierAccounts';
```

Add state:

```ts
  const [supplierPayments, setSupplierPayments] = useState<PaymentRecord[]>([]);
```

Remove these local-storage helpers:

```ts
  const getSupplierPaymentStorageKey = (supplierId: string) => {
    return dataService.getStoreKey(`payments_${supplierId}`);
  };

  const saveSupplierPayments = (supplierId: string, payments: PaymentRecord[]) => {
    localStorage.setItem(getSupplierPaymentStorageKey(supplierId), JSON.stringify(payments));
  };

  const getSupplierPayments = (supplierId: string): PaymentRecord[] => {
    const saved = localStorage.getItem(getSupplierPaymentStorageKey(supplierId));
    return saved ? JSON.parse(saved) : [];
  };

  const savePaymentRecord = (supplierId: string, record: PaymentRecord) => {
    const payments = getSupplierPayments(supplierId);
    payments.push(record);
    saveSupplierPayments(supplierId, payments);
  };
```

Replace `getSupplierPayments` with:

```ts
  const getSupplierPayments = (supplierId: string): PaymentRecord[] => {
    return sortNewestFirstBySupplierDate(getSupplierPaymentRecords(supplierId, supplierPayments)) as PaymentRecord[];
  };
```

In `refreshSupplierData`, replace the map-to-local-storage block with:

```ts
      const normalizedSupplierPayments = cloudSupplierPayments.map((payment: any) => ({
        ...payment,
        amount: Number(payment.amount) || 0,
        paymentDate: payment.paymentDate ? new Date(payment.paymentDate) : new Date()
      }));

      setSupplierPayments(normalizedSupplierPayments);
      saveStoreCollection('supplier_payments', normalizedSupplierPayments);
```

- [x] **Step 4: Update payment success local state**

In `handlePayment`, after all cloud writes succeed, replace:

```ts
    savePaymentRecord(selectedOrder.supplierId, paymentRecord);
```

with:

```ts
    setSupplierPayments(prevPayments => sortNewestFirstBySupplierDate([...prevPayments, paymentRecord]) as PaymentRecord[]);
    saveStoreCollection('supplier_payments', sortNewestFirstBySupplierDate([...supplierPayments, paymentRecord]));
```

- [x] **Step 5: Verify data-flow test passes**

Run:

```powershell
npm test -- --watchAll=false --runTestsByPath src/utils/dataSafety.test.ts -t "supplier management reads supplier payments"
```

Expected: PASS.

---

### Task 4: Supplier Debt And Repayment Linkage

**Files:**
- Modify: `client/src/pages/Inventory/SupplierManagement.tsx`
- Test: `client/src/utils/dataSafety.test.ts`

- [x] **Step 1: Write failing repayment linkage test**

Add this test to `client/src/utils/dataSafety.test.ts`:

```ts
  test('supplier repayment links payment expense and purchase order ids', () => {
    const supplierPath = path.join(process.cwd(), 'src/pages/Inventory/SupplierManagement.tsx');
    const source = fs.readFileSync(supplierPath, 'utf8');
    const paymentBlock = source.slice(
      source.indexOf('const handlePayment = async () => {'),
      source.indexOf('// 打印对账单')
    );

    expect(paymentBlock).toContain('const paymentId = `pay-${Date.now()}`');
    expect(paymentBlock).toContain('id: paymentId');
    expect(paymentBlock).toContain('supplierPaymentId: paymentId');
    expect(paymentBlock).toContain('purchaseOrderId: selectedOrder.id');
    expect(paymentBlock).toContain("relatedType: 'supplier_repayment'");
    expect(paymentBlock).toContain('getPurchaseOrderRemainingDebt(selectedOrder)');
    expect(paymentBlock).toContain('buildSupplierAccountSummary');
  });
```

- [x] **Step 2: Run failing test**

Run:

```powershell
npm test -- --watchAll=false --runTestsByPath src/utils/dataSafety.test.ts -t "supplier repayment links"
```

Expected: FAIL until payment IDs and helper-derived debt are wired.

- [x] **Step 3: Use calculated debt for delete blocking**

In `handleDeleteSupplier`, replace:

```ts
    if (supplier.balance > 0) {
      alert(`该供应商还有欠款 C$ ${supplier.balance.toFixed(2)}，无法删除！`);
      return;
    }
```

with:

```ts
    const supplierSummary = buildSupplierAccountSummary(supplier, purchaseOrders, supplierPayments);
    if (!supplierSummary.canDelete) {
      alert(`该供应商还有欠款 C$ ${supplierSummary.remainingDebt.toFixed(2)}，无法删除！`);
      return;
    }
```

- [x] **Step 4: Use calculated debt for repayment validation**

In `handlePayment`, replace:

```ts
    const orderRemaining = selectedOrder.totalAmount - selectedOrder.paidAmount;
```

with:

```ts
    const orderRemaining = getPurchaseOrderRemainingDebt(selectedOrder);
```

- [x] **Step 5: Add linked payment IDs**

In `handlePayment`, before `paymentRecord`, add:

```ts
    const paymentId = `pay-${Date.now()}`;
```

Build `paymentRecord` using that ID:

```ts
    const paymentRecord: PaymentRecord = {
      id: paymentId,
      orderId: selectedOrder.id,
      orderNumber: selectedOrder.orderNumber,
      supplierId: selectedOrder.supplierId,
      supplierName: selectedOrder.supplierName,
      amount,
      paymentDate: new Date(),
      paymentMethod: paymentForm.paymentMethod,
      notes: paymentForm.notes
    };
```

Update `paymentExpense` fields:

```ts
      supplierPaymentId: paymentId,
      purchaseOrderId: selectedOrder.id,
      supplierId: selectedOrder.supplierId,
      supplierName: selectedOrder.supplierName,
      relatedType: 'supplier_repayment',
      orderNumber: selectedOrder.orderNumber,
```

- [x] **Step 6: Recalculate supplier balance cache from helper**

Replace the supplier balance calculation in `supplierCloudUpdate` with:

```ts
      balance: buildSupplierAccountSummary(
        supplierForSync,
        updatedOrdersForSync,
        supplierPayments
      ).remainingDebt,
```

- [x] **Step 7: Verify repayment linkage test passes**

Run:

```powershell
npm test -- --watchAll=false --runTestsByPath src/utils/dataSafety.test.ts -t "supplier repayment links"
```

Expected: PASS.

---

### Task 5: Four-Section Supplier UI

**Files:**
- Modify: `client/src/pages/Inventory/SupplierManagement.tsx`
- Test: `client/src/utils/dataSafety.test.ts`

- [x] **Step 1: Write failing four-section UI test**

Add this test to `client/src/utils/dataSafety.test.ts`:

```ts
  test('supplier management page exposes profiles debts payments and reconciliation sections', () => {
    const supplierPath = path.join(process.cwd(), 'src/pages/Inventory/SupplierManagement.tsx');
    const source = fs.readFileSync(supplierPath, 'utf8');

    expect(source).toContain("type SupplierSection = 'profiles' | 'debts' | 'payments' | 'reconciliation'");
    expect(source).toContain("const [activeSection, setActiveSection] = useState<SupplierSection>('profiles')");
    expect(source).toContain('供应商档案');
    expect(source).toContain('欠款订单');
    expect(source).toContain('还款记录');
    expect(source).toContain('对账打印');
    expect(source).toContain('renderSupplierProfiles');
    expect(source).toContain('renderDebtOrders');
    expect(source).toContain('renderPaymentRecords');
    expect(source).toContain('renderReconciliationPrint');
  });
```

- [x] **Step 2: Run failing UI test**

Run:

```powershell
npm test -- --watchAll=false --runTestsByPath src/utils/dataSafety.test.ts -t "supplier management page exposes"
```

Expected: FAIL.

- [x] **Step 3: Add section state and tabs**

In `SupplierManagement.tsx`, add:

```ts
type SupplierSection = 'profiles' | 'debts' | 'payments' | 'reconciliation';
```

Inside the component:

```ts
  const [activeSection, setActiveSection] = useState<SupplierSection>('profiles');
```

Create a section button array:

```ts
  const supplierSections: Array<{ key: SupplierSection; label: string }> = [
    { key: 'profiles', label: '供应商档案' },
    { key: 'debts', label: '欠款订单' },
    { key: 'payments', label: '还款记录' },
    { key: 'reconciliation', label: '对账打印' }
  ];
```

Render the tab row near the top of the page:

```tsx
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
          {supplierSections.map(section => (
            <button
              key={section.key}
              onClick={() => setActiveSection(section.key)}
              style={{
                padding: '0.6rem 1rem',
                borderRadius: '0.5rem',
                border: activeSection === section.key ? '1px solid #2563eb' : '1px solid #d1d5db',
                background: activeSection === section.key ? '#eff6ff' : '#ffffff',
                color: activeSection === section.key ? '#1d4ed8' : '#374151',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              {section.label}
            </button>
          ))}
        </div>
```

- [x] **Step 4: Split render blocks without changing behavior**

Inside the component, create these render functions and move existing list/modal buttons into the relevant section:

```ts
  const renderSupplierProfiles = () => (
    <div data-supplier-section="profiles">
      {/* existing supplier cards/list and add/edit/delete actions */}
    </div>
  );

  const renderDebtOrders = () => (
    <div data-supplier-section="debts">
      {/* unpaid and partial purchase orders with repayment actions */}
    </div>
  );

  const renderPaymentRecords = () => (
    <div data-supplier-section="payments">
      {/* supplier payment records sorted newest first */}
    </div>
  );

  const renderReconciliationPrint = () => (
    <div data-supplier-section="reconciliation">
      {/* print supplier statement controls */}
    </div>
  );
```

At the main content location:

```tsx
        {activeSection === 'profiles' && renderSupplierProfiles()}
        {activeSection === 'debts' && renderDebtOrders()}
        {activeSection === 'payments' && renderPaymentRecords()}
        {activeSection === 'reconciliation' && renderReconciliationPrint()}
```

- [x] **Step 5: Keep repayment modal shared**

Leave the existing repayment modal outside the section render functions so it can be opened from debt orders and supplier profile cards.

- [x] **Step 6: Verify UI section test passes**

Run:

```powershell
npm test -- --watchAll=false --runTestsByPath src/utils/dataSafety.test.ts -t "supplier management page exposes"
```

Expected: PASS.

---

### Task 6: Full Verification, Deploy, Archive

**Files:**
- Modify: `docs/2026-06-15_PROGRESS.md`
- Create: `docs/2026-06-24_SUPPLIER_MANAGEMENT_MODULE.md`

- [x] **Step 1: Run supplier helper tests**

Run:

```powershell
npm test -- --watchAll=false --runTestsByPath src/utils/supplierAccounts.test.ts
```

Expected: PASS.

- [x] **Step 2: Run full data safety tests**

Run:

```powershell
npm test -- --watchAll=false --runTestsByPath src/utils/dataSafety.test.ts
```

Expected: PASS.

- [x] **Step 3: Build production bundle**

Run:

```powershell
npm run build
```

Expected: `Compiled successfully.`

- [x] **Step 4: Browser verify locally or against deployed site**

Use Playwright CLI after deployment or local preview:

```powershell
npx --yes --package @playwright/cli playwright-cli open https://restaurant-pos-1b420.web.app
npx --yes --package @playwright/cli playwright-cli snapshot
```

Verify without creating live data:

- Login as `zeng/123456`.
- `/suppliers` loads.
- `/inventory/suppliers` is removed.
- Four sections are visible.
- Supplier list loads for the selected store.
- No browser console errors.

- [x] **Step 5: Deploy**

Run:

```powershell
firebase deploy --only hosting --project restaurant-pos-1b420
```

Expected: Deploy complete with Hosting URL `https://restaurant-pos-1b420.web.app`.

- [x] **Step 6: Write archive note**

Create `docs/2026-06-24_SUPPLIER_MANAGEMENT_MODULE.md` with:

```md
# 2026-06-24 Supplier Management Module

## Completed
- Supplier Management moved to canonical route `/suppliers`.
- Old route `/inventory/suppliers` is removed.
- Supplier data remains store-scoped.
- Supplier account helpers calculate debt from purchase orders.
- Supplier page exposes Supplier Profiles, Debt Orders, Payment Records, and Reconciliation Print sections.
- Supplier repayment links supplier payment, purchase order, and expense records.

## Verification
- `npm test -- --watchAll=false --runTestsByPath src/utils/supplierAccounts.test.ts`
- `npm test -- --watchAll=false --runTestsByPath src/utils/dataSafety.test.ts`
- `npm run build`
- Firebase Hosting deploy to `restaurant-pos-1b420`
- Browser verification on `/suppliers`

## Data Rule
- Supplier debt is calculated from purchase orders.
- Credit purchases do not become purchase expenses until repayment.
- Supplier receipt evidence remains in Expense Records.
```

- [x] **Step 7: Append progress entry**

Append a short entry to `docs/2026-06-15_PROGRESS.md` linking to `docs/2026-06-24_SUPPLIER_MANAGEMENT_MODULE.md`.

- [ ] **Step 8: Commit implementation**

Run:

```powershell
git status --short
git add client/src/App.tsx client/src/components/Layout/MainLayout.tsx client/src/pages/Inventory/SupplierManagement.tsx client/src/utils/supplierAccounts.ts client/src/utils/supplierAccounts.test.ts client/src/utils/dataSafety.test.ts docs/2026-06-15_PROGRESS.md docs/2026-06-24_SUPPLIER_MANAGEMENT_MODULE.md
git commit -m "feat: redesign supplier management module"
```

Expected: commit succeeds. If unrelated dirty files exist, do not stage them.
