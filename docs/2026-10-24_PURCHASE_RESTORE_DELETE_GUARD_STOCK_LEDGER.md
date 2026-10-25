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
- Location filters support warehouse, fridge, all locations, and a specific fridge.
- New purchase, deletion, stocktake, and item-edit records store the authenticated account as operator.
- Legacy records that contain `system` are labelled as an old record without a captured account; no account name is fabricated.

## Verification

- `npm test -- --watchAll=false --runInBand src/utils/dataSafety.test.ts`: 301 passed.
- `npm run build`: compiled successfully.
- Firestore rules and Firebase Hosting were deployed to `restaurant-pos-1b420`.
- Real-browser verification confirmed the 2026-10-17 purchase at C$8,821 and the separate 2026-10-24 purchase at C$3,143 under the same merchant reference.
- Real-browser verification confirmed one transfer row showing quantity `-7 / +7`, warehouse `7 -> 0`, fridge `5 -> 12`, and operator `belki`.
- Real-browser verification confirmed restored purchase ledger rows show operator `zeng`.
