// File-backed persistence for the vault and app settings.
// The frontend owns all serialization and cryptography; Rust only
// reads/writes two JSON files inside app_data_dir, via temp-file rename.

use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

const VAULT_FILE: &str = "vault.json";
const SETTINGS_FILE: &str = "settings.json";

fn data_file(app: &AppHandle, name: &str) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join(name))
}

fn read_file(app: &AppHandle, name: &str) -> Result<Option<String>, String> {
    match fs::read_to_string(data_file(app, name)?) {
        Ok(s) => Ok(Some(s)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

fn write_file(app: &AppHandle, name: &str, contents: String) -> Result<(), String> {
    let path = data_file(app, name)?;
    let tmp = path.with_extension("tmp");
    fs::write(&tmp, contents).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn read_vault(app: AppHandle) -> Result<Option<String>, String> {
    read_file(&app, VAULT_FILE)
}

#[tauri::command]
pub fn write_vault(app: AppHandle, contents: String) -> Result<(), String> {
    write_file(&app, VAULT_FILE, contents)
}

#[tauri::command]
pub fn delete_vault(app: AppHandle) -> Result<(), String> {
    let path = data_file(&app, VAULT_FILE)?;
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn read_settings(app: AppHandle) -> Result<Option<String>, String> {
    read_file(&app, SETTINGS_FILE)
}

#[tauri::command]
pub fn write_settings(app: AppHandle, contents: String) -> Result<(), String> {
    write_file(&app, SETTINGS_FILE, contents)
}

// Non-command helper used by tray setup to learn the persisted default.
pub fn read_settings_raw(app: &AppHandle) -> Option<String> {
    read_file(app, SETTINGS_FILE).ok().flatten()
}
