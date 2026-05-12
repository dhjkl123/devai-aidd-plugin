param(
  [string]$BaseUrl = "https://<storage-account>.blob.core.windows.net/opencode-plugins/devai-aidd-plugin/latest",
  [string]$InstallRoot = (Join-Path $env:USERPROFILE ".config\opencode"),
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

if ($ProjectPath) {
  if (-not (Test-Path $ProjectPath)) {
    throw "Project path does not exist: $ProjectPath"
  }

  $repoRoot = Get-RepoRoot
  $jsSource      = Join-Path $repoRoot "dist\devai-aidd-plugin.js"
  $globalSource  = Join-Path $repoRoot "templates\devai-aidd-plugin.global.jsonc"
  $projectSource = Join-Path $repoRoot "templates\devai-aidd-plugin.project.jsonc"
  $mergeScript   = Join-Path $repoRoot "installer\merge-configs.mjs"

  foreach ($path in @($jsSource, $globalSource, $projectSource, $mergeScript)) {
    if (-not (Test-Path $path)) {
      throw "Required source missing: $path. Run 'npm run build' before re-running with -ProjectPath."
    }
  }

  $resolvedProject = (Resolve-Path $ProjectPath).Path
  $projectOpencodeDir = Join-Path $resolvedProject ".opencode"
  $projectPluginDir   = Join-Path $projectOpencodeDir "plugins"
  $mergedConfigTarget = Join-Path $projectOpencodeDir "devai-aidd-plugin.project.jsonc"

  New-Item -ItemType Directory -Force $projectPluginDir | Out-Null

  Copy-Item $jsSource (Join-Path $projectPluginDir "devai-aidd-plugin.js") -Force

  if (Test-Path $mergedConfigTarget) {
    Write-Host "Existing project config preserved: $mergedConfigTarget"
  } else {
    & node $mergeScript --global $globalSource --project $projectSource --out $mergedConfigTarget
    if ($LASTEXITCODE -ne 0) {
      throw "merge-configs.mjs failed with exit code $LASTEXITCODE"
    }
  }

  Write-Host "Installed DevAI AIDD Plugin (project mode) to $projectOpencodeDir"
  Write-Host ""
  Write-Host "Next: ensure your opencode.jsonc points to the project-local plugin path."
  Write-Host "Example (at $resolvedProject\opencode.jsonc):"
  Write-Host '  { "plugins": [ { "name": "DevAI AIDD Plugin", "path": ".opencode/plugins/devai-aidd-plugin.js" } ] }'
  return
}

$pluginDir = Join-Path $InstallRoot "plugins"
$templateDir = Join-Path $InstallRoot "templates"

New-Item -ItemType Directory -Force $pluginDir | Out-Null
New-Item -ItemType Directory -Force $templateDir | Out-Null

if ($Local) {
  $repoRoot = Get-RepoRoot

  $jsSource       = Join-Path $repoRoot "dist\devai-aidd-plugin.js"
  $globalSource   = Join-Path $repoRoot "templates\devai-aidd-plugin.global.jsonc"
  $projectSource  = Join-Path $repoRoot "templates\devai-aidd-plugin.project.jsonc"

  foreach ($path in @($jsSource, $globalSource, $projectSource)) {
    if (-not (Test-Path $path)) {
      throw "Local source missing: $path. Run 'npm run build' before re-running with -Local."
    }
  }

  Copy-Item $jsSource (Join-Path $pluginDir "devai-aidd-plugin.js") -Force

  $globalConfigTarget = Join-Path $InstallRoot "devai-aidd-plugin.global.jsonc"
  if (-not (Test-Path $globalConfigTarget)) {
    Copy-Item $globalSource $globalConfigTarget
  }

  $projectTemplateTarget = Join-Path $templateDir "devai-aidd-plugin.project.jsonc"
  if (-not (Test-Path $projectTemplateTarget)) {
    Copy-Item $projectSource $projectTemplateTarget
  }

  Write-Host "Installed DevAI AIDD Plugin (local source: $repoRoot) to $InstallRoot"
  Write-Host "Project override template: $projectTemplateTarget"
  return
}

$tempDir = Join-Path ([System.IO.Path]::GetTempPath()) ("devai-aidd-plugin-" + [guid]::NewGuid().ToString("N"))
$files = @(
  "devai-aidd-plugin.js",
  "devai-aidd-plugin.global.jsonc",
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
