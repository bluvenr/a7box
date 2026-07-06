// A7Box Color Picker Module
// Cross-platform pixel color picking at cursor position.
// Windows: Win32 GetCursorPos + screenshots crate
// macOS:   CoreGraphics CGEvent + screenshots crate
// Linux:   dlopen libX11 + XQueryPointer + screenshots crate

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
    // X11: use dlopen to load libX11 at runtime (avoids compile-time dependency on libx11-dev).
    // On Wayland sessions without XWayland, XOpenDisplay returns null and we fall back to an error.
    unsafe {
        let lib = libc::dlopen(
            b"libX11.so.6\0".as_ptr() as *const libc::c_char,
            libc::RTLD_LAZY,
        );
        if lib.is_null() {
            return Err("libX11 not found (X11 session required)".into());
        }

        type Display = std::ffi::c_void;
        type XOpenDisplayFn = unsafe extern "C" fn(*const libc::c_char) -> *mut Display;
        type XCloseDisplayFn = unsafe extern "C" fn(*mut Display) -> libc::c_int;
        type XDefaultRootWindowFn = unsafe extern "C" fn(*mut Display) -> u64;
        type XQueryPointerFn = unsafe extern "C" fn(
            *mut Display, u64, *mut u64, *mut u64,
            *mut libc::c_int, *mut libc::c_int,
            *mut libc::c_int, *mut libc::c_int, *mut libc::c_uint,
        ) -> libc::c_int;

        let x_open: XOpenDisplayFn = std::mem::transmute(
            libc::dlsym(lib, b"XOpenDisplay\0".as_ptr() as *const libc::c_char)
        );
        let x_close: XCloseDisplayFn = std::mem::transmute(
            libc::dlsym(lib, b"XCloseDisplay\0".as_ptr() as *const libc::c_char)
        );
        let x_root: XDefaultRootWindowFn = std::mem::transmute(
            libc::dlsym(lib, b"XDefaultRootWindow\0".as_ptr() as *const libc::c_char)
        );
        let x_query: XQueryPointerFn = std::mem::transmute(
            libc::dlsym(lib, b"XQueryPointer\0".as_ptr() as *const libc::c_char)
        );

        let display = x_open(std::ptr::null());
        if display.is_null() {
            libc::dlclose(lib);
            return Err("XOpenDisplay failed (no X11 display available)".into());
        }

        let root_window = x_root(display);
        let (mut root_ret, mut child_ret) = (0u64, 0u64);
        let (mut root_x, mut root_y, mut win_x, mut win_y) = (0i32, 0i32, 0i32, 0i32);
        let mut mask = 0u32;

        x_query(
            display, root_window,
            &mut root_ret, &mut child_ret,
            &mut root_x, &mut root_y,
            &mut win_x, &mut win_y,
            &mut mask,
        );

        x_close(display);
        libc::dlclose(lib);

        Ok((root_x, root_y))
    }
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
