$ErrorActionPreference = "Stop"

# Operates on the CURRENT WORKING DIRECTORY's .opencode/. Removes:
#   - .opencode/plugins/devai-aidd-plugin.js
#   - .opencode/devai-aidd-plugin.*.jsonc (project, global, ...)

$cwd = (Get-Location).Path
$opencodeDir = Join-Path $cwd ".opencode"

if (-not (Test-Path $opencodeDir)) {
  Write-Host "No .opencode directory in $cwd. Nothing to remove."
  return
}

$pluginPath = Join-Path $opencodeDir "plugins\devai-aidd-plugin.js"
$removed = @()

if (Test-Path $pluginPath) {
  Remove-Item -LiteralPath $pluginPath -Force
  $removed += $pluginPath
}

$jsoncFiles = Get-ChildItem -LiteralPath $opencodeDir -Filter "devai-aidd-plugin.*.jsonc" -File -ErrorAction SilentlyContinue
foreach ($file in $jsoncFiles) {
  Remove-Item -LiteralPath $file.FullName -Force
  $removed += $file.FullName
}

if ($removed.Count -eq 0) {
  Write-Host "No DevAI AIDD Plugin files found under $opencodeDir."
} else {
  Write-Host "Removed:"
  foreach ($r in $removed) { Write-Host "  $r" }
}
