# Color menu rollout - 2026-10-02

## Scope

- Changed only `client/src/components/MenuSelection.tsx`.
- Matched the menu-card presentation from the Xing Long baseline.
- Kept ordering, pricing, inventory, payment, sync, and offline behavior unchanged.

## UI result

- Product images remain unobstructed.
- Product details use a separate section below the image.
- Product names are blue and prices are red.
- Long product names wrap without card overflow.

## Verification

- Production build passed: `main.ea901cd3.js`.
- Browser flow verified in the actual POS route at 1440x900 and 1024x768.
- Long-name card measured with no horizontal overflow.
- Verified computed colors: name `rgb(37, 99, 235)`, price `rgb(220, 38, 38)`.
- Screenshots:
  - `output/playwright/menu-color-desktop.png`
  - `output/playwright/menu-color-1024.png`
  - `output/playwright/menu-color-live.png`
- Targeted tests: 33 passed. One existing translation assertion still expects the retired daily-salary label and is unrelated to this menu-only change.

## Deployment

- Firebase project: `restaurant-pos-1b420`.
- Hosting URL: `https://restaurant-pos-1b420.web.app`.
- Deployed bundle: `main.ea901cd3.js`.
- Live browser verification confirmed the deployed bundle, visible menu cards, wrapped long names, and no page-level horizontal overflow.

## Baseline safety

- GitHub baseline preserved on `archive/github-baseline-2026-07-12`.
- Deployed production source recovered and committed as `4796f40` before this UI change.
