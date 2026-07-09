# 2026-07-08 Print Bridge Cut/Feed Fix

## Scope

Precision fix for the local Windows print bridge and POS receipt payload only.

## Root Cause

- The remote print bridge initially failed because PowerShell wrote `printers.json` with a UTF-8 BOM. Node `JSON.parse` rejected the file.
- Receipt test prints then showed cut-position problems because the POS payload embedded an ESC/POS cut command inside `text`, while the bridge also appended a cut command.
- The 80mm printer required more feed before cutting. The verified diagnostic ticket with `feedLines = 8` printed complete content before the cut.

## Changes

- `local-print-bridge/src/config.js`
  - Strips UTF-8 BOM before parsing JSON config.
- `local-print-bridge/src/windowsRawPrinter.js`
  - Normalizes line endings to CRLF.
- `client/src/utils/receiptPrinter.ts`
  - Removes embedded ESC/POS cut bytes from payload text.
  - Keeps cut handling centralized in the bridge payload fields.
  - Sets `feedLines` to `8`.
- `client/public/p.ps1`
  - Now refreshes the latest bridge zip before starting the foreground bridge.
- `client/public/s.ps1`
  - Writes printer config without UTF-8 BOM.
- `client/public/tools/Restaurant_POS_PrintBridge.zip`
  - Rebuilt with the latest bridge fixes.

## Verification

- `npm test -- --runTestsByPath src/utils/receiptPrinter.test.ts --watchAll=false`
  - 4 passed.
- `npm test` in `local-print-bridge`
  - 11 passed.
- `npm run build`
  - compiled successfully.
- `firebase deploy --only hosting`
  - deployed to `https://restaurant-pos-1b420.web.app`.
- Remote bridge was reachable before the final bridge refresh:
  - `http://192.168.1.48:17777/health` returned `ok: true`.
  - Test print to `FACTURAS` returned `Printed raw job to FACTURAS`.
  - Test print to `COCINA` returned `Printed raw job to COCINA`.
- Physical receipt test `TEST-FEED8` showed the content before cut completely.

## Next Step

On `PC-SERVER`, close the existing foreground bridge window and run:

```powershell
powershell -ep bypass -c "irm https://restaurant-pos-1b420.web.app/p.ps1|iex"
```

This downloads the latest bridge package and starts the bridge in the foreground.
