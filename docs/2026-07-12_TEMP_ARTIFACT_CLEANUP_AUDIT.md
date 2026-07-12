# Temporary Artifact Cleanup Audit

Date: 2026-07-12

## Rule

Only temporary, one-off, debug, experiment, or generated verification artifacts are cleanup candidates.

Long-term regression tests, audit scripts, build scripts, deployment config, print bridge code, and data-safety guards must be kept.

## A. Safe Cleanup Candidates

Generated browser/debug artifacts. These are outputs from verification runs, not application source code.

Status: cleaned on 2026-07-12.

- `.playwright-cli/*`
  - Playwright console logs, YAML snapshots, and screenshots.
- `client/.playwright-cli/*`
  - Playwright console logs and page snapshots.
- `output/*`
  - Root-level verification JSON/screenshots.
- `client/output/*`
  - Verification screenshots.
- `client/output-playwright-*.png`
  - Older one-off browser screenshots.
- `client/output-pos-*.png`
  - Older one-off POS verification screenshots.
- `client/output-employee-*.png`
  - Older one-off employee verification screenshots.
- `service.conf.lock`
- `system.conf.lock`
  - Empty lock files in the project root.
- `.superpowers/brainstorm/*/state/*.log`
  - Local plugin run logs.

## B. One-Off Script Candidates

These scripts connect to production Firestore and perform targeted diagnosis or data repair. They are not app runtime code.

Recommended action: keep lifecycle/read-only audits, remove or archive destructive one-off repair scripts only after explicit confirmation.

- `client/scripts/deletePurchaseOrderByNumber.mjs`
  - Destructive one-off purchase order deletion helper.
  - Only self-referenced.
- `client/scripts/repairPurchaseOrderDuplicates.mjs`
  - One-off duplicate purchase order repair helper.
  - Referenced by historical docs only.
- `client/scripts/auditPurchaseOrdersToday.mjs`
  - Narrow purchase-order investigation helper.
  - Only self-referenced.
- `client/scripts/auditPosOrderAnomalies.mjs`
  - Older POS anomaly investigation helper.
  - Referenced by historical docs only.
- `client/scripts/verifyLivePosCancelledOrderTime.mjs`
  - One-off browser verification for a cancelled-order time bug.
  - Referenced by historical docs only.
- `client/scripts/auditInventoryItemStock.mjs`
  - Ad-hoc item stock investigation helper.
  - Only self-referenced, but still useful when checking one product's stock history.

## C. Keep

These are long-term assets and should not be deleted during temporary cleanup.

- `client/src/**/*.test.ts`
  - Regression tests and data-safety guards.
- `client/src/setupTests.ts`
  - Test setup.
- `client/scripts/auditInventoryLifecycle.mjs`
  - Long-term read-only inventory lifecycle audit.
  - Referenced by `npm run audit:inventory-lifecycle` and data-safety tests.
- `client/scripts/auditPosLifecycle.mjs`
  - Long-term read-only POS lifecycle audit.
  - Referenced by `npm run audit:pos-lifecycle` and data-safety tests.
- `client/scripts/verifyPosSmoke.mjs`
  - Long-term production smoke verification.
  - Referenced by `npm run verify:pos-smoke`.
- `client/scripts/serveBuildSpa.mjs`
  - Local static SPA server for production-build verification.
- `local-print-bridge/**`
  - Print bridge application and tests.
- `docs/*.md`
  - Project handoff and audit history.
- `docs/*-latest.json`
  - Latest audit reports retained as evidence unless intentionally refreshed.

## Production Source Scan

`client/src` has no obvious `console.log`, `console.debug`, or `debugger` leftovers in runtime code.

Remaining `console.warn` calls are mostly operational warnings for:

- missing store scope
- preserving POS orders when a current-day snapshot is empty
- preventing kitchen/POS terminal-state regression
- cache write fallback
- stock deduction diagnostics

These are not temporary debug leftovers and should not be removed as part of this cleanup.
