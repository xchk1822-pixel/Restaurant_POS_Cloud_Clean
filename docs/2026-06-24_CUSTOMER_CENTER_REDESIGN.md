# 2026-06-24 Customer Center Redesign

## Goal

Rebuild Customer Management as a commercial-grade customer center while preserving existing customer storage, deletion tombstones, points settings, and store-scoped cloud/local data behavior.

## Approved Direction

Option B: Commercial Customer Center.

## Product Design

The module should feel like a focused CRM screen for a restaurant manager:

- Dense but clean management layout.
- Quiet business colors using shared `uiTokens`.
- No marketing hero, no decorative cards, no unrelated visual effects.
- Customer data should be scannable on desktop and usable on smaller screens.
- Low-frequency module, no realtime subscription; manual cloud refresh remains correct.

## Functional Scope

- Customer KPI strip:
  - total customers
  - active customers
  - sleeping customers
  - total points
  - total spending
  - average spend per customer
- Customer segmentation:
  - all customers
  - VIP/high value
  - active/recent visit
  - sleeping/no recent visit
  - points balance
- Customer list:
  - search by name or phone
  - filter by segment
  - sort by recent visit, spending, points, visit count, name
  - compact commercial table/card hybrid
- Customer detail panel:
  - contact and social accounts
  - level and value summary
  - lifetime spend, visit count, average ticket
  - points balance and redeem value
  - recent point transactions
- Points settings:
  - stay in the same module
  - show current rule clearly
  - keep existing `exchange_rate` storage path
- Customer analytics:
  - compute customer insights from customers, completed paid orders, and points transactions
  - do not trust stale `totalSpent` blindly when linked orders exist
  - keep helper code outside the page component

## Data Rules

- Store isolation stays unchanged through the existing `smartGetDocuments` and `dataManager` store-scoped paths.
- Existing customer writes still wait for cloud writes before local state updates.
- Existing `customer_deletions` tombstone behavior is preserved.
- Existing points transaction storage is preserved.
- The redesign does not create new global collections.

## Files

- Create `client/src/utils/customerAnalytics.ts`
- Create `client/src/utils/customerAnalytics.test.ts`
- Modify `client/src/pages/Customers/CustomersModule.tsx`
- Modify `client/src/utils/dataSafety.test.ts`
- Update progress docs after verification.

## Verification Plan

- Unit test customer analytics.
- Data safety test that the new customer center uses `customerAnalytics`, shared UI tokens, and preserves customer write paths.
- Production build.
- Browser check deployed `/customers` with `zeng / 123456`.

## Completed

- Added `client/src/utils/customerAnalytics.ts` as the customer analytics layer.
- Added `client/src/utils/customerAnalytics.test.ts` to cover:
  - paid-order-based customer spend and visit metrics
  - active, sleeping, VIP, and points customer segmentation
  - search/filter/sort behavior
  - newest-first point ledger for one customer
- Rebuilt `client/src/pages/Customers/CustomersModule.tsx` into a Customer Center:
  - KPI strip
  - segment filters
  - searchable/sortable customer table
  - customer 360 detail panel
  - points settings
  - recent point ledger
- Kept strict customer profile fields. The page does not loosen the customer data model for old/legacy customers.
- Preserved existing cloud/local paths:
  - `customers`
  - `customer_deletions`
  - `points_transactions`
  - `exchange_rate`
- Kept Customer Management as a low-frequency module with manual refresh, no realtime customer subscription.

## Verification

- `npm test -- --watchAll=false --runTestsByPath src/utils/customerAnalytics.test.ts`
  - 4 tests passed.
- `npm test -- --watchAll=false --runTestsByPath src/utils/dataSafety.test.ts -t "customer management uses customer center analytics"`
  - 1 targeted data-safety test passed.
- `npm run build`
  - production build compiled successfully.
- Firebase Hosting deployed:
  - `https://restaurant-pos-1b420.web.app`
- Browser verification:
  - logged in with `zeng / 123456`
  - opened `/customers`
  - verified `data-customer-center`, KPI, segment filters, detail panel, and point ledger markers
  - browser console errors: 0
  - screenshot: `client/output/customer-center-redesign-live.png`
