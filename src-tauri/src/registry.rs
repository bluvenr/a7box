// A7Box Windows Context Menu Registration
// Adds "Open HTTP Server with A7Box" to the folder right-click menu.
// Adds "Compress with A7Box" to image file right-click menu.
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

        match write_image_registry_entries(&exe_str, is_zh) {
            Ok(()) => println!("[A7Box Registry] Image compress menu registered successfully (zh={})", is_zh),
            Err(e) => eprintln!("[A7Box Registry] Failed to write image registry: {}", e),
        }

        match write_image_convert_registry_entries(&exe_str, is_zh) {
            Ok(()) => println!("[A7Box Registry] Image convert menu registered successfully (zh={})", is_zh),
            Err(e) => eprintln!("[A7Box Registry] Failed to write image convert registry: {}", e),
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

#[cfg(target_os = "windows")]
fn write_image_registry_entries(exe_path: &str, is_zh: bool) -> Result<(), String> {
    use winreg::enums::*;
    use winreg::RegKey;

    let label = if is_zh { "用 A7Box 压缩图片" } else { "Compress Image with A7Box" };
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);

    // Supported image extensions
    let extensions = ["png", "jpg", "jpeg", "webp", "bmp"];

    for ext in &extensions {
        let key_path = format!(r"Software\Classes\SystemFileAssociations\.{}\shell\A7BoxCompress", ext);
        let cmd_path = format!(r"Software\Classes\SystemFileAssociations\.{}\shell\A7BoxCompress\command", ext);

        // Create menu entry
        let (ctx_key, _) = hkcu
            .create_subkey(&key_path)
            .map_err(|e| format!("Create {} menu key: {}", ext, e))?;
        ctx_key
            .set_value("", &label)
            .map_err(|e| format!("Set {} menu label: {}", ext, e))?;
        ctx_key
            .set_value("Icon", &exe_path)
            .map_err(|e| format!("Set {} menu icon: {}", ext, e))?;

        // Create command
        let (ctx_cmd, _) = hkcu
            .create_subkey(&cmd_path)
            .map_err(|e| format!("Create {} command key: {}", ext, e))?;
        ctx_cmd
            .set_value(
                "",
                &format!("\"{}\" --compress-image \"%1\"", exe_path),
            )
            .map_err(|e| format!("Set {} command: {}", ext, e))?;
    }

    Ok(())
}

#[cfg(target_os = "windows")]
fn write_image_convert_registry_entries(exe_path: &str, is_zh: bool) -> Result<(), String> {
    use winreg::enums::*;
    use winreg::RegKey;

    let label = if is_zh { "用 A7Box 转换图片格式" } else { "Convert Image Format with A7Box" };
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);

    // Supported image extensions
    let extensions = ["png", "jpg", "jpeg", "webp", "bmp"];

    for ext in &extensions {
        let key_path = format!(r"Software\Classes\SystemFileAssociations\.{}\shell\A7BoxConvert", ext);
        let cmd_path = format!(r"Software\Classes\SystemFileAssociations\.{}\shell\A7BoxConvert\command", ext);

        // Create menu entry
        let (ctx_key, _) = hkcu
            .create_subkey(&key_path)
            .map_err(|e| format!("Create {} convert key: {}", ext, e))?;
        ctx_key
            .set_value("", &label)
            .map_err(|e| format!("Set {} convert label: {}", ext, e))?;
        ctx_key
            .set_value("Icon", &exe_path)
            .map_err(|e| format!("Set {} convert icon: {}", ext, e))?;

        // Create command
        let (ctx_cmd, _) = hkcu
            .create_subkey(&cmd_path)
            .map_err(|e| format!("Create {} convert command: {}", ext, e))?;
        ctx_cmd
            .set_value(
                "",
                &format!("\"{}\" --convert-image \"%1\"", exe_path),
            )
            .map_err(|e| format!("Set {} convert command: {}", ext, e))?;
    }

    Ok(())
}
