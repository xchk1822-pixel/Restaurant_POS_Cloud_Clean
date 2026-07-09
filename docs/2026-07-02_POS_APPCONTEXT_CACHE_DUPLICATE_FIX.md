# 2026-07-02 POS AppContext Cache Duplicate Fix

## Scope

- Official project: `C:\Users\华为\Desktop\Restaurant_POS_Cloud_Clean`.
- Production site: `https://restaurant-pos-1b420.web.app`.
- Date/time basis: Nicaragua local time, `America/Managua`, UTC-06:00.
- Issue checked after the new chat handoff: POS sync/cache fix had to be revalidated because the previous chat window changed and production bundle changed.

## Root Cause

- `POS.tsx` already owns the `pos_orders` localStorage cache.
- `AppContext.tsx` had a comment saying POS already saves orders and duplicate saving is not needed.
- However, `AppContext.tsx` still called:

```ts
dataManager.saveData('orders', orders, { syncFirestore: false });
```

- `dataManager` maps `orders` to `pos_orders`, so AppContext could still write POS orders into `localStorage`.
- This created a second local cache writer and could keep stale current-day orders in browser cache even when POS UI was already corrected by server data.

## Change

- `client/src/contexts/AppContext.tsx`
  - Changed AppContext order save to update memory/notifications without persisting to `localStorage`:

```ts
dataManager.saveData('orders', orders, { syncFirestore: false, persistLocal: false });
```

- `client/src/utils/dataSafety.test.ts`
  - Added a regression check to prevent AppContext from reintroducing local `pos_orders` persistence.

## Verification

- Current machine time was checked:

```text
2026-07-02 19:16:17 -06:00
```

- Targeted tests:

```text
npm test -- --runTestsByPath src/utils/dataSafety.test.ts --runInBand --watchAll=false
Result: 227 passed
```

- Build:

```text
npm run build
Result: compiled successfully
Bundle: main.ab30fddd.js
```

- Deploy:

```text
npx firebase deploy --only hosting --project restaurant-pos-1b420
Result: deploy complete
```

- Production bundle check:

```text
bundle=main.ab30fddd.js
```

- Firestore pollution check:

```text
orderNumber=07029999
count=0
```

- Real browser proof on production:
  - Logged in as `zeng`.
  - Injected fake current-day local cache order `07029999`.
  - Reloaded production POS.
  - Result:

```json
{
  "visibleFakeOrder": false,
  "cacheCheck": {
    "count": 0,
    "matches": [],
    "writeCount": 11,
    "writesWithFake": 0,
    "writesWithoutFake": 11
  },
  "errors": []
}
```

## Notes

- The previous claim that it was July 3 was wrong. The verified current local date is July 2, 2026 Nicaragua time.
- Live production order totals changed during verification because the restaurant was operating.
- This change only removes a duplicate cache writer. It does not change order creation, payment, completion, stock deduction, or table logic.
