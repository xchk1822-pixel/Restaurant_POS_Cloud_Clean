# 2026-07-07 POS 80mm Receipt And Printer Roles

## Scope

Precise POS printing update only. No order lifecycle, inventory, finance, payment, table layout, or sync logic was changed.

## Completed

- Added an 80mm thermal receipt builder for cashier receipts.
- Receipt header now reads the active store profile from local store data:
  - store name
  - subtitle or store code when available
  - address
  - phone
  - optional footer
- Receipt content now follows the real 80mm ticket structure more closely:
  - order date and number
  - order type and table/barra/delivery label
  - customer, phone, and address fields
  - product, quantity, and amount rows
  - consumption, discount, subtotal, IVA, voluntary tip, and total
  - payment lines and cashier
- Added local printer payload roles:
  - `cashier` for customer receipts
  - `kitchen` for kitchen tickets
  - `bar` and `report` reserved for later printer mapping
- Added ESC/POS full cut command to the local printer payload:
  - hex: `1D5600`
- Kitchen ticket printing is non-blocking. Sending an order to kitchen will not wait on printer/network success and will not freeze POS ordering.
- Browser print remains as fallback for cashier receipts if the local print bridge is unavailable.

## Important Runtime Rule

Browser printing alone cannot reliably send raw ESC/POS cut commands or select different physical printers. True cut and printer routing require a local Windows print bridge on each terminal.

The POS now sends payloads to:

```text
http://127.0.0.1:17777/print
```

The local bridge should map roles to Windows printer names per terminal, for example:

```json
{
  "cashier": "POS-80-Receipt",
  "kitchen": "Kitchen-Printer",
  "bar": "Bar-Printer",
  "report": "Office-A4"
}
```

If no bridge is running, cashier receipt falls back to browser print. Kitchen auto-print is skipped silently to avoid interrupting order flow.

## Verification

- `npm test -- --runTestsByPath src/utils/receiptPrinter.test.ts --watchAll=false`
- `npm test -- --runTestsByPath src/utils/dataSafety.test.ts --watchAll=false --testNamePattern="POS payment and receipt|POS receipt and kitchen"`
- `npm run build`

## Remaining

- Build or install the local Windows print bridge service.
- Add a small printer settings screen later if required. Keep mapping local to each terminal because cashier and kitchen printers can be different per device.
