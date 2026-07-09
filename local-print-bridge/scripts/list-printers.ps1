$ErrorActionPreference = "Stop"

if (Get-Command Get-Printer -ErrorAction SilentlyContinue) {
  Get-Printer | Select-Object -ExpandProperty Name
} else {
  Get-CimInstance Win32_Printer | Select-Object -ExpandProperty Name
}
