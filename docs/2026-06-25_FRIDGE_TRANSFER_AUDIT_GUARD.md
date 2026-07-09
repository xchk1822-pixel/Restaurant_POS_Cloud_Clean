# 2026-06-25 Fridge Transfer Audit Guard

## Scope

Fixed the fridge transfer flow that could create duplicate transfers or negative warehouse stock when a button was clicked repeatedly or the network was slow.

## Cloud Audit Finding

- `TOÑA VIDRIO` cloud stock was already manually corrected before this fix: warehouse `0`, fridge `54`, total visible `54`.
- The previously mentioned `102` value matched `COCA VIDRIO` in cloud, not `TOÑA VIDRIO`.
- The code risk was real even though the live stock was corrected: fridge transfer used two separate increment writes and had no submit lock, so duplicate clicks could pass the same stale local stock check and write twice.

## Implemented

- Added `smartTransferFridgeStock` in `client/src/services/smartSyncService.ts`.
- Transfer now uses one Firestore transaction for:
  - warehouse `inventory_items.currentStock`
  - fridge `fridge_inventory.quantity`
  - new `stock_transfer_records` audit entry
- The transaction checks cloud stock before writing:
  - warehouse to fridge is blocked if warehouse stock is insufficient.
  - fridge to warehouse is blocked if fridge stock is insufficient.
- Added audit records with:
  - item id/name/unit
  - fridge id/name
  - direction
  - quantity
  - before/after warehouse stock
  - before/after fridge stock
  - Nicaragua date and timestamp
- Added a submit lock to the fridge transfer modal:
  - one click immediately sets `isTransferSubmitting`.
  - confirm button is disabled while processing.
  - cancel button is disabled while processing.
- Removed the cached `isOnline` pre-check from fridge transfer. The previous guard could reject a transfer as offline before Firestore was actually tried, so a stale browser/network flag could show a false "no network" error while internet access was normal.
- Fridge transfer now always attempts the Firestore transaction when Firestore is enabled.
- Weak-network transfer timeout now creates a local pending transfer instead of a fake offline failure.
- Pending transfer updates the local warehouse/fridge view and writes a local `stock_transfer_records` row with `pendingCloudSync: true`.
- When the browser comes back online, pending sync replays the transfer through the same Firestore transaction with `allowPendingFallback: false`, so the official cloud stock still gets stock checks and duplicate operation protection.
- Added a `调拨记录` entry in `库存管理 -> 冰箱盘点`.
- Transfer records now open in a large query modal:
  - default date is today
  - date can be cleared to show all records
  - search supports item name, fridge name, and operation id
  - time is rendered with Nicaragua timezone down to minutes
  - warehouse/fridge before and after values are visible in one row
  - pending cloud sync records are marked separately
- Enlarged the stocktake history modal to `96vw`, max `1320px`, and `90vh` so warehouse/fridge history is easier to inspect.
- Refined the stocktake history modal layout:
  - top action bar is more compact
  - record spacing and record headers use less vertical space
  - each fridge stocktake table now expands with its content instead of being limited to a small nested `300px` scroller
  - the modal body is the main scroll area, making stocktake records easier to scan continuously
- Fixed the live transfer failure after adding audit records:
  - Root cause: `smartTransferFridgeStock` writes `inventory_items`, `fridge_inventory`, and `stock_transfer_records` in one Firestore transaction, but `firestore.rules` did not yet allow `stores/{storeId}/stock_transfer_records/{recordId}`.
  - Added the missing store-scoped Firestore rule for `stock_transfer_records`.
  - Added explicit `permission-denied` handling so a future rule problem shows a clear permission message instead of the generic transfer-save failure.

## Follow-Up Plan

- Add the same one-click submit guard to every high-risk action:
  - POS complete / clear table / payment / cancel order
  - purchase order submit
  - stocktake complete
  - supplier repayment
  - destructive delete buttons
- Continue adding the same pending-operation pattern to other high-risk write flows that still block on weak network.

## Verification

- `npm test -- --watchAll=false --runTestsByPath src/utils/dataSafety.test.ts --testNamePattern="fridge transfer|cached offline flag"` passed.
- `npm test -- --watchAll=false --runTestsByPath src/utils/dataSafety.test.ts --testNamePattern="fridge transfer|pending transfer order|cached offline flag"` passed.
- `npm test -- --watchAll=false --runTestsByPath src/utils/dataSafety.test.ts --testNamePattern="transfer records|fridge transfer"` passed.
- `npm test -- --watchAll=false --runTestsByPath src/utils/dataSafety.test.ts --testNamePattern="fridge transfer|stock_transfer_records|permission errors"` passed.
- `npm test -- --watchAll=false --runTestsByPath src/utils/dataSafety.test.ts --testNamePattern="stocktake history table|fridge transfer records"` passed.
- `npm run build` passed.
- Firebase Hosting deploy passed for project `restaurant-pos-1b420`.
- Live URL: `https://restaurant-pos-1b420.web.app`.
