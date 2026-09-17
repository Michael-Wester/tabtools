# SPDX-License-Identifier: MPL-2.0

param(
  [string[]]$Targets
)

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$sharedDir = Join-Path $root "src/shared"
$overridesRoot = Join-Path $root "src/overrides"
$distRoot = Join-Path $root "dist"

if (-not (Test-Path $sharedDir)) {
  Write-Error "Shared source folder missing at $sharedDir"
  exit 1
}

if (-not $Targets -or $Targets.Count -eq 0) {
  $Targets = @("firefox", "chrome", "edge")
}

$locales = Get-Content (Join-Path $root 'localisation/registry.json') -Raw | ConvertFrom-Json
foreach ($locale in $locales) {
  $messages = Join-Path $sharedDir ("_locales/" + $locale.extension + "/messages.json")
  if (-not (Test-Path $messages)) { throw "Missing locale file: $messages. Run node scripts/generate-localisation.js after translation edits." }
}

New-Item -ItemType Directory -Force -Path $distRoot | Out-Null

foreach ($browser in $Targets) {
  if ($browser -notin @("chrome", "firefox", "edge")) { throw "Unknown browser: $browser" }
  $distDir = Join-Path $distRoot $browser
  $overrideDir = Join-Path $overridesRoot $browser

  if (Test-Path $distDir) {
    Remove-Item -Recurse -Force $distDir
  }

  New-Item -ItemType Directory -Force -Path $distDir | Out-Null
  Copy-Item -Path (Join-Path $sharedDir "*") -Destination $distDir -Recurse -Force

  if (Test-Path $overrideDir) {
    Copy-Item -Path (Join-Path $overrideDir "*") -Destination $distDir -Recurse -Force
  } else {
    Write-Warning "No overrides found for '$browser'"
  }

  if ($browser -eq "firefox") {
    Move-Item (Join-Path $distDir '_locales/no') (Join-Path $distDir '_locales/nb')
  }
  $resolvedDist = (Resolve-Path $distDir).Path
  Write-Host "Built $browser -> $resolvedDist"
}
