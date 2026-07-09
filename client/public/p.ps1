$ErrorActionPreference = "Stop"

Write-Host "Restaurant POS Print Bridge - foreground start"

$desktop = [Environment]::GetFolderPath("Desktop")
$zip = Join-Path $desktop "bridge.zip"
$target = Join-Path $desktop "Restaurant_POS_PrintBridge"
$sourceUrl = "https://restaurant-pos-1b420.web.app/tools/Restaurant_POS_PrintBridge.zip"

Get-CimInstance Win32_Process -Filter "name = 'node.exe'" |
  Where-Object { $_.CommandLine -like "*local-print-bridge*" -or $_.CommandLine -like "*src/server.js*" } |
  ForEach-Object {
    try { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue } catch {}
  }

Write-Host "Updating bridge files..."
Remove-Item -LiteralPath $zip -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $target -Recurse -Force -ErrorAction SilentlyContinue
Invoke-WebRequest -Uri $sourceUrl -OutFile $zip
Expand-Archive -LiteralPath $zip -DestinationPath $target -Force

$candidates = @(
  (Join-Path $desktop "Restaurant_POS_PrintBridge\local-print-bridge"),
  (Join-Path $env:USERPROFILE "OneDrive\Escritorio\Restaurant_POS_PrintBridge\local-print-bridge"),
  (Join-Path $env:USERPROFILE "OneDrive\Desktop\Restaurant_POS_PrintBridge\local-print-bridge"),
  (Join-Path $env:USERPROFILE "Desktop\Restaurant_POS_PrintBridge\local-print-bridge")
)

$bridge = $candidates | Where-Object { Test-Path -LiteralPath (Join-Path $_ "src\server.js") } | Select-Object -First 1
if (-not $bridge) {
  Write-Host "Bridge folder not found. Checked:"
  $candidates | ForEach-Object { Write-Host $_ }
  throw "Run installer i.ps1 first."
}

Write-Host "Bridge folder: $bridge"

$configDir = Join-Path $bridge "config"
if (-not (Test-Path -LiteralPath $configDir)) {
  New-Item -ItemType Directory -Path $configDir | Out-Null
}

$configJson = @{
  host = "0.0.0.0"
  port = 17777
  dryRun = $false
  printers = @{
    cashier = @{ enabled = $true; printerName = "FACTURAS" }
    kitchen = @{ enabled = $true; printerName = "COCINA" }
    bar = @{ enabled = $false; printerName = "" }
    report = @{ enabled = $false; printerName = "" }
  }
} | ConvertTo-Json -Depth 8
[System.IO.File]::WriteAllText(
  (Join-Path $configDir "printers.json"),
  $configJson,
  (New-Object System.Text.UTF8Encoding($false))
)

try {
  if (-not (Get-NetFirewallRule -DisplayName "Restaurant POS Print Bridge 17777" -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule -DisplayName "Restaurant POS Print Bridge 17777" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 17777 | Out-Null
  }
  Write-Host "Firewall rule OK"
} catch {
  Write-Host "Firewall rule failed:"
  Write-Host $_.Exception.Message
}

$node = Join-Path $env:ProgramFiles "nodejs\node.exe"
if (-not (Test-Path -LiteralPath $node)) {
  $node = "node.exe"
}

Write-Host "Node:"
& $node --version
Write-Host ""
Write-Host "Starting bridge. Keep this window open."
Write-Host "Expected success: Restaurant local print bridge listening on http://0.0.0.0:17777"
Write-Host ""

Set-Location -LiteralPath $bridge
& $node "src\server.js"
