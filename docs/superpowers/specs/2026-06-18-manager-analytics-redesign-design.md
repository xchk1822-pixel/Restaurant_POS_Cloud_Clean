# Manager Analytics Redesign Design

## Goal

Redesign the manager data overview into a commercial-grade analytics workspace for store managers and owners. The screen must show revenue health, sales movement, product rankings, beverage rankings, and period comparisons clearly enough for daily store decisions.

## Current Context

- The route is `client/src/pages/Manager/ManagerOverview.tsx`, which renders `client/src/pages/Manager/Dashboard.tsx`.
- `Dashboard.tsx` already loads store-scoped cloud snapshots with `smartGetDocuments('pos_orders', true)`, `expenses`, and `purchase_orders`.
- Existing analytics are mostly in the page component and rely on `order.items[].category`. That misses or weakens beverage reporting when POS order items do not carry category data.
- Financial collection amounts should continue using `getOrderCollectedAmount`, `getOrderPaymentBreakdown`, and `getOrderFinancialDateKey` from `client/src/utils/financeMetrics.ts`.
- This module should stay manual-refresh, not realtime subscription.

## Product Requirements

1. Keep all data store-scoped and use the current manager refresh pattern.
2. Add a monthly sales calendar heatmap:
   - Week rows, Monday through Sunday columns.
   - Each day shows date, revenue, order count, and percentage vs monthly daily average.
   - Color intensity should reveal high and low sales days at a glance.
   - Weekly totals should appear at the end of each week row.
3. Add sales ranking controls:
   - Scope: all products, dishes, beverages.
   - Beverage categories: `Cerveza`, `Bebida`, `Jugo`.
   - Sort by quantity or revenue.
   - Filter by order type: all, dine in, Barra, delivery.
   - Top N: 10, 20, 50.
4. Add comparison analytics:
   - Current period vs previous equal-length period.
   - Revenue, orders, average ticket, cash, card, profit.
   - Show absolute change and percentage change.
   - Support month-to-month review, such as selected month vs previous month.
   - Show what increased and what decreased:
     - Products with the largest revenue increase/decrease.
     - Products with the largest quantity increase/decrease.
     - Beverage movement for `Cerveza`, `Bebida`, and `Jugo`.
     - Order type movement for dine in, Barra, and delivery.
5. Improve UI using commercial software aesthetics:
   - Dense but readable dashboard.
   - Clear hierarchy, compact controls, consistent card radius, no decorative marketing layout.
   - Mobile-friendly stacked layout for owner phone review.
6. Preserve existing business metrics:
   - Revenue, cash/card split, order type split, expense and purchase summaries, peak hours, customer profile.

## Data Design

Create a focused analytics utility:

- `client/src/utils/dashboardAnalytics.ts`
- `client/src/utils/dashboardAnalytics.test.ts`

The utility will export:

- `buildDashboardAnalytics(input)`
- `normalizeDashboardRange(range, startDate, endDate, now)`
- `buildSalesRankings(orders, menuItems, inventoryItems, filters)`
- `buildMonthlySalesCalendar(orders, monthDate)`
- `buildPeriodComparison(current, previous)`
- `buildRankingComparison(currentOrders, previousOrders, menuItems, inventoryItems, filters)`

Ranking category resolution:

1. Prefer explicit `order.items[].category`.
2. If missing, match by `menuItemId` against `menu_items`.
3. If still missing, match by `stockItemId` against `inventory_items`.
4. If still missing, match item name case-insensitively against menu and inventory names.
5. Treat category names or keys matching `cerveza`, `bebida`, `jugo`, `jugos`, `beer`, `drink`, `juice`, `alcohol`, `beverage` as beverage-related, with display groups `Cerveza`, `Bebida`, or `Jugo` when possible.

## UI Design

Top toolbar:

- Title: `数据概览`
- Date range segmented buttons: today, week, month, custom.
- Month selector for calendar.
- Refresh button and last sync time.

First viewport:

- KPI strip: revenue, orders, average ticket, cash, card, profit.
- Each KPI shows current value plus previous-period delta.

Main workspace:

- Left or top large panel: monthly sales calendar heatmap.
- Right panel: period comparison summary, best/worst weekday, and month-to-month movement.

Comparison workspace:

- Summary cards compare current period vs previous period.
- Movement toggle: revenue or quantity.
- Scope toggle: all products, dishes, beverages, order types.
- `增长最多` list: current value, previous value, delta, percentage.
- `下降最多` list: current value, previous value, delta, percentage.
- When beverage scope is selected, allow filtering by `Cerveza`, `Bebida`, `Jugo`, or all beverages.

Ranking workspace:

- Tab-like segmented control: all products, dishes, beverages.
- Filters: sort by revenue/quantity, order type, Top N, beverage category.
- Ranking rows show rank, item name, category, quantity, revenue, average price, and share of selected ranking revenue.

Lower analysis:

- Order type split, peak hours, sales trend table, expense/purchase summary, customer profile.

## Testing Strategy

- Unit tests for dashboard analytics:
  - Beverage sales are included even when order items lack category but have `stockItemId` or matching names.
  - Ranking sort switches correctly between quantity and revenue.
  - Monthly calendar groups days Monday-Sunday and computes weekly totals.
  - Period comparison computes value and percentage deltas.
  - Ranking comparison reports increased and decreased products between two periods.
- Source guard in `dataSafety.test.ts`:
  - Manager dashboard uses `dashboardAnalytics` instead of ad hoc item ranking only.
  - Dashboard refresh remains manual cloud snapshot, not realtime subscription.

## Implementation Notes

- Do not change POS order write paths.
- Do not introduce realtime subscriptions to inventory, menu, or dashboard data.
- Keep edits scoped to analytics utilities, `Dashboard.tsx`, tests, and progress docs.
- Use existing inline style approach in `Dashboard.tsx` for now, but keep helper style objects compact.
