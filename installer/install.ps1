param(
  [string]$BaseUrl = "https://<storage-account>.blob.core.windows.net/opencode-plugins/devai-aidd-plugin/latest",
  [string]$InstallRoot = "$env:USERPROFILE\\.config\\opencode"
)

$ErrorActionPreference = "Stop"

function Get-ChecksumMap {
  param([string]$Content)
  $result = @{}
  foreach ($line in ($Content -split "`r?`n")) {
    if (-not $line.Trim()) { continue }
    $parts = $line -split "\s{2,}", 2
    if ($parts.Length -eq 2) {
      $result[$parts[1].Trim()] = $parts[0].Trim().ToLower()
    }
  }
  return $result
}

function Get-FileHashHex {
  param([string]$Path)
  return (Get-FileHash -Path $Path -Algorithm SHA256).Hash.ToLower()
}

$pluginDir = Join-Path $InstallRoot "plugins"
$templateDir = Join-Path $InstallRoot "templates"
$tempDir = Join-Path ([System.IO.Path]::GetTempPath()) ("devai-aidd-plugin-" + [guid]::NewGuid().ToString("N"))
$files = @(
  "devai-aidd-plugin.js",
  "devai-aidd-plugin.global.jsonc",
  "devai-aidd-plugin.project.jsonc",
  "manifest.json",
  "checksums.txt"
)

New-Item -ItemType Directory -Force $pluginDir | Out-Null
New-Item -ItemType Directory -Force $templateDir | Out-Null
New-Item -ItemType Directory -Force $tempDir | Out-Null

try {
  foreach ($file in $files) {
    Invoke-WebRequest -Uri "$BaseUrl/$file" -OutFile (Join-Path $tempDir $file)
  }

  $checksums = Get-ChecksumMap -Content (Get-Content (Join-Path $tempDir "checksums.txt") -Raw)
  foreach ($file in @("devai-aidd-plugin.js", "devai-aidd-plugin.global.jsonc", "devai-aidd-plugin.project.jsonc", "manifest.json")) {
    $actual = Get-FileHashHex -Path (Join-Path $tempDir $file)
    if ($checksums[$file] -ne $actual) {
      throw "Checksum mismatch for $file"
    }
  }

  Copy-Item (Join-Path $tempDir "devai-aidd-plugin.js") (Join-Path $pluginDir "devai-aidd-plugin.js") -Force

  $globalConfigTarget = Join-Path $InstallRoot "devai-aidd-plugin.global.jsonc"
  if (-not (Test-Path $globalConfigTarget)) {
    Copy-Item (Join-Path $tempDir "devai-aidd-plugin.global.jsonc") $globalConfigTarget
  }

  $projectTemplateTarget = Join-Path $templateDir "devai-aidd-plugin.project.jsonc"
  if (-not (Test-Path $projectTemplateTarget)) {
    Copy-Item (Join-Path $tempDir "devai-aidd-plugin.project.jsonc") $projectTemplateTarget
  }

  $manifestTarget = Join-Path $InstallRoot "manifest.json"
  Copy-Item (Join-Path $tempDir "manifest.json") $manifestTarget -Force

  $checksumTarget = Join-Path $InstallRoot "checksums.txt"
  Copy-Item (Join-Path $tempDir "checksums.txt") $checksumTarget -Force

  Write-Host "Installed DevAI AIDD Plugin to $InstallRoot"
  Write-Host "Project override template: $projectTemplateTarget"
} finally {
  if (Test-Path $tempDir) {
    Remove-Item -LiteralPath $tempDir -Recurse -Force
  }
}
