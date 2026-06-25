// A7Box Windows Context Menu Registration
// Adds "Open HTTP Server with A7Box" to the folder right-click menu.
// Writes to HKCU (no admin required). Idempotent — safe to call repeatedly.
//
// Note: On Windows 11, the custom context menu entry appears under
// "Show more options" (the classic context menu). This is a Windows 11
// platform limitation — the new context menu requires a COM shell extension.

/// Set up the Windows Explorer right-click context menu entry.
/// Should be called once during app setup.
pub fn setup_context_menu(_app: &tauri::AppHandle) {
    #[cfg(target_os = "windows")]
    {
        let exe = match std::env::current_exe() {
            Ok(p) => p,
            Err(e) => {
                eprintln!("[A7Box Registry] Failed to get exe path: {}", e);
                return;
            }
        };
        let exe_str = exe.display().to_string();
        println!("[A7Box Registry] Exe path: {}", exe_str);

        // Detect system locale for menu label
        let is_zh = sys_locale::get_locale()
            .map(|l| l.starts_with("zh"))
            .unwrap_or(false);

        match write_registry_entries(&exe_str, is_zh) {
            Ok(()) => println!("[A7Box Registry] Context menu registered successfully (zh={})", is_zh),
            Err(e) => eprintln!("[A7Box Registry] Failed to write registry: {}", e),
        }
    }
}

#[cfg(target_os = "windows")]
fn write_registry_entries(exe_path: &str, is_zh: bool) -> Result<(), String> {
    use winreg::enums::*;
    use winreg::RegKey;

    let label = if is_zh { "用 A7Box 开启网页服务" } else { "Open Web Service with A7Box" };
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);

    // 1. Protocol handler: HKCU\Software\Classes\a7box
    let (proto_key, _) = hkcu
        .create_subkey(r"Software\Classes\a7box")
        .map_err(|e| format!("Create protocol key: {}", e))?;
    proto_key
        .set_value("", &"URL:A7Box Protocol")
        .map_err(|e| format!("Set protocol name: {}", e))?;
    proto_key
        .set_value("URL Protocol", &"")
        .map_err(|e| format!("Set URL Protocol: {}", e))?;

    // Protocol command: invokes exe with the protocol URL as arg
    let (proto_cmd, _) = hkcu
        .create_subkey(r"Software\Classes\a7box\shell\open\command")
        .map_err(|e| format!("Create protocol command: {}", e))?;
    proto_cmd
        .set_value("", &format!("\"{}\" \"%1\"", exe_path))
        .map_err(|e| format!("Set protocol command: {}", e))?;

    // 2. Folder context menu: right-click ON a folder
    let (ctx_key, _) = hkcu
        .create_subkey(r"Software\Classes\Directory\shell\A7BoxHttpServer")
        .map_err(|e| format!("Create context menu key: {}", e))?;
    ctx_key
        .set_value("", &label)
        .map_err(|e| format!("Set menu label: {}", e))?;
    ctx_key
        .set_value("Icon", &exe_path)
        .map_err(|e| format!("Set menu icon: {}", e))?;

    let (ctx_cmd, _) = hkcu
        .create_subkey(r"Software\Classes\Directory\shell\A7BoxHttpServer\command")
        .map_err(|e| format!("Create context command: {}", e))?;
    ctx_cmd
        .set_value(
            "",
            &format!("\"{}\" --http-serve \"%1\"", exe_path),
        )
        .map_err(|e| format!("Set context command: {}", e))?;

    // 3. Background context menu: right-click INSIDE a folder (empty space)
    let (bg_key, _) = hkcu
        .create_subkey(r"Software\Classes\Directory\Background\shell\A7BoxHttpServer")
        .map_err(|e| format!("Create background menu key: {}", e))?;
    bg_key
        .set_value("", &label)
        .map_err(|e| format!("Set bg menu label: {}", e))?;
    bg_key
        .set_value("Icon", &exe_path)
        .map_err(|e| format!("Set bg menu icon: {}", e))?;

    let (bg_cmd, _) = hkcu
        .create_subkey(r"Software\Classes\Directory\Background\shell\A7BoxHttpServer\command")
        .map_err(|e| format!("Create bg command: {}", e))?;
    // %V = current directory path when right-clicking in background
    bg_cmd
        .set_value(
            "",
            &format!("\"{}\" --http-serve \"%V\"", exe_path),
        )
        .map_err(|e| format!("Set bg command: {}", e))?;

    Ok(())
}
