# SPDX-License-Identifier: AGPL-3.0-only
# Minimal UI Automation probe: enumerate the QQ window control tree.
# Usage: powershell -ExecutionPolicy Bypass -File tools\probe-uia.ps1
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName WindowsBase

$UIA = [System.Windows.Automation.AutomationElement]
$walker = [System.Windows.Automation.TreeWalker]::ControlViewWalker

function Get-Prop($el, $prop) {
  try { return $el.GetCurrentPropertyValue($prop) } catch { return $null }
}

function Dump($el, $depth, $maxDepth) {
  if ($null -eq $el -or $depth -gt $maxDepth) { return }
  $name = Get-Prop $el ([System.Windows.Automation.AutomationElement]::NameProperty)
  $ct = Get-Prop $el ([System.Windows.Automation.AutomationElement]::ControlTypeProperty)
  $ctName = if ($ct) { $ct.ProgrammaticName } else { '?' }
  $autoId = Get-Prop $el ([System.Windows.Automation.AutomationElement]::AutomationIdProperty)
  $cls = Get-Prop $el ([System.Windows.Automation.AutomationElement]::ClassNameProperty)
  $val = $null
  try {
    $vp = $el.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
    $val = $vp.Current.Value
  } catch {}
  $pad = '  ' * $depth
  $line = "$pad$ctName cls='$cls' id='$autoId' name='$name'"
  if ($null -ne $val) { $line += " VALUE='$val'" }
  Write-Output $line

  $child = $walker.GetFirstChild($el)
  $n = 0
  while ($null -ne $child -and $n -lt 200) {
    Dump $child ($depth + 1) $maxDepth
    $child = $walker.GetNextSibling($child)
    $n++
  }
}

Write-Output "=== root desktop children (top-level windows) ==="
$root = $UIA::RootElement
$cond = New-Object System.Windows.Automation.PropertyCondition(
  [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
  [System.Windows.Automation.ControlType]::Window)
$wins = $root.FindAll([System.Windows.Automation.TreeScope]::Children, $cond)
foreach ($w in $wins) {
  $n = Get-Prop $w ([System.Windows.Automation.AutomationElement]::NameProperty)
  $c = Get-Prop $w ([System.Windows.Automation.AutomationElement]::ClassNameProperty)
  $procId = Get-Prop $w ([System.Windows.Automation.AutomationElement]::ProcessIdProperty)
  Write-Output ("WINDOW name='{0}' class='{1}' pid={2}" -f $n, $c, $procId)
}

Write-Output ""
Write-Output "=== QQ windows deep dump ==="
foreach ($w in $wins) {
  $cls = Get-Prop $w ([System.Windows.Automation.AutomationElement]::ClassNameProperty)
  $procId = Get-Prop $w ([System.Windows.Automation.AutomationElement]::ProcessIdProperty)
  $pname = ''
  try { $pname = (Get-Process -Id $procId -ErrorAction Stop).ProcessName } catch {}
  if ($pname -ne 'QQ') { continue }
  $n = Get-Prop $w ([System.Windows.Automation.AutomationElement]::NameProperty)
  Write-Output "--- QQ window: name='$n' class='$cls' pid=$procId ---"
  Dump $w 0 8
  Write-Output ""
}
