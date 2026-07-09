# Restaurant POS Local Print Bridge

This tool runs on each Windows POS computer. It lets the browser POS print to local printers by role:

- `cashier` -> customer 80mm receipt printer
- `kitchen` -> kitchen printer
- `bar` -> reserved
- `report` -> reserved for A4 reports

The POS calls:

```text
http://127.0.0.1:17777/print
```

## Install On A New Computer

1. Install Node.js 18 or newer.
2. Install the Windows drivers for the receipt and kitchen printers.
3. Open PowerShell in this folder.
4. List printer names:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\list-printers.ps1
```

5. Copy the example config:

```powershell
copy .\config\printers.example.json .\config\printers.json
```

6. Edit `config/printers.json`.

Keep `dryRun: true` for the first test. It writes print jobs to `logs/print-jobs` and does not print paper.

Example real printer config:

```json
{
  "host": "127.0.0.1",
  "port": 17777,
  "dryRun": false,
  "printers": {
    "cashier": {
      "enabled": true,
      "printerName": "POS-80-Receipt"
    },
    "kitchen": {
      "enabled": true,
      "printerName": "Kitchen-Printer"
    },
    "bar": {
      "enabled": false,
      "printerName": ""
    },
    "report": {
      "enabled": false,
      "printerName": ""
    }
  }
}
```

7. Start the bridge:

```powershell
npm start
```

Or double-click:

```text
start-print-bridge.bat
```

8. In Chrome, allow local network access for the POS site if Chrome asks.

If Chrome blocks printing with a message about `loopback` or `Local Network Access`, open:

```text
chrome://settings/content/siteDetails?site=https%3A%2F%2Frestaurant-pos-1b420.web.app
```

Then allow **Local Network Access** for the POS site. Some Chrome versions show this under the address bar site settings instead of the normal settings page.

## Test

Health check:

```powershell
Invoke-RestMethod http://127.0.0.1:17777/health
```

Test receipt:

```powershell
Invoke-RestMethod http://127.0.0.1:17777/print `
  -Method Post `
  -ContentType 'application/json' `
  -Body '{"role":"cashier","orderNumber":"TEST001","storeId":"bluefields","text":"Recibo\nTotal C$190.00","cut":true,"cutCommandHex":"1D5600"}'
```

## Important

- Browser printing cannot reliably cut paper or choose the kitchen printer. This bridge is required for that.
- Every computer has its own local printer mapping. Cloud data is not affected.
- If `dryRun` is true, nothing prints physically.
- If `dryRun` is false, the printer name must exactly match Windows.
- The cut command is ESC/POS full cut: `1D5600`.
- New Chrome versions can require Local Network Access permission before a hosted website can call `127.0.0.1`.
