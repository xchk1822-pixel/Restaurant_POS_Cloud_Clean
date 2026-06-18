# Expense Category Hierarchy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add parent-child accounting categories for expense records and financial reports without breaking old data.

**Architecture:** Introduce a focused `expenseCategories` utility for normalization and label resolution. Keep existing Firestore collection names and store-scoped local cache, then update the expense record UI and report helper to consume the normalized category tree.

**Tech Stack:** React, TypeScript, Jest, existing `smartSyncService`, existing `dataManager` and `dataService` store scoping.

---

## File Structure

- Create: `client/src/utils/expenseCategories.ts`
  - Owns default parent/child categories, legacy normalization, parent/child filtering, label resolution, and deletion reference checks.
- Create: `client/src/utils/expenseCategories.test.ts`
  - Regression tests for legacy flat categories, parent-child labels, child filtering, and delete blocking.
- Modify: `client/src/utils/financeMetrics.ts`
  - Add parent category fields to daily expense breakdown summaries and groups.
- Modify: `client/src/pages/Manager/ExpenseRecords.tsx`
  - Add parent-child selectors, category manager, and save parent/child snapshot fields on expenses.
- Modify: `client/src/pages/Manager/FinancialReports.tsx`
  - Display daily details grouped by parent category and child category.
- Modify: `client/src/utils/dataSafety.test.ts`
  - Add source guards for hierarchical category behavior and single-document category writes.
- Modify: `docs/2026-06-15_PROGRESS.md`
  - Record completed behavior and verification evidence.

## Tasks

### Task 1: Utility and Tests

- [ ] Add failing tests for default parents, legacy flat normalization, child filtering, category label resolution, and delete blocking.
- [ ] Implement `expenseCategories.ts`.
- [ ] Run `npm test -- --watchAll=false --runInBand src/utils/expenseCategories.test.ts`.

### Task 2: Report Grouping

- [ ] Add failing tests in `financeMetrics.test.ts` or `expenseCategories.test.ts` for parent-child daily breakdown.
- [ ] Update `financeMetrics.ts` summary/detail/group interfaces to include parent category labels.
- [ ] Run targeted utility tests.

### Task 3: Expense Records UI

- [ ] Update `ExpenseRecords.tsx` category state normalization.
- [ ] Add parent and child selectors to the add form.
- [ ] Replace category manager with parent list plus child list.
- [ ] Save `parentCategoryId`, `parentCategoryName`, and `categoryName` on new expenses.
- [ ] Preserve cloud-first single-document writes.

### Task 4: Financial Reports UI

- [ ] Update report detail grouping labels to show parent and child.
- [ ] Update print table group labels the same way.
- [ ] Keep weekly/monthly daily summary behavior unchanged.

### Task 5: Guards, Verification, Deploy

- [ ] Add data-safety guards.
- [ ] Run targeted tests.
- [ ] Run `npm run build`.
- [ ] Deploy with `firebase deploy --only hosting --non-interactive`.
- [ ] Verify live URL returns HTTP 200.
- [ ] Update progress docs, commit, and push.
