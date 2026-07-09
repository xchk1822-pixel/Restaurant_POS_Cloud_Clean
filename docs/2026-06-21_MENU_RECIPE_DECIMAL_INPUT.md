# Menu Recipe Decimal Quantity Input Fix

Date: 2026-06-21
Project: `C:\Users\华为\Desktop\Restaurant_POS_Cloud_Clean`

## Completed

- Fixed菜品管理编辑弹窗里的配方数量输入框不能正常输入 `0.5` 的问题。
- Root cause: the old input was `type="number"` and parsed every keystroke into a number immediately. When the user typed `0.`, React stored it as numeric `0`, then `value={ing.quantity || ''}` erased the visible draft value.
- Updated `client/src/pages/Inventory/MenuManagement.tsx` so recipe quantity uses a decimal text draft while editing, keeps `0.5` visible, and still stores numeric quantity for save and stock deduction.
- Added a regression guard in `client/src/utils/dataSafety.test.ts` to prevent the old `value={ing.quantity || ''}` behavior from returning.

## Verification

- RED/GREEN targeted guard: `npm test -- --watchAll=false --runTestsByPath src/utils/dataSafety.test.ts -t "menu recipe quantity input preserves"`.
- Production build: `npm run build`.
- Browser check: local production preview at `http://localhost:52341/inventory/menu`, login `zeng/123456`, edit `Brocoli al Ajillo`, type `0.5` into the recipe quantity input, confirmed DOM value stayed `0.5`.
- Live browser check: `https://restaurant-pos-1b420.web.app/inventory/menu`, login `zeng/123456`, edit `Brocoli al Ajillo`, type `0.5` into the recipe quantity input, confirmed DOM value stayed `0.5`; browser console reported 0 errors.

## Deployment

- Deployed Firebase Hosting project `restaurant-pos-1b420`.
- Live URL: `https://restaurant-pos-1b420.web.app`.
