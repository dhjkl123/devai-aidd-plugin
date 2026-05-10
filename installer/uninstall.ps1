param(
  [string]$InstallRoot = "$env:USERPROFILE\\.config\\opencode"
)

$ErrorActionPreference = "Stop"

$pluginPath = Join-Path $InstallRoot "plugins\\devai-aidd-plugin.js"
$manifestPath = Join-Path $InstallRoot "manifest.json"
$checksumsPath = Join-Path $InstallRoot "checksums.txt"

foreach ($path in @($pluginPath, $manifestPath, $checksumsPath)) {
  if (Test-Path $path) {
    Remove-Item -LiteralPath $path -Force
  }
}

Write-Host "Removed DevAI AIDD Plugin plugin files from $InstallRoot"
Write-Host "Existing configuration files were preserved."
