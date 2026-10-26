# Inventory Quantity Display Precision

Date: 2026-10-26

## Scope

- Inventory quantity displays use at most one decimal place.
- Whole numbers remain whole numbers without a forced `.0` suffix.
- Examples: `13 -> 13`, `13.46 -> 13.5`, `2.748737489483477484 -> 2.7`, `-2.04 -> -2`.
- Applied to inventory items, stock movement records, warehouse/fridge stocktakes, recipes, replenishment suggestions, and purchase quantity displays.
- Stock movement warehouse/fridge cells render an explicit type-colored arrow between before and after values.

## Safety Boundary

- No inventory calculation, persistence, Firestore, sync, or offline logic changed.
- No currency formatting changed.
- No CSS or layout dimensions changed.
- Formatting is applied only when rendering quantity values or exporting stocktake quantity columns.

## Verification

- Targeted tests: 304 passed.
- Full client tests: 549 passed across 43 suites.
- Production build: successful (`main.078deb29.js`, existing CSS `main.f5a4eaf6.css`).
- Real browser verification:
  - Warehouse stocktake rendered `-2.9`, `13.5`, `842.6`, `1.1`, and `213.4` without floating-point tails.
  - Integer quantities rendered as `3`, `18`, and `316`, without `.0`.
  - Fridge stocktake rendered total, warehouse, and fridge quantities with the same rule.
  - Stock movement cells rendered `32 → -16`, `846.6 → 842.6`, and fridge `3 → 9`.
  - No stocktake was submitted and no production data was changed during verification.
