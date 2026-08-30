// FIELD VAULT — desktop 2FA authenticator.
// Rust side stays thin: window/tray management and file IO for the vault.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
