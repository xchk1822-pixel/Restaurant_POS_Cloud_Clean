# 2026-06-30 Purchase Stock Record Ledger

Date: 2026-06-30, America/Managua.

## Scope

This pass continues Step 4, inventory lifecycle hardening.

Purchase order creation already wrote the purchase order, incremented warehouse stock, linked cash purchase expenses, and updated supplier debt. This pass adds a matching stock in/out ledger record for each purchased item line.

## Fix

Updated:

```text
client/src/pages/Inventory/PurchaseManagement.tsx
client/src/utils/dataSafety.test.ts
```

For every purchase item line, the system now writes:

```text
stores/{storeId}/inventory_stock_records/{recordId}
```

Record details:

- `type: 'in'`
- `source: 'purchase_order'`
- purchase order id and order number
- supplier id/name
- warehouse before stock
- purchased quantity
- warehouse after stock
- item id/name/unit
- created time and `createdAtMs`

The record id is deterministic:

```text
stock-record-${order.id}-${orderItem.itemId}-${itemIndex}
```

This matches the purchase stock increment idempotency pattern and avoids duplicate visible ledger rows on retry of the same purchase order line.

## Verification

Red test first:

```powershell
cd C:\Users\华为\Desktop\Restaurant_POS_Cloud_Clean\client
npm test -- --watchAll=false --runTestsByPath src/utils/dataSafety.test.ts --testNamePattern="purchase order creation"
```

Initial result:

```text
FAIL src/utils/dataSafety.test.ts
Expected purchase_order inventory_stock_records write was missing.
```

Targeted tests:

```powershell
npm test -- --watchAll=false --runTestsByPath src/utils/stockDeduction.test.ts src/utils/posLifecycle.test.ts src/utils/dataSafety.test.ts
```

Result:

```text
PASS src/utils/dataSafety.test.ts
PASS src/utils/stockDeduction.test.ts
PASS src/utils/posLifecycle.test.ts
Tests: 204 passed, 204 total
```

Build:

```powershell
npm run build
```

Result:

```text
Compiled successfully.
main.cf1a78a2.js
```

Deployment:

```powershell
firebase deploy --only hosting
```

Result:

```text
Deploy complete.
Hosting URL: https://restaurant-pos-1b420.web.app
```

Live checks:

```text
STATUS=200
BUNDLE=static/js/main.cf1a78a2.js
```

Browser checks:

```text
POS /pos: Mesas true, Pedidos true, errorCount 0, bundle main.cf1a78a2.js
Inventory /inventory: stock in/out tab visible true, rendered true, errorCount 0, bundle main.cf1a78a2.js
```

## Remaining

- Extend `inventory_stock_records` to POS completion stock deductions.
- Extend `inventory_stock_records` to fridge transfers.
- Add search/filter UI once real records accumulate.
