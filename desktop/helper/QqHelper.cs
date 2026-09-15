// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 The 25-ji-code-de Team

/**
 * Windows / QQ integration helper.
 *
 * A long-lived child process speaking newline-delimited JSON on stdin/stdout, so
 * the Electron main process can ask about QQ without spawning a process per
 * query. Every request is `{ "id": n, "op": "...", ... }` and every reply is
 * `{ "id": n, "ok": true|false, ... }`.
 *
 * Operations:
 *   ping                  liveness + capability probe
 *   status                everything the UI needs to render the QQ panel
 *   readDraft             foreground QQ chat input text (live mode)
 *   focusEditBox          is the focused control QQ's chat message box?
 *   windowAt              which window is in the foreground
 *   confirmTarget         is `hwnd` still QQ's chat window with this draft?
 *
 * Design rules (from the feature request):
 *   - read-only: never inject into QQ, never modify QQ files, never use private
 *     protocols;
 *   - when UI Automation cannot see QQ's tree, report `liveReadSupported: false`
 *     instead of guessing;
 *   - never synthesise a draft from global keystrokes: that cannot handle IME,
 *     deletion, paste or caret edits, so it is not attempted at all.
 */

using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Windows.Automation;

internal static class Program
{
    private const int MaxTreeNodes = 4000;
    private const int MaxTreeDepth = 24;

    // -----------------------------------------------------------------------
    // Win32
    // -----------------------------------------------------------------------

    [DllImport("user32.dll")]
    private static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll", SetLastError = true)]
    private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetClassNameW(IntPtr hWnd, StringBuilder text, int count);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetWindowTextW(IntPtr hWnd, StringBuilder text, int count);

    [DllImport("user32.dll")]
    private static extern bool IsWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern bool IsWindowVisible(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern bool IsIconic(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern bool GetGUIThreadInfo(uint idThread, ref GUITHREADINFO lpgui);

    [StructLayout(LayoutKind.Sequential)]
    private struct RECT
    {
        public int Left, Top, Right, Bottom;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct GUITHREADINFO
    {
        public int cbSize;
        public int flags;
        public IntPtr hwndActive;
        public IntPtr hwndFocus;
        public IntPtr hwndCapture;
        public IntPtr hwndMenuOwner;
        public IntPtr hwndMoveSize;
        public IntPtr hwndCaret;
        public RECT rcCaret;
    }

    private static string ClassOf(IntPtr h)
    {
        if (h == IntPtr.Zero) return "";
        var sb = new StringBuilder(512);
        GetClassNameW(h, sb, sb.Capacity);
        return sb.ToString();
    }

    private static string TitleOf(IntPtr h)
    {
        if (h == IntPtr.Zero) return "";
        var sb = new StringBuilder(1024);
        GetWindowTextW(h, sb, sb.Capacity);
        return sb.ToString();
    }

    // -----------------------------------------------------------------------
    // JSON (hand-rolled: no external dependencies, and the payloads are small)
    // -----------------------------------------------------------------------

    private static string Esc(string s)
    {
        if (s == null) return "null";
        var sb = new StringBuilder(s.Length + 16);
        foreach (char c in s)
        {
            switch (c)
            {
                case '"': sb.Append("\\\""); break;
                case '\\': sb.Append("\\\\"); break;
                case '\n': sb.Append("\\n"); break;
                case '\r': sb.Append("\\r"); break;
                case '\t': sb.Append("\\t"); break;
                default:
                    if (c < 0x20) sb.Append("\\u").Append(((int)c).ToString("x4"));
                    else sb.Append(c);
                    break;
            }
        }
        return sb.ToString();
    }

    private static string Str(string s) { return s == null ? "null" : "\"" + Esc(s) + "\""; }

    private static string Bool(bool b) { return b ? "true" : "false"; }

    /// <summary>Minimal reader for the flat request objects this protocol uses.</summary>
    private static string Field(string json, string key)
    {
        int at = json.IndexOf("\"" + key + "\"", StringComparison.Ordinal);
        if (at < 0) return null;
        int colon = json.IndexOf(':', at);
        if (colon < 0) return null;
        int i = colon + 1;
        while (i < json.Length && char.IsWhiteSpace(json[i])) i++;
        if (i >= json.Length) return null;
        if (json[i] == '"')
        {
            i++;
            var sb = new StringBuilder();
            while (i < json.Length && json[i] != '"')
            {
                if (json[i] == '\\' && i + 1 < json.Length)
                {
                    i++;
                    switch (json[i])
                    {
                        case 'n': sb.Append('\n'); break;
                        case 'r': sb.Append('\r'); break;
                        case 't': sb.Append('\t'); break;
                        case 'u':
                            if (i + 4 < json.Length)
                            {
                                int code;
                                if (int.TryParse(json.Substring(i + 1, 4),
                                        System.Globalization.NumberStyles.HexNumber,
                                        System.Globalization.CultureInfo.InvariantCulture, out code))
                                {
                                    sb.Append((char)code);
                                    i += 4;
                                }
                            }
                            break;
                        default: sb.Append(json[i]); break;
                    }
                }
                else sb.Append(json[i]);
                i++;
            }
            return sb.ToString();
        }
        int end = i;
        while (end < json.Length && json[end] != ',' && json[end] != '}') end++;
        return json.Substring(i, end - i).Trim();
    }

    private static long LongField(string json, string key, long fallback)
    {
        string raw = Field(json, key);
        long value;
        if (raw != null && long.TryParse(raw, out value)) return value;
        return fallback;
    }

    // -----------------------------------------------------------------------
    // QQ discovery
    // -----------------------------------------------------------------------

    private static List<Process> QqProcesses()
    {
        var list = new List<Process>();
        foreach (var p in Process.GetProcesses())
        {
            try
            {
                if (string.Equals(p.ProcessName, "QQ", StringComparison.OrdinalIgnoreCase)) list.Add(p);
                else p.Dispose();
            }
            catch { }
        }
        return list;
    }

    private static string QqVersion()
    {
        foreach (var p in QqProcesses())
        {
            try
            {
                if (p.MainModule != null) return p.MainModule.FileVersionInfo.FileVersion ?? "";
            }
            catch { }
        }
        return "";
    }

    private sealed class ElementInfo
    {
        public AutomationElement Element;
        public string ControlType = "";
        public string ClassName = "";
        public string Name = "";
        public string AutomationId = "";
        public bool Offscreen;
        public bool Focusable;
        public bool HasFocus;
        public bool HasValue;
        public string Value = "";
        public bool HasText;
        public string TextSample = "";
        public bool IsEnabled;
        public int Depth;
    }

    private static ElementInfo Describe(AutomationElement el, int depth, bool readText)
    {
        var info = new ElementInfo { Element = el, Depth = depth };
        try { info.ControlType = el.Current.ControlType.ProgrammaticName ?? ""; } catch { }
        try { info.ClassName = el.Current.ClassName ?? ""; } catch { }
        try { info.Name = el.Current.Name ?? ""; } catch { }
        try { info.AutomationId = el.Current.AutomationId ?? ""; } catch { }
        try { info.Offscreen = el.Current.IsOffscreen; } catch { info.Offscreen = true; }
        try { info.Focusable = el.Current.IsKeyboardFocusable; } catch { }
        try { info.HasFocus = el.Current.HasKeyboardFocus; } catch { }
        try { info.IsEnabled = el.Current.IsEnabled; } catch { }
        try
        {
            var vp = (ValuePattern)el.GetCurrentPattern(ValuePattern.Pattern);
            info.HasValue = true;
            info.Value = vp.Current.Value ?? "";
        }
        catch { }
        if (readText)
        {
            try
            {
                var tp = (TextPattern)el.GetCurrentPattern(TextPattern.Pattern);
                info.HasText = true;
                try { info.TextSample = tp.DocumentRange.GetText(512) ?? ""; } catch { }
            }
            catch { }
        }
        return info;
    }

    /// <summary>
    /// Collect the accessible elements of every window owned by QQ, breadth-first
    /// and capped, so a pathological tree cannot hang the helper.
    /// </summary>
    private static List<ElementInfo> CollectQqElements(bool readText, out int rootCount, out int totalSeen)
    {
        var found = new List<ElementInfo>();
        rootCount = 0;
        totalSeen = 0;
        var pids = new HashSet<int>();
        foreach (var p in QqProcesses())
        {
            try { pids.Add(p.Id); } catch { }
        }
        if (pids.Count == 0) return found;

        AutomationElement root = AutomationElement.RootElement;
        var windowCondition = new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.Window);
        AutomationElementCollection windows;
        try { windows = root.FindAll(TreeScope.Children, windowCondition); }
        catch { return found; }

        foreach (AutomationElement win in windows)
        {
            int pid;
            try { pid = win.Current.ProcessId; } catch { continue; }
            if (!pids.Contains(pid)) continue;
            rootCount++;
            var queue = new Queue<ElementInfo>();
            queue.Enqueue(Describe(win, 0, readText));
            while (queue.Count > 0 && totalSeen < MaxTreeNodes)
            {
                var current = queue.Dequeue();
                totalSeen++;
                found.Add(current);
                if (current.Depth >= MaxTreeDepth) continue;
                AutomationElementCollection kids;
                try
                {
                    kids = current.Element.FindAll(TreeScope.Children, Condition.TrueCondition);
                }
                catch { continue; }
                foreach (AutomationElement kid in kids)
                {
                    if (totalSeen + queue.Count >= MaxTreeNodes) break;
                    queue.Enqueue(Describe(kid, current.Depth + 1, readText));
                }
            }
        }
        return found;
    }

    /// <summary>Heuristic: does this element look like a chat message box?</summary>
    private static bool IsChatEditCandidate(ElementInfo e)
    {
        bool editable = e.ControlType.IndexOf("Edit", StringComparison.OrdinalIgnoreCase) >= 0
            || e.ControlType.IndexOf("Document", StringComparison.OrdinalIgnoreCase) >= 0;
        if (!editable) return false;
        if (!e.IsEnabled) return false;
        if (e.Offscreen) return false;
        string name = (e.Name ?? "") + " " + (e.AutomationId ?? "") + " " + (e.ClassName ?? "");
        // QQ's own labels for the message box; anything mentioning search or the
        // message history is not the draft box.
        if (name.IndexOf("搜索", StringComparison.Ordinal) >= 0) return false;
        if (name.IndexOf("search", StringComparison.OrdinalIgnoreCase) >= 0) return false;
        return true;
    }

    private static ElementInfo FindDraftElement(List<ElementInfo> elements)
    {
        ElementInfo best = null;
        foreach (var e in elements)
        {
            if (!IsChatEditCandidate(e)) continue;
            // Prefer the focused one, then the deepest (the real editor, not a
            // container), then the one that exposes a value.
            if (best == null) { best = e; continue; }
            bool betterFocus = e.HasFocus && !best.HasFocus;
            bool sameFocus = e.HasFocus == best.HasFocus;
            bool deeper = sameFocus && e.Depth > best.Depth;
            bool hasValue = sameFocus && !deeper && e.HasValue && !best.HasValue;
            if (betterFocus || deeper || hasValue) best = e;
        }
        return best;
    }

    // -----------------------------------------------------------------------
    // Operations
    // -----------------------------------------------------------------------

    private static string OpPing()
    {
        return "{\"pong\":true,\"uia\":true,\"runtime\":\"" +
               Esc(Environment.Version.ToString()) + "\"}";
    }

    private static string OpWindowAt(string req)
    {
        IntPtr hwnd = GetForegroundWindow();
        uint pid;
        uint tid = GetWindowThreadProcessId(hwnd, out pid);
        bool isQq = false;
        foreach (var p in QqProcesses())
        {
            try { if (p.Id == (int)pid) isQq = true; } catch { }
            if (isQq) break;
        }
        var gti = new GUITHREADINFO();
        gti.cbSize = Marshal.SizeOf(typeof(GUITHREADINFO));
        string focusClass = "";
        if (GetGUIThreadInfo(tid, ref gti)) focusClass = ClassOf(gti.hwndFocus);
        return "{\"hwnd\":" + hwnd.ToInt64() + ",\"pid\":" + pid +
               ",\"class\":" + Str(ClassOf(hwnd)) +
               ",\"title\":" + Str(TitleOf(hwnd)) +
               ",\"isQq\":" + Bool(isQq) +
               ",\"focusClass\":" + Str(focusClass) +
               ",\"visible\":" + Bool(IsWindowVisible(hwnd)) +
               ",\"minimized\":" + Bool(IsIconic(hwnd)) + "}";
    }

    private static string StatusBody()
    {
        int roots, seen;
        var elements = CollectQqElements(true, out roots, out seen);
        var draft = FindDraftElement(elements);
        string version = QqVersion();
        bool running = roots > 0 || QqProcesses().Count > 0;
        bool liveRead = draft != null && draft.HasValue;

        var sb = new StringBuilder();
        sb.Append("{\"running\":").Append(Bool(running));
        sb.Append(",\"version\":").Append(Str(version));
        sb.Append(",\"windowCount\":").Append(roots);
        sb.Append(",\"elementCount\":").Append(seen);
        sb.Append(",\"liveReadSupported\":").Append(Bool(liveRead));
        if (draft != null)
        {
            sb.Append(",\"draft\":{");
            sb.Append("\"className\":").Append(Str(draft.ClassName));
            sb.Append(",\"controlType\":").Append(Str(draft.ControlType));
            sb.Append(",\"name\":").Append(Str(draft.Name));
            sb.Append(",\"value\":").Append(draft.HasValue ? Str(draft.Value) : "null");
            sb.Append(",\"hasFocus\":").Append(Bool(draft.HasFocus));
            sb.Append("}");
        }
        else
        {
            sb.Append(",\"draft\":null");
        }
        sb.Append(",\"reason\":").Append(Str(liveRead
            ? "QQ chat input box is reachable through UI Automation"
            : running
                ? "QQ exposes no editable element through UI Automation; live reading is unavailable for this build"
                : "QQ is not running"));
        sb.Append("}");
        return sb.ToString();
    }

    private static string OpStatus() { return StatusBody(); }

    private static string OpReadDraft()
    {
        int roots, seen;
        var elements = CollectQqElements(true, out roots, out seen);
        var draft = FindDraftElement(elements);
        if (draft == null)
        {
            return "{\"available\":false,\"reason\":" +
                   Str(roots == 0
                       ? "no QQ window found"
                       : "QQ exposes no editable element through UI Automation") + "}";
        }
        string value = draft.HasValue ? draft.Value : null;
        return "{\"available\":" + Bool(value != null) +
               ",\"text\":" + Str(value) +
               ",\"className\":" + Str(draft.ClassName) +
               ",\"hasFocus\":" + Bool(draft.HasFocus) +
               ",\"reason\":" + Str(value != null ? "" : "the chat editor exposes no value pattern") + "}";
    }

    private static string OpFocusEditBox()
    {
        int roots, seen;
        var elements = CollectQqElements(false, out roots, out seen);
        var draft = FindDraftElement(elements);
        if (draft == null) return "{\"focused\":false,\"reason\":\"no chat editor found\"}";
        return "{\"focused\":" + Bool(draft.HasFocus) +
               ",\"className\":" + Str(draft.ClassName) + "}";
    }

    private static string OpConfirmTarget(string req)
    {
        long expected = LongField(req, "hwnd", 0);
        IntPtr hwnd = GetForegroundWindow();
        uint pid;
        GetWindowThreadProcessId(hwnd, out pid);
        bool isQq = false;
        foreach (var p in QqProcesses())
        {
            try { if (p.Id == (int)pid) isQq = true; } catch { }
            if (isQq) break;
        }
        bool sameWindow = expected == 0 || hwnd.ToInt64() == expected;
        int roots, seen;
        var elements = CollectQqElements(false, out roots, out seen);
        var draft = FindDraftElement(elements);
        bool editorFocused = draft != null && draft.HasFocus;
        bool ok = isQq && sameWindow && editorFocused;
        string reason = !isQq
            ? "QQ is not the foreground application"
            : !sameWindow
                ? "a different window is in the foreground"
                : draft == null
                    ? "QQ shows no chat editor"
                    : !editorFocused
                        ? "the chat editor does not have keyboard focus"
                        : "";
        return "{\"ok\":" + Bool(ok) +
               ",\"isQq\":" + Bool(isQq) +
               ",\"sameWindow\":" + Bool(sameWindow) +
               ",\"editorFocused\":" + Bool(editorFocused) +
               ",\"reason\":" + Str(reason) + "}";
    }

    // -----------------------------------------------------------------------
    // Protocol loop
    // -----------------------------------------------------------------------

    private static int Main()
    {
        // UTF-8 on both ends; the renderer sends Chinese drafts.
        var stdin = new System.IO.StreamReader(Console.OpenStandardInput(), new UTF8Encoding(false));
        var stdout = new System.IO.StreamWriter(Console.OpenStandardOutput(), new UTF8Encoding(false));
        stdout.AutoFlush = true;

        // Announce readiness so the parent does not have to poll.
        stdout.WriteLine("{\"event\":\"ready\",\"pid\":" + Process.GetCurrentProcess().Id + "}");

        string line;
        while ((line = stdin.ReadLine()) != null)
        {
            if (line.Trim().Length == 0) continue;
            string id = Field(line, "id") ?? "null";
            string op = Field(line, "op") ?? "";
            string body;
            try
            {
                switch (op)
                {
                    case "ping": body = OpPing(); break;
                    case "status": body = OpStatus(); break;
                    case "readDraft": body = OpReadDraft(); break;
                    case "focusEditBox": body = OpFocusEditBox(); break;
                    case "windowAt": body = OpWindowAt(line); break;
                    case "confirmTarget": body = OpConfirmTarget(line); break;
                    case "quit": stdout.WriteLine("{\"id\":" + id + ",\"ok\":true,\"bye\":true}"); return 0;
                    default:
                        stdout.WriteLine("{\"id\":" + id + ",\"ok\":false,\"error\":" + Str("unknown op: " + op) + "}");
                        continue;
                }
                stdout.WriteLine("{\"id\":" + id + ",\"ok\":true,\"result\":" + body + "}");
            }
            catch (Exception ex)
            {
                stdout.WriteLine("{\"id\":" + id + ",\"ok\":false,\"error\":" + Str(ex.Message) + "}");
            }
        }
        return 0;
    }
}
