# 2026-07-06 Expense Save Confirmation

## Scope
- Precise fix for manual expense entry only.
- Add a confirmation dialog before saving a new expense record to prevent accidental taps/clicks.

## Change
- Updated `client/src/pages/Manager/ExpenseRecords.tsx`.
- `handleAddExpense` now validates amount first, then calls:
  - `window.confirm('确认保存这条开支记录吗？')`
- If the user cancels, the function returns before building or writing the expense document.
- Cloud write order remains unchanged: `smartSetDocument('expenses', newExpense.id, newExpense)` still happens before local UI/cache update.

## Regression Coverage
- Updated `client/src/utils/dataSafety.test.ts`.
- The existing expense records safety test now asserts the confirmation prompt exists before the Firestore write.

## Verification
- `npm test -- --runTestsByPath src/utils/dataSafety.test.ts --runInBand --watchAll=false --testNamePattern="expense records use explicit single-document cloud writes"`
- `npm run build`

## Deploy
- Build bundle: `main.afda0408.js`
