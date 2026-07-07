// A7Box Context Menu Registration (Cross-Platform)
//
// Windows: Registry entries for folder/image right-click menus (winreg).
// macOS:   Automator Quick Actions (.workflow bundles in ~/Library/Services/).
// Linux:   Not yet implemented.
//
// Idempotent — safe to call repeatedly on every app launch.

/// Set up OS-specific file explorer right-click context menus.
/// Called once during app setup. All implementations are idempotent.
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

        let is_zh = sys_locale::get_locale()
            .map(|l| l.starts_with("zh"))
            .unwrap_or(false);

        match write_registry_entries(&exe_str, is_zh) {
            Ok(()) => println!("[A7Box Registry] HTTP server menu registered (zh={})", is_zh),
            Err(e) => eprintln!("[A7Box Registry] Failed: {}", e),
        }
        match write_image_registry_entries(&exe_str, is_zh) {
            Ok(()) => println!("[A7Box Registry] Image compress menu registered (zh={})", is_zh),
            Err(e) => eprintln!("[A7Box Registry] Failed: {}", e),
        }
        match write_image_convert_registry_entries(&exe_str, is_zh) {
            Ok(()) => println!("[A7Box Registry] Image convert menu registered (zh={})", is_zh),
            Err(e) => eprintln!("[A7Box Registry] Failed: {}", e),
        }
    }

    #[cfg(target_os = "macos")]
    {
        let exe = match std::env::current_exe() {
            Ok(p) => p,
            Err(e) => {
                eprintln!("[A7Box macOS] Failed to get exe path: {}", e);
                return;
            }
        };
        match setup_macos_quick_actions(&exe) {
            Ok(()) => println!("[A7Box macOS] Quick Actions registered successfully"),
            Err(e) => eprintln!("[A7Box macOS] Failed to register Quick Actions: {}", e),
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

// ─── macOS: Automator Quick Actions ───────────────────────────────────────────
//
// Creates .workflow bundles in ~/Library/Services/ so that Finder shows
// A7Box entries in  right-click → Quick Actions  submenu.
//
// Each workflow embeds a shell script that uses `mdfind` (Spotlight) to
// dynamically locate the A7Box.app, so the menus survive app moves/renames.

#[cfg(target_os = "macos")]
fn setup_macos_quick_actions(exe_path: &std::path::Path) -> Result<(), String> {
    let services_dir = macos_services_dir()?;
    std::fs::create_dir_all(&services_dir)
        .map_err(|e| format!("Create Services dir: {}", e))?;

    let is_zh = sys_locale::get_locale()
        .map(|l| l.starts_with("zh"))
        .unwrap_or(false);

    let workflows: [(&str, &str, &str, &str); 3] = [
        (
            "A7Box Web Server",
            if is_zh { "\u{7528} A7Box \u{5f00}\u{542f}\u{7f51}\u{9875}\u{670d}\u{52a1}" } else { "Open Web Service with A7Box" },
            "--http-serve",
            "com.apple.Automator.fileSystemObject",
        ),
        (
            "A7Box Image Compress",
            if is_zh { "\u{7528} A7Box \u{538b}\u{7f29}\u{56fe}\u{7247}" } else { "Compress Image with A7Box" },
            "--compress-image",
            "com.apple.Automator.image",
        ),
        (
            "A7Box Image Convert",
            if is_zh { "\u{7528} A7Box \u{8f6c}\u{6362}\u{56fe}\u{7247}\u{683c}\u{5f0f}" } else { "Convert Image Format with A7Box" },
            "--convert-image",
            "com.apple.Automator.image",
        ),
    ];

    for (name, label, arg, input_type) in &workflows {
        let workflow_dir = services_dir.join(format!("{}.workflow", name));
        std::fs::create_dir_all(&workflow_dir)
            .map_err(|e| format!("Create {} dir: {}", name, e))?;

        let script = build_shell_script(exe_path, arg);
        let wflow_xml = build_wflow_xml(&script, input_type);

        std::fs::write(workflow_dir.join("document.wflow"), wflow_xml.as_bytes())
            .map_err(|e| format!("Write {}.wflow: {}", name, e))?;

        println!("[A7Box macOS] Installed Quick Action: {} ({})", name, label);
    }

    Ok(())
}

#[cfg(target_os = "macos")]
fn macos_services_dir() -> Result<std::path::PathBuf, String> {
    let home = std::env::var("HOME").map_err(|_| "HOME not set".to_string())?;
    Ok(std::path::PathBuf::from(home).join("Library").join("Services"))
}

/// Build a shell script that dynamically locates A7Box.app via Spotlight.
#[cfg(target_os = "macos")]
fn build_shell_script(exe_path: &std::path::Path, arg: &str) -> String {
    let exe_str = exe_path.display().to_string();
    format!(
        "#!/bin/sh\n\
         APP=$(mdfind \"kMDItemCFBundleIdentifier == 'a7box'\" 2>/dev/null | head -1)\n\
         if [ -n \"$APP\" ] && [ -x \"$APP/Contents/MacOS/A7Box\" ]; then\n\
         \x20   BIN=\"$APP/Contents/MacOS/A7Box\"\n\
         else\n\
         \x20   BIN=\"{exe}\"\n\
         fi\n\
         if [ -x \"$BIN\" ]; then\n\
         \x20   \"$BIN\" {arg} \"$@\"\n\
         fi\n",
        exe = exe_str,
        arg = arg,
    )
}

/// Build the Automator document.wflow XML for a Quick Action.
#[cfg(target_os = "macos")]
fn build_wflow_xml(command_string: &str, input_type: &str) -> String {
    let escaped = command_string
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;");

    format!(r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>NSServices</key>
    <array>
        <dict>
            <key>NSMenuItem</key>
            <dict>
                <key>default</key>
                <string>A7Box</string>
            </dict>
            <key>NSMessage</key>
            <string>runWorkflowAsService</string>
            <key>NSRequiredContext</key>
            <dict/>
        </dict>
    </array>
    <key>AMApplicationBuild</key>
    <string>523</string>
    <key>AMApplicationVersion</key>
    <string>2.10</string>
    <key>AMDocumentVersion</key>
    <integer>2</integer>
    <key>actions</key>
    <array>
        <dict>
            <key>action</key>
            <dict>
                <key>AMAccepts</key>
                <dict>
                    <key>Container</key>
                    <string>List</string>
                    <key>Optional</key>
                    <true/>
                    <key>Types</key>
                    <array>
                        <string>{input_type}</string>
                    </array>
                </dict>
                <key>AMActionVersion</key>
                <string>2.0.3</string>
                <key>AMApplication</key>
                <array><string>Automator</string></array>
                <key>AMBundleIdentifier</key>
                <string>com.apple.RunShellScript</string>
                <key>AMCategory</key>
                <string>AMCategoryUtilities</string>
                <key>AMIconName</key>
                <string>RunShellScript</string>
                <key>AMKeywords</key>
                <array><string>Shell</string><string>Script</string></array>
                <key>AMName</key>
                <string>Run Shell Script</string>
                <key>AMParameterProperties</key>
                <dict>
                    <key>COMMAND_STRING</key><dict/>
                    <key>CheckedForUserDefaultShell</key><dict/>
                    <key>inputMethod</key><dict/>
                    <key>shell</key><dict/>
                    <key>source</key><dict/>
                </dict>
                <key>AMProvides</key>
                <dict>
                    <key>Container</key>
                    <string>List</string>
                    <key>Types</key>
                    <array><string>com.apple.cocoa.string</string></array>
                </dict>
                <key>AMRequiredResources</key>
                <array/>
                <key>ActionBundlePath</key>
                <string>/System/Library/Automator/Run Shell Script.action</string>
                <key>ActionName</key>
                <string>Run Shell Script</string>
                <key>ActionParameters</key>
                <dict>
                    <key>COMMAND_STRING</key>
                    <string>{command}</string>
                    <key>CheckedForUserDefaultShell</key>
                    <true/>
                    <key>inputMethod</key>
                    <integer>1</integer>
                    <key>shell</key>
                    <string>/bin/sh</string>
                    <key>source</key>
                    <string></string>
                </dict>
                <key>BundleIdentifier</key>
                <string>com.apple.RunShellScript</string>
                <key>CFBundleVersion</key>
                <string>2.0.3</string>
                <key>CanShowSelectedItemsWhenRun</key>
                <false/>
                <key>CanShowWhenRun</key>
                <true/>
                <key>Category</key>
                <array><string>AMCategoryUtilities</string></array>
                <key>Class Name</key>
                <string>RunShellScriptAction</string>
                <key>InputUUID</key>
                <string>9E428722-8295-4E89-8042-B8B382E77164</string>
                <key>Keywords</key>
                <array><string>Shell</string><string>Script</string></array>
                <key>OutputUUID</key>
                <string>65D1B4E1-4987-4A26-B28F-8B4B49F36CF2</string>
                <key>UUID</key>
                <string>33D9C269-DDB1-4569-B678-9F746F1B9A0C</string>
                <key>UnlocalizedApplications</key>
                <array><string>Automator</string></array>
                <key>arguments</key>
                <dict>
                    <key>0</key>
                    <dict>
                        <key>default value</key><integer>0</integer>
                        <key>name</key><string>inputMethod</string>
                        <key>required</key><string>0</string>
                        <key>type</key><string>0</string>
                        <key>uuid</key><string>0</string>
                        <key>value</key><integer>1</integer>
                    </dict>
                    <key>1</key>
                    <dict>
                        <key>default value</key><string>/bin/sh</string>
                        <key>name</key><string>shell</string>
                        <key>required</key><string>0</string>
                        <key>type</key><string>0</string>
                        <key>uuid</key><string>1</string>
                        <key>value</key><string>/bin/sh</string>
                    </dict>
                    <key>2</key>
                    <dict>
                        <key>default value</key><string></string>
                        <key>name</key><string>COMMAND_STRING</string>
                        <key>required</key><string>0</string>
                        <key>type</key><string>0</string>
                        <key>uuid</key><string>2</string>
                        <key>value</key><string>{command}</string>
                    </dict>
                    <key>3</key>
                    <dict>
                        <key>default value</key><false/>
                        <key>name</key><string>CheckedForUserDefaultShell</string>
                        <key>required</key><string>0</string>
                        <key>type</key><string>0</string>
                        <key>uuid</key><string>3</string>
                        <key>value</key><true/>
                    </dict>
                    <key>4</key>
                    <dict>
                        <key>default value</key><string></string>
                        <key>name</key><string>source</string>
                        <key>required</key><string>0</string>
                        <key>type</key><string>0</string>
                        <key>uuid</key><string>4</string>
                        <key>value</key><string></string>
                    </dict>
                </dict>
                <key>isViewVisible</key>
                <true/>
                <key>location</key>
                <string>529.000000:618.000000</string>
                <key>nibPath</key>
                <string>/System/Library/Automator/Run Shell Script.action/Contents/Resources/Base.lproj/main.nib</string>
            </dict>
            <key>isViewVisible</key>
            <true/>
        </dict>
    </array>
    <key>connectors</key>
    <dict/>
    <key>workflowMetaData</key>
    <dict>
        <key>applicationBundleIDsByPath</key>
        <dict/>
        <key>applicationPaths</key>
        <array/>
        <key>inputTypeIdentifier</key>
        <string>{input_type}</string>
        <key>outputTypeIdentifier</key>
        <string>com.apple.Automator.nothing</string>
        <key>presentationMode</key>
        <integer>15</integer>
        <key>processesInput</key>
        <integer>0</integer>
        <key>serviceInputTypeIdentifier</key>
        <string>{input_type}</string>
        <key>serviceOutputTypeIdentifier</key>
        <string>com.apple.Automator.nothing</string>
        <key>serviceProcessesInput</key>
        <integer>0</integer>
        <key>systemImageName</key>
        <string>NSActionTemplate</string>
        <key>useAutomaticInputType</key>
        <integer>0</integer>
        <key>workflowTypeIdentifier</key>
        <string>com.apple.Automator.servicesMenu</string>
    </dict>
</dict>
</plist>
"#,
        command = escaped,
        input_type = input_type,
    )
}
