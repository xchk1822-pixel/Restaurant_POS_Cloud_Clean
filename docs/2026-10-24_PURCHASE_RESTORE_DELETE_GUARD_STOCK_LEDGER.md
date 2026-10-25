# 2026-10-24 Purchase restore and stock ledger hardening

## Scope

- Production repository: `Restaurant_POS_Cloud_Clean`
- Firebase project: `restaurant-pos-1b420`
- Store: `store_1776725610354` (Bluefields)
- Changes are limited to purchase restoration safeguards, purchase deletion authorization, inventory movement presentation, and operator attribution.

## Restored purchase

- Purchase document: `po-1792281656270`
- Merchant reference: `0011701740026`
- Business date: 2026-10-17
- Supplier: Cerveza
- Confirmed rounded total: C$8,821
- Exact item sum: C$8,820.96
- SELTZER historical unit price reconciled to C$36.27, subtotal C$1,740.96
- The matching cash expense and warehouse quantities were restored once with deterministic audit record IDs.
- The valid 2026-10-24 purchase with the same merchant reference was preserved.

## Root cause and prevention

- The merchant reference was incorrectly treated as globally unique, although the supplier reuses it.
- Duplicate prevention is now scoped to the same merchant reference on the same business date.
- Purchase creation remains available to accounts with purchase permission.
- Purchase deletion is restricted in both UI and Firestore rules to store manager, multi-store manager, or super administrator roles.

## Stock movement records

- The records table has separate `warehouse before -> after` and `fridge before -> after` columns.
- A warehouse/fridge transfer is grouped into one visible row so both balances can be compared directly.
- Warehouse and fridge values always appear together in the same table; they are not split into separate views.
- The top filter selects an item category, while free-text search continues to support item, order, reason, operator, and fridge.
- Warehouse balances use green emphasis and fridge balances use blue emphasis. The quantity column shows one absolute movement amount; direction remains visible in the movement type and before/after balances.
- Movement type is normalized into four business labels: inbound (green), outbound (red), transfer (purple), and stocktake (amber). Labels use a stable single-line width; historical technical record types remain unchanged.
- Item category is an inline badge and table spacing is compact so more movement rows remain visible.
- The duplicate records refresh button was removed. The main inventory refresh button refreshes the selected stock-record date range when the records tab is active.
- Display formatting removes floating-point noise without changing stored inventory values.
- New purchase, deletion, stocktake, and item-edit records store the authenticated account as operator.
- Legacy records that contain `system` are labelled as an old record without a captured account; no account name is fabricated.

## Verification

- `npm test -- --watchAll=false --runInBand src/utils/dataSafety.test.ts`: 301 passed.
- `npm run build`: compiled successfully.
- Firestore rules and Firebase Hosting were deployed to `restaurant-pos-1b420`.
- Real-browser verification confirmed the 2026-10-17 purchase at C$8,821 and the separate 2026-10-24 purchase at C$3,143 under the same merchant reference.
- Real-browser verification confirmed one transfer row showing quantity `7`, warehouse `7 -> 0`, fridge `5 -> 12`, and operator `belki`.
- Real-browser verification confirmed restored purchase ledger rows show operator `zeng`.
- Production browser verification at 1440x900 confirmed the category filter, compact rows, same-table warehouse/fridge balances, and complete single-line type labels.
- The `Cerveza` category displayed `5 / 33` records; after using the only top `刷新库存` action it remained `5 / 33`.
- Production data contained and rendered all four business types with the intended green/red/purple/amber colors. Browser console result: 0 errors and 0 warnings.
