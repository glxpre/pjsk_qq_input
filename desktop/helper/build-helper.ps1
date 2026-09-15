# SPDX-License-Identifier: AGPL-3.0-only
# Build the Windows QQ helper (desktop/helper/QqHelper.cs) to an executable.
#
# Uses the .NET Framework C# compiler that ships with Windows, so building the
# helper needs no SDK download, no NuGet restore and no network access. The
# helper only targets Windows APIs that are present on Windows 10/11.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File desktop\helper\build-helper.ps1
#   powershell ... -File desktop\helper\build-helper.ps1 -Configuration Release
param(
  [string]$OutputDir = "",
  [ValidateSet("Debug", "Release")]
  [string]$Configuration = "Release"
)

$ErrorActionPreference = "Stop"

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$source = Join-Path $here "QqHelper.cs"
if (-not (Test-Path $source)) { throw "source not found: $source" }

if ([string]::IsNullOrWhiteSpace($OutputDir)) {
  $OutputDir = Join-Path $here "bin"
}
if (-not (Test-Path $OutputDir)) { New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null }
$OutputDir = (Resolve-Path $OutputDir).Path

# Prefer the 64-bit compiler; QQ is 64-bit on Windows 10/11.
$candidates = @(
  "$env:WINDIR\Microsoft.NET\Framework64\v4.0.30319\csc.exe",
  "$env:WINDIR\Microsoft.NET\Framework\v4.0.30319\csc.exe"
)
$csc = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $csc) {
  throw "No C# compiler found. Install the .NET Framework 4.x or the .NET SDK, then re-run."
}

$out = Join-Path $OutputDir "QqHelper.exe"

# UI Automation lives in the .NET Framework GAC; the compiler needs full paths
# because the GAC is not an assembly search directory for csc.
$gacRoot = Join-Path $env:WINDIR "Microsoft.NET\assembly\GAC_MSIL"
function Resolve-Gac([string]$name) {
  $hit = Get-ChildItem (Join-Path $gacRoot $name) -Recurse -Filter "$name.dll" -ErrorAction SilentlyContinue |
    Select-Object -First 1
  if (-not $hit) { throw "assembly not found in the GAC: $name (is the .NET Framework 4.x installed?)" }
  return $hit.FullName
}

$refs = @(
  (Resolve-Gac "UIAutomationClient"),
  (Resolve-Gac "UIAutomationTypes"),
  (Resolve-Gac "WindowsBase")
)

$compilerArgs = @(
  "/nologo",
  "/target:exe",
  "/platform:anycpu",
  "/utf8output",
  "/out:$out"
)
foreach ($r in $refs) { $compilerArgs += "/reference:$r" }
if ($Configuration -eq "Release") { $compilerArgs += "/optimize+" }
$compilerArgs += $source

Write-Host "compiler : $csc"
Write-Host "source   : $source"
Write-Host "output   : $out"
foreach ($r in $refs) { Write-Host "reference: $r" }

& $csc $compilerArgs
if ($LASTEXITCODE -ne 0) { throw "csc failed with exit code $LASTEXITCODE" }
if (-not (Test-Path $out)) { throw "compiler reported success but $out is missing" }

# Probe the freshly built helper so a broken build is caught here, not at runtime.
$probe = '{"id":1,"op":"ping"}' | & $out
$probeText = ($probe | Out-String)
Write-Host "probe    : $($probeText.Trim())"
if ($probeText -notlike '*pong*') { throw "helper did not answer the ping probe" }

Write-Host "OK: $out"
