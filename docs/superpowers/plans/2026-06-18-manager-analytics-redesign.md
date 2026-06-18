# Manager Analytics Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a professional manager data overview with monthly sales calendar heatmap, product and beverage rankings, period comparison, and commercial-grade dashboard UI.

**Architecture:** Move analytics calculations into a focused utility module, then make `Dashboard.tsx` a presentation and orchestration layer. Keep data loading store-scoped and manual refresh only.

**Tech Stack:** React, TypeScript, CRA/Jest, existing Firebase smart sync, existing `financeMetrics` date and revenue helpers.

---

## File Structure

- Create: `client/src/utils/dashboardAnalytics.ts`
  - Owns date range normalization, sales ranking, beverage category resolution, monthly calendar, period comparison, and increased/decreased movement analysis.
- Create: `client/src/utils/dashboardAnalytics.test.ts`
  - Unit tests for ranking, beverage inclusion, calendar, comparison, and movement analysis.
- Modify: `client/src/pages/Manager/Dashboard.tsx`
  - Uses the new analytics utility and renders the redesigned dashboard.
- Modify: `client/src/utils/dataSafety.test.ts`
  - Adds source guards for manager dashboard analytics boundaries.
- Modify: `docs/2026-06-15_PROGRESS.md`
  - Records completion and verification evidence.

---

### Task 1: Analytics Utility Tests

**Files:**
- Create: `client/src/utils/dashboardAnalytics.test.ts`

- [ ] **Step 1: Write failing tests**

Create tests covering beverage fallback, ranking sort, calendar rows, comparison deltas, and increased/decreased movement between periods.

```ts
import {
  buildMonthlySalesCalendar,
  buildPeriodComparison,
  buildRankingComparison,
  buildSalesRankings,
} from './dashboardAnalytics';

const paidOrder = (overrides: any) => ({
  id: overrides.id,
  status: 'completed',
  paymentStatus: 'paid',
  paymentMethod: 'cash',
  totalAmount: overrides.totalAmount,
  completedAt: overrides.completedAt,
  orderType: overrides.orderType || 'dine_in',
  items: overrides.items || [],
});

describe('dashboardAnalytics', () => {
  test('includes beverage sales by stock item category when order item has no category', () => {
    const orders = [
      paidOrder({
        id: 'o1',
        totalAmount: 90,
        completedAt: '2026-06-18T12:00:00.000-06:00',
        items: [
          { id: 'i1', name: 'Coca cola 600M', quantity: 3, price: 30, subtotal: 90, stockItemId: 'stock-coke' },
        ],
      }),
    ];
    const rankings = buildSalesRankings(orders, [], [
      { id: 'stock-coke', name: 'Coca cola 600M', category: 'Bebida' },
    ], {
      scope: 'beverages',
      sortBy: 'quantity',
      orderType: 'all',
      topN: 10,
      beverageCategory: 'all',
    });

    expect(rankings).toEqual([
      expect.objectContaining({
        name: 'Coca cola 600M',
        category: 'Bebida',
        quantity: 3,
        revenue: 90,
      }),
    ]);
  });

  test('sorts sales rankings by quantity or revenue', () => {
    const orders = [
      paidOrder({
        id: 'o1',
        totalAmount: 350,
        completedAt: '2026-06-18T12:00:00.000-06:00',
        items: [
          { id: 'a', name: 'A', category: 'Platos', quantity: 5, price: 10, subtotal: 50 },
          { id: 'b', name: 'B', category: 'Platos', quantity: 1, price: 300, subtotal: 300 },
        ],
      }),
    ];

    expect(buildSalesRankings(orders, [], [], { scope: 'all', sortBy: 'quantity', orderType: 'all', topN: 10, beverageCategory: 'all' })[0].name).toBe('A');
    expect(buildSalesRankings(orders, [], [], { scope: 'all', sortBy: 'revenue', orderType: 'all', topN: 10, beverageCategory: 'all' })[0].name).toBe('B');
  });

  test('builds a Monday to Sunday monthly sales calendar with weekly totals', () => {
    const orders = [
      paidOrder({ id: 'o1', totalAmount: 100, completedAt: '2026-06-01T12:00:00.000-06:00' }),
      paidOrder({ id: 'o2', totalAmount: 200, completedAt: '2026-06-07T12:00:00.000-06:00' }),
      paidOrder({ id: 'o3', totalAmount: 50, completedAt: '2026-06-08T12:00:00.000-06:00' }),
    ];

    const calendar = buildMonthlySalesCalendar(orders, '2026-06');

    expect(calendar.weekdays).toEqual(['周一', '周二', '周三', '周四', '周五', '周六', '周日']);
    expect(calendar.weeks[0].days[0]).toMatchObject({ date: '2026-06-01', revenue: 100, orderCount: 1 });
    expect(calendar.weeks[0].days[6]).toMatchObject({ date: '2026-06-07', revenue: 200, orderCount: 1 });
    expect(calendar.weeks[0].weeklyRevenue).toBe(300);
    expect(calendar.weeks[1].days[0]).toMatchObject({ date: '2026-06-08', revenue: 50, orderCount: 1 });
  });

  test('builds period comparison values and percentages', () => {
    expect(buildPeriodComparison(120, 100)).toEqual({ value: 20, percent: 20, direction: 'up' });
    expect(buildPeriodComparison(80, 100)).toEqual({ value: -20, percent: -20, direction: 'down' });
    expect(buildPeriodComparison(50, 0)).toEqual({ value: 50, percent: null, direction: 'up' });
  });

  test('reports products that increased and decreased between periods', () => {
    const currentOrders = [
      paidOrder({
        id: 'current',
        totalAmount: 260,
        completedAt: '2026-06-18T12:00:00.000-06:00',
        items: [
          { id: 'a', name: 'Coca cola 600M', category: 'Bebida', quantity: 5, price: 30, subtotal: 150 },
          { id: 'b', name: 'Arroz Chino', category: 'Platos', quantity: 1, price: 110, subtotal: 110 },
        ],
      }),
    ];
    const previousOrders = [
      paidOrder({
        id: 'previous',
        totalAmount: 310,
        completedAt: '2026-05-18T12:00:00.000-06:00',
        items: [
          { id: 'a-prev', name: 'Coca cola 600M', category: 'Bebida', quantity: 2, price: 30, subtotal: 60 },
          { id: 'b-prev', name: 'Arroz Chino', category: 'Platos', quantity: 5, price: 50, subtotal: 250 },
        ],
      }),
    ];

    const movement = buildRankingComparison(currentOrders, previousOrders, [], [], {
      scope: 'all',
      sortBy: 'revenue',
      orderType: 'all',
      topN: 10,
      beverageCategory: 'all',
    });

    expect(movement.increased[0]).toMatchObject({ name: 'Coca cola 600M', currentRevenue: 150, previousRevenue: 60, revenueDelta: 90 });
    expect(movement.decreased[0]).toMatchObject({ name: 'Arroz Chino', currentRevenue: 110, previousRevenue: 250, revenueDelta: -140 });
  });
});
```

- [ ] **Step 2: Run tests to verify RED**

Run: `npm test -- --watchAll=false --runInBand src/utils/dashboardAnalytics.test.ts`

Expected: FAIL because `dashboardAnalytics` does not exist.

---

### Task 2: Analytics Utility Implementation

**Files:**
- Create: `client/src/utils/dashboardAnalytics.ts`

- [ ] **Step 1: Implement minimal analytics utility**

Implement exported functions used by the tests. Use `getOrderCollectedAmount` and `getOrderFinancialDateKey` from `financeMetrics`.

Core behavior:

- Filter out cancelled and unpaid orders through `getOrderCollectedAmount`.
- Resolve item category from item, menu item, inventory item, or name match.
- Beverage grouping supports `Cerveza`, `Bebida`, `Jugo`.
- Calendar uses month string `YYYY-MM`, Monday-first weeks.
- Comparison returns `{ value, percent, direction }`.
- Ranking comparison returns increased and decreased movement lists with current, previous, delta, and percent fields for revenue and quantity.

- [ ] **Step 2: Run tests to verify GREEN**

Run: `npm test -- --watchAll=false --runInBand src/utils/dashboardAnalytics.test.ts`

Expected: PASS.

---

### Task 3: Source Guards

**Files:**
- Modify: `client/src/utils/dataSafety.test.ts`

- [ ] **Step 1: Add source guard test**

Add a test that checks:

```ts
test('manager dashboard uses dedicated analytics utility for rankings and calendar', () => {
  const dashboardPath = path.join(process.cwd(), 'src/pages/Manager/Dashboard.tsx');
  const source = fs.readFileSync(dashboardPath, 'utf8');

  expect(source).toContain("from '../../utils/dashboardAnalytics'");
  expect(source).toContain('buildSalesRankings');
  expect(source).toContain('buildMonthlySalesCalendar');
  expect(source).toContain('buildPeriodComparison');
  expect(source).not.toContain("smartSubscribeToCollection('pos_orders'");
});
```

- [ ] **Step 2: Run tests to verify RED**

Run: `npm test -- --watchAll=false --runInBand src/utils/dataSafety.test.ts`

Expected: FAIL until `Dashboard.tsx` imports and uses the utility.

---

### Task 4: Dashboard Data Integration

**Files:**
- Modify: `client/src/pages/Manager/Dashboard.tsx`

- [ ] **Step 1: Import analytics utility**

Import:

```ts
import {
  buildMonthlySalesCalendar,
  buildPeriodComparison,
  buildSalesRankings,
  normalizeDashboardRange,
  type RankingScope,
  type RankingSortBy,
  type BeverageCategoryFilter,
} from '../../utils/dashboardAnalytics';
```

- [ ] **Step 2: Add UI state**

Add state near existing time range state:

```ts
const [rankingScope, setRankingScope] = useState<RankingScope>('all');
const [rankingSortBy, setRankingSortBy] = useState<RankingSortBy>('revenue');
const [rankingOrderType, setRankingOrderType] = useState<'all' | 'dine_in' | 'takeout' | 'delivery'>('all');
const [rankingTopN, setRankingTopN] = useState<10 | 20 | 50>(10);
const [beverageCategoryFilter, setBeverageCategoryFilter] = useState<BeverageCategoryFilter>('all');
const [calendarMonth, setCalendarMonth] = useState(getLocalDateString().slice(0, 7));
const [movementMetric, setMovementMetric] = useState<'revenue' | 'quantity'>('revenue');
```

- [ ] **Step 3: Load menu and inventory snapshots on manual refresh**

Extend `refreshManagerData` to fetch:

```ts
smartGetDocuments('menu_items', true),
smartGetDocuments('inventory_items', true),
```

Save locally with `syncFirestore: false, notify: false`.

- [ ] **Step 4: Replace ranking calculations**

Inside `loadDashboardData`, build:

```ts
const menuItems = dataManager.getData('menu_items');
const inventoryItems = dataManager.getData('inventory_items');
const currentRankings = buildSalesRankings(filteredOrders, menuItems, inventoryItems, {
  scope: rankingScope,
  sortBy: rankingSortBy,
  orderType: rankingOrderType,
  topN: rankingTopN,
  beverageCategory: beverageCategoryFilter,
});
const monthlyCalendar = buildMonthlySalesCalendar(dashboardOrders, calendarMonth);
const rankingMovement = buildRankingComparison(filteredOrders, previousPeriodOrders, menuItems, inventoryItems, {
  scope: rankingScope,
  sortBy: movementMetric,
  orderType: rankingOrderType,
  topN: rankingTopN,
  beverageCategory: beverageCategoryFilter,
});
```

Keep old business type, expense, customer, and trend calculations until the UI is replaced.

- [ ] **Step 5: Run source guard**

Run: `npm test -- --watchAll=false --runInBand src/utils/dataSafety.test.ts`

Expected: PASS.

---

### Task 5: Commercial UI Redesign

**Files:**
- Modify: `client/src/pages/Manager/Dashboard.tsx`

- [ ] **Step 1: Replace header**

Use a compact toolbar:

- Title `数据概览`
- Subtitle `销售、排行、日历和经营对比`
- Segmented date controls.
- Month input for calendar.
- Refresh button and last sync time.

- [ ] **Step 2: Replace top KPI area**

Render six compact cards:

- 营业额
- 订单数
- 客单价
- 现金收入
- 刷卡收入
- 盈亏

Each card includes previous-period delta from `buildPeriodComparison`.

- [ ] **Step 3: Add monthly heatmap panel**

Render table/grid:

- Columns: 周一 to 周日 plus 周合计.
- Day cell shows day number, revenue, order count, and average delta.
- Use neutral commercial colors with intensity based on revenue.
- Empty cells are subdued.

- [ ] **Step 4: Add ranking panel**

Controls:

- Scope segmented: 全部商品 / 菜品 / 酒水饮料.
- Sort segmented: 按金额 / 按销量.
- Order type select: 全部 / 堂食 / Barra / Delivery.
- Top select: 10 / 20 / 50.
- Beverage category select visible when scope is beverages.

Rows:

- rank badge
- item name and category
- quantity
- revenue
- average price
- revenue share bar

- [ ] **Step 5: Add movement comparison panel**

Add a comparison panel below or beside the ranking panel:

- Header: `本期对比上期`
- Toggle: `按金额` / `按销量`
- Left list: `增长最多`
- Right list: `下降最多`
- Each row shows item/category name, current value, previous value, delta, and percent.
- Reuse ranking filters so the manager can compare all products, dishes, beverages, or one beverage category.

- [ ] **Step 6: Keep lower panels**

Preserve:

- Business type split.
- Trend table.
- Expense and purchase summaries.
- Peak hours and customer profile.

Restyle them to match the new dashboard cards without changing their data source.

---

### Task 6: Verification, Docs, Deploy

**Files:**
- Modify: `docs/2026-06-15_PROGRESS.md`

- [ ] **Step 1: Run targeted tests**

Run:

```bash
npm test -- --watchAll=false --runInBand src/utils/dashboardAnalytics.test.ts src/utils/dataSafety.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run build**

Run: `npm run build`

Expected: Compiled successfully.

- [ ] **Step 3: Deploy**

Run: `firebase deploy --only hosting --non-interactive`

Expected: Hosting URL `https://restaurant-pos-1b420.web.app`.

- [ ] **Step 4: Verify deployed site**

Run:

```powershell
Invoke-WebRequest -Uri 'https://restaurant-pos-1b420.web.app' -UseBasicParsing | Select-Object -ExpandProperty StatusCode
```

Expected: `200`.

- [ ] **Step 5: Update progress doc**

Record:

- Analytics utility created.
- Beverage sales ranking fixed.
- Monthly sales calendar added.
- Period comparison added.
- Tests/build/deploy evidence.

- [ ] **Step 6: Commit and push**

Run:

```bash
git add client/src/utils/dashboardAnalytics.ts client/src/utils/dashboardAnalytics.test.ts client/src/pages/Manager/Dashboard.tsx client/src/utils/dataSafety.test.ts docs/2026-06-15_PROGRESS.md docs/superpowers/specs/2026-06-18-manager-analytics-redesign-design.md docs/superpowers/plans/2026-06-18-manager-analytics-redesign.md
git commit -m "Redesign manager analytics overview"
git push origin main
```

Expected: pushed to `origin/main`.
