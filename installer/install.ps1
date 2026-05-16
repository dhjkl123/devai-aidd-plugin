param(
  [string]$BaseUrl = "https://<storage-account>.blob.core.windows.net/opencode-plugins/devai-aidd-plugin/latest",
  [string]$ProjectPath = "",
  [switch]$Local
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

function Get-RepoRoot {
  $scriptDir = $PSScriptRoot
  if (-not $scriptDir) {
    $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
  }
  return (Split-Path -Parent $scriptDir)
}

if (-not $ProjectPath) {
  $ProjectPath = (Get-Location).Path
}

if (-not (Test-Path $ProjectPath)) {
  throw "Project path does not exist: $ProjectPath"
}

$resolvedProject = (Resolve-Path $ProjectPath).Path
$projectOpencodeDir = Join-Path $resolvedProject ".opencode"
$projectPluginDir = Join-Path $projectOpencodeDir "plugins"
$pluginTarget = Join-Path $projectPluginDir "devai-aidd-plugin.js"
$configTarget = Join-Path $projectOpencodeDir "devai-aidd-plugin.project.jsonc"

New-Item -ItemType Directory -Force $projectPluginDir | Out-Null

if ($Local) {
  $repoRoot = Get-RepoRoot
  $jsSource = Join-Path $repoRoot "dist\devai-aidd-plugin.js"
  $projectSource = Join-Path $repoRoot "dist\devai-aidd-plugin.project.jsonc"

  foreach ($path in @($jsSource, $projectSource)) {
    if (-not (Test-Path $path)) {
      throw "Local source missing: $path. Run 'npm run build' before re-running with -Local."
    }
  }

  Copy-Item $jsSource $pluginTarget -Force
  if (Test-Path $configTarget) {
    Write-Host "Existing project config preserved: $configTarget"
  } else {
    Copy-Item $projectSource $configTarget
  }

  Write-Host "Installed DevAI AIDD Plugin (project scope, local source) to $projectOpencodeDir"
  Write-Host ""
  Write-Host "Next: ensure your opencode.jsonc points to the project-local plugin path."
  Write-Host "Example (at $resolvedProject\opencode.jsonc):"
  Write-Host '  { "plugins": [ { "name": "DevAI AIDD Plugin", "path": ".opencode/plugins/devai-aidd-plugin.js" } ] }'
  return
}

$tempDir = Join-Path ([System.IO.Path]::GetTempPath()) ("devai-aidd-plugin-" + [guid]::NewGuid().ToString("N"))
$files = @(
  "devai-aidd-plugin.js",
  "devai-aidd-plugin.project.jsonc",
  "manifest.json",
  "checksums.txt"
)

New-Item -ItemType Directory -Force $tempDir | Out-Null

try {
  foreach ($file in $files) {
    Invoke-WebRequest -Uri "$BaseUrl/$file" -OutFile (Join-Path $tempDir $file)
  }

  $checksums = Get-ChecksumMap -Content (Get-Content (Join-Path $tempDir "checksums.txt") -Raw)
  foreach ($file in @("devai-aidd-plugin.js", "devai-aidd-plugin.project.jsonc", "manifest.json")) {
    $actual = Get-FileHashHex -Path (Join-Path $tempDir $file)
    if ($checksums[$file] -ne $actual) {
      throw "Checksum mismatch for $file"
    }
  }

  Copy-Item (Join-Path $tempDir "devai-aidd-plugin.js") $pluginTarget -Force
  if (Test-Path $configTarget) {
    Write-Host "Existing project config preserved: $configTarget"
  } else {
    Copy-Item (Join-Path $tempDir "devai-aidd-plugin.project.jsonc") $configTarget
  }

  Write-Host "Installed DevAI AIDD Plugin (project scope) to $projectOpencodeDir"
  Write-Host ""
  Write-Host "Next: ensure your opencode.jsonc points to the project-local plugin path."
  Write-Host "Example (at $resolvedProject\opencode.jsonc):"
  Write-Host '  { "plugins": [ { "name": "DevAI AIDD Plugin", "path": ".opencode/plugins/devai-aidd-plugin.js" } ] }'
} finally {
  if (Test-Path $tempDir) {
    Remove-Item -LiteralPath $tempDir -Recurse -Force
  }
}
