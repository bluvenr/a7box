// A7Box Clipboard Manager — Auto-Paste (cross-platform)
// Writes a clip to the system clipboard, restores focus to the paste target,
// then simulates Ctrl+V / Cmd+V via `enigo`.
//
// Degradation matrix:
//   Windows       — full auto-paste
//   macOS         — full auto-paste when Accessibility permission granted,
//                   otherwise copy-only fallback
//   Linux/X11     — auto-paste via enigo (xdotool backend)
//   Linux/Wayland — copy-only fallback (compositor blocks key injection)

use serde::{Deserialize, Serialize};

/// Snapshot of the window that should receive the paste.
/// Captured at the moment the popup opens (before A7Box steals focus).
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct PasteTarget {
    /// Native window handle (Windows HWND as isize); 0 = unknown
    #[serde(default)]
    pub native_handle: i64,
    pub window_title: String,
    pub process_name: String,
}

/// Whether the current platform/session can simulate keystrokes into other apps.
/// Returns (capable, reason) — reason is an i18n key suffix for the UI.
pub fn auto_paste_capability() -> (bool, &'static str) {
    #[cfg(target_os = "linux")]
    {
        if is_wayland() {
            return (false, "wayland");
        }
        return (true, "");
    }
    #[cfg(target_os = "macos")]
    {
        if !macos_accessibility_granted() {
            return (false, "accessibility");
        }
        return (true, "");
    }
    #[cfg(target_os = "windows")]
    {
        (true, "")
    }
}

#[cfg(target_os = "linux")]
fn is_wayland() -> bool {
    if let Ok(session) = std::env::var("XDG_SESSION_TYPE") {
        if session.eq_ignore_ascii_case("wayland") {
            return true;
        }
    }
    std::env::var_os("WAYLAND_DISPLAY").is_some()
}

#[cfg(target_os = "macos")]
#[link(name = "ApplicationServices", kind = "framework")]
extern "C" {
    fn AXIsProcessTrusted() -> bool;
}

#[cfg(target_os = "macos")]
pub fn macos_accessibility_granted() -> bool {
    unsafe { AXIsProcessTrusted() }
}

/// Capture the current foreground window BEFORE the popup takes focus.
pub fn snapshot_paste_target() -> PasteTarget {
    #[cfg(target_os = "windows")]
    {
        use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowTextW};
        unsafe {
            let hwnd = GetForegroundWindow();
            let mut target = PasteTarget::default();
            if !hwnd.0.is_null() {
                target.native_handle = hwnd.0 as i64;
                let mut buf = [0u16; 512];
                let len = GetWindowTextW(hwnd, &mut buf);
                if len > 0 {
                    target.window_title = String::from_utf16_lossy(&buf[..len as usize]);
                }
                target.process_name = crate::clipboard::win_source::foreground_process_name();
            }
            target
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        PasteTarget::default()
    }
}

/// Restore focus to the paste target window.
/// After the popup closes, the OS usually hands focus back to the window below
/// it (which is the target); this call reinforces that on Windows using the
/// AttachThreadInput + SetForegroundWindow pattern.
pub fn restore_focus(target: &PasteTarget) {
    #[cfg(target_os = "windows")]
    {
        use windows::Win32::System::Threading::{AttachThreadInput, GetCurrentThreadId};
        use windows::Win32::UI::WindowsAndMessaging::{
            BringWindowToTop, GetWindowThreadProcessId, SetForegroundWindow,
        };
        use windows::Win32::Foundation::HWND;
        if target.native_handle == 0 {
            return;
        }
        unsafe {
            let hwnd = HWND(target.native_handle as *mut _);
            let fg_thread = GetWindowThreadProcessId(hwnd, None);
            let cur_thread = GetCurrentThreadId();
            let attached = fg_thread != cur_thread
                && AttachThreadInput(cur_thread, fg_thread, true).as_bool();
            let _ = SetForegroundWindow(hwnd);
            let _ = BringWindowToTop(hwnd);
            if attached {
                let _ = AttachThreadInput(cur_thread, fg_thread, false);
            }
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = target; // macOS/Linux rely on OS focus hand-back after popup closes
    }
}

/// Simulate the paste keystroke (Ctrl+V / Cmd+V) into the focused app.
pub fn send_paste_keys() -> Result<(), String> {
    use enigo::{Direction, Enigo, Key, Keyboard, Settings};
    let mut enigo = Enigo::new(&Settings::default()).map_err(|e| format!("enigo init: {:?}", e))?;

    let modifier = paste_modifier();
    enigo.key(modifier, Direction::Press).map_err(|e| format!("press modifier: {:?}", e))?;
    let _ = std::thread::sleep(std::time::Duration::from_millis(20));
    enigo.key(Key::Unicode('v'), Direction::Click).map_err(|e| format!("click v: {:?}", e))?;
    enigo.key(modifier, Direction::Release).map_err(|e| format!("release modifier: {:?}", e))?;
    Ok(())
}

fn paste_modifier() -> enigo::Key {
    #[cfg(target_os = "macos")]
    {
        enigo::Key::Meta
    }
    #[cfg(not(target_os = "macos"))]
    {
        enigo::Key::Control
    }
}
