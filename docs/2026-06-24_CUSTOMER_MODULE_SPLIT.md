# 2026-06-24 Customer Management Module Split

## Goal

Move Customer Management out of Store Manager Management and make it a first-level low-frequency module directly below Supplier Management.

## Completed

- Moved the customer business component:
  - From `client/src/pages/Manager/CustomersModule.tsx`
  - To `client/src/pages/Customers/CustomersModule.tsx`
- Deleted the old wrapper page:
  - `client/src/pages/Manager/ManagerCustomers.tsx`
- Updated routing:
  - New route: `/customers`
  - Permission: `customers:manage`
  - Removed old route: `/manager/customers`
- Updated sidebar:
  - Removed Customer Management from the Store Manager Management submenu.
  - Added Customer Management as a first-level module immediately after Supplier Management.
- Updated permissions:
  - Added `customers:manage`.
  - Removed `manager:customers` from default store-manager permissions.
  - Bumped `PERMISSION_SCHEMA_VERSION` to `3`.
  - Added migration from legacy `manager:customers` to `customers:manage` so old role cache/config still gives store managers access.
- Preserved existing customer data logic:
  - Customer cloud reads and deletion tombstones remain unchanged.
  - Customer points settings and exchange-rate cache behavior remain unchanged.

## Regression Guards

Updated `client/src/utils/dataSafety.test.ts` to prove:

- `/customers` exists and uses `customers:manage`.
- `/manager/customers` is not exposed.
- Old Manager customer component files no longer exist.
- Customer module source exists under `client/src/pages/Customers/`.
- Sidebar places `/customers` after `/suppliers`.
- Permission Management exposes `customers:manage` as an independent permission item.
- Store-manager default permissions no longer include `manager:customers`.

## Verification

- `npm test -- --watchAll=false --runTestsByPath src/utils/dataSafety.test.ts -t "customer management is a first-level module"`: passed.
- `npm test -- --watchAll=false --runTestsByPath src/utils/dataSafety.test.ts -t "customer refresh|points and exchange-rate|customer management is a first-level module"`: passed, 3 tests.
- `npm test -- --watchAll=false --runTestsByPath src/utils/customerRecords.test.ts src/utils/customerPoints.test.ts src/utils/permissions.test.ts`: passed, 5 tests.
- `npm run build`: production build passed.
- `firebase deploy --only hosting --project restaurant-pos-1b420`: deployed.

Online browser check:

- URL: `https://restaurant-pos-1b420.web.app/customers`
- Login: `zeng / 123456`
- Confirmed Customer Management opens as an independent page.
- Confirmed old `/manager/customers` path is not present in rendered page HTML.
- Console errors: `0`
- Screenshot: `client/output/customer-module-split-live.png`
