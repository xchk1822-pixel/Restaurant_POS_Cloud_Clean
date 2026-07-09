# 2026-06-30 POS Controlled Lifecycle Flow

Date: 2026-06-30, America/Managua.

## Scope

This pass adds controlled lifecycle coverage for POS dine-in order states without creating production orders.

It verifies the business state that staff see on screen:

- order card color
- order status text
- table status
- terminal versus active order state

## Completed

- Added `getPosLifecycleSnapshot` in `client/src/utils/posLifecycle.ts`.
- Added a controlled flow test in `client/src/utils/posLifecycle.test.ts`.

## Covered Flow

```text
confirmed unpaid -> table occupied -> red card -> Confirmado
paid active      -> table needs_cleaning -> orange card -> Pagado
completed cleared -> table available -> neutral card -> Completado
cancelled        -> table available -> neutral card -> Cancelado
```

This does not write to Firestore and does not create test orders in production.

## Verification

Tests:

```powershell
cd C:\Users\鍗庝负\Desktop\Restaurant_POS_Cloud_Clean\client
npm test -- --watchAll=false --runTestsByPath src/utils/dataSafety.test.ts src/utils/posLifecycle.test.ts
```

Result:

```text
PASS src/utils/posLifecycle.test.ts
PASS src/utils/dataSafety.test.ts
Tests: 199 passed, 199 total
```

Build:

```powershell
npm run build
```

Result:

```text
Compiled successfully.
main.887a9363.js
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
BUNDLE=static/js/main.887a9363.js
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
bundle: /static/js/main.887a9363.js
```

## Remaining

The next commercial hardening step should move from POS lifecycle state coverage into inventory lifecycle hardening:

- purchase creates stock movement and finance link once
- warehouse/fridge transfer is idempotent and audited
- stocktake history is store-scoped and complete
- completed POS orders deduct inventory exactly once
