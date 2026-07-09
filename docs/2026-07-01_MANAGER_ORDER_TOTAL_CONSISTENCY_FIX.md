# 2026-07-01 Manager Order Total Consistency Fix

## Scope

Fixed the inconsistency between:

- Manager order history
- Financial reports
- Manager data overview

The visible symptom was that history showed a different amount from finance and overview. On 2026-07-01 Nicaragua time, order history showed `C$10000.00`, while financial reports and data overview showed `C$9650.00`.

## Investigation

Cloud data was checked directly from:

`stores/store_1776725610354/pos_orders`

Findings:

- Cloud orders with history date `2026-07-01`: `36`
- All 36 today's cloud orders had order numbers starting with `0701`
- No cloud records were found where a May-style order number started with `05` but had today's create/history/update date
- Today's financial total is `C$9650.00`
- The visible `C$10000.00` came from adding the cancelled order total `C$350.00`

Therefore the root cause was not a cloud order-number mutation. It was inconsistent calculation/display:

- Financial reports and data overview used collected revenue.
- Order history top total used raw `totalAmount`, which included cancelled whole orders.

## Fix

Changed `client/src/pages/Manager/OrderHistoryPage.tsx`:

- History top amount now uses `getOrderCollectedAmount(order)`.
- Cancelled whole orders no longer add to income.
- Label changed from total amount to collected amount.
- Today's order stat now separates:
  - completed orders
  - cancelled whole orders
  - cancelled items
- Initial order history state no longer renders stale local order cache before cloud refresh.

Changed `client/src/pages/Manager/Dashboard.tsx`:

- Data overview order card now shows cancelled whole orders and cancelled items alongside completed orders.
- Revenue still uses collected amount only.

Changed `client/src/utils/dataSafety.test.ts`:

- Added/updated regression checks so order history cannot return to raw `totalAmount` income.
- Added dashboard checks for cancellation summary fields.

## Verification

Commands run:

```powershell
cd C:\Users\华为\Desktop\Restaurant_POS_Cloud_Clean\client
npm test -- --watchAll=false --runTestsByPath src/utils/dataSafety.test.ts --testNamePattern="manager dashboard uses collected revenue|order history totals"
npm run build

cd C:\Users\华为\Desktop\Restaurant_POS_Cloud_Clean
firebase deploy --only hosting
```

Results:

- Targeted tests passed.
- Production build passed.
- Firebase Hosting deploy completed.
- Live bundle verified: `main.c8838d4f.js`.

Real local Chrome verification:

- Used installed Google Chrome in visible mode, not headless.
- Logged in as `zeng / 123456`.
- Verified:
  - `/manager/order-history`
  - `/manager/financial-reports`
  - `/manager`

Observed consistent values:

- History: `筛选已收金额 C$9650.00`, `完成 35 / 取消 1`, `取消菜品 0`
- Financial reports: `营业额 C$9650.00`, `完成 35 单`, `取消整单 1 单 / 取消菜品 0 道`
- Data overview: `营业额 C$9650.00`, `完成 35`, `取消 1 / 取消菜品 0`

Screenshots:

- `client/output/playwright/real-chrome-history-final-0701.png`
- `client/output/playwright/real-chrome-finance-final-0701.png`
- `client/output/playwright/real-chrome-dashboard-final-0701.png`

## Notes

If an existing browser still displays older May-style records under today, it is not present in current cloud data by the direct Firestore check above. The latest deployed history page starts from an empty state and waits for cloud refresh, so stale local order cache should no longer flash into the history list before server data arrives.
