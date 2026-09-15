# SPDX-License-Identifier: AGPL-3.0-only
# Exercise the QQ helper end to end and print a readable report.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File desktop\helper\test-helper.ps1
param(
  [string]$HelperPath = ""
)

$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
if ([string]::IsNullOrWhiteSpace($HelperPath)) { $HelperPath = Join-Path $here "bin\QqHelper.exe" }
if (-not (Test-Path $HelperPath)) { throw "helper not built: $HelperPath (run build-helper.ps1)" }

$requests = @(
  '{"id":1,"op":"ping"}',
  '{"id":2,"op":"windowAt"}',
  '{"id":3,"op":"status"}',
  '{"id":4,"op":"readDraft"}',
  '{"id":5,"op":"focusEditBox"}',
  '{"id":6,"op":"confirmTarget"}',
  '{"id":7,"op":"quit"}'
)

$lines = $requests | & $HelperPath
Write-Output "=== helper responses ==="
foreach ($line in $lines) { Write-Output $line }

Write-Output ""
Write-Output "=== summary ==="
$status = $lines | Where-Object { $_ -like '*"id":3*' } | Select-Object -First 1
if ($status) {
  try {
    $obj = $status | ConvertFrom-Json
    Write-Output ("QQ running            : {0}" -f $obj.result.running)
    Write-Output ("QQ version            : {0}" -f $obj.result.version)
    Write-Output ("QQ top-level windows  : {0}" -f $obj.result.windowCount)
    Write-Output ("UIA elements seen     : {0}" -f $obj.result.elementCount)
    Write-Output ("live read supported   : {0}" -f $obj.result.liveReadSupported)
    Write-Output ("reason                : {0}" -f $obj.result.reason)
    if ($obj.result.draft) {
      Write-Output ("draft class           : {0}" -f $obj.result.draft.className)
      Write-Output ("draft value           : {0}" -f $obj.result.draft.value)
    }
  } catch {
    Write-Output "could not parse the status reply: $_"
  }
}
