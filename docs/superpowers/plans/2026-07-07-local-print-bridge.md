# Local Print Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Windows local print bridge that receives POS print payloads from `http://127.0.0.1:17777/print`, routes them by printer role, and sends raw ESC/POS cut commands.

**Architecture:** Keep the bridge as an independent Node.js tool under `local-print-bridge/`. The POS frontend remains unchanged and only calls the already defined local endpoint. The bridge reads a local JSON printer map, exposes health/printer endpoints, writes dry-run job files for testing, and uses a PowerShell Winspool RAW helper for real printer output.

**Tech Stack:** Node.js built-in `http`, `fs`, `child_process`, Node test runner, PowerShell Winspool RAW helper on Windows.

---

### Task 1: Bridge Configuration And Payload Validation

**Files:**
- Create: `local-print-bridge/package.json`
- Create: `local-print-bridge/src/config.js`
- Create: `local-print-bridge/src/payload.js`
- Create: `local-print-bridge/test/payload.test.js`
- Create: `local-print-bridge/config/printers.example.json`

- [ ] **Step 1: Write failing validation tests**

Run: `cd local-print-bridge && npm test`

Expected: FAIL because `src/payload.js` does not exist.

- [ ] **Step 2: Implement config and payload validation**

Implement role validation for `cashier`, `kitchen`, `bar`, and `report`; reject missing role/order number; normalize `cutCommandHex`.

- [ ] **Step 3: Verify tests pass**

Run: `cd local-print-bridge && npm test`

Expected: PASS.

### Task 2: HTTP Server And Dry-Run Jobs

**Files:**
- Create: `local-print-bridge/src/server.js`
- Create: `local-print-bridge/test/server.test.js`

- [ ] **Step 1: Write failing HTTP tests**

Run: `cd local-print-bridge && npm test`

Expected: FAIL because `createServer` does not exist.

- [ ] **Step 2: Implement server**

Add:
- `GET /health`
- `GET /printers`
- `OPTIONS /print`
- `POST /print`

Dry-run mode writes `.json`, `.txt`, and `.html` files to `local-print-bridge/logs/print-jobs/`.

- [ ] **Step 3: Verify tests pass**

Run: `cd local-print-bridge && npm test`

Expected: PASS.

### Task 3: Windows RAW Print Helpers

**Files:**
- Create: `local-print-bridge/src/windowsRawPrinter.js`
- Create: `local-print-bridge/scripts/send-raw-print.ps1`
- Create: `local-print-bridge/scripts/list-printers.ps1`
- Create: `local-print-bridge/test/windowsRawPrinter.test.js`

- [ ] **Step 1: Write failing helper tests**

Run: `cd local-print-bridge && npm test`

Expected: FAIL because RAW helper does not exist.

- [ ] **Step 2: Implement helper**

Build a RAW byte file from payload text and cut command, then call `send-raw-print.ps1` with printer name and file path. Keep this isolated from POS.

- [ ] **Step 3: Verify tests pass**

Run: `cd local-print-bridge && npm test`

Expected: PASS.

### Task 4: Operator Documentation And Startup Scripts

**Files:**
- Create: `local-print-bridge/README.md`
- Create: `local-print-bridge/start-print-bridge.bat`
- Create: `docs/2026-07-07_LOCAL_PRINT_BRIDGE.md`

- [ ] **Step 1: Document installation**

Explain how to install Node.js, list Windows printer names, copy `printers.example.json` to `printers.json`, map `cashier` and `kitchen`, and start the bridge.

- [ ] **Step 2: Verify package and app build**

Run:
- `cd local-print-bridge && npm test`
- `cd client && npm run build`

Expected: both exit 0.
