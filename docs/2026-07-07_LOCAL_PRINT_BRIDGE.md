# 2026-07-07 Local Print Bridge

## Completed

- Added independent local print bridge under `local-print-bridge/`.
- Added local HTTP endpoint expected by POS:
  - `GET /health`
  - `GET /printers`
  - `POST /print`
- Added printer role routing:
  - `cashier`
  - `kitchen`
  - `bar`
  - `report`
- Added default dry-run mode so a new computer can test without printing.
- Added dry-run print job output under `local-print-bridge/logs/print-jobs/`.
- Added Windows RAW print helper through PowerShell Winspool API.
- Added ESC/POS cut support with `1D5600`.
- Added Windows printer listing helper.
- Added `start-print-bridge.bat` for simple startup.
- Added Chrome Local Network Access support:
  - frontend fetch uses `targetAddressSpace: 'local'`
  - bridge CORS response includes `Access-Control-Allow-Private-Network: true`
  - bridge echoes hosted POS origin instead of using wildcard origin for preflight

## Operational Design

The POS cloud app still owns orders and receipt content. The local bridge only owns physical printer routing and raw output. This keeps data safe when changing computers: only local printer names need to be configured again.

Each terminal can map printer roles differently:

```json
{
  "cashier": { "enabled": true, "printerName": "POS-80-Receipt" },
  "kitchen": { "enabled": true, "printerName": "Kitchen-Printer" }
}
```

## Verification

- `cd local-print-bridge && npm test`
- `cd client && npm run build`

## Next Manual Step

On the real POS computer:

1. Copy `local-print-bridge/config/printers.example.json` to `local-print-bridge/config/printers.json`.
2. Run `powershell -ExecutionPolicy Bypass -File .\scripts\list-printers.ps1`.
3. Put the exact Windows printer names into `printers.json`.
4. Keep `dryRun: true` for the first test.
5. Start `start-print-bridge.bat`.
6. Print from POS and check files in `logs/print-jobs`.
7. Set `dryRun: false` and print one real receipt.
8. If Chrome blocks `127.0.0.1` with a loopback/local-network message, allow Local Network Access for `https://restaurant-pos-1b420.web.app` in Chrome site settings.
