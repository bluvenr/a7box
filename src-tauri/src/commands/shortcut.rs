// A7Box Shortcut Management Commands

use tauri::{AppHandle, Manager};

#[tauri::command]
pub fn update_shortcut(app: AppHandle, action: String, keys: String, enabled: bool) -> Result<(), String> {
    use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

    let state = app.state::<crate::state::ShortcutRegistry>();
    let mut registry = state.0.lock().map_err(|e| e.to_string())?;

    // Unregister old shortcut if exists
    if let Some(old_keys) = registry.get(&action) {
        let _ = app.global_shortcut().unregister(old_keys.as_str());
    }

    // Register new shortcut if enabled
    if enabled && !keys.is_empty() {
        let action_clone = action.clone();
        app.global_shortcut()
            .on_shortcut(keys.as_str(), move |app_ref, _shortcut, event| {
                if event.state != ShortcutState::Pressed { return; }
                crate::shortcut_handler::execute_action(&app_ref.clone(), &action_clone);
            })
            .map_err(|e| format!("Failed to register shortcut: {}", e))?;
        registry.insert(action.clone(), keys);
    } else {
        registry.remove(&action);
    }

    Ok(())
}
