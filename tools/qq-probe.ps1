# SPDX-License-Identifier: AGPL-3.0-only
# QQ live UI Automation probe (read-only).
#
# Enumerates the UIA tree of every window owned by QQ.EXE and reports whether a
# chat message box is reachable, and whether its text can be read.
#
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools\qq-probe.ps1
#   powershell ... -File tools\qq-probe.ps1 -MaxDepth 14 -Limit 500
#   powershell ... -File tools\qq-probe.ps1 -ForegroundOnly      # only the focused window
#   powershell ... -File tools\qq-probe.ps1 -ProcessName msedge  # sanity-check the probe itself
#
# Prerequisite for live mode: open a QQ chat window and put the caret in the
# message box. Chromium builds its accessibility tree lazily.
param(
  [string]$OutFile = "",
  [int]$MaxDepth = 14,
  [int]$Limit = 400,
  [string]$ProcessName = "QQ",
  [switch]$ForegroundOnly
)

$ErrorActionPreference = 'Continue'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

Add-Type -Namespace QQProbe -Name Win -MemberDefinition @'
[DllImport("user32.dll")] public static extern System.IntPtr GetForegroundWindow();
[DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(System.IntPtr h, out uint pid);
[DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassNameW(System.IntPtr h, System.Text.StringBuilder s, int n);
[DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowTextW(System.IntPtr h, System.Text.StringBuilder s, int n);
[DllImport("user32.dll")] public static extern bool IsWindowVisible(System.IntPtr h);
[DllImport("user32.dll")] public static extern bool GetGUIThreadInfo(uint tid, ref GUITHREADINFO gti);
[StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
[StructLayout(LayoutKind.Sequential)] public struct GUITHREADINFO {
  public int cbSize; public int flags; public System.IntPtr hwndActive; public System.IntPtr hwndFocus;
  public System.IntPtr hwndCapture; public System.IntPtr hwndMenuOwner; public System.IntPtr hwndMoveSize;
  public System.IntPtr hwndCaret; public RECT rcCaret;
}
'@

function Get-Cls([System.IntPtr]$h) {
  $sb = New-Object System.Text.StringBuilder 512
  [void][QQProbe.Win]::GetClassNameW($h, $sb, 512); $sb.ToString()
}
function Get-Ttl([System.IntPtr]$h) {
  $sb = New-Object System.Text.StringBuilder 1024
  [void][QQProbe.Win]::GetWindowTextW($h, $sb, 1024); $sb.ToString()
}

$AE = [System.Windows.Automation.AutomationElement]
$VP = [System.Windows.Automation.ValuePattern]::Pattern
$TP = [System.Windows.Automation.TextPattern]::Pattern
$LP = $null
try { $LP = [System.Windows.Automation.LegacyIAccessiblePattern]::Pattern } catch { }

function Get-Current($d, [string]$name, $fallback) {
  # $d.Current.<prop> can throw for stale elements; never let that kill the probe.
  try {
    switch ($name) {
      'type'      { return $d.Current.ControlType.ProgrammaticName }
      'cls'       { return $d.Current.ClassName }
      'name'      { return $d.Current.Name }
      'autoId'    { return $d.Current.AutomationId }
      'offscreen' { return $d.Current.IsOffscreen }
      'focusable' { return $d.Current.IsKeyboardFocusable }
      'hasFocus'  { return $d.Current.HasKeyboardFocus }
      default     { return $fallback }
    }
  } catch { return $fallback }
}

function Read-Element([System.Windows.Automation.AutomationElement]$d) {
  $ci = [ordered]@{
    type      = (Get-Current $d 'type' '?')
    cls       = (Get-Current $d 'cls' '')
    name      = (Get-Current $d 'name' '')
    autoId    = (Get-Current $d 'autoId' '')
    offscreen = (Get-Current $d 'offscreen' $true)
    focusable = (Get-Current $d 'focusable' $false)
    hasFocus  = (Get-Current $d 'hasFocus' $false)
  }
  try {
    $vp = $d.GetCurrentPattern($VP)
    $ci.value = [string]$vp.Current.Value
    $ci.valueReadOnly = $vp.Current.IsReadOnly
  } catch { }
  try {
    $null = $d.GetCurrentPattern($TP)
    $ci.textPattern = $true
    try {
      $r = $d.GetCurrentPattern($TP).DocumentRange.GetText(400)
      $ci.textSample = $r
    } catch { }
  } catch { }
  if ($LP) {
    try { $ci.legacyValue = [string]$d.GetCurrentPattern($LP).Current.Value } catch { }
  }
  return $ci
}

$procs = @(Get-Process -Name $ProcessName -ErrorAction SilentlyContinue)
$report = [ordered]@{
  timestamp  = (Get-Date).ToString('s')
  probeFor   = $ProcessName
  processes  = @()
  foreground = $null
  windows    = @()
  notes      = @()
}

$report.processes = @($procs | ForEach-Object {
  $p = $_
  $ver = ''
  $exePath = ''
  try { $ver = $p.MainModule.FileVersionInfo.FileVersion } catch { }
  try { $exePath = $p.MainModule.FileName } catch { }
  [ordered]@{
    id = $p.Id
    mainWindowHandle = ('0x{0:X}' -f $p.MainWindowHandle.ToInt64())
    title = $p.MainWindowTitle
    version = $ver
    path = $exePath
  }
})
if ($procs.Count -eq 0) { $report.notes += "$ProcessName.EXE_NOT_RUNNING" }
$procIds = @($procs.Id)

$fg = [QQProbe.Win]::GetForegroundWindow()
$fgpid = [uint32]0
$fgTid = [QQProbe.Win]::GetWindowThreadProcessId($fg, [ref]$fgpid)
$report.foreground = [ordered]@{
  hwnd = ('0x{0:X}' -f $fg.ToInt64()); pid = [int]$fgpid; cls = (Get-Cls $fg); title = (Get-Ttl $fg)
  belongsToTarget = ($procIds -contains [int]$fgpid)
}
$gti = New-Object QQProbe.Win+GUITHREADINFO
$gti.cbSize = [System.Runtime.InteropServices.Marshal]::SizeOf($gti)
if ([QQProbe.Win]::GetGUIThreadInfo($fgTid, [ref]$gti)) {
  $report.foreground.focusHwnd = ('0x{0:X}' -f $gti.hwndFocus.ToInt64())
  $report.foreground.focusCls = (Get-Cls $gti.hwndFocus)
  $report.foreground.caretHwnd = ('0x{0:X}' -f $gti.hwndCaret.ToInt64())
}

$roots = @()
if ($ForegroundOnly) {
  try { $roots = @($AE::FromHandle($fg)) } catch { }
} else {
  foreach ($w in $AE::RootElement.FindAll([System.Windows.Automation.TreeScope]::Children, [System.Windows.Automation.Condition]::TrueCondition)) {
    $wpid = 0
    try { $wpid = $w.Current.ProcessId } catch { continue }
    if ($procIds -notcontains $wpid) { continue }
    $roots += $w
  }
}

foreach ($root in $roots) {
  $rName = ''; $rCls = ''; $rPid = 0; $rHwnd = 0; $rOff = $true
  try { $rName = $root.Current.Name } catch { }
  try { $rCls = $root.Current.ClassName } catch { }
  try { $rPid = $root.Current.ProcessId } catch { }
  try { $rHwnd = $root.Current.NativeWindowHandle } catch { }
  try { $rOff = $root.Current.IsOffscreen } catch { }
  $entry = [ordered]@{
    name = $rName
    cls = $rCls
    pid = $rPid
    hwnd = ('0x{0:X}' -f $rHwnd)
    offscreen = $rOff
    descendantCount = 0
    controls = @()
  }
  try {
    $all = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
    $entry.descendantCount = $all.Count
    $i = 0
    foreach ($d in $all) {
      if ($i -ge $Limit) { break }
      $i++
      try { $entry.controls += (Read-Element $d) } catch { }
    }
  } catch {
    $entry.error = $_.Exception.Message
  }
  $report.windows += $entry
}

$editLike = @()
$totalElements = 0
foreach ($w in $report.windows) {
  $totalElements += [int]$w.descendantCount
  foreach ($c in $w.controls) {
    if ($c.type -match 'Edit|Document' -or $null -ne $c.value -or $c.textPattern) { $editLike += $c }
  }
}
$valueReadable = @($editLike | Where-Object { $null -ne $_.value }).Count
$report.verdict = [ordered]@{
  windowCount        = $report.windows.Count
  totalElements      = $totalElements
  editLikeCount      = $editLike.Count
  valueReadableCount = $valueReadable
  liveReadVerdict    =
    if ($totalElements -eq 0) { 'UNAVAILABLE_NO_UIA_ELEMENTS' }
    elseif ($valueReadable -gt 0) { 'CANDIDATE_VALUE_PATTERN' }
    elseif ($editLike.Count -gt 0) { 'ELEMENTS_BUT_NO_VALUE' }
    else { 'ELEMENTS_BUT_NO_EDIT' }
}
if ($report.verdict.liveReadVerdict -eq 'UNAVAILABLE_NO_UIA_ELEMENTS') {
  $report.notes += 'Chromium accessibility tree is empty for this process. Re-run with the chat window open and focused. If it stays empty, live mode is not available for this build.'
}

$json = $report | ConvertTo-Json -Depth 8
if ([string]::IsNullOrWhiteSpace($OutFile)) { $OutFile = Join-Path $PSScriptRoot '_qq-probe.json' }
[System.IO.File]::WriteAllText($OutFile, $json, (New-Object System.Text.UTF8Encoding($false)))
Write-Output "probe written: $OutFile"
Write-Output ("foreground pid={0} belongsToTarget={1} class={2}" -f $report.foreground.pid, $report.foreground.belongsToTarget, $report.foreground.cls)
Write-Output ("windows={0} elements={1} editLike={2} valueReadable={3} verdict={4}" -f $report.verdict.windowCount, $report.verdict.totalElements, $report.verdict.editLikeCount, $report.verdict.valueReadableCount, $report.verdict.liveReadVerdict)
