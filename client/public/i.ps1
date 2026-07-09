$ErrorActionPreference = "Stop"

$desktop = [Environment]::GetFolderPath("Desktop")
$zip = Join-Path $desktop "bridge.zip"
$target = Join-Path $desktop "Restaurant_POS_PrintBridge"
$sourceUrl = "https://restaurant-pos-1b420.web.app/tools/Restaurant_POS_PrintBridge.zip"

Write-Host "Installing Node.js LTS..."
winget install --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements

Write-Host "Downloading print bridge..."
Remove-Item -LiteralPath $zip -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $target -Recurse -Force -ErrorAction SilentlyContinue
Invoke-WebRequest -Uri $sourceUrl -OutFile $zip
Expand-Archive -LiteralPath $zip -DestinationPath $target -Force

$bridge = Join-Path $target "local-print-bridge"
Copy-Item -LiteralPath (Join-Path $bridge "config\printers.example.json") -Destination (Join-Path $bridge "config\printers.json") -Force

Write-Host ""
Write-Host "=== Node version ==="
$node = Join-Path $env:ProgramFiles "nodejs\node.exe"
if (Test-Path -LiteralPath $node) {
  & $node --version
} else {
  node --version
}

Write-Host ""
Write-Host "=== Printer list ==="
powershell -ExecutionPolicy Bypass -File (Join-Path $bridge "scripts\list-printers.ps1")

Write-Host ""
Write-Host "=== Print bridge ready ==="
Write-Host $bridge
Write-Host ""
Write-Host "Send a photo of the Printer list above."
Read-Host "Press Enter to close"
