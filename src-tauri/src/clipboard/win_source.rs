// A7Box Clipboard Manager — Windows platform helpers
// Foreground process capture, CF_HDROP file lists, "Clipboard Viewer Ignore"
// detection and an event-driven clipboard listener built on
// AddClipboardFormatListener + a hidden message-only window.
//
// The Win32 message loop requires C-callback plumbing, so a small amount of
// process-wide static state lives here (Windows-only, isolated from app state).

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc;
use std::sync::{Mutex, OnceLock};
use windows::core::{PCWSTR, PWSTR};
use windows::Win32::Foundation::{CloseHandle, HGLOBAL, HINSTANCE, HWND, LPARAM, LRESULT, WPARAM};
use windows::Win32::System::DataExchange::{
    AddClipboardFormatListener, CloseClipboard, GetClipboardData, IsClipboardFormatAvailable,
    OpenClipboard, RegisterClipboardFormatW,
};
use windows::Win32::System::LibraryLoader::GetModuleHandleW;
use windows::Win32::System::Memory::{GlobalLock, GlobalUnlock};
use windows::Win32::System::Threading::{
    OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32,
    PROCESS_QUERY_LIMITED_INFORMATION,
};
use windows::Win32::UI::Shell::{DragQueryFileW, HDROP};
use windows::Win32::UI::WindowsAndMessaging::{
    CreateWindowExW, DefWindowProcW, DispatchMessageW, GetMessageW, RegisterClassW,
    TranslateMessage, GetForegroundWindow, GetWindowThreadProcessId, GetWindowTextW,
    MSG, WNDCLASSW,
};

const CF_HDROP: u32 = 15;
const WM_CLIPBOARDUPDATE: u32 = 0x031D;
/// HWND_MESSAGE ((HWND)-3): parent for message-only windows
const HWND_MESSAGE: HWND = HWND(-3 as _);

fn wide_null(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

/// Name of the foreground (paste-target) process, e.g. "chrome.exe".
pub fn foreground_process_name() -> String {
    unsafe {
        let hwnd = GetForegroundWindow();
        if hwnd.0.is_null() {
            return String::new();
        }
        process_name_of_window(hwnd)
    }
}

/// Title of the foreground window (best effort).
pub fn foreground_window_title() -> String {
    unsafe {
        let hwnd = GetForegroundWindow();
        if hwnd.0.is_null() {
            return String::new();
        }
        let mut buf = [0u16; 512];
        let len = GetWindowTextW(hwnd, &mut buf);
        if len > 0 {
            String::from_utf16_lossy(&buf[..len as usize])
        } else {
            String::new()
        }
    }
}

unsafe fn process_name_of_window(hwnd: HWND) -> String {
    let mut pid = 0u32;
    GetWindowThreadProcessId(hwnd, Some(&mut pid));
    if pid == 0 {
        return String::new();
    }
    let Ok(process) = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) else {
        return String::new();
    };
    let mut buf = [0u16; 1024];
    let mut size = buf.len() as u32;
    let name = if QueryFullProcessImageNameW(
        process,
        PROCESS_NAME_WIN32,
        PWSTR(buf.as_mut_ptr()),
        &mut size,
    )
    .is_ok()
    {
            let path = String::from_utf16_lossy(&buf[..size as usize]);
            std::path::Path::new(&path)
                .file_name()
                .map(|f| f.to_string_lossy().to_string())
                .unwrap_or(path)
        } else {
            String::new()
        };
    let _ = CloseHandle(process);
    name
}

/// File paths currently on the clipboard (CF_HDROP). None when not present.
pub fn clipboard_file_paths() -> Option<Vec<String>> {
    unsafe {
        if IsClipboardFormatAvailable(CF_HDROP).is_err() {
            return None;
        }
        if OpenClipboard(HWND::default()).is_err() {
            return None;
        }
        let paths = read_hdrop_paths();
        let _ = CloseClipboard();
        paths
    }
}

unsafe fn read_hdrop_paths() -> Option<Vec<String>> {
    let Ok(handle) = GetClipboardData(CF_HDROP) else {
        return None;
    };
    if handle.is_invalid() {
        return None;
    }
    let hdrop = HDROP(handle.0);
    let locked = GlobalLock(HGLOBAL(handle.0));
    if locked.is_null() {
        return None;
    }
    let count = DragQueryFileW(hdrop, u32::MAX, None);
    let mut paths = Vec::with_capacity(count as usize);
    for i in 0..count {
        let mut buf = [0u16; 2048];
        let len = DragQueryFileW(hdrop, i, Some(&mut buf));
        if len > 0 {
            paths.push(String::from_utf16_lossy(&buf[..len as usize]));
        }
    }
    let _ = GlobalUnlock(HGLOBAL(handle.0));
    Some(paths)
}

/// True when the clipboard owner requested confidentiality
/// ("Clipboard Viewer Ignore" registered format).
pub fn clipboard_viewer_ignore_set() -> bool {
    unsafe {
        let name = wide_null("Clipboard Viewer Ignore");
        let fmt = RegisterClipboardFormatW(PCWSTR(name.as_ptr()));
        if fmt == 0 {
            return false;
        }
        IsClipboardFormatAvailable(fmt).is_ok()
    }
}

// ── Event-driven clipboard listener ─────────────────────────────────────────

static SIGNAL: OnceLock<Mutex<Option<mpsc::Sender<()>>>> = OnceLock::new();
static THREAD_SPAWNED: AtomicBool = AtomicBool::new(false);

fn signal_slot() -> &'static Mutex<Option<mpsc::Sender<()>>> {
    SIGNAL.get_or_init(|| Mutex::new(None))
}

/// Start (once) the hidden-window listener and return a channel that wakes up
/// the watcher on every WM_CLIPBOARDUPDATE. Repeated calls re-register the
/// sender so a restarted watcher keeps receiving events.
pub fn start_clipboard_listener() -> mpsc::Receiver<()> {
    let (tx, rx) = mpsc::channel();
    *signal_slot().lock().unwrap() = Some(tx);
    if !THREAD_SPAWNED.swap(true, Ordering::SeqCst) {
        std::thread::Builder::new()
            .name("a7-clipboard-listener".into())
            .spawn(listener_thread)
            .ok();
    }
    rx
}

fn listener_thread() {
    unsafe {
        let class_name = wide_null("A7BoxClipboardListener");
        let instance = GetModuleHandleW(None).unwrap_or_default();
        let hinstance = HINSTANCE(instance.0);
        let wc = WNDCLASSW {
            hInstance: hinstance,
            lpszClassName: PCWSTR(class_name.as_ptr()),
            lpfnWndProc: Some(wnd_proc),
            ..Default::default()
        };
        RegisterClassW(&wc);

        let Ok(hwnd) = CreateWindowExW(
            Default::default(),
            PCWSTR(class_name.as_ptr()),
            PCWSTR::null(),
            Default::default(),
            0,
            0,
            0,
            0,
            HWND_MESSAGE,
            None,
            hinstance,
            None,
        ) else {
            eprintln!("[ClipboardManager] failed to create listener window");
            return;
        };

        if AddClipboardFormatListener(hwnd).is_err() {
            eprintln!("[ClipboardManager] AddClipboardFormatListener failed; falling back to polling");
            return;
        }

        let mut msg = MSG::default();
        while GetMessageW(&mut msg, None, 0, 0).as_bool() {
            let _ = TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }
    }
}

unsafe extern "system" fn wnd_proc(
    hwnd: HWND,
    msg: u32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    if msg == WM_CLIPBOARDUPDATE {
        if let Some(tx) = signal_slot().lock().unwrap().as_ref() {
            let _ = tx.send(());
        }
        return LRESULT(0);
    }
    DefWindowProcW(hwnd, msg, wparam, lparam)
}

// Silence unused-import noise on configurations where PWSTR isn't reached.
#[allow(dead_code)]
fn _unused(_: PWSTR) {}
