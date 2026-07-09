# 2026-06-30 Purchase Stock Increment Idempotency

Date: 2026-06-30, America/Managua.

## Scope

This pass continues Step 4, inventory lifecycle hardening.

It fixes a purchase-stock safety gap: purchase order creation already used `smartIncrementField` for warehouse stock, but did not pass a stable `syncOperationId`.

Without a stable operation id, weak-network retry or replay could treat the same purchase stock increment as a new operation and add inventory again.

## Fix

Updated:

```text
client/src/pages/Inventory/PurchaseManagement.tsx
client/src/utils/dataSafety.test.ts
```

Each purchase stock increment now uses a deterministic operation id:

```text
purchase-stock-${order.id}-${orderItem.itemId}-${itemIndex}
```

This keeps every purchase line unique, while making a replay of the same purchase order line idempotent.

## Verification

Red test first:

```powershell
cd C:\Users\华为\Desktop\Restaurant_POS_Cloud_Clean\client
npm test -- --watchAll=false --runTestsByPath src/utils/dataSafety.test.ts --testNamePattern="purchase order creation"
```

Initial result:

```text
FAIL src/utils/dataSafety.test.ts
Expected stable purchase stock syncOperationId was missing.
```

Targeted tests after the fix:

```powershell
npm test -- --watchAll=false --runTestsByPath src/utils/stockDeduction.test.ts src/utils/posLifecycle.test.ts src/utils/dataSafety.test.ts
```

Result:

```text
PASS src/utils/stockDeduction.test.ts
PASS src/utils/posLifecycle.test.ts
PASS src/utils/dataSafety.test.ts
Tests: 203 passed, 203 total
```

Build:

```powershell
npm run build
```

Result:

```text
Compiled successfully.
main.244a9c1a.js
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
BUNDLE=static/js/main.244a9c1a.js
```

POS smoke:

```powershell
npm run verify:pos-smoke -- --password 123456
```

Result:

```text
url: https://restaurant-pos-1b420.web.app/pos
hasMesas: true
hasPedidos: true
errorCount: 0
bundle: /static/js/main.244a9c1a.js
```

## Remaining

- Existing negative warehouse values still need approved stocktake correction.
- Continue Step 4 with stocktake adjustment ledger and POS completion stock-deduction audit records.
