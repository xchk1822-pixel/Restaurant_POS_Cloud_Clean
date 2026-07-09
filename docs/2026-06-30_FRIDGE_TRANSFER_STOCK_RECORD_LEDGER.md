# 2026-06-30 Fridge Transfer Stock Record Ledger

## Scope

Continue Step 4 inventory lifecycle hardening by connecting fridge transfer movements to the unified stock in/out records ledger.

## Changes

- Updated `client/src/services/smartSyncService.ts`.
- `smartTransferFridgeStock` now writes two deterministic `inventory_stock_records` documents inside the same Firestore transaction as the stock transfer:
  - `${operationId}-warehouse`
  - `${operationId}-fridge`
- Both records use `source: 'fridge_transfer'`, `type: 'transfer'`, signed quantity, before stock, after stock, item, unit, fridge id/name, and Nicaragua date metadata.
- Weak-network pending fridge transfers also write local pending stock ledger rows, then the same transaction writes the confirmed cloud rows when pending sync replays.
- Updated `client/src/utils/dataSafety.test.ts` so fridge transfer cannot regress back to split stock writes without audited ledger records.

## Verification

- RED check failed before implementation:
  - `npm test -- --watchAll=false --runTestsByPath src/utils/dataSafety.test.ts --testNamePattern="fridge transfer writes one audited transaction"`
- Targeted test passed after implementation:
  - same command passed, 1 test passed.
- Regression group passed:
  - `npm test -- --watchAll=false --runTestsByPath src/utils/stockDeduction.test.ts src/utils/posLifecycle.test.ts src/utils/dataSafety.test.ts`
  - 3 suites passed, 204 tests passed.
- Production build passed:
  - `npm run build`
  - bundle `main.95140e35.js`.
- Firebase Hosting deployed:
  - `firebase deploy --only hosting`
  - live URL returned HTTP 200 with `static/js/main.95140e35.js`.
- Online POS smoke passed:
  - `npm run verify:pos-smoke -- --password 123456`
  - `/pos` rendered `Mesas` and `Pedidos`, console/page errors 0.
- Online inventory browser verification passed:
  - `/inventory` loaded with bundle `main.95140e35.js`, console/page errors 0.
  - Stock in/out records tab opened and rendered columns plus empty-state text.

## Notes

- This does not silently correct existing negative stock. Existing stock differences must still be corrected through stocktake or an approved adjustment flow so the audit trail stays accurate.
- Firestore rules were already updated earlier for `stores/{storeId}/inventory_stock_records`, so this change required Hosting deploy only.
