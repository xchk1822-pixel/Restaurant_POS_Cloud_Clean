$ErrorActionPreference = "Stop"

$desktop = [Environment]::GetFolderPath("Desktop")
$bridge = Join-Path $desktop "Restaurant_POS_PrintBridge\local-print-bridge"

if (-not (Test-Path -LiteralPath $bridge)) {
  throw "Print bridge folder not found: $bridge. Run i.ps1 first."
}

$configDir = Join-Path $bridge "config"
if (-not (Test-Path -LiteralPath $configDir)) {
  New-Item -ItemType Directory -Path $configDir | Out-Null
}

$config = @{
  host = "0.0.0.0"
  port = 17777
  dryRun = $false
  printers = @{
    cashier = @{
      enabled = $true
      printerName = "FACTURAS"
    }
    kitchen = @{
      enabled = $true
      printerName = "COCINA"
    }
    bar = @{
      enabled = $false
      printerName = ""
    }
    report = @{
      enabled = $false
      printerName = ""
    }
  }
}

$configJson = $config | ConvertTo-Json -Depth 8
[System.IO.File]::WriteAllText(
  (Join-Path $configDir "printers.json"),
  $configJson,
  (New-Object System.Text.UTF8Encoding($false))
)

if (-not (Get-NetFirewallRule -DisplayName "Restaurant POS Print Bridge 17777" -ErrorAction SilentlyContinue)) {
  New-NetFirewallRule -DisplayName "Restaurant POS Print Bridge 17777" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 17777 | Out-Null
}

$logsDir = Join-Path $bridge "logs"
if (-not (Test-Path -LiteralPath $logsDir)) {
  New-Item -ItemType Directory -Path $logsDir | Out-Null
}

$node = Join-Path $env:ProgramFiles "nodejs\node.exe"
if (-not (Test-Path -LiteralPath $node)) {
  $node = "node.exe"
}

Get-CimInstance Win32_Process -Filter "name = 'node.exe'" |
  Where-Object { $_.CommandLine -like "*local-print-bridge*" -or $_.CommandLine -like "*src/server.js*" } |
  ForEach-Object {
    try { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue } catch {}
  }

$outLog = Join-Path $logsDir "bridge.out.log"
$errLog = Join-Path $logsDir "bridge.err.log"
Remove-Item -LiteralPath $outLog, $errLog -Force -ErrorAction SilentlyContinue

$process = Start-Process -FilePath $node `
  -ArgumentList "src/server.js" `
  -WorkingDirectory $bridge `
  -WindowStyle Minimized `
  -RedirectStandardOutput $outLog `
  -RedirectStandardError $errLog `
  -PassThru

$health = $null
for ($i = 0; $i -lt 15; $i++) {
  Start-Sleep -Seconds 1
  try {
    $health = Invoke-RestMethod "http://127.0.0.1:17777/health" -TimeoutSec 2
    break
  } catch {}
}

Write-Host ""
Write-Host "=== Print bridge health ==="
if ($health) {
  $health | ConvertTo-Json -Depth 5
  Write-Host ""
  Write-Host "ProcessId: $($process.Id)"
  Write-Host "Keep this computer on. POS devices can use: http://192.168.1.48:17777"
} else {
  Write-Host "FAILED: bridge did not answer on http://127.0.0.1:17777"
  Write-Host ""
  Write-Host "=== stdout ==="
  if (Test-Path -LiteralPath $outLog) { Get-Content -LiteralPath $outLog -Raw }
  Write-Host ""
  Write-Host "=== stderr ==="
  if (Test-Path -LiteralPath $errLog) { Get-Content -LiteralPath $errLog -Raw }
  throw "Print bridge failed to start."
}
