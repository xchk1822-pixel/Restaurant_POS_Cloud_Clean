# 2026-06-24 Supplier Permission Visibility Fix

## Problem
- Store manager login did not show the new Supplier Management module after refresh.
- Admin Permission Management still displayed Supplier Management under Inventory.

## Root Cause
- The old role permission tree still contained `inventory:suppliers`.
- Existing browser/cloud role configs could override default permissions and did not contain the new `suppliers:manage` permission.

## Fix
- Removed `inventory:suppliers` from the Permission Management tree.
- Added first-level `suppliers:manage` permission node for Supplier Management.
- Added `PERMISSION_SCHEMA_VERSION` and legacy permission migration.
- Legacy store-manager roles with old Inventory access now gain `suppliers:manage` once.
- Versioned role configs can still explicitly hide Supplier Management later if the owner changes permissions.

## Verification
- `npm test -- --watchAll=false --runTestsByPath src/utils/permissions.test.ts`
- `npm test -- --watchAll=false --runTestsByPath src/utils/dataSafety.test.ts`
- `npm run build`
- Firebase Hosting deploy to `restaurant-pos-1b420`
- Browser verification:
  - Store manager `zeng/123456` with legacy local `system_roles` cache shows Supplier Management.
  - `/suppliers` opens and shows Supplier Profiles, Debt Orders, Payment Records, and Reconciliation Print.
  - Admin `admin/admin123` Permission Management shows Supplier Management as an independent permission item.
