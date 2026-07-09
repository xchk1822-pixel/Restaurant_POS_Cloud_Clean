# 2026-07-08 P0/P1 Security Baseline

## Scope

Precise P0/P1 hardening only:
- Firebase Storage rules
- Firestore role-level rules
- Auth state revalidation
- Failing regression tests
- Git archive baseline preparation

No POS order, inventory deduction, receipt layout, or UI business-flow changes were included in this pass.

## Completed

1. Storage rules
   - Public read remains enabled for menu images.
   - Menu image writes now require an active authenticated user with access to the same store.
   - Image uploads allow `image/*` content types up to 8 MB.
   - The broad fallback rule now denies all unmatched Storage paths.

2. Firestore rules
   - Added active-user validation from `users/{uid}.status`.
   - Added role helpers for super admin, store access, POS operation, inventory management, customer management, and store management.
   - Store-scoped writes are now role-limited instead of using one broad same-store write rule.
   - Super admin keeps cross-store management access.

3. Auth state revalidation
   - Firebase Auth session restore now reloads the user profile from Firestore before trusting cached role/store data.
   - Inactive users are rejected when online.
   - Offline fallback is preserved: when Firestore profile revalidation fails while offline, cached `current_user` can still restore the session.

4. Store-user background sync
   - Branch users no longer request global `users` and `stores` collections during login background sync.
   - This prevents false permission errors after role-level Firestore rules are deployed.

5. Regression coverage
   - Added/updated data safety tests for Storage rules, Firestore role rules, auth revalidation, and branch-user sync scope.
   - Updated POS lifecycle expectations to match the current empty-string table release marker.

## Verification

Commands run:

```powershell
npm test -- --watchAll=false --runInBand src/utils/posLifecycle.test.ts src/utils/stockDeduction.test.ts src/utils/financeMetrics.test.ts src/utils/dataSafety.test.ts src/utils/receiptPrinter.test.ts
npm run build
firebase deploy --only firestore:rules,storage --dry-run
firebase deploy --only firestore:rules,storage,hosting
```

Results:
- Targeted regression tests: 269 passed.
- Production build: compiled successfully.
- Firebase rules dry-run: Storage and Firestore rules compiled successfully.
- Firebase deploy: rules and hosting deployed to `https://restaurant-pos-1b420.web.app`.

Browser verification on deployed production:
- `admin/admin123`: `/dashboard`, `/settings/stores`, `/settings/permissions`
- `zeng/123456`: `/pos`, `/manager/order-history`, `/manager/financial-reports`, `/manager`, `/inventory`
- Result: all routes rendered non-blank and no blocking console errors, page errors, or Firestore permission errors were captured.

## Notes

- A Recharts container-size warning can still appear on dashboard charts. It was not treated as P0/P1 because pages render and it is unrelated to security/auth/data permissions.
- Offline behavior remains a product requirement. This pass preserves local cached session restore for offline conditions while tightening online revalidation.
