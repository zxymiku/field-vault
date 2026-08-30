// FIELD VAULT — desktop 2FA authenticator.
// Rust side stays thin: window/tray management and file IO for the vault.

mod store;
mod tray;

use std::sync::atomic::Ordering;
use tauri::{Manager, WindowEvent};
use tray::TrayState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .manage(TrayState::new())
        .invoke_handler(tauri::generate_handler![
            store::read_vault,
            store::write_vault,
            store::read_settings,
            store::write_settings,
            tray::set_tray_enabled,
        ])
        .setup(|app| {
            // Honor the persisted tray preference; default is enabled.
            let enabled = store::read_settings_raw(app.handle())
                .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
                .and_then(|v| {
                    v.get("trayEnabled")
                        .and_then(|b| b.as_bool())
                })
                .unwrap_or(true);

            let state: tauri::State<TrayState> = app.state();
            state.enabled.store(enabled, Ordering::SeqCst);
            if enabled {
                let icon = tray::build_tray(app.handle())?;
                *state.icon.lock().unwrap() = Some(icon);
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            // Tray on: close hides to tray. Tray off: close really closes.
            if let WindowEvent::CloseRequested { api, .. } = event {
                let state: tauri::State<TrayState> = window.app_handle().state();
                if state.enabled.load(Ordering::SeqCst) {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
