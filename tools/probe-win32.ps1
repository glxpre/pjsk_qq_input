# SPDX-License-Identifier: AGPL-3.0-only
# Win32-level probe: enumerate all top-level + child windows of QQ processes.
# Emits JSON so that no console encoding can mangle the output.
param([string]$OutFile = "D:\stickers-maker\tools\_probe-win32.json")

Add-Type -Namespace Probe -Name Win -MemberDefinition @'
[DllImport("user32.dll", SetLastError=true)] public static extern bool EnumWindows(EnumWindowsProc cb, System.IntPtr p);
public delegate bool EnumWindowsProc(System.IntPtr h, System.IntPtr p);
[DllImport("user32.dll", SetLastError=true)] public static extern bool EnumChildWindows(System.IntPtr parent, EnumWindowsProc cb, System.IntPtr p);
[DllImport("user32.dll", CharSet=CharSet.Unicode, SetLastError=true)] public static extern int GetWindowTextW(System.IntPtr h, System.Text.StringBuilder s, int n);
[DllImport("user32.dll", CharSet=CharSet.Unicode, SetLastError=true)] public static extern int GetClassNameW(System.IntPtr h, System.Text.StringBuilder s, int n);
[DllImport("user32.dll", SetLastError=true)] public static extern uint GetWindowThreadProcessId(System.IntPtr h, out uint pid);
[DllImport("user32.dll")] public static extern bool IsWindowVisible(System.IntPtr h);
[DllImport("user32.dll")] public static extern bool IsIconic(System.IntPtr h);
[DllImport("user32.dll")] public static extern System.IntPtr GetForegroundWindow();
[DllImport("user32.dll")] public static extern int GetWindowLongW(System.IntPtr h, int idx);
[DllImport("user32.dll")] public static extern bool GetGUIThreadInfo(uint tid, ref GUITHREADINFO gti);
[StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
[StructLayout(LayoutKind.Sequential)] public struct GUITHREADINFO {
  public int cbSize; public int flags; public System.IntPtr hwndActive; public System.IntPtr hwndFocus;
  public System.IntPtr hwndCapture; public System.IntPtr hwndMenuOwner; public System.IntPtr hwndMoveSize;
  public System.IntPtr hwndCaret; public RECT rcCaret;
}
'@

function Get-Class([System.IntPtr]$h) {
  $sb = New-Object System.Text.StringBuilder 512
  [void][Probe.Win]::GetClassNameW($h, $sb, 512)
  return $sb.ToString()
}
function Get-Title([System.IntPtr]$h) {
  $sb = New-Object System.Text.StringBuilder 1024
  [void][Probe.Win]::GetWindowTextW($h, $sb, 1024)
  return $sb.ToString()
}

$targetPids = @((Get-Process -Name QQ -ErrorAction SilentlyContinue).Id)
$out = [ordered]@{ qqPids = $targetPids; topLevel = @(); children = @(); focus = @() }

$cb = [Probe.Win+EnumWindowsProc]{
  param($h, $p)
  $wpid = [uint32]0
  [void][Probe.Win]::GetWindowThreadProcessId($h, [ref]$wpid)
  if ($targetPids -contains [int]$wpid) {
    $out.topLevel += [ordered]@{
      hwnd = ('0x{0:X}' -f $h.ToInt64()); pid = [int]$wpid; cls = (Get-Class $h); title = (Get-Title $h)
      visible = [Probe.Win]::IsWindowVisible($h); iconic = [Probe.Win]::IsIconic($h)
      style = ('0x{0:X8}' -f [Probe.Win]::GetWindowLongW($h, -16))
      exStyle = ('0x{0:X8}' -f [Probe.Win]::GetWindowLongW($h, -20))
    }
  }
  return $true
}
[void][Probe.Win]::EnumWindows($cb, [System.IntPtr]::Zero)

foreach ($t in $out.topLevel) {
  $hwnd = [System.IntPtr]([Convert]::ToInt64($t.hwnd, 16))
  $kidList = @()
  $cb2 = [Probe.Win+EnumWindowsProc]{
    param($h, $p)
    $script:kidList += [ordered]@{ hwnd = ('0x{0:X}' -f $h.ToInt64()); cls = (Get-Class $h); title = (Get-Title $h); visible = [Probe.Win]::IsWindowVisible($h) }
    return $true
  }
  $script:kidList = @()
  [void][Probe.Win]::EnumChildWindows($hwnd, $cb2, [System.IntPtr]::Zero)
  if ($kidList.Count -gt 0) {
    $out.children += [ordered]@{ parent = $t.hwnd; parentCls = $t.cls; kids = $kidList }
  }
}

$fg = [Probe.Win]::GetForegroundWindow()
$fgpid = [uint32]0
$fgTid = [Probe.Win]::GetWindowThreadProcessId($fg, [ref]$fgpid)
$out.focus += [ordered]@{ kind = 'foreground'; hwnd = ('0x{0:X}' -f $fg.ToInt64()); pid = [int]$fgpid; cls = (Get-Class $fg); title = (Get-Title $fg) }

foreach ($tp in $targetPids) {
  $p = Get-Process -Id $tp -ErrorAction SilentlyContinue
  if (-not $p) { continue }
  foreach ($th in $p.Threads) {
    $gti = New-Object Probe.Win+GUITHREADINFO
    $gti.cbSize = [System.Runtime.InteropServices.Marshal]::SizeOf($gti)
    if ([Probe.Win]::GetGUIThreadInfo($th.Id, [ref]$gti)) {
      if ($gti.hwndActive -ne [System.IntPtr]::Zero -or $gti.hwndFocus -ne [System.IntPtr]::Zero) {
        $out.focus += [ordered]@{
          kind = 'thread'; pid = [int]$tp; tid = $th.Id
          active = ('0x{0:X}' -f $gti.hwndActive.ToInt64()); activeCls = (Get-Class $gti.hwndActive)
          focusHwnd = ('0x{0:X}' -f $gti.hwndFocus.ToInt64()); focusCls = (Get-Class $gti.hwndFocus)
          caret = ('0x{0:X}' -f $gti.hwndCaret.ToInt64())
        }
      }
    }
  }
}

$json = $out | ConvertTo-Json -Depth 6
[System.IO.File]::WriteAllText($OutFile, $json, (New-Object System.Text.UTF8Encoding($false)))
Write-Output "written: $OutFile"
