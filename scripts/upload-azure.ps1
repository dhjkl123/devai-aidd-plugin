param(
  [Parameter(Mandatory = $true)][string]$StorageAccount,
  [Parameter(Mandatory = $true)][string]$Container,
  [Parameter(Mandatory = $true)][string]$SasToken,
  [Parameter(Mandatory = $false)][string]$BaseUrl = "",
  [Parameter(Mandatory = $false)][string]$SourcePath = ".\\release\\devai-aidd-plugin"
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command az -ErrorAction SilentlyContinue)) {
  throw "Azure CLI (az) is required."
}

$resolvedSource = Resolve-Path $SourcePath
$sas = $SasToken.TrimStart("?")

Write-Host "Uploading $resolvedSource to https://$StorageAccount.blob.core.windows.net/$Container"

az storage blob upload-batch `
  --account-name $StorageAccount `
  --destination $Container `
  --source $resolvedSource `
  --sas-token $sas `
  --overwrite true

if ($BaseUrl) {
  Write-Host "Base URL: $BaseUrl"
} else {
  Write-Host "Base URL: https://$StorageAccount.blob.core.windows.net/$Container/devai-aidd-plugin/"
}
