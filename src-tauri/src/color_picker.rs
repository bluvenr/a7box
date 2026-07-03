// A7Box Color Picker Module
// Cross-platform pixel color picking at cursor position.
// Windows: Win32 GetCursorPos + screenshots crate
// macOS:   CoreGraphics CGEvent + screenshots crate
// Linux:   screenshots crate with /dev/input fallback

use screenshots::Screen;

// ── Platform: get cursor position ──

pub fn get_cursor_pos() -> Result<(i32, i32), String> {
    get_cursor_position()
}

#[cfg(target_os = "windows")]
fn get_cursor_position() -> Result<(i32, i32), String> {
    #[repr(C)]
    struct POINT {
        x: i32,
        y: i32,
    }

    #[link(name = "user32")]
    extern "system" {
        fn GetCursorPos(lpPoint: *mut POINT) -> i32;
    }

    unsafe {
        let mut pt = POINT { x: 0, y: 0 };
        if GetCursorPos(&mut pt) == 0 {
            return Err("Failed to get cursor position".into());
        }
        Ok((pt.x, pt.y))
    }
}

#[cfg(target_os = "macos")]
fn get_cursor_position() -> Result<(i32, i32), String> {
    #[repr(C)]
    struct CGPoint {
        x: f64,
        y: f64,
    }

    type CGEventRef = *mut std::ffi::c_void;

    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {
        fn CGEventCreate(source: *const std::ffi::c_void) -> CGEventRef;
        fn CGEventGetLocation(event: CGEventRef) -> CGPoint;
        fn CFRelease(cf: *const std::ffi::c_void);
    }

    unsafe {
        let event = CGEventCreate(std::ptr::null());
        if event.is_null() {
            return Err("Failed to create CGEvent".into());
        }
        let pt = CGEventGetLocation(event);
        CFRelease(event as *const _);
        Ok((pt.x as i32, pt.y as i32))
    }
}

#[cfg(target_os = "linux")]
fn get_cursor_position() -> Result<(i32, i32), String> {
    // X11: use Xlib QueryPointer
    // For now, return an error — will be implemented when X11 support is needed
    Err("Cursor position detection not yet supported on Linux".into())
}

// ── Capture pixel color at given position using screenshots crate ──

pub fn capture_pixel_color(x: i32, y: i32) -> Result<String, String> {
    let screens = Screen::all().map_err(|e| format!("Failed to get screens: {}", e))?;
    if screens.is_empty() {
        return Err("No screens found".into());
    }

    // Find which screen contains the cursor position
    let screen = screens
        .iter()
        .find(|s| {
            let di = &s.display_info;
            x >= di.x
                && x < di.x + di.width as i32
                && y >= di.y
                && y < di.y + di.height as i32
        })
        .unwrap_or(&screens[0]);

    // Capture 1×1 pixel area at cursor position (coordinates relative to screen origin)
    let rel_x = x - screen.display_info.x;
    let rel_y = y - screen.display_info.y;
    let img = screen
        .capture_area(rel_x, rel_y, 1, 1)
        .map_err(|e| format!("Failed to capture pixel: {}", e))?;

    let pixel = img.get_pixel(0, 0);
    Ok(format!("#{:02x}{:02x}{:02x}", pixel[0], pixel[1], pixel[2]))
}
