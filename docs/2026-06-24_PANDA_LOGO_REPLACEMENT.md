# 2026-06-24 Panda Logo Replacement

## Scope

- Replaced the old flower/placeholder-style brand mark with a panda graphic.
- Kept this change limited to brand assets and brand display locations.
- No business logic, storage paths, permissions, order flow, inventory flow, or financial calculations were changed.

## Changed Files

- `client/src/logo.svg`
  - New panda SVG mark.
  - Added stable markers `restaurant-pos-panda-logo` and `panda-face`.
  - Removed old React-style cyan atom color reference.
- `client/src/components/Layout/MainLayout.tsx`
  - Top-left app shell brand badge now renders the panda SVG image.
- `client/src/pages/Login/Login.tsx`
  - Login screen brand badge now renders the same panda SVG image.
- `client/public/favicon.ico`
- `client/public/logo192.png`
- `client/public/logo512.png`
  - Browser tab and PWA icons regenerated as panda icons.
- `client/src/utils/dataSafety.test.ts`
  - Added a regression guard so the logo does not accidentally revert to the old mark.

## Verification

- Red test first:
  - `npm test -- --watchAll=false --runTestsByPath src/utils/dataSafety.test.ts -t "brand logo uses a panda graphic"`
  - Failed before the logo replacement because the panda markers were absent.
- Green test:
  - `npm test -- --watchAll=false --runTestsByPath src/utils/dataSafety.test.ts -t "brand logo uses a panda graphic"`
  - Passed.
- Production build:
  - `npm run build`
  - Passed after correcting the layout shadow token.
- Local browser verification:
  - Served the production build locally.
  - Verified `/login` shows `img "Restaurant POS Panda"`.
  - Logged in with `zeng/123456`.
  - Verified the main layout top-left logo shows `img "Restaurant POS Panda"`.
  - Browser console: 0 errors, 1 warning.
- Firebase deploy:
  - `firebase deploy --only hosting --project restaurant-pos-1b420`
  - Succeeded.
- Live browser verification:
  - Verified `https://restaurant-pos-1b420.web.app/login` shows the panda logo.
  - Logged in with `zeng/123456`.
  - Verified deployed main layout shows the panda logo.
  - Browser console: 0 errors, 1 warning.

## Evidence

- Local screenshots:
  - `client/output/playwright/panda-logo-login-local.png`
  - `client/output/playwright/panda-logo-main-local.png`
- Live screenshot:
  - `client/output/playwright/panda-logo-main-live.png`

## Status

- Completed and deployed.
- Remaining UI redesign work is unrelated to this logo replacement and should continue from the existing plan documents.
